import { useHotkeys } from '@tanstack/react-hotkeys';
import type { Row as TanStackRow, Table as TanStackTable } from '@tanstack/react-table';
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  type Dispatch,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  type SetStateAction
} from 'react';
import { type Entry } from '../../types';
import type { RowFocusInstance, RowFocusRow, RowFocusState } from './rowFocus';

type AlbumListRow<TData> = TanStackRow<TData> & RowFocusRow;
type AlbumListTable<TData> = TanStackTable<TData> & RowFocusInstance<TData>;

export type Pane = 'main' | 'sidePanel';

interface FocusState {
  albumListFocusRequest: number;
  focusedPane: Pane | undefined;
}

type FocusAction =
  | { type: 'focusCleared' }
  | { pane: Pane; type: 'paneFocused' }
  | { albumListSelected: boolean; type: 'tabPressed' };

const getNextPane = (pane: Pane | undefined): Pane => {
  if (pane === 'sidePanel') {
    return 'main';
  }

  if (pane === 'main') {
    return 'sidePanel';
  }

  return 'main';
};

const getPaneFromTarget = (
  target: EventTarget | null,
  panes: Record<Pane, HTMLDivElement | null>
): Pane | undefined => {
  if (!(target instanceof Node)) {
    return undefined;
  }

  for (const [pane, paneElement] of Object.entries(panes) as Array<[Pane, HTMLDivElement | null]>) {
    if (paneElement?.contains(target)) {
      return pane;
    }
  }

  return undefined;
};

const focusReducer = (state: FocusState, action: FocusAction): FocusState => {
  switch (action.type) {
    case 'focusCleared':
      return { ...state, focusedPane: undefined };
    case 'paneFocused':
      return { ...state, focusedPane: action.pane };
    case 'tabPressed': {
      const nextPane = getNextPane(state.focusedPane);

      return {
        albumListFocusRequest:
          nextPane === 'main' && action.albumListSelected
            ? state.albumListFocusRequest + 1
            : state.albumListFocusRequest,
        focusedPane: nextPane
      };
    }
    default:
      return state;
  }
};

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

export interface UseAppFocusManagementOptions {
  albumListSelected: boolean;
}

export interface AppFocusManagement {
  clearAlbumListRowFocus: boolean;
  focusAlbumListFirstRowRequest: number;
  mainPaneRef: RefObject<HTMLDivElement | null>;
  onRootBlurCapture: (event: ReactFocusEvent<HTMLDivElement>) => void;
  onRootFocusCapture: (event: ReactFocusEvent<HTMLDivElement>) => void;
  sidePanelRef: RefObject<HTMLDivElement | null>;
}

export function useAppFocusManagement(options: UseAppFocusManagementOptions): AppFocusManagement {
  const { albumListSelected } = options;
  const [focusState, dispatchFocus] = useReducer(focusReducer, { albumListFocusRequest: 0, focusedPane: undefined });
  const mainPaneRef = useRef<HTMLDivElement>(null);
  const sidePanelRef = useRef<HTMLDivElement>(null);

  const focusMainPane = useCallback(() => {
    mainPaneRef.current?.focus({ preventScroll: true });
  }, []);

  const focusSidePanel = useCallback(() => {
    const firstItem = sidePanelRef.current?.querySelector<HTMLElement>('[data-side-panel-item]');

    if (firstItem != null) {
      firstItem.focus({ preventScroll: true });
      return;
    }

    sidePanelRef.current?.focus({ preventScroll: true });
  }, []);

  const onRootFocusCapture = useCallback((focusEvent: ReactFocusEvent<HTMLDivElement>) => {
    const pane = getPaneFromTarget(focusEvent.target, {
      main: mainPaneRef.current,
      sidePanel: sidePanelRef.current
    });

    if (pane != null) {
      dispatchFocus({ pane, type: 'paneFocused' });
    }
  }, []);

  const onRootBlurCapture = useCallback((blurEvent: ReactFocusEvent<HTMLDivElement>) => {
    if (blurEvent.relatedTarget instanceof Node && blurEvent.currentTarget.contains(blurEvent.relatedTarget)) {
      return;
    }

    dispatchFocus({ type: 'focusCleared' });
  }, []);

  const handlePaneTab = useCallback(() => {
    const action = { albumListSelected, type: 'tabPressed' } as const;
    const nextFocusState = focusReducer(focusState, action);

    dispatchFocus(action);

    if (nextFocusState.focusedPane === 'sidePanel') {
      focusSidePanel();
      return;
    }

    if (nextFocusState.focusedPane === 'main') {
      focusMainPane();
    }
  }, [albumListSelected, focusMainPane, focusSidePanel, focusState]);

  useHotkeys(
    [
      {
        hotkey: 'Tab',
        callback: handlePaneTab
      }
    ],
    {
      preventDefault: true,
      target: globalThis.document
    }
  );

  return {
    clearAlbumListRowFocus: focusState.focusedPane === 'sidePanel',
    focusAlbumListFirstRowRequest: focusState.albumListFocusRequest,
    mainPaneRef,
    onRootBlurCapture,
    onRootFocusCapture,
    sidePanelRef
  };
}

export interface UseSidePanelFocusManagementOptions {
  paneRef: RefObject<HTMLDivElement | null>;
}

export interface SidePanelFocusManagement {
  onPaneMouseDownCapture: () => void;
}

export function useSidePanelFocusManagement(options: UseSidePanelFocusManagementOptions): SidePanelFocusManagement {
  const { paneRef } = options;

  const moveItemFocus = useCallback(
    (direction: 'up' | 'down') => {
      const items = Array.from(paneRef.current?.querySelectorAll<HTMLElement>('[data-side-panel-item]') ?? []);

      if (!items.length) {
        return;
      }

      const activeElement = globalThis.document.activeElement;
      const focusedIndex =
        activeElement instanceof HTMLElement ? items.findIndex((item) => item === activeElement) : -1;

      const nextIndex =
        direction === 'down'
          ? focusedIndex < 0
            ? 0
            : Math.min(focusedIndex + 1, items.length - 1)
          : focusedIndex < 0
            ? items.length - 1
            : Math.max(focusedIndex - 1, 0);

      items[nextIndex]?.focus({ preventScroll: true });
    },
    [paneRef]
  );

  useHotkeys(
    [
      { hotkey: 'ArrowDown', callback: () => moveItemFocus('down') },
      { hotkey: 'ArrowUp', callback: () => moveItemFocus('up') }
    ],
    {
      preventDefault: true,
      target: paneRef
    }
  );

  const onPaneMouseDownCapture = useCallback(() => {
    paneRef.current?.focus({ preventScroll: true });
  }, [paneRef]);

  return { onPaneMouseDownCapture };
}

export interface UseSidePanelItemInteractionsOptions {
  onSelect: () => void;
}

export interface SidePanelItemInteractions {
  onItemClick: () => void;
  onItemKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onItemMouseDownCapture: (event: ReactMouseEvent<HTMLDivElement>) => void;
}

export function useSidePanelItemInteractions(options: UseSidePanelItemInteractionsOptions): SidePanelItemInteractions {
  const { onSelect } = options;

  const onItemClick = useCallback(() => {
    onSelect();
  }, [onSelect]);

  const onItemKeyDown = useCallback(
    (keyboardEvent: ReactKeyboardEvent<HTMLDivElement>) => {
      if (keyboardEvent.key !== 'Enter') {
        return;
      }

      keyboardEvent.preventDefault();
      onSelect();
    },
    [onSelect]
  );

  const onItemMouseDownCapture = useCallback((mouseEvent: ReactMouseEvent<HTMLDivElement>) => {
    mouseEvent.currentTarget.focus({ preventScroll: true });
  }, []);

  return {
    onItemClick,
    onItemKeyDown,
    onItemMouseDownCapture
  };
}

export interface UseAlbumListFocusManagementOptions {
  clearRowFocus: boolean;
  data: Entry[];
  enabled: boolean;
  focusFirstRowRequest: number;
  listRef: RefObject<HTMLDivElement | null>;
  rowFocus: RowFocusState;
  setRowFocus: Dispatch<SetStateAction<RowFocusState>>;
  table: AlbumListTable<Entry>;
}

export interface AlbumListFocusManagement {
  onPaneMouseDownCapture: () => void;
}

export function useAlbumListFocusManagement(options: UseAlbumListFocusManagementOptions): AlbumListFocusManagement {
  const { clearRowFocus, data, enabled, focusFirstRowRequest, listRef, rowFocus, setRowFocus, table } = options;
  const focusTable = table;
  const lastHandledFocusRequest = useRef(0);

  const moveFocus = (direction: 'up' | 'down', distance: number) => {
    const rows = table.getRowModel().rows as AlbumListRow<Entry>[];

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
    if (!clearRowFocus || rowFocus == null) {
      return;
    }

    setRowFocus(undefined);
  }, [clearRowFocus, rowFocus, setRowFocus]);

  useEffect(() => {
    if (focusFirstRowRequest === 0 || focusFirstRowRequest === lastHandledFocusRequest.current || !enabled) {
      return;
    }

    const rows = table.getRowModel().rows as AlbumListRow<Entry>[];

    if (!rows.length) {
      return;
    }

    rows[0]?.setFocused(true);
    lastHandledFocusRequest.current = focusFirstRowRequest;
  }, [enabled, focusFirstRowRequest, table]);

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

  const onPaneMouseDownCapture = useCallback(() => {
    listRef.current?.focus({ preventScroll: true });
  }, [listRef]);

  return { onPaneMouseDownCapture };
}
