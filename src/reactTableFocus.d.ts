import type { RowData, TableFeature, TableFeatures } from '@tanstack/react-table';
import type { RowFocusInstance, RowFocusOptions, RowFocusRow, RowFocusTableState } from './renderer/lib/rowFocus';

declare module '@tanstack/react-table' {
  /* eslint-disable @typescript-eslint/no-unused-vars */
  interface Plugins {
    rowFocusFeature: TableFeature;
  }

  interface TableState_FeatureMap {
    rowFocusFeature: RowFocusTableState;
  }

  interface TableOptions_FeatureMap<TFeatures extends TableFeatures, TData extends RowData> {
    rowFocusFeature: RowFocusOptions;
  }

  interface Table_FeatureMap<TFeatures extends TableFeatures, TData extends RowData> {
    rowFocusFeature: RowFocusInstance<TData>;
  }

  interface Row_FeatureMap<TFeatures extends TableFeatures, TData extends RowData> {
    rowFocusFeature: RowFocusRow;
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */
}
