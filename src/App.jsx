import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { ToastProvider } from './components/ui/Toast';
import AuthPage from './pages/AuthPage';
import CompleteProfilePage from './pages/CompleteProfilePage';
import AppLayout from './layouts/AppLayout';
import ContractorsPage from './pages/ContractorsPage';
import EventsPage from './pages/EventsPage';
import EventFormPage from './pages/EventFormPage';
import EmailTemplatesPage from './pages/EmailTemplatesPage';
import SettingsPage from './pages/SettingsPage';

function ProtectedArea() {
  const { currentUser } = useAuth();
  if (!currentUser) return <Navigate to="/auth" replace />;
  return (
    <DataProvider>
      <AppLayout />
    </DataProvider>
  );
}

function AuthGate({ children }) {
  const { currentUser } = useAuth();
  if (currentUser) return <Navigate to="/contractors" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthGate><AuthPage /></AuthGate>} />
      <Route path="/complete-profile" element={<CompleteProfilePage />} />
      <Route path="/" element={<ProtectedArea />}>
        <Route index element={<Navigate to="/contractors" replace />} />
        <Route path="contractors" element={<ContractorsPage />} />
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
