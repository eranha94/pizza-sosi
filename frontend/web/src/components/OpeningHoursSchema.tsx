import { useEffect } from 'react';
import { useStoreSettings } from '../lib/menu';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Adds the live weekly opening hours to the restaurant info Google reads (kept in sync with the admin). */
export function OpeningHoursSchema() {
  const { data } = useStoreSettings();
  useEffect(() => {
    if (!data) return;
    const spec = data.weeklyHours.flatMap((d, i) =>
      d ? [{ '@type': 'OpeningHoursSpecification', dayOfWeek: `https://schema.org/${DAYS[i]}`, opens: d.open, closes: d.close }] : [],
    );
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = 'ld-hours';
    el.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      '@id': `${location.origin}/#restaurant`,
      openingHoursSpecification: spec,
    });
    document.getElementById('ld-hours')?.remove();
    document.head.appendChild(el);
  }, [data]);
  return null;
}
