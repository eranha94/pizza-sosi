#!/usr/bin/env bash
# One-time per project (dev, then prod at go-live): makes the Firebase Auth emails work properly.
#  - links in the emails open our own Hebrew page on the admin site (/auth/action) instead of
#    the default Firebase page (which breaks when the project has no linked web API key)
#  - Hebrew sender name, subject and body for the password email
# Run in Cloud Shell:  bash configure-auth-emails.sh pizza-sosi-dev https://pizza-sosi-dev-admin.web.app
set -euo pipefail
PROJECT="${1:?usage: configure-auth-emails.sh <project-id> <admin-site-url>}"
ADMIN_URL="${2:?usage: configure-auth-emails.sh <project-id> <admin-site-url>}"
ADMIN_URL="${ADMIN_URL%/}"

BODY='<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#1e1a1b"><p>שלום,</p><p>התקבלה בקשה לבחור סיסמה לחשבון הניהול של פיצה סוסי (%EMAIL%).</p><p><a href="%LINK%" style="display:inline-block;background:#feb800;color:#1e1a1b;padding:12px 24px;border-radius:999px;font-weight:bold;text-decoration:none">לבחירת סיסמה</a></p><p style="color:#6b6466;font-size:14px">הקישור חד-פעמי ובתוקף לשעה. אם לא ביקשת – אפשר להתעלם מהמייל הזה.</p></div>'

PAYLOAD=$(python3 - "$ADMIN_URL" "$BODY" <<'PY'
import json, sys
url, body = sys.argv[1], sys.argv[2]
print(json.dumps({"notification": {"sendEmail": {
  "callbackUri": f"{url}/auth/action",
  "resetPasswordTemplate": {"senderDisplayName": "פיצה סוסי", "subject": "בחירת סיסמה לניהול פיצה סוסי", "bodyFormat": "HTML", "body": body},
}}}, ensure_ascii=False))
PY
)

RESP=$(curl -sS -X PATCH \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "x-goog-user-project: ${PROJECT}" \
  -H "Content-Type: application/json; charset=utf-8" \
  "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config?updateMask=notification.sendEmail.callbackUri,notification.sendEmail.resetPasswordTemplate" \
  --data-binary "$PAYLOAD")

if echo "$RESP" | grep -q '"error"'; then
  echo "✗ failed:"; echo "$RESP" | python3 -c 'import json,sys; e=json.load(sys.stdin)["error"]; print(e.get("status"), e.get("message"))'
  exit 1
fi
echo "$RESP" | python3 -c '
import json, sys
s = json.load(sys.stdin)["notification"]["sendEmail"]
print("✓ link page :", s.get("callbackUri"))
print("✓ subject   :", s.get("resetPasswordTemplate", {}).get("subject"))'
