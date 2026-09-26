import { useState } from 'react';
import { Link } from 'react-router';
import { services, type Project } from '../data/projects';
import { useProjects } from '../state/ProjectsContext';
import { SearchField } from '../components/SearchField';
import { PageHeading, ServiceIcon, StatusBadge, useDocumentTitle } from '../components/ui';
import ui from '../components/ui.module.css';
import styles from './ProjectListPage.module.css';

export function ProjectListPage() {
  useDocumentTitle('프로젝트');
  const { projects } = useProjects();
  const [query, setQuery] = useState('');
  const keyword = query.trim().toLowerCase();
  const visible = projects.filter((project) => project.name.toLowerCase().includes(keyword));

  return (
    <div className={styles.page}>
      <PageHeading title="프로젝트" description="프로젝트를 선택하거나 새로운 프로젝트를 만들어보세요." />
      <div className={styles.toolbar}>
        <SearchField className={styles.search} label="프로젝트 검색" placeholder="프로젝트명을 입력해주세요." value={query} onChange={setQuery} />
        <Link to="/projects/new" className={ui.primaryButton}>프로젝트 생성</Link>
      </div>
      {visible.length > 0 ? (
        <ul className={styles.grid}>
          {visible.map((project) => <li key={project.id}><ProjectCard project={project} /></li>)}
        </ul>
      ) : (
        <p className={styles.empty} role="status">
          {projects.length === 0 ? '아직 프로젝트가 없어요. 새 프로젝트를 만들어보세요.' : `‘${query.trim()}’에 해당하는 프로젝트가 없어요.`}
        </p>
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const { selectProject } = useProjects();
  const connected = services.filter((service) => project.services[service].status !== 'disconnected');

  return (
    <Link to="/dashboard" className={styles.card} onClick={() => selectProject(project.id)}>
      <div className={styles.cardHeader}>
        <h2>{project.name}</h2>
        <StatusBadge status={project.status} />
      </div>
      {project.description && <p className={styles.description}>{project.description}</p>}
      <div className={styles.cardFooter}>
        <span className={styles.updated}>{project.updatedAt}</span>
        {connected.length > 0 && (
          <span className={styles.services} role="img" aria-label={`연결된 도구: ${connected.join(', ')}`}>
            {connected.map((service) => <ServiceIcon key={service} service={service} size={18} />)}
          </span>
        )}
      </div>
    </Link>
  );
}
