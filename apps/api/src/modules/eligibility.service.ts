import { evaluateEligibility } from '@nishkarsh/shared';
import type { Prisma } from '@prisma/client';
import type { Tx } from '../core/prisma';
import { SYSTEM_ACTOR, transition } from '../core/stateMachine';

/**
 * Stage 3a — automated screen. Produces the eligibility memo (citing the exact GFR clauses)
 * and moves the application to ELIGIBILITY_PENDING for the finance officer to confirm.
 * The system never makes the final call.
 */
export async function screenApplication(tx: Tx, applicationId: string, registry: { dpiitVerified: boolean; registrySource: string }) {
  const app = await tx.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { startup: true, challenge: true },
  });

  const result = evaluateEligibility({
    dpiitNumber: app.declaredDpiitNumber,
    dpiitVerified: registry.dpiitVerified,
    incorporationDate: app.declaredIncorporationDate,
    turnoverLatestFyInr: app.declaredTurnoverInr,
    startupSectors: app.startup.sectors,
    challengeSector: app.challenge.sector,
  });

  const memo = await tx.eligibilityMemo.create({
    data: {
      applicationId,
      rulesVersion: result.rulesVersion,
      autoEligible: result.eligible,
      clausesCited: result.clausesCited,
      waived: result.waived,
      checks: result.checks as unknown as Prisma.InputJsonValue,
      summary: result.summary,
    },
  });

  await transition(tx, {
    entity: 'APPLICATION',
    id: applicationId,
    to: 'ELIGIBILITY_PENDING',
    actor: SYSTEM_ACTOR,
    payload: {
      memoId: memo.id,
      autoEligible: result.eligible,
      clausesCited: result.clausesCited,
      rulesVersion: result.rulesVersion,
      registrySource: registry.registrySource,
    },
  });
  return memo;
}
