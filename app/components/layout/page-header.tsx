import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  children?: React.ReactNode;
}

/**
 * Page header with title, optional subtitle, breadcrumb navigation,
 * and an action slot rendered via children.
 */
export function PageHeader({ title, subtitle, breadcrumbs, children }: PageHeaderProps) {
  return (
    <div className="mb-8 flex items-end justify-between">
      <div>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="flex mb-2">
            <ol className="flex items-center space-x-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                  <li key={crumb.label} className="flex items-center space-x-2">
                    {index > 0 && <ChevronRight className="w-3 h-3" />}
                    {isLast || !crumb.href ? (
                      <span className="text-primary">{crumb.label}</span>
                    ) : (
                      <Link to={crumb.href} className="hover:text-primary">
                        {crumb.label}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
        <h2 className="text-4xl font-extrabold tracking-tight text-on-surface">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-on-surface-variant text-sm">{subtitle}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </div>
  );
}
