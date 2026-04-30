import fs from 'node:fs/promises';
import { type Dirent, type PathLike } from 'node:fs';
import os from 'node:os';
import { join, sep } from 'node:path';
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
import { getLevenshteinDistance } from './lib/getLevenshteinDistance';
import {
  AppSettings,
  AlbumMetadata,
  type Track,
  type Album,
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
const BIMM_METADATA_FILENAME = 'bimm.json';
const SPACES = 2;

const isNodeError = (item: unknown): item is NodeJS.ErrnoException => {
  return item != null && typeof item === 'object' && Object.hasOwn(item, 'code') && Object.hasOwn(item, 'errno');
};

const isFulfilled = <T>(response: PromiseSettledResult<T>): response is PromiseFulfilledResult<T> => {
  return response.status === 'fulfilled';
};

const messageFrom = (err: unknown) => (isNodeError(err) ? `${err.message}\n${err.stack}` : String(err));

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

const getAlbumMetadataPath = (albumPath: string) => join(albumPath, BIMM_METADATA_FILENAME);

const parseAlbumMetadata = (contents: string, metadataPath: string) => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(contents);
  } catch (parseError) {
    log.error(`Unable to parse ${metadataPath}: ${messageFrom(parseError)}`);
    return {};
  }

  const validation = AlbumMetadata.safeParse(parsed);

  if (!validation.success) {
    log.error(`Invalid ${metadataPath}: ${validation.error.message}`);
    return {};
  }

  return validation.data;
};

const readAlbumMetadata = async (albumPath: string) => {
  const metadataPath = getAlbumMetadataPath(albumPath);

  try {
    const contents = await fs.readFile(metadataPath, { encoding: 'utf-8' });
    return parseAlbumMetadata(contents, metadataPath);
  } catch (readError) {
    if (isNodeError(readError) && readError.code === 'ENOENT') {
      return {};
    }

    log.error(`Unable to read ${metadataPath}: ${messageFrom(readError)}`);
    return {};
  }
};

const writeAlbumMetadata = async (albumPath: string, metadata: AlbumMetadata) => {
  const metadataPath = getAlbumMetadataPath(albumPath);
  const validation = AlbumMetadata.safeParse(metadata);

  if (!validation.success) {
    throw new Error(`Metadata didn't parse before writing to ${metadataPath}: ${validation.error.message}`);
  }

  const directoryStats = await fs.stat(albumPath);

  await fs.writeFile(metadataPath, JSON.stringify(validation.data, null, SPACES));
  await fs.utimes(albumPath, directoryStats.atime, directoryStats.mtime);
};

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

    const [tracks, metadata] = await Promise.all([readTracks(fullpath), readAlbumMetadata(fullpath)]);

    return { filename: dirent.name, fullpath, mtime, tracks, title: tracks[0]?.albumTitle, ...metadata };
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
  try {
    const genres = await downloadChosicGenres(album);
    const metadata = await readAlbumMetadata(album.fullpath);

    await writeAlbumMetadata(album.fullpath, {
      ...metadata,
      spotifyGenres: genres
    });

    log.log(`[chosic] fetched genres (${albumLabel})`, {
      album: album.filename,
      genres
    });
    return genres;
  } catch (error) {
    log.error(`[chosic] fetch failed (${albumLabel})`, {
      album: album.filename,
      error: messageFrom(error)
    });
  }
  return [];
};
