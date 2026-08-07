import { initTRPC } from '@trpc/server';
import { Album, AlbumTagUpdate, AppSettings, CompressedFile } from '../types';
import superjson from 'superjson';
import log from 'electron-log/main';
import {
  moveAlbumToTarget,
  readAlbumFromDir,
  readCachedAlbums,
  readInboxDirectory,
  readOrCreateSettings,
  refreshAlbumCache,
  trashItem,
  updateAlbumMetadata,
  writeAlbumTags,
  writeSettings
} from './backendOps';
import { downloadChosicGenresQueued, fetchChosicGenres, fetchMissingChosicGenres } from './chosicGenreOps';
import { downloadBandcampTagsQueued, fetchBandcampTags, fetchMissingBandcampTags } from './bandcampTagOps';
import { z } from 'zod';
import { addAndPlayAlbums, enqueueAlbums } from './vlcControlOps';
import { extractAndIngestAlbum } from './archiveOps';
import { messageFrom } from './lib/messageFrom';

const t = initTRPC.create({ transformer: superjson });

// Fetches Chosic genres and Bandcamp tags for a freshly extracted album in
// parallel. Each download is independent — a failure in one is logged and
// treated as "no data" rather than propagated, so the other can still
// complete. Writes go through `updateAlbumMetadata`, which serializes the
// read-modify-write cycles to bimm.json so the two results merge instead of
// clobbering each other when both succeed.
const fetchTagsForExtractedAlbum = async (album: Album): Promise<void> => {
  const albumLabel = album.filename;

  const fetchGenres = async (): Promise<void> => {
    let genres: string[];
    try {
      genres = await downloadChosicGenresQueued(album);
    } catch (error) {
      log.error(`[extract] chosic genre fetch failed (${albumLabel})`, messageFrom(error));
      return;
    }

    await updateAlbumMetadata(album.fullpath, (metadata) => ({ ...metadata, spotifyGenres: genres }));
    log.log(`[extract] stored chosic genres (${albumLabel})`, { genres });
  };

  const fetchTags = async (): Promise<void> => {
    let bandcampTags: string[];
    try {
      bandcampTags = await downloadBandcampTagsQueued(album);
    } catch (error) {
      log.error(`[extract] bandcamp tag fetch failed (${albumLabel})`, messageFrom(error));
      return;
    }

    await updateAlbumMetadata(album.fullpath, (metadata) => ({ ...metadata, bandcampTags }));
    log.log(`[extract] stored bandcamp tags (${albumLabel})`, { bandcampTags });
  };

  await Promise.allSettled([fetchGenres(), fetchTags()]);
};
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
      const album = await extractAndIngestAlbum(input);
      if (album == null) {
        return null;
      }

      await fetchTagsForExtractedAlbum(album);

      // Re-read so the returned album reflects any genres/tags just persisted.
      return await readAlbumFromDir(album.fullpath);
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
  }
});

export type AppRouter = typeof appRouter;
