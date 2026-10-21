// base URL 불러오는 코드
// npm run dev에서는 Vite 프록시를 거치고, 배포 빌드에서는 실제 서버에 요청합니다.
export const API_BASE_URL = import.meta.env.DEV
  ? '/backend'
  : import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '');

// API 요청이 실패했을 때, 오류 메시지와 상태 코드를 함께 담는 오류를 만드는 코드
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: unknown,
  ) {
    super(getErrorMessage(data, status));
    this.name = 'ApiError';
  }
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
  if (!API_BASE_URL) {
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

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error('서버에 연결하지 못했습니다. 인터넷 연결, 서버 상태, 백엔드 CORS 설정을 확인해주세요.');
  }

  const text = await response.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (!response.ok) throw new ApiError(response.status, undefined);
      throw new Error('서버가 JSON 형식이 아닌 응답을 반환했습니다. API 경로를 확인해주세요.');
    }
  }
  if (!response.ok) throw new ApiError(response.status, data);
  // T는 호출하는 쪽의 TypeScript 타입입니다. 실제 응답 검증을 대신하지 않습니다.
  return data as T;
}
