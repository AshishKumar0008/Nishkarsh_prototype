# Template library — the project's actual IP

These documents are the product; the software is only their system of record.
**Owner: domain lead.** Every template is marked DRAFT until reviewed by a government law officer —
the UI must say so too. Placeholders use `{{fieldName}}` matching the Prisma/Zod field names so the
API can fill them automatically.

| File | Stage | Status |
|---|---|---|
| `problem-statement.md` | 1 | Draft — mirrors `createChallengeSchema` |
| `pilot-agreement.md` | 5 | v0.1 draft — used live by the API; **needs law-officer review** |
| `ip-data-clauses.md` | 5 | v0.1 draft — `STANDARD` and `SENSITIVE_PII` variants; **needs review** |
| `commitment-card.md` | 5a | v0.1 draft — documents `buildCommitmentCard()` |

When a template changes, bump its version line. Signed agreements record the template version they used.

**How the API uses them (stage 5):** `apps/api/src/core/templates.ts` reads the file on every request (edits show
up without a restart), fills every `{{placeholder}}` — refusing to render if any is missing or left over — and
inserts the one `## VARIANT:` section of `ip-data-clauses.md` matching the agreement's data sensitivity. The
rendered text is hashed (SHA-256) and both parties sign that hash. Keep the first-line header comment intact: the
API reads the version from it.
