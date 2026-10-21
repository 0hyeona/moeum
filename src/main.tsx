import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppLayout } from './components/AppLayout';
import { AuthBoundary } from './components/AuthBoundary';
import { ChangesPage } from './pages/ChangesPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { AccountPage } from './pages/AccountPage';
import { GithubCallbackPage } from './pages/GithubCallbackPage';
import { ProjectCreatePage } from './pages/ProjectCreatePage';
import { ProjectListPage } from './pages/ProjectListPage';
import { SettingsPage } from './pages/SettingsPage';
import { StoryAnalysisPage } from './pages/StoryAnalysisPage';
import { StoryDetailPage } from './pages/StoryDetailPage';
import { StoryWritePage } from './pages/StoryWritePage';
import { TimelinePage } from './pages/TimelinePage';
import { ProjectsProvider } from './state/ProjectsContext';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ProjectsProvider>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<AccountPage key="signup" mode="signup" />} />
          <Route path="/auth/github/callback" element={<GithubCallbackPage />} />
          <Route path="/password-reset" element={<AccountPage key="password" mode="password" />} />
          <Route element={<AuthBoundary><AppLayout header="centered" /></AuthBoundary>}>
            <Route path="/projects" element={<ProjectListPage />} />
            <Route path="/projects/new" element={<ProjectCreatePage />} />
          </Route>
          <Route element={<AuthBoundary><AppLayout header="project" /></AuthBoundary>}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/changes" element={<ChangesPage />} />
            <Route path="/stories/analysis" element={<StoryAnalysisPage />} />
            <Route path="/stories/new" element={<StoryWritePage />} />
            <Route path="/stories/:storyId/edit" element={<StoryWritePage />} />
            <Route path="/stories/:storyId" element={<StoryDetailPage />} />
            <Route path="/timeline" element={<TimelinePage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ProjectsProvider>
    </BrowserRouter>
  </StrictMode>,
);
