import React from 'react';
import { type AppSettings } from '../../types';
import clsx from 'clsx';
import { DownArrowIcon } from '../../icons/down-arrow';
import { GearIcon } from '../../icons/gear';
import { FolderIcon } from '../../icons/folder';
import { SidePanelItem } from './side-panel-item';

export interface SidePanelProps {
  settings: AppSettings;
  selected: string | undefined;
  setSelected: React.Dispatch<React.SetStateAction<string | undefined>>;
}

export const SidePanel = ({ settings, selected, setSelected }: SidePanelProps) => {
  return (
    <div className="side-panel h-screen w-1/6 bg-[#dfdfdf]">
      {(settings?.directories ?? []).map((directory) => (
        <SidePanelItem
          itemName={directory}
          displayName={directory.replace(settings.home, '~')}
          icon={<FolderIcon className="h-4" />}
          selected={selected}
          setSelected={setSelected}
        />
      ))}

      <SidePanelItem
        itemName="Inbox"
        icon={<DownArrowIcon className="mb-1 h-4" />}
        selected={selected}
        setSelected={setSelected}
        className="mt-4"
      />

      <SidePanelItem
        itemName="Settings"
        icon={<GearIcon className="mb-1 h-4" />}
        selected={selected}
        setSelected={setSelected}
      />
    </div>
  );
};
