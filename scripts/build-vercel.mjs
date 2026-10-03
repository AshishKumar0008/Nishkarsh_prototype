/**
 * Vercel build: produces a Build Output API v3 directory (.vercel/output) containing
 *   static/                       the built web app
 *   functions/api.func/           the Express API, bundled into one file with Prisma's runtime beside it
 *   config.json                   routes: /api -> the function, files from static/, everything else -> index.html
 * Run by Vercel as the Build Command (see vercel.json); also runnable locally. Set SKIP_DB=1 to skip database work.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { CSP } from '../apps/api/src/middleware/security';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', env: process.env });
  if (r.status !== 0) {
    console.error(`\n✗ ${cmd} ${args.join(' ')} failed (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
};

console.log('▶ 1/4 Prisma client');
run('npm', ['run', 'db:generate', '-w', '@nishkarsh/api']);

console.log('▶ 2/4 Database: migrations and first-boot demo data');
if (process.env.SKIP_DB === '1') console.log('  SKIP_DB=1 — skipped');
else run('npx', ['tsx', 'apps/api/scripts/vercel-predeploy.ts']);

console.log('▶ 3/4 Web app');
run('npm', ['run', 'build', '-w', '@nishkarsh/web']);

console.log('▶ 4/4 Build Output');
const out = join(root, '.vercel', 'output');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'static'), { recursive: true });
cpSync(join(root, 'apps/web/dist'), join(out, 'static'), { recursive: true });

const fn = join(out, 'functions', 'api.func');
mkdirSync(fn, { recursive: true });
await build({
  entryPoints: [join(root, 'apps/api/src/vercel.ts')],
  outfile: join(fn, 'index.js'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  // Prisma's client carries a native query engine, so it ships as files next to the bundle instead of inside it
  external: ['@prisma/client', '.prisma/client'],
  define: { 'import.meta.url': '__importMetaUrl' },
  banner: {
    js: [
      "const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;",
      "process.env.TEMPLATES_DIR ??= require('node:path').join(__dirname, 'templates') + '/';",
    ].join('\n'),
  },
  footer: { js: 'module.exports = module.exports.default;' },
  legalComments: 'none',
  logLevel: 'info',
});
cpSync(join(root, 'templates'), join(fn, 'templates'), { recursive: true });

// Prisma runtime + generated client (with the engine for this machine and for Lambda's Amazon Linux)
const clientDir = dirname(createRequire(join(root, 'apps/api/package.json')).resolve('@prisma/client/package.json'));
const modules = resolve(clientDir, '..', '..');
cpSync(clientDir, join(fn, 'node_modules/@prisma/client'), { recursive: true, dereference: true });
cpSync(join(modules, '.prisma'), join(fn, 'node_modules/.prisma'), { recursive: true, dereference: true });

writeFileSync(join(fn, 'package.json'), JSON.stringify({ type: 'commonjs' }));
writeFileSync(
  join(fn, '.vc-config.json'),
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.js', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 30 }, null, 2),
);

const pageHeaders = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=15552000; includeSubDomains',
};
writeFileSync(
  join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        // The API answers its own headers; these cover the static app
        { src: '^/(?!api(?:/|$)).*$', headers: pageHeaders, continue: true },
        { src: '^/assets/.*$', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
        { src: '^/api(?:/.*)?$', dest: '/api' },
        { handle: 'filesystem' },
        { src: '^/.*$', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);
console.log('✓ Build output written to .vercel/output');
