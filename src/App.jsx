import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';

const Onboarding  = lazy(() => import('./pages/Onboarding'));
const Dashboard   = lazy(() => import('./pages/Dashboard'));
const Advisor     = lazy(() => import('./pages/Advisor'));
const Investments = lazy(() => import('./pages/Investments'));
const Learn       = lazy(() => import('./pages/Learn'));
const Budget      = lazy(() => import('./pages/Budget'));
const Goals       = lazy(() => import('./pages/Goals'));
const NetWorth    = lazy(() => import('./pages/NetWorth'));
const Projector   = lazy(() => import('./pages/Projector'));
const Settings    = lazy(() => import('./pages/Settings'));

const Spinner = () => (
  <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid var(--c-border)', borderTopColor: 'var(--c-gold)', animation: 'spin .7s linear infinite' }} />
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

const NAV_ITEMS = [
  { to: '/app',            label: 'Dashboard', icon: '⊡', short: 'Home' },
  { to: '/app/budget',     label: 'Budget',    icon: '◫', short: 'Budget' },
  { to: '/app/investments',label: 'Investments',icon: '◳', short: 'Invest' },
  { to: '/app/goals',      label: 'Goals',     icon: '◎', short: 'Goals' },
  { to: '/app/networth',   label: 'Net Worth', icon: 'Σ',  short: 'Worth' },
  { to: '/app/projector',  label: 'Projector', icon: '↗',  short: 'Project' },
  { to: '/app/advisor',    label: 'AI Advisor',icon: '✦',  short: 'Advisor' },
  { to: '/app/learn',      label: 'Learn',     icon: '❧',  short: 'Learn' },
];

function Shell({ children }) {
  const { profile, signOut } = useAuth();
  const nav = useNavigate();
  const initials = profile?.name ? profile.name[0].toUpperCase() : '?';

  return (
    <>
      <nav className="nav">
        <div className="nav-logo">AI <span>My</span> Money</div>
        <div className="nav-tabs">
          {NAV_ITEMS.map(({ to, label }) => (
            <NavLink key={to} to={to} end={to === '/app'}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              {label}
            </NavLink>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="nav-avatar" title="Settings" onClick={() => nav('/app/settings')}>{initials}</button>
        </div>
      </nav>

      <main>{children}</main>

      {/* Mobile bottom nav */}
      <nav className="bottom-nav">
        {NAV_ITEMS.map(({ to, short, icon }) => (
          <NavLink key={to} to={to} end={to === '/app'}
            className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}>
            <span style={{ fontSize: 20, lineHeight: 1 }}>{icon}</span>
            <span>{short}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}

function Protected({ children }) {
  const { session, profile } = useAuth();
  if (session === undefined || (session && profile === null)) return <Spinner />;
  if (!session) return <Navigate to="/login" replace />;
  if (profile === false || (profile && !profile.onboarding_complete)) return <Navigate to="/onboarding" replace />;
  return <Shell>{children}</Shell>;
}

export default function App() {
  const { session } = useAuth();
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/"        element={session ? <Navigate to="/app" /> : <Landing />} />
        <Route path="/login"   element={session ? <Navigate to="/app" /> : <Login />} />
        <Route path="/signup"  element={session ? <Navigate to="/app" /> : <Signup />} />
        <Route path="/onboarding" element={session ? <Onboarding /> : <Navigate to="/login" />} />
        <Route path="/app"            element={<Protected><Dashboard /></Protected>} />
        <Route path="/app/budget"     element={<Protected><Budget /></Protected>} />
        <Route path="/app/investments"element={<Protected><Investments /></Protected>} />
        <Route path="/app/goals"      element={<Protected><Goals /></Protected>} />
        <Route path="/app/networth"   element={<Protected><NetWorth /></Protected>} />
        <Route path="/app/projector"  element={<Protected><Projector /></Protected>} />
        <Route path="/app/advisor"    element={<Protected><Advisor /></Protected>} />
        <Route path="/app/learn"      element={<Protected><Learn /></Protected>} />
        <Route path="/app/settings"   element={<Protected><Settings /></Protected>} />
        <Route path="*"               element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
  );
}
