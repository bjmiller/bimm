import { app, BrowserWindow, nativeImage } from 'electron';
import { join } from 'node:path';
import log from 'electron-log/main';
import { createIPCHandler } from 'trpc-electron/main';
import { ensureDirectory, readOrCreateSettings } from './main/backendOps';
import { appRouter } from './main/appRouter';
import { installLogBroadcaster } from './main/logBroadcaster';

installLogBroadcaster();

log.transports.file.level = false;
log.initialize();

const height = 768;
const width = 1280;
const iconPath = join(__dirname, 'icons', 'musicalNote512.png');

app.setName('BIMM');

const createWindow = () => {
  const win = new BrowserWindow({
    webPreferences: {
      preload: join(__dirname, 'preload.js')
    },
    height,
    width,
    title: 'BIMM',
    icon: iconPath
  });

  win
    .loadFile(`${__dirname}/index.html`)
    .then(() => {
      win.focus();
    })
    .catch((reason) => {
      log.error(`Failed to load document: ${reason}`);
    });
  return win;
};

app
  .whenReady()
  .then(ensureDirectory)
  .then((directoryIsThere) => {
    if (directoryIsThere) {
      return readOrCreateSettings();
    } else {
      throw new Error("Settings directory can't be created or accessed");
    }
  })
  .then(() => {
    if (process.platform === 'darwin') {
      app.dock?.setIcon(nativeImage.createFromPath(iconPath));
    }

    const win = createWindow();
    createIPCHandler({ router: appRouter, windows: [win] });
    return win;
  })
  .catch((reason) => {
    log.error(`Failed to ready: ${reason}`);
  });
