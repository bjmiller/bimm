import fs from 'node:fs/promises';
import { type Dirent, type PathLike } from 'node:fs';
import os from 'node:os';
import { basename, dirname, join, sep } from 'node:path';
import log from 'electron-log/main';
import { type IAudioMetadata, parseFile } from 'music-metadata';
import pLimit from 'p-limit';
import { app, shell } from 'electron';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
dayjs.extend(duration);
import {
  AppSettings,
  AlbumMetadata,
  type Album,
  type AlbumTagUpdate,
  type CompressedFile,
  type InboxEntry,
  type Track
} from '../types';
import { moveToTarget, resolveNewAlbumTargetDir } from './archiveOps';
import { updateAlbumInCaches } from './albumCache';
import { messageFrom } from './lib/messageFrom';
import { normalizeTagList } from '../lib/tags';

log.transports.file.level = false;

const APP_PATH = `${os.homedir()}${sep}.bimm`;
const CONFIG_PATH = `${APP_PATH}${sep}.bimmrc.json`;
const BIMM_METADATA_FILENAME = 'bimm.json';
const SPACES = 2;

// The metadata keys the tag editor owns. Derived from the schema so adding a
// tag kind to `AlbumMetadata` can't silently skip persistence here.
const ALBUM_TAG_FIELDS = Object.keys(AlbumMetadata.shape) as Array<keyof AlbumMetadata>;

const isNodeError = (item: unknown): item is NodeJS.ErrnoException => {
  return item != null && typeof item === 'object' && Object.hasOwn(item, 'code') && Object.hasOwn(item, 'errno');
};

const isFulfilled = <T>(response: PromiseSettledResult<T>): response is PromiseFulfilledResult<T> => {
  return response.status === 'fulfilled';
};

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
    throw writeError;
  }
  return readOrCreateSettings();
};

// We're trusting that the file extension is enough to tell if a file is an audio track.
export const isAudio = (filename: string) => {
  const extensions = ['.mp3', '.m4a', '.flac', '.ogg'];
  for (const ext of extensions) {
    if (filename.toLowerCase().endsWith(ext)) return true;
  }
  return false;
};

// macOS uses AppleDouble files prefixed with `._` to track metadata on non-HFS volumes.
// These should be ignored when scanning for albums and tracks.
export const isAppleDouble = (filename: string) => filename.startsWith('._');

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
  await updateAlbumInCaches(albumPath, metadata);
};

// Serializes read-modify-write cycles to a given album's bimm.json. Concurrent
// writers (e.g. Chosic genres and Bandcamp tags fetched in parallel) each read
// the file before writing, so without serialization the second write would
// clobber the first's keys.
const albumMetadataUpdateQueues = new Map<string, Promise<void>>();

export const updateAlbumMetadata = async (
  albumPath: string,
  update: (metadata: AlbumMetadata) => AlbumMetadata
): Promise<void> => {
  const previous = albumMetadataUpdateQueues.get(albumPath) ?? Promise.resolve();

  const current = previous
    .catch(() => undefined)
    .then(async () => {
      const metadata = await readAlbumMetadata(albumPath);
      await writeAlbumMetadata(albumPath, update(metadata));
    });

  albumMetadataUpdateQueues.set(albumPath, current);

  try {
    await current;
  } finally {
    if (albumMetadataUpdateQueues.get(albumPath) === current) {
      albumMetadataUpdateQueues.delete(albumPath);
    }
  }
};

// Persists edited tags for a single album. Reads the existing metadata first so
// keys the editor doesn't manage are preserved, and drops empty tag arrays so
// bimm.json never accumulates `"manualTags": []` noise. Writing goes through
// `writeAlbumMetadata`, which restores the album directory's atime/mtime after
// the write — the album list's Modified column must not jump because someone
// retagged. Returns the re-read album so the renderer can update in place.
export const writeAlbumTags = async (update: AlbumTagUpdate): Promise<Album> => {
  const { albumPath, tags } = update;

  await updateAlbumMetadata(albumPath, (existingMetadata) => {
    const mergedMetadata: AlbumMetadata = { ...existingMetadata };

    for (const field of ALBUM_TAG_FIELDS) {
      const editedTags = tags[field];

      if (editedTags == null) {
        continue;
      }

      const normalized = normalizeTagList(editedTags);

      if (normalized.length === 0) {
        delete mergedMetadata[field];
      } else {
        mergedMetadata[field] = normalized;
      }
    }

    return mergedMetadata;
  });

  return await readAlbumFromDir(albumPath);
};

const readTracks = async (dir: string) => {
  // let tracks: Track[];
  let audioDirents: Dirent[];
  // Get the names of the audio files
  try {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    audioDirents = dirents.filter((dirent) => dirent.isFile() && isAudio(dirent.name) && !isAppleDouble(dirent.name));
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

  const albumIteratee = (dirent: Dirent): Promise<Album> => {
    return readAlbumFromDir(fullPathOf(dirent), dirent.name);
  };

  const albumItems = dirents
    .filter((dirent) => dirent.isDirectory() && !isAppleDouble(dirent.name))
    .map((dirent) => limit(albumIteratee, dirent));
  const settledAlbumItems = await Promise.allSettled(albumItems);
  const albumValues = settledAlbumItems.filter(isFulfilled).map((item) => item.value);
  const end = performance.now();
  const loadTime = dayjs.duration(end - start);
  log.info(`Album scan time: ${loadTime.asSeconds()}`);
  return albumValues;
};

// Reads the on-disk album cache for instant rendering (stale-while-revalidate
// placeholder). Returns undefined when no usable cache exists.
export const readCachedAlbums = async (root: string | undefined): Promise<Album[] | undefined> => {
  if (root == null || root === '') return undefined;
  const { readAlbumCache } = await import('./albumCache');
  const cached = await readAlbumCache(root);
  return cached != null && cached.length > 0 ? cached : undefined;
};

export const refreshAlbumCache = async (root: string | undefined): Promise<Album[]> => {
  if (root == null || root === '') return [];

  log.info(`Scanning filesystem for ${root}...`);
  const albums = await readAlbumDirectories(root);
  const { writeAlbumCache } = await import('./albumCache');
  await writeAlbumCache(root, albums);
  return albums;
};

const directoryHasAudio = async (dir: string) => {
  try {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    return dirents.some((dirent) => dirent.isFile() && isAudio(dirent.name) && !isAppleDouble(dirent.name));
  } catch (listError) {
    log.error(`Unable to list files in ${dir}: ${messageFrom(listError)}`);
    return false;
  }
};

const compressedFileIteratee = async (dirent: Dirent): Promise<CompressedFile> => {
  const fullpath = fullPathOf(dirent);
  let mtime: Date | undefined;
  try {
    const stat = await fs.stat(fullpath);
    mtime = stat.mtime;
  } catch (statError) {
    log.error(`Fail to stat ${dirent.name}: ${messageFrom(statError)}`);
  }

  return {
    filename: dirent.name,
    fullpath,
    mtime
  };
};

export const readAlbumFromDir = async (dirPath: string, filename?: string): Promise<Album> => {
  let mtime: Date | undefined;
  try {
    const stat = await fs.stat(dirPath);
    mtime = stat.mtime;
  } catch (statError) {
    log.error(`Fail to stat ${dirPath}: ${messageFrom(statError)}`);
  }

  const [tracks, metadata] = await Promise.all([readTracks(dirPath), readAlbumMetadata(dirPath)]);

  return {
    filename: filename ?? dirPath.split(sep).pop() ?? '',
    fullpath: dirPath,
    mtime,
    tracks,
    title: tracks[0]?.albumTitle,
    ...metadata
  };
};

const albumInboxIteratee = (dirent: Dirent): Promise<Album> => {
  return readAlbumFromDir(fullPathOf(dirent), dirent.name);
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
    .filter((dirent) => dirent.isDirectory() && !isAppleDouble(dirent.name))
    .map((dirent) => limit(() => directoryIteratee(dirent)));

  const compressedItems = dirents
    .filter((dirent) => dirent.isFile() && isCompressed(dirent.name) && !isAppleDouble(dirent.name))
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

export const moveAlbumToTarget = async (album: Album): Promise<Album> => {
  const settings = await readOrCreateSettings();
  const targetDir = resolveNewAlbumTargetDir(settings);

  const sourceDir = dirname(album.fullpath);
  const finalDir = await moveToTarget(album.fullpath, targetDir);

  const refreshed = await readAlbumFromDir(finalDir, basename(finalDir));

  // Keep the affected directory caches consistent with the move.
  const { readAlbumCache, writeAlbumCache } = await import('./albumCache');
  const updates: Promise<void>[] = [];

  const removeFromSourceCache = async () => {
    const cached = await readAlbumCache(sourceDir);
    if (cached != null) {
      await writeAlbumCache(
        sourceDir,
        cached.filter((entry) => entry.fullpath !== album.fullpath)
      );
    }
  };
  updates.push(removeFromSourceCache());

  if (targetDir !== sourceDir) {
    const addToTargetCache = async () => {
      const cached = await readAlbumCache(targetDir);
      if (cached != null && !cached.some((entry) => entry.fullpath === refreshed.fullpath)) {
        await writeAlbumCache(targetDir, [...cached, refreshed]);
      }
    };
    updates.push(addToTargetCache());
  }

  await Promise.all(updates);

  return refreshed;
};

export const trashItem = async (itemPath: string): Promise<boolean> => {
  await shell.trashItem(itemPath);
  return true;
};
