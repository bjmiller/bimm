import { createWriteStream, existsSync } from 'node:fs';
import { cp, readdir, readFile, readlink, rm, mkdir, chmod } from 'node:fs/promises';
import { argv, cwd, env, exit, stderr, stdout, platform as hostPlatform, arch as hostArch } from 'node:process';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import { dirname, join, resolve } from 'node:path';

type Target = {
  browserSubdir: string;
  zipSuffix: string;
  executableParts: readonly string[];
};

type BrowserDescriptor = {
  name?: unknown;
  revision?: unknown;
  browserVersion?: unknown;
};

type BrowsersJson = {
  browsers?: BrowserDescriptor[];
};

const STAGING_ROOT = resolve(cwd(), 'resources', 'playwright-browsers');
const BROWSERS_JSON_PATH = resolve(cwd(), 'node_modules', 'playwright-core', 'browsers.json');
const CDN_BASE = 'https://cdn.playwright.dev/builds/cft';
const ZIP_NAME = 'chrome-for-testing.zip';
const EXECUTABLE_MODE = 0o755;
const ARGV_OFFSET = 2;

// `executableParts` mirrors playwright-core's EXECUTABLE_PATHS for the
// "chromium" (Chrome for Testing) build; `zipSuffix` mirrors its CFT download
// paths. Keep in sync when upgrading playwright.
const TARGETS: Record<string, Target> = {
  'darwin-arm64': {
    browserSubdir: 'chrome-mac-arm64',
    zipSuffix: 'mac-arm64/chrome-mac-arm64.zip',
    executableParts: ['Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing']
  },
  'darwin-x64': {
    browserSubdir: 'chrome-mac-x64',
    zipSuffix: 'mac-x64/chrome-mac-x64.zip',
    executableParts: ['Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing']
  },
  'win32-x64': {
    browserSubdir: 'chrome-win64',
    zipSuffix: 'win64/chrome-win64.zip',
    executableParts: ['chrome.exe']
  }
};

const parseTarget = (): Target => {
  const args = argv.slice(ARGV_OFFSET);
  const platformFlagIndex = args.indexOf('--platform');
  const archFlagIndex = args.indexOf('--arch');

  const platform = platformFlagIndex === -1 ? hostPlatform : args[platformFlagIndex + 1];
  const arch = archFlagIndex === -1 ? hostArch : args[archFlagIndex + 1];

  if (platform == null || arch == null) {
    throw new Error('Usage: node scripts/prepare-playwright-browsers.mts [--platform darwin|win32] [--arch arm64|x64]');
  }

  const target = TARGETS[`${platform}-${arch}`];

  if (target == null) {
    throw new Error(`Unsupported target: ${platform}-${arch}. Supported: ${Object.keys(TARGETS).join(', ')}`);
  }

  return target;
};

const defaultPlaywrightCacheDirectory = (): string => {
  switch (hostPlatform) {
    case 'darwin':
      return join(os.homedir(), 'Library', 'Caches');
    case 'win32':
      return env.LOCALAPPDATA ?? join(os.homedir(), 'AppData', 'Local');
    default:
      return env.XDG_CACHE_HOME ?? join(os.homedir(), '.cache');
  }
};

const readChromiumDescriptor = async (): Promise<{ revision: string; browserVersion: string }> => {
  const browsersJson: unknown = JSON.parse(await readFile(BROWSERS_JSON_PATH, 'utf8'));
  const browsers = (browsersJson as BrowsersJson).browsers;

  if (!Array.isArray(browsers)) {
    throw new Error(`${BROWSERS_JSON_PATH} has an invalid format`);
  }

  const descriptor = browsers.find((candidate) => candidate.name === 'chromium');

  if (descriptor == null || typeof descriptor.revision !== 'string' || typeof descriptor.browserVersion !== 'string') {
    throw new Error(`No chromium entry with revision and browserVersion in ${BROWSERS_JSON_PATH}`);
  }

  return { revision: descriptor.revision, browserVersion: descriptor.browserVersion };
};

const downloadZip = async (url: string, zipPath: string): Promise<void> => {
  stdout.write(`Downloading ${url}\n`);
  const response = await fetch(url, { redirect: 'follow' });

  if (!response.ok || response.body == null) {
    throw new Error(`Download failed with status ${response.status} for ${url}`);
  }

  await pipeline(Readable.fromWeb(response.body as unknown as NodeWebReadableStream), createWriteStream(zipPath));
};

const extractZip = (zipPath: string, destination: string): void => {
  execFileSync('tar', ['-xf', zipPath, '-C', destination], { stdio: 'inherit' });
};

const copyFromCache = async (cacheSource: string, stagingDir: string): Promise<boolean> => {
  try {
    // `verbatimSymlinks` keeps symlink targets relative; without it the copied
    // framework symlinks point back into the source cache directory and the
    // bundle fails codesign validation.
    await cp(cacheSource, stagingDir, { recursive: true, verbatimSymlinks: true });
    stdout.write(`Copied browser from local playwright cache: ${cacheSource}\n`);
    return true;
  } catch {
    return false;
  }
};

const validateSymlinks = async (root: string): Promise<void> => {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });

  await Promise.all(
    entries
      .filter((entry) => entry.isSymbolicLink())
      .map(async (entry) => {
        const linkPath = join(entry.parentPath, entry.name);
        const destination = await readlink(linkPath);
        const resolvedDestination = resolve(dirname(linkPath), destination);

        if (!existsSync(resolvedDestination)) {
          throw new Error(`Broken symlink in staged bundle: ${linkPath} -> ${destination}`);
        }
      })
  );
};

const main = async (): Promise<void> => {
  const target = parseTarget();
  const { revision, browserVersion } = await readChromiumDescriptor();
  const stagingDir = join(STAGING_ROOT, `chromium-${revision}`);
  const executablePath = join(stagingDir, target.browserSubdir, ...target.executableParts);

  stdout.write(`Staging Chromium ${browserVersion} (revision ${revision})\n`);

  await rm(STAGING_ROOT, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: true });

  const cacheSource = join(defaultPlaywrightCacheDirectory(), 'ms-playwright', `chromium-${revision}`);

  const cacheHasExecutable = existsSync(join(cacheSource, target.browserSubdir, ...target.executableParts));
  const copied = cacheHasExecutable ? await copyFromCache(cacheSource, stagingDir) : false;

  if (!copied) {
    const zipPath = join(os.tmpdir(), ZIP_NAME);
    const url = `${CDN_BASE}/${browserVersion}/${target.zipSuffix}`;

    try {
      await downloadZip(url, zipPath);
      extractZip(zipPath, stagingDir);
    } finally {
      await rm(zipPath, { force: true });
    }
  }

  if (hostPlatform === 'darwin') {
    await chmod(executablePath, EXECUTABLE_MODE);
  }

  if (!existsSync(executablePath)) {
    throw new Error(`Expected executable not found after staging: ${executablePath}`);
  }

  await validateSymlinks(stagingDir);

  stdout.write(`Staged browser at ${stagingDir}\n`);
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  stderr.write(`${message}\n`);
  exit(1);
});
