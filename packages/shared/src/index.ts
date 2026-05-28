// Shared domain types used across the API gateway and frontend.

export type InstitutionCode = "UB" | "UY1" | "UDSCHANG";

export interface Institution {
  id: string;
  code: InstitutionCode;
  name: string;
  emailDomain: string;
  /** Letter grade → grade_point map. Empty object when not yet configured. */
  gradeMapping: Record<string, number>;
  maxGradePoint: number;
}

export interface Course {
  id: string;
  institutionId: string;
  code: string;
  title: string;
  credits: number;
  level: number;
}

export type GradeStatus = "quarantine" | "approved" | "rejected";

export interface GradeSubmission {
  id: string;
  profileId: string;
  courseId: string;
  semester: 1 | 2;
  academicYear: number;
  grade: string;
  gradePoint: number;
  status: GradeStatus;
  createdAt: string;
}

export interface GradeSubmissionInput {
  courseId: string;
  semester: 1 | 2;
  academicYear: number;
  grade: string;
}

export interface BulkGradeRow extends GradeSubmissionInput {
  rowIndex: number;
}

export interface BulkGradeResult {
  rowIndex: number;
  success: boolean;
  error?: string;
  submissionId?: string;
}

export interface DifficultyIndex {
  courseId: string;
  nStudents: number;
  passRate: number;
  avgGradePoint: number;
  difficultyScore: number;
  updatedAt: string;
}

export interface InsufficientData {
  insufficientData: true;
  threshold: number;
}

export type DifficultyResult = DifficultyIndex | InsufficientData;

export interface RiskDriver {
  description: string;
  courseIds: string[];
  severity: "low" | "medium" | "high";
}

export interface RiskScore {
  score: number;
  drivers: RiskDriver[];
  plannedCourseIds: string[];
}

export interface DangerousCombination {
  courseA: string;
  courseB: string;
  support: number;
  confidence: number;
  lift: number;
  nStudents: number;
  coFailRate: number;
}

export interface TrajectoryPoint {
  semesterIndex: number;
  gpa: number;
  ciLow: number;
  ciHigh: number;
}

export interface GpaTrajectory {
  projections: TrajectoryPoint[];
  modelInfo: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface Profile {
  id: string;
  institutionId: string;
  programme: string;
  level: number;
  verifiedAt: string | null;
}
