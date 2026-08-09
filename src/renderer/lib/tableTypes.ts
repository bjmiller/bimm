import {
  createFilteredRowModel,
  createSortedRowModel,
  columnFilteringFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  type RowData
} from '@tanstack/react-table';
import { rowFocusFeature, type RowFocusRow } from './rowFocus';

// The default column sortFn is 'auto', which resolves to one of these by value
// type. V9 only bundles the sorting functions that are explicitly registered.
const sortFns = {
  alphanumeric: sortFn_alphanumeric,
  datetime: sortFn_datetime,
  text: sortFn_text
};

/**
 * The full feature set used by tables that support search/filtering (the album
 * list). Tables that only need sorting + focus use {@link sortableFeatures}.
 */
export const searchableFeatures = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  rowFocusFeature,
  rowSelectionFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  sortFns
});

export type SearchableFeatures = typeof searchableFeatures;

/**
 * The reduced feature set used by tables that only need sorting and row focus
 * (the inbox).
 */
export const sortableFeatures = tableFeatures({
  columnVisibilityFeature,
  rowFocusFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns
});

export type SortableFeatures = typeof sortableFeatures;

/**
 * The structural subset of a focus-enabled row that the row-rendering
 * components rely on. Typed structurally (rather than by feature set) so the
 * shared row components work for both the album list and inbox tables, which
 * register different feature sets (`Row` is invariant in its feature set).
 *
 * The cell is typed loosely: the components only read `column.id` and hand
 * `columnDef.cell` + `getContext()` to `flexRender`, which accepts `any`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface FocusableRow<TData extends RowData> extends RowFocusRow {
  readonly id: string;
  readonly original: TData;
  /** Present only on rows from tables that register `rowSelectionFeature`. */
  getIsSelected?: () => boolean;
  getVisibleCells: () => Array<{
    column: { id: string; columnDef: { cell?: any } };
    getContext: () => any;
  }>;
}

/**
 * A focusable row that also supports selection. Only present on tables that
 * register `rowSelectionFeature` (the album list, not the inbox).
 */
export interface SelectableFocusableRow<TData extends RowData> extends FocusableRow<TData> {
  getIsSelected: () => boolean;
  toggleSelected: (value?: boolean) => void;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
