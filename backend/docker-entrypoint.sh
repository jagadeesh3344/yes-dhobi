#!/bin/sh
# Container entrypoint.
#  - On AWS the database URL is assembled from parts (host/name/user from the task
#    definition, password injected from Secrets Manager) so no secret is ever
#    written into an environment file.
#  - Runs pending Prisma migrations, optionally seeds reference data, then starts the API.
set -e

if [ -z "$DATABASE_URL" ] && [ -n "$DB_HOST" ]; then
  # url-encode the password (node is available in the image)
  ENC_PASS=$(node -e "process.stdout.write(encodeURIComponent(process.env.DB_PASSWORD || ''))")
  export DATABASE_URL="postgresql://${DB_USER:-yesdhobi}:${ENC_PASS}@${DB_HOST}:${DB_PORT:-5432}/${DB_NAME:-yesdhobi}?schema=public"
fi

echo "[entrypoint] applying migrations"
npx prisma migrate deploy

if [ "$SEED_ON_BOOT" = "true" ]; then
  echo "[entrypoint] seeding reference data (idempotent)"
  node dist/prisma/seed.js || echo "[entrypoint] seed failed (continuing)"
fi

exec node dist/server.js
