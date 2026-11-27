const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5188, strictPort: true }, logLevel: 'error' });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ channel: process.env.TEST_BROWSER || 'chrome', headless: true });
    async function fixture(lifetime = 30 * 86400000, storageState, pathname = '/dashboard', fakeClock = false) {
      const context = await browser.newContext({ storageState });
      const page = await context.newPage();
      if (fakeClock) await page.clock.install();
      page.setDefaultTimeout(10000);
      const failures = [];
      page.on('pageerror', error => failures.push(error.message));
      let mode = 'normal';
      const calls = [];
      const now = new Date().toISOString();
      const user = { id: 1, user_id: 'fixture', name: '인증 테스트', email: 'fixture@example.invalid', account_status: 'active', created_at: now };
      const project = { id: 7, owner_id: 1, project_name: '인증 검증 프로젝트', description: '',
        github_url: 'https://github.com/fixture/repo', figma_url: 'https://www.figma.com/design/FIXTURE/Test',
        notion_url: null, project_status: 'active', created_at: now, updated_at: now };
      if (!storageState) await context.addCookies([{ name: 'moeum_session', value: 'fixture-initial-session',
        url: 'http://127.0.0.1:5188', httpOnly: true, sameSite: 'Lax', expires: Date.now() / 1000 + 30 * 86400 }]);
      await page.route('**/backend/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname.replace('/backend', '');
        calls.push({ path, method: request.method() });
        const respond = (data, status = 200, headers = {}) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(data) });
        if (path === '/api/auth/login') {
          if (request.postDataJSON().password === 'wrong') return respond({ detail: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401);
          mode = 'normal';
          return respond({ access_token: 'fixture-renewed-session', token_type: 'bearer', expires_in: 30 * 86400, user }, 200,
            { 'Set-Cookie': 'moeum_session=fixture-renewed-session; Max-Age=2592000; HttpOnly; SameSite=Lax; Path=/' });
        }
        if (mode === 'session-expired') return respond({ detail: '유효하지 않거나 만료된 로그인입니다.' }, 401,
          { 'X-Auth-Error': 'SESSION_EXPIRED' });
        if (path === '/api/auth/refresh') {
          const cookie = request.headers().cookie?.match(/(?:^|;\s*)moeum_session=([^;]+)/)?.[1];
          const token = request.headers().authorization?.replace(/^Bearer /, '') || cookie;
          if (!token || mode === 'signed-out') return respond({ detail: '로그인이 필요합니다.' }, 401, { 'X-Auth-Error': 'AUTH_REQUIRED' });
          return respond({ access_token: token, token_type: 'bearer', expires_in: lifetime / 1000, user }, 200,
            { 'Set-Cookie': `moeum_session=${token}; Max-Age=2592000; HttpOnly; SameSite=Lax; Path=/` });
        }
        if (path === '/api/auth/logout') {
          mode = 'signed-out';
          return route.fulfill({ status: 204, headers: { 'Set-Cookie': 'moeum_session=; Max-Age=0; Path=/' } });
        }
        if (path === '/api/auth/me') return respond(user);
        if (path === '/projects') return respond([project]);
        if (path === '/stories') return respond([]);
        if (path === '/project_activities') return respond([]);
        if (path === '/api/projects/7/figma/plugin') return respond({ enabled: false, connected: false, expires_at: null, last_received_at: null });
        if (path === '/api/projects/7/activities') return respond(url.searchParams.get('source') === 'github' ? [{
          activity_id: 42, project_id: 7, source: 'github', story_id: null, external_id: 'fixture/repo:abc1234',
          branch_name: 'main', title: '저장된 커밋', description: null, occurred_at: now, source_url: 'https://github.com/fixture/repo/commit/abc1234',
        }] : []);
        if (path === '/api/projects/7/github/branches') {
          if (mode === 'github-expired') return respond({ detail: 'GitHub 연결이 만료되었습니다. GitHub로 다시 로그인해주세요.' }, 409,
            { 'X-Integration-Error': 'GITHUB_RECONNECT_REQUIRED' });
          if (mode === 'transient') return respond({ detail: 'GitHub 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.' }, 503);
          return respond({ items: [], has_next: false });
        }
        throw new Error('Unexpected mock endpoint: ' + path);
      });
      await page.goto('http://127.0.0.1:5188' + pathname);
      await page.getByRole('heading', { name: '최근 GitHub 변경사항', exact: true }).waitFor();
      await page.getByText('저장된 커밋', { exact: true }).waitFor();
      const github = page.getByRole('region', { name: '최근 GitHub 변경사항' });
      return { context, page, github, calls, failures, mode: value => { mode = value; } };
    }

    const expired = await fixture();
    expired.mode('session-expired');
    await expired.github.getByRole('button', { name: '새로고침', exact: true }).click();
    await expired.page.waitForURL('**/login');
    await expired.page.getByText('로그인이 만료되었거나 종료되었습니다. 다시 로그인해주세요.', { exact: true }).waitFor();
    assert.equal(await expired.page.evaluate(() => sessionStorage.getItem('moeum.access_token')), null);
    await expired.page.waitForTimeout(200);
    const count = expired.calls.length;
    await expired.page.waitForTimeout(5500);
    assert.equal(expired.calls.length, count, 'Protected polling must stop after expiry');
    await expired.page.getByLabel('이메일', { exact: true }).fill('fixture@example.invalid');
    await expired.page.getByLabel('비밀번호', { exact: true }).fill('wrong');
    await expired.page.getByRole('button', { name: '로그인', exact: true }).click();
    await expired.page.getByText('이메일 또는 비밀번호가 올바르지 않습니다.', { exact: true }).waitFor();
    await expired.page.getByLabel('비밀번호', { exact: true }).fill('fixture-password');
    await expired.page.getByRole('button', { name: '로그인', exact: true }).click();
    await expired.page.waitForURL('**/dashboard');
    await expired.page.getByText('저장된 커밋', { exact: true }).waitFor();
    assert.equal(await expired.page.evaluate(() => Number(sessionStorage.getItem('moeum.session_expires_at')) > Date.now()), true);
    assert.deepEqual(expired.failures, []);
    await expired.context.close();
    console.log('PASS: protected 401 redirects, stops polling, separates invalid credentials and recovers after login');

    const provider = await fixture();
    provider.mode('github-expired');
    await provider.github.getByRole('button', { name: '새로고침', exact: true }).click();
    await provider.github.getByRole('link', { name: 'GitHub 다시 연결', exact: true }).waitFor();
    assert.equal(await provider.github.getByRole('button', { name: '다시 시도', exact: true }).count(), 0);
    await provider.page.getByText('저장된 커밋', { exact: true }).waitFor();
    assert.equal(await provider.page.evaluate(() => Boolean(sessionStorage.getItem('moeum.access_token'))), true);
    await provider.github.getByRole('link', { name: 'GitHub 다시 연결', exact: true }).click();
    await provider.page.getByText('기존에 연결한 GitHub 계정으로 다시 로그인해주세요.', { exact: true }).waitFor();
    assert.deepEqual(provider.failures, []);
    await provider.context.close();
    console.log('PASS: GitHub 409 preserves the MOEUM session and saved commits, and offers GitHub reconnection');

    const transient = await fixture();
    transient.mode('transient');
    await transient.github.getByRole('button', { name: '새로고침', exact: true }).click();
    await transient.github.getByRole('button', { name: '다시 시도', exact: true }).waitFor();
    assert.equal(new URL(transient.page.url()).pathname, '/dashboard');
    assert.deepEqual(transient.failures, []);
    await transient.context.close();
    console.log('PASS: transient failures retain a retry action');

    const deadline = await fixture(30 * 86400000, undefined, '/dashboard', true);
    const initialRefreshes = deadline.calls.filter(call => call.path === '/api/auth/refresh').length;
    const renewed = deadline.page.waitForResponse(response => response.url().endsWith('/api/auth/refresh'));
    await deadline.page.clock.fastForward(61 * 60000);
    await renewed;
    await deadline.page.waitForFunction(() => Number(sessionStorage.getItem('moeum.session_expires_at')) > Date.now());
    assert.ok(deadline.calls.filter(call => call.path === '/api/auth/refresh').length > initialRefreshes);
    assert.equal(new URL(deadline.page.url()).pathname, '/dashboard');
    assert.deepEqual(deadline.failures, []);
    await deadline.context.close();
    console.log('PASS: an open dashboard stays signed in beyond one hour with automatic server renewal');

    const resumed = await fixture();
    await resumed.page.evaluate(() => {
      sessionStorage.setItem('moeum.session_expires_at', String(Date.now() - 1000));
      window.dispatchEvent(new Event('focus'));
    });
    await resumed.page.waitForFunction(() => Number(sessionStorage.getItem('moeum.session_expires_at')) > Date.now());
    assert.equal(new URL(resumed.page.url()).pathname, '/dashboard');
    assert.deepEqual(resumed.failures, []);
    await resumed.context.close();
    console.log('PASS: returning to a suspended tab renews a stale local deadline');

    const persisted = await fixture();
    assert.equal(await persisted.page.evaluate(() => document.cookie.includes('moeum_session')), false);
    const state = await persisted.context.storageState();
    assert.ok(state.cookies.some(cookie => cookie.name === 'moeum_session' && cookie.httpOnly && cookie.expires > Date.now() / 1000));
    assert.equal(JSON.stringify(state.origins).includes('access_token'), false);
    await persisted.context.close();
    const reopened = await fixture(30 * 86400000, state, '/');
    assert.equal(new URL(reopened.page.url()).pathname, '/dashboard');
    assert.deepEqual(reopened.failures, []);
    await reopened.context.close();
    console.log('PASS: a fresh browser context restores login from the HttpOnly cookie without JavaScript token storage');

    const signedOut = await fixture();
    await signedOut.page.getByRole('button', { name: '인증 테스트님 프로필', exact: true }).click();
    await signedOut.page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await signedOut.page.waitForURL('**/login');
    assert.equal((await signedOut.context.cookies()).some(cookie => cookie.name === 'moeum_session'), false);
    await signedOut.page.goto('http://127.0.0.1:5188/dashboard');
    await signedOut.page.waitForURL('**/login');
    assert.deepEqual(signedOut.failures, []);
    await signedOut.context.close();
    console.log('PASS: explicit logout clears the persistent cookie and prevents automatic restoration');
  } finally {
    await browser?.close();
    await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
