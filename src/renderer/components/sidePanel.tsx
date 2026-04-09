import React, { type RefObject } from 'react';
import { type AppSettings } from '../../types';
import { DownArrowIcon } from '../../icons/downArrow';
import { GearIcon } from '../../icons/gear';
import { FolderIcon } from '../../icons/folder';
import { useSidePanelFocusManagement } from '../lib/focusManagement';
import { SidePanelItem } from './sidePanelItem';

export interface SidePanelProps {
  paneRef: RefObject<HTMLDivElement | null>;
  settings: AppSettings;
  selected: string | undefined;
  setSelected: React.Dispatch<React.SetStateAction<string | undefined>>;
}

export const SidePanel = ({ paneRef, settings, selected, setSelected }: SidePanelProps) => {
  const { onPaneMouseDownCapture } = useSidePanelFocusManagement({ paneRef });

  return (
    <div ref={paneRef} className="side-panel h-screen w-1/6 bg-[#dfdfdf]" onMouseDownCapture={onPaneMouseDownCapture}>
      {(settings?.directories ?? []).map((directory) => (
        <SidePanelItem
          key={directory}
          itemName={directory}
          displayName={directory.replace(settings.home, '~')}
          icon={<FolderIcon className="h-4" />}
          selected={selected}
          setSelected={setSelected}
        />
      ))}

      <SidePanelItem
        key="Inbox"
        itemName="Inbox"
        icon={<DownArrowIcon className="mb-1 h-4" />}
        selected={selected}
        setSelected={setSelected}
        className="mt-4"
      />

      <SidePanelItem
        key="Settings"
        itemName="Settings"
        icon={<GearIcon className="mb-1 h-4" />}
        selected={selected}
        setSelected={setSelected}
      />
    </div>
  );
};
