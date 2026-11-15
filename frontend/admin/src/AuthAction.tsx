import { useEffect, useState, type FormEvent } from 'react';
import { verifyPasswordResetCode, confirmPasswordReset, applyActionCode } from 'firebase/auth';
import { auth } from './firebase';

/**
 * Our own handler for the links in Firebase Auth emails (set as the email "action URL"):
 *   /auth/action?mode=resetPassword&oobCode=…   → choose a new password
 *   /auth/action?mode=verifyEmail&oobCode=…     → confirm the email address
 * Hebrew, on our domain, instead of the generic Firebase page.
 */
export function AuthAction() {
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode');
  const code = params.get('oobCode') ?? '';
  const [email, setEmail] = useState<string | null>(null);
  const [state, setState] = useState<'checking' | 'form' | 'done' | 'bad'>('checking');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Don't keep the one-time code in the address bar / history.
    history.replaceState(null, '', '/auth/action');
    if (!code) return setState('bad');
    if (mode === 'resetPassword') {
      verifyPasswordResetCode(auth, code)
        .then((e) => {
          setEmail(e);
          setState('form');
        })
        .catch(() => setState('bad'));
    } else if (mode === 'verifyEmail') {
      applyActionCode(auth, code)
        .then(() => setState('done'))
        .catch(() => setState('bad'));
    } else setState('bad');
  }, [code, mode]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const pw = String(f.get('pw'));
    if (pw.length < 10) return setError('לפחות 10 תווים');
    if (pw !== String(f.get('pw2'))) return setError('הסיסמאות לא זהות');
    setBusy(true);
    setError(null);
    try {
      await confirmPasswordReset(auth, code, pw);
      setState('done');
    } catch (err) {
      const c = (err as { code?: string }).code;
      setError(c === 'auth/weak-password' || c === 'auth/password-does-not-meet-requirements' ? 'הסיסמה חלשה מדי – נסה ארוכה יותר' : 'הקישור כבר לא בתוקף. בקש קישור חדש.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center">
      <div className="auth-card">
        <img src="/pizza-sosi-header.svg" alt="פיצה סוסי" width="190" height="80" />
        {state === 'checking' && <p className="muted">בודק את הקישור…</p>}
        {state === 'bad' && (
          <>
            <h1>הקישור לא תקף</h1>
            <p className="muted">ייתכן שכבר השתמשת בו או שפג תוקפו. אפשר לבקש קישור חדש ב"שכחתי סיסמה".</p>
            <a className="btn" href="/">למסך הכניסה</a>
          </>
        )}
        {state === 'form' && (
          <>
            <h1>בחירת סיסמה</h1>
            <p className="muted" dir="ltr">{email}</p>
            <form className="stack" onSubmit={onSubmit}>
              <input type="email" name="username" value={email ?? ''} autoComplete="username" readOnly hidden />
              <label className="field">
                <span>סיסמה חדשה (לפחות 10 תווים)</span>
                <input name="pw" type="password" minLength={10} required autoComplete="new-password" dir="ltr" />
              </label>
              <label className="field">
                <span>שוב, לאימות</span>
                <input name="pw2" type="password" minLength={10} required autoComplete="new-password" dir="ltr" />
              </label>
              <button className="btn" disabled={busy}>{busy ? 'שומר…' : 'שמירת סיסמה'}</button>
            </form>
            {error && <p className="error" role="alert">{error}</p>}
          </>
        )}
        {state === 'done' && (
          <>
            <div className="auth-card__ok" aria-hidden="true">✓</div>
            <h1>{mode === 'verifyEmail' ? 'המייל אומת' : 'הסיסמה נשמרה'}</h1>
            <a className="btn" href="/">להתחברות</a>
          </>
        )}
      </div>
    </main>
  );
}
