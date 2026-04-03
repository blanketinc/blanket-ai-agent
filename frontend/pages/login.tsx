import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  onAuthChange,
  sendMagicLink,
  isMagicLinkCallback,
  completeMagicLinkSignIn,
} from '../lib/firebase';
import styles from '../styles/Login.module.css';

const EMAIL_STORAGE_KEY = 'blanketAiEmailForSignIn';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [completingSignIn, setCompletingSignIn] = useState(false);

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

  // Handle magic link callback
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isMagicLinkCallback()) return;

    setCompletingSignIn(true);
    const storedEmail = window.localStorage.getItem(EMAIL_STORAGE_KEY);

    if (!storedEmail) {
      // Email not in localStorage — ask user to re-enter
      setCompletingSignIn(false);
      setError('Please enter your email to complete sign-in.');
      return;
    }

    completeMagicLinkSignIn(storedEmail)
      .then(() => {
        window.localStorage.removeItem(EMAIL_STORAGE_KEY);
        router.replace('/');
      })
      .catch((err: any) => {
        setCompletingSignIn(false);
        if (err?.code === 'auth/invalid-action-code') {
          setError('This link has expired or already been used. Please request a new one.');
        } else {
          setError('Sign-in failed. Please try again.');
        }
      });
  }, [router]);

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await sendMagicLink(email);
      // Save email for when user clicks the link
      window.localStorage.setItem(EMAIL_STORAGE_KEY, email);
      setLinkSent(true);
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else if (code === 'auth/unauthorized-continue-uri') {
        setError('This domain is not authorized. Contact your admin.');
      } else {
        setError('Failed to send sign-in link. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle completing sign-in when email was missing from localStorage
  const handleCompleteSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setError('');
    setLoading(true);

    try {
      await completeMagicLinkSignIn(email);
      window.localStorage.removeItem(EMAIL_STORAGE_KEY);
      router.replace('/');
    } catch (err: any) {
      if (err?.code === 'auth/invalid-action-code') {
        setError('This link has expired. Please request a new one.');
      } else {
        setError('Sign-in failed. Please try again.');
      }
      setLoading(false);
    }
  };

  if (checkingAuth || completingSignIn) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          {completingSignIn ? 'Signing you in...' : 'Loading...'}
        </div>
      </div>
    );
  }

  // If we're on a magic link callback but need the email
  const isCallback = typeof window !== 'undefined' && isMagicLinkCallback();

  if (isCallback) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.header}>
            <h1 className={styles.title}>Blanket AI</h1>
            <p className={styles.subtitle}>Enter your email to complete sign-in</p>
          </div>

          <form onSubmit={handleCompleteSignIn} className={styles.form}>
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
              {loading ? 'Signing in...' : 'Complete Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Link sent — show confirmation
  if (linkSent) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.header}>
            <div className={styles.successIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M22 4L12 13L2 4" />
              </svg>
            </div>
            <h1 className={styles.title}>Check your email</h1>
            <p className={styles.subtitle}>
              We sent a sign-in link to <strong>{email}</strong>
            </p>
          </div>

          <div className={styles.instructions}>
            <p>Click the link in the email to sign in. The link expires in 1 hour.</p>
            <p>Didn't get it? Check your spam folder.</p>
          </div>

          <button
            className={styles.secondaryButton}
            onClick={() => { setLinkSent(false); setEmail(''); }}
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  // Default: email input form
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Blanket AI</h1>
          <p className={styles.subtitle}>Enter your email to sign in</p>
        </div>

        <form onSubmit={handleSendLink} className={styles.form}>
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
            {loading ? 'Sending...' : 'Send sign-in link'}
          </button>
        </form>
      </div>
    </div>
  );
}
