import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

/**
 * React Router 7 route configuration.
 *
 * Layout routes:
 * - _auth  — centered card layout (login, registration)
 * - _app   — full app shell with sidebar (authenticated pages)
 *
 * Standalone routes:
 * - /training — training gate (no sidebar, full-page)
 */
export default [
  /* ---- Auth layout (no sidebar) ---------------------------------- */
  layout('routes/_auth.tsx', [
    route('login', 'routes/_auth.login.tsx'),
  ]),

  /* ---- App layout (sidebar + header) ----------------------------- */
  layout('routes/_app.tsx', [
    index('routes/home.tsx'),
    route('dashboard', 'routes/_app.dashboard.tsx'),

    /* Claim detail — nested layout with tab routes */
    route('claims/:claimId', 'routes/_app.claims.$claimId.tsx', [
      index('routes/_app.claims.$claimId.overview.tsx'),
      route('documents', 'routes/_app.claims.$claimId.documents.tsx'),
      route('deadlines', 'routes/_app.claims.$claimId.deadlines.tsx'),
      route('investigation', 'routes/_app.claims.$claimId.investigation.tsx'),
      route('workflows', 'routes/_app.claims.$claimId.workflows.tsx'),
      route('chat', 'routes/_app.claims.$claimId.chat.tsx'),
      route('letters', 'routes/_app.claims.$claimId.letters.tsx'),
      route('liens', 'routes/_app.claims.$claimId.liens.tsx'),
      route('timeline', 'routes/_app.claims.$claimId.timeline.tsx'),
      route('referrals', 'routes/_app.claims.$claimId.referrals.tsx'),
    ]),
  ]),

  /* ---- Standalone pages ------------------------------------------ */
  route('training', 'routes/training.tsx'),
] satisfies RouteConfig;
