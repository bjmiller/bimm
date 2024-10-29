import React, { useState } from 'react';
import { ipcLink } from 'trpc-electron/renderer';
import { createTRPCReact } from '@trpc/react-query';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type AppRouter } from '../../main/trpc';
import superjson from 'superjson';

const trpcReact = createTRPCReact<AppRouter>(); // Where should this live?

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
        <div className="font-hack">
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
