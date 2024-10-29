import { createTRPCReact } from '@trpc/react-query';
import { type AppRouter } from '../../main/app-router';

export const trpcReact = createTRPCReact<AppRouter>();
