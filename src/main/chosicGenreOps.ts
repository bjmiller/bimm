import fs from 'node:fs/promises';
import { sep } from 'node:path';
import os from 'node:os';
import log from 'electron-log/main';
import { type BrowserContext, type Page, type Response as PlaywrightResponse } from 'playwright';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getLevenshteinDistance } from './lib/getLevenshteinDistance';
import { type Album, ChosicTrackSearch, ChosicTrack, ChosicArtistSearch } from '../types';
import { readAlbumMetadata, writeAlbumMetadata } from './backendOps';

chromium.use(StealthPlugin());

const APP_PATH = `${os.homedir()}${sep}.bimm`;
const CHOSIC_BROWSER_PROFILE_PATH = `${APP_PATH}${sep}chosic-playwright`;
const CHOSIC_GENRE_FINDER_URL = 'https://www.chosic.com/music-genre-finder/';
const CHOSIC_SEARCH_QUERY = 'https://www.chosic.com/api/tools/search';
const CHOSIC_TRACKS_URL = 'https://www.chosic.com/api/tools/tracks';
const CHOSIC_ARTISTS_URL = 'https://www.chosic.com/api/tools/artists';

const CHOSIC_TIMEOUT_ERROR_NAME = 'TimeoutError';
const CHOSIC_UNEXPECTED_RESPONSE_PREFIX = 'Unexpected Chosic response';

const shouldPersistEmptySpotifyGenres = (error: unknown) => {
  return (
    error instanceof Error &&
    (error.name === CHOSIC_TIMEOUT_ERROR_NAME || error.message.startsWith(CHOSIC_UNEXPECTED_RESPONSE_PREFIX))
  );
};

const writeSpotifyGenres = async (albumPath: string, spotifyGenres: string[]) => {
  const metadata = await readAlbumMetadata(albumPath);

  await writeAlbumMetadata(albumPath, {
    ...metadata,
    spotifyGenres
  });
};

type ChosicFailureKind = 'blocked' | 'captcha' | 'token';

const HTTP_STATUS_UNAUTHORIZED = 401;
const CHOSIC_RESPONSE_TIMEOUT_MS = 15000;
const CHOSIC_MATCH_DISTANCE_THRESHOLD = 8;
const MILLISECONDS_PER_SECOND = 1000;
const CHOSIC_REQUEST_DURATION_DECIMALS = 3;
const CHOSIC_BLOCKED_REGEX =
  /(please enable cookies|sorry, you have been blocked|unable to access chosic\.com|access denied|request blocked)/i;
const CHOSIC_MISSING_TOKEN_REGEX = /missing token/i;
const CHOSIC_CAPTCHA_REGEX =
  /(captcha|verify you are human|checking your browser|attention required|cloudflare|security check|just a moment)/i;
const CHOSIC_CAPTCHA_URL_REGEX = /(captcha|challenge-platform|cdn-cgi)/i;
const CHOSIC_FAILURE_MESSAGES: Record<ChosicFailureKind, string> = {
  blocked: 'Chosic returned a Cloudflare block page while requesting',
  captcha: 'Chosic returned a captcha challenge while requesting',
  token: 'Chosic returned Missing token while requesting'
};

const getChosicFailureKind = (url: string, body: string, responseStatus?: number): ChosicFailureKind | undefined => {
  if (responseStatus === HTTP_STATUS_UNAUTHORIZED && CHOSIC_MISSING_TOKEN_REGEX.test(body.trim())) {
    return 'token';
  }

  if (CHOSIC_CAPTCHA_URL_REGEX.test(url) || CHOSIC_CAPTCHA_REGEX.test(body)) {
    return 'captcha';
  }

  if (CHOSIC_BLOCKED_REGEX.test(body)) {
    return 'blocked';
  }

  return undefined;
};

const getChosicFailureMessage = (kind: ChosicFailureKind, target: string) => {
  return `${CHOSIC_FAILURE_MESSAGES[kind]} ${target}.`;
};

const formatElapsedSeconds = (start: number) => {
  return ((performance.now() - start) / MILLISECONDS_PER_SECOND).toFixed(CHOSIC_REQUEST_DURATION_DECIMALS);
};

const normalizeChosicMatchText = (value?: string) => value?.trim().replace(/\s+/g, ' ').toLowerCase() ?? '';

const chooseMatchingTrack = (trackSearch: ChosicTrackSearch, submittedTitle?: string, submittedArtist?: string) => {
  const expectedTitle = normalizeChosicMatchText(submittedTitle);
  const expectedArtist = normalizeChosicMatchText(submittedArtist);

  if (expectedTitle === '' || expectedArtist === '') {
    return undefined;
  }

  for (const track of trackSearch.tracks.items) {
    if (
      normalizeChosicMatchText(track.name) === expectedTitle &&
      normalizeChosicMatchText(track.artist) === expectedArtist
    ) {
      return track;
    }
  }

  for (const track of trackSearch.tracks.items) {
    if (
      getLevenshteinDistance(normalizeChosicMatchText(track.name), expectedTitle) < CHOSIC_MATCH_DISTANCE_THRESHOLD &&
      getLevenshteinDistance(normalizeChosicMatchText(track.artist), expectedArtist) < CHOSIC_MATCH_DISTANCE_THRESHOLD
    ) {
      return track;
    }
  }

  return undefined;
};

let chosicContextPromise: Promise<BrowserContext> | undefined;

const launchChosicContext = async (): Promise<BrowserContext> => {
  await fs.mkdir(CHOSIC_BROWSER_PROFILE_PATH, { recursive: true });

  const context = await chromium.launchPersistentContext(CHOSIC_BROWSER_PROFILE_PATH, {
    channel: 'chromium',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9'
    },
    headless: true,
    javaScriptEnabled: true,
    locale: 'en-US',
    serviceWorkers: 'allow',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 900 }
  });

  context.once('close', () => {
    chosicContextPromise = undefined;
  });

  return context;
};

const getChosicContext = () => {
  chosicContextPromise ??= launchChosicContext().catch((error) => {
    chosicContextPromise = undefined;
    throw error;
  });

  return chosicContextPromise;
};

const waitForChosicJson = async <T>(
  page: Page,
  matcher: (response: PlaywrightResponse) => boolean,
  schema: { parse: (value: unknown) => T },
  requestUrl: string,
  albumLabel: string
) => {
  const start = performance.now();
  log.info(`[chosic] starting request ${requestUrl} (${albumLabel})`);
  let resolvedUrl = requestUrl;

  try {
    const response = await page.waitForResponse(
      (candidate) => {
        return /https?:\/\/([^/]+\.)?chosic\.com/i.test(candidate.url()) && matcher(candidate);
      },
      { timeout: CHOSIC_RESPONSE_TIMEOUT_MS }
    );
    resolvedUrl = response.url();
    const body = await response.text();
    const failureKind = getChosicFailureKind(response.url(), body, response.status());

    if (failureKind != null) {
      throw new Error(getChosicFailureMessage(failureKind, requestUrl));
    }

    try {
      return schema.parse(JSON.parse(body));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Unexpected Chosic response (${response.status()}) from ${response.url()}`, { cause: error });
      }

      throw error;
    }
  } finally {
    log.info(`[chosic] ${resolvedUrl} took ${formatElapsedSeconds(start)}s (${albumLabel})`);
  }
};

const messageFrom = (err: unknown) => (err instanceof Error ? `${err.message}\n${err.stack}` : String(err));

const downloadChosicGenres = async (album: Album) => {
  const start = performance.now();
  const albumLabel = album.filename;
  let page: Page | undefined;
  log.info(`[chosic] starting genre download (${albumLabel})`);

  const trackTitle = album.tracks?.[0]?.title?.trim();
  const trackArtist = album.tracks?.[0]?.artist?.trim();

  try {
    if (trackTitle == null || trackTitle === '') {
      return [];
    }

    const trackSearchQuery = trackArtist != null && trackArtist !== '' ? `${trackTitle} - ${trackArtist}` : trackTitle;
    const context = await getChosicContext();
    page = await context.newPage();
    await page.goto(CHOSIC_GENRE_FINDER_URL, { waitUntil: 'domcontentloaded' });

    const failureKind = getChosicFailureKind(
      page.url(),
      (await page
        .locator('body')
        .textContent()
        .catch(() => '')) ?? ''
    );
    if (failureKind != null) {
      throw new Error(getChosicFailureMessage(failureKind, CHOSIC_GENRE_FINDER_URL));
    }

    const input = page.locator('#search-word');
    await input.waitFor({ state: 'visible', timeout: CHOSIC_RESPONSE_TIMEOUT_MS });
    await page.selectOption('#suggestion-options', 'song').catch(() => undefined);
    await input.fill('');

    const [trackSearch] = await Promise.all([
      waitForChosicJson(
        page,
        (response) => response.url().startsWith(CHOSIC_SEARCH_QUERY) && response.url().includes('type=track'),
        ChosicTrackSearch,
        CHOSIC_SEARCH_QUERY,
        albumLabel
      ),
      input.fill(trackSearchQuery)
    ]);
    const matchingTrack = chooseMatchingTrack(trackSearch, trackTitle, trackArtist);

    if (matchingTrack == null) {
      return [];
    }

    const suggestion = page.locator(`#form-suggestions .span-class[data-song-id="${matchingTrack.id}"]`).first();
    await suggestion.waitFor({ state: 'visible', timeout: CHOSIC_RESPONSE_TIMEOUT_MS });

    const [trackDetails, artistSearch] = await Promise.all([
      waitForChosicJson(
        page,
        (response) => response.url() === `${CHOSIC_TRACKS_URL}/${matchingTrack.id}`,
        ChosicTrack,
        `${CHOSIC_TRACKS_URL}/${matchingTrack.id}`,
        albumLabel
      ),
      waitForChosicJson(
        page,
        (response) => response.url().startsWith(`${CHOSIC_ARTISTS_URL}?ids=`),
        ChosicArtistSearch,
        CHOSIC_ARTISTS_URL,
        albumLabel
      ),
      suggestion.click()
    ]);
    const artistId = trackDetails.artists[0]?.id;

    return (artistSearch.artists.find((artist) => artist.id === artistId) ?? artistSearch.artists[0])?.genres ?? [];
  } finally {
    await page?.close().catch(() => undefined);
    log.info(`[chosic] genre download took ${formatElapsedSeconds(start)}s (${albumLabel})`);
  }
};

export const fetchChosicGenres = async (album: Album): Promise<string[]> => {
  const albumLabel = album.filename;
  log.log(`[chosic] fetching genres (${albumLabel})`);
  let genres: string[] = [];
  let persistedEmptyGenres = false;

  try {
    genres = await downloadChosicGenres(album);
  } catch (error) {
    if (!shouldPersistEmptySpotifyGenres(error)) {
      log.error(`[chosic] fetch failed (${albumLabel})`, {
        album: album.filename,
        error: messageFrom(error)
      });
      return [];
    }

    persistedEmptyGenres = true;
    log.warn(`[chosic] no genre data returned; writing empty genres (${albumLabel})`, {
      album: album.filename,
      error: messageFrom(error)
    });
  }

  try {
    await writeSpotifyGenres(album.fullpath, genres);
  } catch (error) {
    log.error(`[chosic] failed to persist genres (${albumLabel})`, {
      album: album.filename,
      error: messageFrom(error),
      genres
    });
    return [];
  }

  log.log(
    persistedEmptyGenres ? `[chosic] stored empty genres (${albumLabel})` : `[chosic] fetched genres (${albumLabel})`,
    {
      album: album.filename,
      genres
    }
  );
  return genres;
};

export const fetchMissingChosicGenres = async (albums: Album[]) => {
  let skipped = 0;
  let processed = 0;

  log.log('[chosic] starting visible album batch fetch', { total: albums.length });

  await albums.reduce(async (previous, album) => {
    await previous;

    const metadata = await readAlbumMetadata(album.fullpath);

    if (Object.hasOwn(metadata, 'spotifyGenres')) {
      skipped += 1;
      return;
    }

    processed += 1;
    await fetchChosicGenres(album);
  }, Promise.resolve());

  log.log('[chosic] completed visible album batch fetch', {
    total: albums.length,
    skipped,
    processed
  });

  return { skipped, processed };
};
