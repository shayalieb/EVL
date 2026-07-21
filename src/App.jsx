import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { ToastProvider } from './components/ui/Toast';
import { SavingIndicatorProvider } from './components/ui/SavingIndicator';
import AuthPage from './pages/AuthPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ContractSignPage from './pages/ContractSignPage';
import AppLayout from './layouts/AppLayout';
import HomePage from './pages/HomePage';
import NoAccountAccessPage from './pages/NoAccountAccessPage';
import ContractorsPage from './pages/ContractorsPage';
import ClientsPage from './pages/ClientsPage';
import BookingsPage from './pages/BookingsPage';
import BookingFormPage from './pages/BookingFormPage';
import EventsPage from './pages/EventsPage';
import EventFormPage from './pages/EventFormPage';
import EmailTemplatesPage from './pages/EmailTemplatesPage';
import SettingsPage from './pages/SettingsPage';
import SupportPage from './pages/SupportPage';
import AdminLayout from './layouts/AdminLayout';
import AdminAccountsPage from './pages/admin/AdminAccountsPage';
import AdminSupportPage from './pages/admin/AdminSupportPage';
import AdminAdminsPage from './pages/admin/AdminAdminsPage';

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

function PlatformAdminArea() {
  const { currentUser, authLoading } = useAuth();
  if (authLoading) return null;
  if (!currentUser) return <Navigate to="/auth" replace />;
  if (!currentUser.isPlatformAdmin) return <Navigate to="/home" replace />;
  return <AdminLayout />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthGate><AuthPage /></AuthGate>} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/sign/:token" element={<ContractSignPage />} />
      <Route path="/" element={<ProtectedArea />}>
        <Route index element={<Navigate to="/home" replace />} />
        <Route path="home" element={<HomePage />} />
        <Route path="contractors" element={<ContractorsPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="bookings/new" element={<BookingFormPage />} />
        <Route path="bookings/:bookingId" element={<BookingFormPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="events/new" element={<EventFormPage />} />
        <Route path="events/:eventId" element={<EventFormPage />} />
        <Route path="email-templates" element={<EmailTemplatesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="help" element={<SupportPage />} />
      </Route>
      <Route path="/admin" element={<PlatformAdminArea />}>
        <Route index element={<Navigate to="accounts" replace />} />
        <Route path="accounts" element={<AdminAccountsPage />} />
        <Route path="support" element={<AdminSupportPage />} />
        <Route path="admins" element={<AdminAdminsPage />} />
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
          <SavingIndicatorProvider>
            <AppRoutes />
          </SavingIndicatorProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
