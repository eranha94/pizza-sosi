# פיצה סוסי – אתר הזמנות

אתר הזמנות לפיצה סוסי: תפריט, סל, הזמנה כאורח, תשלום במקום או באשראי (בדף מאובטח של חברת הסליקה), ודף ניהול לצוות.

## המבנה

```
frontend/   ← רץ בדפדפן. בלי סודות ובלי החלטות מחייבות
  web/        אתר הלקוחות (React + Vite)
  admin/      דף הניהול – אפליקציה נפרדת
backend/    ← רץ בשרת. הדפדפן לא רואה ממנו כלום
  functions/  Cloud Functions: API, מחיר, הזמנות, סליקה, מיילים, הרשאות
  firebase/   כללי אבטחה של Firestore ו-Storage
contracts/  ← החיבור היחיד בין הצדדים: מבנה הבקשות והתשובות + בדיקת קלט
scripts/    כלים ידניים: מעבר תפריט, הגדרת צוות, בדיקת הבנייה
tests/      בדיקות כללי האבטחה (על אמולטור)
```

הכללים המלאים והבדיקות האוטומטיות שאוכפות אותם: [SECURITY.md](SECURITY.md).

## פיתוח מקומי

דרישות: Node 24, pnpm 10, Java 21 (לאמולטורים).

```bash
pnpm install
cp frontend/web/.env.example frontend/web/.env      # ערכים ציבוריים בלבד
pnpm dev:web                                         # http://localhost:5173
pnpm dev:admin                                       # http://localhost:5174
```

בדיקות:

```bash
pnpm lint          # כולל חסימת ייבוא מ-backend ל-frontend
pnpm typecheck
pnpm test          # בדיקות יחידה: מחיר, מצבי הזמנה, שעות פתיחה
pnpm test:rules    # כללי האבטחה על אמולטור Firestore
pnpm build:frontend  # בנייה + סריקה שאין קוד שרת או סודות בבנייה
```

## פריסה

- `deploy-frontend.yml` פורס רק Hosting, `deploy-backend.yml` רק Functions וכללים.
- ב-push ל-main הפריסה הולכת לפרויקט הבדיקות (`pizza-sosi-dev`). פריסה ל-`pizza-sosi` (prod) רק ידנית, באישור.
- ההתחברות ל-Google Cloud בלי קובצי מפתח (Workload Identity Federation). המשתנים מוגדרים ב-GitHub Environments: `FIREBASE_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT_FRONTEND`, `GCP_DEPLOY_SERVICE_ACCOUNT_BACKEND`, `RECAPTCHA_ENTERPRISE_KEY`.
- האתר החדש נפרס לאתר Hosting חדש (`pizza-sosi-next`). האתר הקיים `pizza-sosi.web.app` לא נוגעים בו עד המעבר.

## לפני מעבר לאוויר

1. ליצור את פרויקט `pizza-sosi-dev` ולהגדיר את GitHub Environments (`dev`, `prod` עם אישור ידני).
2. להפעיל App Check עם reCAPTCHA Enterprise, Identity Platform (בשביל MFA לצוות), וכלל TTL על `rateLimits.expireAt`.
3. להעביר את התפריט: `node scripts/migrate-menu.mjs --project pizza-sosi-dev` (ריצת ניסיון), ואז עם `--write`.
4. להגדיר צוות: `node scripts/set-staff-role.mjs --project ... --email ... --role owner`.
5. לחבר ספק סליקה (`backend/functions/src/payments/provider.ts`) וספק מיילים, עם מפתחות ב-Secret Manager בלבד.
6. לפרוס את כללי האבטחה החדשים. **זה סוגר גם את סיסמת הניהול החשופה של האתר הישן**, ולכן עושים את זה רק ביום המעבר.
7. לעבור על רשימת OWASP ASVS (רמה 2).
