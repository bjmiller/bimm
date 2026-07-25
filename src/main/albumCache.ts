import fs from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import os from 'node:os';
import { join, sep } from 'node:path';
import log from 'electron-log/main';
import superjson from 'superjson';
import { type Album } from '../types';
import { messageFrom } from './lib/messageFrom';

// Bump when the cache envelope shape changes; old files are discarded.
const CACHE_SCHEMA_VERSION = 1;
const CACHE_DIR = join(os.homedir(), '.bimm', 'cache');

interface AlbumCacheEnvelope {
  version: number;
  directory: string;
  updatedAt: string;
  albums: Album[];
}

const isNodeError = (item: unknown): item is NodeJS.ErrnoException => {
  return item != null && typeof item === 'object' && Object.hasOwn(item, 'code') && Object.hasOwn(item, 'errno');
};

const cacheFilePath = (directory: string) => {
  const hash = createHash('sha256').update(directory).digest('hex');
  return join(CACHE_DIR, `${hash}.json`);
};

const ensureCacheDirectory = async () => {
  await fs.mkdir(CACHE_DIR, { recursive: true });
};

export const readAlbumCache = async (directory: string): Promise<Album[] | undefined> => {
  try {
    const raw = await fs.readFile(cacheFilePath(directory), { encoding: 'utf-8' });
    const envelope = superjson.parse<AlbumCacheEnvelope>(raw);
    if (envelope.version !== CACHE_SCHEMA_VERSION || envelope.directory !== directory) {
      log.info(`Ignoring stale album cache for ${directory}`);
      return undefined;
    }
    return envelope.albums;
  } catch (readError) {
    if (isNodeError(readError) && readError.code === 'ENOENT') {
      return undefined;
    }
    log.warn(`Unable to read album cache for ${directory}: ${messageFrom(readError)}`);
    return undefined;
  }
};

export const writeAlbumCache = async (directory: string, albums: Album[]): Promise<void> => {
  try {
    await ensureCacheDirectory();
    const envelope: AlbumCacheEnvelope = {
      version: CACHE_SCHEMA_VERSION,
      directory,
      updatedAt: new Date().toISOString(),
      albums
    };
    const targetPath = cacheFilePath(directory);
    // Unique temp path per write: concurrent writers for the same directory
    // must not clobber each other's temp file (last rename wins, which is
    // fine since both write equivalent data).
    const tempPath = `${targetPath}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(tempPath, superjson.stringify(envelope));
      await fs.rename(tempPath, targetPath);
    } catch (writeError) {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      throw writeError;
    }
  } catch (writeError) {
    log.warn(`Unable to write album cache for ${directory}: ${messageFrom(writeError)}`);
  }
};

// Drop all cached entries for an album path regardless of which music
// directory it lives in (directories aren't known at invalidation time).
export const invalidateAlbumInCaches = async (albumPath: string): Promise<void> => {
  let cacheFiles: string[];
  try {
    cacheFiles = await fs.readdir(CACHE_DIR);
  } catch (listError) {
    if (isNodeError(listError) && listError.code === 'ENOENT') {
      return;
    }
    log.warn(`Unable to list album cache directory: ${messageFrom(listError)}`);
    return;
  }

  const targetSuffix = `${sep}${albumPath}${sep}`;
  const removals = cacheFiles
    .filter((file) => file.endsWith('.json'))
    .map(async (file) => {
      const filePath = join(CACHE_DIR, file);
      try {
        const contents = await fs.readFile(filePath, { encoding: 'utf-8' });
        if (contents.includes(targetSuffix)) {
          await fs.rm(filePath, { force: true });
          log.info(`Invalidated album cache ${file} for ${albumPath}`);
        }
      } catch (fileError) {
        log.warn(`Unable to inspect album cache ${file}: ${messageFrom(fileError)}`);
      }
    });

  await Promise.all(removals);
};
