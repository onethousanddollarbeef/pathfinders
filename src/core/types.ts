/**
 * Domain model for Nexus.
 *
 * Everything the extension does is derived from two objects: a `StudentProfile`
 * (what the student is) and a list of `Scholarship`s (what the world offers).
 * Matching, explanations, comparison, planning and tracking are all pure
 * functions over those two inputs, which keeps the engine testable and keeps
 * the student's data local.
 */

export type EducationLevel =
  | 'high-school-freshman'
  | 'high-school-sophomore'
  | 'high-school-junior'
  | 'high-school-senior'
  | 'undergrad-freshman'
  | 'undergrad-sophomore'
  | 'undergrad-junior'
  | 'undergrad-senior'
  | 'graduate'
  | 'doctoral'
  | 'non-traditional';

export type CitizenshipStatus =
  | 'us-citizen'
  | 'us-permanent-resident'
  | 'daca'
  | 'undocumented'
  | 'international'
  | 'other';

export type EnrollmentStatus = 'full-time' | 'part-time' | 'not-enrolled';

/** Self-reported attributes used only for eligibility checks; always optional. */
export interface Demographics {
  gender?: string;
  ethnicities?: string[];
  firstGeneration?: boolean;
  militaryAffiliation?: string[];
  disability?: boolean;
  lgbtq?: boolean;
}

export interface AcademicProfile {
  level?: EducationLevel;
  gpa?: number;
  gpaScale?: number;
  satTotal?: number;
  actComposite?: number;
  intendedMajors?: string[];
  currentSchool?: string;
  graduationYear?: number;
  enrollment?: EnrollmentStatus;
}

export interface FinancialProfile {
  householdIncome?: number;
  householdSize?: number;
  efc?: number;
  pellEligible?: boolean;
  fafsaFiled?: boolean;
  unmetNeed?: number;
}

export interface ActivityEntry {
  id: string;
  name: string;
  category?: string;
  role?: string;
  hoursPerWeek?: number;
  years?: number;
  description?: string;
}

export interface EssayAsset {
  id: string;
  title: string;
  /** Canonical prompt this essay answers, used to detect reuse opportunities. */
  topic: string;
  wordCount: number;
  text?: string;
  updatedAt: number;
}

export interface RecommenderEntry {
  id: string;
  name: string;
  relationship?: string;
  email?: string;
  /** Set when the student has already asked; used by the planner for lead time. */
  requestedAt?: number;
}

export interface StudentProfile {
  version: number;
  updatedAt: number;

  firstName?: string;
  lastName?: string;
  preferredName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;

  citizenship?: CitizenshipStatus;
  demographics: Demographics;
  academics: AcademicProfile;
  financials: FinancialProfile;

  interests: string[];
  careerGoals?: string;
  activities: ActivityEntry[];
  essays: EssayAsset[];
  recommenders: RecommenderEntry[];

  /** Hours per week the student can realistically spend on applications. */
  weeklyHoursAvailable: number;
  /** Optional target the planner uses to report progress toward a dollar goal. */
  fundingGoal?: number;
}

// ---------------------------------------------------------------------------
// Scholarships and eligibility rules
// ---------------------------------------------------------------------------

/** Which part of the profile a rule reads. Kept explicit so gaps are actionable. */
export type ProfileField =
  | 'academics.level'
  | 'academics.gpa'
  | 'academics.satTotal'
  | 'academics.actComposite'
  | 'academics.intendedMajors'
  | 'academics.graduationYear'
  | 'academics.enrollment'
  | 'financials.householdIncome'
  | 'financials.pellEligible'
  | 'financials.fafsaFiled'
  | 'citizenship'
  | 'state'
  | 'demographics.gender'
  | 'demographics.ethnicities'
  | 'demographics.firstGeneration'
  | 'demographics.militaryAffiliation'
  | 'demographics.disability'
  | 'demographics.lgbtq'
  | 'interests'
  | 'activities'
  | 'essays';

export type RuleOperator =
  | 'gte'
  | 'lte'
  | 'eq'
  | 'in'
  | 'includes-any'
  | 'includes-all'
  | 'is-true'
  | 'exists';

export interface EligibilityRule {
  id: string;
  field: ProfileField;
  operator: RuleOperator;
  value?: string | number | boolean | string[];
  /** Human-readable requirement, e.g. "3.0 GPA or higher". */
  label: string;
  /**
   * `required` rules gate eligibility. `preferred` rules do not disqualify but
   * raise the competitiveness score when satisfied.
   */
  weight: 'required' | 'preferred';
}

export type ScholarshipCategory =
  | 'merit'
  | 'need'
  | 'identity'
  | 'field-of-study'
  | 'local'
  | 'essay-contest'
  | 'service'
  | 'athletic'
  | 'employer'
  | 'military';

export interface ApplicationRequirements {
  essayCount: number;
  essayWordCounts: number[];
  /** Canonical topics of required essays; enables reuse detection. */
  essayTopics: string[];
  recommendationLetters: number;
  transcriptRequired: boolean;
  fafsaRequired: boolean;
  portfolioRequired: boolean;
  interviewRequired: boolean;
  videoRequired: boolean;
  otherRequirements: string[];
}

export interface Scholarship {
  id: string;
  name: string;
  sponsor: string;
  url: string;
  /** Award value in USD. `amountMax` may exceed `amountMin` for ranged awards. */
  amountMin: number;
  amountMax: number;
  renewable: boolean;
  renewableYears?: number;
  numberOfAwards?: number;
  /** ISO date (YYYY-MM-DD). */
  deadline: string;
  /** True when the deadline recurs annually and can be rolled forward. */
  recurring: boolean;
  categories: ScholarshipCategory[];
  description: string;
  eligibility: EligibilityRule[];
  requirements: ApplicationRequirements;
  /** Rough applicant pool size; drives the competitiveness estimate. */
  estimatedApplicants?: number;
  /** Geographic restriction, e.g. ["CA","NV"]; empty means national. */
  states: string[];
  tags: string[];
  /** Present when the scholarship was captured from a page rather than seeded. */
  source?: 'seed' | 'user' | 'page-capture';
}

// ---------------------------------------------------------------------------
// Matching output
// ---------------------------------------------------------------------------

export type RuleStatus = 'met' | 'not-met' | 'unknown';

export interface RuleEvaluation {
  rule: EligibilityRule;
  status: RuleStatus;
  /** Plain-language explanation, e.g. "Your 3.6 GPA clears the 3.0 minimum." */
  explanation: string;
  /** The profile value that was compared, for transparency in the UI. */
  actual?: string | number | boolean | string[];
}

export type MatchVerdict = 'eligible' | 'likely-eligible' | 'needs-info' | 'not-eligible';

export interface EffortEstimate {
  /** Total estimated hours of work to submit a complete application. */
  hours: number;
  /** Hours saved by reusing essays the student already has. */
  hoursSavedByReuse: number;
  /** Essay ids from the profile that can be reused. */
  reusableEssayIds: string[];
  breakdown: { label: string; hours: number }[];
}

export interface MatchResult {
  scholarship: Scholarship;
  verdict: MatchVerdict;
  /** 0-100 fit score combining required rules, preferred rules and coverage. */
  fitScore: number;
  /** Estimated odds of winning, 0-1, from pool size and fit. */
  winProbability: number;
  effort: EffortEstimate;
  /** Expected dollars per hour of work; the planner's core ranking signal. */
  expectedValuePerHour: number;
  expectedValue: number;
  daysUntilDeadline: number;
  reasonsQualified: RuleEvaluation[];
  reasonsDisqualified: RuleEvaluation[];
  missingInfo: RuleEvaluation[];
  /** Requirement gaps such as "needs 2 recommendation letters". */
  readinessGaps: string[];
}

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

export type ApplicationStatus =
  | 'saved'
  | 'started'
  | 'submitted'
  | 'awarded'
  | 'rejected'
  | 'skipped';

export interface ApplicationTask {
  id: string;
  label: string;
  done: boolean;
  /** ISO date the task should be finished by, derived from the deadline. */
  dueDate?: string;
  estimatedHours: number;
}

export interface TrackedApplication {
  scholarshipId: string;
  status: ApplicationStatus;
  savedAt: number;
  startedAt?: number;
  submittedAt?: number;
  decidedAt?: number;
  awardAmount?: number;
  notes: string;
  tasks: ApplicationTask[];
  /** Deadline override when the student learns of a different date. */
  deadlineOverride?: string;
}

export interface PlanItem {
  match: MatchResult;
  tracked?: TrackedApplication;
  rank: number;
  /** Bucket used to group the plan in the UI. */
  bucket: 'do-now' | 'this-week' | 'upcoming' | 'stretch' | 'skip';
  /** Why this landed where it did, e.g. "$1,240/hr, due in 9 days". */
  rationale: string;
  suggestedStartDate: string;
  scheduledHours: number;
}

export interface Plan {
  generatedAt: number;
  items: PlanItem[];
  totalHours: number;
  totalPotentialAward: number;
  expectedAward: number;
  /** Hours per week the plan assumes, echoed back for the UI. */
  weeklyHours: number;
  warnings: string[];
}
