// Core domain types for Hookline.

export type RunStatus =
  | "queued"
  | "running"
  | "paused" // waiting for the rep to pick the right person
  | "awaiting_review" // draft ready, human must approve
  | "hold" // process decided NOT to reach out now
  | "approved"
  | "rejected"
  | "failed";

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

/** Behaviour branches the run went through. Shown as badges. */
export type Branch = "pause" | "pivot" | "hold" | "degrade" | "revised" | "collision-avoided";

export const STAGES = [
  { id: "intake", label: "Intake", plain: "Read the prospect and the seller profile" },
  { id: "identity", label: "Resolve identity", plain: "Make sure we have the right person" },
  { id: "freshness", label: "Freshness check", plain: "Is this person still at this company?" },
  { id: "gather", label: "Gather signals", plain: "Search news, hiring, funding, talks and posts" },
  { id: "extract", label: "Extract & score", plain: "Turn pages into dated, sourced facts and score them" },
  { id: "gate", label: "Sensitivity gate", plain: "Should we reach out at all right now?" },
  { id: "hooks", label: "Hook tournament", plain: "Pitch 3 angles, let a judge pick the best" },
  { id: "draft", label: "Draft", plain: "Write a short email + LinkedIn note" },
  { id: "verify", label: "Verify", plain: "Check every claim against its source + quality rules" },
  { id: "finalize", label: "Hand to human", plain: "Queue for review — nothing is sent automatically" },
] as const;
export type StageId = (typeof STAGES)[number]["id"];

export interface RunInput {
  name: string;
  company: string;
  title?: string;
  linkedinUrl?: string;
  pastedContext?: string; // anything the rep already knows / pasted from LinkedIn
  sellerId: string;
  batchId?: string;
  expected?: string; // for evals: expected outcome e.g. ready|pause|pivot|hold|degrade
}

export interface Source {
  id: string; // S1, S2...
  url: string;
  title: string;
  publishedDate?: string;
  text: string; // excerpt kept for verification
  query: string; // which lane produced it
  lane: Lane;
}

export type Lane = "person" | "news" | "funding" | "hiring" | "company" | "risk" | "rep";

export type SignalType =
  | "funding"
  | "hiring"
  | "launch"
  | "leadership_change"
  | "expansion"
  | "partnership"
  | "earnings"
  | "person_content" // talk, podcast, post, interview by the prospect
  | "award"
  | "layoffs"
  | "acquisition"
  | "legal"
  | "crisis"
  | "other";

export type Scope = "person" | "team" | "company" | "industry";

export interface Signal {
  id: string; // G1, G2...
  type: SignalType;
  scope: Scope;
  claim: string; // one-sentence factual statement
  date?: string; // ISO date of the event if known
  sourceId: string;
  evidence: string; // verbatim quote from source
  evidenceVerified: boolean; // quote really is in the source text
  sensitivity: "none" | "negative_event" | "personal";
  scores: { recency: number; specificity: number; verifiability: number; total: number };
  excludedReason?: string;
}

export interface Candidate {
  name: string;
  title?: string;
  company?: string;
  location?: string;
  url?: string;
  matchScore: number; // 0..1
  reason: string;
}

export interface SellerProfile {
  id: string;
  name: string;
  website?: string;
  oneLiner: string;
  valueProps: { id: string; title: string; description: string }[];
  proofPoints: { id: string; text: string }[];
  targetPersonas: string[];
  competitors: string[];
  customers: string[];
  senderName: string;
  senderTitle: string;
  cta: string;
  tone: string;
}

export interface Hook {
  id: string; // H1..H3
  signalIds: string[];
  angle: string; // one line
  pain: string; // likely pain this signal implies for this person
  valuePropId: string;
  proofPointId?: string;
  judge?: {
    relevance: number;
    specificity: number;
    timeliness: number;
    credibility: number;
    tact: number;
    total: number; // 0..1 blended with signal score
    comment: string;
  };
}

export interface Draft {
  subject: string;
  body: string;
  linkedin: string;
  claims: { text: string; signalId: string }[];
}

export interface ClaimCheck {
  statement: string;
  signalId: string | null;
  verdict: "supported" | "unsupported";
  note?: string;
}

export interface LintResult {
  rule: string;
  ok: boolean;
  detail: string;
}

export interface PipelineState {
  nextStage: StageId;
  target: { name: string; company: string; title?: string };
  identity?: { candidates: Candidate[]; chosen?: Candidate; mode: "auto" | "rep" | "given" | "not_found"; note: string };
  pivot?: { from: string; to: string; newTitle?: string; evidence: string; sourceUrl?: string };
  sources: Source[];
  laneStats: { lane: Lane; ok: boolean; count: number; ms: number; provider: string; error?: string }[];
  signals: Signal[];
  gate?: { decision: "proceed" | "hold"; reasons: string[]; revisitOn?: string; filtered: string[] };
  hooks?: Hook[];
  winnerId?: string;
  winnerRationale?: string;
  avoidedSignals?: string[];
  draft?: Draft;
  firstDraft?: Draft;
  claimChecks?: ClaimCheck[];
  claimsCaught?: ClaimCheck[];
  /** Unsupported claims that survived the rewrite AND could not be cut automatically. Rep must resolve. */
  unresolvedClaims?: ClaimCheck[];
  lint?: LintResult[];
  alternates?: Candidate[];
  confidence?: Confidence;
  confidenceWhy?: string;
}

export interface RunMetrics {
  startedAt?: string;
  finishedAt?: string;
  ms?: number;
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  searchCalls: number;
  searchCostUsd: number;
}

export interface Review {
  action: "approved" | "rejected";
  finalSubject?: string;
  finalBody?: string;
  editRatio?: number; // 0..1 share of words changed
  reason?: string;
  at: string;
}

export interface Run {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: RunStatus;
  input: RunInput;
  seller: SellerProfile;
  state: PipelineState;
  branches: Branch[];
  metrics: RunMetrics;
  review?: Review;
  error?: string;
  mock: boolean;
}

export interface RunEvent {
  seq: number;
  ts: string;
  stage: StageId;
  status: "start" | "info" | "done" | "skip" | "error" | "pause" | "hold";
  message: string;
  ms?: number;
}

/** A "running" run with no checkpoint for this long has lost its worker (longer than the 300s route limit). */
export const STALE_MS = 6 * 60_000;
export const isStale = (r: Pick<Run, "status" | "updatedAt">, now = Date.now()) => r.status === "running" && now - Date.parse(r.updatedAt) > STALE_MS;

export const TERMINAL: RunStatus[] = ["paused", "awaiting_review", "hold", "approved", "rejected", "failed"];
