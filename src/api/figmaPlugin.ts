import { apiRequest } from './client';
import { getAccessToken } from './auth';

export type FigmaPluginStatus = {
  enabled: boolean;
  connected: boolean;
  expires_at: string | null;
  last_received_at: string | null;
  last_seen_at?: string | null;
  collection_state?: 'collecting' | 'sending' | 'error' | 'paused' | 'offline';
};
export type FigmaPairing = { code: string; expires_at: string; project_name: string; file_url: string };

function options(signal?: AbortSignal): RequestInit {
  const token = getAccessToken();
  if (!token) throw new Error('로그인 후 실시간 연결을 다시 시작해 주세요.');
  return { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal };
}
const path = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/figma/plugin`;

export function getFigmaPluginStatus(projectId: string, signal?: AbortSignal): Promise<FigmaPluginStatus> {
  const timeout = AbortSignal.timeout(15000);
  return apiRequest(path(projectId), options(signal ? AbortSignal.any([signal, timeout]) : timeout));
}
export function createFigmaPairing(projectId: string): Promise<FigmaPairing> {
  return apiRequest(path(projectId) + '/pairing', { ...options(AbortSignal.timeout(30000)), method: 'POST' });
}
export function disconnectFigmaPlugin(projectId: string): Promise<FigmaPluginStatus> {
  return apiRequest(path(projectId), { ...options(AbortSignal.timeout(30000)), method: 'DELETE' });
}
