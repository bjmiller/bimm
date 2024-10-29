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
    /**
     * This Typescript error is WEIRD.  It seems that tsc attempts to load the
     * types for react-query from two different places among its built files,
     * and even though the types are equivalent, they are not assignable to one
     * another due to the use of private fields.  Oddly, this doesn't come up
     * while the LSP is type checking, only during the webpack build.  And, only
     * sometimes?  Also, the issue goes away if I switch the module settings from
     * "Node10/CommonJS" to "NodeNext".  But, that breaks other things.
     * The easiest solution is to silence the error, since it's not a "real" issue.
     * The code runs fine.
     */
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
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
  const settingsQuery = trpcReact.settings.getSettings.useQuery();

  return <span>{JSON.stringify(settingsQuery.data)}</span>;
};

export { App };
