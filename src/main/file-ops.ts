import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import log from 'electron-log/main';
import { type AppSettings } from '../types';
import { type PathLike } from 'node:fs';

log.transports.file.level = false;

const APP_PATH = `${os.homedir()}${path.sep}.bimm`;
const CONFIG_PATH = `${APP_PATH}${path.sep}.bimmrc.json`;
const DATA_PATH = `${APP_PATH}${path.sep}bimmdata.json`;

const isNodeError = (item: unknown): item is NodeJS.ErrnoException => {
  return item != null && typeof item === 'object' && Object.hasOwn(item, 'code') && Object.hasOwn(item, 'errno');
};

const messageFrom = (err: unknown) => (isNodeError(err) ? err.message : String(err));

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

export const getSettings = async (opts: { defaultMusicPath: string }) => {
  // Check for existence
  try {
    await fs.stat(CONFIG_PATH);
  } catch (statError) {
    if (isNodeError(statError) && statError.code === 'ENOENT') {
      log.log(`Config file not present, creating a new one`);
      try {
        // eslint-disable-next-line no-magic-numbers
        await fs.writeFile(CONFIG_PATH, JSON.stringify({ directories: [opts.defaultMusicPath] }, null, 2));
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
    return JSON.parse(appSettings) as AppSettings;
  } catch (readFileError) {
    log.error(`Unable to read config file: ${messageFrom(readFileError)}`);
    return null;
  }
};

export const getAlbumDirectories = async (root?: PathLike) => {
  if (root == null || root === '') return [];
  const dirents = await fs.readdir(root, { withFileTypes: true });
  return dirents
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => {
      return { name: dirent.name, path: dirent.parentPath };
    });
};
