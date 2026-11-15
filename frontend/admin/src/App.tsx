import { lazy, Suspense, useEffect, useState } from 'react';
import { onIdTokenChanged, signOut, multiFactor, type User } from 'firebase/auth';
import { auth } from './firebase';
import { Login } from './Login';
import { EnrollMfa } from './EnrollMfa';
import { OrdersBoard } from './OrdersBoard';
import { StorePage } from './StorePage';
import { useActiveOrders } from './orders';

const MenuEditor = lazy(() => import('./MenuEditor').then((m) => ({ default: m.MenuEditor })));

interface Session { user: User; role: 'owner' | 'staff' | null; mfa: boolean; enrolled: boolean }
type Tab = 'orders' | 'store' | 'menu';

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(
    () =>
      onIdTokenChanged(auth, async (user) => {
        if (!user || user.isAnonymous) return setSession(null);
        const token = await user.getIdTokenResult();
        const role = token.claims.role;
        setSession({
          user,
          role: role === 'owner' || role === 'staff' ? role : null,
          mfa: Boolean(token.signInSecondFactor),
          enrolled: multiFactor(user).enrolledFactors.length > 0,
        });
      }),
    [],
  );

  if (session === undefined) return <p className="center muted">טוען…</p>;
  if (session === null) return <Login />;
  if (!session.role) {
    return (
      <main className="center">
        <div className="auth-card">
          <h1>אין הרשאת צוות</h1>
          <p className="muted">החשבון הזה לא הוגדר כצוות של פיצה סוסי.</p>
          <button className="btn" onClick={() => signOut(auth)}>יציאה</button>
        </div>
      </main>
    );
  }
  // The UI hides what you can't do; the server and the database rules enforce it anyway.
  if (!session.mfa) {
    if (!session.enrolled) return <EnrollMfa user={session.user} />;
    return (
      <main className="center">
        <div className="auth-card">
          <h1>נדרש קוד אימות</h1>
          <p className="muted">התחבר מחדש עם הקוד מאפליקציית האימות.</p>
          <button className="btn" onClick={() => signOut(auth)}>להתחברות</button>
        </div>
      </main>
    );
  }
  return <Shell session={session} />;
}

const TABS: { id: Tab; label: string; ownerOnly?: boolean }[] = [
  { id: 'orders', label: 'הזמנות' },
  { id: 'store', label: 'שעות ופתיחה' },
  { id: 'menu', label: 'תפריט', ownerOnly: true },
];

function readTab(): Tab {
  const h = location.hash.replace('#', '');
  return h === 'store' || h === 'menu' ? h : 'orders';
}

function Shell({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>(readTab);
  const orders = useActiveOrders(); // stays live on every tab, so new orders always ring
  useEffect(() => {
    const on = () => setTab(readTab());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const tabs = TABS.filter((t) => !t.ownerOnly || session.role === 'owner');
  const current = tabs.some((t) => t.id === tab) ? tab : 'orders';
  const newCount = orders.orders.filter((o) => o.status === 'paid').length;

  useEffect(() => {
    document.title = newCount ? `(${newCount}) הזמנות חדשות – פיצה סוסי` : 'פיצה סוסי – ניהול';
  }, [newCount]);

  return (
    <>
      <header className="bar">
        <img className="bar__logo" src="/pizza-sosi-header.svg" alt="פיצה סוסי" height="40" width="95" />
        <nav className="tabs" aria-label="ניווט ניהול">
          {tabs.map((t) => (
            <a key={t.id} href={`#${t.id}`} className="tab" aria-current={current === t.id ? 'page' : undefined}>
              {t.label}
              {t.id === 'orders' && newCount > 0 && <span className="tab__badge" aria-label={`${newCount} חדשות`}>{newCount}</span>}
            </a>
          ))}
        </nav>
        <div className="bar__end">
          <span className="bar__who">{session.role === 'owner' ? 'בעלים' : 'צוות'}</span>
          <button className="btn btn--ghost btn--sm" onClick={() => signOut(auth)}>יציאה</button>
        </div>
      </header>
      <main className="layout">
        {current === 'orders' && <OrdersBoard {...orders} />}
        {current === 'store' && <StorePage />}
        {current === 'menu' && (
          <Suspense fallback={<p className="muted">טוען…</p>}>
            <MenuEditor />
          </Suspense>
        )}
      </main>
    </>
  );
}
