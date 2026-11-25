from pathlib import Path
import re

root = Path('.backend-analysis-work')
p = root / 'tests/test_project_content.py'
s = p.read_text(encoding='utf-8')
s = s.replace('patch("app.services.story_analysis.httpx.post")', 'patch("httpx.post")')
start = s.index('    def test_story_analysis_save_and_export(self):')
end = s.index('    def test_story_bulk_link_rejects_invalid_selection_without_saving(self):', start)
s = s[:start] + '''    def test_story_analysis_save_and_export(self):
        ids = []
        for source in ('github', 'figma', 'notion'):
            row = self.client.post('/project_activities', headers=self.headers,
                                   json={**self.activity, 'source': source, 'description': source + ' evidence'}).json()
            ids.append(row['activity_id'])
        with patch.dict('os.environ', {'OPENAI_API_KEY': ''}), patch('httpx.post') as provider:
            response = self.client.post('/stories/analyze', headers=self.headers,
                                        json={'project_id': self.project_id, 'activity_ids': ids, 'mode': 'code'})
            self.assertEqual(response.status_code, 200, response.text)
            analysis = response.json()
            self.assertEqual(analysis['tags'], ['github', 'figma', 'notion'])
            self.assertIn('notion evidence', analysis['summary'])
            self.assertIsNone(analysis['before'])
            provider.assert_not_called()
        created = self.client.post('/stories', headers=self.headers, json={
            **self.story, 'title': analysis['title'], 'ai_analysis': analysis, 'activity_ids': ids})
        self.assertEqual(created.status_code, 201, created.text)
        story_id = created.json()['id']
        detail = self.client.get(f'/stories/{story_id}', headers=self.headers).json()
        self.assertEqual(detail['ai_analysis'], analysis)
        published = self.client.patch(f'/stories/{story_id}', headers=self.headers, json={'story_status': 'published'})
        self.assertEqual(published.json()['story_status'], 'published')
        linked = self.client.get(f'/api/projects/{self.project_id}/activities?story_id={story_id}', headers=self.headers)
        self.assertCountEqual([row['activity_id'] for row in linked.json()], ids)
        exported = self.client.get(f'/stories/{story_id}/export', headers=self.headers)
        self.assertEqual(exported.status_code, 200)
        self.assertIn('notion evidence', exported.text)
        self.assertEqual(self.client.get(f'/stories/{story_id}/export').status_code, 401)

''' + s[end:]
start = s.index('    def test_story_analysis_access_and_provider_errors(self):')
end = s.index('    def test_validation_and_partial_update(self):', start)
s = s[:start] + '''    def test_story_analysis_access_and_selection_validation(self):
        activity = self.client.post('/project_activities', json=self.activity, headers=self.headers).json()
        request = {'project_id': self.project_id, 'activity_ids': [activity['activity_id']]}
        path = '/stories/analyze'
        self.assertEqual(self.client.post(path, json=request).status_code, 401)
        with patch.dict('os.environ', {'OPENAI_API_KEY': ''}), patch('httpx.post') as provider:
            for changes, status in (({'activity_ids': []}, 422), ({'activity_ids': [9999]}, 404),
                                    ({'activity_ids': [activity['activity_id']] * 21}, 422), ({'mode': 'invalid'}, 422)):
                self.assertEqual(self.client.post(path, headers=self.headers, json={**request, **changes}).status_code, status)
            self.assertEqual(self.client.post(path, headers=self.headers, json=request).status_code, 200)
            section = self.client.post(path, headers=self.headers, json={**request, 'section': 'before'})
            self.assertEqual(section.json(), {'before': None})
            provider.assert_not_called()

''' + s[end:]
p.write_text(s, encoding='utf-8')
p = root / 'app/routers/stories.py'
s = p.read_text(encoding='utf-8').replace('summary="선택한 변경사항 AI 분석"', 'summary="선택한 변경사항 자체 분석"')
s = re.sub(r'description="선택한 변경사항의 제목과 설명을 OpenAI로 보내 Story 초안을 생성합니다\."',
           'description="저장된 작업 기록과 GitHub 변경 파일·diff를 바탕으로 Story 초안을 생성합니다. 외부 AI 키는 필요하지 않습니다."', s)
p.write_text(s, encoding='utf-8')
p = Path('tests/story-browser.cjs')
s = p.read_text(encoding='utf-8').replace("name:'AI Story 분석'", "name:'Story 분석'").replace("name:'AI Story 분석 결과'", "name:'Story 분석 결과'")
s = s.replace("holdAnalysis=true;", "await page.getByRole('radio', { name: '코드 상세', exact: true }).check();\n  holdAnalysis=true;", 1)
s = s.replace("await wait(()=>!!releaseAnalysis,'AI request started');", "await wait(()=>!!releaseAnalysis,'AI request started');\n  assert.equal(requests.find(r=>r.path==='/stories/analyze').body.mode, 'code');")
p.write_text(s, encoding='utf-8')
