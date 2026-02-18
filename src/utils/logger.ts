type Level = 'debug' | 'info' | 'warn' | 'error';

function log(level: Level, message: string, data?: Record<string, unknown>): void {
  const line = JSON.stringify({ level, message, timestamp: new Date().toISOString(), ...data });
  if (level === 'warn' || level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, data?: Record<string, unknown>): void => log('debug', message, data),
  info:  (message: string, data?: Record<string, unknown>): void => log('info',  message, data),
  warn:  (message: string, data?: Record<string, unknown>): void => log('warn',  message, data),
  error: (message: string, data?: Record<string, unknown>): void => log('error', message, data),
};
