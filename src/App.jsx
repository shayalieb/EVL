import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { PortalAuthProvider, usePortalAuth } from './context/PortalAuthContext';
import { ToastProvider } from './components/ui/Toast';
import { SavingIndicatorProvider } from './components/ui/SavingIndicator';

const AuthPage = lazy(() => import('./pages/AuthPage'));
const PortalLoginPage = lazy(() => import('./pages/portal/PortalLoginPage'));
const PortalVerifyPage = lazy(() => import('./pages/portal/PortalVerifyPage'));
const PortalHomePage = lazy(() => import('./pages/portal/PortalHomePage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const ContractSignPage = lazy(() => import('./pages/ContractSignPage'));
const ProposalRespondPage = lazy(() => import('./pages/ProposalRespondPage'));
const InvoicePayPage = lazy(() => import('./pages/InvoicePayPage'));
const InquiryFormPage = lazy(() => import('./pages/InquiryFormPage'));
const RsvpPage = lazy(() => import('./pages/RsvpPage'));
const ContractorCalendarPage = lazy(() => import('./pages/ContractorCalendarPage'));
const AppLayout = lazy(() => import('./layouts/AppLayout'));
const HomePage = lazy(() => import('./pages/HomePage'));
const NoAccountAccessPage = lazy(() => import('./pages/NoAccountAccessPage'));
const PendingApprovalPage = lazy(() => import('./pages/PendingApprovalPage'));
const ContractorsPage = lazy(() => import('./pages/ContractorsPage'));
const ClientsPage = lazy(() => import('./pages/ClientsPage'));
const VenuesPage = lazy(() => import('./pages/VenuesPage'));
const OfferingsPage = lazy(() => import('./pages/OfferingsPage'));
const BookingsPage = lazy(() => import('./pages/BookingsPage'));
const BookingFormPage = lazy(() => import('./pages/BookingFormPage'));
const EventsPage = lazy(() => import('./pages/EventsPage'));
const EventFormPage = lazy(() => import('./pages/EventFormPage'));
const EmailTemplatesPage = lazy(() => import('./pages/EmailTemplatesPage'));
const RemindersPage = lazy(() => import('./pages/RemindersPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const HelpPage = lazy(() => import('./pages/HelpPage'));
const AdminLayout = lazy(() => import('./layouts/AdminLayout'));
const AdminAccountsPage = lazy(() => import('./pages/admin/AdminAccountsPage'));
const AdminAccountProfilePage = lazy(() => import('./pages/admin/AdminAccountProfilePage'));
const AdminSupportPage = lazy(() => import('./pages/admin/AdminSupportPage'));
const AdminAdminsPage = lazy(() => import('./pages/admin/AdminAdminsPage'));
const AdminWaitlistPage = lazy(() => import('./pages/admin/AdminWaitlistPage'));
const AdminWebsitePage = lazy(() => import('./pages/admin/AdminWebsitePage'));
const CanvasEngineDemoPage = lazy(() => import('./pages/dev/CanvasEngineDemoPage'));
const StagePlotEditorPage = lazy(() => import('./pages/StagePlotEditorPage'));
const FloorPlanEditorPage = lazy(() => import('./pages/FloorPlanEditorPage'));
const SetListsEditorPage = lazy(() => import('./pages/SetListsEditorPage'));
const SetListLibraryPage = lazy(() => import('./pages/SetListLibraryPage'));
const StagePlotLibraryPage = lazy(() => import('./pages/StagePlotLibraryPage'));
const StagePlotLibraryEditorPage = lazy(() => import('./pages/StagePlotLibraryEditorPage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const CustomerStoriesPage = lazy(() => import('./pages/CustomerStoriesPage'));
const AgencyGroupsPage = lazy(() => import('./pages/AgencyGroupsPage'));
const ReviewSubmissionPage = lazy(() => import('./pages/ReviewSubmissionPage'));

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
  // Gated here, before DataProvider ever mounts — a pending (or billing-
  // locked) account can log in fine (auth.js's /login and /me don't run
  // through attachMembership), so without this every DataContext fetch
  // would 403 individually once the app tried to load, instead of showing
  // one clear screen. Same page handles both cases (see
  // PendingApprovalPage.jsx) — never approved vs. approved-but-lapsed.
  if (!currentUser.accountApproved || currentUser.subscriptionBlocked) return <PendingApprovalPage />;
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
    <Suspense fallback={<div className="min-h-screen bg-slate-50" aria-busy="true" />}>
      <Routes>
      <Route path="/auth" element={<AuthGate><AuthPage /></AuthGate>} />
      <Route path="/customer-stories" element={<CustomerStoriesPage />} />
      <Route path="/review/:token" element={<ReviewSubmissionPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/sign/:token" element={<ContractSignPage />} />
      <Route path="/proposal/:token" element={<ProposalRespondPage />} />
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
        <Route path="agency/groups" element={<AgencyGroupsPage />} />
        <Route path="contractors" element={<ContractorsPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="venues" element={<VenuesPage />} />
        <Route path="offerings" element={<OfferingsPage />} />
        <Route path="set-lists" element={<VerticalGate vertical="band_orchestra"><SetListLibraryPage /></VerticalGate>} />
        <Route path="stage-plot-library" element={<VerticalGate vertical="band_orchestra"><StagePlotLibraryPage /></VerticalGate>} />
        <Route path="stage-plot-library/:libraryItemId" element={<VerticalGate vertical="band_orchestra"><StagePlotLibraryEditorPage /></VerticalGate>} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="bookings/new" element={<BookingFormPage />} />
        <Route path="bookings/:bookingId" element={<BookingFormPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="events/new" element={<EventFormPage />} />
        <Route path="events/:eventId" element={<EventFormPage />} />
        <Route path="reminders" element={<RemindersPage />} />
        <Route path="email-templates" element={<EmailTemplatesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="dev/canvas-demo" element={<DevOnlyRoute><CanvasEngineDemoPage /></DevOnlyRoute>} />
        <Route path="events/:eventId/stage-plot" element={<VerticalGate vertical="band_orchestra"><StagePlotEditorPage /></VerticalGate>} />
        <Route path="events/:eventId/floor-plan" element={<VerticalGate vertical="party_planning"><FloorPlanEditorPage /></VerticalGate>} />
        <Route path="events/:eventId/set-lists" element={<VerticalGate vertical="band_orchestra"><SetListsEditorPage /></VerticalGate>} />
      </Route>
      <Route path="/admin" element={<PlatformAdminArea />}>
        <Route index element={<Navigate to="accounts" replace />} />
        <Route path="accounts" element={<AdminAccountsPage />} />
        <Route path="accounts/:accountId" element={<AdminAccountProfilePage />} />
        <Route path="waitlist" element={<AdminWaitlistPage />} />
        <Route path="website" element={<AdminWebsitePage />} />
        <Route path="support" element={<AdminSupportPage />} />
        <Route path="admins" element={<AdminAdminsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
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
