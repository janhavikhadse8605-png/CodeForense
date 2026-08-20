/**
 * API client for CodeAuth backend.
 */
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 120000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Analysis ─────────────────────────────────────

export const analyzeCode = (code: string, language: string) =>
  api.post('/analyze', { code, language }).then(r => r.data);

export const analyzeFunctionLevel = (code: string, language: string) =>
  api.post('/analyze/function-level', { code, language }).then(r => r.data);

// ─── Health ───────────────────────────────────────

export const getHealth = () =>
  api.get('/health').then(r => r.data);

// ─── History ──────────────────────────────────────

export const getHistory = (limit = 50, offset = 0) =>
  api.get('/history', { params: { limit, offset } }).then(r => r.data);

export const getAnalysisDetail = (id: string) =>
  api.get(`/history/${id}`).then(r => r.data);

// ─── Dashboard ────────────────────────────────────

export const getDashboardStats = () =>
  api.get('/dashboard/stats').then(r => r.data);

// ─── Repository ───────────────────────────────────

export const uploadRepository = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/repository/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000,
  }).then(r => r.data);
};

export const getRepository = (id: string) =>
  api.get(`/repository/${id}`).then(r => r.data);

// ─── Evolution ────────────────────────────────────

export const analyzeEvolution = (versions: Array<{code: string, label: string, timestamp?: string}>, language: string) =>
  api.post('/evolution/analyze', { versions, language }).then(r => r.data);

// ─── Evaluation ───────────────────────────────────

export const runEvaluation = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/evaluation/run', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 600000,
  }).then(r => r.data);
};

export const getLatestEvaluation = () =>
  api.get('/evaluation/latest').then(r => r.data);

// ─── Feedback ─────────────────────────────────────

export const submitFeedback = (data: {
  analysis_id?: string;
  prediction: string;
  confidence: number;
  reviewer_label: string;
  actual_authorship?: string;
  comment?: string;
}) => api.post('/feedback', data).then(r => r.data);

export const getFeedback = () =>
  api.get('/feedback').then(r => r.data);

// ─── Similarity ───────────────────────────────────

export const analyzeSimilarity = (code: string, language: string) =>
  api.post('/similarity', { code, language }).then(r => r.data);

// ─── Projects ─────────────────────────────────────

export const getProjects = () =>
  api.get('/projects').then(r => r.data);

export const createProject = (data: { name: string; description?: string; repository_url?: string }) =>
  api.post('/projects', data).then(r => r.data);

// ─── Reports ──────────────────────────────────────

export const generateReport = (data: { analysis_id?: string; title?: string; format?: string }) =>
  api.post('/reports/generate', data).then(r => r.data);

export const getReports = () =>
  api.get('/reports').then(r => r.data);

export const getReport = (id: string) =>
  api.get(`/reports/${id}`).then(r => r.data);

// ─── Investigation ────────────────────────────────

export const runInvestigation = (data: { repository_id?: string; task?: string }) =>
  api.post('/investigation/run', data).then(r => r.data);

// ─── Model Info ───────────────────────────────────

export const getModelInfo = () =>
  api.get('/model/info').then(r => r.data);

export default api;
