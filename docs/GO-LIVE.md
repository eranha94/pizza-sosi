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
- [ ] **תשלום:** יש מפתחות סליקה מ־PayMe, או שמחליטים לעלות קודם עם "תשלום במקום" בלבד ולהוסיף אשראי אחר כך.
- [ ] **וואטסאפ:** הוחלט מאיזה מספר שולחים, ואימות העסק ב־Meta הושלם.
- [ ] יש תמונות למנות, אלרגנים אמיתיים בתקנון וכתובת מלאה.

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
1. Firebase Console ← Hosting ← אתר **pizza-sosi-next** ← Add custom domain ← `pizza-sosi.co.il`, ואחר כך גם `www.pizza-sosi.co.il`.
2. Firebase Console ← Hosting ← אתר **pizza-sosi-admin** ← Add custom domain ← `admin.pizza-sosi.co.il`.
3. מעתיקים את הרשומות ש־Firebase מציג ל־**Cloudflare ← DNS**. **חשוב:** לבחור "DNS only" (ענן אפור), אחרת תעודת האבטחה לא תונפק. מוחקים את רשומת ה־A הישנה (`185.56.72.74`).
4. מחכים ש־Firebase מציג **Connected**. זה לוקח בין כמה דקות לכמה שעות.

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

## בשבוע הראשון
- כל יום: להסתכל על הסיכום היומי בניהול ועל מיילי ההתראות.
- כל יום: הזמנת ניסיון אחת (ולבטל אותה).
- לאסוף הערות מלקוחות ומהמטבח, ולתקן במהירות.
