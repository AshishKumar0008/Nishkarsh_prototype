/**
 * Demo data. Fictional department, startups and people — Marathwada-based on purpose (district inclusion).
 * All demo passwords: demo1234
 *
 * Story: Latur agriculture office has a published soil-moisture challenge; Dharashiv ZP has published
 * the same problem type (→ clustering hint). KrishiSense passes eligibility; AgroLegacy (incorporated
 * 2014) fails the 10-year test — so both memo outcomes can be demoed.
 */
import { getProblemTag } from '@pragati/shared';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { appendAudit } from '../src/core/auditChain';

const prisma = new PrismaClient();
const PASSWORD = 'demo1234';

const inWeeks = (w: number) => new Date(Date.now() + w * 7 * 24 * 3600 * 1000);

async function main() {
  // Wipe in dependency order (dev only — the audit log is otherwise never deleted)
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.evidencePacket.deleteMany(),
    prisma.failureRecord.deleteMany(),
    prisma.decision.deleteMany(),
    prisma.validationReport.deleteMany(),
    prisma.milestoneSignoff.deleteMany(),
    prisma.milestone.deleteMany(),
    prisma.commitment.deleteMany(),
    prisma.pilotAgreement.deleteMany(),
    prisma.cOIDeclaration.deleteMany(),
    prisma.scorecard.deleteMany(),
    prisma.eligibilityMemo.deleteMany(),
    prisma.application.deleteMany(),
    prisma.challenge.deleteMany(),
    prisma.user.deleteMany(),
    prisma.startup.deleteMany(),
    prisma.department.deleteMany(),
  ]);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const latur = await prisma.department.create({
    data: { code: 'AGRI-LATUR', name: 'District Superintending Agriculture Office, Latur', district: 'Latur' },
  });
  const dharashiv = await prisma.department.create({
    data: { code: 'ZP-DHARASHIV-AGRI', name: 'Zilla Parishad Dharashiv — Agriculture Dept.', district: 'Dharashiv' },
  });

  const krishiSense = await prisma.startup.create({
    data: {
      name: 'KrishiSense Labs Pvt. Ltd.',
      dpiitNumber: 'DIPP145872',
      incorporationDate: new Date('2021-03-15'),
      turnoverLatestFyInr: 1_20_00_000,
      sectors: ['AGRICULTURE', 'WATER'],
      city: 'Aurangabad',
      district: 'Chhatrapati Sambhajinagar',
    },
  });
  const agroLegacy = await prisma.startup.create({
    data: {
      name: 'AgroLegacy Systems Pvt. Ltd.',
      dpiitNumber: 'DIPP098311',
      incorporationDate: new Date('2014-06-01'),
      turnoverLatestFyInr: 8_50_00_000,
      sectors: ['AGRICULTURE'],
      city: 'Pune',
      district: 'Pune',
    },
  });

  const users = [
    { email: 'officer@latur.demo', name: 'Smt. Anjali Deshmukh', role: 'DEPT_OFFICER', departmentId: latur.id },
    { email: 'officer@dharashiv.demo', name: 'Shri. Rahul Kale', role: 'DEPT_OFFICER', departmentId: dharashiv.id },
    { email: 'founder@krishisense.demo', name: 'Priya Jadhav', role: 'STARTUP', startupId: krishiSense.id },
    { email: 'founder@agrolegacy.demo', name: 'Vikram Shinde', role: 'STARTUP', startupId: agroLegacy.id },
    { email: 'finance@latur.demo', name: 'Shri. Suresh Patil', role: 'FINANCE', departmentId: latur.id },
    { email: 'evaluator1@panel.demo', name: 'Dr. Meera Kulkarni (Domain Expert)', role: 'EVALUATOR' },
    { email: 'evaluator2@panel.demo', name: 'Arjun Rao (Technical Evaluator)', role: 'EVALUATOR' },
    { email: 'evaluator3@panel.demo', name: 'Sunita Waghmare (Field-site Representative)', role: 'EVALUATOR' },
    { email: 'field@latur.demo', name: 'Ganesh More (Krishi Sahayak)', role: 'FIELD_STAFF', departmentId: latur.id },
    { email: 'field@dharashiv.demo', name: 'Kavita Jagtap (Krishi Sahayak)', role: 'FIELD_STAFF', departmentId: dharashiv.id },
    { email: 'validator@vnmkv.demo', name: 'Prof. S. Gaikwad (VNMKV Parbhani)', role: 'VALIDATOR' },
    { email: 'admin@msins.demo', name: 'MSInS Programme Admin', role: 'ADMIN' },
  ] as const;

  const created: Record<string, string> = {};
  for (const u of users) {
    const user = await prisma.user.create({ data: { ...u, passwordHash } });
    created[u.email] = user.id;
  }

  const challenges = [
    {
      dept: latur,
      author: 'officer@latur.demo',
      data: {
        title: 'Real-time soil moisture monitoring for rabi irrigation scheduling',
        problemStatement:
          'Farmers in drought-prone talukas of Latur irrigate on fixed schedules, not soil need. Krishi sahayaks visit each cluster once a fortnight, so advisories arrive too late. We need a low-cost way to measure soil moisture at plot level and push irrigation advisories in Marathi.',
        problemTag: 'SOIL_HEALTH',
        district: 'Latur',
        fieldSite: 'Renapur taluka — 5 villages, 120 plots',
        budgetHead: '2401-00-109 Extension & Farmers Training',
        metricName: 'Water used per hectare per rabi season',
        metricUnit: 'm³/ha',
        baselineValue: 4200,
        targetValue: 3570,
        minFieldAdoptionPct: 60,
        budgetCeilingInr: 12_00_000,
        pilotDurationWeeks: 16,
        applicationDeadline: inWeeks(6),
      },
    },
    {
      dept: dharashiv,
      author: 'officer@dharashiv.demo',
      data: {
        title: 'Plot-level soil moisture sensing for water-stressed villages',
        problemStatement:
          'Tuljapur taluka villages face repeated crop loss from mistimed irrigation. The ZP wants plot-level soil moisture data to prioritise scarce water release and advise farmers ahead of dry spells.',
        problemTag: 'SOIL_HEALTH',
        district: 'Dharashiv',
        fieldSite: 'Tuljapur taluka — 3 villages',
        budgetHead: 'ZP Agriculture Innovation Head',
        metricName: 'Crop loss due to moisture stress',
        metricUnit: '% of sown area',
        baselineValue: 18,
        targetValue: 12,
        minFieldAdoptionPct: 50,
        budgetCeilingInr: 8_00_000,
        pilotDurationWeeks: 12,
        applicationDeadline: inWeeks(5),
      },
    },
  ];

  for (const c of challenges) {
    const sector = getProblemTag(c.data.problemTag)!.sector;
    await prisma.$transaction(async (tx) => {
      const challenge = await tx.challenge.create({
        data: { ...c.data, sector, departmentId: c.dept.id, createdById: created[c.author], state: 'DRAFT' },
      });
      const actor = { id: created[c.author], role: 'DEPT_OFFICER' as const };
      await appendAudit(tx, {
        entityType: 'CHALLENGE',
        entityId: challenge.id,
        action: 'CHALLENGE_CREATED',
        actor,
        toState: 'DRAFT',
        payload: { ...c.data, sector },
      });
      await tx.challenge.update({ where: { id: challenge.id }, data: { state: 'PUBLISHED', publishedAt: new Date() } });
      await appendAudit(tx, {
        entityType: 'CHALLENGE',
        entityId: challenge.id,
        action: 'CHALLENGE_PUBLISHED',
        actor,
        fromState: 'DRAFT',
        toState: 'PUBLISHED',
        payload: { officerSignOff: true, seeded: true },
      });
    });
  }

  console.log(`Seeded ${users.length} users (password: ${PASSWORD}), 2 departments, 2 startups, ${challenges.length} published challenges.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
