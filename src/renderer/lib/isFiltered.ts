import type { SearchParserResult } from 'search-query-parser';
import { parseOptions } from './parseOptions';

export const isFiltered = (globalFilter: SearchParserResult) => {
  const customProperties = [...parseOptions.keywords, ...parseOptions.ranges];
  if (Object.keys(globalFilter).length === 0) {
    return false;
  }
  if (customProperties.some((p) => Object.hasOwn(globalFilter, p))) {
    return true;
  }
  if ((globalFilter?.text ?? []).length === 0 && Object.keys(globalFilter?.exclude ?? {}).length === 0) {
    return false;
  }
  return true;
};
