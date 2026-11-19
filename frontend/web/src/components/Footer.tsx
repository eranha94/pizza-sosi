import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { CONTACT } from '../config/contact';
import { BUSINESS } from '../config/business';
import { LEGAL_PAGES } from '../pages/legal/LegalLayout';

/** app: opens a phone app (Waze, WhatsApp) – same tab, so the phone hands the link to the app instead of a web page. */
type Item = { href: string; label: string; icon: ReactNode; tone: string; brand?: boolean; app?: boolean };

/** Official logo files from each platform's brand kit — shown as-is (no recolor/rotation). */
const logo = (name: string) => <img src={`/brand/social/${name}.png`} alt="" width="44" height="44" loading="lazy" decoding="async" />;

/** Footer: WhatsApp & Waze first (most used), then phone and social pages. */
export function Footer() {
  const items: Item[] = [
    { href: CONTACT.whatsapp, label: 'וואטסאפ', icon: <ChatIcon />, tone: 'whatsapp', app: true },
    { href: CONTACT.waze, label: 'ניווט בוויז', icon: <NavIcon />, tone: 'waze', app: true },
    { href: `tel:${CONTACT.phoneTel}`, label: CONTACT.phoneDisplay, icon: <PhoneIcon />, tone: 'phone' },
    { href: CONTACT.instagram, label: 'אינסטגרם', icon: logo('instagram'), tone: 'instagram', brand: true },
    { href: CONTACT.tiktok, label: 'טיקטוק', icon: logo('tiktok'), tone: 'tiktok', brand: true },
    { href: CONTACT.facebook, label: 'פייסבוק', icon: logo('facebook'), tone: 'facebook', brand: true },
  ].filter((i) => i.href);

  return (
    <footer className="site-footer">
      <p className="site-footer__title">פיצה סוסי · כל סוגי הפיצות והטוסטים</p>
      <ul className="links">
        {items.map((i) => {
          const external = i.href.startsWith('http') && !i.app;
          return (
            <li key={i.tone}>
              <a className={`link-tile link-tile--${i.tone}`} href={i.href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                <span className={`link-tile__icon${i.brand ? ' link-tile__icon--brand' : ''}`} aria-hidden="true">{i.icon}</span>
                <span className="link-tile__label">{i.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
      <nav className="site-footer__legal" aria-label="מידע משפטי">
        <Link to="/my-orders">ההזמנות שלי</Link>
        {LEGAL_PAGES.map((p) => (
          <Link key={p.path} to={p.path}>{p.label}</Link>
        ))}
      </nav>
      <p className="site-footer__small">© {BUSINESS.name} · {BUSINESS.legalType} {BUSINESS.id} · {BUSINESS.address}</p>
    </footer>
  );
}

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const ChatIcon = () => svg(<><path d="M20.5 11.6a8.4 8.4 0 0 1-12.3 7.4L3.5 20.5l1.6-4.5A8.4 8.4 0 1 1 20.5 11.6Z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5" /></>);
const NavIcon = () => svg(<><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>);
const PhoneIcon = () => svg(<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />);
