import { useState } from 'react';
import { useTRPC } from '../lib/trpc';
import { AlbumList } from './albumList';
import { SidePanel } from './sidePanel';
import { Settings } from './settings';
import { useQuery } from '@tanstack/react-query';
import { useAppFocusManagement } from '../lib/focusManagement';

export const Bimm = () => {
  const trpc = useTRPC();
  const settings = useQuery(trpc.settings.getSettings.queryOptions());

  const [selected, setSelected] = useState(settings.data?.directories?.[0]);

  if (selected == null && settings.isSuccess) setSelected(settings.data?.directories?.[0]);
  const albumListSelected = (selected == null || settings.data?.directories?.includes(selected)) ?? true;
  const mainContent = albumListSelected ? 'albumList' : selected === 'Settings' ? 'settings' : 'inbox';
  const {
    albumListPaneRef,
    albumSearchPaneRef,
    clearAlbumListRowFocus,
    focusAlbumListFirstRowRequest,
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
      />
      {albumListSelected && (
        <AlbumList
          clearRowFocus={clearAlbumListRowFocus}
          focusFirstRowRequest={focusAlbumListFirstRowRequest}
          paneRef={albumListPaneRef}
          searchPaneRef={albumSearchPaneRef}
          selected={selected}
          key={selected}
        />
      )}
      {!albumListSelected &&
        {
          Inbox: <div ref={mainPaneRef} className="flex-1 outline-none" tabIndex={0} />,
          Settings: <Settings paneRef={mainPaneRef} />
        }[selected ?? '']}
    </div>
  );
};
