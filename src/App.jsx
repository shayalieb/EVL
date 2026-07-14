import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { ToastProvider } from './components/ui/Toast';
import AuthPage from './pages/AuthPage';
import AppLayout from './layouts/AppLayout';
import HomePage from './pages/HomePage';
import NoAccountAccessPage from './pages/NoAccountAccessPage';
import ContractorsPage from './pages/ContractorsPage';
import ClientsPage from './pages/ClientsPage';
import EventsPage from './pages/EventsPage';
import EventFormPage from './pages/EventFormPage';
import EmailTemplatesPage from './pages/EmailTemplatesPage';
import SettingsPage from './pages/SettingsPage';

function ProtectedArea() {
  const { currentUser, authLoading } = useAuth();
  if (authLoading) return null;
  if (!currentUser) return <Navigate to="/auth" replace />;
  if (!currentUser.accountId) return <NoAccountAccessPage />;
  return (
    <DataProvider>
      <AppLayout />
    </DataProvider>
  );
}

function AuthGate({ children }) {
  const { currentUser, authLoading } = useAuth();
  if (authLoading) return null;
  if (currentUser) return <Navigate to="/home" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthGate><AuthPage /></AuthGate>} />
      <Route path="/" element={<ProtectedArea />}>
        <Route index element={<Navigate to="/home" replace />} />
        <Route path="home" element={<HomePage />} />
        <Route path="contractors" element={<ContractorsPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="events/new" element={<EventFormPage />} />
        <Route path="events/:eventId" element={<EventFormPage />} />
        <Route path="email-templates" element={<EmailTemplatesPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
