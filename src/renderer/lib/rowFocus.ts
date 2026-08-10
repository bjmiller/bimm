import {
  assignPrototypeAPIs,
  assignTableAPIs,
  functionalUpdate,
  makeStateUpdater,
  type OnChangeFn,
  type Row,
  type RowData,
  type TableFeature,
  type TableFeatures,
  type Updater
} from '@tanstack/react-table';

export type RowFocusState = string | undefined;

export interface RowFocusTableState {
  rowFocus: RowFocusState;
}

export interface RowFocusOptions {
  onRowFocusChange?: OnChangeFn<RowFocusState>;
}

export interface RowFocusRow {
  getIsFocused: () => boolean;
  /**
   *
   * @param value boolean
   *
   * Sets the row to be the focused row.  If no value is passed to the function,
   * the focus state is toggled.
   */
  setFocused: (value?: boolean) => void;
}

export interface RowFocusInstance<TFeatures extends TableFeatures, TData extends RowData> {
  getFocusedRow: () => Row<TFeatures, TData> | undefined;
  getFocusedRowId: () => string | undefined;
  resetRowFocus: (defaultState?: boolean) => void;
  setRowFocus: (updater: Updater<RowFocusState>) => void;
}

/**
 * The structural subset of a focus-enabled table that the feature logic reads
 * and writes. The stock features keep their logic in standalone functions typed
 * against the library's broad internal table shape; that shape isn't exported,
 * so these helpers use a minimal structural interface instead. The public
 * `Table` type only exposes the `rowFocus` slice when the feature is present
 * in the feature set, which can't be resolved in this generic context — a
 * single documented assertion in `constructTableAPIs` bridges that gap.
 */
interface RowFocusTable {
  initialState: { rowFocus?: RowFocusState };
  options: RowFocusOptions;
  atoms: { rowFocus?: { get: () => RowFocusState } };
  getRowModel: () => { rowsById: Record<string, unknown> };
  getCoreRowModel: () => { rowsById: Record<string, unknown> };
}

/**
 * The structural subset of a focus-enabled row that the feature logic needs:
 * its id and a back-reference to the table. The concrete row also carries the
 * focus APIs via the shared prototype.
 */
type FocusRow = { id: string; table: RowFocusTable };

const table_setRowFocus = (table: RowFocusTable, updater: Updater<RowFocusState>) => {
  const safeUpdater: Updater<RowFocusState> = (old) => functionalUpdate(updater, old);
  return table.options.onRowFocusChange?.(safeUpdater);
};

const table_resetRowFocus = (table: RowFocusTable, defaultState?: boolean) => {
  table_setRowFocus(table, defaultState ? undefined : table.initialState.rowFocus);
};

const table_getFocusedRowId = (table: RowFocusTable): string | undefined => {
  return table.atoms.rowFocus?.get();
};

const table_getFocusedRow = (table: RowFocusTable): unknown => {
  const focusedRowId = table_getFocusedRowId(table);

  if (focusedRowId == null) {
    return undefined;
  }

  const rowsById = table.getRowModel().rowsById;
  const coreRowsById = table.getCoreRowModel().rowsById;

  return rowsById[focusedRowId] ?? coreRowsById[focusedRowId];
};

const row_getIsFocused = (row: FocusRow): boolean => {
  return table_getFocusedRowId(row.table) === row.id;
};

const row_setFocused = (row: FocusRow, value?: boolean) => {
  table_setRowFocus(row.table, (value ?? !row_getIsFocused(row)) ? row.id : undefined);
};

export const rowFocusFeature: TableFeature = {
  getInitialState: (initialState) => {
    return {
      rowFocus: undefined,
      ...initialState
    };
  },

  getDefaultTableOptions: (table) => {
    return {
      onRowFocusChange: makeStateUpdater('rowFocus', table)
    };
  },

  constructTableAPIs: (table) => {
    // The feature is always registered alongside its state/options (see
    // reactTableFocus.d.ts), so the table satisfies RowFocusTable at runtime;
    // the public generic type just can't prove it here.
    const focusTable = table as RowFocusTable;
    assignTableAPIs('rowFocusFeature', table, {
      table_setRowFocus: { fn: (updater: Updater<RowFocusState>) => table_setRowFocus(focusTable, updater) },
      table_resetRowFocus: { fn: (defaultState?: boolean) => table_resetRowFocus(focusTable, defaultState) },
      table_getFocusedRowId: { fn: () => table_getFocusedRowId(focusTable) },
      table_getFocusedRow: { fn: () => table_getFocusedRow(focusTable) }
    });
  },

  assignRowPrototype: (prototype, table) => {
    assignPrototypeAPIs('rowFocusFeature', prototype, table, {
      row_getIsFocused: { fn: (row: FocusRow) => row_getIsFocused(row) },
      row_setFocused: { fn: (row: FocusRow, value?: boolean) => row_setFocused(row, value) }
    });
  }
};
