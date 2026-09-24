import type { Role } from '@pragati/shared';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import Layout from './components/Layout';
import { HOME_BY_ROLE, useAuth } from './lib/auth';
import ApplicationDetail from './pages/ApplicationDetail';
import ChallengeDetail from './pages/ChallengeDetail';
import ComingSoon from './pages/ComingSoon';
import EvaluatorHome from './pages/evaluator/EvaluatorHome';
import FinanceHome from './pages/finance/FinanceHome';
import Login from './pages/Login';
import NewChallenge from './pages/officer/NewChallenge';
import OfficerHome from './pages/officer/OfficerHome';
import ApplyForm from './pages/startup/ApplyForm';
import StartupHome from './pages/startup/StartupHome';

function Protected({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="muted p-8">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
  return <>{children}</>;
}

function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? HOME_BY_ROLE[user.role] : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Home />} />
        <Route path="officer" element={<Protected roles={['DEPT_OFFICER']}><OfficerHome /></Protected>} />
        <Route path="officer/challenges/new" element={<Protected roles={['DEPT_OFFICER']}><NewChallenge /></Protected>} />
        <Route path="startup" element={<Protected roles={['STARTUP']}><StartupHome /></Protected>} />
        <Route path="challenges/:id/apply" element={<Protected roles={['STARTUP']}><ApplyForm /></Protected>} />
        <Route path="finance" element={<Protected roles={['FINANCE']}><FinanceHome /></Protected>} />
        <Route path="evaluator" element={<Protected roles={['EVALUATOR']}><EvaluatorHome /></Protected>} />
        <Route path="challenges/:id" element={<ChallengeDetail />} />
        <Route path="applications/:id" element={<ApplicationDetail />} />
        <Route path="coming-soon" element={<ComingSoon />} />
      </Route>
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
