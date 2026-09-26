import { useRef, useState, type KeyboardEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import errorIcon from '../../assets/icons/error.svg';
import type { Project, Service, ServiceState } from '../data/projects';
import { useProjects } from '../state/ProjectsContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PageHeading, ServiceIcon, useDocumentTitle } from '../components/ui';
import form from '../components/form.module.css';
import ui from '../components/ui.module.css';
import styles from './SettingsPage.module.css';

// 디자인의 연동 서비스 순서입니다.
const settingServices: readonly Service[] = ['GitHub', 'Notion', 'Figma'];

export function SettingsPage() {
  useDocumentTitle('프로젝트 설정');
  const { activeProject: project, deleteProject } = useProjects();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  if (!project) return <Navigate to="/projects" replace />;

  function confirmDelete() {
    deleteProject();
    navigate('/projects', { replace: true });
  }

  return (
    <div className={styles.page}>
      <PageHeading title="프로젝트 설정" description="프로젝트의 기본 정보와 연동된 도구, AI 설정을 관리할 수 있습니다." />
      <div className={styles.sections}>
        {/* 헤더에서 프로젝트를 바꾸면 입력 중이던 값을 새 프로젝트 값으로 다시 채웁니다. */}
        <ProjectInfo key={project.id} project={project} />
        <Connections project={project} />

        <section className={styles.panel} aria-labelledby="danger-heading">
          <SectionHeader id="danger-heading" title="위험 영역" description="이 작업은 되돌릴 수 없습니다. 신중하게 진행해주세요." />
          <div className={styles.danger}>
            <div className={styles.alert}>
              <p className={styles.alertTitle}>
                <img src={errorIcon} alt="" width={24} height={24} />
                프로젝트 삭제
              </p>
              <p className={styles.alertText}>이 프로젝트의 모든 데이터가 영구적으로 삭제 됩니다.</p>
            </div>
            <button type="button" className={`${ui.dangerButton} ${styles.deleteButton}`} onClick={() => setConfirming(true)}>프로젝트 삭제</button>
          </div>
        </section>
      </div>

      {confirming && (
        <ConfirmDialog
          title="프로젝트를 삭제할까요?"
          description={`‘${project.name}’ 프로젝트와 모든 Story가 삭제되고 되돌릴 수 없어요.`}
          confirmLabel="삭제"
          onConfirm={confirmDelete}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

type Announcement = { id: number; text: string };

function useAnnouncement() {
  const [message, setMessage] = useState<Announcement | null>(null);
  const announce = (text: string) => setMessage((current) => ({ id: (current?.id ?? 0) + 1, text }));
  return [message, announce, () => setMessage(null)] as const;
}

// 같은 문구가 다시 나와도 읽히도록, 라이브 영역은 그대로 두고 안쪽 텍스트 노드만 새로 그립니다.
function StatusText({ message }: { message: Announcement | null }) {
  return (
    <span className={styles.status} role="status">
      {message && <span key={message.id}>{message.text}</span>}
    </span>
  );
}

function SectionHeader({ id, title, description }: { id: string; title: string; description: string }) {
  return (
    <div className={styles.sectionHeader}>
      <h2 id={id}>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

type InfoField = 'name' | 'description';

function ProjectInfo({ project }: { project: Project }) {
  const { updateProject } = useProjects();
  const [draft, setDraft] = useState({ name: project.name, description: project.description });
  const [nameError, setNameError] = useState('');
  const [savedField, setSavedField] = useState<InfoField | null>(null);
  const [saved, announceSaved, clearSaved] = useAnnouncement();

  function change(field: InfoField, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    clearSaved();
    if (field === 'name') setNameError('');
  }

  // blur나 Enter에서 바뀐 값만 저장합니다. 프로젝트명이 비어 있으면 저장하지 않고 오류를 보여줍니다.
  function commit(field: InfoField) {
    const value = draft[field].trim();
    if (field === 'name' && !value) {
      setNameError('프로젝트명을 입력해주세요.');
      return;
    }
    setDraft((current) => ({ ...current, [field]: value }));
    if (value === project[field]) return;
    updateProject({ name: project.name, description: project.description, [field]: value });
    setSavedField(field);
    announceSaved('저장했어요.');
  }

  function commitOnEnter(event: KeyboardEvent<HTMLInputElement>, field: InfoField) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    commit(field);
  }

  return (
    <section className={styles.panel} aria-labelledby="info-heading">
      <SectionHeader id="info-heading" title="프로젝트 정보" description="프로젝트의 기본 정보를 수정할 수 있습니다." />
      <div className={styles.fields}>
        <div className={form.field}>
          <div className={form.labelRow}>
            <label htmlFor="settings-name" className={form.label}>프로젝트명 (필수)</label>
            <StatusText message={savedField === 'name' ? saved : null} />
          </div>
          <input
            id="settings-name"
            className={`${form.input} ${styles.input}`}
            placeholder="flowlog"
            maxLength={50}
            autoComplete="off"
            value={draft.name}
            onChange={(event) => change('name', event.target.value)}
            onBlur={() => commit('name')}
            onKeyDown={(event) => commitOnEnter(event, 'name')}
            aria-invalid={!!nameError}
            aria-describedby={nameError ? 'settings-name-error' : undefined}
            required
          />
          {nameError && <p className={form.error} id="settings-name-error" role="alert">{nameError}</p>}
        </div>
        <div className={form.field}>
          <div className={form.labelRow}>
            <label htmlFor="settings-description" className={form.label}>프로젝트 설명</label>
            <StatusText message={savedField === 'description' ? saved : null} />
          </div>
          <input
            id="settings-description"
            className={`${form.input} ${styles.input}`}
            placeholder="AI Project Journal"
            maxLength={120}
            autoComplete="off"
            value={draft.description}
            onChange={(event) => change('description', event.target.value)}
            onBlur={() => commit('description')}
            onKeyDown={(event) => commitOnEnter(event, 'description')}
          />
        </div>
      </div>
    </section>
  );
}

function Connections({ project }: { project: Project }) {
  const { setServiceConnection } = useProjects();
  const [message, announce] = useAnnouncement();

  function connect(service: Service, connected: boolean) {
    const previous = project.services[service].status;
    setServiceConnection(service, connected);
    if (!connected) announce(`${service} 연결을 해제했어요.`);
    else announce(previous === 'disconnected' ? `${service} 계정을 연결했어요.` : `${service} 계정을 다시 연결했어요.`);
  }

  return (
    <section className={styles.panel} aria-labelledby="tools-heading">
      <SectionHeader id="tools-heading" title="연결된 도구" description="프로젝트와 연결된 외부 도구를 관리할 수 있습니다." />
      <div className={`${form.labelRow} ${styles.servicesLabel}`}>
        <h3 id="services-heading" className={form.label}>연동된 서비스</h3>
        <StatusText message={message} />
      </div>
      <ul className={styles.services} aria-labelledby="services-heading">
        {settingServices.map((service) => (
          <ServiceRow key={service} service={service} state={project.services[service]} onConnect={(connected) => connect(service, connected)} />
        ))}
      </ul>
    </section>
  );
}

const statusTexts: Record<ServiceState['status'], (service: Service) => string> = {
  connected: (service) => `${service} 계정이 연결되어 있습니다.`,
  reconnect: () => '다시 연결이 필요합니다.',
  disconnected: () => '연결되어 있지 않습니다.',
};

function ServiceRow({ service, state, onConnect }: { service: Service; state: ServiceState; onConnect: (connected: boolean) => void }) {
  const connectButton = useRef<HTMLButtonElement>(null);
  const { status } = state;

  // 연결 해제 버튼이 사라지므로 같은 줄의 연결 버튼으로 포커스를 옮깁니다.
  function disconnect() {
    onConnect(false);
    connectButton.current?.focus();
  }

  return (
    <li className={styles.service}>
      <div className={styles.serviceInfo}>
        <p className={styles.serviceName}>
          <ServiceIcon service={service} />
          {service}
        </p>
        <p className={`${styles.serviceStatus} ${status === 'connected' ? '' : styles[status]}`}>{statusTexts[status](service)}</p>
      </div>
      <div className={styles.serviceActions}>
        <button
          ref={connectButton}
          type="button"
          className={`${styles.smallButton} ${status === 'connected' ? '' : styles.emphasis}`}
          aria-label={`${service} ${status === 'disconnected' ? '연결' : '재연결'}`}
          onClick={() => onConnect(true)}
        >
          {status === 'disconnected' ? '연결' : '재연결'}
        </button>
        {status !== 'disconnected' && (
          <button type="button" className={`${styles.smallButton} ${styles.disconnect}`} aria-label={`${service} 연결 해제`} onClick={disconnect}>연결 해제</button>
        )}
      </div>
    </li>
  );
}
