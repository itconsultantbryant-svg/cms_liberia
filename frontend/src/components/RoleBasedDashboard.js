import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ChurchAdminOverview from '../pages/ChurchAdminOverview';
import MissionSecretaryDashboard from '../pages/MissionSecretaryDashboard';
import FinanceDashboard from '../pages/FinanceDashboard';
import VicePresidentDashboard from '../pages/VicePresidentDashboard';
import SecretaryDashboard from '../pages/SecretaryDashboard';
import PersonalizedDashboard from '../pages/PersonalizedDashboard';

/**
 * Phase 30 — home dashboard depends on resolved persona.
 * Finance → financial UI; membership → membership widgets; pastor → high-level
 * church widgets; church admin → church-wide overview; Superadmin → portal.
 */
const RoleBasedDashboard = () => {
  const { user } = useAuth();
  const [personaId, setPersonaId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      if (user.isSuperadmin) {
        if (!cancelled) {
          setPersonaId('superadmin');
          setLoading(false);
        }
        return;
      }
      try {
        const { data } = await axios.get('/api/dashboard/persona');
        if (!cancelled) setPersonaId(data.persona?.id || 'general');
      } catch (_) {
        if (!cancelled) setPersonaId('general');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user || loading) {
    return <div style={{ padding: 24 }}>Loading dashboard…</div>;
  }

  if (personaId === 'superadmin' || user.isSuperadmin) {
    return <Navigate to="/superadmin" replace />;
  }

  switch (personaId) {
    case 'church_admin':
      return <ChurchAdminOverview />;
    case 'finance':
      return <FinanceDashboard />;
    case 'requests':
      return <MissionSecretaryDashboard />;
    case 'executive':
      return <VicePresidentDashboard />;
    case 'pastor':
    case 'membership':
    case 'general':
      return <PersonalizedDashboard />;
    case 'secretary':
      return <SecretaryDashboard />;
    default:
      return <PersonalizedDashboard />;
  }
};

export default RoleBasedDashboard;
