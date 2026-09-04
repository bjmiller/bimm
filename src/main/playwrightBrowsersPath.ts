import { join } from 'node:path';
import { app } from 'electron';

const BUNDLED_BROWSERS_DIRNAME = 'playwright-browsers';

// playwright-core resolves its browser registry directory (from
// `PLAYWRIGHT_BROWSERS_PATH`) when the module first loads, so this must run
// before anything imports `playwright`/`playwright-extra`. `src/index.ts`
// imports this module first for exactly that reason.
if (app.isPackaged) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = join(process.resourcesPath, BUNDLED_BROWSERS_DIRNAME);
}
