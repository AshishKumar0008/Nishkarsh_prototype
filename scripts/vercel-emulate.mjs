/**
 * Local stand-in for Vercel's router, to check a Build Output API directory before deploying:
 *   node scripts/vercel-emulate.mjs <path-to-.vercel/output> [port]
 * Applies config.json routes (header routes, dest rewrites, the filesystem phase) and calls the function the way
 * Vercel's Node launcher does. Copy the output folder OUTSIDE the repo first, so a missing file in the function
 * directory cannot be satisfied by the repo's own node_modules.
 */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const out = resolve(process.argv[2] ?? '.vercel/output');
const port = Number(process.argv[3] ?? 4300);
const config = JSON.parse(readFileSync(join(out, 'config.json'), 'utf8'));
const require = createRequire(join(out, 'x.js'));
const functions = {};
const getFunction = (name) => (functions[name] ??= require(join(out, 'functions', `${name}.func`, 'index.js')));

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };
const staticFile = (path) => {
  const file = join(out, 'static', path === '/' ? 'index.html' : path);
  return file.startsWith(join(out, 'static')) && existsSync(file) && statSync(file).isFile() ? file : null;
};

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let path = url.pathname;
  let phase = 'default';
  const extraHeaders = {};
  for (const route of config.routes) {
    if (route.handle) {
      phase = route.handle;
      if (phase === 'filesystem') {
        const f = staticFile(path);
        if (f) return send(res, f, extraHeaders);
      }
      continue;
    }
    const m = new RegExp(route.src).exec(path);
    if (!m) continue;
    Object.assign(extraHeaders, route.headers);
    if (route.continue) continue;
    if (route.dest) {
      const dest = route.dest.replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? '');
      const fnName = dest.replace(/^\//, '');
      if (existsSync(join(out, 'functions', `${fnName}.func`))) {
        for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
        return Promise.resolve(getFunction(fnName)(req, res)).catch((e) => { console.error(e); res.statusCode = 500; res.end('function crashed'); }); // req.url stays the original, as on Vercel
      }
      const f = staticFile(dest);
      if (f) return send(res, f, extraHeaders);
    }
  }
  res.statusCode = 404;
  res.end('Not found');
}).listen(port, () => console.log(`vercel-emulate: http://localhost:${port}  (output: ${out})`));

function send(res, file, headers) {
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.setHeader('content-type', types[extname(file)] ?? 'application/octet-stream');
  res.end(readFileSync(file));
}
