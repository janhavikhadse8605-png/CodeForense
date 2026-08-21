import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid, Clock, FileText, FolderOpen, Settings, CircleHelp,
  Code2, GitBranch, TrendingUp, Fingerprint, BarChart3, Search,
  MessageSquare, ChevronLeft, ChevronDown, Rocket, Check, ArrowRight, Bot,
} from 'lucide-react';

interface NavEntry {
  path: string;
  icon: typeof LayoutGrid;
  label: string;
}

/** Primary destinations, mirroring the product design. */
const mainNav: NavEntry[] = [
  { path: '/', icon: LayoutGrid, label: 'Dashboard' },
  { path: '/history', icon: Clock, label: 'Analysis History' },
  { path: '/reports', icon: FileText, label: 'Reports' },
  { path: '/projects', icon: FolderOpen, label: 'Saved Projects' },
];

/** The analysis surfaces, grouped so every capability stays reachable. */
const toolNav: NavEntry[] = [
  { path: '/analyze', icon: Code2, label: 'Analyze Code' },
  { path: '/chat', icon: Bot, label: 'Assistant' },
  { path: '/github', icon: GitBranch, label: 'GitHub Repos' },
  { path: '/repository', icon: GitBranch, label: 'Upload ZIP' },
  { path: '/evolution', icon: TrendingUp, label: 'Code Evolution' },
  { path: '/similarity', icon: Fingerprint, label: 'Similarity' },
  { path: '/evaluation', icon: BarChart3, label: 'Model Evaluation' },
  { path: '/investigation', icon: Search, label: 'Investigation' },
  { path: '/feedback', icon: MessageSquare, label: 'Reviewer Feedback' },
];

const footerNav: NavEntry[] = [
  { path: '/settings', icon: Settings, label: 'Settings' },
  { path: '/help', icon: CircleHelp, label: 'Help & Support' },
];

const proPerks = [
  'Unlimited analyses',
  'Repository analysis',
  'Advanced insights',
  'Priority support',
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const renderNav = (entries: NavEntry[]) =>
    entries.map(({ path, icon: Icon, label }) => (
      <NavLink
        key={path}
        to={path}
        end={path === '/'}
        onClick={onMobileClose}
        className={({ isActive }) =>
          `nav-item ${isActive ? 'active' : ''} ${collapsed ? 'justify-center px-3' : ''}`
        }
        title={collapsed ? label : undefined}
      >
        <Icon className="w-[19px] h-[19px] shrink-0" strokeWidth={2} />
        {!collapsed && <span className="truncate">{label}</span>}
      </NavLink>
    ));

  return (
    <>
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
        className={`sidebar shrink-0 md:sticky md:top-[18px] md:h-[calc(100vh-36px)] ${
          collapsed ? 'collapsed' : ''
        } ${mobileOpen ? 'open' : ''}`}
      >
        {/* ── Brand ── */}
        <div className={`flex items-center gap-3.5 px-5 pt-6 pb-5 ${collapsed ? 'justify-center px-3' : ''}`}>
          <div className="brand-mark">
            <Code2 className="w-6 h-6" strokeWidth={2.4} />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="text-[1.35rem] font-bold leading-tight tracking-tight">CodeAuth</h1>
              <p className="text-[0.72rem] text-[var(--text-muted)] leading-tight">
                AI Authorship Analyzer
              </p>
            </div>
          )}
          <button
            onClick={onToggle}
            className="ml-auto hidden md:flex p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-soft)] hover:text-coral-500 transition-colors"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronLeft className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* ── Navigation ── */}
        <nav className="flex-1 overflow-y-auto px-3 pb-2 space-y-1">
          {renderNav(mainNav)}

          {!collapsed && <p className="nav-section-label">Analysis Tools</p>}
          {collapsed && <div className="my-3 mx-3 border-t border-[var(--line)]" />}
          <div className="space-y-1">{renderNav(toolNav)}</div>

          <div className="my-3 mx-3 border-t border-[var(--line)]" />
          <div className="space-y-1">{renderNav(footerNav)}</div>
        </nav>

        {/* ── Upgrade to Pro ── */}
        {!collapsed && (
          <div className="px-4 pb-3">
            <div className="pro-card">
              <div className="flex items-center gap-2 mb-3">
                <Rocket className="w-[18px] h-[18px] text-coral-500" />
                <span className="font-bold text-coral-600 text-[0.95rem]">Upgrade to Pro</span>
              </div>
              <ul className="space-y-2 mb-4">
                {proPerks.map(perk => (
                  <li key={perk} className="flex items-center gap-2.5 text-[0.84rem] text-[var(--text-body)]">
                    <Check className="w-4 h-4 text-coral-500 shrink-0" strokeWidth={3} />
                    {perk}
                  </li>
                ))}
              </ul>
              <button className="btn-coral btn-block !py-3 !text-[0.9rem]">
                Upgrade Now <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Account ── */}
        <div className={`border-t border-[var(--line)] px-4 py-4 ${collapsed ? 'px-3' : ''}`}>
          <button
            className={`flex items-center gap-3 w-full rounded-2xl p-1.5 hover:bg-[var(--surface-soft)] transition-colors ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <span className="w-10 h-10 shrink-0 rounded-full bg-coral-100 text-coral-600 flex items-center justify-center text-[0.8rem] font-bold tracking-wide">
              DA
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 text-left">
                  <span className="block text-[0.9rem] font-semibold text-[var(--text-strong)] truncate">
                    Dev Ansh
                  </span>
                  <span className="block text-[0.72rem] text-[var(--text-muted)] truncate">
                    devansh@example.com
                  </span>
                </span>
                <ChevronDown className="w-4 h-4 ml-auto shrink-0 text-[var(--text-muted)]" />
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
