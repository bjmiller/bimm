import { type LogEntry } from '../../types';

// Line age limit; entries older than this are removed whenever a new one is
// added.
const TTL_HOURS = 48;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_SECOND = 1000;

export const LOG_TTL_MS = TTL_HOURS * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;

const DB_NAME = 'bimm-logs';
const DB_VERSION = 1;
const STORE_NAME = 'logs';

// Bound the open request so a wedged database (e.g. its LevelDB lock held by
// another app instance) rejects instead of leaving every caller hanging.
const OPEN_TIMEOUT_MS = 5000;
// A second app instance briefly holds the database lock while starting up;
// one delayed retry clears that transient contention.
const OPEN_RETRY_DELAY_MS = 1000;

let dbPromise: Promise<IDBDatabase> | undefined;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function openDatabaseOnce(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out opening the log database'));
    }, OPEN_TIMEOUT_MS);
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('createdAt', 'createdAt');
    };
    request.onsuccess = () => {
      clearTimeout(timeout);
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => {
      clearTimeout(timeout);
      reject(request.error ?? new Error('Failed to open log database'));
    };
    request.onblocked = () => {
      clearTimeout(timeout);
      reject(new Error('Log database is locked by another window'));
    };
  });
}

function openDatabase(): Promise<IDBDatabase> {
  dbPromise ??= openDatabaseOnce().catch(async (firstError: unknown) => {
    await delay(OPEN_RETRY_DELAY_MS);
    return openDatabaseOnce().catch((secondError: unknown) => {
      // Drop the cached promise so a later caller can retry from scratch.
      dbPromise = undefined;
      throw secondError instanceof Error
        ? secondError
        : firstError instanceof Error
          ? firstError
          : new Error('Failed to open log database');
    });
  });
  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Log database request failed'));
  });
}

export const addLogEntry = async (entry: LogEntry): Promise<void> => {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put(entry);
    // Purge entries that have aged out of the 48-hour window.
    const cursorRequest = store.index('createdAt').openCursor(IDBKeyRange.upperBound(Date.now() - LOG_TTL_MS));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor != null) {
        cursor.delete();
        cursor.continue();
      }
    };
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Log write failed'));
  });
  notifyChanged();
};

export const getAllLogs = async (): Promise<LogEntry[]> => {
  const db = await openDatabase();
  const entries = await requestToPromise<LogEntry[]>(
    db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll() as IDBRequest<LogEntry[]>
  );
  return entries.sort((a, b) => a.createdAt - b.createdAt);
};

export const clearLogs = async (): Promise<void> => {
  const db = await openDatabase();
  await requestToPromise(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).clear());
  notifyChanged();
};

const changeListeners = new Set<() => void>();

const notifyChanged = () => {
  for (const listener of changeListeners) {
    listener();
  }
};

export const subscribeToLogChanges = (listener: () => void): (() => void) => {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
};
