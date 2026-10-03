# Deploying the prototype (demo)

This puts the prototype on a public URL **with fictional data**, so evaluators can click through it. It is not a
production deployment: the security gaps listed in the detailed report (Section 15) still apply, so never load real
department or startup data into it.

## What gets deployed

One Node service serves both the API (`/api/*`) and the built React app, so there is a single URL and no CORS setup.
A Postgres database sits behind it. `render.yaml` describes both for [Render](https://render.com).

On the first start against an empty database the server loads the seeded demo data and replays the demo storyline
(`AUTO_SEED`, `AUTO_DEMO_PILOT`). A restart never wipes data, because seeding only runs when there are no users.

## Steps (Render)

1. Push this branch to GitHub (the repo must be connected to your Render account).
2. In Render: **New → Blueprint**, pick the repo and branch, and apply. It creates the database and the web service.
3. Wait for the first deploy (a few minutes). Open the service URL; the login page shows the one-click demo roles.
4. Check `https://<your-service>.onrender.com/api/health` returns `{"ok":true}`.

Environment variables (all set by the blueprint — `JWT_SECRET` is generated for you):

| Variable | Purpose |
|---|---|
| `NODE_ENV=production` | Turns on the start-up safety checks, the CSP header and HSTS |
| `DATABASE_URL` | Connection string of the Render database |
| `JWT_SECRET` | Signing key; the server refuses to start if it is under 32 characters or the example placeholder |
| `DEMO_MODE=true` + `ALLOW_PUBLIC_DEMO=true` | One-click, passwordless role switching. The server refuses `DEMO_MODE` in production unless you also confirm with `ALLOW_PUBLIC_DEMO` |
| `AUTO_SEED`, `AUTO_DEMO_PILOT` | First-boot demo data and storyline |
| `CORS_ORIGIN` | Optional comma-separated allow-list. Leave unset: the UI and API share an origin |
| `TRUST_PROXY` | Number of proxy hops in front of the app (default 1) |
| `RATE_LIMIT=off` | Disables the rate limiter (only for load testing) |

## Things to know before the evaluators open it

- **Cold starts.** A free Render web service sleeps after 15 minutes without traffic and takes about a minute to wake
  ([Render free-tier limits](https://render.com/docs/free)). Open the link yourself shortly before it is judged, or pay
  for an always-on instance.
- **The free database expires 30 days after creation** (14-day grace period), then it is deleted. When that happens,
  create a new database and redeploy; the first boot reseeds it. A longer-lived free database elsewhere (for example
  Neon) works too: set `DATABASE_URL` to its connection string and remove the `databases:` block from `render.yaml`.
- **Anyone with the link can act as any demo role and change the demo data.** That is the point of the demo, but it
  means the data can end up in odd states. To reset: create a fresh database (or empty the tables) and redeploy.
- **Hosting region.** The blueprint uses Singapore, not India. The data is fictional, so this does not matter for the
  demo; a real deployment would need India-hosted infrastructure.
- **Payments are simulated and templates are drafts.** The UI says so; keep saying so in the pitch.

## Running the same thing locally

```bash
npm ci && npm run build
NODE_ENV=production PORT=4000 DATABASE_URL=... JWT_SECRET=$(openssl rand -base64 48) \
  DEMO_MODE=true ALLOW_PUBLIC_DEMO=true AUTO_SEED=true AUTO_DEMO_PILOT=true npm start
```

Replay the demo storyline against any running instance (needs `DEMO_MODE` on that instance):

```bash
API_URL=https://<your-service>.onrender.com/api npm run demo:pilot
```
