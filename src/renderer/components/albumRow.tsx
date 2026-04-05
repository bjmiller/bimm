import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { type Entry } from '../../types';
import { flexRender, type Row as TanStackRow } from '@tanstack/react-table';
import type { MouseEventHandler } from 'react';
import clsx from 'clsx';
import { Cell } from './cell';
import type { RowFocusRow } from '../lib/rowFocus';
dayjs.extend(duration);

type Row<TData> = TanStackRow<TData> & RowFocusRow;

export interface AlbumRowProps {
  row: Row<Entry>;
  onClick?: MouseEventHandler<HTMLTableRowElement>;
}

const flexById = (row: Row<Entry>, id: string) => {
  const cell = row.getVisibleCells().find((c) => c.column.id === id);
  if (cell == null) return null;
  return flexRender(cell.column.columnDef.cell, cell.getContext()) ?? null;
};

export const AlbumRow = (props: AlbumRowProps) => {
  const row = props.row;
  const selected = row.getIsSelected() ? 'bg-blue-200' : 'even:bg-[#f4f5f5]';
  return (
    <tr
      key={row.id}
      data-row-id={row.id}
      className={clsx('cursor-default', selected, row.getIsFocused() && 'inset-ring-1 inset-ring-orange-400')}
      onClick={props.onClick}
    >
      <Cell flexible>{flexById(row, 'album')}</Cell>
      <Cell>{flexById(row, 'runningtime')}</Cell>
      <Cell className="text-right">{flexById(row, 'numberoftracks')}</Cell>
      <Cell>{flexById(row, 'modified')}</Cell>
    </tr>
  );
};
