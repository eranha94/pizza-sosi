import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';
import { BUSINESS } from '../../config/business';

export const LEGAL_PAGES = [
  { path: '/terms', label: 'תקנון האתר' },
  { path: '/privacy', label: 'מדיניות פרטיות' },
  { path: '/accessibility', label: 'הצהרת נגישות' },
] as const;

/** Shared frame for the legal pages: title, update date, table of contents, links to the other pages. */
export function LegalLayout({ title, sections, children }: { title: string; sections: { id: string; title: string }[]; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} – ${BUSINESS.name}`;
    window.scrollTo(0, 0);
    return () => {
      document.title = BUSINESS.name;
    };
  }, [title]);
  return (
    <article className="page legal">
      <header className="legal__head">
        <h1>{title}</h1>
        <p className="muted small">עודכן לאחרונה: {BUSINESS.legalUpdated}</p>
      </header>
      <nav className="legal__toc" aria-label="תוכן העניינים">
        <ol>
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`}>{s.title}</a>
            </li>
          ))}
        </ol>
      </nav>
      {children}
      <footer className="legal__foot">
        <p className="muted small">
          {BUSINESS.name} · {BUSINESS.legalType} {BUSINESS.id} · {BUSINESS.city} · טלפון{' '}
          <a href={`tel:${BUSINESS.phone}`} dir="ltr">{BUSINESS.phone}</a> ·{' '}
          <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
        </p>
        <nav className="legal__others" aria-label="מסמכים נוספים">
          {LEGAL_PAGES.filter((p) => p.label !== title).map((p) => (
            <Link key={p.path} to={p.path}>{p.label}</Link>
          ))}
        </nav>
      </footer>
    </article>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="legal__section" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{title}</h2>
      {children}
    </section>
  );
}
