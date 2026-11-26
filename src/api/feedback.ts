export const feedbackTypes = ['기능 제안', '오류 제보', '사용성 개선', '기타'] as const;
export type FeedbackType = typeof feedbackTypes[number];

type Feedback = { type: FeedbackType; message: string; email: string };

const cooldownKey = 'moeum.feedback.nextSendAt';
const cooldownMs = 60_000;
let nextSendAt = 0;

function remainingSeconds() {
  try {
    const saved = Number(localStorage.getItem(cooldownKey));
    if (Number.isFinite(saved)) nextSendAt = Math.max(nextSendAt, saved);
  } catch { /* 저장소를 사용할 수 없어도 이 탭의 제한은 적용합니다. */ }
  return Math.ceil((nextSendAt - Date.now()) / 1000);
}

function setCooldown(duration: number) {
  nextSendAt = Date.now() + duration;
  try { localStorage.setItem(cooldownKey, String(nextSendAt)); } catch { /* 메모리에 유지합니다. */ }
}

export async function sendFeedback({ type, message, email }: Feedback): Promise<void> {
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID?.trim();
  const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID?.trim();
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY?.trim();
  if (!serviceId || !templateId || !publicKey) {
    throw new Error('피드백 메일 전송 설정을 준비 중이에요. 잠시 후 다시 시도해 주세요.');
  }

  const wait = remainingSeconds();
  if (wait > 0) throw new Error(`${wait}초 후에 다시 보내주세요.`);

  const replyTo = email.trim();
  const submittedAt = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
  // EmailJS는 초당 한 번 요청할 수 있습니다. 성공 또는 429 응답 후에는 1분을 기다립니다.
  setCooldown(1000);
  let response: Response;
  try {
    response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: {
          feedback_type: type,
          message: message.trim(),
          submitted_at: `${submittedAt} (한국시간)`,
          ...(replyTo && { reply_to: replyTo }),
        },
      }),
    });
  } catch {
    throw new Error('전송 결과를 확인할 수 없어요. 연결 상태를 확인한 뒤 다시 시도해 주세요.');
  }

  if (response.status === 429) {
    setCooldown(cooldownMs);
    throw new Error('전송 요청이 많아요. 1분 후 다시 보내주세요.');
  }
  if (response.status !== 200 || (await response.text()).trim() !== 'OK') {
    throw new Error('피드백을 보내지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
  setCooldown(cooldownMs);
}
