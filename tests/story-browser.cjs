const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const outputDir = process.env.TEST_OUTPUT_DIR || path.join(os.tmpdir(), 'moeum-story-browser');
fs.mkdirSync(outputDir, { recursive: true });
let debugPage, debugBrowser, server;
(async () => {
  const { createServer } = await import('vite');
  server = await createServer({ server: { host: '127.0.0.1', port: 5187, strictPort: true }, logLevel: 'error' });
  await server.listen();
  const browser = await chromium.launch({ channel: process.env.TEST_BROWSER || 'chrome', headless: true });
  debugBrowser=browser;
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  debugPage=page;page.setDefaultTimeout(12000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const requests = [];
  const now = new Date().toISOString();
  const projects = [7, 8].map(id => ({ id, owner_id: 1, project_name: `테스트 프로젝트 ${id}`, description: '', github_url: null,
    figma_url: id === 7 ? 'https://www.figma.com/design/mock/Test' : null, notion_url: null, project_status: 'active', created_at: now, updated_at: now }));
  const font = text => JSON.stringify({ fontName: { family: 'Inter', style: 'Regular' }, fontSize: 16,
    segments: [{ characters: text, start: 0, end: text.length, fontSize: 16 }] });
  const figmaDescription = `마지막 전송과 비교한 변경 내용\n요소 추가 0개 · 삭제 0개 · 수정 2개\n\n페이지 / 버튼\n텍스트: 저장 → 저장 완료\n글꼴 스타일: ${font('저장')} → ${font('저장 완료')}\n\n페이지 / 배경\n모서리: 8 → 12`;
  const activities = [101, 102].map(activity_id => ({ activity_id, project_id: 7, story_id: null, external_id: String(activity_id), branch_name: null,
    source: 'figma', activity_type: 'version', title: `디자인 변경 ${activity_id}`, description: figmaDescription, source_url: null, occurred_at: now, created_at: now }));
  const stories = new Map();
  stories.set(30, { id: 30, project_id: 8, title: '다른 프로젝트 초안', content: 'preserve', story_status: 'draft', created_at: now, updated_at: now, ai_analysis: { moeum_editor: { memo: '보관 메모' } } });
  let nextId = 11, slow = false, release, fail = false, holdAnalysis = false, releaseAnalysis;
  const wait = async (fn, label) => { for(let i=0;i<100;i++){if(fn()) return;await new Promise(r=>setTimeout(r,50));}throw new Error('Timeout: '+label); };
  await page.addInitScript(() => sessionStorage.setItem('moeum.access_token', 'test-only-token'));
  await page.route('**/backend/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname.replace('/backend',''), method=req.method();
    const body = req.postDataJSON(); requests.push({path,method,body});
    const respond = (data,status=200) => route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    if (path === '/api/auth/me') return respond({ id: 1, user_id: 'test', name: '테스트', email: 'test@example.invalid', account_status:'active', created_at:now });
    if (path === '/projects') return respond(projects);
    if (path === '/api/integrations/figma') return respond({ connected: false, figma_user_id: null, expires_at: null });
    if (/^\/api\/projects\/\d+\/figma\/plugin$/.test(path)) return respond({ enabled: false, connected: false, expires_at: null, last_received_at: null });
    if (path === '/api/integrations/figma/authorize') return respond({ authorization_url: 'https://www.figma.com/oauth?' + new URLSearchParams({
      state: 'test-state', redirect_uri: 'https://configured.example/auth/figma/callback', response_type: 'code', client_id: 'client',
    }) });
    if (path === '/project_activities' || /\/activities$/.test(path)) {
      const projectId = Number(url.searchParams.get('project_id') || path.split('/')[3]);
      const unorganized = url.searchParams.get('unorganized'), storyId = url.searchParams.get('story_id');
      return respond(activities.filter(a=>a.project_id===projectId && (unorganized==='true'?a.story_id===null:unorganized==='false'?a.story_id!==null:true) && (!storyId||a.story_id===Number(storyId))));
    }
    if (path === '/stories/analyze') {
      if (holdAnalysis) { holdAnalysis=false; await new Promise(resolve => releaseAnalysis=resolve); }
      return respond({title:'로그인 디자인 개선',summary:'글꼴 스타일: {"fontName": …\n저장된 기록을 정리한 자체 분석이에요.',before:null,after:null,tags:['UI','로그인']});
    }
    if (path === '/stories' && method==='GET') return respond([...stories.values()].filter(s=>s.project_id===Number(url.searchParams.get('project_id'))));
    if (path === '/stories' && method==='POST') {
      const id=++nextId, row={ id, content:'', created_at:now, updated_at:now, ...body };
      stories.set(id,row);for(const a of activities)if(body.activity_ids.includes(a.activity_id))a.story_id=id;
      return respond(row,201);
    }
    const match=path.match(/^\/stories\/(\d+)$/);
    if(match){
      const id=Number(match[1]), row=stories.get(id);
      if(!row) return respond({detail:'Story를 찾을 수 없어요.'},404);
      if(method==='GET') return respond(row);
      if(method==='PATCH'){
        if(fail){fail=false;return respond({detail:'테스트 저장 실패'},500);}
        const updated={...row,...body,updated_at:new Date().toISOString()};stories.set(id,updated);
        if(slow){slow=false;await new Promise(r=>release=r);}
        return respond(updated);
      }
      if(method==='DELETE'){stories.delete(id);for(const a of activities)if(a.story_id===id)a.story_id=null;return route.fulfill({status:204});}
    }
    console.error('Unhandled request',method,path);return respond({detail:'Unhandled mock'},404);
  });
  console.log('Opening changes');
  await page.goto('http://127.0.0.1:5187/changes?period=all');
  await page.getByRole('checkbox').first().waitFor();
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    const periodButton = page.locator('button[aria-haspopup="dialog"]').first();
    assert.equal(await periodButton.innerText(), width === 1440 ? '전체 기간' : '기간');
    await page.screenshot({ path: path.join(outputDir, 'changes-' + width + '.png'), fullPage: true });
    await periodButton.click();
    const dialog = page.getByRole('dialog', { name: '기간 선택' });
    await dialog.waitFor();
    assert.equal(await dialog.evaluate(node => getComputedStyle(node.firstElementChild).padding), width === 1440 ? '24px' : '12px');
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('checkbox').nth(0).check();await page.getByRole('checkbox').nth(1).check();
  await page.getByRole('radio', { name: '코드 상세', exact: true }).check();
  holdAnalysis=true;
  await page.getByRole('button',{name:'Story 분석',exact:true}).click();
  await wait(()=>!!releaseAnalysis,'AI request started');
  assert.equal(requests.find(r=>r.path==='/stories/analyze').body.mode, 'code');
  await page.getByRole('link',{name:'타임라인',exact:true}).click();
  await page.waitForURL('**/timeline');
  releaseAnalysis();
  await page.getByText('아직 작성한 Story가 없어요.',{exact:true}).waitFor();
  assert.ok(page.url().endsWith('/timeline'));
  await page.goto('http://127.0.0.1:5187/changes?period=all');
  await page.getByRole('checkbox').nth(0).check();await page.getByRole('checkbox').nth(1).check();
  await page.getByRole('button',{name:'Story 분석',exact:true}).click();
  await page.getByRole('heading',{name:'Story 분석 결과',exact:true}).waitFor();
  assert.match(await page.getByLabel('Before', { exact: true }).inputValue(), /텍스트: 저장/);
  assert.match(await page.getByLabel('Before', { exact: true }).inputValue(), /모서리: 8/);
  assert.match(await page.getByLabel('After', { exact: true }).inputValue(), /텍스트: 저장 완료/);
  assert.match(await page.getByLabel('After', { exact: true }).inputValue(), /모서리: 12/);
  assert.doesNotMatch(await page.getByLabel('변경사항 분석', { exact: true }).inputValue(), /fontName|segments|자체 분석/);
  await page.getByRole('button',{name:'Story 작성 시작',exact:true}).click();
  await page.waitForURL('**/stories/12/edit');console.log('Draft created');
  const why=page.getByLabel('Why',{exact:true});await why.waitFor();
  slow=true;
  await why.fill('저장 중인 첫 문장');
  await wait(()=>!!release,'first autosave started');
  await why.fill('요청 도중 추가로 작성한 최종 문장');
  release();release=null;
  await wait(()=>stories.get(12).why==='요청 도중 추가로 작성한 최종 문장','latest autosave');
  assert.equal(await why.inputValue(),'요청 도중 추가로 작성한 최종 문장');
  await page.getByLabel('배운 점',{exact:true}).fill('배운 내용');
  await page.getByLabel('후속과제',{exact:true}).fill('다음 작업');
  await page.getByLabel('메모',{exact:true}).fill('새로고침 후에도 남는 메모');
  slow=true;
  await wait(()=>!!release,'completion pending autosave');
  await page.getByRole('button',{name:'Story 작성 완료',exact:true}).click();
  release();release=null;
  await page.waitForURL('**/stories/12');
  await page.getByText('새로고침 후에도 남는 메모',{exact:true}).waitFor();
  assert.equal(stories.get(12).story_status,'published');
  console.log('Reloading',page.url());
  await page.reload();
  await page.getByText('새로고침 후에도 남는 메모',{exact:true}).waitFor();
  await page.getByText(stories.get(12).ai_analysis.before, { exact: true }).waitFor();
  await page.getByText(stories.get(12).ai_analysis.after, { exact: true }).waitFor();
  assert.match(stories.get(12).ai_analysis.summary, /모서리: 8 → 12/);
  await page.getByRole('link',{name:'수정',exact:true}).click();
  await why.waitFor();
  fail=true;await why.fill('실패해도 유지되는 입력');
  await page.getByRole('alert').filter({hasText:'테스트 저장 실패'}).waitFor();
  assert.equal(await why.inputValue(),'실패해도 유지되는 입력');
  await page.getByRole('button',{name:'저장 다시 시도',exact:true}).click();
  await wait(()=>stories.get(12).why==='실패해도 유지되는 입력','retry persisted');
  assert.equal(stories.get(12).story_status,'published');
  await page.getByRole('button',{name:'수정 완료',exact:true}).click();await page.waitForURL('**/stories/12');
  await page.goto('http://127.0.0.1:5187/stories/30/edit');
  await page.getByLabel('메모',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('메모',{exact:true}).inputValue(),'보관 메모');
  await page.goto('http://127.0.0.1:5187/stories/12');
  await page.getByRole('button',{name:'삭제',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'삭제',exact:true}).click();
  await page.waitForURL('**/timeline');assert.equal(stories.has(12),false);
  await page.goto('http://127.0.0.1:5187/stories/new');
  await page.getByLabel('Story 제목',{exact:true}).fill('직접 작성한 초안');
  await page.getByRole('button',{name:'초안 만들고 작성하기',exact:true}).click();
  await page.waitForURL('**/stories/13/edit');
  await page.getByLabel('메모',{exact:true}).fill('직접 작성 메모');
  await page.getByRole('button',{name:'초안 저장',exact:true}).click();
  await page.waitForURL('**/stories/13');assert.equal(stories.get(13).story_status,'draft');
  console.log('Reloading',page.url());
  await page.reload();await page.getByText('직접 작성 메모',{exact:true}).waitFor();
  await page.screenshot({path:path.join(outputDir, 'story-detail.png'),fullPage:true});
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('link', { name: '이어서 작성', exact: true }).click();
  await page.getByLabel('메모', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: path.join(outputDir, 'story-editor-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:5187/dashboard');
  await page.getByRole('button', { name: 'Figma 계정 연결', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Figma 연결 주소가 현재 사이트와 맞지 않아요.' }).waitFor();
  assert.equal(new URL(page.url()).origin, 'http://127.0.0.1:5187');
  await page.getByRole('link', { name: '플러그인으로 실시간 연결하기', exact: true }).click();
  const liveDialog = page.getByRole('dialog', { name: 'Figma 실시간 연결', exact: true });
  await liveDialog.waitFor();
  await page.getByRole('button', { name: '연결 코드 만들기', exact: true }).waitFor();
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await liveDialog.evaluate(node => {
      const bounds = node.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= innerWidth && node.scrollWidth <= node.clientWidth;
    }));
    await page.screenshot({ path: path.join(outputDir, 'figma-plugin-' + width + '.png'), fullPage: true });
  }
  await page.keyboard.press('Escape');
  await liveDialog.waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('button', { name: '플러그인으로 실시간 연결', exact: true }).evaluate(node => node === document.activeElement), true);
  await page.getByRole('link', { name: '플러그인으로 실시간 연결하기', exact: true }).click();
  await liveDialog.waitFor();
  await liveDialog.getByRole('button', { name: '실시간 연결 닫기', exact: true }).click();
  await liveDialog.waitFor({ state: 'detached' });
  assert.ok(await page.getByRole('alert').filter({ hasText: 'Figma 연결 주소' }).evaluate(node => node.getBoundingClientRect().width > 200));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(outputDir, 'result.json'),JSON.stringify({passed:true,checks:['AI analysis to persisted draft','typing during autosave','completion waits for autosave','reload restores data','failed save and retry','published edit stays published','cross-project deep link','delete','manual draft creation and reload','mobile editor layout','leaving during AI analysis','date filter labels and mobile spacing','Figma missing comparisons persist without raw font JSON','OAuth mismatch opens plugin connection without cross-origin navigation'],requests:requests.length,pageErrors:errors},null,2));
  console.log('Browser integration checks passed:',requests.length,'mock API requests');
  await browser.close();
  await server.close();
})().catch(async error=>{console.error(error);if(debugPage){console.log('Current URL',debugPage.url());console.log((await debugPage.locator('body').innerText()).slice(0,5000));await debugPage.screenshot({path:path.join(outputDir, 'failure.png'),fullPage:true}).catch(()=>{});}await debugBrowser?.close();await server?.close();process.exit(1)});
