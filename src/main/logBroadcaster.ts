import log from 'electron-log/main';
import { type LogEntry } from '../types';
import { formatLogArgs, severityFromElectronLogLevel } from '../lib/logFormat';

// How many main-process lines are kept in memory so the renderer can backfill
// entries that were emitted before its tRPC subscription connected.
const BUFFER_SIZE = 200;

const recent: LogEntry[] = [];

// One push function per active stream; the broadcaster fans each entry out to
// all of them.
const streamPushers = new Set<(entry: LogEntry) => void>();

const notifyStreams = (entry: LogEntry) => {
  for (const push of streamPushers) {
    try {
      push(entry);
    } catch {
      // A broken stream must not break logging.
    }
  }
};

/**
 * Intercepts every message the default main logger processes, exactly once
 * (processMessage is called once per log call, before transports), keeps it in
 * the backfill buffer, and pushes it to active streams — the tRPC `logs.onLog`
 * subscription forwards these to the renderer's IndexedDB store.
 */
export const installLogBroadcaster = (): void => {
  const originalProcessMessage = log.processMessage.bind(log);
  log.processMessage = (message, options) => {
    const loggedAt = message.date;
    const createdAt = loggedAt instanceof Date && !Number.isNaN(loggedAt.getTime()) ? loggedAt.getTime() : Date.now();
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      createdAt,
      severity: severityFromElectronLogLevel(message.level),
      source: 'main',
      message: formatLogArgs(message.data)
    };
    recent.push(entry);
    if (recent.length > BUFFER_SIZE) {
      recent.splice(0, recent.length - BUFFER_SIZE);
    }
    notifyStreams(entry);
    return originalProcessMessage(message, options);
  };
};

/**
 * Creates an independent async generator over main-process log entries, one
 * per subscription. Entries emitted while the consumer is still processing the
 * previous one are queued, and the stream's listener is detached when the
 * generator is closed — its `finally` block runs when tRPC tears the
 * subscription down (client unsubscribe or window navigation).
 */
export const createMainLogStream = (): AsyncGenerator<LogEntry, void, unknown> => {
  const queue: LogEntry[] = [];
  let waitForNext: ((entry: LogEntry | undefined) => void) | undefined;

  const push = (entry: LogEntry) => {
    const pending = waitForNext;
    if (pending != null) {
      waitForNext = undefined;
      pending(entry);
      return;
    }
    queue.push(entry);
  };

  streamPushers.add(push);

  const waitForEntry = (): Promise<LogEntry | undefined> =>
    new Promise((resolve) => {
      waitForNext = resolve;
    });

  async function* stream(): AsyncGenerator<LogEntry, void, unknown> {
    try {
      while (true) {
        // eslint-disable-next-line no-await-in-loop -- the stream waits for the next entry each iteration
        const entry = queue.shift() ?? (await waitForEntry());
        if (entry == null) {
          return;
        }
        yield entry;
      }
    } finally {
      streamPushers.delete(push);
    }
  }

  return stream();
};

/** Most recent main-process entries, oldest first, capped to BUFFER_SIZE. */
export const recentMainLogs = (): LogEntry[] => [...recent];
