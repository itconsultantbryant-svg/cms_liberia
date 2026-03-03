import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Members from './pages/Members';
import MemberProfile from './pages/MemberProfile';
import Attendance from './pages/Attendance';
import Collections from './pages/Collections';
import Events from './pages/Events';
import Groups from './pages/Groups';
import Reports from './pages/Reports';
import RoleManagement from './pages/RoleManagement';
import UserManagement from './pages/UserManagement';
import MissionSecretaryDashboard from './pages/MissionSecretaryDashboard';
import FinanceDashboard from './pages/FinanceDashboard';
import ResidentPastorDashboard from './pages/ResidentPastorDashboard';
import VicePresidentDashboard from './pages/VicePresidentDashboard';
import SecretaryDashboard from './pages/SecretaryDashboard';
import DepartmentManagement from './pages/DepartmentManagement';
import Communications from './pages/Communications';
import StaffManagement from './pages/StaffManagement';
import PayrollManagement from './pages/PayrollManagement';
import Layout from './components/Layout';
import RoleBasedDashboard from './components/RoleBasedDashboard';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout>
                  <RoleBasedDashboard />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/mission-secretary"
            element={
              <PrivateRoute>
                <Layout>
                  <MissionSecretaryDashboard />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/finance"
            element={
              <PrivateRoute>
                <Layout>
                  <FinanceDashboard />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/resident-pastor"
            element={
              <PrivateRoute>
                <Layout>
                  <ResidentPastorDashboard />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/departments"
            element={
              <PrivateRoute>
                <Layout>
                  <DepartmentManagement />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/staff"
            element={
              <PrivateRoute>
                <Layout>
                  <StaffManagement />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/payroll"
            element={
              <PrivateRoute>
                <Layout>
                  <PayrollManagement />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/members"
            element={
              <PrivateRoute>
                <Layout>
                  <Members />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/members/:id"
            element={
              <PrivateRoute>
                <Layout>
                  <MemberProfile />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/attendance"
            element={
              <PrivateRoute>
                <Layout>
                  <Attendance />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/collections"
            element={
              <PrivateRoute>
                <Layout>
                  <Collections />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/events"
            element={
              <PrivateRoute>
                <Layout>
                  <Events />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/groups"
            element={
              <PrivateRoute>
                <Layout>
                  <Groups />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <PrivateRoute>
                <Layout>
                  <Reports />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/roles"
            element={
              <PrivateRoute>
                <Layout>
                  <RoleManagement />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/users"
            element={
              <PrivateRoute>
                <Layout>
                  <UserManagement />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/communications"
            element={
              <PrivateRoute>
                <Layout>
                  <Communications />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;

