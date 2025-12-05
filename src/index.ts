import { app, BrowserWindow } from 'electron';
import { sep } from 'node:path';
import os from 'node:os';
import log from 'electron-log/main';
import { createIPCHandler } from 'trpc-electron/main';
import { ensureDirectory, readOrCreateSettings } from './main/backend-ops';
import { createContextCreator, appRouter } from './main/app-router';

log.transports.file.level = false;
log.initialize();

const height = 768;
const width = 1280;

const createWindow = () => {
  const win = new BrowserWindow({
    webPreferences: {
      preload: `${__dirname}${sep}preload.js`
    },
    height,
    width,
    title: 'BIMM',
    icon: `${__dirname}${sep}icons${sep}musical-note-512.png`
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
  .then((maybeSettings) => {
    return maybeSettings ?? { home: os.homedir() };
  })
  .then((appSettings) => {
    const createContext = createContextCreator({ settings: appSettings });
    const win = createWindow();

    createIPCHandler({ router: appRouter, createContext, windows: [win] });
    return win;
  })
  .catch((reason) => {
    log.error(`Failed to ready: ${reason}`);
  });
