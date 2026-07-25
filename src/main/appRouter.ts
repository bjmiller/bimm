import { initTRPC } from '@trpc/server';
import { Album, AppSettings, CompressedFile } from '../types';
import superjson from 'superjson';
import {
  moveAlbumToTarget,
  readAlbumDirectories,
  readInboxDirectory,
  readOrCreateSettings,
  trashItem,
  writeSettings
} from './backendOps';
import { fetchChosicGenres, fetchMissingChosicGenres } from './chosicGenreOps';
import { z } from 'zod';
import { addAndPlayAlbums } from './vlcControlOps';
import { extractAndIngestAlbum } from './archiveOps';

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
    }),
    getInbox: t.procedure.input(z.string().optional()).query(async ({ input }) => {
      return await readInboxDirectory(input);
    }),
    moveAlbumToTarget: t.procedure.input(Album).mutation(async ({ input }) => {
      return await moveAlbumToTarget(input);
    }),
    trashItem: t.procedure.input(z.string()).mutation(async ({ input }) => {
      return await trashItem(input);
    })
  },
  archive: {
    extractAndIngest: t.procedure.input(CompressedFile).mutation(async ({ input }) => {
      return await extractAndIngestAlbum(input);
    })
  },
  web: {
    obtainSpotifyGenres: t.procedure.input(Album).query(async ({ input }) => {
      return await fetchChosicGenres(input);
    }),
    getSpotifyGenres: t.procedure.input(z.array(Album)).mutation(async ({ input }) => {
      return await fetchMissingChosicGenres(input);
    })
  },
  vlc: {
    addAndPlayAlbums: t.procedure.input(z.array(Album)).mutation(async ({ input }) => {
      return await addAndPlayAlbums(input);
    })
  }
});

export type AppRouter = typeof appRouter;
