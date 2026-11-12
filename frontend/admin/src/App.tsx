import { useEffect, useState } from 'react';
import { onIdTokenChanged, signOut, type User } from 'firebase/auth';
import { auth } from './firebase';
import { Login } from './Login';
import { OrdersBoard } from './OrdersBoard';
import { StoreControls } from './StoreControls';

interface Session { user: User; role: string | null; mfa: boolean }

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(
    () =>
      onIdTokenChanged(auth, async (user) => {
        if (!user || user.isAnonymous) return setSession(null);
        const token = await user.getIdTokenResult();
        setSession({
          user,
          role: (token.claims.role as string | undefined) ?? null,
          mfa: Boolean(token.signInSecondFactor),
        });
      }),
    [],
  );

  if (session === undefined) return <p className="center">טוען…</p>;
  if (session === null) return <Login />;
  // The UI hides what you can't do; the server enforces it anyway.
  if (!session.role || !session.mfa) {
    return (
      <main className="center">
        <h1>אין הרשאת צוות</h1>
        <p>{!session.role ? 'החשבון הזה לא הוגדר כצוות.' : 'נדרש אימות דו-שלבי לחשבון הזה.'}</p>
        <button className="btn" onClick={() => signOut(auth)}>יציאה</button>
      </main>
    );
  }
  return (
    <>
      <header className="bar">
        <img src="/pizza-sosi-header.svg" alt="פיצה סוסי" height="40" width="95" />
        <span className="bar__who">{session.user.email} · {session.role === 'owner' ? 'בעלים' : 'צוות'}</span>
        <button className="btn btn--ghost" onClick={() => signOut(auth)}>יציאה</button>
      </header>
      <main className="layout">
        <StoreControls />
        <OrdersBoard />
      </main>
    </>
  );
}
