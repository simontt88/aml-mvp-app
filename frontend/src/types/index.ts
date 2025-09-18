export interface Operator {
  id: number;
  name: string;
  email: string;
  role: 'analyst' | 'senior_analyst' | 'supervisor';
  created_at: string;
}

export interface Profile {
  profile_unique_id: string;
  profile_info: {
    profile_name: string;
    profile_dob: string;
    profile_nationality: string;
    profile_idnumber: string;
    profile_sourceofname: string;
  };
  created_at: string;
  updated_at?: string;
}

export interface WorldCheckHit {
  dj_profile_id: string;
  profile_unique_id: string;
  reference_id?: string;
  hit_record: any;
  structured_record: string;
}

export type AspectType = 'name' | 'age' | 'nationality' | 'risk';
export type FeedbackType = 'agree' | 'disagree' | 'not_related';
export type FinalVerdict = 'false_positive' | 'true_match';
export type CaseStatus = 'draft' | 'in_review' | 'submitted' | 'closed';

export interface AspectFeedback {
  id: number;
  case_review_id: number;
  aspect_type: AspectType;
  llm_output: string;
  llm_verdict_score: number;
  operator_feedback?: FeedbackType;
  operator_comment?: string;
  created_at: string;
}

export interface CaseReview {
  id: number;
  profile_unique_id: string;
  operator_id: number;
  final_verdict?: FinalVerdict;
  comments?: string;
  status: CaseStatus;
  submitted_at?: string;
  created_at: string;
  updated_at?: string;
  aspect_feedback: AspectFeedback[];
}

export interface CaseDetail {
  profile: Profile;
  worldcheck_hits: WorldCheckHit[];
  case_review?: CaseReview;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface HitListItem {
  dj_profile_id: string;
  profile_unique_id: string;
  reference_id?: string;
  created_at: string;
  match_level: string;
  profile_name?: string;
  candidate_name?: string;
  final_score?: number;
}