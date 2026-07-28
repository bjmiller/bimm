import { initTRPC } from '@trpc/server';
import { Album, AlbumTagUpdate, AppSettings, CompressedFile } from '../types';
import superjson from 'superjson';
import {
  moveAlbumToTarget,
  readCachedAlbums,
  readInboxDirectory,
  readOrCreateSettings,
  refreshAlbumCache,
  trashItem,
  writeAlbumTags,
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
    // Fresh album list: revalidates against the filesystem (reusing unchanged
    // cached albums) and persists the result back to the cache. TanStack Query
    // dedupes this to one in-flight request per directory.
    getAlbums: t.procedure.input(z.string().optional()).query(async ({ input }) => {
      const albums = await refreshAlbumCache(input);
      return albums.filter((entry) => entry.tracks?.length ?? 0 > 0);
    }),
    // Stale-while-revalidate placeholder: the on-disk cache from the previous
    // run, used by the renderer to paint instantly while getAlbums revalidates.
    getCachedAlbums: t.procedure.input(z.string().optional()).query(async ({ input }) => {
      const cached = await readCachedAlbums(input);
      return cached?.filter((entry) => entry.tracks?.length ?? 0 > 0);
    }),
    getInbox: t.procedure.input(z.string().optional()).query(async ({ input }) => {
      return await readInboxDirectory(input);
    }),
    moveAlbumToTarget: t.procedure.input(Album).mutation(async ({ input }) => {
      return await moveAlbumToTarget(input);
    }),
    // Persists edited tags to the album's bimm.json without disturbing the
    // directory's modified time. Returns the re-read album.
    writeAlbumTags: t.procedure.input(AlbumTagUpdate).mutation(async ({ input }) => {
      return await writeAlbumTags(input);
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
