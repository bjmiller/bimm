import React, { type Dispatch, useCallback, useMemo, useState, type RefObject, type SetStateAction } from 'react';
import { useTRPC } from '../lib/trpc';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type SortingState,
  createColumnHelper,
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getExpandedRowModel,
  type RowSelectionState,
  type Row as TanStackRow,
  type Updater
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
import { patchAlbumInQueryCaches } from '../lib/patchAlbumInQueryCaches';
import { useHotkeys } from '@tanstack/react-hotkeys';
import { TagEditor } from './tagEditor';
dayjs.extend(duration);

interface AlbumListProps {
  clearRowFocus: boolean;
  focusFirstRowRequest: number;
  paneRef: RefObject<HTMLDivElement | null>;
  searchPaneRef: RefObject<HTMLDivElement | null>;
  selected: string | undefined;
  selectedRows?: Map<string, number>;
  onSelectedRowsChange?: Dispatch<SetStateAction<Map<string, number>>>;
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
const EMPTY_CHOSIC_LOOKUP_ALBUM: Album = { filename: '', fullpath: '', tracks: [] };

const getChosicLookupAlbum = (album: Album): Album => ({
  filename: album.filename,
  fullpath: album.fullpath,
  tracks: album.tracks?.slice(0, 1)
});

const EMPTY_BANDCAMP_LOOKUP_ALBUM: Album = { filename: '', fullpath: '', tracks: [] };

const getBandcampLookupAlbum = (album: Album): Album => ({
  filename: album.filename,
  fullpath: album.fullpath,
  tracks: album.tracks?.slice(0, 1)
});

const isMac = (globalThis.navigator?.platform ?? '').toLowerCase().includes('mac');
type AlbumListRowFocusState = string | undefined;

export type Row<TData> = TanStackRow<TData> & {
  setFocused: (value?: boolean) => void;
};

export const AlbumList = (props: AlbumListProps) => {
  const {
    clearRowFocus,
    focusFirstRowRequest,
    paneRef: listRef,
    searchPaneRef,
    selected,
    selectedRows: controlledSelectedRows,
    onSelectedRowsChange
  } = props;
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // Shares the single getAlbums query for this directory (see bimm.tsx), so
  // the table updates in place when the fresh revalidation lands.
  const albumsQuery = useQuery(trpc.file.getAlbums.queryOptions(selected));

  const data = useMemo(() => albumsQuery.data?.filter((album) => album.tracks?.length !== 0) ?? [], [albumsQuery.data]);

  const [sorting, setSorting] = useState<SortingState>([{ id: 'modified', desc: true }]);
  const [uncontrolledSelectedRows, setUncontrolledSelectedRows] = useState<Map<string, number>>(new Map());
  const selectedRows = controlledSelectedRows ?? uncontrolledSelectedRows;
  const setSelectedRows = onSelectedRowsChange ?? setUncontrolledSelectedRows;
  const [rowFocus, setRowFocus] = useState<AlbumListRowFocusState>(undefined);
  const [globalFilter, setGlobalFilter] = useState<SearchParserResult>({ offsets: [], exclude: {} });

  const rowSelection = useMemo<RowSelectionState>(
    () => Object.fromEntries(Array.from(selectedRows.keys()).map((id) => [id, true])),
    [selectedRows]
  );

  const handleRowSelectionChange = useCallback(
    (updater: Updater<RowSelectionState>) => {
      setSelectedRows((prev) => {
        const prevSelection = Object.fromEntries(Array.from(prev.keys()).map((id) => [id, true]));
        const nextSelection = typeof updater === 'function' ? updater(prevSelection) : updater;
        const now = Date.now();
        const next = new Map(prev);

        for (const [rowId, isSelected] of Object.entries(nextSelection)) {
          if (isSelected && !prev.has(rowId)) {
            next.set(rowId, now);
          }
        }

        for (const rowId of prev.keys()) {
          if (!nextSelection[rowId]) {
            next.delete(rowId);
          }
        }

        return next;
      });
    },
    [setSelectedRows]
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    _features: [RowFocus],
    data,
    columns,
    getRowId,
    state: { sorting, rowSelection, rowFocus, globalFilter },
    onSortingChange: setSorting,
    onRowSelectionChange: handleRowSelectionChange,
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

  const addAndPlayAlbumsMutation = useMutation(trpc.vlc.addAndPlayAlbums.mutationOptions());

  const playSelectedAlbums = useCallback(() => {
    if (selectedRows.size === 0) {
      const focusedRowId = table.getFocusedRowId();
      if (focusedRowId != null) {
        const focusedRow = table.getRow(focusedRowId);
        if (focusedRow != null) {
          // eslint-disable-next-line no-console
          console.log(focusedRow.original.filename);
          void (async () => {
            try {
              await addAndPlayAlbumsMutation.mutateAsync([focusedRow.original]);
            } catch (e) {
              // eslint-disable-next-line no-console
              console.error(e);
            }
          })();
        }
      }
      return;
    }

    const sortedAlbums = Array.from(selectedRows.entries())
      .map(([id, timestamp]) => ({ id, row: table.getRow(id), timestamp }))
      .filter((item) => item.row != null)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((item) => item.row.original);

    // eslint-disable-next-line no-console
    console.log(sortedAlbums);
    void (async () => {
      try {
        await addAndPlayAlbumsMutation.mutateAsync(sortedAlbums);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
      }
    })();
  }, [addAndPlayAlbumsMutation, selectedRows, table]);

  const focusedAlbum = rowFocus == null ? undefined : table.getRow(rowFocus)?.original;
  const genreLookupInput = useMemo(
    () => (focusedAlbum == null ? EMPTY_CHOSIC_LOOKUP_ALBUM : getChosicLookupAlbum(focusedAlbum)),
    [focusedAlbum]
  );
  const genreQuery = useQuery(
    trpc.web.obtainSpotifyGenres.queryOptions(genreLookupInput, {
      enabled: false,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false
    })
  );
  const populateAlbumGenresMutation = useMutation(trpc.web.getSpotifyGenres.mutationOptions());

  const bandcampLookupInput = useMemo(
    () => (focusedAlbum == null ? EMPTY_BANDCAMP_LOOKUP_ALBUM : getBandcampLookupAlbum(focusedAlbum)),
    [focusedAlbum]
  );
  const bandcampTagQuery = useQuery(
    trpc.web.obtainBandcampTags.queryOptions(bandcampLookupInput, {
      enabled: false,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false
    })
  );
  const populateBandcampTagsMutation = useMutation(trpc.web.getBandcampTags.mutationOptions());

  const patchCaches = useCallback(
    (updatedAlbum: Album) => {
      patchAlbumInQueryCaches(
        queryClient,
        { albums: trpc.file.getAlbums.pathKey(), inbox: trpc.file.getInbox.pathKey() },
        updatedAlbum
      );
    },
    [queryClient, trpc]
  );

  const fetchFocusedAlbumGenres = useCallback(() => {
    if (focusedAlbum == null) {
      return;
    }

    void (async () => {
      // The fetch persists to bimm.json and returns the re-read album — swap
      // it into the cache so the row re-renders with the new genres right away.
      const { data: updatedAlbum } = await genreQuery.refetch();
      if (updatedAlbum != null) {
        patchCaches(updatedAlbum);
      }
    })();
  }, [focusedAlbum, genreQuery, patchCaches]);

  const fetchFocusedBandcampTags = useCallback(() => {
    if (focusedAlbum == null) {
      return;
    }

    void (async () => {
      const { data: updatedAlbum } = await bandcampTagQuery.refetch();
      if (updatedAlbum != null) {
        patchCaches(updatedAlbum);
      }
    })();
  }, [focusedAlbum, bandcampTagQuery, patchCaches]);

  const fetchAllAlbumGenres = useCallback(() => {
    if (populateAlbumGenresMutation.isPending) {
      return;
    }

    const albums = table.getRowModel().rows.map((row) => getChosicLookupAlbum(row.original));

    if (albums.length === 0) {
      return;
    }

    void (async () => {
      try {
        await populateAlbumGenresMutation.mutateAsync(albums);
      } finally {
        await albumsQuery.refetch();
      }
    })();
  }, [albumsQuery, populateAlbumGenresMutation, table]);

  const fetchAllBandcampTags = useCallback(() => {
    if (populateBandcampTagsMutation.isPending) {
      return;
    }

    const albums = table.getRowModel().rows.map((row) => getBandcampLookupAlbum(row.original));

    if (albums.length === 0) {
      return;
    }

    void (async () => {
      try {
        await populateBandcampTagsMutation.mutateAsync(albums);
      } finally {
        await albumsQuery.refetch();
      }
    })();
  }, [albumsQuery, populateBandcampTagsMutation, table]);

  // The album being retagged is captured on open rather than read live: focusing
  // the modal's input moves focus out of the album list pane, which clears row
  // focus (see `clearAlbumListRowFocus`).
  const [tagEditorAlbum, setTagEditorAlbum] = useState<Album | undefined>(undefined);

  const openTagEditor = useCallback(() => {
    if (focusedAlbum == null) {
      return;
    }

    setTagEditorAlbum(focusedAlbum);
  }, [focusedAlbum]);

  const closeTagEditor = useCallback(() => {
    setTagEditorAlbum(undefined);
  }, []);

  const refetchAlbumsAfterSave = useCallback(async () => {
    await albumsQuery.refetch();
  }, [albumsQuery]);

  useHotkeys([
    { hotkey: 'Shift+Enter', callback: playSelectedAlbums },
    { hotkey: 'Mod+/', callback: fetchFocusedAlbumGenres },
    { hotkey: 'Control+Alt+Meta+/', callback: fetchAllAlbumGenres },
    { hotkey: 'Mod+\\', callback: fetchFocusedBandcampTags },
    { hotkey: 'Control+Alt+Meta+\\', callback: fetchAllBandcampTags },
    // Disabled while open so the shortcut can't re-seed the modal from a stale
    // focused row underneath it.
    { hotkey: 'Mod+G', callback: openTagEditor, options: { enabled: tagEditorAlbum == null } }
  ]);

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
                <AlbumRow row={row} onClick={rowClickHandler(row)} viewContext="album-list" />
              ))}
            </tbody>
          </table>
        </div>
        <AlbumSearch paneRef={searchPaneRef} table={table} />
        {tagEditorAlbum != null && (
          <TagEditor
            album={tagEditorAlbum}
            onClose={closeTagEditor}
            onSaved={refetchAlbumsAfterSave}
            key={tagEditorAlbum.fullpath}
          />
        )}
      </div>
    );
  }
};
