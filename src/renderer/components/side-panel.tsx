import React from 'react';
import { type AppSettings } from '../../types';
import clsx from 'clsx';

export type SidePanelProps = {
  settings: AppSettings;
  selectedRoot: string | undefined;
  setSelectedRoot: React.Dispatch<React.SetStateAction<string | undefined>>;
};

export const SidePanel = ({ settings, selectedRoot, setSelectedRoot }: SidePanelProps) => {
  return (
    <div className="side-panel h-screen w-1/6 bg-[#dfdfdf]">
      {(settings?.directories ?? []).map((directory) => (
        <div
          className={clsx('side-panel-content cursor-pointer', directory === selectedRoot ? 'bg-[#b3b3b3]' : '')}
          onClick={() => setSelectedRoot(directory)}
        >
          {directory.replace(settings.home, '~')}
        </div>
      ))}
    </div>
  );
};
