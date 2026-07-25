export const messageFrom = (err: unknown) => (err instanceof Error ? `${err.message}\n${err.stack}` : String(err));
