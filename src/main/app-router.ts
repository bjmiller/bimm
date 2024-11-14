import { initTRPC } from '@trpc/server';
import { type TRPCContext } from '../types';
import superjson from 'superjson';
import { getAlbumDirectories } from './backend-ops';
import { z } from 'zod';

export const createContextCreator = (ctx: TRPCContext) => {
  // eslint-disable-next-line require-await
  return async () => {
    ctx.settings = ctx.settings ?? {};
    return ctx;
  };
};

const t = initTRPC.context<TRPCContext>().create({ transformer: superjson });
export const appRouter = t.router({
  settings: {
    getSettings: t.procedure.query(({ ctx }) => {
      return ctx.settings;
    })
  },
  file: {
    getAlbums: t.procedure.input(z.string().optional()).query(async ({ input }) => {
      const directoryEntries = await getAlbumDirectories(input);
      return directoryEntries.filter((entry) => entry.tracks?.length ?? 0 > 0);
    })
  }
});

export type AppRouter = typeof appRouter;
