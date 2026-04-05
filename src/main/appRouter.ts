import { initTRPC } from '@trpc/server';
import { AppSettings } from '../types';
import superjson from 'superjson';
import { readAlbumDirectories, readOrCreateSettings, writeSettings } from './backendOps';
import { z } from 'zod';

const t = initTRPC.create({ transformer: superjson });
export const appRouter = t.router({
  settings: {
    getSettings: t.procedure.query(async () => {
      return await readOrCreateSettings();
    }),
    writeSettings: t.procedure.input(AppSettings).mutation(async ({ input }) => {
      return await writeSettings(input);
    })
  },
  file: {
    getAlbums: t.procedure.input(z.string().optional()).query(async ({ input }) => {
      const directoryEntries = await readAlbumDirectories(input);
      return directoryEntries.filter((entry) => entry.tracks?.length ?? 0 > 0);
    })
  }
});

export type AppRouter = typeof appRouter;
