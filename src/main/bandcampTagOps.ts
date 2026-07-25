import log from 'electron-log/main.js';
import { BandcampAlbumDetails, BandcampSearch, type Album } from '../types';
import { messageFrom } from './lib/messageFrom';

const BANDCAMP_SEARCH_URL = 'https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic';
const getApiUrlForAlbum = (options: { tralbum_id: number; band_id: number }) =>
  `https://bandcamp.com/api/mobile/25/tralbum_details?band_id=${options.band_id}&tralbum_id=${options.tralbum_id}&tralbum_type=a`;

export const fetchBandcampTags = async (album: Album) => {
  const firstTrack = album.tracks[0];
  if (firstTrack == null) {
    return [] as string[];
  }
  try {
    // fetch search results
    const { artist, title, albumTitle } = firstTrack;
    const search_text = `${artist} - ${albumTitle}`;

    const body = new URLSearchParams({ full_page: 'false', search_filter: '', search_text });
    const searchResponse = await fetch(BANDCAMP_SEARCH_URL, { method: 'POST', body });

    let bandcampTags: string[] = [];

    try {
      // parse search results
      const search = BandcampSearch.parse(await searchResponse.json());

      const matchingAlbums = search.auto.results.filter(
        (result) =>
          result.type === 'a' &&
          result.band_name.toLowerCase() === artist?.toLowerCase() &&
          result.album_name?.toLowerCase() === title?.toLowerCase()
      );

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
              ...(albumDetails.tags?.filter((tag) => tag.isloc === false).map((tag) => tag.name) ?? [])
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
