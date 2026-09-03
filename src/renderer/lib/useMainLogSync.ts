import { useEffect } from 'react';
import { type LogEntry } from '../../types';
import { useTRPCClient } from './trpc';
import { addLogEntry } from './logStore';

/**
 * Merges main-process log entries into the renderer's IndexedDB store: fetches
 * the main process's in-memory buffer once (for lines emitted before this
 * subscription connected), then subscribes to the live feed.
 */
export const useMainLogSync = (): void => {
  const trpcClient = useTRPCClient();

  useEffect(() => {
    let disposed = false;
    const write = (entry: LogEntry) => {
      // Duplicate ids are harmless: the store's key is the id, so a put is an
      // idempotent overwrite.
      void addLogEntry(entry).catch((error: unknown) => {
        // eslint-disable-next-line no-console -- the store is failing; surface it in devtools
        console.error('Failed to persist log entry from the main process', error);
      });
    };
    void trpcClient.logs.getRecent.query().then((recent) => {
      if (disposed) {
        return;
      }
      for (const entry of recent) {
        write(entry);
      }
    });
    const subscription = trpcClient.logs.onLog.subscribe(undefined, { onData: write });
    return () => {
      disposed = true;
      subscription.unsubscribe();
    };
  }, [trpcClient]);
};
