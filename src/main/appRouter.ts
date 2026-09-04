import { initTRPC } from '@trpc/server';
import { Album, AlbumTagUpdate, AppSettings, CompressedFile } from '../types';
import superjson from 'superjson';
import {
  moveAlbumToTarget,
  readAlbumFromDir,
  readCachedAlbums,
  readInboxDirectory,
  readOrCreateSettings,
  refreshAlbumCache,
  trashItem,
  writeAlbumTags,
  writeSettings
} from './backendOps';
import { fetchChosicGenres, fetchMissingChosicGenres } from './chosicGenreOps';
import { fetchBandcampTags, fetchMissingBandcampTags } from './bandcampTagOps';
import { z } from 'zod';
import { addAndPlayAlbums, enqueueAlbums } from './vlcControlOps';
import { extractAndIngestAlbum } from './archiveOps';
import { createMainLogStream, recentMainLogs } from './logBroadcaster';

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
    // Extraction only — playing the ingested album needs nothing more than the
    // audio files on disk. Genre/tag fetching is deliberately kept out of this
    // mutation: the renderer kicks those off in the background (via
    // web.getSpotifyGenres / web.getBandcampTags) without delaying playback.
    extractAndIngest: t.procedure.input(CompressedFile).mutation(async ({ input }) => {
      return await extractAndIngestAlbum(input);
    })
  },
  web: {
    // Fetches and persists genres, then returns the re-read album so the
    // renderer can swap it into its cache and re-render the row immediately.
    obtainSpotifyGenres: t.procedure.input(Album).query(async ({ input }) => {
      await fetchChosicGenres(input);
      return await readAlbumFromDir(input.fullpath);
    }),
    getSpotifyGenres: t.procedure.input(z.array(Album)).mutation(async ({ input }) => {
      return await fetchMissingChosicGenres(input);
    }),
    // Fetches and persists tags, then returns the re-read album (same
    // immediate-update contract as obtainSpotifyGenres).
    obtainBandcampTags: t.procedure.input(Album).query(async ({ input }) => {
      await fetchBandcampTags(input);
      return await readAlbumFromDir(input.fullpath);
    }),
    getBandcampTags: t.procedure.input(z.array(Album)).mutation(async ({ input }) => {
      return await fetchMissingBandcampTags(input);
    })
  },
  vlc: {
    addAndPlayAlbums: t.procedure.input(z.array(Album)).mutation(async ({ input }) => {
      return await addAndPlayAlbums(input);
    }),
    addAlbumToQueue: t.procedure.input(z.array(Album)).mutation(async ({ input }) => {
      return await enqueueAlbums(input);
    })
  },
  logs: {
    // Live feed of main-process log entries. trpc-electron pushes each value
    // the generator yields to the subscribed renderer over its IPC channel.
    onLog: t.procedure.subscription(async function* onLog() {
      yield* createMainLogStream();
    }),
    // Backfill for lines emitted before the renderer's subscription connected.
    getRecent: t.procedure.query(() => recentMainLogs())
  }
});

export type AppRouter = typeof appRouter;
