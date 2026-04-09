import parseDuration from 'parse-duration';
import { regex, pattern } from 'regex';
import type { Album } from '../../types';
import { isFiltered } from './isFiltered';
import {
  searchParserResultValidator,
  searchRangeValidator,
  searchKeywordValidator
} from './searchParserResultValidator';
import { type Row, calculateRunningtime } from '../components/albumList';

const TWO_MINUTES_MS = 120000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const searchFilter = (row: Row<Album>, columnId: string, filterValue: any) => {
  if (columnId !== 'album') return false;
  const parsedGlobalFilter = searchParserResultValidator.safeParse(filterValue);
  // Badly formed filter
  if (!parsedGlobalFilter.success) {
    return true;
  }
  const filter = parsedGlobalFilter.data;
  // No filter applied
  if (!isFiltered(filter)) {
    return true;
  }
  const album = row.original;
  let shouldInclude = true;
  // Search by album running time.  e.g.: "time:45-50m"
  if (Object.hasOwn(filter, 'time')) {
    const parseTimeResult = searchRangeValidator.safeParse(filter.time);
    if (parseTimeResult.success) {
      let from = parseTimeResult.data.from;
      if (!isNaN(Number(from))) {
        from += 'm';
      }
      const fromMs = parseDuration(from);
      const to = parseTimeResult.data.to;
      const toMs = parseDuration(to);
      // eslint-disable-next-line no-magic-numbers
      const runningtime = (calculateRunningtime(album) ?? 0) * 1000;
      let start: number;
      let end: number;
      if (to == null) {
        // Not a range
        start = fromMs != null ? fromMs - TWO_MINUTES_MS : 0;
        end = fromMs ?? Infinity;
      } else {
        // Use the range
        start = fromMs ?? 0;
        end = toMs ?? Infinity;
      }
      if (runningtime <= start || runningtime >= end) {
        shouldInclude = false;
      }
    }
  }
  // Year (taken from the first track of the album)
  if (filter.year != null) {
    const parseYearResult = searchKeywordValidator.safeParse(filter.year);
    if (parseYearResult.success) {
      const year = parseYearResult.data;
      if (!year.includes(String(album.tracks?.[0]?.year))) {
        shouldInclude = false;
      }
    }
  }
  // Search text (regex)
  if (shouldInclude && Object.hasOwn(filter, 'text') && Array.isArray(filter.text)) {
    shouldInclude = filter.text.some((text) => {
      const re = regex('i')`${pattern(text)}`;
      return re.test(album.filename);
    });
  }
  // Process exclusions
  if (shouldInclude && Object.hasOwn(filter, 'exclude') && Object.keys(filter.exclude ?? {}).length !== 0) {
    const excludeText = filter.exclude?.text;
    if (excludeText != null) {
      const exclusions = Array.isArray(excludeText) ? excludeText : [excludeText];
      shouldInclude = exclusions.every((text) => {
        const re = regex('i')`${pattern(text)}`;
        return !re.test(album.filename);
      });
    }
  }
  return shouldInclude;
};
