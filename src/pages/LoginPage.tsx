import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import logo from '../../assets/moeum-logo.svg';
import github from '../../assets/github-white.svg';
import { useDocumentTitle } from '../components/ui';
import styles from './LoginPage.module.css';

type Field = 'username' | 'password';
type Notice = { title: string; description: string };

const notices = {
  github: { title: 'GitHub 로그인을 준비하고 있어요', description: 'GitHub 계정 연결은 추후 제공될 예정이에요.' },
  username: { title: '아이디 찾기를 준비하고 있어요', description: '계정 찾기 기능은 추후 제공될 예정이에요.' },
  password: { title: '비밀번호 찾기를 준비하고 있어요', description: '비밀번호 재설정 기능은 추후 제공될 예정이에요.' },
  signup: { title: '회원가입을 준비하고 있어요', description: '가입 기능이 준비되면 모음에서 프로젝트의 기록을 시작할 수 있어요.' },
} satisfies Record<string, Notice>;

export function LoginPage() {
  useDocumentTitle('로그인');
  const navigate = useNavigate();
  const [values, setValues] = useState({ username: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [notice, setNotice] = useState<Notice>(notices.github);
  const dialog = useRef<HTMLDialogElement>(null);
  const usernameInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);

  function openNotice(next: Notice) {
    setNotice(next);
    dialog.current?.showModal();
  }

  function update(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Partial<Record<Field, string>> = {};
    if (!values.username.trim()) next.username = '아이디를 입력해주세요.';
    if (!values.password) next.password = '비밀번호를 입력해주세요.';
    setErrors(next);
    if (next.username) usernameInput.current?.focus();
    else if (next.password) passwordInput.current?.focus();
    else {
      // 인증 서버 연결 전이라 입력값은 어디에도 보내지 않고 대시보드로 이동합니다.
      setValues((current) => ({ ...current, password: '' }));
      navigate('/dashboard');
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <div className={styles.brand}>
          <img src={logo} alt="모음" width="162.91" height="82" />
        </div>
        <div className={styles.loginArea}>
          <section className={styles.card} aria-labelledby="login-heading">
            <header className={styles.intro}>
              <h1 id="login-heading">프로젝트의 변화가, 하나의 기록이 되도록</h1>
              <p>GitHub, Figma, Notion에 흩어진 프로젝트 변경사항을 모아 AI와 함께 하나의 Story로 정리해보세요.</p>
            </header>
            <div className={styles.actions}>
              <div className={styles.localLogin}>
                <form onSubmit={submit} noValidate className={styles.form}>
                  <div className={styles.field}>
                    <label htmlFor="username">아이디</label>
                    <input ref={usernameInput} id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="아이디를 입력해주세요." value={values.username} onChange={(event) => update('username', event.target.value)} aria-invalid={!!errors.username} aria-describedby={errors.username ? 'username-error' : undefined} required />
                    {errors.username && <p className={styles.error} id="username-error" role="alert">{errors.username}</p>}
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="password">비밀번호</label>
                    <input ref={passwordInput} id="password" name="password" type="password" autoComplete="current-password" placeholder="비밀번호를 입력해주세요." value={values.password} onChange={(event) => update('password', event.target.value)} aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined} required />
                    {errors.password && <p className={styles.error} id="password-error" role="alert">{errors.password}</p>}
                  </div>
                  <button className={styles.primaryButton} type="submit">로그인</button>
                </form>
                <nav className={styles.accountLinks} aria-label="계정 도움말">
                  <button type="button" onClick={() => openNotice(notices.username)}>아이디 찾기</button>
                  <button type="button" onClick={() => openNotice(notices.password)}>비밀번호 찾기</button>
                  <button type="button" className={styles.signup} onClick={() => openNotice(notices.signup)}>회원가입</button>
                </nav>
              </div>
              <button className={styles.githubButton} type="button" onClick={() => openNotice(notices.github)}>
                <span className={styles.githubIcon}><img src={github} alt="" width="24" height="23.4079" /></span>
                Github로 로그인
              </button>
            </div>
          </section>
          <p className={styles.terms}>로그인 시 서비스 이용약관 및 개인정보 처리방침에 동의합니다.</p>
        </div>
      </div>
      <dialog ref={dialog} className={styles.dialog} aria-labelledby="notice-title" aria-describedby="notice-description" onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
        <h2 id="notice-title">{notice.title}</h2>
        <p id="notice-description">{notice.description}</p>
        <form method="dialog"><button className={styles.primaryButton} autoFocus>확인</button></form>
      </dialog>
    </main>
  );
}
