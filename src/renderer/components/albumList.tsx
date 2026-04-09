import { useCallback, useMemo, useState, type RefObject } from 'react';
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
import { type SearchParserResult } from 'search-query-parser';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { AlbumRow } from './albumRow';
import { ChevronUpIcon } from '../../icons/chevronUp';
import { ChevronDownIcon } from '../../icons/chevronDown';
import { type Album } from '../../types';
import { useAlbumListFocusManagement } from '../lib/focusManagement';
import { RowFocus } from '../lib/rowFocus';
import { AlbumSearch } from './albumSearch';
import { searchFilter } from '../lib/searchFilter';
dayjs.extend(duration);

interface AlbumListProps {
  clearRowFocus: boolean;
  focusFirstRowRequest: number;
  paneRef: RefObject<HTMLDivElement | null>;
  searchPaneRef: RefObject<HTMLDivElement | null>;
  selected: string | undefined;
}

const columnHelper = createColumnHelper<Album>();

export const calculateRunningtime = (album: Album) =>
  album.tracks?.reduce((memo, track) => memo + (track?.duration ?? 0), 0) ?? null;

const calculateNumberOfTracks = (album: Album) => album.tracks?.length ?? 0;

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

const getRowId = (row: Album) => row.filename;

const isMac = (globalThis.navigator?.platform ?? '').toLowerCase().includes('mac');
type AlbumListRowFocusState = string | undefined;
export type Row<TData> = TanStackRow<TData> & {
  setFocused: (value?: boolean) => void;
};

export const AlbumList = (props: AlbumListProps) => {
  const { clearRowFocus, focusFirstRowRequest, paneRef: listRef, searchPaneRef, selected } = props;
  const trpc = useTRPC();
  const albumsQuery = useQuery(trpc.file.getAlbums.queryOptions(selected));

  const data = useMemo(() => albumsQuery.data?.filter((album) => album.tracks?.length !== 0) ?? [], [albumsQuery.data]);

  const [sorting, setSorting] = useState<SortingState>([{ id: 'modified', desc: true }]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [rowFocus, setRowFocus] = useState<AlbumListRowFocusState>(undefined);
  const [globalFilter, setGlobalFilter] = useState<SearchParserResult>({ offsets: [], exclude: {} });

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    _features: [RowFocus],
    data,
    columns,
    getRowId,
    state: { sorting, rowSelection, rowFocus, globalFilter },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onRowFocusChange: setRowFocus,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: searchFilter,
    sortDescFirst: true,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel()
  });

  const { onPaneMouseDownCapture } = useAlbumListFocusManagement({
    clearRowFocus,
    data,
    enabled: albumsQuery.isSuccess,
    focusFirstRowRequest,
    listRef,
    rowFocus,
    setRowFocus,
    table
  });

  const rowClickHandler = useCallback(
    (row: Row<Album>) => (clickEvent: React.MouseEvent<HTMLTableRowElement>) => {
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
    const rows = table.getRowModel().rows as Row<Album>[];

    return (
      <div className="album-list flex h-lvh flex-auto flex-col">
        <div
          ref={listRef}
          className="flex-auto overflow-y-scroll outline-none"
          onMouseDownCapture={onPaneMouseDownCapture}
          tabIndex={0}
        >
          <table className="album-list w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                {headers.map((header) => (
                  <th
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
              {rows.map((row) => (
                <AlbumRow row={row} onClick={rowClickHandler(row)} />
              ))}
            </tbody>
          </table>
        </div>
        <AlbumSearch paneRef={searchPaneRef} table={table} />
      </div>
    );
  }
};
