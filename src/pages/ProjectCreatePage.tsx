import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { Service } from '../data/projects';
import { useProjects } from '../state/ProjectsContext';
import { PageHeading, ServiceIcon, useDocumentTitle } from '../components/ui';
import ui from '../components/ui.module.css';
import styles from './ProjectCreatePage.module.css';

// 실제 Notion 연동 전까지 선택지로 보여주는 예시 페이지입니다.
const notionPages = ['모음 기획 문서', '주간 회의록', '디자인 시스템 가이드'];

function isFigmaFileUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && ['figma.com', 'www.figma.com'].includes(url.hostname) && /^\/(design|file|proto|board)\/[^/]+/.test(url.pathname);
  } catch {
    return false;
  }
}

export function ProjectCreatePage() {
  useDocumentTitle('프로젝트 생성');
  const { createProject } = useProjects();
  const navigate = useNavigate();
  const nameInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState('');
  const [figmaUrl, setFigmaUrl] = useState('');
  const [figmaError, setFigmaError] = useState('');
  const [notionPage, setNotionPage] = useState('');
  const [notionError, setNotionError] = useState('');
  const [connected, setConnected] = useState<Service[]>([]);

  function setConnection(service: Service, on: boolean) {
    setConnected((current) => on ? [...current.filter((item) => item !== service), service] : current.filter((item) => item !== service));
  }

  function connectFigma() {
    const valid = isFigmaFileUrl(figmaUrl);
    setFigmaError(valid ? '' : 'https://www.figma.com/design/… 형식의 파일 URL을 입력해주세요.');
    setConnection('Figma', valid);
  }

  function connectNotion() {
    setNotionError(notionPage ? '' : '연결할 페이지를 선택해주세요.');
    setConnection('Notion', !!notionPage);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setNameError('프로젝트명을 입력해주세요.');
      nameInput.current?.focus();
      return;
    }
    createProject({ name: name.trim(), description: description.trim(), connected });
    navigate('/dashboard');
  }

  return (
    <div className={styles.page}>
      <PageHeading title="프로젝트 생성" description="새로운 프로젝트와 작업 도구를 연결해주세요." />
      <form className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.panel}>
          <div className={styles.field}>
            <label htmlFor="project-name">프로젝트명 (필수)</label>
            <input ref={nameInput} id="project-name" className={styles.input} placeholder="flowlog" maxLength={50} autoComplete="off" value={name} onChange={(event) => { setName(event.target.value); setNameError(''); }} aria-invalid={!!nameError} aria-describedby={nameError ? 'project-name-error' : undefined} required />
            {nameError && <p className={styles.error} id="project-name-error" role="alert">{nameError}</p>}
          </div>
          <div className={styles.field}>
            <label htmlFor="project-description">프로젝트 설명</label>
            <input id="project-description" className={styles.input} placeholder="AI Project Journal" maxLength={120} autoComplete="off" value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <div className={styles.connections}>
            <Connection service="Figma" controlId="figma-url" connected={connected.includes('Figma')} error={figmaError} onConnect={connectFigma}>
              <input id="figma-url" className={styles.input} type="url" inputMode="url" placeholder="URL 입력" autoComplete="off" spellCheck={false} value={figmaUrl} onChange={(event) => { setFigmaUrl(event.target.value); setFigmaError(''); setConnection('Figma', false); }} aria-invalid={!!figmaError} aria-describedby={figmaError ? 'figma-url-error' : undefined} />
            </Connection>
            <Connection service="Notion" controlId="notion-page" connected={connected.includes('Notion')} error={notionError} onConnect={connectNotion}>
              <select id="notion-page" className={`${styles.input} ${styles.select} ${notionPage ? '' : styles.placeholder}`} value={notionPage} onChange={(event) => { setNotionPage(event.target.value); setNotionError(''); setConnection('Notion', false); }} aria-invalid={!!notionError} aria-describedby={notionError ? 'notion-page-error' : undefined}>
                <option value="" disabled>페이지 선택</option>
                {notionPages.map((page) => <option key={page} value={page}>{page}</option>)}
              </select>
            </Connection>
          </div>
        </div>
        <button type="submit" className={ui.primaryButton}>프로젝트 생성</button>
      </form>
    </div>
  );
}

type ConnectionProps = { service: Service; controlId: string; connected: boolean; error: string; onConnect: () => void; children: ReactNode };

function Connection({ service, controlId, connected, error, onConnect, children }: ConnectionProps) {
  return (
    <div className={styles.connection}>
      <label htmlFor={controlId} className={styles.connectionTitle}>
        <ServiceIcon service={service} />
        {service}
      </label>
      {children}
      <button type="button" className={`${styles.connectButton} ${connected ? styles.connected : ''}`} onClick={onConnect} aria-describedby={`${controlId}-status`}>
        {connected ? '연결됨' : '연결'}
      </button>
      {error && <p className={styles.error} id={`${controlId}-error`} role="alert">{error}</p>}
      <span className={ui.visuallyHidden} id={`${controlId}-status`} role="status">{connected ? `${service} 연결됨` : ''}</span>
    </div>
  );
}
