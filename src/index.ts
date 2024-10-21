import { app, BrowserWindow } from 'electron';
import log from 'electron-log/main';

log.transports.file.level = false;
log.initialize();

const createWindow = () => {
  const win = new BrowserWindow({
    webPreferences: {
      nodeIntegration: true,
      nodeIntegrationInWorker: true
    },
    icon: `${__dirname}/icons/musical-note-512.png`
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
  .then(() => {
    const win = createWindow();
    return win;
  })
  .catch((reason) => {
    log.error(`Failed to ready: ${reason}`);
  });
