import { useTRPC } from '../lib/trpc';
import { useQuery } from '@tanstack/react-query';
import {
  type SortingState,
  createColumnHelper,
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getExpandedRowModel,
  type RowSelectionState,
  type Row as TanStackRow
} from '@tanstack/react-table';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { AlbumRow } from './albumRow';
import { ChevronUpIcon } from '../../icons/chevronUp';
import { ChevronDownIcon } from '../../icons/chevronDown';
import { type Entry } from '../../types';
import { useCallback, useMemo, useRef, useState } from 'react';
import { RowFocus } from '../lib/rowFocus';
import { useRowFocusNavigation } from '../lib/useRowFocusNavigation';
dayjs.extend(duration);

interface AlbumListProps {
  selected: string | undefined;
}

const columnHelper = createColumnHelper<Entry>();

const runningtimeAccessorFn = (entry: Entry) =>
  entry.tracks?.reduce((memo, track) => memo + (track?.duration ?? 0), 0) ?? null;

const numberOfTracksAccessorFn = (entry: Entry) => entry.tracks?.length ?? 0;

const columns = [
  columnHelper.accessor('filename', {
    id: 'album',
    header: 'Album'
  }),
  columnHelper.accessor(runningtimeAccessorFn, {
    id: 'runningtime',
    header: 'Time',
    cell: (ctx) => {
      const runningtime = ctx.getValue();
      return runningtime ? dayjs.duration(runningtime, 'seconds').format('HH:mm:ss') : '';
    }
  }),
  columnHelper.accessor(numberOfTracksAccessorFn, {
    id: 'numberoftracks',
    header: '#'
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

const getRowId = (row: Entry) => row.filename;

const isMac = (globalThis.navigator?.platform ?? '').toLowerCase().includes('mac');
type AlbumListRowFocusState = string | undefined;
type Row<TData> = TanStackRow<TData> & {
  setFocused: (value?: boolean) => void;
};

export const AlbumList = (props: AlbumListProps) => {
  const { selected } = props;
  const trpc = useTRPC();
  const albumsQuery = useQuery(trpc.file.getAlbums.queryOptions(selected));

  const data = useMemo(() => albumsQuery.data?.filter((entry) => entry.tracks?.length !== 0) ?? [], [albumsQuery.data]);

  const [sorting, setSorting] = useState<SortingState>([{ id: 'modified', desc: true }]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [rowFocus, setRowFocus] = useState<AlbumListRowFocusState>(undefined);
  const listRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    _features: [RowFocus],
    data,
    columns,
    getRowId,
    state: { sorting, rowSelection, rowFocus },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onRowFocusChange: setRowFocus,
    sortDescFirst: true,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel()
  });

  useRowFocusNavigation({
    data,
    enabled: albumsQuery.isSuccess,
    listRef,
    rowFocus,
    table
  });

  const rowClickHandler = useCallback(
    (row: Row<Entry>) => (clickEvent: React.MouseEvent<HTMLTableRowElement>) => {
      const additiveSelection = isMac ? clickEvent.metaKey : clickEvent.ctrlKey;

      row.setFocused(true);

      if (!additiveSelection) {
        table.resetRowSelection(true);
      }

      row.toggleSelected();
    },
    [table]
  );

  if (albumsQuery.isLoading) {
    return (
      <div className="album-list flex flex-row">
        <div className="h-fit">Loading... </div>
        <div className="inline-block h-fit animate-spin">&#57862;</div>
      </div>
    );
  }
  if (albumsQuery.isSuccess) {
    const headers = table.getFlatHeaders();
    const rows = table.getRowModel().rows as Row<Entry>[];

    return (
      <div
        ref={listRef}
        className="album-list h-lvh flex-auto overflow-y-scroll outline-none"
        onMouseDownCapture={() => listRef.current?.focus({ preventScroll: true })}
        tabIndex={0}
      >
        <table className="album-list w-full border-collapse text-xs">
          <thead className="divide-x divide-solid">
            {headers.map((header) => (
              <th
                className="bold cursor-pointer border-gray-400 bg-[#dfdfdf] p-0.75 px-1.5 pt-1 text-left select-none"
                onClick={header.column.getToggleSortingHandler()}
              >
                <span className="inline-flex items-center gap-0.5">
                  {header.column.columnDef.header?.toString()}
                  {header.column.getIsSorted() === 'asc' && <ChevronUpIcon className="size-3" />}
                  {header.column.getIsSorted() === 'desc' && <ChevronDownIcon className="size-3" />}
                </span>
              </th>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <AlbumRow row={row} onClick={rowClickHandler(row)} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }
};
