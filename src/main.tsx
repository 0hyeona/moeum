import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppLayout } from './components/AppLayout';
import { ChangesPage } from './pages/ChangesPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
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
          <Route element={<AppLayout header="centered" />}>
            <Route path="/projects" element={<ProjectListPage />} />
            <Route path="/projects/new" element={<ProjectCreatePage />} />
          </Route>
          <Route element={<AppLayout header="project" />}>
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
