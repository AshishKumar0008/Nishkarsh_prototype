/**
 * Start-up checks for a deployed (NODE_ENV=production) instance. Pure function so it can be unit-tested;
 * index.ts refuses to start if it returns any problems — the safe default is to fail closed.
 */
export type EnvLike = Record<string, string | undefined>;

export const MIN_JWT_SECRET_LENGTH = 32;

export function productionConfigProblems(env: EnvLike): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];

  if (!env.DATABASE_URL) problems.push('DATABASE_URL is not set');

  const secret = env.JWT_SECRET ?? '';
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    problems.push(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters (generate one with: openssl rand -base64 48)`);
  } else if (/change-me/i.test(secret)) {
    problems.push('JWT_SECRET is still the placeholder from .env.example');
  }

  // Passwordless role switching is for fictional demo data only; it must be switched on deliberately.
  if (env.DEMO_MODE === 'true' && env.ALLOW_PUBLIC_DEMO !== 'true') {
    problems.push('DEMO_MODE=true exposes one-click login for every seeded account; set ALLOW_PUBLIC_DEMO=true to confirm this is a fictional-data demo');
  }
  return problems;
}
