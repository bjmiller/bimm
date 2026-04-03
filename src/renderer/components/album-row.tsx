import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { type Entry } from '../../types';
import { flexRender, type Row } from '@tanstack/react-table';
import { Cell } from './cell';
dayjs.extend(duration);

export interface AlbumRowProps {
  row: Row<Entry>;
  onClick?: (event: unknown) => void;
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
      className={`cursor-default ${selected} inset-ring-orange-400 hover:inset-ring-1`}
      onClick={props.onClick}
    >
      <Cell flexible>{flexById(row, 'album')}</Cell>
      <Cell>{flexById(row, 'runningtime')}</Cell>
      <Cell className="text-right">{flexById(row, 'numberoftracks')}</Cell>
      <Cell>{flexById(row, 'modified')}</Cell>
    </tr>
  );
};
