import { type Table } from '@tanstack/react-table';
import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import { type Album } from '../../types';
import { useHotkey } from '@tanstack/react-hotkeys';
import { parse, type SearchParserResult } from 'search-query-parser';
import { searchParserResultValidator } from '../lib/searchParserResultValidator';
import equal from 'fast-deep-equal';
import clsx from 'clsx';
import { isFiltered } from '../lib/isFiltered';
import { parseOptions } from '../lib/parseOptions';
import { applySearchShortcuts } from '../lib/searchShortcuts';

interface AlbumSearchProps {
  paneRef: RefObject<HTMLDivElement | null>;
  table: Table<Album>;
}

const parseQuery = (query: string) => {
  return parse(query, {
    alwaysArray: true,
    tokenize: true,
    ...parseOptions
  });
};

const calculateInputBgColor = (typedFilter: SearchParserResult, globalFilter: SearchParserResult) => {
  if (!isFiltered(globalFilter)) {
    return 'bg-white';
  }
  if (equal(typedFilter, globalFilter)) {
    return 'bg-green-200';
  }
  return 'bg-amber-100';
};

export const AlbumSearch = ({ table, paneRef }: AlbumSearchProps) => {
  const searchRef = useRef<HTMLInputElement>(null);
  const [typedQuery, setTypedQuery] = useState<string>('');
  const enterHandler = useCallback(
    (e: KeyboardEvent) => {
      const input = e.currentTarget as HTMLInputElement;
      const transformedQuery = applySearchShortcuts(input.value);
      if (transformedQuery !== input.value) {
        input.value = transformedQuery;
        setTypedQuery(transformedQuery);
      }
      const result = parseQuery(transformedQuery);
      table.setGlobalFilter(result);
    },
    [table]
  );
  const escapeHandler = useCallback(() => {
    if (searchRef.current) {
      searchRef.current.value = '';
    }
    setTypedQuery('');
    table.setGlobalFilter(parseQuery(''));
  }, [table]);

  useHotkey('Enter', enterHandler, { ignoreInputs: false, target: searchRef });
  useHotkey('Escape', escapeHandler, { ignoreInputs: false });

  const parsedGlobalFilter = searchParserResultValidator.safeParse(table.getState().globalFilter);
  const globalFilter = parsedGlobalFilter.success ? parsedGlobalFilter.data : {};
  const typedFilter = useMemo(() => parseQuery(typedQuery), [typedQuery]);

  return (
    <div ref={paneRef} className="album-search border-t border-l-0 bg-[#dfdfdf]">
      <input
        ref={searchRef}
        type="text"
        className={clsx(
          'm-1 ml-0 w-[99%] rounded-s border p-1 caret-orange-600 focus-visible:outline-none',
          calculateInputBgColor(typedFilter, globalFilter)
        )}
        spellCheck="false"
        onChange={(e) => setTypedQuery(e.currentTarget.value)}
      />
    </div>
  );
};
