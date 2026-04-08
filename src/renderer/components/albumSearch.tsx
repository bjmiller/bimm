import { type Table } from '@tanstack/react-table';
import { type RefObject } from 'react';
import { type Entry } from '../../types';

interface AlbumSearchProps {
  paneRef: RefObject<HTMLDivElement | null>;
  table: Table<Entry>;
}

export const AlbumSearch = ({ paneRef }: AlbumSearchProps) => {
  return (
    <div ref={paneRef} className="album-search border-t bg-[#dfdfdf]">
      <input
        type="text"
        className="m-1 w-[99%] rounded-xs border bg-white p-1 caret-orange-600 focus-visible:outline-none"
        spellCheck="false"
      />
    </div>
  );
};
