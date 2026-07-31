/**
 * Privacy-safe logger.
 *
 * PRIVACY RULE: callers must NEVER pass customer data (names, emails, account
 * details, AI prompts/responses derived from customer data) to these methods.
 * The logger is for diagnostics about the extension's own behavior only.
 *
 * Debug/info logs are suppressed in production builds; warnings and errors are
 * always surfaced so genuine failures remain visible.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const PREFIX = '[SideRep]';
const isDev = Boolean(import.meta.env?.DEV);

function emit(level: LogLevel, args: unknown[]): void {
  if ((level === 'debug' || level === 'info') && !isDev) return;
  console[level](PREFIX, ...args);
}

export const logger = {
  debug: (...args: unknown[]) => emit('debug', args),
  info: (...args: unknown[]) => emit('info', args),
  warn: (...args: unknown[]) => emit('warn', args),
  error: (...args: unknown[]) => emit('error', args),
  /** Creates a child logger that tags every line with a scope label. */
  scope(scope: string) {
    const tag = `(${scope})`;
    return {
      debug: (...args: unknown[]) => emit('debug', [tag, ...args]),
      info: (...args: unknown[]) => emit('info', [tag, ...args]),
      warn: (...args: unknown[]) => emit('warn', [tag, ...args]),
      error: (...args: unknown[]) => emit('error', [tag, ...args]),
    };
  },
};
