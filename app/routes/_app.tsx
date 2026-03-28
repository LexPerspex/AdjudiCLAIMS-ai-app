import { AppLayout } from '~/components/layout/app-layout';

/**
 * Pathless layout route — wraps all authenticated app pages
 * with the sidebar + header shell.
 */
export default function AppLayoutRoute() {
  return <AppLayout />;
}
