import { useHotkeys } from '@tanstack/react-hotkeys';
import type { Row as TanStackRow, Table as TanStackTable } from '@tanstack/react-table';
import { useEffect, type RefObject } from 'react';
import { type Entry } from '../../types';
import type { RowFocusInstance, RowFocusRow, RowFocusState } from './rowFocus';

type Row<TData> = TanStackRow<TData> & RowFocusRow;
type Table<TData> = TanStackTable<TData> & RowFocusInstance<TData>;

const getPageJumpSize = (container: HTMLDivElement | null) => {
  if (container == null) {
    return 1;
  }

  const firstRow = container.querySelector<HTMLTableRowElement>('tbody tr');

  if (firstRow == null) {
    return 1;
  }

  const rowHeight = firstRow.getBoundingClientRect().height;

  if (rowHeight <= 0) {
    return 1;
  }

  const headerHeight = container.querySelector('thead')?.getBoundingClientRect().height ?? 0;
  const visibleHeight = Math.max(container.clientHeight - headerHeight, rowHeight);

  return Math.max(1, Math.floor(visibleHeight / rowHeight));
};

export interface UseRowFocusNavigationOptions {
  data: Entry[];
  enabled: boolean;
  listRef: RefObject<HTMLDivElement | null>;
  rowFocus: RowFocusState;
  table: Table<Entry>;
}

export function useRowFocusNavigation(options: UseRowFocusNavigationOptions): void {
  const { data, enabled, listRef, rowFocus, table } = options;
  const focusTable = table;

  const moveFocus = (direction: 'up' | 'down', distance: number) => {
    const rows = table.getRowModel().rows as Row<Entry>[];

    if (!rows.length) {
      return;
    }

    const focusedRowId = focusTable.getFocusedRowId();
    const focusedIndex = focusedRowId == null ? -1 : rows.findIndex((row) => row.id === focusedRowId);

    if (direction === 'down' && distance === 1 && focusedIndex < 0) {
      rows[0]?.setFocused(true);
      return;
    }

    const nextIndex =
      direction === 'down'
        ? focusedIndex < 0
          ? Math.min(distance - 1, rows.length - 1)
          : Math.min(focusedIndex + distance, rows.length - 1)
        : focusedIndex < 0
          ? rows.length - 1
          : Math.max(focusedIndex - distance, 0);

    rows[nextIndex]?.setFocused(true);
  };

  const selectFocusedRow = () => {
    const focusedRow = focusTable.getFocusedRow();

    if (focusedRow == null) {
      return;
    }

    table.resetRowSelection(true);
    focusedRow.toggleSelected(true);
  };

  const toggleFocusedRowSelection = () => {
    const focusedRow = focusTable.getFocusedRow();

    if (focusedRow == null) {
      return;
    }

    focusedRow.toggleSelected();
  };

  useHotkeys(
    [
      { hotkey: 'ArrowDown', callback: () => moveFocus('down', 1) },
      { hotkey: 'ArrowUp', callback: () => moveFocus('up', 1) },
      { hotkey: 'PageDown', callback: () => moveFocus('down', getPageJumpSize(listRef.current)) },
      { hotkey: 'PageUp', callback: () => moveFocus('up', getPageJumpSize(listRef.current)) },
      { hotkey: 'Space', callback: selectFocusedRow },
      { hotkey: 'Shift+Space', callback: toggleFocusedRowSelection }
    ],
    {
      enabled,
      target: listRef
    }
  );

  useEffect(() => {
    const focusedRowId = focusTable.getFocusedRowId();

    if (focusedRowId == null) {
      return;
    }

    if (focusTable.getFocusedRow() == null) {
      focusTable.resetRowFocus(true);
      return;
    }

    const focusedRowElement = Array.from(
      listRef.current?.querySelectorAll<HTMLTableRowElement>('tbody tr[data-row-id]') ?? []
    ).find((rowElement) => rowElement.dataset.rowId === focusedRowId);

    focusedRowElement?.scrollIntoView({ block: 'nearest' });
  }, [data, focusTable, listRef, rowFocus]);
}
