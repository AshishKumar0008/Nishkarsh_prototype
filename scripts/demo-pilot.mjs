/**
 * Builds the demo storyline through the real API (so every step is in the audit chain):
 * KrishiSense applies → eligible → panel scores (one evaluator recused) → agreement signed by both sides
 * → pilot started → milestone 1 complete with tranche released → milestone 2 awaiting sign-off.
 * AgroLegacy applies too and is found ineligible.
 *
 * Usage (API running, DEMO_MODE=true, fresh seed):  npm run db:seed && npm run demo:pilot
 */
const API = process.env.API_URL ?? 'http://localhost:4000/api';

async function call(path, { token, body, method } = {}) {
  const res = await fetch(API + path, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method ?? (body ? 'POST' : 'GET')} ${path} → ${res.status} ${JSON.stringify(data)}`);
  return data;
}

const tokens = {};
async function as(email) {
  if (!tokens[email]) {
    const user = users.find((u) => u.email === email);
    tokens[email] = (await call('/auth/demo-login', { body: { role: user.role, email } })).token;
  }
  return tokens[email];
}

const users = await call('/auth/demo-users');
const id = (email) => users.find((u) => u.email === email).id;
const step = (msg) => console.log(`✓ ${msg}`);

const challenges = await call('/challenges', { token: await as('officer@latur.demo') });
const challenge = challenges.find((c) => c.district === 'Latur' && c.state === 'PUBLISHED');
if (!challenge) throw new Error('Latur challenge not found — run `npm run db:seed` first');

// Stage 2–3 — applications, auto-screened on submit
const krishi = await call(`/challenges/${challenge.id}/applications`, {
  token: await as('founder@krishisense.demo'),
  body: {
    solutionSummary: 'Solar soil-moisture probes on each plot with irrigation advisories sent in Marathi by SMS and voice.',
    approach: 'One probe per enrolled plot; krishi sahayaks get a village dashboard; farmers get irrigate / hold messages.',
    pilotPlan: 'M1 install probes and train staff; M2 advisories in routine use; M3 season water-use report for the validator.',
    teamSummary: 'Engineers, two agronomists and field coordinators based in Chhatrapati Sambhajinagar.',
    proposedPriceInr: 11_00_000,
    declaredTurnoverInr: 1_20_00_000,
    selfDeclarationAccepted: true,
  },
});
const legacy = await call(`/challenges/${challenge.id}/applications`, {
  token: await as('founder@agrolegacy.demo'),
  body: {
    solutionSummary: 'Weather-station network with district-level irrigation bulletins for agriculture offices.',
    approach: 'Install automatic weather stations per circle and publish weekly advisories through the department.',
    pilotPlan: 'M1 install stations; M2 weekly bulletins; M3 season report comparing advisories with actual rainfall.',
    teamSummary: 'Hardware and meteorology team operating since 2014 in western Maharashtra.',
    proposedPriceInr: 11_00_000,
    declaredTurnoverInr: 8_50_00_000,
    selfDeclarationAccepted: true,
  },
});
step('KrishiSense and AgroLegacy applied (auto-screened)');

const finance = await as('finance@latur.demo');
await call(`/applications/${krishi.id}/eligibility`, { token: finance, body: { decision: 'CONFIRM' } });
await call(`/applications/${legacy.id}/eligibility`, { token: finance, body: { decision: 'CONFIRM' } });
step('Finance confirmed both memos (KrishiSense eligible, AgroLegacy not)');

// Stage 4 — panel evaluation with one recusal
const officer = await as('officer@latur.demo');
await call(`/applications/${krishi.id}/open-evaluation`, { token: officer, body: {} });
const e1 = await as('evaluator1@panel.demo');
await call(`/applications/${krishi.id}/coi`, { token: e1, body: { hasConflict: false } });
await call(`/applications/${krishi.id}/score`, {
  token: e1,
  body: { technicalMerit: 8, feasibility: 7, fieldFit: 9, cost: 6, comments: 'Strong Marathi advisory design; check probe calibration.' },
});
await call(`/applications/${krishi.id}/coi`, {
  token: await as('evaluator2@panel.demo'),
  body: { hasConflict: true, details: 'Advised this startup on sensor calibration in 2025.' },
});
const e3 = await as('evaluator3@panel.demo');
await call(`/applications/${krishi.id}/coi`, { token: e3, body: { hasConflict: false } });
await call(`/applications/${krishi.id}/score`, {
  token: e3,
  body: { technicalMerit: 7, feasibility: 7, fieldFit: 9, cost: 7, comments: 'Fits field staff workload; good offline behaviour.' },
});
const afterScoring = await call(`/applications/${krishi.id}`, { token: officer });
if (afterScoring.state === 'UNDER_EVALUATION') {
  await call(`/applications/${krishi.id}/finalize-evaluation`, { token: officer, body: {} });
}
step('Panel scored 7.60 with Arjun Rao recused → Selected');

// Stage 5 — agreement drafted, startup signs the hash first, finance executes
await call(`/applications/${krishi.id}/agreement`, {
  token: finance,
  method: 'PUT',
  body: {
    pilotStartDate: new Date().toISOString().slice(0, 10),
    dataSensitivity: 'STANDARD',
    milestones: [
      { title: 'Deployment complete', description: 'Probes installed on enrolled plots; field staff trained.', dueWeek: 4, paymentTrancheInr: 3_30_000 },
      { title: 'Field adoption', description: 'Advisories in routine daily use by krishi sahayaks.', dueWeek: 10, paymentTrancheInr: 4_40_000 },
      { title: 'Validated outcome', description: 'Water use per hectare measured by the validator.', dueWeek: 16, paymentTrancheInr: 3_30_000 },
    ],
  },
});
const { agreement } = await call(`/applications/${krishi.id}/agreement`, { token: finance });
await call(`/applications/${krishi.id}/agreement/sign`, { token: await as('founder@krishisense.demo'), body: { contentHash: agreement.contentHash } });
await call(`/applications/${krishi.id}/agreement/sign`, { token: finance, body: { contentHash: agreement.contentHash } });
step('Agreement signed by startup and finance (same SHA-256 hash)');

// Stage 6 — pilot, milestone 1 complete, milestone 2 waiting for sign-off
await call(`/applications/${krishi.id}/pilot/start`, {
  token: officer,
  body: { fieldSupervisorId: id('field@latur.demo'), validatorId: id('validator@vnmkv.demo') },
});
const founder = await as('founder@krishisense.demo');
await call(`/applications/${krishi.id}/milestones/1/submit`, {
  token: founder,
  body: { evidenceSummary: 'Probes installed on all enrolled plots in 5 villages; 8 krishi sahayaks trained on the dashboard.' },
});
await call(`/applications/${krishi.id}/milestones/1/signoff`, {
  token: await as('field@latur.demo'),
  body: { decision: 'APPROVE', note: 'Checked probes on site in 3 villages.' },
});
await call(`/applications/${krishi.id}/milestones/1/signoff`, {
  token: await as('validator@vnmkv.demo'),
  body: { decision: 'APPROVE', note: 'Sampled plots; readings consistent.' },
});
await call(`/applications/${krishi.id}/milestones/2/submit`, {
  token: founder,
  body: { evidenceSummary: 'Advisories sent daily for three weeks; usage log attached for field verification.' },
});
step('Pilot started; milestone 1 complete (tranche released), milestone 2 awaiting sign-off');

const chain = await call('/audit/verify', { token: officer });
step(`Audit chain ${chain.valid ? 'intact' : 'BROKEN'} (${chain.entriesChecked} entries)`);
console.log(`\nDemo application: http://localhost:5173/applications/${krishi.id}`);
