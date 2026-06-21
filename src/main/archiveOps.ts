import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { app } from 'electron';
import log from 'electron-log/main';
import { parseFile } from 'music-metadata';
import { extractArchive } from './lib/extractArchive';
import { isAudio, readAlbumFromDir, readOrCreateSettings } from './backendOps';
import type { Album, AppSettings, CompressedFile } from '../types';

const SHELL_PREFIX = 'bimm-extract-';

export const resolveTempDir = (settings: AppSettings | null): string => {
  return settings?.tempDirectory ?? os.tmpdir();
};

export const resolveNewAlbumTargetDir = (settings: AppSettings | null): string => {
  return settings?.newAlbumTargetDirectory ?? settings?.directories?.[0] ?? app.getPath('music');
};

const RANDOM_LENGTH = 6;
const RADIX = 36;
const SLICE_START = 2;

export const makeUniqueSubdir = async (tempDir: string): Promise<string> => {
  const timestamp = Date.now();
  const rand = Math.random()
    .toString(RADIX)
    .slice(SLICE_START, SLICE_START + RANDOM_LENGTH);
  const subdir = path.join(tempDir, `${SHELL_PREFIX}${timestamp}-${rand}`);
  await fs.mkdir(subdir, { recursive: true });
  return subdir;
};

const findFirstAudioFile = async (dir: string): Promise<string | null> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const audioFiles = entries.filter((entry) => entry.isFile() && isAudio(entry.name));
  const firstAudio = audioFiles[0];
  if (firstAudio != null) {
    return path.join(dir, firstAudio.name);
  }
  const subdirs = entries.filter((entry) => entry.isDirectory());
  const searches = subdirs.map((subdir) => findFirstAudioFile(path.join(dir, subdir.name)));
  const results = await Promise.all(searches);
  return results.find((result) => result != null) ?? null;
};

const sanitizeFilename = (name: string): string => {
  return name.replace(/[/\\?%*:|"<>]/g, '-').trim();
};

const getSingleChildDir = async (dir: string): Promise<string | null> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const contentEntries = entries.filter((entry) => entry.name !== '.DS_Store' && entry.name !== '__MACOSX');
  const onlyEntry = contentEntries[0];
  return contentEntries.length === 1 && onlyEntry?.isDirectory() ? path.join(dir, onlyEntry.name) : null;
};

export const renameIfAudio = async (extractedDir: string, fallbackName: string): Promise<string | null> => {
  const audioFile = await findFirstAudioFile(extractedDir);
  if (audioFile == null) {
    return null;
  }

  let metadata;
  try {
    metadata = await parseFile(audioFile, { duration: false, skipCovers: true });
  } catch (parseError) {
    log.error(
      `Unable to parse metadata for ${audioFile}: ${parseError instanceof Error ? parseError.message : String(parseError)}`
    );
    return null;
  }

  const artist = sanitizeFilename(metadata.common.artist ?? metadata.common.albumartist ?? fallbackName);
  const album = sanitizeFilename(metadata.common.album ?? fallbackName);
  const year = metadata.common.year ?? '';
  const newName = year ? `${artist} - ${album} (${year})` : `${artist} - ${album}`;

  const parentDir = path.dirname(extractedDir);
  const targetPath = path.join(parentDir, newName);

  if (targetPath === extractedDir) {
    return extractedDir;
  }

  try {
    await fs.rename(extractedDir, targetPath);
    return targetPath;
  } catch (renameError) {
    log.error(
      `Failed to rename ${extractedDir}: ${renameError instanceof Error ? renameError.message : String(renameError)}`
    );
    return extractedDir;
  }
};

const FIRST_COLLISION_SUFFIX = 2;

const isNodeError = (error: unknown): error is NodeJS.ErrnoException => {
  return error != null && typeof error === 'object' && 'code' in error;
};

const buildTargetPath = (sourceDir: string, targetDir: string, suffix?: number): string => {
  const basename = path.basename(sourceDir);
  return path.join(targetDir, suffix == null ? basename : `${basename} (${suffix})`);
};

const moveDirWithoutOverwrite = async (sourceDir: string, targetPath: string) => {
  await fs.cp(sourceDir, targetPath, { recursive: true, errorOnExist: true, force: false });
  await fs.rm(sourceDir, { recursive: true, force: true });
};

export const moveToTarget = async (sourceDir: string, targetDir: string): Promise<string> => {
  await fs.mkdir(targetDir, { recursive: true });

  let targetPath = buildTargetPath(sourceDir, targetDir);

  if (targetPath === sourceDir) {
    return sourceDir;
  }

  let counter = FIRST_COLLISION_SUFFIX;

  while (true) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await moveDirWithoutOverwrite(sourceDir, targetPath);
      return targetPath;
    } catch (moveError) {
      if (isNodeError(moveError) && (moveError.code === 'EEXIST' || moveError.code === 'ENOTEMPTY')) {
        targetPath = buildTargetPath(sourceDir, targetDir, counter);
        counter++;
        continue;
      }
      throw moveError;
    }
  }
};

const cleanupTempShell = async (tempDir: string) => {
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch (cleanupError) {
    log.error(
      `Failed to clean up temp dir ${tempDir}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`
    );
  }
};

const isSameOrInside = (candidate: string, parentDir: string) => {
  const relative = path.relative(parentDir, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

export const extractAndIngestAlbum = async (compressed: CompressedFile): Promise<Album | null> => {
  const settings = await readOrCreateSettings();
  const tempRoot = resolveTempDir(settings);
  const inboxDir = settings?.inbox;
  if (inboxDir == null) {
    log.error('extractAndIngestAlbum aborted: no inbox directory configured');
    return null;
  }
  const fallbackName = path.basename(compressed.filename, path.extname(compressed.filename));

  const tempDir = await makeUniqueSubdir(tempRoot);
  let finalDir: string | null = null;

  try {
    await extractArchive(compressed.fullpath, tempDir);

    const singleChild = await getSingleChildDir(tempDir);
    const extractedDir = singleChild ?? tempDir;

    const renamedDir = await renameIfAudio(extractedDir, fallbackName);

    finalDir = await moveToTarget(renamedDir ?? extractedDir, inboxDir);

    const album = await readAlbumFromDir(finalDir, path.basename(finalDir));

    return album.tracks.length > 0 ? album : null;
  } catch (error) {
    log.error(
      `extractAndIngestAlbum failed for ${compressed.fullpath}: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  } finally {
    if (finalDir == null || !isSameOrInside(finalDir, tempDir)) {
      await cleanupTempShell(tempDir);
    }
  }
};
