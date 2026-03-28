import { useState, type FormEvent } from 'react';
import { LogIn } from 'lucide-react';

/**
 * Login form — email + password (placeholder UI for Phase 0).
 * Actual authentication wired up later via better-auth.
 */
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    // TODO: Wire to /api/auth/sign-in via better-auth
    setTimeout(() => setIsSubmitting(false), 1500);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="text-center mb-2">
        <h2 className="text-xl font-bold text-on-surface">Sign In</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          Access your claims dashboard
        </p>
      </div>

      {/* Email */}
      <div className="space-y-1">
        <label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-outline">
          Email Address
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="examiner@insuranceco.com"
          className="w-full bg-transparent border-b border-outline-variant/20 focus:border-primary focus:border-b-2 outline-none py-2.5 text-sm text-on-surface placeholder:text-outline transition-colors"
        />
      </div>

      {/* Password */}
      <div className="space-y-1">
        <label
          htmlFor="password"
          className="text-xs font-bold uppercase tracking-widest text-outline"
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          className="w-full bg-transparent border-b border-outline-variant/20 focus:border-primary focus:border-b-2 outline-none py-2.5 text-sm text-on-surface placeholder:text-outline transition-colors"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full primary-gradient text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <LogIn className="w-4 h-4" />
        {isSubmitting ? 'Signing in...' : 'Sign In'}
      </button>

      <p className="text-center text-xs text-outline">
        Credentials are managed by your organization administrator.
      </p>
    </form>
  );
}
