import axios from 'axios';
import { 
  LoginRequest, 
  Token, 
  Operator,
  HitListItem
} from '../types';

// In Vercel, backend is routed at /api via vercel.json. Default to that in prod.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' && window.location.hostname !== 'localhost' ? '/api' : 'http://localhost:8000');

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authApi = {
  login: (credentials: LoginRequest): Promise<Token> =>
    api.post('/auth/login', credentials).then(res => res.data),
  
  getCurrentUser: (): Promise<Operator> =>
    api.get('/auth/me').then(res => res.data),
  
  logout: () => {
    localStorage.removeItem('access_token');
  }
};

export const hitsApi = {
  // v1 hits (kept briefly for Dashboard until fully moved to v2 SourceCase)
  getHits: (params?: { skip?: number; limit?: number; profile_unique_id?: string }): Promise<HitListItem[]> =>
    api.get('/api/hits', { params }).then(res => res.data),
};

// v2 cases endpoints
export interface SourceCaseDTO {
  id: number;
  profile_unique_id: string;
  dj_profile_id: string;
  reference_id?: string;
  profile_info?: any;
  structured_record: string;
  hit_record?: any;
  candidate_name?: string;
  final_score?: number;
  aspect_name_json?: string;
  aspect_age_json?: string;
  aspect_nationality_json?: string;
  aspect_risk_json?: string;
  created_at: string;
}

export interface CaseStatusDTO {
  id: number;
  profile_unique_id: string;
  dj_profile_id: string;
  case_status: string;
  aspects_status?: any;
  last_updated_at: string;
  last_updated_by?: number;
}

export interface BatchCaseStatusRequestDTO {
  pairs: { profile_unique_id: string; dj_profile_id: string }[];
}

export interface BatchCaseStatusResponseItemDTO {
  profile_unique_id: string;
  dj_profile_id: string;
  status: CaseStatusDTO;
}

export interface BatchCaseStatusResponseDTO {
  items: BatchCaseStatusResponseItemDTO[];
}

export interface AspectFeedbackDTO {
  id: number;
  profile_unique_id: string;
  dj_profile_id: string;
  aspect_type: string;
  llm_output?: string;
  llm_verdict_score?: number;
  operator_feedback?: string;
  operator_comment?: string;
  created_at: string;
  updated_at: string;
  operator_id: number;
}

export interface AspectFeedbackCreateDTO {
  aspect_type: string;
  llm_output?: string;
  llm_verdict_score?: number;
  operator_feedback?: string;
  operator_comment?: string;
}

export const v2Api = {
  listCases: (params?: { skip?: number; limit?: number; profile_unique_id?: string }): Promise<SourceCaseDTO[]> =>
    api.get('/v2/cases', { params }).then(res => res.data),
  getCase: (profileId: string, djId: string): Promise<SourceCaseDTO> =>
    api.get(`/v2/cases/${profileId}/${djId}`).then(res => res.data),
  getCaseStatus: (profileId: string, djId: string): Promise<CaseStatusDTO> =>
    api.get(`/v2/cases/${profileId}/${djId}/status`).then(res => res.data),
  updateCaseStatus: (profileId: string, djId: string, payload: Partial<CaseStatusDTO>): Promise<CaseStatusDTO> =>
    api.patch(`/v2/cases/${profileId}/${djId}/status`, payload).then(res => res.data),
  batchGetCaseStatus: (payload: BatchCaseStatusRequestDTO): Promise<BatchCaseStatusResponseDTO> =>
    api.post('/v2/cases/status:batch', payload).then(res => res.data),
  appendLog: (profileId: string, djId: string, payload: { event_type: string; payload?: any }) =>
    api.post(`/v2/cases/${profileId}/${djId}/logs`, payload).then(res => res.data),
  createAspectFeedback: (profileId: string, djId: string, feedback: AspectFeedbackCreateDTO): Promise<AspectFeedbackDTO> =>
    api.post(`/v2/cases/${profileId}/${djId}/feedback`, feedback).then(res => res.data),
  getAspectFeedback: (profileId: string, djId: string): Promise<AspectFeedbackDTO[]> =>
    api.get(`/v2/cases/${profileId}/${djId}/feedback`).then(res => res.data),
};

export const setAuthToken = (token: string) => {
  localStorage.setItem('access_token', token);
};

export const getAuthToken = () => {
  return localStorage.getItem('access_token');
};