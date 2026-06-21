import fs from 'node:fs';
import path from 'node:path';
import { BlobReader, ZipReader } from '@zip.js/zip.js';
import { createExtractorFromFile } from 'node-unrar-js';
import * as tar from 'tar';
import log from 'electron-log/main';
import { RarExtractor } from '../../types';

const isUrlFile = (filename: string) => filename.toLowerCase().endsWith('.url');

const ensureDir = async (dir: string) => {
  await fs.promises.mkdir(dir, { recursive: true });
};

const resolveArchiveEntryPath = (destDir: string, relativePath: string) => {
  const destRoot = path.resolve(destDir);
  const targetPath = path.resolve(destRoot, relativePath);
  if (targetPath !== destRoot && !targetPath.startsWith(`${destRoot}${path.sep}`)) {
    throw new Error(`Archive entry would extract outside destination: ${relativePath}`);
  }
  return targetPath;
};

const isSafeArchiveEntryPath = (destDir: string, relativePath: string) => {
  try {
    resolveArchiveEntryPath(destDir, relativePath);
    return true;
  } catch (error) {
    log.error(error instanceof Error ? error.message : String(error));
    return false;
  }
};

const writeEntry = async (destDir: string, relativePath: string, data: Uint8Array | Buffer) => {
  if (isUrlFile(relativePath)) return;
  const targetPath = resolveArchiveEntryPath(destDir, relativePath);
  const targetDir = path.dirname(targetPath);
  await fs.promises.mkdir(targetDir, { recursive: true });
  await fs.promises.writeFile(targetPath, data);
};

const extractZip = async (archivePath: string, destDir: string) => {
  const data = await fs.promises.readFile(archivePath);
  const archiveBlob = new Blob([data]);
  const reader = new BlobReader(archiveBlob);
  const zipReader = new ZipReader(reader);
  try {
    const entries = await zipReader.getEntries();

    const fileEntries = entries.filter(
      (entry): entry is typeof entry & { directory: false } =>
        !entry.directory && !isUrlFile(entry.filename) && isSafeArchiveEntryPath(destDir, entry.filename)
    );
    const writes = fileEntries.map(async (entry) => {
      const arrayBuffer = await entry.arrayBuffer();
      await writeEntry(destDir, entry.filename, new Uint8Array(arrayBuffer));
    });

    await Promise.all(writes);
  } finally {
    await zipReader.close();
  }
};

const extractRar = async (archivePath: string, destDir: string) => {
  // node-unrar-js's file extractor writes directly to disk via `targetPath`
  // (file.extraction is undefined for the file extractor — only populated by
  // createExtractorFromData). Pass destDir as targetPath so the library writes
  // there instead of the process CWD (the default empty targetPath).
  const rawExtractor = await createExtractorFromFile({
    filepath: archivePath,
    targetPath: destDir
  });
  const extractor = RarExtractor.parse(rawExtractor);

  const list = extractor.getFileList();
  const fileHeaders = [...list.fileHeaders];
  const safeNames = fileHeaders
    .filter((h) => !h.flags.directory && !isUrlFile(h.name) && isSafeArchiveEntryPath(destDir, h.name))
    .map((h) => h.name);

  // The library writes files lazily to targetPath as the generator is iterated;
  // drain it fully so all files are written and the C++ object is freed.
  const extracted = extractor.extract({ files: safeNames });
  for (const file of extracted.files) {
    // no-op: iteration triggers the on-disk write
    log.log(file.fileHeader.name);
  }
};

const extractTar = async (archivePath: string, destDir: string) => {
  await ensureDir(destDir);
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(archivePath).pipe(
      tar.extract({
        cwd: destDir,
        filter: (filePath: string) => !isUrlFile(filePath) && isSafeArchiveEntryPath(destDir, filePath)
      })
    );
    stream.on('finish', () => resolve());
    stream.on('error', (err: Error) => reject(err));
  });
};

export const extractArchive = async (archivePath: string, destDir: string): Promise<void> => {
  const lower = archivePath.toLowerCase();
  await ensureDir(destDir);

  try {
    if (lower.endsWith('.zip')) {
      await extractZip(archivePath, destDir);
    } else if (lower.endsWith('.rar')) {
      await extractRar(archivePath, destDir);
    } else if (lower.endsWith('.tar')) {
      await extractTar(archivePath, destDir);
    } else {
      throw new Error(`Unsupported archive format: ${archivePath}`);
    }
  } catch (error) {
    log.error(`Failed to extract ${archivePath}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
};
