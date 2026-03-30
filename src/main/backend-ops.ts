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
import { AppSettings, type Track, type Album } from '../types';

log.transports.file.level = false;

const APP_PATH = `${os.homedir()}${sep}.bimm`;
const CONFIG_PATH = `${APP_PATH}${sep}.bimmrc.json`;
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
