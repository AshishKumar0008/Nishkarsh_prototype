-- Stage 6: milestone evidence + dual sign-off, commitment kinds, pilot assignments.
-- Hand-edited from `prisma migrate diff` so it applies safely to databases that already hold stage 5 rows.

-- AlterEnum: FIELD_SIGNED / AT_RISK were never written by any code path; map them defensively anyway.
BEGIN;
CREATE TYPE "MilestoneStatus_new" AS ENUM ('PENDING', 'SUBMITTED', 'COMPLETE');
ALTER TABLE "public"."Milestone" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Milestone" ALTER COLUMN "status" TYPE "MilestoneStatus_new" USING (
  CASE "status"::text WHEN 'FIELD_SIGNED' THEN 'SUBMITTED' WHEN 'AT_RISK' THEN 'PENDING' ELSE "status"::text END
)::"MilestoneStatus_new";
ALTER TYPE "MilestoneStatus" RENAME TO "MilestoneStatus_old";
ALTER TYPE "MilestoneStatus_new" RENAME TO "MilestoneStatus";
DROP TYPE "public"."MilestoneStatus_old";
ALTER TABLE "Milestone" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable: existing commitments predate kinds; backfill, then require a kind on every new row.
ALTER TABLE "Commitment" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'LEGACY',
ADD COLUMN "milestoneId" TEXT;
ALTER TABLE "Commitment" ALTER COLUMN "kind" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "evidenceSummary" TEXT,
ADD COLUMN "evidenceUrl" TEXT,
ADD COLUMN "returnNote" TEXT,
ADD COLUMN "submittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PilotAgreement" ADD COLUMN "fieldSupervisorId" TEXT,
ADD COLUMN "pilotStartedAt" TIMESTAMP(3),
ADD COLUMN "validatorId" TEXT;

-- AddForeignKey
ALTER TABLE "PilotAgreement" ADD CONSTRAINT "PilotAgreement_fieldSupervisorId_fkey" FOREIGN KEY ("fieldSupervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PilotAgreement" ADD CONSTRAINT "PilotAgreement_validatorId_fkey" FOREIGN KEY ("validatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
