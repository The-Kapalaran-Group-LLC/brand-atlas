type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const readNodeEnv = (): string => {
  try {
    return (process?.env?.NODE_ENV || '').toLowerCase();
  } catch {
    return '';
  }
};

const isDebugEnabled = (): boolean => {
  try {
    const viteDev = Boolean((import.meta as any)?.env?.DEV);
    if (viteDev) return true;
  } catch {
    // no-op
  }
  return readNodeEnv() !== 'production';
};

const formatMessage = (message: string): string => `[ui] ${message}`;

export const logger = {
  debug(message: string, context?: unknown) {
    if (!isDebugEnabled()) return;
    console.log(formatMessage(message), context ?? '');
  },
  info(message: string, context?: unknown) {
    console.info(formatMessage(message), context ?? '');
  },
  warn(message: string, context?: unknown) {
    console.warn(formatMessage(message), context ?? '');
  },
  error(message: string, context?: unknown) {
    console.error(formatMessage(message), context ?? '');
  },
};

export type { LogLevel };
