import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import dayjs from 'dayjs';
import { type LogEntry, type LogSeverity } from '../../types';
import { clearLogs, getAllLogs, subscribeToLogChanges } from '../lib/logStore';

interface LogsProps {
  paneRef: RefObject<HTMLDivElement | null>;
}

// Distance from the bottom (px) within which the list is considered pinned to
// the newest entry; scrolling up beyond this unpins auto-scroll.
const PIN_THRESHOLD_PX = 40;

interface SeverityDecoration {
  glyph: string;
  glyphClassName: string;
  rowClassName: string;
  textClassName: string;
}

// Chrome DevTools console light-theme styling, per severity.
const decorations: Record<LogSeverity, SeverityDecoration> = {
  error: {
    glyph: '⊗',
    glyphClassName: 'text-[#ad0a2f]',
    rowClassName: 'bg-[#fff0f0] border-b-[#ffd6d6]',
    textClassName: 'text-[#ad0a2f]'
  },
  warn: {
    glyph: '⚠',
    glyphClassName: 'text-[#bf8307]',
    rowClassName: 'bg-[#fffbe5] border-b-[#f5e6a3]',
    textClassName: 'text-[#8a6105]'
  },
  info: {
    glyph: 'ℹ',
    glyphClassName: 'text-[#1a73e8]',
    rowClassName: 'bg-white border-b-neutral-100',
    textClassName: 'text-[#30393e]'
  },
  log: {
    glyph: '›',
    glyphClassName: 'text-neutral-400',
    rowClassName: 'bg-white border-b-neutral-100',
    textClassName: 'text-[#30393e]'
  },
  debug: {
    glyph: '›',
    glyphClassName: 'text-neutral-300',
    rowClassName: 'bg-white border-b-neutral-100',
    textClassName: 'text-neutral-400'
  }
};

const LogLine = ({ entry }: { entry: LogEntry }) => {
  const { glyph, glyphClassName, rowClassName, textClassName } = decorations[entry.severity];
  return (
    <div className={`flex items-start gap-2 border-b px-2 py-0.5 ${rowClassName}`}>
      <span className={`w-3 shrink-0 text-center leading-5 select-none ${glyphClassName}`}>{glyph}</span>
      <span className="shrink-0 leading-5 text-neutral-400 tabular-nums select-none">
        {dayjs(entry.createdAt).format('HH:mm:ss.SSS')}
      </span>
      <span
        className={clsx(
          'h-4.5 w-15 shrink-0 rounded px-1 text-center text-[10px] leading-5 uppercase select-none',
          entry.source === 'main' ? 'bg-neutral-200 text-neutral-600' : 'bg-blue-100 text-[#1a5fb8]'
        )}
      >
        {entry.source}
      </span>
      <span className={`min-w-0 flex-1 leading-5 wrap-anywhere whitespace-pre-wrap ${textClassName}`}>
        {entry.message}
      </span>
    </div>
  );
};

export const Logs = ({ paneRef }: LogsProps) => {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);
  const isPinnedToBottom = useRef(true);

  const refresh = useCallback(() => {
    getAllLogs()
      .then((logs) => {
        setLoadError(undefined);
        setEntries(logs);
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : String(error));
      });
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToLogChanges(refresh);
    refresh();
    return unsubscribe;
  }, [refresh]);

  useEffect(() => {
    if (!isPinnedToBottom.current) {
      return;
    }
    const list = listRef.current;
    if (list != null) {
      list.scrollTop = list.scrollHeight;
    }
  }, [entries]);

  const handleScroll = () => {
    const list = listRef.current;
    if (list == null) {
      return;
    }
    isPinnedToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < PIN_THRESHOLD_PX;
  };

  const onClearClick = () => {
    void clearLogs();
  };

  return (
    <div
      ref={paneRef}
      className="logs flex h-lvh min-w-0 flex-1 flex-col overflow-hidden p-1 outline-none"
      onMouseDownCapture={() => paneRef.current?.focus({ preventScroll: true })}
      tabIndex={0}
    >
      <div className="flex items-center justify-between px-1 pb-1">
        <h3>Logs</h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-neutral-500 tabular-nums">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </span>
          <button
            type="button"
            onClick={onClearClick}
            className="rounded border border-neutral-700 px-2 py-0.5 text-xs hover:bg-neutral-200 focus:outline-none focus-visible:inset-ring-1 focus-visible:inset-ring-orange-400 active:bg-orange-400"
          >
            Clear
          </button>
        </div>
      </div>
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="min-w-0 flex-1 overflow-y-auto bg-white text-xs outline-none focus:inset-ring-1 focus:inset-ring-orange-400"
        tabIndex={0}
      >
        {loadError != null ? (
          <div className="flex items-center justify-between gap-2 bg-[#fff0f0] px-2 py-1 text-[#ad0a2f]">
            <span className="min-w-0 break-all">Failed to load logs: {loadError}</span>
            <button
              type="button"
              onClick={refresh}
              className="shrink-0 rounded border border-[#ad0a2f] px-2 py-0.5 text-xs hover:bg-[#ffe0e0] focus:outline-none focus-visible:inset-ring-1 focus-visible:inset-ring-orange-400 active:bg-orange-400"
            >
              Retry
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="p-2 text-neutral-400">No log entries in the last 48 hours.</div>
        ) : (
          entries.map((entry) => <LogLine key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
};
