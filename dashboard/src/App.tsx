import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import SetupPage from './pages/SetupPage';
import DashboardPage from './pages/DashboardPage';
import ClientsPage from './pages/ClientsPage';
import ClientDetailPage from './pages/ClientDetailPage';
import RecordsPage from './pages/RecordsPage';
import IssuesPage from './pages/IssuesPage';
import HealthPage from './pages/HealthPage';

const DocsLayout = lazy(() => import('./pages/docs/DocsLayout'));
const DocsPage = lazy(() => import('./pages/docs/DocsPage'));

export default function App() {
  return (
    <Routes>
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/clients/:clientId" element={<ClientDetailPage />} />
          <Route path="/records" element={<RecordsPage />} />
          <Route path="/issues" element={<IssuesPage />} />
          <Route path="/health" element={<HealthPage />} />
        </Route>
        <Route
          path="/docs"
          element={
            <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p className="text-muted-foreground">Cargando documentación...</p></div>}>
              <DocsLayout />
            </Suspense>
          }
        >
          <Route index element={<Suspense fallback={null}><DocsPage /></Suspense>} />
          <Route path=":slug" element={<Suspense fallback={null}><DocsPage /></Suspense>} />
        </Route>
      </Route>
    </Routes>
  );
}
