import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { logoutAdmin } from '../lib/api';
import OAuthTokenPanel from './OAuthTokenPanel';
import { useTheme } from '../hooks/useTheme';

const navItems = [
  { to: '/', label: 'Dashboard', icon: 'grid' },
  { to: '/clients', label: 'Clients', icon: 'key' },
  { to: '/records', label: 'Records', icon: 'list' },
  { to: '/health', label: 'Health', icon: 'heart' },
] as const;

function NavIcon({ icon, className }: { icon: string; className?: string }) {
  switch (icon) {
    case 'grid':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
        </svg>
      );
    case 'key':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      );
    case 'list':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      );
    case 'heart':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function Layout() {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();

  const handleLogout = async () => {
    try {
      await logoutAdmin();
    } catch {
      // Ignore errors — navigate to login anyway
    }
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar fijo colapsable */}
      <aside
        className={`fixed left-0 top-0 h-full z-30 flex flex-col bg-black text-white transition-all duration-300 ${
          expanded ? 'w-64' : 'w-16'
        }`}
      >
        {/* Toggle button */}
        <div className="flex items-center justify-end h-16 px-2">
          <button
            onClick={() => setExpanded((prev) => !prev)}
            className="p-2 text-white/70 hover:text-white rounded-md hover:bg-white/10 transition-colors"
            title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {expanded ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
              title={!expanded ? item.label : undefined}
            >
              <NavIcon icon={item.icon} className="w-5 h-5 shrink-0" />
              <span
                className={`transition-opacity duration-200 ${
                  expanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'
                }`}
              >
                {item.label}
              </span>
            </NavLink>
          ))}
        </nav>

        {/* OAuthTokenPanel — visible solo cuando expandido */}
        <div
          className={`transition-all duration-300 overflow-hidden ${
            expanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="px-3 py-2 border-t border-white/10">
            <OAuthTokenPanel />
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div
        className={`flex flex-col flex-1 min-w-0 transition-all duration-300 ${
          expanded ? 'ml-64' : 'ml-16'
        }`}
      >
        <header className="flex items-center justify-between h-16 px-4 border-b bg-card lg:px-6">
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <button
              onClick={toggle}
              className="p-2 text-muted-foreground rounded-md hover:bg-accent hover:text-foreground transition-colors"
              title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            >
              {theme === 'dark' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M18.364 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            <button
              onClick={handleLogout}
              className="p-2 text-muted-foreground rounded-md hover:bg-accent hover:text-foreground transition-colors"
              title="Logout"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
