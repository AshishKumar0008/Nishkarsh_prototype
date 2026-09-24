# PraGaTi Setu

A pilot-to-procurement evidence and contracting layer for Maharashtra (SIH PS 26136).
Outcome-based challenge → GFR-cited eligibility → evaluation → milestone pilot → independent validation → audit-ready evidence packet.

- Workflow spec: [docs/workflow-spec.md](docs/workflow-spec.md)
- Research & strategy brief: [docs/research-brief.md](docs/research-brief.md)
- Template library (the real IP): [templates/](templates/)

## Stack

| | |
|---|---|
| `apps/web` | React 19 + Vite + TypeScript, Tailwind v4, TanStack Query, React Router |
| `apps/api` | Node + Express 5 + TypeScript (run with `tsx`), Prisma 6, PostgreSQL |
| `packages/shared` | Zod schemas (API contract), state-machine table, eligibility engine, problem-tag taxonomy |

## Setup

Requires Node ≥ 20 and PostgreSQL running locally.

```bash
createdb pragati_setu
cp apps/api/.env.example apps/api/.env      # then set DATABASE_URL to your Postgres user
npm install
npm run db:migrate                            # creates tables + runs seed
npm run dev                                   # api :4000, web :5173
```

Open http://localhost:5173 and use the **Demo: sign in as…** panel (all passwords `demo1234`).
Reset everything with `npm run db:reset`.

## Try the stage 1 → 3 flow

1. **Department Officer** (Anjali, Latur) → *New challenge* → fill the template → *Sign & publish*.
   The page shows a clustering hint because Dharashiv ZP has an open challenge of the same problem type.
2. **Startup** (Priya, KrishiSense) → *Apply*. The eligibility screen runs automatically → memo cites **GFR 173(i)** and **170(i)**.
3. **Startup** (Vikram, AgroLegacy) → apply to the same challenge → memo says *not eligible* (incorporated > 10 years ago).
4. **Finance Officer** (Suresh) → eligibility queue → confirm one memo, override the other (a written reason is required).
5. On any application, **Verify hash chain**. Then tamper with a row in the DB and verify again:
   ```sql
   UPDATE "AuditLog" SET payload = '{"hacked":true}' WHERE seq = 3;
   ```

## Architecture rules (read before writing code)

1. **Every state change goes through `transition()`** in [apps/api/src/core/stateMachine.ts](apps/api/src/core/stateMachine.ts).
   Never write `state:` in a Prisma `update` yourself. The allowed moves live in one table:
   [packages/shared/src/stateMachine.ts](packages/shared/src/stateMachine.ts). A new stage means adding rows there.
2. **Every stage write happens inside `prisma.$transaction`**: the stage record, the state change and the audit entry
   commit together or not at all.
3. **The audit log is append-only.** Use `appendAudit()`; never update or delete `AuditLog` rows.
4. **Validation lives in `packages/shared/src/schemas.ts`**, used by both the API and the forms.
5. **AI never decides.** Nothing AI-generated may call `transition()`; AI output is only ever a draft a human submits.
6. Money is stored as whole rupees (`Int`, suffix `Inr`).

## Status

| Stage | Backend | UI |
|---|---|---|
| 1 Challenge authoring (+ problem-tag clustering, zero-bid referral) | ✅ | ✅ |
| 2 Application | ✅ | ✅ |
| 3 Eligibility screen (GFR-citing memo + finance confirm/override) | ✅ | ✅ |
| 4 Evaluation (scorecards, COI) | schema only | — |
| 5 Pilot agreement + Commitment Card | schema only | — |
| 6 Milestones + dual sign-off + payment release | schema only | — |
| 7 Independent validation | schema only | — |
| 8 Decision + failure registry | schema only | — |
| 9 Evidence packet (PDF) | schema only | — |
| Cross-cutting: hash-chained audit log + verification | ✅ | ✅ |

## Team ownership

| Owner | Area |
|---|---|
| Backend A | `core/`, auth/RBAC, stage 5 agreement generator, stage 9 evidence PDF |
| Backend B | stage 4 scoring engine, stage 6 milestone/payment logic, stage 7–8 |
| Frontend A | officer, finance, evaluator screens |
| Frontend B | startup, field staff, validator screens, shared components |
| Domain lead | `templates/`, GFR rule data in `packages/shared/src/eligibility.ts`, rubric weights, problem tags |
| Demo lead | `apps/api/prisma/seed.ts` storyline, demo script, backup recording |

## Useful commands

```bash
npm test                          # unit tests (eligibility engine, audit hashing)
npm run typecheck                 # all workspaces
npm run db:studio -w @pragati/api # browse the DB
```
