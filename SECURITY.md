# Security

## The Backend/Frontend wall

- `frontend/` runs in the browser. It holds no secrets and makes no binding decisions.
- `backend/` runs on Google Cloud. Prices, order state, permissions, payments and emails are decided only here.
- `contracts/` is the only shared code: request/response shapes and input validation. No logic, no database access, no secrets.

Enforced automatically:
| Check | Where |
|---|---|
| Frontend cannot import backend code or server SDKs | `eslint.config.js` (`pnpm lint`) |
| Built bundles scanned for server code, keys, source maps | `scripts/check-frontend-bundle.mjs` |
| Only `VITE_PUBLIC_*` env vars reach the browser | `vite.config.ts` (`envPrefix`) |
| Secrets blocked from git | gitleaks in CI + GitHub push protection |
| Browser can only read public/own data; all writes server-only | `backend/firebase/firestore.rules` + tests in `tests/rules` |
| Separate deploys with least privilege, no stored keys | `.github/workflows/deploy-*.yml` (Workload Identity Federation) |

## Rules

- Never put a key, password or token in the code, in git, in chat or in WhatsApp. Secrets go to Google Secret Manager.
- Card data never touches our servers (hosted payment page, PCI DSS SAQ A).
- Every API call: App Check + signed-in user (guests are anonymous users) + input validated against `contracts`.
- Staff actions: role claim (`owner`/`staff`) **and** MFA, checked on the server for every call.

## Reporting

Found a problem? Contact the repository owner directly. Do not open a public issue.
