/**
 * Serverless databases hand out a pooled (PgBouncer) connection string for runtime and a direct one for migrations.
 * Prisma needs `pgbouncer=true` on the pooled one (no prepared statements across pooled connections) and a small
 * per-instance pool, because every serverless instance opens its own.
 */
export function normaliseDatabaseUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url; // not a URL we understand; let Prisma report it
  }
  const pooled = /-pooler\./.test(parsed.hostname) || parsed.port === '6543';
  if (pooled) {
    if (!parsed.searchParams.has('pgbouncer')) parsed.searchParams.set('pgbouncer', 'true');
    if (!parsed.searchParams.has('connection_limit')) parsed.searchParams.set('connection_limit', '5');
  }
  return parsed.toString();
}
