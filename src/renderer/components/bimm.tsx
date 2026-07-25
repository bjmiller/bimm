import { useEffect, useMemo, useState } from 'react';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { AlbumList, calculateRunningtime } from './albumList';
import { Inbox } from './inbox';
import { SidePanel } from './sidePanel';
import { Settings } from './settings';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppFocusManagement } from '../lib/focusManagement';

export const Bimm = () => {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const settings = useQuery(trpc.settings.getSettings.queryOptions());

  const [selected, setSelected] = useState(settings.data?.directories?.[0]);
  const [selectedRows, setSelectedRows] = useState<Map<string, number>>(new Map());

  // Seed the getAlbums query's cache from the on-disk cache before it mounts.
  // Seeding with a backdated dataUpdatedAt makes the data immediately stale,
  // so React Query renders it right away AND refetches (the full scan) in the
  // background — giving a fast first render followed by a rerender on fresh data.
  useEffect(() => {
    if (selected == null) {
      return;
    }
    const albumsQueryKey = trpc.file.getAlbums.queryKey(selected);
    // Respect data that's already fresh in memory for this directory.
    const existing = queryClient.getQueryState(albumsQueryKey);
    if (existing != null && existing.dataUpdatedAt > 0) {
      return;
    }
    let cancelled = false;
    void trpcClient.file.getCachedAlbums.query(selected).then((cached) => {
      if (cancelled || cached == null) {
        return;
      }
      // Don't clobber data the real fetch may have already delivered.
      const currentQueryState = queryClient.getQueryState(albumsQueryKey);
      if (currentQueryState != null && currentQueryState.dataUpdatedAt > 0) {
        return;
      }
      // Backdate so the data is stale -> triggers an immediate background refetch.
      queryClient.setQueryData(albumsQueryKey, cached, { updatedAt: 0 });
    });
    return () => {
      cancelled = true;
    };
  }, [selected, trpc, trpcClient, queryClient]);

  // Reset the selection whenever the album list changes (different directory or
  // remount), so the running-time indicator never reflects stale selections.
  const [prevSelected, setPrevSelected] = useState(selected);
  if (prevSelected !== selected) {
    setPrevSelected(selected);
    setSelectedRows(new Map());
  }

  if (selected == null && settings.isSuccess) setSelected(settings.data?.directories?.[0]);
  const albumListSelected = (selected == null || settings.data?.directories?.includes(selected)) ?? true;

  // The single album-list query for the selected directory. Its cache is
  // seeded from disk (above) as stale data, so it renders instantly and then
  // refetches the full scan in the background, rerendering when fresh data
  // lands. TanStack Query dedupes concurrent mounts to one in-flight fetch.
  const albumsQuery = useQuery(trpc.file.getAlbums.queryOptions(selected));
  const albumsData = useMemo(
    () => albumsQuery.data?.filter((album) => album.tracks?.length !== 0) ?? [],
    [albumsQuery.data]
  );

  const selectedRunningTime = useMemo(() => {
    if (!albumsData || selectedRows.size === 0) return 0;
    let total = 0;
    for (const id of selectedRows.keys()) {
      const album = albumsData.find((a) => a.filename === id);
      if (album == null) continue;
      const t = calculateRunningtime(album);
      if (t != null) total += t;
    }
    return total;
  }, [albumsData, selectedRows]);
  const mainContent = albumListSelected ? 'albumList' : selected === 'Settings' ? 'settings' : 'inbox';
  const {
    albumListPaneRef,
    albumSearchPaneRef,
    clearAlbumListRowFocus,
    clearInboxRowFocus,
    focusAlbumListFirstRowRequest,
    focusInboxFirstRowRequest,
    inboxPaneRef,
    mainPaneRef,
    onRootBlurCapture,
    onRootFocusCapture,
    sidePanelRef
  } = useAppFocusManagement({ mainContent });

  return (
    <div className="bimm flex h-full w-full" onBlurCapture={onRootBlurCapture} onFocusCapture={onRootFocusCapture}>
      <SidePanel
        paneRef={sidePanelRef}
        settings={settings.data ?? { home: '' }}
        selected={selected}
        setSelected={setSelected}
        selectedRunningTime={albumListSelected ? selectedRunningTime : 0}
        selectedCount={albumListSelected ? selectedRows.size : 0}
      />
      {albumListSelected && (
        <AlbumList
          clearRowFocus={clearAlbumListRowFocus}
          focusFirstRowRequest={focusAlbumListFirstRowRequest}
          paneRef={albumListPaneRef}
          searchPaneRef={albumSearchPaneRef}
          selected={selected}
          selectedRows={selectedRows}
          onSelectedRowsChange={setSelectedRows}
          key={selected}
        />
      )}
      {!albumListSelected &&
        {
          Inbox: (
            <Inbox
              clearRowFocus={clearInboxRowFocus}
              focusFirstRowRequest={focusInboxFirstRowRequest}
              inboxDirectory={settings.data?.inbox}
              paneRef={inboxPaneRef}
              key="Inbox"
            />
          ),
          Settings: <Settings paneRef={mainPaneRef} />
        }[selected ?? '']}
    </div>
  );
};
