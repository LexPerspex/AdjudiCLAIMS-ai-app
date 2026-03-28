import { Outlet } from 'react-router';
import { Gavel } from 'lucide-react';

/**
 * Auth layout — centered card, no sidebar.
 * Used for login, registration, and password-reset pages.
 */
export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-surface font-sans antialiased flex flex-col items-center justify-center p-4">
      {/* Brand header */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="w-12 h-12 primary-gradient rounded-xl flex items-center justify-center">
          <Gavel className="w-6 h-6 text-white" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-primary">AdjudiCLAIMS</h1>
          <p className="text-xs text-outline uppercase tracking-widest">
            From Black Box to Glass Box
          </p>
        </div>
      </div>

      {/* Card container */}
      <div className="w-full max-w-md bg-surface-container-lowest rounded-2xl ambient-shadow p-8">
        <Outlet />
      </div>

      {/* Footer note */}
      <p className="mt-6 text-xs text-outline text-center max-w-sm">
        AdjudiCLAIMS is an augmented intelligence tool for California Workers' Compensation claims
        professionals. All AI outputs are UPL-compliant.
      </p>
    </div>
  );
}
