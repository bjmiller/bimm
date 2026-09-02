import { argv, cwd, exit, stderr } from 'node:process';

import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

type PackageJson = {
  version: string;
};

type ParsedSemver = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};

const PACKAGE_JSON_PATH = `${cwd()}/package.json`;
const ARGV_OFFSET = 2;
const JSON_INDENTATION = 2;
const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const NUMERIC_REGEX = /^\d+$/;

const parseVersionArgument = (): string => {
  const args = argv.slice(ARGV_OFFSET);
  const versionFlagIndex = args.indexOf('--version');

  if (versionFlagIndex !== -1) {
    const version = args[versionFlagIndex + 1];

    if (version == null || version.length === 0) {
      throw new Error('Missing value for --version');
    }

    return version;
  }

  const [version] = args;

  if (version == null || version.length === 0) {
    throw new Error('Usage: npm run create-release -- <version>');
  }

  return version;
};

const parseSemver = (input: string): ParsedSemver => {
  const match = SEMVER_REGEX.exec(input);

  if (!match) {
    throw new Error(`Invalid semver version: ${input}`);
  }

  const [, majorText, minorText, patchText, prereleaseText] = match;

  if (majorText == null || minorText == null || patchText == null) {
    throw new Error(`Invalid semver version: ${input}`);
  }

  const prerelease = prereleaseText == null ? [] : prereleaseText.split('.');

  for (const identifier of prerelease) {
    if (NUMERIC_REGEX.exec(identifier) !== null && identifier.length > 1 && identifier.startsWith('0')) {
      throw new Error(`Invalid semver version: ${input}`);
    }
  }

  return {
    major: Number(majorText),
    minor: Number(minorText),
    patch: Number(patchText),
    prerelease
  };
};

const compareIdentifiers = (left: string, right: string): number => {
  const leftIsNumeric = NUMERIC_REGEX.exec(left) !== null;
  const rightIsNumeric = NUMERIC_REGEX.exec(right) !== null;

  if (leftIsNumeric && rightIsNumeric) {
    return Number(left) - Number(right);
  }

  if (leftIsNumeric) {
    return -1;
  }

  if (rightIsNumeric) {
    return 1;
  }

  return left.localeCompare(right);
};

const compareSemver = (left: ParsedSemver, right: ParsedSemver): number => {
  const majorDelta = left.major - right.major;

  if (majorDelta !== 0) {
    return majorDelta;
  }

  const minorDelta = left.minor - right.minor;

  if (minorDelta !== 0) {
    return minorDelta;
  }

  const patchDelta = left.patch - right.patch;

  if (patchDelta !== 0) {
    return patchDelta;
  }

  if (left.prerelease.length === 0 && right.prerelease.length === 0) {
    return 0;
  }

  if (left.prerelease.length === 0) {
    return 1;
  }

  if (right.prerelease.length === 0) {
    return -1;
  }

  const comparisonLength = Math.max(left.prerelease.length, right.prerelease.length);

  for (let index = 0; index < comparisonLength; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];

    if (leftIdentifier == null) {
      return -1;
    }

    if (rightIdentifier == null) {
      return 1;
    }

    const identifierDelta = compareIdentifiers(leftIdentifier, rightIdentifier);

    if (identifierDelta !== 0) {
      return identifierDelta;
    }
  }

  return 0;
};

const readPackageJson = async (): Promise<PackageJson> => {
  const packageJsonText = await readFile(PACKAGE_JSON_PATH, 'utf8');
  const packageJson: unknown = JSON.parse(packageJsonText);

  const hasVersion =
    packageJson != null &&
    typeof packageJson === 'object' &&
    'version' in packageJson &&
    typeof packageJson.version === 'string';

  if (!hasVersion) {
    throw new Error('package.json has an invalid format');
  }

  return packageJson as PackageJson;
};

const writePackageVersion = async (packageJson: PackageJson, version: string): Promise<void> => {
  const nextPackageJson: PackageJson = {
    ...packageJson,
    version
  };

  await writeFile(PACKAGE_JSON_PATH, `${JSON.stringify(nextPackageJson, null, JSON_INDENTATION)}\n`);
};

const runGit = (args: string[]): void => {
  execFileSync('git', args, { stdio: 'inherit' });
};

const ensureTagDoesNotExist = (version: string): void => {
  const tagName = `v${version}`;
  const result = execFileSync('git', ['tag', '-l', tagName], { encoding: 'utf8' });

  if (result.trim().length > 0) {
    throw new Error(`Tag ${tagName} already exists`);
  }
};

const commitPackageJson = (version: string): void => {
  runGit(['add', 'package.json']);
  runGit(['commit', '-m', `Release ${version}`, '--', 'package.json']);
};

const createAnnotatedTag = (version: string): void => {
  runGit(['tag', '-a', `v${version}`, '-m', `Release ${version}`]);
};

const main = async (): Promise<void> => {
  const nextVersion = parseVersionArgument();
  const nextSemver = parseSemver(nextVersion);
  const packageJson = await readPackageJson();
  const currentSemver = parseSemver(packageJson.version);

  if (compareSemver(nextSemver, currentSemver) <= 0) {
    throw new Error(`Version ${nextVersion} must be newer than ${packageJson.version}`);
  }

  ensureTagDoesNotExist(nextVersion);
  await writePackageVersion(packageJson, nextVersion);
  commitPackageJson(nextVersion);
  createAnnotatedTag(nextVersion);
};

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  stderr.write(`${message}\n`);
  exit(1);
});
