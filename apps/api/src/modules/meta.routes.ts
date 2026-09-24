import { GFR_CLAUSES, PROBLEM_TAGS, ROLE_LABELS, RULES_VERSION, STAGES } from '@pragati/shared';
import { Router } from 'express';

export const metaRouter = Router();

metaRouter.get('/', (_req, res) => {
  res.json({ problemTags: PROBLEM_TAGS, gfrClauses: GFR_CLAUSES, rulesVersion: RULES_VERSION, stages: STAGES, roleLabels: ROLE_LABELS });
});
