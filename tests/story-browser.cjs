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
  const activities = [101, 102].map(activity_id => ({ activity_id, project_id: 7, story_id: null, external_id: String(activity_id), branch_name: null,
    source: 'figma', activity_type: 'version', title: `디자인 변경 ${activity_id}`, description: '화면을 개선했어요.', source_url: null, occurred_at: now, created_at: now }));
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
    if (path === '/project_activities' || /\/activities$/.test(path)) {
      const projectId = Number(url.searchParams.get('project_id') || path.split('/')[3]);
      const unorganized = url.searchParams.get('unorganized'), storyId = url.searchParams.get('story_id');
      return respond(activities.filter(a=>a.project_id===projectId && (unorganized==='true'?a.story_id===null:unorganized==='false'?a.story_id!==null:true) && (!storyId||a.story_id===Number(storyId))));
    }
    if (path === '/stories/analyze') {
      if (holdAnalysis) { holdAnalysis=false; await new Promise(resolve => releaseAnalysis=resolve); }
      return respond({title:'로그인 디자인 개선',summary:'개선 요약',before:'변경 전',after:'변경 후',tags:['UI','로그인']});
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
  await page.getByRole('checkbox').nth(0).check();await page.getByRole('checkbox').nth(1).check();
  holdAnalysis=true;
  await page.getByRole('button',{name:'AI Story 분석',exact:true}).click();
  await wait(()=>!!releaseAnalysis,'AI request started');
  await page.getByRole('link',{name:'타임라인',exact:true}).click();
  await page.waitForURL('**/timeline');
  releaseAnalysis();
  await page.getByText('아직 작성한 Story가 없어요.',{exact:true}).waitFor();
  assert.ok(page.url().endsWith('/timeline'));
  await page.goto('http://127.0.0.1:5187/changes?period=all');
  await page.getByRole('checkbox').nth(0).check();await page.getByRole('checkbox').nth(1).check();
  await page.getByRole('button',{name:'AI Story 분석',exact:true}).click();
  await page.getByRole('heading',{name:'AI Story 분석 결과',exact:true}).waitFor();
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
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(outputDir, 'result.json'),JSON.stringify({passed:true,checks:['AI analysis to persisted draft','typing during autosave','completion waits for autosave','reload restores data','failed save and retry','published edit stays published','cross-project deep link','delete','manual draft creation and reload','mobile editor layout','leaving during AI analysis'],requests:requests.length,pageErrors:errors},null,2));
  console.log('Browser integration checks passed:',requests.length,'mock API requests');
  await browser.close();
  await server.close();
})().catch(async error=>{console.error(error);if(debugPage){console.log('Current URL',debugPage.url());console.log((await debugPage.locator('body').innerText()).slice(0,5000));await debugPage.screenshot({path:path.join(outputDir, 'failure.png'),fullPage:true}).catch(()=>{});}await debugBrowser?.close();await server?.close();process.exit(1)});
