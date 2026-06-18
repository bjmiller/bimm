import { type InboxEntry } from '../../types';
import { flexRender, type Row as TanStackRow } from '@tanstack/react-table';
import type { MouseEventHandler } from 'react';
import clsx from 'clsx';
import { Cell } from './cell';
import type { RowFocusRow } from '../lib/rowFocus';
import { FileArchiveIcon } from '../../icons/fileArchive';

type Row<TData> = TanStackRow<TData> & RowFocusRow;

export interface CompressedFileRowProps {
  row: Row<InboxEntry>;
  onClick?: MouseEventHandler<HTMLTableRowElement>;
}

const flexById = (row: Row<InboxEntry>, id: string) => {
  const cell = row.getVisibleCells().find((c) => c.column.id === id);
  if (cell == null) return null;
  return flexRender(cell.column.columnDef.cell, cell.getContext()) ?? null;
};

export const CompressedFileRow = (props: CompressedFileRowProps) => {
  const row = props.row;
  return (
    <tr
      key={row.id}
      data-row-id={row.id}
      className={clsx('cursor-default even:bg-[#f4f5f5]', row.getIsFocused() && 'inset-ring-1 inset-ring-orange-400')}
      onClick={props.onClick}
    >
      <Cell flexible>
        <FileArchiveIcon className="inline h-3 align-text-top text-fuchsia-500" /> <span>{flexById(row, 'album')}</span>
      </Cell>
      <Cell>{''}</Cell>
      <Cell className="text-right">{''}</Cell>
      <Cell>{flexById(row, 'modified')}</Cell>
    </tr>
  );
};
