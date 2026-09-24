import type { ActorRole, ApplicationState, ChallengeState, EntityType } from './enums';

/**
 * The workflow IS this table. Every state change in the system must match one row here —
 * the API's transition() refuses anything else. Adding a stage = adding rows, not new if-statements.
 */
export interface TransitionRule<S extends string> {
  from: S;
  to: S;
  roles: ActorRole[];
  /** Audit-log action name recorded when this transition fires. */
  action: string;
}

export const CHALLENGE_TRANSITIONS: TransitionRule<ChallengeState>[] = [
  { from: 'DRAFT', to: 'PUBLISHED', roles: ['DEPT_OFFICER'], action: 'CHALLENGE_PUBLISHED' },
  { from: 'PUBLISHED', to: 'CLOSED', roles: ['DEPT_OFFICER', 'SYSTEM'], action: 'CHALLENGE_CLOSED' },
  // Zero-bid → innovation-gap referral (AIM ARISE / MSInS R&D fund)
  { from: 'PUBLISHED', to: 'NO_ELIGIBLE_BIDS', roles: ['DEPT_OFFICER', 'SYSTEM'], action: 'CHALLENGE_INNOVATION_GAP' },
];

export const APPLICATION_TRANSITIONS: TransitionRule<ApplicationState>[] = [
  // Stage 3 — eligibility: machine-screened first, human-confirmed second
  { from: 'SUBMITTED', to: 'ELIGIBILITY_PENDING', roles: ['SYSTEM'], action: 'ELIGIBILITY_AUTO_SCREENED' },
  { from: 'ELIGIBILITY_PENDING', to: 'ELIGIBLE', roles: ['FINANCE'], action: 'ELIGIBILITY_CONFIRMED' },
  { from: 'ELIGIBILITY_PENDING', to: 'INELIGIBLE', roles: ['FINANCE'], action: 'ELIGIBILITY_REJECTED' },
  // Stage 4 — evaluation: panel scores, system computes consensus
  { from: 'ELIGIBLE', to: 'UNDER_EVALUATION', roles: ['DEPT_OFFICER', 'SYSTEM'], action: 'EVALUATION_OPENED' },
  { from: 'UNDER_EVALUATION', to: 'SELECTED', roles: ['SYSTEM'], action: 'PANEL_SELECTED' },
  { from: 'UNDER_EVALUATION', to: 'REJECTED', roles: ['SYSTEM'], action: 'PANEL_REJECTED' },
  // Stage 5 — pilot agreement + Commitment Card
  { from: 'SELECTED', to: 'CONTRACTED', roles: ['FINANCE'], action: 'AGREEMENT_SIGNED' },
  // Stage 6 — milestone execution (field staff flags risk, never the startup)
  { from: 'CONTRACTED', to: 'IN_PILOT', roles: ['DEPT_OFFICER', 'SYSTEM'], action: 'PILOT_STARTED' },
  { from: 'IN_PILOT', to: 'AT_RISK', roles: ['FIELD_STAFF'], action: 'MILESTONE_AT_RISK' },
  { from: 'AT_RISK', to: 'IN_PILOT', roles: ['FIELD_STAFF'], action: 'CORRECTIVE_ACTION_RESOLVED' },
  { from: 'IN_PILOT', to: 'UNDER_VALIDATION', roles: ['SYSTEM'], action: 'MILESTONES_COMPLETE' },
  // Stage 7 — independent validation
  { from: 'UNDER_VALIDATION', to: 'AWAITING_DECISION', roles: ['VALIDATOR'], action: 'VALIDATION_SIGNED' },
  // Stage 8 — scale / extend / terminate
  { from: 'AWAITING_DECISION', to: 'SCALED', roles: ['FINANCE'], action: 'DECISION_SCALE' },
  { from: 'AWAITING_DECISION', to: 'IN_PILOT', roles: ['FINANCE'], action: 'DECISION_EXTEND' },
  { from: 'AWAITING_DECISION', to: 'TERMINATED', roles: ['FINANCE'], action: 'DECISION_TERMINATE' },
];

export function transitionsFor(entity: EntityType): TransitionRule<string>[] {
  return entity === 'CHALLENGE' ? CHALLENGE_TRANSITIONS : APPLICATION_TRANSITIONS;
}

/** Returns the matching rule, or null if `role` may not move the entity from `from` to `to`. */
export function findTransition(
  entity: EntityType,
  from: string,
  to: string,
  role: ActorRole,
): TransitionRule<string> | null {
  return transitionsFor(entity).find((r) => r.from === from && r.to === to && r.roles.includes(role)) ?? null;
}

/** The 9 workflow stages, used by the UI timeline and the evidence packet. */
export const STAGES = [
  { n: 1, name: 'Challenge Authoring' },
  { n: 2, name: 'Discovery & Application' },
  { n: 3, name: 'Eligibility Screen' },
  { n: 4, name: 'Expert Evaluation' },
  { n: 5, name: 'Pilot Agreement' },
  { n: 6, name: 'Milestone Execution' },
  { n: 7, name: 'Independent Validation' },
  { n: 8, name: 'Scale / Extend / Terminate' },
  { n: 9, name: 'Evidence Packet' },
] as const;

/** Which stage an application is currently in. */
export const APPLICATION_STAGE: Record<ApplicationState, number> = {
  SUBMITTED: 2,
  ELIGIBILITY_PENDING: 3,
  ELIGIBLE: 3,
  INELIGIBLE: 3,
  UNDER_EVALUATION: 4,
  SELECTED: 4,
  REJECTED: 4,
  CONTRACTED: 5,
  IN_PILOT: 6,
  AT_RISK: 6,
  UNDER_VALIDATION: 7,
  AWAITING_DECISION: 8,
  SCALED: 9,
  TERMINATED: 8,
};
