import { useState } from 'react';
import { trpcReact } from '../lib/trpc';
import { AlbumList } from './album-list';
import { SidePanel } from './side-panel';

export const Bimm = () => {
  const settings = trpcReact.settings.getSettings.useQuery();

  const [selectedRoot, setSelectedRoot] = useState(settings.data?.directories?.[0]);

  if (selectedRoot == null && settings.isSuccess) setSelectedRoot(settings.data?.directories?.[0]);

  return (
    <div className="w-full h-full flex">
      <SidePanel
        settings={settings.data ?? { home: '' }}
        selectedRoot={selectedRoot}
        setSelectedRoot={setSelectedRoot}
      />
      <AlbumList selectedRoot={selectedRoot} />
    </div>
  );
};
