import type { Logger } from '@cairn/core';

// The Logger port, console-backed. Main's stdout is what `electron-vite dev` and the Playwright
// leg capture, so there is nothing to invent here — only a stable prefix and a level filter.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function format(level: LogLevel, msg: string, data?: object): string {
  const suffix = data === undefined ? '' : ` ${JSON.stringify(data)}`;
  return `[cairn:${level}] ${msg}${suffix}`;
}

export function createLogger(min: LogLevel = 'info'): Logger {
  const enabled = (level: LogLevel): boolean => ORDER[level] >= ORDER[min];
  return {
    debug: (m, d) => {
      if (enabled('debug')) console.log(format('debug', m, d));
    },
    info: (m, d) => {
      if (enabled('info')) console.log(format('info', m, d));
    },
    warn: (m, d) => {
      if (enabled('warn')) console.warn(format('warn', m, d));
    },
    error: (m, d) => {
      if (enabled('error')) console.error(format('error', m, d));
    },
  };
}

export const log: Logger = createLogger(process.env['CAIRN_LOG'] === 'debug' ? 'debug' : 'info');
