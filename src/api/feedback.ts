import emailjs from '@emailjs/browser';

export const feedbackTypes = ['기능 제안', '오류 제보', '사용성 개선', '기타'] as const;
export type FeedbackType = typeof feedbackTypes[number];
export const FEEDBACK_MAX_LENGTH = 500;
const RATE_LIMIT_ID = 'moeum.feedback.last-request';
const RATE_LIMIT_MS = 60_000;

type FeedbackInput = { type: FeedbackType; message: string; email: string; website?: string };

// Only an attempt timestamp is stored. Feedback text and email addresses are never persisted.
const memoryStorage = new Map<string, string>();
const storageProvider = {
  async get(key: string) {
    try { return localStorage.getItem(key) ?? memoryStorage.get(key) ?? null; }
    catch { return memoryStorage.get(key) ?? null; }
  },
  async set(key: string, value: string) {
    memoryStorage.set(key, value);
    try { localStorage.setItem(key, value); } catch { /* Keep the in-memory throttle. */ }
  },
  async remove(key: string) {
    memoryStorage.delete(key);
    try { localStorage.removeItem(key); } catch { /* Storage is optional. */ }
  },
};

function config() {
  return {
    serviceId: import.meta.env.VITE_EMAILJS_SERVICE_ID?.trim(),
    templateId: import.meta.env.VITE_EMAILJS_TEMPLATE_ID?.trim(),
    publicKey: import.meta.env.VITE_EMAILJS_PUBLIC_KEY?.trim(),
  };
}

export function isFeedbackConfigured() {
  const { serviceId, templateId, publicKey } = config();
  return Boolean(serviceId && templateId && publicKey);
}

export function isFeedbackEmailValid(value: string) {
  const email = value.trim();
  return !email || (email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

export async function feedbackRetryAfter() {
  const lastRequest = Number(await storageProvider.get(RATE_LIMIT_ID));
  if (!Number.isFinite(lastRequest)) return 0;
  return Math.ceil(Math.min(RATE_LIMIT_MS, Math.max(0, lastRequest + RATE_LIMIT_MS - Date.now())) / 1000);
}

let sending = false;

export async function sendFeedback(input: FeedbackInput): Promise<void> {
  if (sending) throw new Error('이미 피드백을 보내고 있어요. 잠시만 기다려주세요.');
  if (!feedbackTypes.includes(input.type) || !input.message.trim() || input.message.length > FEEDBACK_MAX_LENGTH) {
    throw new Error('피드백 유형과 500자 이내의 상세 의견을 입력해주세요.');
  }
  if (!isFeedbackEmailValid(input.email)) throw new Error('올바른 이메일 주소를 입력해주세요.');
  if (input.website?.trim()) throw new Error('전송하지 못했어요. 입력 내용을 확인하고 다시 시도해주세요.');
  const { serviceId, templateId, publicKey } = config();
  if (!serviceId || !templateId || !publicKey) {
    throw new Error('피드백 전송이 아직 준비되지 않았어요. 잠시 후 다시 시도해주세요.');
  }

  sending = true;
  try {
    const result = await emailjs.send(serviceId, templateId, {
      feedback_type: input.type,
      feedback_message: input.message.trim(),
      user_email: input.email.trim() || '미입력',
      submitted_at: new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul', dateStyle: 'long', timeStyle: 'medium',
      }).format(new Date()) + ' (KST)',
    }, {
      publicKey,
      blockHeadless: true,
      limitRate: { id: RATE_LIMIT_ID, throttle: RATE_LIMIT_MS },
      storageProvider,
    });
    if (result.status !== 200) throw new Error('Unexpected EmailJS response');
  } catch (cause) {
    const status = typeof cause === 'object' && cause !== null && 'status' in cause ? cause.status : undefined;
    if (status === 429) throw new Error('전송 요청이 많아요. 1분 후 다시 시도해주세요.');
    if (status === 451) throw new Error('현재 브라우저에서 전송할 수 없어요. 일반 브라우저에서 다시 시도해주세요.');
    throw new Error('피드백을 보내지 못했어요. 입력 내용은 유지됩니다. 잠시 후 다시 시도해주세요.');
  } finally {
    sending = false;
  }
}
