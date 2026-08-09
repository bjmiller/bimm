import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { type Album } from '../../types';
import { flexRender, type RowData } from '@tanstack/react-table';
import { type MouseEventHandler } from 'react';
import clsx from 'clsx';
import { Cell } from './cell';
import type { FocusableRow } from '../lib/tableTypes';
import { FolderIcon } from '../../icons/folder';
import { Genre } from './genre';
import { sortGenresByRelevance } from '../lib/genreRelevance';
dayjs.extend(duration);

type Row<TData extends RowData> = FocusableRow<TData>;

export interface AlbumRowProps<TData extends Album> {
  row: Row<TData>;
  onClick?: MouseEventHandler<HTMLTableRowElement>;
  viewContext: 'inbox' | 'album-list';
  disabled?: boolean;
}

const flexById = <TData extends RowData>(row: Row<TData>, id: string) => {
  const cell = row.getVisibleCells().find((c) => c.column.id === id);
  if (cell == null) return null;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- the structural row type loosens cell rendering to `any`.
  return flexRender(cell.column.columnDef.cell, cell.getContext()) ?? null;
};

export const AlbumRow = <TData extends Album>(props: AlbumRowProps<TData>) => {
  const row = props.row;
  const album = props.row.original;
  const genres = sortGenresByRelevance(album);
  const viewContext = props.viewContext;
  const selected = row.getIsSelected?.() ? 'bg-blue-200' : 'even:bg-[#f4f5f5]';
  return (
    <tr
      key={row.id}
      data-row-id={row.id}
      className={clsx(
        'cursor-default',
        selected,
        row.getIsFocused() && 'inset-ring-1 inset-ring-orange-400',
        props.disabled && 'opacity-50'
      )}
      onClick={props.disabled ? undefined : props.onClick}
    >
      <Cell flexible>
        {viewContext === 'inbox' ? <FolderIcon className="inline h-3 align-text-top text-amber-400" /> : null}{' '}
        <span className="mr-2.5">{flexById(row, 'album')}</span>
        {genres.map((genre) => (
          <Genre>{genre}</Genre>
        ))}
      </Cell>
      <Cell>{flexById(row, 'runningtime')}</Cell>
      <Cell className="text-right">{flexById(row, 'numberoftracks')}</Cell>
      <Cell>{flexById(row, 'modified')}</Cell>
    </tr>
  );
};
