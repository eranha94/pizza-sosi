/**
 * Origins allowed to call the API (CORS), per Firebase project.
 * A browser on any other origin can't call the functions at all (App Check is enforced on top of this).
 */
const PROJECT = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? '';

const PROD_ORIGINS = [
  'https://pizza-sosi.web.app',
  'https://pizza-sosi.firebaseapp.com',
  'https://pizza-sosi-admin.web.app',
  // the new site before the domain moves (and as a fallback address)
  'https://pizza-sosi-next.web.app',
  'https://pizza-sosi-next.firebaseapp.com',
  'https://pizza-sosi.co.il',
  'https://www.pizza-sosi.co.il',
  'https://admin.pizza-sosi.co.il',
];

const DEV_ORIGINS = [
  'https://pizza-sosi-dev.web.app',
  'https://pizza-sosi-dev.firebaseapp.com',
  'https://pizza-sosi-dev-admin.web.app',
  // local development against the dev project / emulators
  /^http:\/\/localhost:\d+$/,
];

export const ALLOWED_ORIGINS: (string | RegExp)[] = PROJECT === 'pizza-sosi' ? PROD_ORIGINS : DEV_ORIGINS;
