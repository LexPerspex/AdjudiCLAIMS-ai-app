import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { UserPlus, AlertCircle, CheckCircle, Check, X } from 'lucide-react';

/**
 * Registration form — new user sign-up via POST /api/auth/register.
 * On success: shows "check your email" message.
 *
 * Password policy: min 12 chars, 1 uppercase, 1 lowercase, 1 number, 1 special.
 */

interface PasswordStrength {
  minLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
}

function getPasswordStrength(password: string): PasswordStrength {
  return {
    minLength: password.length >= 12,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };
}

function strengthScore(s: PasswordStrength): number {
  return Object.values(s).filter(Boolean).length;
}

function PasswordRequirement({ met, label }: { met: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-1.5 text-xs ${met ? 'text-primary' : 'text-outline'}`}>
      {met ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
      {label}
    </li>
  );
}

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPasswordRequirements, setShowPasswordRequirements] = useState(false);

  const strength = getPasswordStrength(password);
  const score = strengthScore(strength);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (score < 5) {
      setError('Password does not meet the requirements listed above');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, name, password }),
      });

      const data = (await response.json()) as { ok?: boolean; error?: string; message?: string };

      if (!response.ok) {
        setError(data.error ?? 'Registration failed. Please try again.');
        return;
      }

      setSuccess(true);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="space-y-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
            <CheckCircle className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-on-surface">Check your email</h2>
          <p className="text-sm text-on-surface-variant max-w-xs">
            We sent a verification link to <strong>{email}</strong>. Click the link to activate
            your account.
          </p>
        </div>

        <p className="text-xs text-outline">
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="text-center mb-2">
        <h2 className="text-xl font-bold text-on-surface">Create Account</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          Request access to AdjudiCLAIMS
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-error/10 text-error text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Name */}
      <div className="space-y-1">
        <label htmlFor="name" className="text-xs font-bold uppercase tracking-widest text-outline">
          Full Name
        </label>
        <input
          id="name"
          type="text"
          required
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Smith"
          className="w-full bg-transparent border-b border-outline-variant/20 focus:border-primary focus:border-b-2 outline-none py-2.5 text-sm text-on-surface placeholder:text-outline transition-colors"
        />
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
          autoComplete="email"
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onFocus={() => setShowPasswordRequirements(true)}
          placeholder="Choose a strong password"
          className="w-full bg-transparent border-b border-outline-variant/20 focus:border-primary focus:border-b-2 outline-none py-2.5 text-sm text-on-surface placeholder:text-outline transition-colors"
        />

        {/* Password strength bar */}
        {password.length > 0 && (
          <div className="mt-2 space-y-1.5">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i <= score
                      ? score <= 2
                        ? 'bg-error'
                        : score <= 3
                          ? 'bg-warning'
                          : 'bg-primary'
                      : 'bg-outline-variant/20'
                  }`}
                />
              ))}
            </div>
            <p className="text-xs text-outline">
              {score <= 2 ? 'Weak' : score <= 3 ? 'Fair' : score <= 4 ? 'Good' : 'Strong'}
            </p>
          </div>
        )}

        {/* Password requirements */}
        {(showPasswordRequirements || password.length > 0) && (
          <ul className="mt-2 space-y-0.5">
            <PasswordRequirement met={strength.minLength} label="At least 12 characters" />
            <PasswordRequirement met={strength.hasUpper} label="One uppercase letter" />
            <PasswordRequirement met={strength.hasLower} label="One lowercase letter" />
            <PasswordRequirement met={strength.hasNumber} label="One number" />
            <PasswordRequirement met={strength.hasSpecial} label="One special character" />
          </ul>
        )}
      </div>

      {/* Confirm Password */}
      <div className="space-y-1">
        <label
          htmlFor="confirmPassword"
          className="text-xs font-bold uppercase tracking-widest text-outline"
        >
          Confirm Password
        </label>
        <input
          id="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter your password"
          className="w-full bg-transparent border-b border-outline-variant/20 focus:border-primary focus:border-b-2 outline-none py-2.5 text-sm text-on-surface placeholder:text-outline transition-colors"
        />
        {confirmPassword.length > 0 && password !== confirmPassword && (
          <p className="text-xs text-error mt-1">Passwords do not match</p>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isSubmitting || score < 5 || password !== confirmPassword}
        className="w-full primary-gradient text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <UserPlus className="w-4 h-4" />
        {isSubmitting ? 'Creating account...' : 'Create Account'}
      </button>

      <p className="text-center text-xs text-outline">
        Already have an account?{' '}
        <Link to="/login" className="text-primary hover:underline font-medium">
          Sign in
        </Link>
      </p>
    </form>
  );
}
