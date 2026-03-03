import React from 'react';
import { useAuth } from '../context/AuthContext';
import Dashboard from '../pages/Dashboard';
import MissionSecretaryDashboard from '../pages/MissionSecretaryDashboard';
import FinanceDashboard from '../pages/FinanceDashboard';
import ResidentPastorDashboard from '../pages/ResidentPastorDashboard';
import VicePresidentDashboard from '../pages/VicePresidentDashboard';
import SecretaryDashboard from '../pages/SecretaryDashboard';

const RoleBasedDashboard = () => {
  const { user } = useAuth();
  const userRole = user?.primaryRole?.role_code;
  const userType = user?.userType;
  const permissions = user?.permissions || [];

  if (userType === 'sub_user') {
    return <SecretaryDashboard />;
  }

  if (permissions.includes('manage_finance') || userRole === 'FINANCE_OFFICER') {
    return <FinanceDashboard />;
  }
  if (permissions.includes('request_management') || userRole === 'MISSION_SECRETARY' || userRole === 'MISSION_SECRETARY_MISSION') {
    return <MissionSecretaryDashboard />;
  }
  if (permissions.includes('vp_dashboard') || userRole === 'VICE_PRESIDENT_MA' || userRole === 'VICE_PRESIDENT_MISSION') {
    return <VicePresidentDashboard />;
  }
  if (permissions.includes('pastor_dashboard') || userRole === 'RESIDENT_PASTOR' || userRole === 'RESIDENT_PASTOR_HQ') {
    return <ResidentPastorDashboard />;
  }

  return <Dashboard />;
};

export default RoleBasedDashboard;

