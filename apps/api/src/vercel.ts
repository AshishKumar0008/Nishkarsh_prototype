import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './app';
import { productionConfigProblems } from './core/config';

/**
 * Entry point of the Vercel Function (bundled by scripts/build-vercel.mjs). Vercel invokes it with a raw Node
 * request/response pair, which an Express app handles directly.
 *
 * A misconfigured project answers every request with a readable 500 instead of an opaque crash, so the cause is
 * visible in the browser and in the function logs. Only the names of the problems are shown, never secret values.
 */
const problems = productionConfigProblems(process.env);
const app = problems.length ? null : createApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (!app) {
    console.error('Nishkarsh API not started:', problems.join('; '));
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Server is misconfigured', problems }));
    return;
  }
  return (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
}
