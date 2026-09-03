import { type LogSeverity } from '../types';

const SPACES = 2;

/**
 * Renders one log-call argument as text. Strings pass through untouched,
 * Errors keep their stack, everything else is JSON-stringified with 2-space
 * indent so objects stay readable, plus a
 * String() fallback so a logging bug can never mask the original message.
 */
export const formatLogArg = (arg: unknown): string => {
  if (typeof arg === 'string') {
    return arg;
  }

  if (arg instanceof Error) {
    return arg.stack != null ? `${arg.name}: ${arg.message}\n${arg.stack}` : `${arg.name}: ${arg.message}`;
  }

  try {
    return JSON.stringify(arg, null, SPACES) ?? String(arg);
  } catch {
    return String(arg);
  }
};

export const formatLogArgs = (args: unknown[]): string => args.map(formatLogArg).join(' ');

/**
 * Maps electron-log levels to the store's severities. electron-log aliases
 * `log.log` to `log.info`, so its 'info' level lands on 'log'; the remaining
 * levels collapse into debug.
 */
export const severityFromElectronLogLevel = (level: string): LogSeverity => {
  switch (level) {
    case 'error':
      return 'error';
    case 'warn':
      return 'warn';
    case 'info':
      return 'log';
    default:
      return 'debug';
  }
};
