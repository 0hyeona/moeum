import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import logo from '../../assets/moeum-logo-header.svg';
import chevronDown from '../../assets/icons/chevron-down.svg';
import { useProjects } from '../state/ProjectsContext';
import styles from './AppLayout.module.css';

const navigation = [
  { to: '/dashboard', label: '대시보드' },
  { to: '/timeline', label: '타임라인' },
  { to: '/settings', label: '설정' },
];

// header="centered": 프로젝트를 고르기 전 화면(s2, s3). header="project": 프로젝트 안의 화면(s4~).
export function AppLayout({ header }: { header: 'centered' | 'project' }) {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className={styles.app}>
      <header className={styles.headerBar}>
        {header === 'centered' ? (
          <div className={`${styles.header} ${styles.centered}`}>
            <HomeLink />
          </div>
        ) : (
          <div className={styles.header}>
            <HomeLink />
            <ProjectMenu />
            <nav className={styles.navigation} aria-label="주 메뉴">
              {navigation.map((item) => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? styles.active : undefined}>{item.label}</NavLink>
              ))}
            </nav>
          </div>
        )}
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

function HomeLink() {
  return (
    <Link to="/projects" className={styles.logo} aria-label="모음 프로젝트 목록">
      <img src={logo} alt="" width="96" height="32" />
    </Link>
  );
}

function ProjectMenu() {
  const { projects, activeProject, selectProject } = useProjects();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    }
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  function choose(id: string) {
    selectProject(id);
    setOpen(false);
    navigate('/dashboard');
  }

  return (
    <div className={styles.projectMenu} ref={container}>
      <button ref={button} type="button" className={styles.projectButton} aria-expanded={open} aria-controls="project-menu" onClick={() => setOpen((current) => !current)}>
        <span className={styles.projectName}>{activeProject?.name ?? '프로젝트 선택'}</span>
        <img src={chevronDown} alt="" width="24" height="24" className={open ? styles.chevronOpen : undefined} />
      </button>
      {open && (
        <div id="project-menu" className={styles.menu}>
          <ul>
            {projects.map((project) => (
              <li key={project.id}>
                <button type="button" aria-current={project.id === activeProject?.id ? 'true' : undefined} onClick={() => choose(project.id)}>{project.name}</button>
              </li>
            ))}
          </ul>
          <Link to="/projects" className={styles.menuLink} onClick={() => setOpen(false)}>전체 프로젝트 보기</Link>
        </div>
      )}
    </div>
  );
}
