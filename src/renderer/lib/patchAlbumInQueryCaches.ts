import { type QueryClient } from '@tanstack/react-query';
import { type Album, type InboxEntry } from '../../types';

// Swap an updated album into every cached album/inbox list (matched by
// fullpath) so the row re-renders with the new tags immediately, without
// waiting on a background refetch. Touched only where the album is already
// present — lists that don't contain it are left alone.
export const patchAlbumInQueryCaches = (
  queryClient: QueryClient,
  pathKeys: { albums: unknown[]; inbox: unknown[] },
  updatedAlbum: Album
): void => {
  const patchEntries = <T extends { fullpath: string }>(entries: T[] | undefined): T[] | undefined =>
    entries?.map((entry) => (entry.fullpath === updatedAlbum.fullpath ? { ...entry, ...updatedAlbum } : entry));

  queryClient.setQueriesData<Album[]>({ queryKey: pathKeys.albums }, patchEntries);
  queryClient.setQueriesData<InboxEntry[]>({ queryKey: pathKeys.inbox }, patchEntries);
};
