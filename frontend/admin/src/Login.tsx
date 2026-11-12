import { useState, type FormEvent } from 'react';
import {
  signInWithEmailAndPassword,
  getMultiFactorResolver,
  TotpMultiFactorGenerator,
  type MultiFactorResolver,
  type MultiFactorError,
} from 'firebase/auth';
import { auth } from './firebase';

/** Staff sign-in: email + password, then a TOTP code from an authenticator app (MFA). */
export function Login() {
  const [resolver, setResolver] = useState<MultiFactorResolver | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, String(f.get('email')), String(f.get('password')));
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/multi-factor-auth-required') setResolver(getMultiFactorResolver(auth, err as MultiFactorError));
      else setError('מייל או סיסמה שגויים');
    } finally {
      setBusy(false);
    }
  }

  async function onCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!resolver) return;
    const code = String(new FormData(e.currentTarget).get('code'));
    const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
    if (!hint) return setError('לא מוגדר אימות דו-שלבי לחשבון');
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
      <img src="/pizza-sosi-header.svg" alt="פיצה סוסי" width="190" height="80" />
      <h1>כניסת צוות</h1>
      {!resolver ? (
        <form className="stack" onSubmit={onPassword}>
          <label className="field"><span>מייל</span><input name="email" type="email" required autoComplete="username" spellCheck={false} /></label>
          <label className="field"><span>סיסמה</span><input name="password" type="password" required autoComplete="current-password" /></label>
          <button className="btn" disabled={busy}>{busy ? 'מתחבר…' : 'כניסה'}</button>
        </form>
      ) : (
        <form className="stack" onSubmit={onCode}>
          <label className="field"><span>קוד מאפליקציית האימות</span><input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="one-time-code" /></label>
          <button className="btn" disabled={busy}>{busy ? 'בודק…' : 'אישור'}</button>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}
