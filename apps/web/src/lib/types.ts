import type { ApplicationState, ChallengeState, EligibilityCheck, Role } from '@pragati/shared';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  departmentId: string | null;
  startupId: string | null;
  department: { name: string; district: string } | null;
  startup: { name: string } | null;
}

export interface Challenge {
  id: string;
  title: string;
  problemStatement: string;
  problemTag: string;
  sector: string;
  district: string;
  fieldSite: string;
  budgetHead: string;
  metricName: string;
  metricUnit: string;
  baselineValue: number;
  targetValue: number;
  minFieldAdoptionPct: number;
  budgetCeilingInr: number;
  pilotDurationWeeks: number;
  applicationDeadline: string;
  aiAssisted: boolean;
  state: ChallengeState;
  publishedAt: string | null;
  departmentId: string;
  department: { name: string; district: string };
  createdAt: string;
}

export interface ChallengeListItem extends Challenge {
  _count: { applications: number };
  applications?: { id: string; state: ApplicationState }[];
}

export interface ClusterMatch {
  id: string;
  title: string;
  district: string;
  budgetCeilingInr: number;
  department: { name: string };
}

export interface ChallengeDetail extends Challenge {
  createdBy: { name: string };
  applications: {
    id: string;
    state: ApplicationState;
    createdAt: string;
    proposedPriceInr: number;
    startup: { name: string; district: string };
  }[];
  clusterMatches: ClusterMatch[];
}

export interface EligibilityMemo {
  id: string;
  rulesVersion: string;
  autoEligible: boolean;
  clausesCited: string[];
  waived: string[];
  checks: EligibilityCheck[];
  summary: string;
  decision: 'PENDING' | 'CONFIRMED' | 'OVERRIDDEN';
  finalEligible: boolean | null;
  officerNote: string | null;
  decidedBy: { name: string } | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface ApplicationListItem {
  id: string;
  state: ApplicationState;
  createdAt: string;
  proposedPriceInr: number;
  startup: { name: string; district: string };
  challenge: { id: string; title: string; department: { name: string } };
  eligibilityMemo: { autoEligible: boolean; clausesCited: string[]; decision: string } | null;
}

export interface ApplicationDetail {
  id: string;
  state: ApplicationState;
  createdAt: string;
  solutionSummary: string;
  approach: string;
  pilotPlan: string;
  teamSummary: string;
  priorEvidence: string | null;
  proposedPriceInr: number;
  declaredDpiitNumber: string | null;
  declaredIncorporationDate: string;
  declaredTurnoverInr: number;
  startup: { id: string; name: string; district: string; city: string; sectors: string[] };
  challenge: Challenge;
  eligibilityMemo: EligibilityMemo | null;
}

export interface AuditEntry {
  seq: number;
  entityType: string;
  entityId: string;
  action: string;
  actorRole: string;
  actor: { name: string } | null;
  fromState: string | null;
  toState: string | null;
  payload: Record<string, unknown>;
  prevHash: string;
  hash: string;
  createdAt: string;
}

export interface ChainVerification {
  valid: boolean;
  entriesChecked: number;
  headHash: string;
  firstBrokenSeq?: number;
  reason?: string;
}
