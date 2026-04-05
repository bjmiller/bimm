import type { RowData } from '@tanstack/react-table';
import type { RowFocusInstance, RowFocusOptions, RowFocusRow, RowFocusTableState } from './renderer/lib/rowFocus';

declare module '@tanstack/react-table' {
  /* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars */
  interface TableState extends RowFocusTableState {}
  interface TableOptionsResolved<TData extends RowData> extends RowFocusOptions {}
  interface Table<TData extends RowData> extends RowFocusInstance<TData> {}
  interface Row<TData extends RowData> extends RowFocusRow {}
  /* eslint-enable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars */
}
