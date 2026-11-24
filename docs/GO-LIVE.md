# תוכנית עלייה לאוויר – פיצה סוסי

המטרה: לעבור מהאתר הישן (pizza-sosi.web.app) לאתר החדש על **pizza-sosi.co.il**, בלי הפתעות ועם דרך חזרה בכל שלב.

- **שלב א׳ – הכנות:** אפשר לעשות בכל יום ובכל שעה. לא משפיע על האתר הישן ולא על לקוחות.
- **שלב ב׳ – יום המעבר:** כשעה, כשהפיצרייה **סגורה**.
- כל הפקודות רצות ב־**Cloud Shell** (console.cloud.google.com, הכפתור `>_` למעלה) מתוך התיקייה `~/sosi-migrate`. הסקריפטים נמצאים בתיקייה `scripts/` בקוד. בכל שלב אעביר אותם כפקודה מוכנה להעתקה, אז אין צורך להוריד את הקוד ל־Cloud Shell.
- **מפתחות וסיסמאות לא שולחים בצ'אט.** הם נשמרים רק דרך הפקודות (בכספת של Google).

---

## שלב א׳ – הכנות

### א1. תנאים מוקדמים
- [ ] ה־PR האחרון מוזג ל־`main`, וכל הבדיקות האוטומטיות ירוקות.
- [ ] הדומיין `pizza-sosi.co.il` במצב **Active** ב־Cloudflare.
- [x] **תשלום:** עולים קודם עם "תשלום במקום". האפשרות "אשראי אונליין" מוצגת באפור עם "בקרוב" עד ש־PayMe יחוברו (`frontend/web/src/config/payments.ts`). ישראכרט ו־PayMe צריכים לראות את האתר חי לפני שהם פותחים גישה.
- [ ] **וואטסאפ:** הוחלט מאיזה מספר שולחים, ואימות העסק ב־Meta הושלם.
- [ ] יש כתובת מלאה של העסק (חובה לבדיקה של חברת האשראי), אלרגנים אמיתיים בתקנון ותמונות למנות.

### א2. חיבור GitHub לפרויקט החי (פעם אחת)
מעתיק מסביבת הבדיקות את ההגדרות שכבר עובדות. לא משנה כלום בסביבת הבדיקות ולא מעלה כלום לאוויר.
```bash
bash clone-gcp-setup.sh pizza-sosi-dev pizza-sosi
```
בסוף הסקריפט מודפסים 4 ערכים. מכניסים אותם ב־GitHub ← Settings ← Environments ← **prod** ← Variables.

### א3. מפתח הגנה מרובוטים (reCAPTCHA) לדומיין החי
1. Google Cloud ← פרויקט `pizza-sosi` ← **Security ← reCAPTCHA** ← Create key ← Website.
2. דומיינים: `pizza-sosi.co.il`, `www.pizza-sosi.co.il`, `admin.pizza-sosi.co.il`, `pizza-sosi-next.web.app`, `pizza-sosi-admin.web.app`.
3. את ה־Site key (לא סודי) מכניסים ב־GitHub ← prod ← `RECAPTCHA_ENTERPRISE_KEY`.
4. Firebase Console ← App Check ← רושמים את אפליקציית האתר עם המפתח הזה.

### א4. כניסה לניהול בפרויקט החי
1. Firebase Console ← `pizza-sosi` ← **Authentication ← Get started**.
2. Sign-in method: להפעיל **Email/Password** ו־**Anonymous**. Anonymous משמש להזמנות של אורחים.
3. **Settings ← Authorized domains:** להוסיף `pizza-sosi.co.il`, `www.pizza-sosi.co.il`, `admin.pizza-sosi.co.il`.
4. להפעיל אימות דו־שלבי (TOTP):
```bash
curl -sS -X PATCH -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "x-goog-user-project: pizza-sosi" -H "Content-Type: application/json" \
  "https://identitytoolkit.googleapis.com/admin/v2/projects/pizza-sosi/config?updateMask=mfa" \
  -d '{"mfa":{"providerConfigs":[{"state":"ENABLED","totpProviderConfig":{"adjacentIntervals":5}}]}}' | grep -o '"state": "[A-Z]*"'
```

### א5. אתר הניהול החי
Firebase Console ← Hosting ← **Add another site** ← `pizza-sosi-admin`. האתר החדש עצמו יעלה ל־`pizza-sosi-next`. האתר הישן ממשיך לעבוד כרגיל עד יום המעבר.

### א5א. קישור אפליקציות האינטרנט לאתרים (חובה)
Firebase Console ← ⚙️ Project settings ← General ← Your apps:
- אפליקציית אינטרנט אחת (למשל `pizza_menu (web)`) ← **Firebase Hosting** ← **Link** ← `pizza-sosi-next`.
- אפליקציית אינטרנט אחרת (למשל `pizza-menu-react`) ← **Link** ← `pizza-sosi-admin`.
בלי הקישור, הקובץ `/__/firebase/init.json` לא כולל `appId`, ו־App Check נכשל (`apps/undefined`). כתוצאה מזה אי אפשר לשלוח הזמנה ואי אפשר להתחבר לניהול.

### א6. העלאת האתר החדש (בלי השרת)
GitHub ← Actions ← **Deploy frontend** ← Run workflow ← target: **prod** ← אישור.
כך האתר החדש עולה לכתובת `pizza-sosi-next.web.app`, ואפשר לבדוק אותו. **השרת והחוקים עדיין לא עולים**, כדי שהאתר הישן ימשיך לעבוד.

### א7. מיילים (אחרי שהדומיין פעיל)
1. resend.com ← Domains ← `pizza-sosi.co.il` ← מוסיפים את הרשומות ב־Cloudflare (DNS only) ← Verify.
2. API Keys ← יוצרים מפתח עם הרשאת "Sending access" ושומרים אותו בכספת:
```bash
read -s -p "מפתח Resend: " K && echo && printf "%s" "$K" | gcloud secrets create RESEND_API_KEY --project pizza-sosi --data-file=- ; unset K
gcloud secrets add-iam-policy-binding RESEND_API_KEY --project pizza-sosi --member=serviceAccount:$(gcloud projects describe pizza-sosi --format='value(projectNumber)')-compute@developer.gserviceaccount.com --role=roles/secretmanager.secretAccessor
```
3. את ההפעלה עושים ביום המעבר (ב5).

### א8. וואטסאפ לפרויקט החי
אותו תהליך שעשינו בסביבת הבדיקות: מפתח קבוע של משתמש מערכת ← כספת (`WHATSAPP_TOKEN` בפרויקט `pizza-sosi`) ← `whatsapp-setup.mjs` עם מזהי המספר החי והכתובת `https://pizza-sosi.co.il`. התבניות צריכות אישור של Meta, ולכן כדאי לעשות את זה כמה ימים מראש.

### א8א. וואטסאפ מהמספר הקיים של הפיצרייה (Telnyx + Coexistence)
מאז מרץ 2025 מטא מאפשרת לחבר ל-API מספר שכבר פעיל באפליקציית וואטסאפ ביזנס, והאפליקציה ממשיכה לעבוד בטלפון. החיבור עובר דרך Telnyx (תשלום רק לפי שימוש, בלי מנוי).
1. חשבון ב-Telnyx וקרדיט קטן. וואטסאפ ביזנס בטלפון של הפיצרייה מעודכן לגרסה 2.24.17 ומעלה.
2. ב-Telnyx: Messaging → WhatsApp → Business Accounts → Add Account, לסמן **Enable WhatsApp Business App coexistence**, ולהשלים את תהליך מטא (הקוד מגיע לאפליקציה בטלפון). את הסנכרון חייבים להשלים תוך 24 שעות.
3. מפתח API של Telnyx לכספת:
```bash
read -s -p "מפתח Telnyx: " K && echo && printf "%s" "$K" | gcloud secrets create TELNYX_API_KEY --project pizza-sosi --data-file=- ; unset K
gcloud secrets add-iam-policy-binding TELNYX_API_KEY --project pizza-sosi --member=serviceAccount:$(gcloud projects describe pizza-sosi --format='value(projectNumber)')-compute@developer.gserviceaccount.com --role=roles/secretmanager.secretAccessor
```
4. תבניות ואז הפעלה – `scripts/telnyx-whatsapp-setup.mjs` (`--templates`, `--status`, `--enable`; ההוראות בראש הקובץ).
לחזרה לשליחה ישירה דרך מטא: `provider: 'meta'` ב-`settings/whatsapp`.

### א9. התראות על שגיאות
```bash
bash setup-alerts.sh pizza-sosi 3eran19941@gmail.com
```

---

## שלב ב׳ – יום המעבר (כשעה, כשהפיצרייה סגורה)

> ⚠️ **מרגע שלב ב2 האתר הישן והניהול הישן מפסיקים לעבוד.** לכן קודם מוודאים ששלב א׳ הושלם, ושהאתר ב־`pizza-sosi-next.web.app` נראה תקין.

### ב1. העתקת התפריט וההגדרות מסביבת הבדיקות
כל מה שערכת בניהול של סביבת הבדיקות (מנות, תוספות, תגיות, שעות, אזורי משלוח) עובר לאתר החי:
```bash
node copy-menu.mjs --from pizza-sosi-dev --to pizza-sosi           # קודם בדיקה – מה יועתק
node copy-menu.mjs --from pizza-sosi-dev --to pizza-sosi --write
gsutil -m cp -r gs://pizza-sosi-dev.firebasestorage.app/menu_images gs://pizza-sosi-dev.firebasestorage.app/menu_thumbs gs://pizza-sosi.firebasestorage.app/
```

### ב2. העלאת השרת לפרויקט החי (זה רגע המעבר)
GitHub ← Actions ← **Deploy backend** ← target: **prod** ← אישור.
העלאה זו מפעילה את השרת החדש ואת חוקי האבטחה החדשים, וסוגרת את סיסמת הניהול הישנה.

### ב3. חשבון בעלים בניהול החי
```bash
node set-staff-role.mjs --project pizza-sosi --email <המייל של הבעלים> --role owner
```
אחר כך נכנסים ל־`admin.pizza-sosi.co.il` (או `pizza-sosi-admin.web.app`) ← "שכחתי סיסמה" ← מייל ← בוחרים סיסמה ← סורקים QR באפליקציית האימות.
עובד נוסף: אותה פקודה עם `--role staff`. עובד כזה רואה הזמנות ושעות ויכול לסמן "נגמר", אבל לא יכול לערוך את התפריט.

### ב4. חיבור הדומיין
**איך זה בנוי:**

| כתובת | מה מוצג | אתר ב־Firebase |
|---|---|---|
| `pizza-sosi.co.il` | האתר ללקוחות | `pizza-sosi-next` |
| `www.pizza-sosi.co.il` | הפניה אוטומטית ל־`pizza-sosi.co.il` | `pizza-sosi-next` |
| `admin.pizza-sosi.co.il` | דף הניהול | `pizza-sosi-admin` |

**1. ב־Firebase** (Console ← פרויקט `pizza-sosi` ← Hosting):
- באתר **pizza-sosi-next** ← **Add custom domain** ← `pizza-sosi.co.il` ← Continue. Firebase מציג רשומות: TXT לאימות ורשומות A או AAAA.
- שוב **Add custom domain** ← `www.pizza-sosi.co.il` ← מסמנים **Redirect to an existing website** ← `pizza-sosi.co.il`.
- באתר **pizza-sosi-admin** ← **Add custom domain** ← `admin.pizza-sosi.co.il`.

**2. ב־Cloudflare** (pizza-sosi.co.il ← DNS ← Records):
- **מוחקים** את רשומת ה־A הישנה (`185.56.72.74`) ואת ה־CNAME הישן של `www`.
- **מוסיפים** בדיוק את מה ש־Firebase הציג: Name `@` לדומיין הראשי, `www`, ו־`admin`.
- **בכל רשומה: Proxy status = DNS only** (ענן אפור). זה חובה, אחרת Firebase לא יכול להנפיק תעודת אבטחה.
- **לא נוגעים** ברשומות המייל: שלוש רשומות ה־MX של `route1/2/3.mx.cloudflare.net`, ה־TXT שמתחיל ב־`v=spf1`, וה־TXT של `cf2024-1._domainkey`. שם TXT לאימות של Firebase נוסף לצידן ולא במקומן.
- ב־Cloudflare ← **SSL/TLS** ← Overview: מצב **Full (strict)**. זה רלוונטי רק אם אחת הרשומות תעבור בעתיד ל־Proxied.

**3. מחכים** ש־Firebase מציג **Connected** בכל שלוש הכתובות. זה לוקח בין כמה דקות לכמה שעות.

**4. בודקים** שכל אחת מהכתובות נפתחת עם מנעול:
`https://pizza-sosi.co.il`, `https://www.pizza-sosi.co.il` (אמור לעבור לכתובת הראשית), ו־`https://admin.pizza-sosi.co.il`.

> 💡 את `admin.pizza-sosi.co.il` אפשר לחבר כבר בשלב א׳, אחרי א5. הכתובת לא בשימוש, ולכן אין סיכון, ותעודת האבטחה תהיה מוכנה מראש. את הדומיין הראשי ואת `www` מחברים רק ביום המעבר.

### ב5. הפעלת המיילים
```bash
node setup-email.mjs --project pizza-sosi --site https://pizza-sosi.co.il --admin https://admin.pizza-sosi.co.il \
  --from "פיצה סוסי <orders@pizza-sosi.co.il>" --reply-to support@pizza-sosi.co.il
```

### ב6. בדיקה מלאה לפני שפותחים
- [ ] האתר נפתח ב־`https://pizza-sosi.co.il` עם מנעול, והתפריט, התמונות והשעות נכונים.
- [ ] הזמנת ניסיון עם תשלום במקום: מגיע מייל אישור, וההזמנה מופיעה בניהול עם צליל.
- [ ] מעבירים את ההזמנה בין השלבים בניהול: הסטטוס מתעדכן אצל הלקוח, ואם וואטסאפ פעיל, מגיעות הודעות.
- [ ] מבטלים את הזמנת הניסיון: מגיע מייל ביטול.
- [ ] אם יש אשראי: עסקת בדיקה קטנה וזיכוי שלה.
- [ ] "שכחתי סיסמה" בניהול: מגיע מייל עם קישור שעובד.

### ב7. אחרי שהכל תקין
- האתר הישן `pizza-sosi.web.app`: להפנות אותו לכתובת החדשה, כדי שמי ששמר את הכתובת הישנה יגיע לאתר החדש.
- לעדכן את הקישור לאתר באינסטגרם, בפייסבוק, בגוגל ובוואטסאפ ביזנס.

---

## דרך חזרה, אם משהו לא עובד

| מה | איך חוזרים |
|---|---|
| האתר החדש לא תקין | Firebase Console ← Hosting ← pizza-sosi-next ← Release history ← **Rollback** לגרסה הקודמת |
| צריך את האתר הישן מיד | ב־Cloudflare מחזירים את רשומת `A` ל־`185.56.72.74`, או משאירים ללקוחות את `pizza-sosi.web.app`, שלא נגעו בו |
| הניהול הישן נחוץ | Firebase Console ← Firestore ← Rules ← היסטוריה ← משחזרים את החוקים הקודמים (וגם ב־Storage ← Rules) |
| מיילים שולחים משהו לא נכון | `node setup-email.mjs --project pizza-sosi --off` |
| וואטסאפ שולח משהו לא נכון | בניהול ← "שעות ופתיחה" ← מכבים את כל המתגים של הודעות וואטסאפ |

## תקלות שהיו בהעלאה הראשונה לפרויקט החי (ואיך פתרנו)
| תקלה | פתרון |
|---|---|
| העלאת השרת נכשלה על הרשאות של "service agents" | `clone-gcp-setup.sh` מוסיף אותן עכשיו בעצמו |
| הפונקציות נכשלו בהעלאה הראשונה (409 על bucket, Eventarc) | פשוט מריצים שוב את ההעלאה אחרי כמה דקות |
| App Check: `apps/undefined` | מקשרים אפליקציית אינטרנט לכל אתר (א5א) |
| הזמנה נכשלה: "The request was not authenticated" | הפונקציות נוצרו בלי הרשאת קריאה ציבורית. מוסיפים `allUsers` ← `roles/run.invoker` לכל פונקציה מסוג callable. ההגנה נשארת בקוד: App Check, התחברות והרשאות |

## בשבוע הראשון
- כל יום: להסתכל על הסיכום היומי בניהול ועל מיילי ההתראות.
- כל יום: הזמנת ניסיון אחת (ולבטל אותה).
- לאסוף הערות מלקוחות ומהמטבח, ולתקן במהירות.
