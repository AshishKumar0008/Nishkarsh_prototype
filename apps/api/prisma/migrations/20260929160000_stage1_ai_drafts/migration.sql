-- CreateTable
CREATE TABLE "AiDraft" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'CHALLENGE_DRAFT',
    "requestedById" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "notesRedacted" TEXT NOT NULL,
    "redactions" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "output" JSONB NOT NULL,
    "outputHash" TEXT NOT NULL,
    "warnings" JSONB NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "fieldReview" JSONB,
    "challengeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiDraft_challengeId_key" ON "AiDraft"("challengeId");

-- CreateIndex
CREATE INDEX "AiDraft_requestedById_createdAt_idx" ON "AiDraft"("requestedById", "createdAt");

-- AddForeignKey
ALTER TABLE "AiDraft" ADD CONSTRAINT "AiDraft_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiDraft" ADD CONSTRAINT "AiDraft_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

