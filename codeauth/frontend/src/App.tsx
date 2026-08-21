import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './hooks/useTheme';
import AppLayout from './layouts/AppLayout';

import Dashboard from './pages/Dashboard';
import AnalysisPage from './pages/AnalysisPage';
import HistoryPage from './pages/HistoryPage';
import RepositoryPage from './pages/RepositoryPage';
import EvolutionPage from './pages/EvolutionPage';
import EvaluationPage from './pages/EvaluationPage';
import SimilarityPage from './pages/SimilarityPage';
import ProjectsPage from './pages/ProjectsPage';
import ReportsPage from './pages/ReportsPage';
import FeedbackPage from './pages/FeedbackPage';
import InvestigationPage from './pages/InvestigationPage';
import SettingsPage from './pages/SettingsPage';
import HelpPage from './pages/HelpPage';
import GitHubPage from './pages/GitHubPage';
import ChatPage from './pages/ChatPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<AppLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="analyze" element={<AnalysisPage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="repository" element={<RepositoryPage />} />
              <Route path="evolution" element={<EvolutionPage />} />
              <Route path="evaluation" element={<EvaluationPage />} />
              <Route path="similarity" element={<SimilarityPage />} />
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="feedback" element={<FeedbackPage />} />
              <Route path="investigation" element={<InvestigationPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="github" element={<GitHubPage />} />
              <Route path="chat" element={<ChatPage />} />
              <Route path="help" element={<HelpPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
