import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';

// Code-split: heavy pages (charts, wizards) load on demand, shrinking the initial bundle.
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Advisor = lazy(() => import('./pages/Advisor'));
const Investments = lazy(() => import('./pages/Investments'));
const Learn = lazy(() => import('./pages/Learn'));
const Budget = lazy(() => import('./pages/Budget'));
const Goals = lazy(() => import('./pages/Goals'));
const NetWorth = lazy(() => import('./pages/NetWorth'));
const Projector = lazy(() => import('./pages/Projector'));
const Settings = lazy(() => import('./pages/Settings'));

const PageFallback = () => (
  <div className="page"><div className="skeleton" style={{ height: 220, marginTop: 24 }} /></div>
);

const GLYPHS = { '/app': '◈', '/app/budget': '¤', '/app/investments': '▤', '/app/goals': '◎', '/app/networth': 'Σ', '/app/projector': '↗', '/app/advisor': '✦', '/app/learn': '❧' };
const TABS = [
  ['/app', 'Dashboard'],
  ['/app/budget', 'Budget'],
  ['/app/investments', 'Investments'],
  ['/app/goals', 'Goals'],
  ['/app/networth', 'Net Worth'],
  ['/app/projector', 'Projector'],
  ['/app/advisor', 'AI Advisor'],
  ['/app/learn', 'Learn'],
];

function Shell({ children }) {
  const { signOut, profile } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <nav className="nav">
        <div className="nav-brand">AI <em>My</em> Money</div>
        <div className="nav-tabs">
          {TABS.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/app'}
              className={({ isActive }) => 'nav-tab' + (isActive ? ' on' : '')}>
              {label}
            </NavLink>
          ))}
        </div>
        <button className="btn ghost" style={{ borderColor: 'rgba(246,242,234,.25)', color: 'var(--paper)', padding: '7px 16px', fontSize: '.68rem' }}
          onClick={() => navigate('/app/settings')}>
          {profile?.name ? `${profile.name} ⚙` : 'Settings ⚙'}
        </button>
      </nav>
      {children}
      <nav className="bottom-nav" aria-label="Primary">
        {TABS.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/app'}
            className={({ isActive }) => (isActive ? 'on' : '')}>
            <span className="glyph" aria-hidden>{GLYPHS[to]}</span>
            {label.replace('AI Advisor', 'Advisor').replace('Net Worth', 'Worth')}
          </NavLink>
        ))}
      </nav>
    </>
  );
}

function Protected({ children }) {
  const { session, profile } = useAuth();
  if (session === undefined || (session && profile === null)) {
    return <div className="page"><div className="skeleton" style={{ height: 220, marginTop: 40 }} /></div>;
  }
  if (!session) return <Navigate to="/login" replace />;
  if (profile === false || (profile && !profile.onboarding_complete)) {
    return <Navigate to="/onboarding" replace />;
  }
  return <Shell>{children}</Shell>;
}

export default function App() {
  const { session } = useAuth();
  return (
    <Suspense fallback={<PageFallback />}>
    <Routes>
      <Route path="/" element={session ? <Navigate to="/app" /> : <Landing />} />
      <Route path="/login" element={session ? <Navigate to="/app" /> : <Login />} />
      <Route path="/signup" element={session ? <Navigate to="/app" /> : <Signup />} />
      <Route path="/onboarding" element={session ? <Onboarding /> : <Navigate to="/login" />} />
      <Route path="/app" element={<Protected><Dashboard /></Protected>} />
      <Route path="/app/advisor" element={<Protected><Advisor /></Protected>} />
      <Route path="/app/budget" element={<Protected><Budget /></Protected>} />
      <Route path="/app/goals" element={<Protected><Goals /></Protected>} />
      <Route path="/app/networth" element={<Protected><NetWorth /></Protected>} />
      <Route path="/app/projector" element={<Protected><Projector /></Protected>} />
      <Route path="/app/investments" element={<Protected><Investments /></Protected>} />
      <Route path="/app/learn" element={<Protected><Learn /></Protected>} />
      <Route path="/app/settings" element={<Protected><Settings /></Protected>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
    </Suspense>
  );
}
