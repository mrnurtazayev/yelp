type Level = 'debug' | 'info' | 'warn' | 'error';

const COLORS: Record<Level, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};

function write(level: Level, scope: string, args: unknown[]) {
  const ts = new Date().toISOString();
  const line = args
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ');
  // eslint-disable-next-line no-console
  console.log(`${COLORS[level]}${ts} [${level.toUpperCase()}] [${scope}]\x1b[0m ${line}`);
}

export function createLogger(scope: string) {
  return {
    debug: (...args: unknown[]) => write('debug', scope, args),
    info: (...args: unknown[]) => write('info', scope, args),
    warn: (...args: unknown[]) => write('warn', scope, args),
    error: (...args: unknown[]) => write('error', scope, args),
    log: (...args: unknown[]) => write('info', scope, args),
  };
}

export type Logger = ReturnType<typeof createLogger>;
