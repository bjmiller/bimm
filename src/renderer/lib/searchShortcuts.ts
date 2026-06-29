import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

// Time-of-day formats accepted by the `until:` shortcut, tried in order.
const TIME_FORMATS = [
  'H:mm',
  'H:mm:ss',
  'HH:mm',
  'HH:mm:ss',
  'h:mm a',
  'h:mma',
  'h:mm A',
  'h:mmA',
  'h a',
  'ha',
  'h A',
  'hA',
  'H',
  'HH'
];

// Matches a `until:VALUE` token where VALUE is a single non-whitespace run
// (optionally quoted). Captures the value in group 1.
const UNTIL_TOKEN = /until:(?:"([^"]+)"|'([^']+)'|(\S+))/gi;

const isOnlyANumber = (query: string) => /^\d+$/.test(query.trim());

// Result of parsing a time-of-day value: just the hour and minute, with no
// date anchored. The caller is responsible for picking the nearest future
// occurrence (see `nearestFutureTime`).
interface TimeOfDay {
  hour: number;
  minute: number;
}

const parseTimeOfDay = (value: string): TimeOfDay | null => {
  const trimmed = value.trim();
  for (const format of TIME_FORMATS) {
    const parsed = dayjs(trimmed, format, true);
    if (parsed.isValid()) {
      return { hour: parsed.hour(), minute: parsed.minute() };
    }
  }
  // Fall back to native Date parsing (e.g. "5pm" works in V8).
  const native = new Date(`${dayjs().format('YYYY-MM-DD')} ${trimmed}`);
  const d = dayjs(native);
  if (d.isValid() && !isNaN(native.getTime())) {
    return { hour: d.hour(), minute: d.minute() };
  }
  return null;
};

// Given an hour:minute, find the nearest future datetime relative to `now`.
// Considers both the parsed hour and the hour + 12 (to handle ambiguous
// 12-hour input like `10:20` near 10pm), today and tomorrow, and returns the
// earliest candidate that is strictly after `now`.
const nearestFutureTime = (tod: TimeOfDay, now: dayjs.Dayjs): dayjs.Dayjs | null => {
  const HALF_DAY_HOURS = 12;
  const HOURS_PER_DAY = 24;
  const candidates: dayjs.Dayjs[] = [];
  for (const dayOffset of [0, 1]) {
    for (const hourOffset of [0, HALF_DAY_HOURS]) {
      const hour = (tod.hour + hourOffset) % HOURS_PER_DAY;
      candidates.push(now.add(dayOffset, 'day').hour(hour).minute(tod.minute).second(0).millisecond(0));
    }
  }
  const future = candidates.filter((c) => c.isAfter(now));
  if (future.length === 0) {
    return null;
  }
  return future.reduce((earliest, c) => (c.isBefore(earliest) ? c : earliest));
};

/**
 * Apply search shortcuts to a raw query string.
 *
 * 1. If the entire (trimmed) query is a number, treat it as a running-time
 *    search in minutes. e.g. `50` -> `time:50m`.
 * 2. Any `until:VALUE` token is interpreted as a time of day later than now.
 *    The difference between now and that time is computed and the token is
 *    replaced with `time:{minutes}m`.
 *
 * Returns the transformed query string (unchanged if no shortcut applies).
 */
export const applySearchShortcuts = (query: string): string => {
  const trimmed = query.trim();

  // Shortcut 1: a bare number -> running time in minutes.
  if (isOnlyANumber(trimmed)) {
    return `time:${trimmed}m`;
  }

  // Shortcut 2: `until:VALUE` -> `time:{minutes}m`.
  if (!/until:/i.test(trimmed)) {
    return query;
  }
  const now = dayjs();
  let replaced = trimmed;
  let didReplace = false;
  replaced = replaced.replace(
    UNTIL_TOKEN,
    (full, dq: string | undefined, sq: string | undefined, bare: string | undefined) => {
      const value = (dq ?? sq ?? bare ?? '').trim();
      const tod = parseTimeOfDay(value);
      if (!tod) {
        return full;
      }
      const targetTime = nearestFutureTime(tod, now);
      if (!targetTime) {
        return full;
      }
      const diffMinutes = Math.round(targetTime.diff(now, 'minute', true));
      if (diffMinutes <= 0) {
        return full;
      }
      didReplace = true;
      return `time:${diffMinutes}m`;
    }
  );

  return didReplace ? replaced : query;
};
