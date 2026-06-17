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
import { AppSettings, AlbumMetadata, type Track, type Album, type InboxEntry } from '../types';

log.transports.file.level = false;

const APP_PATH = `${os.homedir()}${sep}.bimm`;
const CONFIG_PATH = `${APP_PATH}${sep}.bimmrc.json`;
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

export const COMPRESSED_FILE_EXTENSIONS = ['.zip', '.rar', '.tar'];

const isCompressed = (filename: string) => {
  const lower = filename.toLowerCase();
  return COMPRESSED_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
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

export const readAlbumMetadata = async (albumPath: string) => {
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

export const writeAlbumMetadata = async (albumPath: string, metadata: AlbumMetadata) => {
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

const directoryHasAudio = async (dir: string) => {
  try {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    return dirents.some((dirent) => dirent.isFile() && isAudio(dirent.name));
  } catch (listError) {
    log.error(`Unable to list files in ${dir}: ${messageFrom(listError)}`);
    return false;
  }
};

const compressedFileIteratee = async (dirent: Dirent): Promise<InboxEntry> => {
  const fullpath = fullPathOf(dirent);
  let mtime: Date | undefined;
  try {
    const stat = await fs.stat(fullpath);
    mtime = stat.mtime;
  } catch (statError) {
    log.error(`Fail to stat ${dirent.name}: ${messageFrom(statError)}`);
  }

  return {
    kind: 'compressed',
    filename: dirent.name,
    fullpath,
    mtime
  };
};

const albumInboxIteratee = async (dirent: Dirent): Promise<InboxEntry> => {
  const fullpath = fullPathOf(dirent);
  let mtime: Date | undefined;
  try {
    const stat = await fs.stat(fullpath);
    mtime = stat.mtime;
  } catch (statError) {
    log.error(`Fail to stat ${dirent.name}: ${messageFrom(statError)}`);
  }

  const [tracks, metadata] = await Promise.all([readTracks(fullpath), readAlbumMetadata(fullpath)]);

  return {
    kind: 'album',
    filename: dirent.name,
    fullpath,
    mtime,
    tracks,
    title: tracks[0]?.albumTitle,
    ...metadata
  };
};

export const readInboxDirectory = async (root?: PathLike): Promise<InboxEntry[]> => {
  const start = performance.now();
  if (root == null || root === '') return [];
  const dirents = await fs.readdir(root, { withFileTypes: true });

  const NUMBER_OF_CONCURRENT_INBOX_SCANS = 20;
  const limit = pLimit(NUMBER_OF_CONCURRENT_INBOX_SCANS);

  const directoryIteratee = async (dirent: Dirent): Promise<InboxEntry | null> => {
    const hasAudio = await directoryHasAudio(fullPathOf(dirent));
    if (!hasAudio) {
      return null;
    }
    return limit(() => albumInboxIteratee(dirent));
  };

  const directoryItems = dirents
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => limit(() => directoryIteratee(dirent)));

  const compressedItems = dirents
    .filter((dirent) => dirent.isFile() && isCompressed(dirent.name))
    .map((dirent) => limit(() => compressedFileIteratee(dirent)));

  const settledItems = await Promise.allSettled([...directoryItems, ...compressedItems]);
  const inboxValues = settledItems
    .filter(isFulfilled)
    .map((item) => item.value)
    .filter((item): item is InboxEntry => item != null);

  const end = performance.now();
  const loadTime = dayjs.duration(end - start);
  log.info(`Inbox scan time: ${loadTime.asSeconds()}`);
  return inboxValues;
};
