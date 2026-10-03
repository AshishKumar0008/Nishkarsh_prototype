# Deploying the prototype on Vercel (demo)

One Vercel project serves the built web app **and** the API on a single URL, backed by a Neon Postgres database.
It is a demo with **fictional data**; the security gaps in the detailed report (Section 15) still apply, so never load
real data into it. For the Render alternative see [deploy.md](deploy.md).

## How it works

`npm run build:vercel` (set as the Build Command in `vercel.json`) does four things:

1. generates the Prisma client (with the engine for Vercel's Linux runtime);
2. applies database migrations over the **direct** connection and, if the database is empty, loads the demo data and
   replays the demo storyline through the real API. A populated database is never touched;
3. builds the web app;
4. writes a Vercel [Build Output](https://vercel.com/docs/build-output-api) directory: the web app as static files, the
   API bundled into one function, and routes (`/api/*` goes to the function, files are served as is, everything else
   returns the app shell).

The generated `.vercel/output` is git-ignored. Locally, `scripts/vercel-emulate.mjs` imitates Vercel's router so the
output can be tested before deploying (see "Test it locally").

## Setup

1. **Project.** Use the project connected to `AshishKumar0008/Nishkarsh_prototype`, branch `main`.
   - Settings → General → **Root Directory**: empty (repo root).
   - Settings → Build and Deployment → **Node.js Version**: 22.x. Leave Framework Preset as "Other" and leave the Build,
     Install and Output settings alone; `vercel.json` provides them.
2. **Database.** Project → **Storage** → create a **Neon** Postgres database (Vercel Marketplace) and connect it to the
   project for Production. This adds `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct) automatically.
3. **Environment variables** (Production), added by you:

   | Variable | Value |
   |---|---|
   | `JWT_SECRET` | a random string of 32+ characters, e.g. the output of `openssl rand -base64 48` |
   | `DEMO_MODE` | `true` (passwordless one-click role switching; fictional data only) |
   | `ALLOW_PUBLIC_DEMO` | `true` (confirms the line above; the API refuses to start in production without it) |

   Optional: `AUTO_SEED=false` to skip first-build demo data; `AUTO_DEMO_PILOT=false` to skip the storyline;
   `DIRECT_URL` to override the direct connection string.
4. **Deploy.** Push to `main` or press **Redeploy**. The first build takes a few minutes because it also seeds the database.
5. **Check.** Open `/api/health` (expect `{"ok":true}`), then the login page; the demo roles should be listed. If the
   API is misconfigured it answers `500` with the names of the missing settings, never their values.

## Things to know

- **Seeding happens at build time**, on the first deployment against an empty database. Later deployments keep the data.
  To reset, delete the data in the Neon console (or create a fresh database), then redeploy.
- **Anyone with the link can act as any demo role and change the demo data.** That is the point of the demo.
- **Cold starts.** Neon suspends an idle database after about 5 minutes and wakes in a second or two; a function that has
  been idle also starts cold. Open the link yourself shortly before it is judged.
- **Plan limits.** Vercel's free Hobby plan is for non-commercial use and has usage limits; check them against how many
  evaluators will use the demo.
- **Hosting region.** Choose the Neon region closest to your users when you create the database. The data is fictional,
  so residency does not matter for the demo, but a real deployment would need India-hosted infrastructure.
- Payments are simulated and the templates are drafts; the UI says so.

## Test it locally

Needs a local Postgres. Use a scratch database, not one you care about.

```bash
export DATABASE_URL=postgresql://USER@localhost:5432/nishkarsh_scratch
npm run build:vercel                      # migrations, demo data, web build, bundle
cp -R .vercel/output /tmp/vout            # copy OUTSIDE the repo so missing files are not hidden by the repo's node_modules
NODE_ENV=production JWT_SECRET=$(openssl rand -base64 48) DEMO_MODE=true ALLOW_PUBLIC_DEMO=true \
  node scripts/vercel-emulate.mjs /tmp/vout 4300
# then open http://localhost:4300
```

## What this has and has not been tested for

Tested locally: the build end to end, the bundled function running from a folder outside the repo (database access
through Prisma, template rendering, the full demo storyline, the audit chain), static files, the app-shell fallback, and
response headers. Not tested here, because it needs Vercel itself: that Vercel picks up `.vercel/output` from the build
command, the function runtime, and Neon's pooled connection. If a deploy fails, the build log and the function logs
(Vercel → Deployment → Logs) show where.
