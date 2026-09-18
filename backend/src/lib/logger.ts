import pino from 'pino';
import { env, isProd, isTest } from '../config/env.js';

export const logger = pino({
  level: isTest ? 'silent' : env.NODE_ENV === 'development' ? 'debug' : 'info',
  transport: !isProd && !isTest ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', singleLine: true, ignore: 'pid,hostname' } } : undefined,
});
