import type {
  ApplicationState,
  ChallengeState,
  CommitmentStanding,
  ConsensusResult,
  DataSensitivity,
  EligibilityCheck,
  MilestonePlanItem,
  Role,
} from '@nishkarsh/shared';

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

export interface AiDraftResponse {
  id: string;
  provider: 'anthropic' | 'offline-rules';
  model: string;
  promptVersion: string;
  output: {
    title: string;
    problemStatement: string;
    problemTag: string | null;
    fieldSite: string;
    metricName: string;
    metricUnit: string;
    clarifyingQuestions: string[];
  };
  unsupportedNumbers: string[];
  redactions: Record<string, number>;
  latencyMs: number;
}

export interface AiDraftProvenance {
  provider: string;
  model: string;
  promptVersion: string;
  createdAt: string;
  fieldReview: Record<string, 'ACCEPTED' | 'CHANGED'> | null;
  warnings: string[];
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
  aiDraft: AiDraftProvenance | null;
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

export interface Scorecard {
  id: string;
  applicationId: string;
  evaluatorId: string;
  evaluator: { id: string; name: string };
  technicalMerit: number;
  feasibility: number;
  cost: number;
  fieldFit: number;
  weightedTotal: number;
  comments: string | null;
  submittedAt: string;
}

export interface COIDeclaration {
  id: string;
  applicationId: string;
  evaluatorId: string;
  evaluator: { id: string; name: string };
  hasConflict: boolean;
  details: string | null;
  declaredAt: string;
}

export interface EvaluationOverview {
  applicationId: string;
  state: ApplicationState;
  panel: { id: string; name: string }[];
  coiDeclarations: COIDeclaration[];
  scorecards: Scorecard[];
  /** null while sealed: an evaluator can't see the panel's numbers until they've scored or recused */
  consensus: ConsensusResult | null;
  sealed: boolean;
  myCoi: COIDeclaration | null;
  myScorecard: Scorecard | null;
}

export interface AgreementMilestone {
  id: string;
  sequence: number;
  title: string;
  description: string;
  dueDate: string;
  paymentTrancheInr: number;
  status: string;
}

export interface AgreementCommitment {
  id: string;
  party: 'DEPARTMENT' | 'STARTUP';
  description: string;
  dueDate: string;
  status: 'PENDING' | 'MET' | 'MISSED';
}

export interface PilotAgreement {
  id: string;
  templateVersion: string;
  dataSensitivity: DataSensitivity;
  pilotStartDate: string;
  pilotEndDate: string;
  totalValueInr: number;
  renderedText: string;
  contentHash: string;
  revision: number;
  integrityOk: boolean;
  draftedBy: { name: string };
  startupSignedAt: string | null;
  startupSigner: { name: string } | null;
  financeSignedAt: string | null;
  financeSigner: { name: string } | null;
  milestones: AgreementMilestone[];
  commitments: AgreementCommitment[];
}

export interface AgreementView {
  agreement: PilotAgreement | null;
  drafting: {
    pilotDurationWeeks: number;
    maxValueInr: number;
    proposedPriceInr: number;
    budgetCeilingInr: number;
    defaultDataSensitivity: DataSensitivity;
    suggestedMilestones: MilestonePlanItem[];
    finalTrancheMinPct: number;
  };
}

export interface PilotMilestone {
  id: string;
  sequence: number;
  title: string;
  description: string;
  dueDate: string;
  paymentTrancheInr: number;
  status: 'PENDING' | 'SUBMITTED' | 'COMPLETE';
  submittedAt: string | null;
  evidenceSummary: string | null;
  evidenceUrl: string | null;
  returnNote: string | null;
  completedAt: string | null;
  paymentReleasedAt: string | null;
  signoffs: { id: string; signerRole: 'FIELD_STAFF' | 'VALIDATOR'; note: string | null; signedAt: string; signer: { name: string } }[];
}

export interface PartyScore {
  total: number;
  metOnTime: number;
  metLate: number;
  overdue: number;
}

export interface PilotView {
  state: ApplicationState;
  pilotStartDate: string;
  pilotEndDate: string;
  pilotStartedAt: string | null;
  fieldSupervisor: { id: string; name: string } | null;
  validator: { id: string; name: string } | null;
  milestones: PilotMilestone[];
  commitments: (AgreementCommitment & { kind: string; resolvedAt: string | null; standing: CommitmentStanding })[];
  commitmentScore: { DEPARTMENT: PartyScore; STARTUP: PartyScore };
  atRisk: { note?: string; since: string } | null;
  candidates: { fieldStaff: { id: string; name: string }[]; validators: { id: string; name: string }[] } | null;
}

export interface WorklistItem {
  id: string;
  state: ApplicationState;
  startup: { name: string };
  challenge: { title: string; fieldSite: string; department: { name: string } };
  pilotEndDate?: string;
  milestones: { sequence: number; title: string; status: string; dueDate: string; signoffs: { signerRole: string }[] }[];
  awaitingMe: number;
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
