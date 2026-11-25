const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ channel: process.env.TEST_BROWSER || 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const requests = [];
    let releaseEmail;
    let emailRequested;
    const emailRequestStarted = new Promise(resolve => { emailRequested = resolve; });
    let holdEmail = true;
    let lookupUnavailable = true;
    await page.route('**/backend/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace('/backend', '');
      const body = request.postDataJSON();
      requests.push({ path, body });
      const respond = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
      if (path === '/api/auth/password/check-email') {
        if (holdEmail) {
          holdEmail = false;
          await new Promise(resolve => { releaseEmail = resolve; emailRequested(); });
        }
        if (body.email === 'registered@example.com') return respond({ message: '가입된 이메일입니다.' });
        if (body.email === 'unavailable@example.com' && lookupUnavailable) {
          lookupUnavailable = false;
          return respond({ detail: '잠시 후 다시 시도해주세요.' }, 503);
        }
        if (body.email === 'offline@example.com') return route.abort('failed');
        return respond({ detail: '등록되지 않은 이메일 주소입니다. 다시 확인해주세요.' }, 404);
      }
      if (path === '/api/auth/signup') return respond({ id: 1, ...body }, 201);
      throw new Error(`Unexpected request: ${path}`);
    });

    await page.goto(new URL('/signup', server.resolvedUrls.local[0]).href);
    await page.getByLabel('이름', { exact: true }).fill('가입 테스트');
    const next = () => page.getByRole('button', { name: '다음', exact: true });
    const email = () => page.getByLabel('이메일', { exact: true });
    await next().click();
    await email().fill('invalid-email');
    await next().click();
    await page.getByRole('alert').filter({ hasText: '올바른 이메일 주소' }).waitFor();
    assert.equal(requests.length, 0);

    await email().fill('registered@example.com');
    await next().click();
    await emailRequestStarted;
    await page.getByText('이메일을 확인하고 있어요. 잠시만 기다려주세요.', { exact: true }).waitFor();
    assert.equal(await email().isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: '← 이전', exact: true }).isDisabled(), true);
    await page.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    assert.equal(requests.length, 1);
    releaseEmail();
    await page.getByRole('alert').filter({ hasText: '이미 사용 중인 이메일' }).waitFor();
    assert.equal(await page.locator('input[type="password"]').count(), 0);
    assert.equal(await email().getAttribute('aria-invalid'), 'true');
    assert.equal(await email().evaluate(input => input === document.activeElement), true);

    await page.setViewportSize({ width: 375, height: 812 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await email().fill('unavailable@example.com');
    assert.equal(await page.getByRole('alert').count(), 0);
    await next().click();
    await page.getByRole('alert').filter({ hasText: '잠시 후 다시 시도해주세요.' }).waitFor();
    assert.equal(await page.locator('input[type="password"]').count(), 0);
    await next().click();
    await page.getByLabel('비밀번호', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('비밀번호', { exact: true }).evaluate(input => input === document.activeElement), true);

    await page.getByRole('button', { name: '← 이전', exact: true }).click();
    await email().fill('offline@example.com');
    await next().click();
    await page.getByRole('alert').filter({ hasText: '서버에 연결하지 못했습니다' }).waitFor();
    assert.equal(await page.locator('input[type="password"]').count(), 0);

    await email().fill(' new@example.com ');
    await email().press('Enter');
    const password = page.getByLabel('비밀번호', { exact: true });
    await password.waitFor();
    assert.equal(requests.at(-1).body.email, 'new@example.com');
    await password.fill('test-password-123');
    await password.press('Enter');
    await page.getByLabel('비밀번호 확인', { exact: true }).fill('test-password-123');
    await page.getByRole('button', { name: '가입 완료하기', exact: true }).click();
    await page.getByRole('heading', { name: '모음에 오신 것을 환영해요!', exact: true }).waitFor();
    const signupRequests = requests.filter(request => request.path === '/api/auth/signup');
    assert.equal(signupRequests.length, 1);
    assert.equal(signupRequests[0].body.email, 'new@example.com');
    assert.equal(signupRequests[0].body.name, '가입 테스트');
    assert.deepEqual(errors, []);
    console.log('Signup browser checks passed: duplicate email, pending guard, lookup retry, network failure, new signup, mobile layout.');
  } finally {
    await browser?.close();
    await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
