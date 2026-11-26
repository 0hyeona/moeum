import { apiRequest } from './client';
import { getAccessToken } from './auth';

export type FigmaConnection = {
  connected: boolean;
  figma_user_id: string | null;
  expires_at: string | null;
};

const PENDING_KEY = 'moeum.figma.pending';
const CALLBACK_PATH = '/auth/figma/callback';
const PATHS = new Set(['/settings', '/dashboard', '/changes', '/projects']);

export class FigmaCallbackMismatchError extends Error {
  constructor() {
    super('Figma 연결 주소가 현재 사이트와 맞지 않아요.');
    this.name = 'FigmaCallbackMismatchError';
  }
}

function authorization(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error('로그인 후 Figma 연결을 다시 시작해 주세요.');
  return { Authorization: `Bearer ${token}` };
}

export function figmaReturnPath(value = '/settings#figma-account'): string {
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin === window.location.origin && PATHS.has(url.pathname)) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch { /* Use the account settings page for invalid return URLs. */ }
  return '/settings#figma-account';
}

function connection(data: unknown): FigmaConnection {
  if (typeof data !== 'object' || data === null || !('connected' in data)
      || typeof data.connected !== 'boolean'
      || !('figma_user_id' in data) || !(data.figma_user_id === null || typeof data.figma_user_id === 'string')
      || !('expires_at' in data) || !(data.expires_at === null || typeof data.expires_at === 'string')) {
    throw new Error('Figma 연결 상태 응답을 확인하지 못했습니다.');
  }
  return data as FigmaConnection;
}

export async function getFigmaConnection(signal?: AbortSignal): Promise<FigmaConnection> {
  return connection(await apiRequest<unknown>('/api/integrations/figma', {
    headers: authorization(), cache: 'no-store', signal,
  }));
}

export async function startFigmaConnection(returnTo?: string): Promise<void> {
  const result = await apiRequest<{ authorization_url: string }>('/api/integrations/figma/authorize', {
    method: 'POST', headers: authorization(), cache: 'no-store', signal: AbortSignal.timeout(30000),
  });
  const url = new URL(result.authorization_url);
  if (url.origin !== 'https://www.figma.com' || url.pathname !== '/oauth') {
    throw new Error('Figma 승인 주소가 올바르지 않습니다.');
  }
  const state = url.searchParams.get('state');
  const callback = new URL(url.searchParams.get('redirect_uri') || '');
  if (!state || callback.origin !== window.location.origin || callback.pathname !== CALLBACK_PATH
      || callback.search || callback.hash) {
    throw new FigmaCallbackMismatchError();
  }
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ state, returnTo: figmaReturnPath(returnTo) }));
  window.location.assign(url.href);
}

let exchange: { state: string; token: string | null; promise: Promise<{ returnTo: string }> } | undefined;

export function completeFigmaConnection(query: string): Promise<{ returnTo: string }> {
  const params = new URLSearchParams(query);
  if (params.has('error')) {
    sessionStorage.removeItem(PENDING_KEY);
    return Promise.reject(new Error('Figma 연결 승인이 취소됐어요. 대시보드에서 다시 연결할 수 있어요.'));
  }
  const code = params.get('code');
  const state = params.get('state');
  const token = getAccessToken();
  // Share the exchange across StrictMode effect replays; never retry used state.
  if (state && exchange?.state === state && exchange.token === token) return exchange.promise;
  try {
    const headers = authorization();
    const saved = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
    if (!code || !state || saved?.state !== state) {
      throw new Error('Figma 연결 요청을 확인하지 못했습니다. 같은 창에서 연결을 다시 시작해 주세요.');
    }
    const returnTo = figmaReturnPath(typeof saved.returnTo === 'string' ? saved.returnTo : undefined);
    const promise = apiRequest<unknown>('/api/integrations/figma/exchange', {
      method: 'POST', headers, body: JSON.stringify({ code, state }),
      cache: 'no-store', signal: AbortSignal.timeout(30000),
    }).then(data => {
      const result = connection(data);
      if (!result.connected || !result.figma_user_id) throw new Error('Figma 연결을 완료하지 못했습니다.');
      return { returnTo };
    }).finally(() => sessionStorage.removeItem(PENDING_KEY));
    exchange = { state, token, promise };
    return promise;
  } catch (error) {
    return Promise.reject(error);
  }
}
