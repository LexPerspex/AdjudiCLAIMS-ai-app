import { Outlet, Link } from 'react-router';
import { Bell, Clock, Search, User } from 'lucide-react';
import { Sidebar } from './sidebar';
import { useSidebarStore } from '~/stores/sidebar.store';
import { cn } from '~/lib/utils';

/**
 * Top-level application shell wrapping all authenticated pages.
 * Provides sidebar navigation, top header bar, main content area,
 * and the UPL compliance footer bar.
 */
export function AppLayout() {
  const { collapsed, toggle } = useSidebarStore();

  return (
    <div className="min-h-screen bg-surface text-on-surface font-sans antialiased">
      <Sidebar collapsed={collapsed} onToggle={toggle} />

      {/* Header bar */}
      <header
        className={cn(
          'bg-surface sticky top-0 z-40 transition-all duration-200',
          collapsed ? 'ml-16' : 'ml-60',
        )}
      >
        <div className="flex items-center justify-between px-8 h-16 w-full">
          <div className="flex items-center gap-6">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                className="bg-surface-container-low border-none rounded-full py-1.5 pl-10 pr-4 text-sm w-64 focus:ring-2 focus:ring-primary/20 transition-all"
                placeholder="Search claims..."
                type="text"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="flex items-center justify-center p-2 text-slate-500 hover:bg-surface-container-high rounded-full transition-colors relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full" />
            </button>
            <button className="flex items-center justify-center p-2 text-slate-500 hover:bg-surface-container-high rounded-full transition-colors">
              <Clock className="w-5 h-5" />
            </button>
            <div className="h-8 w-px bg-outline-variant/30 mx-2" />
            <div className="flex items-center gap-3 cursor-pointer group">
              <div className="w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center">
                <User className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-semibold text-on-surface">Alex Rivera</span>
            </div>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main
        className={cn(
          'p-8 pb-16 min-h-[calc(100vh-4rem)] transition-all duration-200',
          collapsed ? 'ml-16' : 'ml-60',
        )}
      >
        <Outlet />
      </main>

      {/* UPL Compliance Footer Bar */}
      <footer
        className={cn(
          'fixed bottom-0 right-0 z-40 bg-error py-2 px-8 flex justify-center items-center text-center shadow-2xl transition-all duration-200',
          collapsed ? 'left-16' : 'left-60',
        )}
      >
        <div className="flex items-center gap-6">
          <span className="text-white text-[0.6875rem] uppercase tracking-[0.05em] font-bold">
            UPL Compliance Active — All AI outputs filtered through Green/Yellow/Red zone
            classification
          </span>
          <Link
            to="/compliance"
            className="text-white text-[0.6875rem] uppercase tracking-[0.05em] font-bold underline hover:no-underline"
          >
            View Status
          </Link>
        </div>
      </footer>
    </div>
  );
}
