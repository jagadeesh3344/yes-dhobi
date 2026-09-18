import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { ensureSequences } from './lib/ids.js';
import { initSocket } from './realtime/socket.js';
import { startDispatchSweeper, stopDispatchSweeper } from './services/dispatch.js';

async function main() {
  await prisma.$connect();
  await ensureSequences();

  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);
  startDispatchSweeper();

  server.listen(env.PORT, () => {
    logger.info(`Yes Dhobi API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
    if (env.OTP_DEV_MODE) logger.warn('OTP_DEV_MODE on: every OTP is 1234');
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    stopDispatchSweeper();
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'failed to start');
  process.exit(1);
});
