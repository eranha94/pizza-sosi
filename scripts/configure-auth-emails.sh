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

patch() { # $1 = updateMask, $2 = json
  curl -sS -X PATCH \
    -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    -H "x-goog-user-project: ${PROJECT}" \
    -H "Content-Type: application/json; charset=utf-8" \
    "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config?updateMask=$1" \
    --data-binary "$2"
}
report() { python3 -c '
import json, sys
r = json.load(sys.stdin)
if "error" in r: print("✗", sys.argv[1], "-", r["error"].get("message")); sys.exit(1)
print("✓", sys.argv[1])' "$1"; }

# 1) The important part: where the link in the email leads. Always allowed.
patch notification.sendEmail.callbackUri "{\"notification\":{\"sendEmail\":{\"callbackUri\":\"${ADMIN_URL}/auth/action\"}}}" \
  | report "email links → ${ADMIN_URL}/auth/action"

# 2) Nice to have: Hebrew text. Firebase blocks template edits on some projects
#    (EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED) – then the default Hebrew text stays, which is fine.
patch notification.sendEmail.resetPasswordTemplate "$PAYLOAD" | report "Hebrew email text" \
  || echo "  (default text kept – the link still works)"
