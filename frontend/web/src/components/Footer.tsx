import type { ReactNode } from 'react';
import { CONTACT } from '../config/contact';

type Item = { href: string; label: string; icon: ReactNode; tone: string };

/** Footer: WhatsApp & Waze first (most used), then phone and social pages. */
export function Footer() {
  const items: Item[] = [
    { href: CONTACT.whatsapp, label: 'וואטסאפ', icon: <ChatIcon />, tone: 'whatsapp' },
    { href: CONTACT.waze, label: 'ניווט בוויז', icon: <NavIcon />, tone: 'waze' },
    { href: `tel:${CONTACT.phoneTel}`, label: CONTACT.phoneDisplay, icon: <PhoneIcon />, tone: 'phone' },
    { href: CONTACT.instagram, label: 'אינסטגרם', icon: <CameraIcon />, tone: 'instagram' },
    { href: CONTACT.tiktok, label: 'טיקטוק', icon: <NoteIcon />, tone: 'tiktok' },
    { href: CONTACT.facebook, label: 'פייסבוק', icon: <PeopleIcon />, tone: 'facebook' },
  ].filter((i) => i.href);

  return (
    <footer className="site-footer">
      <p className="site-footer__title">פיצה סוסי · כל סוגי הפיצות והטוסטים</p>
      <ul className="links">
        {items.map((i) => {
          const external = i.href.startsWith('http');
          return (
            <li key={i.tone}>
              <a className={`link-tile link-tile--${i.tone}`} href={i.href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                <span className="link-tile__icon" aria-hidden="true">{i.icon}</span>
                <span className="link-tile__label">{i.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
      <p className="site-footer__small">© פיצה סוסי</p>
    </footer>
  );
}

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const ChatIcon = () => svg(<><path d="M20.5 11.6a8.4 8.4 0 0 1-12.3 7.4L3.5 20.5l1.6-4.5A8.4 8.4 0 1 1 20.5 11.6Z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5" /></>);
const NavIcon = () => svg(<><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>);
const PhoneIcon = () => svg(<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />);
const CameraIcon = () => svg(<><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".6" fill="currentColor" /></>);
const NoteIcon = () => svg(<><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>);
const PeopleIcon = () => svg(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.2a5 5 0 0 1 5.5 4.8" /></>);
