/** Origins allowed to call the API (CORS). Update when the custom domain goes live. */
export const ALLOWED_ORIGINS = [
  'https://pizza-sosi.web.app',
  'https://pizza-sosi.firebaseapp.com',
  'https://pizza-sosi-admin.web.app',
  'https://pizza-sosi.co.il',
  'https://www.pizza-sosi.co.il',
  'https://admin.pizza-sosi.co.il',
  // local development (emulators only; App Check still applies in production)
  /^http:\/\/localhost:\d+$/,
];
