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
  tableFeatures
} from '@tanstack/react-table';
import { rowFocusFeature } from './rowFocus';

// The default column sortFn is 'auto', which resolves to one of these by value
// type. V9 only bundles the sorting functions that are explicitly registered.
const sortFns = {
  alphanumeric: sortFn_alphanumeric,
  datetime: sortFn_datetime,
  text: sortFn_text
};

/**
 * The feature set shared by both the album list and inbox tables. V9 `Row`,
 * `Cell`, and `Column` types are invariant in their feature set, so both tables
 * use one identical feature set; that keeps their rows interchangeable and lets
 * the shared row components be typed against a single concrete feature set.
 */
export const focusableFeatures = tableFeatures({
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

export type FocusableFeatures = typeof focusableFeatures;
