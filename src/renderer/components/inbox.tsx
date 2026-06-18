import { useCallback, useMemo, useState, type RefObject } from 'react';
import { useTRPC } from '../lib/trpc';
import { useQuery } from '@tanstack/react-query';
import {
  type SortingState,
  createColumnHelper,
  useReactTable,
  getCoreRowModel,
  getSortedRowModel
} from '@tanstack/react-table';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { AlbumRow } from './albumRow';
import { CompressedFileRow } from './compressedFileRow';
import { ChevronUpIcon } from '../../icons/chevronUp';
import { ChevronDownIcon } from '../../icons/chevronDown';
import { type InboxEntry } from '../../types';
import { useInboxFocusManagement } from '../lib/focusManagement';
import { RowFocus } from '../lib/rowFocus';
import { type Row as AlbumListRow } from './albumList';
dayjs.extend(duration);

interface InboxProps {
  clearRowFocus: boolean;
  focusFirstRowRequest: number;
  inboxDirectory: string | undefined;
  paneRef: RefObject<HTMLDivElement | null>;
}

const columnHelper = createColumnHelper<InboxEntry>();

const calculateRunningtime = (entry: InboxEntry) =>
  entry.kind === 'album' ? (entry.tracks?.reduce((memo, track) => memo + (track?.duration ?? 0), 0) ?? null) : null;

const calculateNumberOfTracks = (entry: InboxEntry) => (entry.kind === 'album' ? (entry.tracks?.length ?? 0) : null);

const columns = [
  columnHelper.accessor('filename', {
    id: 'album',
    header: 'Album'
  }),
  columnHelper.accessor(calculateRunningtime, {
    id: 'runningtime',
    header: 'Time',
    cell: (ctx) => {
      const runningtime = ctx.getValue();
      return runningtime ? dayjs.duration(runningtime, 'seconds').format('HH:mm:ss') : '';
    }
  }),
  columnHelper.accessor(calculateNumberOfTracks, {
    id: 'numberoftracks',
    header: '#',
    cell: (ctx) => ctx.getValue() ?? ''
  }),
  columnHelper.accessor('mtime', {
    id: 'modified',
    header: 'Modified',
    cell: (ctx) => {
      const time = ctx.getValue();
      return time ? dayjs(time).format('YYYY-MM-DD HH:mm') : '';
    }
  })
];

const getRowId = (row: InboxEntry) => row.fullpath;

type InboxRowFocusState = string | undefined;

export const Inbox = (props: InboxProps) => {
  const { clearRowFocus, focusFirstRowRequest, inboxDirectory, paneRef: listRef } = props;
  const trpc = useTRPC();
  const inboxQuery = useQuery(trpc.file.getInbox.queryOptions(inboxDirectory));

  const data = useMemo(() => inboxQuery.data ?? [], [inboxQuery.data]);

  const [sorting, setSorting] = useState<SortingState>([{ id: 'modified', desc: true }]);
  const [rowFocus, setRowFocus] = useState<InboxRowFocusState>(undefined);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    _features: [RowFocus],
    data,
    columns,
    getRowId,
    state: { sorting, rowFocus },
    onSortingChange: setSorting,
    onRowFocusChange: setRowFocus,
    sortDescFirst: true,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const { onPaneMouseDownCapture } = useInboxFocusManagement({
    clearRowFocus,
    data,
    enabled: inboxQuery.isSuccess,
    focusFirstRowRequest,
    listRef,
    rowFocus,
    setRowFocus,
    table
  });

  const rowClickHandler = useCallback(
    (row: AlbumListRow<InboxEntry>) => (clickEvent: React.MouseEvent<HTMLTableRowElement>) => {
      clickEvent.stopPropagation();
      row.setFocused(true);
    },
    []
  );

  if (inboxQuery.isLoading) {
    return (
      <div className="inbox flex flex-row">
        <div className="h-fit">Loading... </div>
        <div className="inline-block h-fit animate-spin">&#57862;</div>
      </div>
    );
  }

  if (inboxQuery.isSuccess) {
    const headers = table.getFlatHeaders();
    const rows = table.getRowModel().rows as AlbumListRow<InboxEntry>[];

    return (
      <div className="inbox flex h-lvh flex-auto flex-col">
        <div
          ref={listRef}
          className="flex-auto overflow-y-scroll outline-none"
          onMouseDownCapture={onPaneMouseDownCapture}
          tabIndex={0}
        >
          <table className="inbox w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                {headers.map((header) => (
                  <th
                    key={header.id}
                    className="bold sticky top-0 z-10 cursor-pointer border-r border-gray-400 bg-[#dfdfdf] p-0.75 px-1.5 pt-1 text-left select-none last:border-r-0"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <span className="inline-flex items-center gap-0.5">
                      {header.column.columnDef.header?.toString()}
                      {header.column.getIsSorted() === 'asc' && <ChevronUpIcon className="size-3" />}
                      {header.column.getIsSorted() === 'desc' && <ChevronDownIcon className="size-3" />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) =>
                row.original.kind === 'compressed' ? (
                  <CompressedFileRow key={row.id} row={row} onClick={rowClickHandler(row)} />
                ) : (
                  <AlbumRow key={row.id} row={row} onClick={rowClickHandler(row)} viewContext="inbox" />
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
};
