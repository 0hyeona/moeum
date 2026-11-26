import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { Service } from '../data/projects';
import { githubRepository } from '../data/github';
import { useProjects } from '../state/ProjectsContext';
import { PageHeading, ServiceIcon, useDocumentTitle } from '../components/ui';
import ui from '../components/ui.module.css';
import styles from './ProjectCreatePage.module.css';


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
  const [githubUrl, setGithubUrl] = useState('');
  const [githubError, setGithubError] = useState('');
  const [figmaUrl, setFigmaUrl] = useState('');
  const [figmaError, setFigmaError] = useState('');
  const [notionPage, setNotionPage] = useState('');
  const [notionError, setNotionError] = useState('');
  const [verifiedUrls, setVerifiedUrls] = useState<Service[]>([]);
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState('');

  function setUrlVerified(service: Service, on: boolean) {
    setVerifiedUrls((current) => on ? [...current.filter((item) => item !== service), service] : current.filter((item) => item !== service));
  }

  function verifyGithubUrl() {
    const valid = githubRepository(githubUrl) !== null;
    setGithubError(valid ? '' : 'https://github.com/소유자/저장소 형식의 URL을 입력해주세요.');
    setUrlVerified('GitHub', valid);
  }

  function verifyFigmaUrl() {
    const valid = isFigmaFileUrl(figmaUrl);
    setFigmaError(valid ? '' : 'https://www.figma.com/design/… 형식의 파일 URL을 입력해주세요.');
    setUrlVerified('Figma', valid);
  }

  function verifyNotionUrl() {
    let valid = false;
    try { const url = new URL(notionPage.trim()); valid = url.protocol === 'https:' && /(^|\.)(notion\.so|notion\.site|notion\.com)$/.test(url.hostname); } catch { /* Invalid URL. */ }
    setNotionError(valid ? '' : '올바른 Notion 페이지 URL을 입력해주세요.');
    setUrlVerified('Notion', valid);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!name.trim()) {
      setNameError('프로젝트명을 입력해주세요.');
      nameInput.current?.focus();
      return;
    }
    if ((githubUrl.trim() && !verifiedUrls.includes('GitHub')) || (figmaUrl.trim() && !verifiedUrls.includes('Figma')) || (notionPage.trim() && !verifiedUrls.includes('Notion'))) {
      setSubmitError('입력한 URL의 ‘형식 확인’ 버튼을 눌러주세요.');
      return;
    }
    setPending(true);
    setSubmitError('');
    try {
      await createProject({ name: name.trim(), description: description.trim(), urls: { GitHub: githubUrl.trim(), Figma: figmaUrl.trim(), Notion: notionPage.trim() } });
      navigate('/dashboard');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '프로젝트를 생성하지 못했습니다.');
    } finally { setPending(false); }
  }

  return (
    <div className={styles.page}>
      <PageHeading title="프로젝트 생성" />
      <form className={styles.form} onSubmit={submit} noValidate>
        <fieldset className={styles.panel} disabled={pending} aria-labelledby="create-info-heading">
          <header className={styles.sectionHeader}>
            <h2 id="create-info-heading">프로젝트 정보</h2>
            <p>프로젝트 이름과 설명을 입력해주세요.</p>
          </header>
          <div className={styles.fields}>
          <div className={styles.field}>
            <label htmlFor="project-name">프로젝트명 <span className={styles.required}>필수</span></label>
            <input ref={nameInput} id="project-name" className={styles.input} placeholder="flowlog" maxLength={50} autoComplete="off" value={name} onChange={(event) => { setName(event.target.value); setNameError(''); }} aria-invalid={!!nameError} aria-describedby={nameError ? 'project-name-error' : undefined} required />
            {nameError && <p className={styles.error} id="project-name-error" role="alert">{nameError}</p>}
          </div>
          <div className={styles.field}>
            <label htmlFor="project-description">프로젝트 설명 <span className={styles.optional}>선택</span></label>
            <input id="project-description" className={styles.input} placeholder="AI Project Journal" maxLength={120} autoComplete="off" value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          </div>
        </fieldset>
        <fieldset className={styles.panel} disabled={pending} aria-labelledby="create-tools-heading">
          <header className={styles.sectionHeader}>
            <h2 id="create-tools-heading">연동 서비스 <span className={styles.optional}>선택</span></h2>
            <p>사용할 도구의 URL을 등록하세요. 나중에 설정에서 추가할 수 있어요.</p>
          </header>
          <div className={styles.connections}>
            <p className={styles.connectionHint}>지금은 URL 형식만 확인해요. 계정 승인과 Figma 플러그인 연결은 프로젝트 생성 후 진행해주세요.</p>
            <UrlVerification service="GitHub" controlId="github-url" verified={verifiedUrls.includes('GitHub')} error={githubError} onVerify={verifyGithubUrl}>
              <input id="github-url" className={styles.input} type="url" inputMode="url" placeholder="https://github.com/owner/repository" autoComplete="off" spellCheck={false} value={githubUrl} onChange={(event) => { setGithubUrl(event.target.value); setGithubError(''); setUrlVerified('GitHub', false); }} aria-invalid={!!githubError} aria-describedby={githubError ? 'github-url-error' : undefined} />
            </UrlVerification>
            <UrlVerification service="Figma" controlId="figma-url" verified={verifiedUrls.includes('Figma')} error={figmaError} onVerify={verifyFigmaUrl}>
              <input id="figma-url" className={styles.input} type="url" inputMode="url" placeholder="URL 입력" autoComplete="off" spellCheck={false} value={figmaUrl} onChange={(event) => { setFigmaUrl(event.target.value); setFigmaError(''); setUrlVerified('Figma', false); }} aria-invalid={!!figmaError} aria-describedby={figmaError ? 'figma-url-error' : undefined} />
            </UrlVerification>
            <UrlVerification service="Notion" controlId="notion-page" verified={verifiedUrls.includes('Notion')} error={notionError} onVerify={verifyNotionUrl}>
              <input id="notion-page" className={styles.input} type="url" inputMode="url" placeholder="Notion 페이지 URL 입력" autoComplete="off" value={notionPage} onChange={(event) => { setNotionPage(event.target.value); setNotionError(''); setUrlVerified('Notion', false); }} aria-invalid={!!notionError} aria-describedby={notionError ? 'notion-page-error' : undefined} />
            </UrlVerification>
          </div>
        </fieldset>
        {submitError && <p className={styles.error} role="alert">{submitError}</p>}
        <button type="submit" className={ui.primaryButton} disabled={pending}>{pending ? '생성 중…' : '프로젝트 생성'}</button>
      </form>
    </div>
  );
}

type UrlVerificationProps = { service: Service; controlId: string; verified: boolean; error: string; onVerify: () => void; children: ReactNode };

function UrlVerification({ service, controlId, verified, error, onVerify, children }: UrlVerificationProps) {
  return (
    <div className={styles.connection}>
      <label htmlFor={controlId} className={styles.connectionTitle}>
        <ServiceIcon service={service} />
        {service}
      </label>
      {children}
      <button type="button" className={`${styles.connectButton} ${verified ? styles.connected : ''}`} onClick={onVerify} aria-label={`${service} URL ${verified ? '형식 확인됨' : '형식 확인'}`} aria-describedby={`${controlId}-status`}>
        {verified ? '형식 확인됨' : '형식 확인'}
      </button>
      {error && <p className={styles.error} id={`${controlId}-error`} role="alert">{error}</p>}
      <span className={ui.visuallyHidden} id={`${controlId}-status`} role="status">{verified ? `${service} URL 형식을 확인했어요. 접근 권한과 계정 연결은 설정에서 확인해주세요.` : ''}</span>
    </div>
  );
}
