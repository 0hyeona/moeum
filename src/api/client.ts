// base URL 불러오는 코드
// npm run dev에서는 Vite 프록시를 거치고, 배포 빌드에서는 실제 서버에 요청합니다.
export const API_BASE_URL = import.meta.env.DEV
  ? '/backend'
  : import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '');

const TOKEN_KEY = 'moeum.access_token';
const EXPIRY_KEY = 'moeum.session_expires_at';
const NOTICE_KEY = 'moeum.session_expired';
const protectedRequests = new Map<AbortController, string>();
const expirationListeners = new Set<() => void>();
let sessionGeneration = 0;
let renewal: { token: string | null; generation: number; controller: AbortController; promise: Promise<SessionResponse> } | undefined;
export type SessionResponse = { access_token: string; token_type: string; expires_in: number };
export const SESSION_EXPIRED_MESSAGE = '로그인이 만료되었거나 종료되었습니다. 다시 로그인해주세요.';

export function getAccessToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function getSessionExpiresAt(): number | null {
  try {
    const value = sessionStorage.getItem(EXPIRY_KEY);
    const expiresAt = value ? Number(value) : NaN;
    return Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : null;
  } catch { return null; }
}

export function hasExpiredSessionNotice(): boolean {
  try { return sessionStorage.getItem(NOTICE_KEY) === 'true'; } catch { return false; }
}

function abortProtectedRequests(keepToken?: string): void {
  for (const [controller, token] of protectedRequests) {
    if (token !== keepToken) controller.abort();
  }
}

export function clearAccessToken(): void {
  sessionGeneration++;
  renewal?.controller.abort();
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EXPIRY_KEY);
  } finally { abortProtectedRequests(); }
}

export function storeLoginSession(token: string, expiresIn: number, startedAt: number): void {
  if (token !== getAccessToken()) sessionGeneration++;
  try {
    sessionStorage.setItem(EXPIRY_KEY, String(startedAt + expiresIn * 1000));
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.removeItem(NOTICE_KEY);
  } catch {
    try { clearAccessToken(); } catch { /* Storage may be unavailable. */ }
    throw new Error('로그인 정보를 저장하지 못했습니다. 브라우저의 사이트 저장소 설정을 확인해주세요.');
  }
  abortProtectedRequests(token);
}

export function expireLoginSession(expectedToken = getAccessToken()): boolean {
  // A late response from a previous session must not sign out a newer login.
  if (!expectedToken || expectedToken !== getAccessToken()) return false;
  try { clearAccessToken(); } catch { /* Still notify the mounted session boundary. */ }
  try { sessionStorage.setItem(NOTICE_KEY, 'true'); } catch { /* Route state also carries the notice. */ }
  for (const listener of expirationListeners) listener();
  return true;
}

export function isSessionRenewalDue(): boolean {
  const expiresAt = getSessionExpiresAt();
  return expiresAt !== null && expiresAt <= Date.now() + 60000;
}

export function subscribeSessionExpiration(listener: () => void): () => void {
  expirationListeners.add(listener);
  return () => { expirationListeners.delete(listener); };
}

// API 요청이 실패했을 때, 오류 메시지와 상태 코드를 함께 담는 오류를 만드는 코드
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: unknown,
    public readonly headers = new Headers(),
  ) {
    super(getErrorMessage(data, status));
    this.name = 'ApiError';
  }

  get code(): string | null {
    return this.headers.get('X-Auth-Error') ?? this.headers.get('X-Integration-Error');
  }
}

export function saveLoginResponse(data: unknown, startedAt: number): SessionResponse {
  if (typeof data !== 'object' || data === null || !('access_token' in data)
    || typeof data.access_token !== 'string' || !data.access_token.trim()
    || !('expires_in' in data) || typeof data.expires_in !== 'number'
    || !Number.isFinite(data.expires_in) || data.expires_in <= 0
    || ('token_type' in data && (typeof data.token_type !== 'string' || data.token_type.toLowerCase() !== 'bearer'))) {
    throw new Error('로그인 응답의 access_token, token_type 또는 expires_in 형식을 확인해주세요.');
  }
  const result = { access_token: data.access_token, token_type: 'bearer', expires_in: data.expires_in };
  storeLoginSession(result.access_token, result.expires_in, startedAt);
  return result;
}

export function renewLoginSession(): Promise<SessionResponse> {
  const token = getAccessToken();
  const generation = sessionGeneration;
  if (renewal?.token === token && renewal.generation === generation) return renewal.promise;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const startedAt = Date.now();
  let promise: Promise<SessionResponse>;
  promise = (async () => {
    let response: Response;
    try {
      response = await fetch('/backend/api/auth/refresh', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
    } catch (cause) {
      if (controller.signal.aborted) throw cause;
      throw new Error('로그인 연결을 확인하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해주세요.');
    }
    const text = await response.text();
    controller.signal.throwIfAborted();
    // Logout or a different login takes precedence over an older restore request.
    if (generation !== sessionGeneration || token !== getAccessToken()) throw new DOMException('Session changed', 'AbortError');
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = undefined; }
    if (!response.ok) {
      if (response.status === 401) expireLoginSession(token);
      throw new ApiError(response.status, data, response.headers);
    }
    return saveLoginResponse(data, startedAt);
  })().finally(() => {
    clearTimeout(timeout);
    if (renewal?.promise === promise) renewal = undefined;
  });
  renewal = { token, generation, controller, promise };
  return promise;
}

// 에러 발생 시 에러 객체 -> 메시지로 바꿔주는 코드
function getErrorMessage(data: unknown, status: number): string {
  if (typeof data === 'object' && data !== null && 'detail' in data) {
    const detail: unknown = data.detail;
    if (typeof detail === 'string') return detail;
    // FastAPI의 입력값 검증 오류(detail 배열)도 읽을 수 있게 처리합니다.
    if (Array.isArray(detail)) {
      const messages = detail.flatMap((item: unknown) => {
        if (typeof item !== 'object' || item === null || !('msg' in item)) return [];
        return typeof item.msg === 'string' ? [item.msg] : [];
      });
      if (messages.length) return messages.join('\n');
    }
  }
  return `요청에 실패했습니다. (HTTP ${status})`;
}

// path에는 Swagger에서 확인한 API 경로를 넣습니다.
// options에는 method, headers, body 등을 넣습니다.
export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  // First-party auth requests keep the HttpOnly cookie working when third-party cookies are blocked.
  const baseUrl = path.startsWith('/api/auth/') ? '/backend' : API_BASE_URL;
  if (!baseUrl) {
    throw new Error('.env에 VITE_API_BASE_URL을 설정하고 개발 서버를 다시 실행해주세요.');
  }
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) {
    throw new Error('API 경로는 /로 시작하는 서버 내부 경로여야 합니다.');
  }

  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  // JSON.stringify로 만든 본문에만 JSON Content-Type을 기본으로 지정합니다.
  // FormData나 URLSearchParams는 브라우저가 알맞게 지정합니다.
  if (typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const authorization = headers.get('Authorization');
  let token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const authenticated = Boolean(token) && !/^\/api\/auth\/(?:login|signup|github\/exchange|password(?:\/|$))/.test(path);
  if (authenticated && path !== '/api/auth/logout' && token === getAccessToken() && isSessionRenewalDue()) {
    const session = await renewLoginSession();
    options.signal?.throwIfAborted();
    token = session.access_token;
    headers.set('Authorization', `Bearer ${token}`);
  }
  const controller = authenticated ? new AbortController() : null;
  const forwardAbort = () => controller?.abort(options.signal?.reason);
  if (controller && token) {
    protectedRequests.set(controller, token);
    if (options.signal?.aborted) forwardAbort();
    else options.signal?.addEventListener('abort', forwardAbort, { once: true });
  }
  const signal = controller?.signal ?? options.signal;
  try {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, { ...options, headers, signal,
        ...(path.startsWith('/api/auth/') && { credentials: 'same-origin' as const, cache: 'no-store' as const }) });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error('서버에 연결하지 못했습니다. 인터넷 연결, 서버 상태, 백엔드 CORS 설정을 확인해주세요.');
    }
    const text = await response.text();
    signal?.throwIfAborted();
    let data: unknown = undefined;
    if (text) {
      try { data = JSON.parse(text); } catch {
        if (response.ok) throw new Error('서버가 JSON 형식이 아닌 응답을 반환했습니다. API 경로를 확인해주세요.');
      }
    }
    if (!response.ok) {
      if (authenticated && response.status === 401) expireLoginSession(token);
      throw new ApiError(response.status, data, response.headers);
    }
    // T is a caller-provided type; response validation remains at the API boundary.
    return data as T;
  } finally {
    if (controller) protectedRequests.delete(controller);
    options.signal?.removeEventListener('abort', forwardAbort);
  }
}
