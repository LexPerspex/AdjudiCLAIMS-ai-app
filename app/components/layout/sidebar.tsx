import {
  LayoutDashboard,
  FileText,
  CalendarClock,
  FolderOpen,
  Calculator,
  GraduationCap,
  ShieldCheck,
  Settings,
  HelpCircle,
  Gavel,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useLocation, Link } from 'react-router';
import { cn } from '~/lib/utils';

/**
 * Navigation item definition used by the sidebar.
 */
export interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
}

const mainNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: FileText, label: 'My Claims', href: '/claims' },
  { icon: CalendarClock, label: 'Deadlines', href: '/deadlines' },
  { icon: FolderOpen, label: 'Documents', href: '/documents' },
  { icon: Calculator, label: 'Calculators', href: '/calculators' },
  { icon: GraduationCap, label: 'Education', href: '/education' },
  { icon: ShieldCheck, label: 'Compliance', href: '/compliance' },
];

const bottomNavItems: NavItem[] = [
  { icon: Settings, label: 'Settings', href: '/settings' },
  { icon: HelpCircle, label: 'Support', href: '/support' },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * Application sidebar — dark navy anchor (design spec: #0F172A).
 * Collapsible: 240 px expanded, 64 px collapsed.
 */
export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();

  function isActive(href: string) {
    return location.pathname === href || location.pathname.startsWith(href + '/');
  }

  return (
    <aside
      className={cn(
        'bg-sidebar font-sans antialiased tracking-tight h-screen fixed left-0 top-0 overflow-y-auto flex flex-col p-4 gap-6 z-50 transition-all duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-2 py-4">
        <div className="w-8 h-8 bg-primary rounded flex items-center justify-center shrink-0">
          <Gavel className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-xl font-bold tracking-tight text-white leading-tight">
              AdjudiCLAIMS
            </h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest">
              Claims Adjudication
            </p>
          </div>
        )}
      </div>

      {/* Main navigation */}
      <nav className="flex-1 space-y-1">
        {mainNavItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group',
                active
                  ? 'bg-white/10 text-white font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-white/5',
                collapsed && 'justify-center px-0',
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span className="text-sm">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="pt-6 border-t border-white/10 space-y-1">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'text-slate-400 hover:text-white transition-colors flex items-center gap-3 px-3 py-2 rounded-lg group',
                collapsed && 'justify-center px-0',
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span className="text-sm">{item.label}</span>}
            </Link>
          );
        })}

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          className={cn(
            'text-slate-400 hover:text-white transition-colors flex items-center gap-3 px-3 py-2 rounded-lg w-full',
            collapsed && 'justify-center px-0',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-5 h-5 shrink-0" />
          ) : (
            <PanelLeftClose className="w-5 h-5 shrink-0" />
          )}
          {!collapsed && <span className="text-sm">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
