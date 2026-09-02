import fs from 'node:fs';
import { type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Reader, ZipReader } from '@zip.js/zip.js';
import { createExtractorFromFile } from 'node-unrar-js';
import pLimit from 'p-limit';
import * as tar from 'tar';
import log from 'electron-log/main';
import { RarExtractor } from '../../types';

// How many zip entries are decompressed and written at once. Bounded so peak
// memory is a few entries' worth of stream buffers rather than the whole
// archive's decompressed contents.
const ZIP_ENTRY_CONCURRENCY = 4;

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

// Random-access zip.js reader over an open file handle, so the archive is read
// in chunks at the offsets zip.js asks for rather than loaded whole into memory.
class FileHandleReader extends Reader<FileHandle> {
  private readonly handle: FileHandle;

  constructor(handle: FileHandle) {
    super(handle);
    this.handle = handle;
  }

  override async init() {
    await super.init?.();
    const stats = await this.handle.stat();
    this.size = stats.size;
  }

  override async readUint8Array(index: number, length: number): Promise<Uint8Array> {
    const remaining = Math.max(0, Math.min(length, this.size - index));
    const buffer = new Uint8Array(remaining);
    let offset = 0;
    while (offset < remaining) {
      // eslint-disable-next-line no-await-in-loop
      const { bytesRead } = await this.handle.read(buffer, offset, remaining - offset, index + offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    return offset === remaining ? buffer : buffer.subarray(0, offset);
  }
}

const extractZip = async (archivePath: string, destDir: string) => {
  const handle = await fs.promises.open(archivePath, 'r');
  try {
    const zipReader = new ZipReader(new FileHandleReader(handle));
    try {
      const entries = await zipReader.getEntries();

      const fileEntries = entries.filter(
        (entry): entry is typeof entry & { directory: false } =>
          !entry.directory && !isUrlFile(entry.filename) && isSafeArchiveEntryPath(destDir, entry.filename)
      );

      const limit = pLimit(ZIP_ENTRY_CONCURRENCY);
      const writes = fileEntries.map((entry) =>
        limit(async () => {
          const targetPath = resolveArchiveEntryPath(destDir, entry.filename);
          await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
          // Stream the decompressed entry straight to disk instead of buffering it.
          const fileStream = fs.createWriteStream(targetPath);
          try {
            await entry.getData(Writable.toWeb(fileStream));
          } catch (entryError) {
            fileStream.destroy();
            throw entryError;
          }
        })
      );

      await Promise.all(writes);
    } finally {
      await zipReader.close();
    }
  } finally {
    await handle.close();
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
  // `pipeline` (unlike `.pipe()`) surfaces errors from the read stream too and
  // destroys both streams on failure, so a bad read can't leave this pending.
  await pipeline(
    fs.createReadStream(archivePath),
    tar.extract({
      cwd: destDir,
      filter: (filePath: string) => !isUrlFile(filePath) && isSafeArchiveEntryPath(destDir, filePath)
    })
  );
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
