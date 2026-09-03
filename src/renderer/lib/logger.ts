/* eslint-disable no-console -- the captured console methods below ARE the
   mirror: they forward to devtools exactly as the pre-logger calls did. */
import { formatLogArgs } from '../../lib/logFormat';
import { type LogSeverity } from '../../types';
import { addLogEntry } from './logStore';

// The un-hooked console methods, captured before anything can replace them.
const mirror = {
  debug: console.debug.bind(console),
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
};

function write(severity: LogSeverity, args: unknown[]): void {
  mirror[severity === 'debug' ? 'debug' : severity](...args);
  void addLogEntry({
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    severity,
    source: 'renderer',
    message: formatLogArgs(args)
  }).catch((error) => {
    mirror.error('Logger failed to persist a log entry', error);
  });
}

export const logger = {
  debug: (...args: unknown[]) => write('debug', args),
  log: (...args: unknown[]) => write('log', args),
  info: (...args: unknown[]) => write('info', args),
  warn: (...args: unknown[]) => write('warn', args),
  error: (...args: unknown[]) => write('error', args)
};
