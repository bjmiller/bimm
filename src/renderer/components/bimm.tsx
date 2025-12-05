import { useState } from 'react';
import { trpcReact } from '../lib/trpc';
import { AlbumList } from './album-list';
import { SidePanel } from './side-panel';

export const Bimm = () => {
  const settings = trpcReact.settings.getSettings.useQuery();

  const [selected, setSelected] = useState(settings.data?.directories?.[0]);

  if (selected == null && settings.isSuccess) setSelected(settings.data?.directories?.[0]);

  return (
    <div className="w-full h-full flex">
      <SidePanel settings={settings.data ?? { home: '' }} selected={selected} setSelected={setSelected} />
      <AlbumList selectedRoot={selected} />
    </div>
  );
};
