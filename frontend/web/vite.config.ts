import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

/**
 * Search engines & link previews, per environment (set by the deploy workflow):
 *  - prod (pizza-sosi): canonical pizza-sosi.co.il, indexable, sitemap.
 *  - anything else (dev): noindex everywhere, robots.txt blocks crawling.
 */
const PROJECT = process.env.FIREBASE_PROJECT_ID ?? '';
const IS_PROD = PROJECT === 'pizza-sosi';
const SITE = IS_PROD ? 'https://pizza-sosi.co.il' : 'https://pizza-sosi-dev.web.app';
const PAGES = ['/', '/terms', '/privacy', '/accessibility'];

/** Static facts about the restaurant for Google (opening hours are added at runtime from the live settings). */
const RESTAURANT = {
  '@context': 'https://schema.org',
  '@type': 'Restaurant',
  '@id': `${SITE}/#restaurant`,
  name: 'פיצה סוסי',
  alternateName: 'Pizza Sosi',
  url: `${SITE}/`,
  image: `${SITE}/social/og-image.jpg`,
  logo: `${SITE}/icons/apple-touch-icon.png`,
  telephone: '+972-54-888-0909',
  servesCuisine: ['פיצה', 'טוסטים', 'Pizza'],
  priceRange: '₪₪',
  acceptsReservations: false,
  hasMenu: `${SITE}/#menu`,
  address: { '@type': 'PostalAddress', streetAddress: 'רחוב חולון', addressLocality: 'דאלית אל-כרמל', addressCountry: 'IL' },
  geo: { '@type': 'GeoCoordinates', latitude: 32.69890, longitude: 35.05495 },
  hasMap: 'https://waze.com/ul/hsvbfj8whz',
  sameAs: [
    'https://www.instagram.com/pizza_sosi',
    'https://www.tiktok.com/@user2580740966133',
    'https://www.facebook.com/profile.php?id=61555600685159',
  ],
};

function seo(): Plugin {
  return {
    name: 'pizza-sosi-seo',
    transformIndexHtml(html) {
      const head = [
        `<link rel="canonical" href="${SITE}/" />`,
        `<meta property="og:url" content="${SITE}/" />`,
        IS_PROD ? '' : '<meta name="robots" content="noindex, nofollow" />',
        `<script type="application/ld+json">${JSON.stringify(RESTAURANT)}</script>`,
      ].join('\n    ');
      return html.replace('content="/social/og-image.jpg"', `content="${SITE}/social/og-image.jpg"`).replace('</head>', `    ${head}\n  </head>`);
    },
    generateBundle() {
      const robots = IS_PROD ? `User-agent: *\nAllow: /\nDisallow: /checkout\nDisallow: /order/\n\nSitemap: ${SITE}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n';
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
      if (IS_PROD) {
        const today = new Date().toISOString().slice(0, 10);
        const urls = PAGES.map((p) => `  <url><loc>${SITE}${p}</loc><lastmod>${today}</lastmod></url>`).join('\n');
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    seo(),
    // Older browsers too: LG/Samsung TVs (the in-store screen) run Chromium 79–87, and some phones' in-app browsers lag.
    // Code is compiled down for them and only the missing features are added, so modern phones lose nothing.
    legacy({ modernTargets: ['chrome>=79', 'safari>=13.1', 'firefox>=78', 'edge>=79', 'samsung>=12'], modernPolyfills: true, renderLegacyChunks: false }),
  ],
  // Only VITE_PUBLIC_* variables may reach the browser bundle.
  envPrefix: 'VITE_PUBLIC_',
  build: { sourcemap: false, cssTarget: ['chrome79', 'safari13.1'] },
  server: { port: 5173 },
});
