import React, { useState } from 'react';
import { ipcLink } from 'trpc-electron/renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import superjson from 'superjson';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { trpcReact } from '../lib/trpc';
import { Bimm } from './bimm';

const App = () => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            refetchInterval: false,
            refetchIntervalInBackground: true
          }
        }
      })
  );
  const [trpcClient] = useState(() =>
    trpcReact.createClient({
      links: [ipcLink({ transformer: superjson })]
    })
  );

  const DisplayError = ({ error }: FallbackProps) => {
    return (
      <div className="flex flex-col bg-red-400 text-red-950 p-5">
        <div className="p-2.5">{(error as Error).message}</div>
        <div className="p-2.5 text-xs">{(error as Error).stack}</div>
      </div>
    );
  };

  return (
    <trpcReact.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary FallbackComponent={DisplayError}>
          <Bimm />
        </ErrorBoundary>
      </QueryClientProvider>
    </trpcReact.Provider>
  );
};

export { App };
