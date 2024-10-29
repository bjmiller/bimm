import { initTRPC } from '@trpc/server';
import { type TRPCContext } from '../types';
import superjson from 'superjson';

export const createContextCreator = (ctx: TRPCContext) => {
  // eslint-disable-next-line require-await
  return async () => {
    ctx.settings = ctx.settings ?? {};
    return ctx;
  };
};

const t = initTRPC.context<TRPCContext>().create({ transformer: superjson });
export const appRouter = t.router({
  settings: t.procedure.query(({ ctx }) => {
    return ctx.settings?.directories;
  }),
  date: t.procedure.query(() => {
    return new Date();
  })
});

export type AppRouter = typeof appRouter;
