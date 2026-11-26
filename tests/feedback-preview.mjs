// Local-only browser QA harness. EmailJS requests are intercepted; no email is sent.
import { createServer } from 'vite';
const configured = process.env.FEEDBACK_PREVIEW_CONFIGURED === '1';
const port = Number(process.env.FEEDBACK_PREVIEW_PORT || 5189);
const entry = `
import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router';
import { AuthContext } from '/src/state/AuthContext';
import { AppLayout } from '/src/components/AppLayout';
import '/src/styles/global.css';

let requests = 0;
let mode = 'success';
const originalFetch = window.fetch;
window.fetch = async (url, options) => {
  if (String(url).startsWith('https://api.emailjs.com/')) {
    requests++;
    document.querySelector('#request-count').textContent = String(requests);
    document.querySelector('#last-payload').textContent = options.body;
    await new Promise(resolve => setTimeout(resolve, mode === 'slow' ? 8000 : 250));
    return new Response(mode === 'failure' ? 'Test failure' : 'OK', { status: mode === 'failure' ? 500 : 200 });
  }
  return originalFetch(url, options);
};

function Preview() {
  const [response, setResponse] = useState(mode);
  return React.createElement('section', { style: { padding: '32px 16px', maxWidth: 800, margin: 'auto', overflowWrap: 'anywhere' } },
    React.createElement('h1', {}, '피드백 화면 검증'),
    React.createElement('p', {}, '${configured ? 'EmailJS 테스트 설정 있음' : 'EmailJS 설정 없음'} · 실제 메일은 발송되지 않습니다.'),
    React.createElement('label', {}, '테스트 응답 ', React.createElement('select', { value: response, onChange: event => { mode = event.target.value; setResponse(mode); } },
      React.createElement('option', { value: 'success' }, '성공'), React.createElement('option', { value: 'failure' }, '실패'), React.createElement('option', { value: 'slow' }, '지연'))),
    React.createElement('button', { style: { marginLeft: 12 }, onClick: () => localStorage.setItem('moeum.feedback.last-request', '0') }, '테스트 대기 시간 초기화'),
    React.createElement('p', {}, '요청 횟수: ', React.createElement('output', { id: 'request-count' }, String(requests))),
    React.createElement('details', {}, React.createElement('summary', {}, '마지막 테스트 요청'), React.createElement('pre', { id: 'last-payload', style: { whiteSpace: 'pre-wrap' } })));
}
createRoot(document.getElementById('root')).render(React.createElement(StrictMode, {},
  React.createElement(AuthContext.Provider, { value: { user: { id: 1, name: '테스트', user_id: 'preview', email: 'test@example.invalid' }, signOut: async () => {}, leaving: false, error: '' } },
    React.createElement(MemoryRouter, { initialEntries: ['/projects'] },
      React.createElement(Routes, {}, React.createElement(Route, { element: React.createElement(AppLayout, { header: 'centered' }) },
        React.createElement(Route, { path: '/projects', element: React.createElement(Preview) })))))));
`;
const server = await createServer({
  server: { host: '127.0.0.1', port, strictPort: true },
  define: Object.fromEntries(['SERVICE_ID', 'TEMPLATE_ID', 'PUBLIC_KEY'].map(key => [`import.meta.env.VITE_EMAILJS_${key}`, JSON.stringify(configured ? 'preview_only' : '')])),
  plugins: [{
    name: 'feedback-local-preview',
    configureServer(server) {
      server.middlewares.use('/__feedback-preview', async (_request, response, next) => {
        try {
          const html = await server.transformIndexHtml('/__feedback-preview', '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MOEUM 피드백 검증</title></head><body><div id="root"></div><script type="module" src="/@id/virtual:feedback-preview"></script></body></html>');
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.end(html);
        } catch (error) { next(error); }
      });
    },
    resolveId(id) { if (id === 'virtual:feedback-preview') return '\0feedback-preview'; },
    load(id) { if (id === '\0feedback-preview') return entry; },
  }],
});
await server.listen();
console.log(`Feedback QA (no real email): http://127.0.0.1:${port}/__feedback-preview`);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0); });
