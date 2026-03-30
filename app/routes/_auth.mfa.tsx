import { useState, useRef, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ShieldCheck, AlertCircle } from 'lucide-react';

/**
 * MFA verification page — 6-digit TOTP code entry.
 * Shown after successful password login when MFA is enabled.
 * Calls POST /api/auth/mfa/verify to complete the login flow.
 */
export default function MfaPage() {
  const navigate = useNavigate();
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const code = digits.join('');

  function handleDigitChange(index: number, value: string) {
    // Only accept single digits
    const digit = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);

    // Auto-advance to next input
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const newDigits = Array(6).fill('');
      pasted.split('').forEach((char, i) => {
        newDigits[i] = char;
      });
      setDigits(newDigits);
      const nextFocus = Math.min(pasted.length, 5);
      inputRefs.current[nextFocus]?.focus();
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code }),
      });

      const data = (await response.json()) as { error?: string; id?: string };

      if (!response.ok) {
        setError(data.error ?? 'Invalid code. Please try again.');
        setDigits(Array(6).fill(''));
        inputRefs.current[0]?.focus();
        return;
      }

      void navigate('/dashboard');
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="text-center mb-2">
        <div className="flex justify-center mb-3">
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
        </div>
        <h2 className="text-xl font-bold text-on-surface">Two-Factor Verification</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          Enter the 6-digit code from your authenticator app
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-error/10 text-error text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Digit inputs */}
      <div className="flex justify-center gap-2" onPaste={handlePaste}>
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleDigitChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            aria-label={`Digit ${index + 1}`}
            className="w-11 h-14 text-center text-xl font-bold bg-surface-container border border-outline-variant/30 rounded-lg focus:border-primary focus:border-2 outline-none text-on-surface transition-colors"
          />
        ))}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isSubmitting || code.length !== 6}
        className="w-full primary-gradient text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ShieldCheck className="w-4 h-4" />
        {isSubmitting ? 'Verifying...' : 'Verify Code'}
      </button>

      <p className="text-center text-xs text-outline">
        Can't access your authenticator?{' '}
        <Link to="/login" className="text-primary hover:underline font-medium">
          Back to login
        </Link>
      </p>
    </form>
  );
}
