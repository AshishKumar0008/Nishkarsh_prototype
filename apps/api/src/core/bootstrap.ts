import { seedDemoData } from '../../prisma/seed';
import { prisma } from './prisma';

/**
 * First-boot demo data for hosts with no shell (e.g. a free web service). Runs only when AUTO_SEED=true AND the
 * database has no users, so a restart never wipes anything. Optionally replays the demo storyline (a pilot with
 * milestone 1 complete) through the server's own API, exactly as `npm run demo:pilot` does.
 */
export async function bootstrapDemoData(port: number) {
  if (process.env.AUTO_SEED !== 'true') return;
  if ((await prisma.user.count()) > 0) {
    console.log('AUTO_SEED: database already has users — leaving it untouched');
    return;
  }
  console.log('AUTO_SEED: empty database — loading fictional demo data');
  await seedDemoData(prisma);

  if (process.env.AUTO_DEMO_PILOT === 'true') {
    process.env.API_URL = `http://127.0.0.1:${port}/api`;
    try {
      // The script drives the real API (so every step lands in the audit chain); it needs DEMO_MODE for its logins
      const script = '../../../../scripts/demo-pilot.mjs'; // variable specifier: it is a plain .mjs with no type declarations
      await import(script);
    } catch (e) {
      console.error('AUTO_SEED: demo storyline failed (the base demo data is still loaded):', e instanceof Error ? e.message : e);
    }
  }
}
