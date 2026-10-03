/**
 * Build-time database work for a Vercel deployment (run by scripts/build-vercel.mjs, which Vercel runs as the build):
 *   1. apply pending migrations over the DIRECT (non-pooled) connection;
 *   2. on an empty database, load the fictional demo data and replay the demo storyline through the real API,
 *      served in-process on a throwaway port. A populated database is never touched.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

const direct =
  process.env.DIRECT_URL || process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
if (!direct) {
  console.error('predeploy: no database connection string. Set DATABASE_URL (and DATABASE_URL_UNPOOLED or DIRECT_URL for the direct one).');
  process.exit(1);
}

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const migrate = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: apiDir, stdio: 'inherit', env: { ...process.env, DATABASE_URL: direct } });
if (migrate.status !== 0) {
  console.error('predeploy: prisma migrate deploy failed');
  process.exit(migrate.status ?? 1);
}

// Everything below runs in this build process only; none of these values reach the deployed function.
process.env.DATABASE_URL = direct;
process.env.JWT_SECRET ||= randomBytes(32).toString('base64');
process.env.DEMO_MODE = 'true'; // the storyline signs in through the demo login
process.env.AUTO_SEED ??= 'true';
process.env.AUTO_DEMO_PILOT ??= 'true';

const { createApp } = await import('../src/app');
const { bootstrapDemoData } = await import('../src/core/bootstrap');
const { prisma } = await import('../src/core/prisma');

const server = createApp().listen(0, '127.0.0.1');
await once(server, 'listening');
try {
  await bootstrapDemoData((server.address() as AddressInfo).port);
} finally {
  server.close();
  await prisma.$disconnect();
}
console.log('predeploy: database ready');
