import { AI_PROMPT_VERSION, aiDraftRequestSchema, findUnsupportedNumbers, redactPersonalData } from '@pragati/shared';
import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { canonicalJson } from '../core/auditChain';
import { aiProviderInfo, draftChallenge } from '../core/ai/challengeDrafter';
import { forbidden, HttpError } from '../core/errors';
import { prisma } from '../core/prisma';
import { sha256 } from '../core/templates';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';

/**
 * AI assistance endpoints. They return suggestions and record provenance — nothing here
 * creates a challenge, calls transition() or writes to the audit chain. The officer's own
 * save (POST /challenges with aiDraftId) is what makes a draft count.
 */
export const aiRouter = Router();
aiRouter.use(requireAuth);

const HOURLY_LIMIT = 20;

aiRouter.get('/status', requireRole('DEPT_OFFICER'), (_req, res) => {
  res.json({ ...aiProviderInfo(), promptVersion: AI_PROMPT_VERSION });
});

aiRouter.post('/challenge-draft', requireRole('DEPT_OFFICER'), async (req, res) => {
  const user = currentUser(req);
  if (!user.departmentId) throw forbidden('Your account is not linked to a department');
  const { notes } = aiDraftRequestSchema.parse(req.body);

  const recent = await prisma.aiDraft.count({
    where: { requestedById: user.id, createdAt: { gte: new Date(Date.now() - 3600_000) } },
  });
  if (recent >= HOURLY_LIMIT) throw new HttpError(429, `AI draft limit reached (${HOURLY_LIMIT} per hour) — try again later`);

  const department = await prisma.department.findUnique({ where: { id: user.departmentId }, select: { district: true } });
  const redacted = redactPersonalData(notes);

  const started = Date.now();
  const result = await draftChallenge(redacted.text, { district: department?.district });
  const latencyMs = Date.now() - started;

  const warnings = findUnsupportedNumbers(redacted.text, result.output);
  const draft = await prisma.aiDraft.create({
    data: {
      requestedById: user.id,
      departmentId: user.departmentId,
      notesRedacted: redacted.text,
      redactions: redacted.redactions,
      provider: result.provider,
      model: result.model,
      promptVersion: AI_PROMPT_VERSION,
      output: result.output as Prisma.InputJsonValue,
      outputHash: sha256(canonicalJson(result.output)),
      warnings,
      latencyMs,
    },
  });

  res.status(201).json({
    id: draft.id,
    provider: draft.provider,
    model: draft.model,
    promptVersion: draft.promptVersion,
    output: result.output,
    unsupportedNumbers: warnings,
    redactions: redacted.redactions,
    latencyMs,
  });
});
