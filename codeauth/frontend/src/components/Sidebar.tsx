import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Code2, History, GitBranch, TrendingUp,
  BarChart3, Fingerprint, FolderOpen, FileText, MessageSquare,
  Search, Settings, Sun, Moon, ChevronLeft, Shield,
} from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/analyze', icon: Code2, label: 'Analysis' },
  { path: '/history', icon: History, label: 'Analysis History' },
  { path: '/repository', icon: GitBranch, label: 'Repository Analysis' },
  { path: '/evolution', icon: TrendingUp, label: 'Code Evolution' },
  { path: '/evaluation', icon: BarChart3, label: 'Evaluation' },
  { path: '/similarity', icon: Fingerprint, label: 'Similarity' },
  { path: '/projects', icon: FolderOpen, label: 'Saved Projects' },
  { path: '/reports', icon: FileText, label: 'Reports' },
  { path: '/feedback', icon: MessageSquare, label: 'Feedback' },
  { path: '/investigation', icon: Search, label: 'Investigation' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const { setTheme, isDark } = useTheme();

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="sidebar-overlay md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onMobileClose}
          />
        )}
      </AnimatePresence>

      <aside
        className={`sidebar fixed md:sticky top-0 h-screen flex flex-col z-50 transition-all duration-300 ${
          collapsed ? 'w-[72px]' : 'w-[260px]'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        {/* Logo */}
        <div className="p-5 flex items-center gap-3 border-b border-cream-200">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-coral-500 to-coral-600 flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <h1 className="text-base font-bold text-slate-800">CodeAuth</h1>
              <p className="text-[10px] text-slate-500 -mt-0.5">AI Authorship Analyzer</p>
            </motion.div>
          )}
          <button
            onClick={onToggle}
            className="ml-auto p-1.5 rounded-lg hover:bg-cream-100 text-slate-500 hidden md:flex"
            aria-label="Toggle sidebar"
          >
            <ChevronLeft className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              onClick={onMobileClose}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''} ${collapsed ? 'justify-center px-3' : ''}`
              }
              title={collapsed ? label : undefined}
            >
              <Icon className="w-[18px] h-[18px] flex-shrink-0" />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="p-3 border-t border-cream-200 space-y-2">
          {/* Theme toggle */}
          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className={`nav-item w-full ${collapsed ? 'justify-center px-3' : ''}`}
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
            {!collapsed && <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>}
          </button>

          {/* User profile */}
          {!collapsed && (
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-coral-400 to-amber-400 flex items-center justify-center text-white text-xs font-bold">
                D
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">Developer</p>
                <p className="text-[10px] text-slate-500">Free Plan</p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
