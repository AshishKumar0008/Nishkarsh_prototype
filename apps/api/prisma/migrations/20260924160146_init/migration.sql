-- CreateEnum
CREATE TYPE "Role" AS ENUM ('DEPT_OFFICER', 'STARTUP', 'FINANCE', 'EVALUATOR', 'FIELD_STAFF', 'VALIDATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "ChallengeState" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'NO_ELIGIBLE_BIDS');

-- CreateEnum
CREATE TYPE "ApplicationState" AS ENUM ('SUBMITTED', 'ELIGIBILITY_PENDING', 'ELIGIBLE', 'INELIGIBLE', 'UNDER_EVALUATION', 'SELECTED', 'REJECTED', 'CONTRACTED', 'IN_PILOT', 'AT_RISK', 'UNDER_VALIDATION', 'AWAITING_DECISION', 'SCALED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "EligibilityDecision" AS ENUM ('PENDING', 'CONFIRMED', 'OVERRIDDEN');

-- CreateEnum
CREATE TYPE "CommitmentParty" AS ENUM ('DEPARTMENT', 'STARTUP');

-- CreateEnum
CREATE TYPE "CommitmentStatus" AS ENUM ('PENDING', 'MET', 'MISSED');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PENDING', 'FIELD_SIGNED', 'COMPLETE', 'AT_RISK');

-- CreateEnum
CREATE TYPE "DecisionOutcome" AS ENUM ('SCALE', 'EXTEND', 'TERMINATE');

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Startup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dpiitNumber" TEXT,
    "incorporationDate" TIMESTAMP(3) NOT NULL,
    "turnoverLatestFyInr" INTEGER NOT NULL,
    "sectors" TEXT[],
    "city" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Startup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "departmentId" TEXT,
    "startupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "problemStatement" TEXT NOT NULL,
    "problemTag" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "fieldSite" TEXT NOT NULL,
    "budgetHead" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "metricUnit" TEXT NOT NULL,
    "baselineValue" DOUBLE PRECISION NOT NULL,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "minFieldAdoptionPct" INTEGER NOT NULL,
    "budgetCeilingInr" INTEGER NOT NULL,
    "pilotDurationWeeks" INTEGER NOT NULL,
    "applicationDeadline" TIMESTAMP(3) NOT NULL,
    "aiAssisted" BOOLEAN NOT NULL DEFAULT false,
    "state" "ChallengeState" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "departmentId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "state" "ApplicationState" NOT NULL DEFAULT 'SUBMITTED',
    "challengeId" TEXT NOT NULL,
    "startupId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "solutionSummary" TEXT NOT NULL,
    "approach" TEXT NOT NULL,
    "pilotPlan" TEXT NOT NULL,
    "teamSummary" TEXT NOT NULL,
    "priorEvidence" TEXT,
    "proposedPriceInr" INTEGER NOT NULL,
    "declaredDpiitNumber" TEXT,
    "declaredIncorporationDate" TIMESTAMP(3) NOT NULL,
    "declaredTurnoverInr" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EligibilityMemo" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "rulesVersion" TEXT NOT NULL,
    "autoEligible" BOOLEAN NOT NULL,
    "clausesCited" TEXT[],
    "waived" TEXT[],
    "checks" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "decision" "EligibilityDecision" NOT NULL DEFAULT 'PENDING',
    "finalEligible" BOOLEAN,
    "officerNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EligibilityMemo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scorecard" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "technicalMerit" INTEGER NOT NULL,
    "feasibility" INTEGER NOT NULL,
    "cost" INTEGER NOT NULL,
    "fieldFit" INTEGER NOT NULL,
    "weightedTotal" DOUBLE PRECISION NOT NULL,
    "comments" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Scorecard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "COIDeclaration" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "hasConflict" BOOLEAN NOT NULL,
    "details" TEXT,
    "declaredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "COIDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotAgreement" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "ipTerms" TEXT NOT NULL,
    "dataTerms" TEXT NOT NULL,
    "cybersecurityTerms" TEXT NOT NULL,
    "exitTerms" TEXT NOT NULL,
    "totalValueInr" INTEGER NOT NULL,
    "startupSignedAt" TIMESTAMP(3),
    "financeSignedAt" TIMESTAMP(3),
    "financeSignerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commitment" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "party" "CommitmentParty" NOT NULL,
    "description" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "CommitmentStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Commitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paymentTrancheInr" INTEGER NOT NULL,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "paymentReleasedAt" TIMESTAMP(3),

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MilestoneSignoff" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "signerId" TEXT NOT NULL,
    "signerRole" "Role" NOT NULL,
    "note" TEXT,
    "evidenceUrl" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MilestoneSignoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationReport" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "validatorId" TEXT NOT NULL,
    "vendorReportedValue" DOUBLE PRECISION NOT NULL,
    "validatorMeasuredValue" DOUBLE PRECISION NOT NULL,
    "fieldAdoptionPct" INTEGER NOT NULL,
    "discrepancyPct" DOUBLE PRECISION NOT NULL,
    "discrepancyFlag" BOOLEAN NOT NULL,
    "thresholdMet" BOOLEAN NOT NULL,
    "methodology" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "outcome" "DecisionOutcome" NOT NULL,
    "thresholdsApplied" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "gfrClauseCited" TEXT,
    "decidedById" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FailureRecord" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "problemTag" TEXT NOT NULL,
    "reasonCategory" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "lessons" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FailureRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidencePacket" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "auditHeadHash" TEXT NOT NULL,
    "fileUrl" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidencePacket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "seq" SERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT,
    "payload" JSONB NOT NULL,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("seq")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Startup_dpiitNumber_key" ON "Startup"("dpiitNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Challenge_problemTag_state_idx" ON "Challenge"("problemTag", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Application_challengeId_startupId_key" ON "Application"("challengeId", "startupId");

-- CreateIndex
CREATE UNIQUE INDEX "EligibilityMemo_applicationId_key" ON "EligibilityMemo"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Scorecard_applicationId_evaluatorId_key" ON "Scorecard"("applicationId", "evaluatorId");

-- CreateIndex
CREATE UNIQUE INDEX "COIDeclaration_applicationId_evaluatorId_key" ON "COIDeclaration"("applicationId", "evaluatorId");

-- CreateIndex
CREATE UNIQUE INDEX "PilotAgreement_applicationId_key" ON "PilotAgreement"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Milestone_agreementId_sequence_key" ON "Milestone"("agreementId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "MilestoneSignoff_milestoneId_signerRole_key" ON "MilestoneSignoff"("milestoneId", "signerRole");

-- CreateIndex
CREATE UNIQUE INDEX "ValidationReport_applicationId_key" ON "ValidationReport"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "FailureRecord_applicationId_key" ON "FailureRecord"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_hash_key" ON "AuditLog"("hash");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_startupId_fkey" FOREIGN KEY ("startupId") REFERENCES "Startup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_startupId_fkey" FOREIGN KEY ("startupId") REFERENCES "Startup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EligibilityMemo" ADD CONSTRAINT "EligibilityMemo_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EligibilityMemo" ADD CONSTRAINT "EligibilityMemo_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scorecard" ADD CONSTRAINT "Scorecard_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scorecard" ADD CONSTRAINT "Scorecard_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "COIDeclaration" ADD CONSTRAINT "COIDeclaration_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "COIDeclaration" ADD CONSTRAINT "COIDeclaration_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotAgreement" ADD CONSTRAINT "PilotAgreement_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotAgreement" ADD CONSTRAINT "PilotAgreement_financeSignerId_fkey" FOREIGN KEY ("financeSignerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "PilotAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "PilotAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilestoneSignoff" ADD CONSTRAINT "MilestoneSignoff_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilestoneSignoff" ADD CONSTRAINT "MilestoneSignoff_signerId_fkey" FOREIGN KEY ("signerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationReport" ADD CONSTRAINT "ValidationReport_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationReport" ADD CONSTRAINT "ValidationReport_validatorId_fkey" FOREIGN KEY ("validatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FailureRecord" ADD CONSTRAINT "FailureRecord_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidencePacket" ADD CONSTRAINT "EvidencePacket_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
