import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, Bell, Sun, Moon, TriangleAlert } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { useTheme } from '../hooks/useTheme';
import { getHealth } from '../api/client';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const { isDark, setTheme } = useTheme();

  // Surface backend/model availability once per session rather than letting
  // every page fail with an opaque 503.
  useEffect(() => {
    getHealth()
      .then(h => setModelError(h?.model_status === 'ready' ? null : h?.model_error || 'Model unavailable'))
      .catch(() => setModelError('Backend unreachable at /api — start the FastAPI server on port 8000.'));
  }, []);

  return (
    <div className="app-shell flex">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <main className="panel flex-1 min-w-0 md:ml-[18px] overflow-hidden">
        {/* ── Topbar ── */}
        <div className="flex items-center gap-3 px-5 md:px-8 pt-5 md:pt-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="icon-btn md:hidden"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="md:hidden font-bold text-[var(--text-strong)]">CodeAuth</span>

          <div className="ml-auto flex items-center gap-3">
            <button className="icon-btn" aria-label="Notifications">
              <Bell className="w-[19px] h-[19px]" />
              <span className="dot" />
            </button>
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className="icon-btn"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Moon className="w-[19px] h-[19px]" /> : <Sun className="w-[19px] h-[19px]" />}
            </button>
          </div>
        </div>

        {/* ── Degraded-state banner ── */}
        {modelError && (
          <div className="mx-5 md:mx-8 mt-4 flex items-start gap-3 rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-3">
            <TriangleAlert className="w-[18px] h-[18px] text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-700">Model unavailable</p>
              <p className="text-xs text-amber-700/80 break-words">{modelError}</p>
            </div>
          </div>
        )}

        <div className="px-5 md:px-8 pb-8 pt-5 md:pt-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
