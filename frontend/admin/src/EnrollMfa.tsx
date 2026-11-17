import { useEffect, useState, type FormEvent } from 'react';
import { multiFactor, signOut, TotpMultiFactorGenerator, type TotpSecret, type User } from 'firebase/auth';
import QRCode from 'qrcode';
import { auth } from './firebase';
import { OtpInput } from './OtpInput';

/**
 * First sign-in of a staff account: set up two-step verification with an authenticator app
 * (Google Authenticator / Microsoft Authenticator / 1Password …). Required for every admin action.
 */
export function EnrollMfa({ user }: { user: User }) {
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [code, setCode] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await multiFactor(user).getSession();
        const s = await TotpMultiFactorGenerator.generateSecret(session);
        if (cancelled) return;
        setSecret(s);
        setQr(await QRCode.toDataURL(s.generateQrCodeUrl(user.email ?? 'staff', 'פיצה סוסי'), { margin: 1, width: 220 }));
      } catch (e) {
        const code = (e as { code?: string }).code;
        setError(
          code === 'auth/requires-recent-login'
            ? 'מטעמי אבטחה צריך להתחבר מחדש ואז להמשיך.'
            : code === 'auth/unverified-email'
              ? 'צריך לאמת את כתובת המייל לפני ההגדרה.'
              : 'לא הצלחנו להתחיל את ההגדרה. נסה שוב.',
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function onSubmit(e?: FormEvent<HTMLFormElement>, typed = code) {
    e?.preventDefault();
    if (!secret || busy || typed.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      await multiFactor(user).enroll(TotpMultiFactorGenerator.assertionForEnrollment(secret, typed), 'אפליקציית אימות');
      setDone(true);
    } catch {
      setError('הקוד שגוי או שפג תוקפו. הקלד את הקוד שמוצג עכשיו באפליקציה.');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="center">
        <div className="auth-card">
          <div className="auth-card__ok" aria-hidden="true">✓</div>
          <h1>האימות הדו־שלבי הוגדר</h1>
          <p className="muted">מעכשיו כל כניסה תבקש סיסמה + קוד מהאפליקציה. התחבר שוב כדי להמשיך.</p>
          <button className="btn" onClick={() => signOut(auth)}>להתחברות</button>
        </div>
      </main>
    );
  }

  return (
    <main className="center">
      <div className="auth-card auth-card--wide">
        <h1>הגדרת אימות דו־שלבי</h1>
        <ol className="steps">
          <li>התקן בטלפון אפליקציית אימות (Google Authenticator או Microsoft Authenticator).</li>
          <li>באפליקציה: הוספת חשבון ← סריקת קוד QR, וסרוק את הקוד.</li>
          <li>הקלד כאן את 6 הספרות שמופיעות באפליקציה.</li>
        </ol>
        {qr ? (
          <img className="qr" src={qr} alt="קוד QR להוספת החשבון לאפליקציית האימות" width="220" height="220" />
        ) : (
          !error && <div className="qr qr--loading" aria-label="טוען" />
        )}
        {secret && (
          <button type="button" className="link-btn" onClick={() => setShowKey((v) => !v)}>
            {showKey ? 'הסתר מפתח' : 'אי אפשר לסרוק? הצג מפתח להקלדה'}
          </button>
        )}
        {showKey && secret && <code className="secret" dir="ltr">{secret.secretKey.replace(/(.{4})/g, '$1 ').trim()}</code>}
        {secret && (
          <form className="stack" onSubmit={onSubmit}>
            <span className="field"><span>הקוד מהאפליקציה</span></span>
            <OtpInput value={code} onChange={setCode} onComplete={(c) => void onSubmit(undefined, c)} disabled={busy} />
            <button className="btn" disabled={busy || code.length !== 6}>{busy ? 'בודק…' : 'הפעלה'}</button>
          </form>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="link-btn" onClick={() => signOut(auth)}>יציאה</button>
      </div>
    </main>
  );
}
