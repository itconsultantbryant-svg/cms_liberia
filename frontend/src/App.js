import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import ChangePassword from './pages/ChangePassword';

// Phase 36 — code-split heavy authenticated pages
const RoleBasedDashboard = lazy(() => import('./components/RoleBasedDashboard'));
const Members = lazy(() => import('./pages/Members'));
const MemberProfile = lazy(() => import('./pages/MemberProfile'));
const MemberForm = lazy(() => import('./pages/MemberForm'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Collections = lazy(() => import('./pages/Collections'));
const Events = lazy(() => import('./pages/Events'));
const EventDetail = lazy(() => import('./pages/EventDetail'));
const Groups = lazy(() => import('./pages/Groups'));
const MinistryDetail = lazy(() => import('./pages/MinistryDetail'));
const Reports = lazy(() => import('./pages/Reports'));
const RoleManagement = lazy(() => import('./pages/RoleManagement'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const MissionSecretaryDashboard = lazy(() => import('./pages/MissionSecretaryDashboard'));
const FinanceDashboard = lazy(() => import('./pages/FinanceDashboard'));
const ResidentPastorDashboard = lazy(() => import('./pages/ResidentPastorDashboard'));
const SecretaryDashboard = lazy(() => import('./pages/SecretaryDashboard'));
const DepartmentManagement = lazy(() => import('./pages/DepartmentManagement'));
const Communications = lazy(() => import('./pages/Communications'));
const StaffManagement = lazy(() => import('./pages/StaffManagement'));
const PayrollManagement = lazy(() => import('./pages/PayrollManagement'));
const ChurchBranding = lazy(() => import('./pages/ChurchBranding'));
const ChurchSettings = lazy(() => import('./pages/ChurchSettings'));
const ChurchAdmins = lazy(() => import('./pages/ChurchAdmins'));
const BranchesManagement = lazy(() => import('./pages/BranchesManagement'));
const WorkflowApprovals = lazy(() => import('./pages/WorkflowApprovals'));
const Households = lazy(() => import('./pages/Households'));
const HouseholdProfile = lazy(() => import('./pages/HouseholdProfile'));
const Visitors = lazy(() => import('./pages/Visitors'));
const VisitorProfile = lazy(() => import('./pages/VisitorProfile'));
const Services = lazy(() => import('./pages/Services'));
const FinanceLedger = lazy(() => import('./pages/FinanceLedger'));
const PledgesDonations = lazy(() => import('./pages/PledgesDonations'));
const ReceiptView = lazy(() => import('./pages/ReceiptView'));
const DonorStatement = lazy(() => import('./pages/DonorStatement'));
const Budgets = lazy(() => import('./pages/Budgets'));
const BudgetDetail = lazy(() => import('./pages/BudgetDetail'));
const PastoralCare = lazy(() => import('./pages/PastoralCare'));
const PastoralCaseDetail = lazy(() => import('./pages/PastoralCaseDetail'));
const Documents = lazy(() => import('./pages/Documents'));
const Assets = lazy(() => import('./pages/Assets'));
const AssetDetail = lazy(() => import('./pages/AssetDetail'));
const Notifications = lazy(() => import('./pages/Notifications'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const SuperadminPortal = lazy(() => import('./pages/SuperadminPortal'));
const VicePresidentDashboard = lazy(() => import('./pages/VicePresidentDashboard'));

function PageFallback() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted, #666)' }}>
      Loading…
    </div>
  );
}

function PrivateLayout({ children, permission = null, requiredRoles = [] }) {
  return (
    <PrivateRoute permission={permission} requiredRoles={requiredRoles}>
      <Layout>
        <Suspense fallback={<PageFallback />}>{children}</Suspense>
      </Layout>
    </PrivateRoute>
  );
}

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/t/:slug/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/change-password"
            element={
              <PrivateRoute>
                <Suspense fallback={<PageFallback />}>
                  <ChangePassword />
                </Suspense>
              </PrivateRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <PrivateLayout>
                <ChurchSettings />
              </PrivateLayout>
            }
          />
          <Route
            path="/settings/branding"
            element={
              <PrivateLayout>
                <ChurchBranding />
              </PrivateLayout>
            }
          />
          <Route
            path="/settings/admins"
            element={
              <PrivateLayout>
                <ChurchAdmins />
              </PrivateLayout>
            }
          />
          <Route
            path="/branches"
            element={
              <PrivateLayout>
                <BranchesManagement />
              </PrivateLayout>
            }
          />
          <Route
            path="/audit"
            element={
              <PrivateLayout permission={['audit.view', 'reports.view', 'settings.manage']}>
                <AuditLogs />
              </PrivateLayout>
            }
          />
          <Route
            path="/notifications"
            element={
              <PrivateLayout>
                <Notifications />
              </PrivateLayout>
            }
          />
          <Route
            path="/workflows"
            element={
              <PrivateLayout>
                <WorkflowApprovals />
              </PrivateLayout>
            }
          />
          <Route
            path="/superadmin"
            element={
              <PrivateRoute>
                <Suspense fallback={<PageFallback />}>
                  <SuperadminPortal />
                </Suspense>
              </PrivateRoute>
            }
          />
          <Route
            path="/"
            element={
              <PrivateLayout>
                <RoleBasedDashboard />
              </PrivateLayout>
            }
          />
          <Route
            path="/mission-secretary"
            element={
              <PrivateLayout>
                <MissionSecretaryDashboard />
              </PrivateLayout>
            }
          />
          <Route
            path="/finance"
            element={
              <PrivateLayout>
                <FinanceDashboard />
              </PrivateLayout>
            }
          />
          <Route
            path="/finance/ledger"
            element={
              <PrivateLayout permission={['finance.view', 'finance.create']}>
                <FinanceLedger />
              </PrivateLayout>
            }
          />
          <Route
            path="/pledges"
            element={
              <PrivateLayout>
                <PledgesDonations />
              </PrivateLayout>
            }
          />
          <Route
            path="/pledges/receipts/:id"
            element={
              <PrivateLayout>
                <ReceiptView />
              </PrivateLayout>
            }
          />
          <Route
            path="/pledges/donors/:id"
            element={
              <PrivateLayout>
                <DonorStatement />
              </PrivateLayout>
            }
          />
          <Route
            path="/budgets"
            element={
              <PrivateLayout>
                <Budgets />
              </PrivateLayout>
            }
          />
          <Route
            path="/budgets/:id"
            element={
              <PrivateLayout>
                <BudgetDetail />
              </PrivateLayout>
            }
          />
          <Route
            path="/pastoral"
            element={
              <PrivateLayout permission={['pastoral.view', 'pastoral.manage']}>
                <PastoralCare />
              </PrivateLayout>
            }
          />
          <Route
            path="/pastoral/:id"
            element={
              <PrivateLayout permission={['pastoral.view', 'pastoral.manage']}>
                <PastoralCaseDetail />
              </PrivateLayout>
            }
          />
          <Route
            path="/documents"
            element={
              <PrivateLayout>
                <Documents />
              </PrivateLayout>
            }
          />
          <Route
            path="/assets"
            element={
              <PrivateLayout>
                <Assets />
              </PrivateLayout>
            }
          />
          <Route
            path="/assets/:id"
            element={
              <PrivateLayout>
                <AssetDetail />
              </PrivateLayout>
            }
          />
          <Route
            path="/resident-pastor"
            element={
              <PrivateLayout>
                <ResidentPastorDashboard />
              </PrivateLayout>
            }
          />
          <Route
            path="/vice-president"
            element={
              <PrivateLayout>
                <VicePresidentDashboard />
              </PrivateLayout>
            }
          />
          <Route
            path="/secretary"
            element={
              <PrivateLayout>
                <SecretaryDashboard />
              </PrivateLayout>
            }
          />
          <Route
            path="/departments"
            element={
              <PrivateLayout>
                <DepartmentManagement />
              </PrivateLayout>
            }
          />
          <Route
            path="/staff"
            element={
              <PrivateLayout>
                <StaffManagement />
              </PrivateLayout>
            }
          />
          <Route
            path="/payroll"
            element={
              <PrivateLayout>
                <PayrollManagement />
              </PrivateLayout>
            }
          />
          <Route
            path="/members"
            element={
              <PrivateLayout>
                <Members />
              </PrivateLayout>
            }
          />
          <Route
            path="/members/new"
            element={
              <PrivateLayout>
                <MemberForm />
              </PrivateLayout>
            }
          />
          <Route
            path="/members/:id/edit"
            element={
              <PrivateLayout>
                <MemberForm />
              </PrivateLayout>
            }
          />
          <Route
            path="/members/:id"
            element={
              <PrivateLayout>
                <MemberProfile />
              </PrivateLayout>
            }
          />
          <Route
            path="/households"
            element={
              <PrivateLayout>
                <Households />
              </PrivateLayout>
            }
          />
          <Route
            path="/households/:id"
            element={
              <PrivateLayout>
                <HouseholdProfile />
              </PrivateLayout>
            }
          />
          <Route
            path="/visitors"
            element={
              <PrivateLayout>
                <Visitors />
              </PrivateLayout>
            }
          />
          <Route
            path="/visitors/:id"
            element={
              <PrivateLayout>
                <VisitorProfile />
              </PrivateLayout>
            }
          />
          <Route
            path="/services"
            element={
              <PrivateLayout>
                <Services />
              </PrivateLayout>
            }
          />
          <Route
            path="/attendance"
            element={
              <PrivateLayout>
                <Attendance />
              </PrivateLayout>
            }
          />
          <Route
            path="/collections"
            element={
              <PrivateLayout>
                <Collections />
              </PrivateLayout>
            }
          />
          <Route
            path="/events"
            element={
              <PrivateLayout>
                <Events />
              </PrivateLayout>
            }
          />
          <Route
            path="/events/:id"
            element={
              <PrivateLayout>
                <EventDetail />
              </PrivateLayout>
            }
          />
          <Route
            path="/groups"
            element={
              <PrivateLayout>
                <Groups />
              </PrivateLayout>
            }
          />
          <Route
            path="/groups/:id"
            element={
              <PrivateLayout>
                <MinistryDetail />
              </PrivateLayout>
            }
          />
          <Route
            path="/ministries"
            element={
              <PrivateLayout>
                <Groups />
              </PrivateLayout>
            }
          />
          <Route
            path="/ministries/:id"
            element={
              <PrivateLayout>
                <MinistryDetail />
              </PrivateLayout>
            }
          />
          <Route
            path="/reports"
            element={
              <PrivateLayout>
                <Reports />
              </PrivateLayout>
            }
          />
          <Route
            path="/roles"
            element={
              <PrivateLayout>
                <RoleManagement />
              </PrivateLayout>
            }
          />
          <Route
            path="/users"
            element={
              <PrivateLayout>
                <UserManagement />
              </PrivateLayout>
            }
          />
          <Route
            path="/communications"
            element={
              <PrivateLayout>
                <Communications />
              </PrivateLayout>
            }
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Router>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
