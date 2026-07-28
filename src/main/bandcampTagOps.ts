import PQueue from 'p-queue';
import log from 'electron-log/main.js';
import { BandcampAlbumDetails, BandcampSearch, type Album } from '../types';
import { messageFrom } from './lib/messageFrom';
import { readAlbumMetadata, writeAlbumMetadata } from './backendOps';

const BANDCAMP_QUEUE_CONCURRENCY = 1;
const BANDCAMP_QUEUE_INTERVAL_CAP = 3;
const BANDCAMP_QUEUE_INTERVAL = 1000;

const bandcampQueue = new PQueue({
  concurrency: BANDCAMP_QUEUE_CONCURRENCY,
  intervalCap: BANDCAMP_QUEUE_INTERVAL_CAP,
  interval: BANDCAMP_QUEUE_INTERVAL,
  strict: true
});

const writeBandcampTags = async (albumPath: string, bandcampTags: string[]) => {
  const metadata = await readAlbumMetadata(albumPath);

  await writeAlbumMetadata(albumPath, {
    ...metadata,
    bandcampTags
  });
};

const BANDCAMP_SEARCH_URL = 'https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic';
const getApiUrlForAlbum = (options: { tralbum_id: number; band_id: number }) =>
  `https://bandcamp.com/api/mobile/25/tralbum_details?band_id=${options.band_id}&tralbum_id=${options.tralbum_id}&tralbum_type=a`;

const fetchBandcampTagsForAlbum = async (album: Album) => {
  const firstTrack = album.tracks[0];
  if (firstTrack == null) {
    return [] as string[];
  }
  try {
    // fetch search results
    const { artist, albumTitle } = firstTrack;
    const search_text = `${artist} - ${albumTitle}`;

    const body = JSON.stringify({ full_page: 'false', search_filter: '', search_text });
    const searchResponse = await fetch(BANDCAMP_SEARCH_URL, { method: 'POST', body });

    let bandcampTags: string[] = [];

    try {
      // parse search results
      const search = BandcampSearch.parse(await searchResponse.json());

      const matchingAlbums = search.auto.results.filter((result) => {
        return (
          result.type === 'a' &&
          result.band_name.toLowerCase() === artist?.toLowerCase() &&
          result.name.toLowerCase() === albumTitle?.toLowerCase()
        );
      });

      for (const matchingAlbum of matchingAlbums) {
        try {
          // fetch album info
          const albumUrl = getApiUrlForAlbum({ tralbum_id: matchingAlbum.id, band_id: matchingAlbum.band_id });
          // eslint-disable-next-line no-await-in-loop
          const albumResponse = await fetch(albumUrl);
          try {
            // eslint-disable-next-line no-await-in-loop
            const albumDetails = BandcampAlbumDetails.parse(await albumResponse.json());
            bandcampTags = [
              ...bandcampTags,
              ...(albumDetails.tags?.filter((tag) => tag.isloc === false).map((tag) => tag.name.toLowerCase()) ?? [])
            ];
          } catch (parseError) {
            log.error('BandcampAlbumDetails parse failure', messageFrom(parseError));
            throw parseError;
          }
        } catch (fetchAlbumError) {
          // fetch album failed
          log.error(`Failed to fetch album record for "${matchingAlbum.album_name}"`, messageFrom(fetchAlbumError));
          throw fetchAlbumError;
        }
      }
    } catch (parseError) {
      log.error("BandcampSearch response structure didn't validate", messageFrom(parseError));
      throw parseError;
    }

    return bandcampTags;
  } catch (fetchSearchError) {
    // search failed
    log.error('Failed to fetch Bandcamp search', messageFrom(fetchSearchError));
    return [];
  }
};

export const fetchBandcampTags = (album: Album): Promise<string[]> => {
  return bandcampQueue.add(() => fetchBandcampTagsUnqueued(album));
};

const fetchBandcampTagsUnqueued = async (album: Album): Promise<string[]> => {
  const albumLabel = album.filename;
  log.log(`[bandcamp] fetching tags (${albumLabel})`);
  let tags: string[];

  try {
    tags = await fetchBandcampTagsForAlbum(album);
  } catch (error) {
    log.error(`[bandcamp] fetch failed (${albumLabel})`, {
      album: album.filename,
      error: messageFrom(error)
    });
    return [];
  }

  try {
    await writeBandcampTags(album.fullpath, tags);
  } catch (error) {
    log.error(`[bandcamp] failed to persist tags (${albumLabel})`, {
      album: album.filename,
      error: messageFrom(error),
      tags
    });
    return [];
  }

  log.log(`[bandcamp] fetched tags (${albumLabel})`, {
    album: album.filename,
    tags
  });
  return tags;
};

export const fetchMissingBandcampTags = async (albums: Album[]) => {
  let skipped = 0;
  let processed = 0;

  log.log('[bandcamp] starting visible album batch fetch', { total: albums.length });

  const tasks: Promise<void>[] = [];

  for (const album of albums) {
    // eslint-disable-next-line no-await-in-loop
    const metadata = await readAlbumMetadata(album.fullpath);

    if (Object.hasOwn(metadata, 'bandcampTags')) {
      skipped += 1;
      continue;
    }

    processed += 1;
    tasks.push(bandcampQueue.add(() => fetchBandcampTagsUnqueued(album).then(() => undefined)));
  }

  await Promise.all(tasks);

  log.log('[bandcamp] completed visible album batch fetch', {
    total: albums.length,
    skipped,
    processed
  });

  return { skipped, processed };
};
