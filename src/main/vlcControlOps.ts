import { execFile, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { type Track, type Album, type VlcCommand, type VlcLaunchCommand, type VlcWebRequestOptions } from '../types';
import { readOrCreateSettings } from './backendOps';

const VLC_READY_TIMEOUT_MS = 30000;
const VLC_READY_POLL_INTERVAL_MS = 500;
const VLC_WEB_REQUEST_TIMEOUT_MS = 1000;

const delay = async (milliseconds: number) => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const isVlcWebServerReachable = async () => {
  try {
    await sendToVlcWeb({ command: null }, { timeoutMs: VLC_WEB_REQUEST_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
};

const waitForVlcWebServer = async (deadline = Date.now() + VLC_READY_TIMEOUT_MS): Promise<void> => {
  if (await isVlcWebServerReachable()) {
    return;
  }

  if (Date.now() >= deadline) {
    throw new Error('VLC did not become reachable.');
  }

  await delay(VLC_READY_POLL_INTERVAL_MS);
  await waitForVlcWebServer(deadline);
};

const execFileMatches = async (command: string, args: string[], matches: (output: string) => boolean) => {
  return await new Promise<boolean>((resolve) => {
    execFile(command, args, (error, stdout) => {
      resolve(error == null && matches(stdout));
    });
  });
};

export const isVlcProcessRunning = async () => {
  switch (process.platform) {
    case 'darwin':
      return await execFileMatches('pgrep', ['-x', 'VLC'], () => true);
    case 'win32':
      return await execFileMatches('tasklist', ['/FI', 'IMAGENAME eq vlc.exe'], (output) => /vlc\.exe/i.test(output));
    default:
      return await execFileMatches('pgrep', ['-x', 'vlc'], () => true);
  }
};

const determineVlcLaunchCommands = (): VlcLaunchCommand[] => {
  switch (process.platform) {
    case 'darwin':
      return [{ command: 'open', args: ['-a', 'VLC'] }];
    case 'win32': {
      const windowsCandidates = [
        process.env.ProgramFiles == null ? undefined : `${process.env.ProgramFiles}\\VideoLAN\\VLC\\vlc.exe`,
        process.env['ProgramFiles(x86)'] == null
          ? undefined
          : `${process.env['ProgramFiles(x86)']}\\VideoLAN\\VLC\\vlc.exe`,
        process.env.LOCALAPPDATA == null ? undefined : `${process.env.LOCALAPPDATA}\\Programs\\VideoLAN\\VLC\\vlc.exe`,
        'vlc'
      ].filter((command): command is string => command != null);

      return windowsCandidates.map((command) => ({ command, args: [] }));
    }
    default:
      return [{ command: 'vlc', args: [] }];
  }
};

const spawnDetached = async (launchCommand: VlcLaunchCommand) => {
  await new Promise<void>((resolve, reject) => {
    const childProcess = spawn(launchCommand.command, launchCommand.args, { detached: true, stdio: 'ignore' });

    childProcess.once('error', reject);
    childProcess.once('spawn', () => {
      childProcess.unref();
      resolve();
    });
  });
};

export const launchVlc = async () => {
  const launchCommands = determineVlcLaunchCommands();
  let lastError: unknown;

  for (const launchCommand of launchCommands) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await spawnDetached(launchCommand);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error('Unable to launch VLC.', { cause: lastError });
};

export const ensureVlcRunning = async () => {
  if (await isVlcWebServerReachable()) {
    return;
  }

  if (!(await isVlcProcessRunning())) {
    await launchVlc();
  }

  await waitForVlcWebServer();
};

export const enqueueAlbum = async (album: Album) => {
  const tracks = album.tracks;
  // eslint-disable-next-line no-magic-numbers
  tracks?.sort((l: Track, r: Track) => (l.disk ?? 1) * 1000 + (l.track ?? 1) - ((r.disk ?? 1) * 1000 + (r.track ?? 1)));
  if (tracks != null) {
    for (const track of tracks) {
      // eslint-disable-next-line no-await-in-loop
      await enqueue(track);
    }
  }
};

export const playPlaylist = async () => {
  return await sendToVlcWeb({ command: 'pl_play' });
};

export const clearPlaylist = async () => {
  await sendToVlcWeb({ command: 'pl_stop' });
  return await sendToVlcWeb({ command: 'pl_empty' });
};

const sendToVlcWeb = async (vlcCommand: VlcCommand, options: VlcWebRequestOptions = {}) => {
  const vlcPassword = (await readOrCreateSettings())?.vlcPassword ?? '';
  const encodedCreds = Buffer.from(`:${vlcPassword}`).toString('base64');
  const Authorization = `Basic ${encodedCreds}`;

  const url = new URL('http://localhost:8080/requests/status.xml');
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(vlcCommand)) {
    if (value !== undefined) {
      if (Array.isArray(value)) {
        for (const item of value) {
          params.append(key, item);
        }
      } else {
        params.append(key, String(value));
      }
    }
  }
  url.search = params.toString();

  const abortController = new AbortController();
  const timeout = options.timeoutMs == null ? undefined : setTimeout(() => abortController.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, { headers: { Authorization }, signal: abortController.signal });

    if (!response.ok) {
      throw new Error(`VLC request failed: ${response.status} ${response.statusText}`);
    }

    return await response.text();
  } finally {
    if (timeout != null) {
      clearTimeout(timeout);
    }
  }
};

const enqueue = async (track: Track) => {
  return await sendToVlcWeb({ command: 'in_enqueue', input: pathToFileURL(track.fullPath).href });
};

export const addAndPlayAlbums = async (albums: Album[]) => {
  await ensureVlcRunning();
  await clearPlaylist();
  for (const album of albums) {
    // eslint-disable-next-line no-await-in-loop
    await enqueueAlbum(album);
  }
  await playPlaylist();
};
