import React, { useState } from 'react';
import { ipcLink } from 'trpc-electron/renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import superjson from 'superjson';
import { trpcReact } from '../lib/trpc';

const App = () => {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpcReact.createClient({
      links: [ipcLink({ transformer: superjson })]
    })
  );

  return (
    <trpcReact.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <div>
          <ShowSettings />
        </div>
      </QueryClientProvider>
    </trpcReact.Provider>
  );
};

const ShowSettings = () => {
  const settingsQuery = trpcReact.date.useQuery();

  return <span>{JSON.stringify(settingsQuery.data?.getFullYear())}</span>;
};

export { App };
