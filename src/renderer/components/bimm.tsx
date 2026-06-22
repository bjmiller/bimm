import { useMemo, useState } from 'react';
import { useTRPC } from '../lib/trpc';
import { AlbumList, calculateRunningtime } from './albumList';
import { Inbox } from './inbox';
import { SidePanel } from './sidePanel';
import { Settings } from './settings';
import { useQuery } from '@tanstack/react-query';
import { useAppFocusManagement } from '../lib/focusManagement';

export const Bimm = () => {
  const trpc = useTRPC();
  const settings = useQuery(trpc.settings.getSettings.queryOptions());

  const [selected, setSelected] = useState(settings.data?.directories?.[0]);
  const [selectedRows, setSelectedRows] = useState<Map<string, number>>(new Map());

  if (selected == null && settings.isSuccess) setSelected(settings.data?.directories?.[0]);
  const albumListSelected = (selected == null || settings.data?.directories?.includes(selected)) ?? true;

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
