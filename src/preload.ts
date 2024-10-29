import { exposeElectronTRPC } from 'trpc-electron/main';

// eslint-disable-next-line @typescript-eslint/no-misused-promises, require-await
process.once('loaded', async () => {
  exposeElectronTRPC();
});
