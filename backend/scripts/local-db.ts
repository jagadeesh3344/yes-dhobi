/**
 * Starts an embedded PostgreSQL 16 server for local development when Docker
 * is not available.  Data lives in ./.pgdata.  Run with `npm run db:local`
 * and leave the process running; the DATABASE_URL in .env.example already
 * points at it (yesdhobi/yesdhobi @ localhost:5432/yesdhobi).
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.cwd(), '.pgdata');
const port = Number(process.env.PGPORT ?? 5432);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'yesdhobi',
  password: 'yesdhobi',
  port,
  persistent: true,
  // Windows would otherwise initialise the cluster as WIN1252, which rejects characters like the rupee sign
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
  onError: (msg) => console.error(String(msg)),
});

async function main() {
  if (!existsSync(dataDir)) {
    console.log(`Initialising embedded PostgreSQL cluster in ${dataDir} ...`);
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase('yesdhobi');
  } catch {
    // already exists
  }
  console.log(`PostgreSQL ready on postgresql://yesdhobi:yesdhobi@localhost:${port}/yesdhobi`);
  console.log('Press Ctrl+C to stop.');

  const stop = async () => {
    console.log('\nStopping embedded PostgreSQL ...');
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
