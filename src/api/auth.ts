
import { ApiError, apiRequest, clearAccessToken, getAccessToken, saveLoginResponse, type SessionResponse } from './client';
export { clearAccessToken, getAccessToken };

export type LoginRequest = {
  email: string;
  password: string;
};

type LoginResponse = SessionResponse;

export type AuthUser = {
  id: number;
  user_id: string;
  name: string;
  email: string;
  account_status: string;
  created_at: string;
};

export type SignupRequest = {
  user_id: string;
  name: string;
  email: string;
  password: string;
};

type MessageResponse = {
  message: string;
};

type CodeResponse = {
  reset_token: string;
  expires_in: number;
};

// 공통 POST 요청
function post<T>(path: string, data: unknown): Promise<T> {
  return apiRequest<T>(`/api/auth${path}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// 회원가입
export const signup = (data: SignupRequest) =>
  post<AuthUser>('/signup', data);

// 이메일 확인
export const checkEmail = (email: string) =>
  post<MessageResponse>('/password/check-email', { email });

// 기존 이메일 확인 API는 등록된 이메일에 성공, 미등록 이메일에 404를 반환합니다.
export async function isEmailRegistered(email: string): Promise<boolean> {
  try {
    await checkEmail(email);
    return true;
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404) return false;
    throw cause;
  }
}

// 비밀번호 재설정 코드 요청
export const requestPasswordCode = (email: string) =>
  post<MessageResponse>('/password/request-code', { email });

// 비밀번호 재설정 코드 검증
export const verifyPasswordCode = (email: string, code: string) =>
  post<CodeResponse>('/password/verify-code', { email, code });

// 비밀번호 재설정
export const resetPassword = (
  reset_token: string,
  new_password: string,
  confirm_password: string
) =>
  post<MessageResponse>('/password/reset', {
    reset_token,
    new_password,
    confirm_password,
  });

// 인증 헤더
function authorization(): HeadersInit {
  const token = getAccessToken();

  if (!token) {
    throw new Error('로그인이 필요합니다.');
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

// 현재 사용자 정보 조회
export function getCurrentUser(
  signal?: AbortSignal
): Promise<AuthUser> {
  return apiRequest<AuthUser>('/api/auth/me', {
    headers: authorization(),
    signal,
  });
}

// 로그아웃
export async function logout(): Promise<void> {
  await apiRequest<void>('/api/auth/logout', {
    method: 'POST',
    headers: authorization(),
  });

  clearAccessToken();
}

// 일반 이메일 로그인
export async function login(
  credentials: LoginRequest
): Promise<LoginResponse> {
  const startedAt = Date.now();
  const data = await apiRequest<unknown>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });

  return saveLoginResponse(data, startedAt);
}

// GitHub OAuth 로그인 시작
export function startGithubLogin(): void {
  const githubBackendUrl =
    import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '');

  if (!githubBackendUrl) {
    throw new Error('GitHub 로그인 서버 주소를 설정해주세요.');
  }

  window.location.assign(
    `${githubBackendUrl}/api/auth/github/login`
  );
}

// React StrictMode에서 동일한 일회용 코드 중복 교환 방지
let githubExchange:
  | {
      code: string;
      promise: Promise<LoginResponse>;
    }
  | undefined;

// GitHub OAuth 로그인 완료
export function completeGithubLogin(
  query: string,
  fragment = ''
): Promise<LoginResponse> {
  // 백엔드에서 전달한 URL fragment 파싱
  const params = new URLSearchParams(
    fragment.replace(/^#/, '')
  );

  const queryParams = new URLSearchParams(query);

  // GitHub OAuth 오류 확인
  if (params.has('error') || queryParams.has('error')) {
    return Promise.reject(
      new Error(
        'GitHub 로그인을 완료하지 못했습니다. 다시 시도해주세요.'
      )
    );
  }

  // 백엔드에서 발급한 일회용 로그인 코드
  const loginCode = params.get('login_code');

  if (!loginCode) {
    return Promise.reject(
      new Error(
        'GitHub 로그인 인증 코드가 없습니다. 다시 로그인해주세요.'
      )
    );
  }

  // 동일한 로그인 코드의 중복 교환 방지
  if (githubExchange?.code === loginCode) {
    return githubExchange.promise;
  }

  // 일회용 로그인 코드를 MOEUM 세션 토큰으로 교환
  const startedAt = Date.now();
  const promise = apiRequest<unknown>(
    '/api/auth/github/exchange',
    {
      method: 'POST',
      body: JSON.stringify({
        code: loginCode,
      }),
    }
  ).then(data => saveLoginResponse(data, startedAt));

  githubExchange = {
    code: loginCode,
    promise,
  };

  return promise;
}
