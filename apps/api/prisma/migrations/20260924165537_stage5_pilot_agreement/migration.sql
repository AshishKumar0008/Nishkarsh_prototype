/*
  Warnings:

  - You are about to drop the column `cybersecurityTerms` on the `PilotAgreement` table. All the data in the column will be lost.
  - You are about to drop the column `dataTerms` on the `PilotAgreement` table. All the data in the column will be lost.
  - You are about to drop the column `exitTerms` on the `PilotAgreement` table. All the data in the column will be lost.
  - You are about to drop the column `ipTerms` on the `PilotAgreement` table. All the data in the column will be lost.
  - Added the required column `contentHash` to the `PilotAgreement` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dataSensitivity` to the `PilotAgreement` table without a default value. This is not possible if the table is not empty.
  - Added the required column `draftedById` to the `PilotAgreement` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pilotEndDate` to the `PilotAgreement` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pilotStartDate` to the `PilotAgreement` table without a default value. This is not possible if the table is not empty.
  - Added the required column `renderedText` to the `PilotAgreement` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `PilotAgreement` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PilotAgreement" DROP COLUMN "cybersecurityTerms",
DROP COLUMN "dataTerms",
DROP COLUMN "exitTerms",
DROP COLUMN "ipTerms",
ADD COLUMN     "contentHash" TEXT NOT NULL,
ADD COLUMN     "dataSensitivity" TEXT NOT NULL,
ADD COLUMN     "draftedById" TEXT NOT NULL,
ADD COLUMN     "pilotEndDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "pilotStartDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "renderedText" TEXT NOT NULL,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "startupSignerId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AddForeignKey
ALTER TABLE "PilotAgreement" ADD CONSTRAINT "PilotAgreement_draftedById_fkey" FOREIGN KEY ("draftedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotAgreement" ADD CONSTRAINT "PilotAgreement_startupSignerId_fkey" FOREIGN KEY ("startupSignerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
