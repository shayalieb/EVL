import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { PortalAuthProvider, usePortalAuth } from './context/PortalAuthContext';
import { ToastProvider } from './components/ui/Toast';
import { SavingIndicatorProvider } from './components/ui/SavingIndicator';
import AuthPage from './pages/AuthPage';
import PortalLoginPage from './pages/portal/PortalLoginPage';
import PortalVerifyPage from './pages/portal/PortalVerifyPage';
import PortalHomePage from './pages/portal/PortalHomePage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ContractSignPage from './pages/ContractSignPage';
import InvoicePayPage from './pages/InvoicePayPage';
import InquiryFormPage from './pages/InquiryFormPage';
import RsvpPage from './pages/RsvpPage';
import ContractorCalendarPage from './pages/ContractorCalendarPage';
import AppLayout from './layouts/AppLayout';
import HomePage from './pages/HomePage';
import NoAccountAccessPage from './pages/NoAccountAccessPage';
import ContractorsPage from './pages/ContractorsPage';
import ClientsPage from './pages/ClientsPage';
import VenuesPage from './pages/VenuesPage';
import OfferingsPage from './pages/OfferingsPage';
import BookingsPage from './pages/BookingsPage';
import BookingFormPage from './pages/BookingFormPage';
import EventsPage from './pages/EventsPage';
import EventFormPage from './pages/EventFormPage';
import EmailTemplatesPage from './pages/EmailTemplatesPage';
import RemindersPage from './pages/RemindersPage';
import SettingsPage from './pages/SettingsPage';
import SupportPage from './pages/SupportPage';
import AdminLayout from './layouts/AdminLayout';
import AdminAccountsPage from './pages/admin/AdminAccountsPage';
import AdminSupportPage from './pages/admin/AdminSupportPage';
import AdminAdminsPage from './pages/admin/AdminAdminsPage';
import CanvasEngineDemoPage from './pages/dev/CanvasEngineDemoPage';
import StagePlotEditorPage from './pages/StagePlotEditorPage';
import FloorPlanEditorPage from './pages/FloorPlanEditorPage';
import SetListsEditorPage from './pages/SetListsEditorPage';
import SetListLibraryPage from './pages/SetListLibraryPage';
import LandingPage from './pages/LandingPage';

// The marketing site lives at the exact root path, which otherwise sits
// inside this same route tree (see AppRoutes' `path="/"` below) — checking
// location here, rather than adding a sibling route, means every other
// path under `/` (`/contractors`, `/settings`, etc.) keeps its existing
// "redirect to /auth when logged out" behavior unchanged.
function ProtectedArea() {
  const { currentUser, authLoading } = useAuth();
  const location = useLocation();
  if (authLoading) return null;
  if (!currentUser) {
    if (location.pathname === '/') return <LandingPage />;
    return <Navigate to="/auth" replace />;
  }
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

// Gates a single route to accounts with access to a given vertical (its own
// `vertical` default, or any vertical once allVerticalsEnabled — see
// server/src/lib/verticals.js's activeVerticals, mirrored here via
// currentUser.activeVerticals). This is UX only — the real authorization
// boundary is server-side (requireVertical in each vertical-specific
// route), so a hidden/redirected page here is not itself a security
// guarantee, just avoids a confusing 403 render.
function VerticalGate({ vertical, children }) {
  const { currentUser, authLoading } = useAuth();
  if (authLoading) return null;
  if (!currentUser) return <Navigate to="/auth" replace />;
  if (!currentUser.activeVerticals?.includes(vertical)) return <Navigate to="/home" replace />;
  return children;
}

// Gates a single route to platform admins without needing a whole nested
// area like PlatformAdminArea below — for one-off internal/dev pages that
// live inside the regular app chrome rather than the admin layout.
function DevOnlyRoute({ children }) {
  const { currentUser } = useAuth();
  if (!currentUser?.isPlatformAdmin) return <Navigate to="/home" replace />;
  return children;
}

// The client-facing self-service portal — deliberately its own auth/session
// (PortalAuthProvider, backed by server/src/routes/portal.js's magic-link
// login and separate portal.sid cookie), never AuthProvider/DataProvider
// (those assume a business User principal throughout). Mounted as its own
// subtree so `/portal/me` is only ever fetched for portal routes, not on
// every page load elsewhere in the app.
function PortalArea() {
  return (
    <PortalAuthProvider>
      <Outlet />
    </PortalAuthProvider>
  );
}

function PortalLoginGate() {
  const { client, portalLoading } = usePortalAuth();
  if (portalLoading) return null;
  if (client) return <Navigate to="/portal" replace />;
  return <PortalLoginPage />;
}

function PortalProtectedRoute() {
  const { client, portalLoading } = usePortalAuth();
  if (portalLoading) return null;
  if (!client) return <Navigate to="/portal/login" replace />;
  return <PortalHomePage />;
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
      <Route path="/invoice/:token" element={<InvoicePayPage />} />
      <Route path="/inquiry/:token" element={<InquiryFormPage />} />
      <Route path="/rsvp/:token" element={<RsvpPage />} />
      <Route path="/gigs/:token" element={<ContractorCalendarPage />} />
      <Route path="/portal" element={<PortalArea />}>
        <Route index element={<PortalProtectedRoute />} />
        <Route path="login" element={<PortalLoginGate />} />
        <Route path="verify" element={<PortalVerifyPage />} />
      </Route>
      <Route path="/" element={<ProtectedArea />}>
        <Route index element={<Navigate to="/home" replace />} />
        <Route path="home" element={<HomePage />} />
        <Route path="contractors" element={<ContractorsPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="venues" element={<VenuesPage />} />
        <Route path="offerings" element={<OfferingsPage />} />
        <Route path="set-lists" element={<VerticalGate vertical="band_orchestra"><SetListLibraryPage /></VerticalGate>} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="bookings/new" element={<BookingFormPage />} />
        <Route path="bookings/:bookingId" element={<BookingFormPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="events/new" element={<EventFormPage />} />
        <Route path="events/:eventId" element={<EventFormPage />} />
        <Route path="reminders" element={<RemindersPage />} />
        <Route path="email-templates" element={<EmailTemplatesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="help" element={<SupportPage />} />
        <Route path="dev/canvas-demo" element={<DevOnlyRoute><CanvasEngineDemoPage /></DevOnlyRoute>} />
        <Route path="events/:eventId/stage-plot" element={<VerticalGate vertical="band_orchestra"><StagePlotEditorPage /></VerticalGate>} />
        <Route path="events/:eventId/floor-plan" element={<VerticalGate vertical="party_planning"><FloorPlanEditorPage /></VerticalGate>} />
        <Route path="events/:eventId/set-lists" element={<VerticalGate vertical="band_orchestra"><SetListsEditorPage /></VerticalGate>} />
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
