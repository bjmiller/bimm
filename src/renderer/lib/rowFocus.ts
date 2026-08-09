import {
  makeStateUpdater,
  type OnChangeFn,
  type Row,
  type RowData,
  type TableFeature,
  type Updater
} from '@tanstack/react-table';

/* eslint-disable @typescript-eslint/no-explicit-any -- the feature implementation works against `Row<any, …>` because the concrete feature set cannot be named in this generic context. */

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

export interface RowFocusInstance<TData extends RowData> {
  getFocusedRow: () => Row<any, TData> | undefined;
  getFocusedRowId: () => string | undefined;
  resetRowFocus: (defaultState?: boolean) => void;
  setRowFocus: (updater: Updater<RowFocusState>) => void;
}

/**
 * A minimal structural view of a table that has the row-focus feature
 * registered. The public table types only surface these members when the
 * feature is present in the table's feature set, which cannot be resolved in
 * the feature's own generic implementation context — so the implementation
 * works against this interface internally.
 */
interface RowFocusTableInternal<TData extends RowData> extends RowFocusInstance<TData> {
  initialState: { rowFocus?: RowFocusState };
  options: RowFocusOptions;
  atoms: { rowFocus?: { get: () => RowFocusState } };
  getRowModel: () => { rowsById: Record<string, Row<any, TData>> };
  getCoreRowModel: () => { rowsById: Record<string, Row<any, TData>> };
}

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
    const focusTable = table as unknown as RowFocusTableInternal<RowData>;

    focusTable.setRowFocus = (updater) => {
      focusTable.options.onRowFocusChange?.(updater);
    };

    focusTable.resetRowFocus = (defaultState) => {
      focusTable.setRowFocus(defaultState ? undefined : focusTable.initialState.rowFocus);
    };

    focusTable.getFocusedRowId = () => {
      return focusTable.atoms.rowFocus?.get();
    };

    focusTable.getFocusedRow = () => {
      const focusedRowId = focusTable.getFocusedRowId();

      if (focusedRowId == null) {
        return undefined;
      }

      const rowsById = focusTable.getRowModel().rowsById;
      const coreRowsById = focusTable.getCoreRowModel().rowsById;

      return rowsById[focusedRowId] ?? coreRowsById[focusedRowId];
    };
  },

  assignRowPrototype: (prototype, table) => {
    const focusTable = table as unknown as RowFocusTableInternal<RowData>;

    prototype.getIsFocused = function (this: Row<any, RowData>) {
      return focusTable.getFocusedRowId() === this.id;
    };

    prototype.setFocused = function (this: Row<any, RowData>, value?: boolean) {
      const isFocused = focusTable.getFocusedRowId() === this.id;
      focusTable.setRowFocus((value ?? !isFocused) ? this.id : undefined);
    };
  }
};
