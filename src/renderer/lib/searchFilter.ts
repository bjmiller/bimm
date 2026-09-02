import parseDuration from 'parse-duration';
import { regex, pattern } from 'regex';
import type { Album } from '../../types';
import { isFiltered } from './isFiltered';
import {
  searchParserResultValidator,
  searchRangeValidator,
  searchKeywordValidator
} from './searchParserResultValidator';
import { type FilterFn } from '@tanstack/react-table';
import { type focusableFeatures } from './tableTypes';
import { calculateRunningtime } from '../components/albumList';

const TWO_MINUTES_MS = 120000;
const MILLISECONDS_PER_SECOND = 1000;

// A search filter compiled once per filter value (via `resolveFilterValue`),
// so the per-row test is just comparisons and `RegExp#test`. Previously the
// Zod parse and every `regex` template compilation ran again for each row.
interface CompiledSearchFilter {
  readonly compiled: true;
  readonly timeRange?: { start: number; end: number };
  readonly years?: readonly string[];
  readonly textPatterns?: readonly RegExp[];
  readonly genre?: { wantsNoGenre: boolean; filterGenres: readonly string[] };
  readonly excludePatterns?: readonly RegExp[];
}

const MATCH_ALL: CompiledSearchFilter = { compiled: true };

const isCompiledSearchFilter = (value: unknown): value is CompiledSearchFilter =>
  value != null && typeof value === 'object' && (value as { compiled?: unknown }).compiled === true;

const normalizeGenre = (genre: string) =>
  genre
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, ' ');

const compilePattern = (text: string) => regex('i')`${pattern(text)}`;

export const compileSearchFilter = (filterValue: unknown): CompiledSearchFilter => {
  if (isCompiledSearchFilter(filterValue)) {
    return filterValue;
  }

  const parsedGlobalFilter = searchParserResultValidator.safeParse(filterValue);
  // Badly formed filter, or no filter applied
  if (!parsedGlobalFilter.success || !isFiltered(parsedGlobalFilter.data)) {
    return MATCH_ALL;
  }
  const filter = parsedGlobalFilter.data;

  let timeRange: CompiledSearchFilter['timeRange'];
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
      const toMs = to == null ? null : parseDuration(to);
      if (to == null) {
        // Not a range
        timeRange = { start: fromMs != null ? fromMs - TWO_MINUTES_MS : 0, end: fromMs ?? Infinity };
      } else {
        // Use the range
        timeRange = { start: fromMs ?? 0, end: toMs ?? Infinity };
      }
    }
  }

  let years: CompiledSearchFilter['years'];
  // Year (taken from the first track of the album)
  if (filter.year != null) {
    const parseYearResult = searchKeywordValidator.safeParse(filter.year);
    if (parseYearResult.success) {
      years = parseYearResult.data;
    }
  }

  let textPatterns: CompiledSearchFilter['textPatterns'];
  // Search text (regex)
  if (Object.hasOwn(filter, 'text') && Array.isArray(filter.text)) {
    textPatterns = filter.text.map(compilePattern);
  }

  let genre: CompiledSearchFilter['genre'];
  // Genre filter (comma-separated list, case-insensitive, spaces and hyphens equivalent).
  // The sentinel value "-" matches albums that have no genres.
  if (filter.genre != null) {
    const parseGenreResult = searchKeywordValidator.safeParse(filter.genre);
    if (parseGenreResult.success) {
      const rawGenres = parseGenreResult.data.flatMap((item) => item.split(','));
      const wantsNoGenre = rawGenres.some((item) => item.trim() === '-');
      const filterGenres = rawGenres
        .filter((item) => item.trim() !== '-')
        .map(normalizeGenre)
        .filter((item) => item !== '');
      if (wantsNoGenre || filterGenres.length > 0) {
        genre = { wantsNoGenre, filterGenres };
      }
    }
  }

  let excludePatterns: CompiledSearchFilter['excludePatterns'];
  // Exclusions
  const excludeText = filter.exclude?.text;
  if (excludeText != null) {
    const exclusions = Array.isArray(excludeText) ? excludeText : [excludeText];
    excludePatterns = exclusions.map(compilePattern);
  }

  return { compiled: true, timeRange, years, textPatterns, genre, excludePatterns };
};

const matchesCompiledFilter = (album: Album, filter: CompiledSearchFilter): boolean => {
  if (filter.timeRange != null) {
    const runningtime = (calculateRunningtime(album) ?? 0) * MILLISECONDS_PER_SECOND;
    if (runningtime <= filter.timeRange.start || runningtime >= filter.timeRange.end) {
      return false;
    }
  }

  if (filter.years != null && !filter.years.includes(String(album.tracks?.[0]?.year))) {
    return false;
  }

  if (filter.textPatterns != null && !filter.textPatterns.some((re) => re.test(album.filename))) {
    return false;
  }

  if (filter.genre != null) {
    const { wantsNoGenre, filterGenres } = filter.genre;
    const albumGenres = [
      ...(album.manualTags ?? []),
      ...(album.spotifyGenres ?? []),
      ...(album.bandcampTags ?? [])
    ].map(normalizeGenre);
    const hasNoGenres = albumGenres.length === 0;
    const matchesGenre = filterGenres.some((filterGenre) =>
      albumGenres.some((albumGenre) => albumGenre.includes(filterGenre))
    );
    if (!((wantsNoGenre && hasNoGenres) || (filterGenres.length > 0 && matchesGenre))) {
      return false;
    }
  }

  if (filter.excludePatterns != null && !filter.excludePatterns.every((re) => !re.test(album.filename))) {
    return false;
  }

  return true;
};

const searchFilterFn: FilterFn<typeof focusableFeatures, Album> = (row, columnId, filterValue: unknown) => {
  if (columnId !== 'album') return false;
  // `resolveFilterValue` normally hands us the compiled form; compiling here
  // too keeps this correct if the raw filter ever arrives directly.
  return matchesCompiledFilter(row.original, compileSearchFilter(filterValue));
};

// Called once per filter value by the filtered row model, before iterating rows.
searchFilterFn.resolveFilterValue = compileSearchFilter;

export const searchFilter = searchFilterFn;
