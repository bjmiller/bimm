import fs from 'node:fs/promises';
import { type Dirent, type PathLike } from 'node:fs';
import os from 'node:os';
import { sep } from 'node:path';
import log from 'electron-log/main';
import { type IAudioMetadata, parseFile } from 'music-metadata';
import pLimit from 'p-limit';
import { app } from 'electron';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
dayjs.extend(duration);
import { type BrowserContext, type Page, type Response as PlaywrightResponse } from 'playwright';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import {
  AppSettings,
  type Track,
  type Album,
  type ChosicGenreLookupInput,
  ChosicTrackSearch,
  ChosicTrack,
  ChosicArtistSearch
} from '../types';

chromium.use(StealthPlugin());

log.transports.file.level = false;

const APP_PATH = `${os.homedir()}${sep}.bimm`;
const CONFIG_PATH = `${APP_PATH}${sep}.bimmrc.json`;
const CHOSIC_BROWSER_PROFILE_PATH = `${APP_PATH}${sep}chosic-playwright`;
const CHOSIC_GENRE_FINDER_URL = 'https://www.chosic.com/music-genre-finder/';
const CHOSIC_SEARCH_QUERY = 'https://www.chosic.com/api/tools/search';
const CHOSIC_TRACKS_URL = 'https://www.chosic.com/api/tools/tracks';
const CHOSIC_ARTISTS_URL = 'https://www.chosic.com/api/tools/artists';
const SPACES = 2;

const isNodeError = (item: unknown): item is NodeJS.ErrnoException => {
  return item != null && typeof item === 'object' && Object.hasOwn(item, 'code') && Object.hasOwn(item, 'errno');
};

const isFulfilled = <T>(response: PromiseSettledResult<T>): response is PromiseFulfilledResult<T> => {
  return response.status === 'fulfilled';
};

const messageFrom = (err: unknown) => (isNodeError(err) ? `${err.message}\n${err.stack}` : String(err));

const PathNameFile = {
  toFileName: (pathname: string) => `${encodeURIComponent(pathname)}.json`,
  fromFileName: (pathnamefilename: string) => decodeURIComponent(pathnamefilename.replace(/\.json$/, ''))
};
Object.freeze(PathNameFile);

export const ensureDirectory = async () => {
  try {
    const stats = await fs.stat(APP_PATH);
    if (!stats.isDirectory()) {
      log.error('File at config directory location!', stats);
      return false;
    } else {
      return true;
    }
  } catch (dirStatError) {
    if (isNodeError(dirStatError) && dirStatError.code === 'ENOENT') {
      log.log('Directory does not exist, creating a new one');
      try {
        await fs.mkdir(APP_PATH);
        return true;
      } catch (dirCreationError) {
        log.error(`Failed to create dir: ${messageFrom(dirCreationError)}`);
        return false;
      }
    } else {
      log.error(`Failed to stat app path: ${messageFrom(dirStatError)}`);
      return false;
    }
  }
};

export const readOrCreateSettings = async () => {
  // Check for existence
  try {
    await fs.stat(CONFIG_PATH);
  } catch (statError) {
    if (isNodeError(statError) && statError.code === 'ENOENT') {
      log.log(`Config file not present, creating a new one`);
      try {
        await fs.writeFile(CONFIG_PATH, JSON.stringify({ directories: [app.getPath('music')] }, null, SPACES));
      } catch (writeError) {
        log.error(`Failed to write initial config file: ${messageFrom(writeError)}`);
        return null;
      }
    } else {
      log.error(`Failed to stat config file: ${messageFrom(statError)}`);
      return null;
    }
  }
  try {
    const appSettings = await fs.readFile(CONFIG_PATH, { encoding: 'utf-8' });
    return AppSettings.parse({ ...JSON.parse(appSettings), home: os.homedir() });
  } catch (readFileError) {
    log.error(`Unable to read and parse config file: ${messageFrom(readFileError)}`);
    return null;
  }
};

export const writeSettings = async (settings: AppSettings) => {
  try {
    await fs.writeFile(
      CONFIG_PATH,
      JSON.stringify(settings, (k, v) => (k === 'home' ? undefined : (v as unknown)), SPACES)
    );
  } catch (writeError) {
    log.error(`Unable to write settings! ${messageFrom(writeError)}`);
  }
  return readOrCreateSettings();
};

// We're trusting that the file extension is enough to tell if a file is an audio track.
const isAudio = (filename: string) => {
  const extensions = ['.mp3', '.m4a', '.flac', '.ogg'];
  for (const ext of extensions) {
    if (filename.endsWith(ext)) return true;
  }
  return false;
};

const fullPathOf = (dirent: Dirent) => `${dirent.parentPath}${sep}${dirent.name}`;

const readTracks = async (dir: string) => {
  // let tracks: Track[];
  let audioDirents: Dirent[];
  // Get the names of the audio files
  try {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    audioDirents = dirents.filter((dirent) => dirent.isFile() && isAudio(dirent.name));
  } catch (listAudioFilesError) {
    log.error(`Unable to list audio files in ${dir}: ${messageFrom(listAudioFilesError)}`);
    return [];
  }

  // Get the metadata for each file
  const parses = audioDirents.map(async (dirent) => {
    const fullPath = fullPathOf(dirent);
    let metadata: IAudioMetadata;
    let track: Track = {
      filename: dirent.name,
      fullPath: fullPathOf(dirent)
    };
    try {
      metadata = await parseFile(fullPath, { duration: true, skipCovers: true });
      track = {
        ...track,
        title: metadata.common.title,
        duration: metadata.format.duration,
        disk: metadata.common.disk.no,
        track: metadata.common.track.no,
        year: metadata.common.year,
        includedGenre: metadata.common.genre,
        artist: metadata.common.artist ?? metadata.common.albumartist,
        albumTitle: metadata.common.album
      };
    } catch (parseError) {
      log.error(`Unable to parse for metadata: ${dirent.name}: ${messageFrom(parseError)}`);
    }
    return track;
  });

  const settledParses = await Promise.allSettled(parses);
  const tracks = settledParses.filter(isFulfilled).map((item) => item.value);

  return tracks;
};

export const readAlbumDirectories = async (root?: PathLike): Promise<Album[]> => {
  const start = performance.now();
  if (root == null || root === '') return [];
  const dirents = await fs.readdir(root, { withFileTypes: true });

  const NUMBER_OF_CONCURRENT_ALBUM_SCANS = 20;
  const limit = pLimit(NUMBER_OF_CONCURRENT_ALBUM_SCANS);

  const albumIteratee = async (dirent: Dirent): Promise<Album> => {
    const fullpath = fullPathOf(dirent);
    let mtime: Date | undefined;
    try {
      const stat = await fs.stat(fullpath);
      mtime = stat.mtime;
    } catch (statError) {
      log.error(`Fail to stat ${dirent.name}: ${messageFrom(statError)}`);
    }

    const tracks = await readTracks(fullpath);

    return { filename: dirent.name, fullpath, mtime, tracks, title: tracks[0]?.albumTitle };
  };

  const albumItems = dirents.filter((dirent) => dirent.isDirectory()).map((dirent) => limit(albumIteratee, dirent));
  const settledAlbumItems = await Promise.allSettled(albumItems);
  const albumValues = settledAlbumItems.filter(isFulfilled).map((item) => item.value);
  const end = performance.now();
  const loadTime = dayjs.duration(end - start);
  log.info(`Album scan time: ${loadTime.asSeconds()}`);
  return albumValues;
};

type ChosicFailureKind = 'blocked' | 'captcha' | 'token';

const HTTP_STATUS_UNAUTHORIZED = 401;
const CHOSIC_NETWORK_IDLE_TIMEOUT_MS = 5000;
const CHOSIC_RESPONSE_TIMEOUT_MS = 15000;

const isChosicUrl = (value: string) => /https?:\/\/([^/]+\.)?chosic\.com/i.test(value);

const isChosicBlockedText = (value: string) => {
  return /(please enable cookies|sorry, you have been blocked|unable to access chosic\.com|access denied|request blocked)/i.test(
    value
  );
};

const isChosicMissingTokenText = (value: string) => /missing token/i.test(value.trim());

const isChosicCaptchaText = (value: string) => {
  return /(captcha|verify you are human|checking your browser|attention required|cloudflare|security check|just a moment)/i.test(
    value
  );
};

const isChosicCaptchaUrl = (value: string) => {
  return /(captcha|challenge-platform|cdn-cgi)/i.test(value);
};

const getChosicFailureKind = (url: string, body: string, responseStatus?: number): ChosicFailureKind | undefined => {
  if (responseStatus === HTTP_STATUS_UNAUTHORIZED && isChosicMissingTokenText(body)) {
    return 'token';
  }

  if (isChosicCaptchaUrl(url) || isChosicCaptchaText(body)) {
    return 'captcha';
  }

  if (isChosicBlockedText(body)) {
    return 'blocked';
  }

  return undefined;
};

const getChosicFailureMessage = (kind: ChosicFailureKind, target: string) => {
  switch (kind) {
    case 'blocked':
      return `Chosic returned a Cloudflare block page while requesting ${target}.`;
    case 'captcha':
      return `Chosic returned a captcha challenge while requesting ${target}.`;
    case 'token':
      return `Chosic returned Missing token while requesting ${target}.`;
    default:
      return `Chosic request failed for ${target}.`;
  }
};

const readChosicPageText = async (page: Page) => {
  return (
    (await page
      .locator('body')
      .textContent()
      .catch(() => '')) ?? ''
  );
};

const launchChosicContext = async (): Promise<BrowserContext> => {
  await fs.mkdir(CHOSIC_BROWSER_PROFILE_PATH, { recursive: true });

  return chromium.launchPersistentContext(CHOSIC_BROWSER_PROFILE_PATH, {
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
};

const getChosicPage = (context: BrowserContext) => {
  return context.pages()[0] ?? context.newPage();
};

const openGenreFinder = async (page: Page) => {
  await page.goto(CHOSIC_GENRE_FINDER_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: CHOSIC_NETWORK_IDLE_TIMEOUT_MS }).catch(() => undefined);

  const failureKind = getChosicFailureKind(page.url(), await readChosicPageText(page));
  if (failureKind != null) {
    throw new Error(getChosicFailureMessage(failureKind, CHOSIC_GENRE_FINDER_URL));
  }
};

const waitForChosicJson = async <T>(
  page: Page,
  matcher: (response: PlaywrightResponse) => boolean,
  schema: { parse: (value: unknown) => T },
  requestUrl: string
) => {
  const response = await page.waitForResponse(
    (candidate) => {
      return isChosicUrl(candidate.url()) && matcher(candidate);
    },
    { timeout: CHOSIC_RESPONSE_TIMEOUT_MS }
  );
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
};

const searchChosicTracksWithPage = async (page: Page, query: string) => {
  const input = page.locator('#search-word');
  await input.waitFor({ state: 'visible', timeout: CHOSIC_RESPONSE_TIMEOUT_MS });
  await page.selectOption('#suggestion-options', 'song').catch(() => undefined);
  await input.fill('');

  const [trackSearch] = await Promise.all([
    waitForChosicJson(
      page,
      (response) => response.url().startsWith(CHOSIC_SEARCH_QUERY) && response.url().includes('type=track'),
      ChosicTrackSearch,
      CHOSIC_SEARCH_QUERY
    ),
    input.fill(query)
  ]);

  return trackSearch;
};

const withChosicPage = async <T>(work: (page: Page) => Promise<T>) => {
  const headlessContext = await launchChosicContext();

  try {
    const page = await getChosicPage(headlessContext);
    await openGenreFinder(page);
    return await work(page);
  } finally {
    await headlessContext.close().catch(() => undefined);
  }
};

const fetchGenresWithPage = async (page: Page, album: ChosicGenreLookupInput) => {
  const trackTitle = album.tracks?.[0]?.title?.trim();
  const trackArtist = album.tracks?.[0]?.artist?.trim();

  if (trackTitle == null || trackTitle === '') {
    return [];
  }

  const trackSearchQuery = trackArtist != null && trackArtist !== '' ? `${trackTitle} - ${trackArtist}` : trackTitle;

  const trackSearch = await searchChosicTracksWithPage(page, trackSearchQuery);

  const matchingTrack =
    trackSearch.tracks.items.find((track) => track.artist.toLowerCase() === trackArtist?.toLowerCase()) ??
    trackSearch.tracks.items[0];

  if (matchingTrack == null) {
    return [];
  }

  const suggestion = page.locator(`#form-suggestions .span-class[data-song-id="${matchingTrack.id}"]`).first();
  await suggestion.waitFor({ state: 'visible', timeout: CHOSIC_RESPONSE_TIMEOUT_MS });

  const trackDetailsPromise = waitForChosicJson(
    page,
    (response) => response.url() === `${CHOSIC_TRACKS_URL}/${matchingTrack.id}`,
    ChosicTrack,
    `${CHOSIC_TRACKS_URL}/${matchingTrack.id}`
  );
  const artistSearchPromise = waitForChosicJson(
    page,
    (response) => response.url().startsWith(`${CHOSIC_ARTISTS_URL}?ids=`),
    ChosicArtistSearch,
    CHOSIC_ARTISTS_URL
  );

  const [trackDetails, artistSearch] = await Promise.all([
    trackDetailsPromise,
    artistSearchPromise,
    suggestion.click()
  ]);

  const artistId = trackDetails.artists[0]?.id;
  if (artistId == null || artistId === '') {
    return artistSearch.artists[0]?.genres ?? [];
  }

  const matchingArtist = artistSearch.artists.find((artist) => artist.id === artistId) ?? artistSearch.artists[0];
  return matchingArtist?.genres ?? [];
};

export const fetchChosicGenres = async (album: ChosicGenreLookupInput): Promise<string[]> => {
  try {
    const genres = (await withChosicPage((page) => fetchGenresWithPage(page, album))) ?? [];
    // eslint-disable-next-line no-console
    console.log('[chosic]', {
      album: album.filename,
      genres
    });
    return genres;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[chosic] fetch failed', {
      album: album.filename,
      error: messageFrom(error)
    });
  }
  return [];
};
