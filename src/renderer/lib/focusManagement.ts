import { useHotkeys } from '@tanstack/react-hotkeys';
import type { RowData, Table as TanStackTable } from '@tanstack/react-table';
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
import { type Album, type InboxEntry } from '../../types';
import type { RowFocusState } from './rowFocus';
import type { FocusableFeatures } from './tableTypes';

/** Both tables register the same feature set, so one table type serves both. */
type FocusTable<TData extends RowData> = TanStackTable<FocusableFeatures, TData>;

export type Pane =
  | 'albumList'
  | 'albumSearch'
  | 'inbox'
  | 'main'
  | 'settingsDirectories'
  | 'settingsInbox'
  | 'settingsSave'
  | 'sidePanel';

interface FocusState {
  albumListFocusRequest: number;
  inboxFocusRequest: number;
  focusedPane: Pane | undefined;
}

type MainContent = 'albumList' | 'inbox' | 'settings' | 'logs';
type TabDirection = 'backward' | 'forward';

type FocusAction =
  | { type: 'focusCleared' }
  | { pane: Pane; type: 'paneFocused' }
  | { direction: TabDirection; mainContent: MainContent; type: 'tabPressed' };

const getPaneOrder = (mainContent: MainContent): Pane[] => {
  if (mainContent === 'albumList') {
    return ['sidePanel', 'albumList', 'albumSearch'];
  }
  if (mainContent === 'inbox') {
    return ['sidePanel', 'inbox'];
  }
  if (mainContent === 'settings') {
    return ['sidePanel', 'settingsDirectories', 'settingsInbox', 'settingsSave'];
  }
  if (mainContent === 'logs') {
    return ['sidePanel', 'main'];
  }
  return ['sidePanel', 'main'];
};
const getNextPane = (pane: Pane | undefined, paneOrder: Pane[], direction: TabDirection): Pane => {
  const defaultIndex = direction === 'forward' ? Math.min(1, paneOrder.length - 1) : 0;
  const defaultPane = paneOrder[defaultIndex] ?? paneOrder[0];

  if (defaultPane == null) {
    throw new Error('Pane order must contain at least one pane.');
  }

  if (pane == null) {
    return defaultPane;
  }

  const currentIndex = paneOrder.indexOf(pane);

  if (currentIndex < 0) {
    return defaultPane;
  }

  const offset = direction === 'forward' ? 1 : -1;
  const nextIndex = (currentIndex + offset + paneOrder.length) % paneOrder.length;

  return paneOrder[nextIndex] ?? defaultPane;
};

const getPaneFromTarget = (
  target: EventTarget | null,
  panes: Partial<Record<Pane, HTMLElement | null>>
): Pane | undefined => {
  if (!(target instanceof Node)) {
    return undefined;
  }

  for (const [pane, paneElement] of Object.entries(panes) as Array<[Pane, HTMLElement | null]>) {
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
      const nextPane = getNextPane(state.focusedPane, getPaneOrder(action.mainContent), action.direction);

      return {
        albumListFocusRequest: nextPane === 'albumList' ? state.albumListFocusRequest + 1 : state.albumListFocusRequest,
        inboxFocusRequest: nextPane === 'inbox' ? state.inboxFocusRequest + 1 : state.inboxFocusRequest,
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
  mainContent: MainContent;
}

export interface AppFocusManagement {
  albumListPaneRef: RefObject<HTMLDivElement | null>;
  albumSearchPaneRef: RefObject<HTMLDivElement | null>;
  clearAlbumListRowFocus: boolean;
  clearInboxRowFocus: boolean;
  focusAlbumListFirstRowRequest: number;
  focusInboxFirstRowRequest: number;
  inboxPaneRef: RefObject<HTMLDivElement | null>;
  mainPaneRef: RefObject<HTMLDivElement | null>;
  onRootBlurCapture: (event: ReactFocusEvent<HTMLDivElement>) => void;
  onRootFocusCapture: (event: ReactFocusEvent<HTMLDivElement>) => void;
  sidePanelRef: RefObject<HTMLDivElement | null>;
}

export function useAppFocusManagement(options: UseAppFocusManagementOptions): AppFocusManagement {
  const { mainContent } = options;
  const [focusState, dispatchFocus] = useReducer(focusReducer, {
    albumListFocusRequest: 0,
    inboxFocusRequest: 0,
    focusedPane: undefined
  });
  const albumListPaneRef = useRef<HTMLDivElement>(null);
  const albumSearchPaneRef = useRef<HTMLDivElement>(null);
  const inboxPaneRef = useRef<HTMLDivElement>(null);
  const mainPaneRef = useRef<HTMLDivElement>(null);
  const sidePanelRef = useRef<HTMLDivElement>(null);

  const getSettingsTabStops = useCallback(() => {
    return Array.from(mainPaneRef.current?.querySelectorAll<HTMLElement>('[data-settings-tab-stop]') ?? []);
  }, []);

  const focusAlbumListPane = useCallback(() => {
    albumListPaneRef.current?.focus({ preventScroll: true });
  }, []);

  const focusAlbumSearch = useCallback(() => {
    albumSearchPaneRef.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
  }, []);

  const focusInboxPane = useCallback(() => {
    inboxPaneRef.current?.focus({ preventScroll: true });
  }, []);

  const focusMainPane = useCallback(() => {
    mainPaneRef.current?.focus({ preventScroll: true });
  }, []);

  const focusSettingsPane = useCallback(
    (pane: Extract<Pane, 'settingsDirectories' | 'settingsInbox' | 'settingsSave'>) => {
      const tabStops = getSettingsTabStops();
      const paneIndex = {
        settingsDirectories: 0,
        settingsInbox: 1,
        settingsSave: 2
      }[pane];

      tabStops[paneIndex]?.focus({ preventScroll: true });
    },
    [getSettingsTabStops]
  );

  const focusSidePanel = useCallback(() => {
    const firstItem = sidePanelRef.current?.querySelector<HTMLElement>('[data-side-panel-item]');

    if (firstItem != null) {
      firstItem.focus({ preventScroll: true });
      return;
    }

    sidePanelRef.current?.focus({ preventScroll: true });
  }, []);

  const onRootFocusCapture = useCallback(
    (focusEvent: ReactFocusEvent<HTMLDivElement>) => {
      const settingsTabStops = mainContent === 'settings' ? getSettingsTabStops() : [];
      const pane = getPaneFromTarget(focusEvent.target, {
        albumList: mainContent === 'albumList' ? albumListPaneRef.current : null,
        albumSearch: mainContent === 'albumList' ? albumSearchPaneRef.current : null,
        inbox: mainContent === 'inbox' ? inboxPaneRef.current : null,
        main: mainContent === 'inbox' ? mainPaneRef.current : null,
        settingsDirectories: settingsTabStops[0] ?? null,
        settingsInbox: settingsTabStops[1] ?? null,
        settingsSave: settingsTabStops[2] ?? null,
        sidePanel: sidePanelRef.current
      });

      if (pane != null) {
        dispatchFocus({ pane, type: 'paneFocused' });
      }
    },
    [getSettingsTabStops, mainContent]
  );

  const onRootBlurCapture = useCallback((blurEvent: ReactFocusEvent<HTMLDivElement>) => {
    if (blurEvent.relatedTarget instanceof Node && blurEvent.currentTarget.contains(blurEvent.relatedTarget)) {
      return;
    }

    dispatchFocus({ type: 'focusCleared' });
  }, []);

  const handlePaneTab = useCallback(
    (direction: TabDirection) => {
      const action = { direction, mainContent, type: 'tabPressed' } as const;
      const nextFocusState = focusReducer(focusState, action);

      dispatchFocus(action);

      switch (nextFocusState.focusedPane) {
        case 'albumList':
          focusAlbumListPane();
          return;
        case 'albumSearch':
          focusAlbumSearch();
          return;
        case 'inbox':
          focusInboxPane();
          return;
        case 'main':
          focusMainPane();
          return;
        case 'settingsDirectories':
        case 'settingsInbox':
        case 'settingsSave':
          focusSettingsPane(nextFocusState.focusedPane);
          return;
        case 'sidePanel':
          focusSidePanel();
          return;
        default:
          return;
      }
    },
    [
      focusAlbumListPane,
      focusAlbumSearch,
      focusInboxPane,
      focusMainPane,
      focusSettingsPane,
      focusSidePanel,
      focusState,
      mainContent
    ]
  );

  const handleForwardPaneTab = useCallback(() => {
    handlePaneTab('forward');
  }, [handlePaneTab]);

  const handleBackwardPaneTab = useCallback(() => {
    handlePaneTab('backward');
  }, [handlePaneTab]);

  useHotkeys(
    [
      {
        hotkey: 'Tab',
        callback: handleForwardPaneTab
      },
      {
        hotkey: 'Shift+Tab',
        callback: handleBackwardPaneTab
      }
    ],
    {
      ignoreInputs: false,
      preventDefault: true,
      target: globalThis.document
    }
  );

  return {
    albumListPaneRef,
    albumSearchPaneRef,
    clearAlbumListRowFocus: focusState.focusedPane != null && focusState.focusedPane !== 'albumList',
    clearInboxRowFocus: focusState.focusedPane != null && focusState.focusedPane !== 'inbox',
    focusAlbumListFirstRowRequest: focusState.albumListFocusRequest,
    focusInboxFirstRowRequest: focusState.inboxFocusRequest,
    inboxPaneRef,
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

export interface UseTableFocusManagementOptions<TData extends RowData> {
  clearRowFocus: boolean;
  data: TData[];
  enabled: boolean;
  focusFirstRowRequest: number;
  listRef: RefObject<HTMLDivElement | null>;
  rowFocus: RowFocusState;
  setRowFocus: Dispatch<SetStateAction<RowFocusState>>;
  table: FocusTable<TData>;
}

export interface TableFocusManagement {
  onPaneMouseDownCapture: () => void;
}

/**
 * Row-focus keyboard navigation and focus bookkeeping shared by the album list
 * and inbox tables: arrow/page movement, clearing row focus when the pane loses
 * focus, focusing the first row on request, and keeping the focused row
 * scrolled into view.
 */
function useTableFocusManagement<TData extends RowData>(
  options: UseTableFocusManagementOptions<TData>
): TableFocusManagement {
  const { clearRowFocus, data, enabled, focusFirstRowRequest, listRef, rowFocus, setRowFocus, table } = options;
  const lastHandledFocusRequest = useRef(0);

  const moveFocus = (direction: 'up' | 'down', distance: number) => {
    const rows = table.getRowModel().rows;

    if (!rows.length) {
      return;
    }

    const focusedRowId = table.getFocusedRowId();
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

  useHotkeys(
    [
      { hotkey: 'ArrowDown', callback: () => moveFocus('down', 1) },
      { hotkey: 'ArrowUp', callback: () => moveFocus('up', 1) },
      { hotkey: 'PageDown', callback: () => moveFocus('down', getPageJumpSize(listRef.current)) },
      { hotkey: 'PageUp', callback: () => moveFocus('up', getPageJumpSize(listRef.current)) }
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

    const rows = table.getRowModel().rows;

    if (!rows.length) {
      return;
    }

    rows[0]?.setFocused(true);
    lastHandledFocusRequest.current = focusFirstRowRequest;
  }, [enabled, focusFirstRowRequest, table]);

  useEffect(() => {
    const focusedRowId = table.getFocusedRowId();

    if (focusedRowId == null) {
      return;
    }

    if (table.getFocusedRow() == null) {
      table.resetRowFocus(true);
      return;
    }

    const focusedRowElement = Array.from(
      listRef.current?.querySelectorAll<HTMLTableRowElement>('tbody tr[data-row-id]') ?? []
    ).find((rowElement) => rowElement.dataset.rowId === focusedRowId);

    focusedRowElement?.scrollIntoView({ block: 'nearest' });
  }, [data, table, listRef, rowFocus]);

  const onPaneMouseDownCapture = useCallback(() => {
    listRef.current?.focus({ preventScroll: true });
  }, [listRef]);

  return { onPaneMouseDownCapture };
}

/**
 * The shared table focus management plus the album list's row-selection
 * shortcuts (Space selects the focused row, Shift+Space toggles it).
 */
export function useAlbumListFocusManagement(options: UseTableFocusManagementOptions<Album>): TableFocusManagement {
  const { enabled, listRef, table } = options;
  const focusManagement = useTableFocusManagement(options);

  const selectFocusedRow = () => {
    const focusedRow = table.getFocusedRow();

    if (focusedRow == null) {
      return;
    }

    table.resetRowSelection(true);
    focusedRow.toggleSelected();
  };

  const toggleFocusedRowSelection = () => {
    const focusedRow = table.getFocusedRow();

    if (focusedRow == null) {
      return;
    }

    focusedRow.toggleSelected();
  };

  useHotkeys(
    [
      { hotkey: 'Space', callback: selectFocusedRow },
      { hotkey: 'Shift+Space', callback: toggleFocusedRowSelection }
    ],
    {
      enabled,
      target: listRef
    }
  );

  return focusManagement;
}

export function useInboxFocusManagement(options: UseTableFocusManagementOptions<InboxEntry>): TableFocusManagement {
  return useTableFocusManagement(options);
}
