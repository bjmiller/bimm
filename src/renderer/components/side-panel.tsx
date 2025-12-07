import React from 'react';
import { type AppSettings } from '../../types';
import clsx from 'clsx';
import { DownArrowIcon } from '../../icons/down-arrow';
import { GearIcon } from '../../icons/gear';
import { FolderIcon } from '../../icons/folder';

export type SidePanelProps = {
  settings: AppSettings;
  selected: string | undefined;
  setSelected: React.Dispatch<React.SetStateAction<string | undefined>>;
};

export const SidePanel = ({ settings, selected, setSelected }: SidePanelProps) => {
  return (
    <div className="side-panel h-screen w-1/6 bg-[#dfdfdf]">
      {(settings?.directories ?? []).map((directory) => (
        <div
          className={clsx(
            'side-panel-item cursor-pointer flex items-center',
            directory === selected ? 'bg-[#b3b3b3]' : ''
          )}
          onClick={() => setSelected(directory)}
        >
          <FolderIcon className="h-4" />
          <div>{directory.replace(settings.home, '~')}</div>
        </div>
      ))}
      <div className={clsx('inbox-link side-panel-item cursor-pointer mt-4 flex items-center')}>
        <DownArrowIcon className="mb-1 h-4" />
        <div>Inbox</div>
      </div>
      <div
        className={clsx(
          'settings-link side-panel-item cursor-pointer flex items-center',
          selected === 'Settings' ? 'bg-[#b3b3b3]' : ''
        )}
        onClick={() => setSelected('Settings')}
      >
        <GearIcon className="mb-1 h-4" />
        <div>Settings</div>
      </div>
    </div>
  );
};
