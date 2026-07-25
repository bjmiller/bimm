import { useCallback, useMemo, useState, type RefObject } from 'react';
import { useTRPC } from '../lib/trpc';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type SortingState,
  createColumnHelper,
  useReactTable,
  getCoreRowModel,
  getSortedRowModel
} from '@tanstack/react-table';
import { useHotkey } from '@tanstack/react-hotkeys';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { AlbumRow } from './albumRow';
import { CompressedFileRow } from './compressedFileRow';
import { ChevronUpIcon } from '../../icons/chevronUp';
import { ChevronDownIcon } from '../../icons/chevronDown';
import { Album, CompressedFile, type InboxEntry } from '../../types';
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

const isAlbum = (entry: InboxEntry): entry is Album => Album.safeParse(entry).success;
const isCompressedFile = (entry: InboxEntry) => CompressedFile.safeParse(entry).success;

const calculateRunningtime = (entry: InboxEntry) =>
  isAlbum(entry) ? entry.tracks.reduce((memo, track) => memo + (track.duration ?? 0), 0) : null;

const calculateNumberOfTracks = (entry: InboxEntry) => (isAlbum(entry) ? entry.tracks.length : null);

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
  const queryClient = useQueryClient();
  const inboxQuery = useQuery(trpc.file.getInbox.queryOptions(inboxDirectory));

  const data = useMemo(() => inboxQuery.data ?? [], [inboxQuery.data]);

  const [sorting, setSorting] = useState<SortingState>([{ id: 'modified', desc: true }]);
  const [rowFocus, setRowFocus] = useState<InboxRowFocusState>(undefined);
  const [extractingPath, setExtractingPath] = useState<string | null>(null);

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

  const addAndPlayAlbumsMutation = useMutation(trpc.vlc.addAndPlayAlbums.mutationOptions());
  const extractAndIngestMutation = useMutation(trpc.archive.extractAndIngest.mutationOptions());
  const moveAlbumToTargetMutation = useMutation(trpc.file.moveAlbumToTarget.mutationOptions());
  const trashItemMutation = useMutation(trpc.file.trashItem.mutationOptions());

  const extractAndPlay = useCallback(
    async (entry: CompressedFile) => {
      if (extractingPath != null) {
        return;
      }

      setExtractingPath(entry.fullpath);
      try {
        const album = await extractAndIngestMutation.mutateAsync(entry);
        await inboxQuery.refetch();
        if (album != null) {
          await addAndPlayAlbumsMutation.mutateAsync([album]);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
      } finally {
        setExtractingPath(null);
      }
    },
    [addAndPlayAlbumsMutation, extractAndIngestMutation, extractingPath, inboxQuery]
  );

  const rowClickHandler = useCallback(
    (row: AlbumListRow<InboxEntry>) => (clickEvent: React.MouseEvent<HTMLTableRowElement>) => {
      clickEvent.stopPropagation();
      const entry = row.original;
      if (clickEvent.shiftKey && isCompressedFile(entry)) {
        void extractAndPlay(entry);
        return;
      }
      row.setFocused(true);
    },
    [extractAndPlay]
  );

  const handleShiftEnter = useCallback(() => {
    const focusedRowId = table.getFocusedRowId();
    if (focusedRowId == null) {
      return;
    }

    const focusedRow = table.getRow(focusedRowId);
    if (focusedRow == null) {
      return;
    }

    const entry = focusedRow.original;
    if (isCompressedFile(entry)) {
      void extractAndPlay(entry);
      return;
    }

    if (!isAlbum(entry)) {
      return;
    }

    // eslint-disable-next-line no-console
    console.log(entry.filename);
    void (async () => {
      try {
        await addAndPlayAlbumsMutation.mutateAsync([entry]);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
      }
    })();
  }, [addAndPlayAlbumsMutation, extractAndPlay, table]);

  useHotkey('Shift+Enter', handleShiftEnter);

  const handleF6 = useCallback(() => {
    const focusedRowId = table.getFocusedRowId();
    if (focusedRowId == null) {
      return;
    }

    const focusedRow = table.getRow(focusedRowId);
    if (focusedRow == null) {
      return;
    }

    const entry = focusedRow.original;
    if (!isAlbum(entry)) {
      // Compressed files (or any non-album entry) are a no-op for F6.
      return;
    }

    void (async () => {
      try {
        await moveAlbumToTargetMutation.mutateAsync(entry);
        await inboxQuery.refetch();
        // The album moved into a music directory — refresh any cached album
        // list so it appears without waiting for that query to go stale.
        await queryClient.invalidateQueries({ queryKey: trpc.file.getAlbums.pathKey() });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
      }
    })();
  }, [inboxQuery, moveAlbumToTargetMutation, queryClient, table, trpc]);

  useHotkey('F6', handleF6);

  const handleModDelete = useCallback(() => {
    const focusedRowId = table.getFocusedRowId();
    if (focusedRowId == null) {
      return;
    }

    const focusedRow = table.getRow(focusedRowId);
    if (focusedRow == null) {
      return;
    }

    const entry = focusedRow.original;

    void (async () => {
      try {
        await trashItemMutation.mutateAsync(entry.fullpath);
        await inboxQuery.refetch();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
      }
    })();
  }, [inboxQuery, table, trashItemMutation]);

  useHotkey('Mod+Delete', handleModDelete);

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
                isCompressedFile(row.original) ? (
                  <CompressedFileRow
                    key={row.id}
                    row={row}
                    onClick={rowClickHandler(row)}
                    disabled={extractingPath === row.original.fullpath}
                  />
                ) : (
                  <AlbumRow
                    key={row.id}
                    row={row as AlbumListRow<Album>}
                    onClick={rowClickHandler(row)}
                    viewContext="inbox"
                  />
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
};
