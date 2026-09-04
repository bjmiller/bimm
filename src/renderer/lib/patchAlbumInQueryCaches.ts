import { type QueryClient } from '@tanstack/react-query';
import { type Album, type AlbumMetadata, type InboxEntry } from '../../types';

// A tag field cleared in the editor comes back absent from the re-read album,
// and a spread merge can't delete a key — copy the tag fields verbatim
// (undefined included) or the stale list survives in the cached entry.
const TAG_FIELDS: Array<keyof AlbumMetadata> = ['manualTags', 'spotifyGenres', 'bandcampTags'];

// Swap an updated album into every cached album/inbox list (matched by
// fullpath) so the row re-renders with the new tags immediately, without
// waiting on a background refetch. Touched only where the album is already
// present — lists that don't contain it are left alone.
export const patchAlbumInQueryCaches = (
  queryClient: QueryClient,
  pathKeys: { albums: unknown[]; inbox: unknown[] },
  updatedAlbum: Album
): void => {
  const tagOverrides = Object.fromEntries(TAG_FIELDS.map((field) => [field, updatedAlbum[field]]));

  const patchEntries = <T extends { fullpath: string }>(entries: T[] | undefined): T[] | undefined =>
    entries?.map((entry) =>
      entry.fullpath === updatedAlbum.fullpath ? { ...entry, ...updatedAlbum, ...tagOverrides } : entry
    );

  queryClient.setQueriesData<Album[]>({ queryKey: pathKeys.albums }, patchEntries);
  queryClient.setQueriesData<InboxEntry[]>({ queryKey: pathKeys.inbox }, patchEntries);
};
