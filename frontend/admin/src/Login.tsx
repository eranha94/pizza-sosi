import { useState, type FormEvent } from 'react';
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  getMultiFactorResolver,
  TotpMultiFactorGenerator,
  type MultiFactorResolver,
  type MultiFactorError,
} from 'firebase/auth';
import { API } from '@pizza-sosi/contracts';
import { auth, callAdmin } from './firebase';

/** Staff sign-in: email + password, then a 6-digit code from the authenticator app. */
export function Login() {
  const [resolver, setResolver] = useState<MultiFactorResolver | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), String(f.get('password')));
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/multi-factor-auth-required') setResolver(getMultiFactorResolver(auth, err as MultiFactorError));
      else if (code === 'auth/too-many-requests') setError('יותר מדי ניסיונות. נסה שוב בעוד כמה דקות.');
      else setError('מייל או סיסמה שגויים');
    } finally {
      setBusy(false);
    }
  }

  async function onForgot() {
    setError(null);
    if (!email.includes('@')) return setError('הקלד קודם את המייל שלך');
    try {
      // Our server sends a Hebrew email with a working link; until email is set up it says "firebase".
      const { mode } = (await callAdmin(API.requestPasswordReset, { email: email.trim() })) as { mode: 'sent' | 'firebase' };
      if (mode === 'firebase') await sendPasswordResetEmail(auth, email.trim());
    } catch (err) {
      if ((err as { code?: string }).code === 'functions/resource-exhausted') return setError('יותר מדי בקשות. נסה שוב בעוד שעה.');
      /* otherwise the same answer either way – don't reveal which emails exist */
    }
    setInfo('אם המייל רשום אצלנו, נשלח אליו קישור לקביעת סיסמה חדשה.');
  }

  async function onCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!resolver) return;
    const code = String(new FormData(e.currentTarget).get('code')).trim();
    const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
    if (!hint) return setError('לא מוגדר אימות דו־שלבי לחשבון');
    setBusy(true);
    setError(null);
    try {
      await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code));
    } catch {
      setError('הקוד שגוי או שפג תוקפו');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center">
      <div className="auth-card">
        <img src="/pizza-sosi-header.svg" alt="פיצה סוסי" width="190" height="80" />
        <h1>ניהול הפיצריה</h1>
        {!resolver ? (
          <form className="stack" onSubmit={onPassword}>
            <label className="field">
              <span>מייל</span>
              <input name="email" type="email" required autoComplete="username" spellCheck={false} dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="field">
              <span>סיסמה</span>
              <input name="password" type="password" required autoComplete="current-password" dir="ltr" />
            </label>
            <button className="btn" disabled={busy}>{busy ? 'מתחבר…' : 'כניסה'}</button>
            <button type="button" className="link-btn" onClick={onForgot}>שכחתי סיסמה</button>
          </form>
        ) : (
          <form className="stack" onSubmit={onCode}>
            <p className="muted">פתח את אפליקציית האימות והקלד את הקוד של פיצה סוסי.</p>
            <label className="field">
              <span>קוד בן 6 ספרות</span>
              <input className="code-input" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="one-time-code" dir="ltr" autoFocus />
            </label>
            <button className="btn" disabled={busy}>{busy ? 'בודק…' : 'אישור'}</button>
            <button type="button" className="link-btn" onClick={() => setResolver(null)}>חזרה</button>
          </form>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        {info && <p className="info" role="status">{info}</p>}
      </div>
    </main>
  );
}
