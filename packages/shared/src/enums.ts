export const ROLES = [
  'DEPT_OFFICER',
  'STARTUP',
  'FINANCE',
  'EVALUATOR',
  'FIELD_STAFF',
  'VALIDATOR',
  'ADMIN',
] as const;
export type Role = (typeof ROLES)[number];

/** Automated steps are recorded in the audit log under this pseudo-role. */
export type ActorRole = Role | 'SYSTEM';

export const ROLE_LABELS: Record<ActorRole, string> = {
  DEPT_OFFICER: 'Department Officer',
  STARTUP: 'Startup',
  FINANCE: 'Procurement / Finance Officer',
  EVALUATOR: 'Evaluator Panel',
  FIELD_STAFF: 'Field Site Staff',
  VALIDATOR: 'Independent Validator',
  ADMIN: 'Administrator (MSInS)',
  SYSTEM: 'System (automated)',
};

export const CHALLENGE_STATES = ['DRAFT', 'PUBLISHED', 'CLOSED', 'NO_ELIGIBLE_BIDS'] as const;
export type ChallengeState = (typeof CHALLENGE_STATES)[number];

export const APPLICATION_STATES = [
  'SUBMITTED',
  'ELIGIBILITY_PENDING',
  'ELIGIBLE',
  'INELIGIBLE',
  'UNDER_EVALUATION',
  'SELECTED',
  'REJECTED',
  'CONTRACTED',
  'IN_PILOT',
  'AT_RISK',
  'UNDER_VALIDATION',
  'AWAITING_DECISION',
  'SCALED',
  'TERMINATED',
] as const;
export type ApplicationState = (typeof APPLICATION_STATES)[number];

export type EntityType = 'CHALLENGE' | 'APPLICATION';
