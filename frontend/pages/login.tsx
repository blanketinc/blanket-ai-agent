import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { onAuthChange, signInWithToken } from '../lib/firebase';
import styles from '../styles/Login.module.css';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:5001/v2/ai-assistant';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpId, setOtpId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const otpInputRef = useRef<HTMLInputElement>(null);

  // Check if already authenticated
  useEffect(() => {
    const unsubscribe = onAuthChange((user) => {
      if (user) {
        router.replace('/');
      }
      setCheckingAuth(false);
    });
    return unsubscribe;
  }, [router]);

  // Auto-focus OTP input when code is sent
  useEffect(() => {
    if (codeSent) otpInputRef.current?.focus();
  }, [codeSent]);

  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (res.status === 404) {
          setError('No account found with this email.');
        } else if (res.status === 429) {
          setError('Please wait a moment before requesting another code.');
        } else {
          setError(data.error || 'Failed to send code. Please try again.');
        }
        return;
      }

      setOtpId(data.otpId);
      setCodeSent(true);
    } catch {
      setError('Unable to connect. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, otpId }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (res.status === 410) {
          setError('Code expired. Please request a new one.');
          setCodeSent(false);
          setOtp('');
        } else if (res.status === 401) {
          setError('Incorrect code. Please try again.');
          setOtp('');
        } else {
          setError(data.error || 'Verification failed. Please try again.');
        }
        return;
      }

      // Sign in with the custom token
      await signInWithToken(data.token);
      router.replace('/');
    } catch {
      setError('Unable to connect. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  // Step 2: Enter the code
  if (codeSent) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.header}>
            <h1 className={styles.title}>Blanket AI</h1>
            <p className={styles.subtitle}>
              Enter the 6-digit code sent to <strong>{email}</strong>
            </p>
          </div>

          <form onSubmit={handleVerifyOTP} className={styles.form}>
            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.field}>
              <label htmlFor="otp" className={styles.label}>Code</label>
              <input
                ref={otpInputRef}
                id="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className={`${styles.input} ${styles.otpInput}`}
                placeholder="000000"
                required
                autoFocus
              />
            </div>

            <button
              type="submit"
              className={styles.button}
              disabled={loading || otp.length !== 6}
            >
              {loading ? 'Verifying...' : 'Sign In'}
            </button>
          </form>

          <button
            className={styles.secondaryButton}
            onClick={() => { setCodeSent(false); setOtp(''); setError(''); }}
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  // Step 1: Enter email
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Blanket AI</h1>
          <p className={styles.subtitle}>Enter your email to sign in</p>
        </div>

        <form onSubmit={handleRequestOTP} className={styles.form}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.field}>
            <label htmlFor="email" className={styles.label}>Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              placeholder="you@company.com"
              required
              autoFocus
            />
          </div>

          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? 'Sending...' : 'Send sign-in code'}
          </button>
        </form>
      </div>
    </div>
  );
}
