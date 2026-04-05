import {
  functionalUpdate,
  type OnChangeFn,
  type Row,
  type RowData,
  type Table,
  type TableFeature,
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

export interface RowFocusInstance<TData extends RowData> {
  getFocusedRow: () => Row<TData> | undefined;
  getFocusedRowId: () => string | undefined;
  resetRowFocus: (defaultState?: boolean) => void;
  setRowFocus: (updater: Updater<RowFocusState>) => void;
}

type FocusTable<TData extends RowData> = Table<TData> &
  RowFocusInstance<TData> & {
    initialState: Table<TData>['initialState'] & Partial<RowFocusTableState>;
    options: Table<TData>['options'] & RowFocusOptions;
    getState: () => ReturnType<Table<TData>['getState']> & RowFocusTableState;
  };

type FocusRow<TData extends RowData> = Row<TData> & RowFocusRow;

export const RowFocus: TableFeature = {
  getInitialState: (state): RowFocusTableState => {
    return {
      rowFocus: undefined,
      ...state
    };
  },

  getDefaultOptions: <TData extends RowData>(table: Table<TData>): RowFocusOptions => {
    return {
      onRowFocusChange: (updater) => {
        table.setState((old) => {
          const focusState = old as typeof old & RowFocusTableState;

          return {
            ...old,
            rowFocus: functionalUpdate<RowFocusState>(updater, focusState.rowFocus)
          };
        });
      }
    };
  },

  createTable: <TData extends RowData>(table: Table<TData>): void => {
    const focusTable = table as FocusTable<TData>;

    focusTable.setRowFocus = (updater) => {
      focusTable.options.onRowFocusChange?.(updater);
    };

    focusTable.resetRowFocus = (defaultState) => {
      focusTable.setRowFocus(defaultState ? undefined : focusTable.initialState.rowFocus);
    };

    focusTable.getFocusedRowId = () => {
      const focusState = focusTable.getState() as ReturnType<Table<TData>['getState']> & RowFocusTableState;
      return focusState.rowFocus;
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

  createRow: <TData extends RowData>(row: Row<TData>, table: Table<TData>): void => {
    const focusTable = table as FocusTable<TData>;
    const focusRow = row as FocusRow<TData>;

    focusRow.getIsFocused = () => {
      return focusTable.getFocusedRowId() === focusRow.id;
    };

    focusRow.setFocused = (value?: boolean) => {
      focusTable.setRowFocus((value ?? !focusRow.getIsFocused()) ? focusRow.id : undefined);
    };
  }
};
