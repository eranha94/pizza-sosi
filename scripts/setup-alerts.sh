#!/usr/bin/env bash
# Email alerts when the backend logs errors (orders failing, WhatsApp/payment problems…).
# One-time per project. Run in Cloud Shell:
#   bash setup-alerts.sh pizza-sosi-dev you@example.com
# At most one email per 30 minutes per problem; the incident closes itself after a day without errors.
set -euo pipefail
PROJECT="${1:?usage: setup-alerts.sh <project-id> <email>}"
EMAIL="${2:?usage: setup-alerts.sh <project-id> <email>}"

gcloud services enable monitoring.googleapis.com logging.googleapis.com --project "$PROJECT" --quiet

CHANNEL=$(gcloud beta monitoring channels list --project "$PROJECT" \
  --filter="type=email AND labels.email_address=$EMAIL" --format="value(name)" | head -n1)
if [ -z "$CHANNEL" ]; then
  CHANNEL=$(gcloud beta monitoring channels create --project "$PROJECT" \
    --display-name="Pizza Sosi alerts ($EMAIL)" --type=email \
    --channel-labels=email_address="$EMAIL" --format="value(name)")
fi
echo "✓ notification channel: $CHANNEL"

POLICY=$(mktemp)
cat > "$POLICY" <<EOF
{
  "displayName": "Pizza Sosi – backend errors",
  "documentation": { "content": "השרת של פיצה סוסי רשם שגיאה. בדקו ב-Logs Explorer (סינון: severity>=ERROR) מה קרה.", "mimeType": "text/markdown" },
  "combiner": "OR",
  "conditions": [{
    "displayName": "Error logged by a Cloud Function",
    "conditionMatchedLog": {
      "filter": "resource.type=\"cloud_run_revision\" AND severity>=ERROR"
    }
  }],
  "alertStrategy": {
    "notificationRateLimit": { "period": "1800s" },
    "autoClose": "86400s"
  },
  "notificationChannels": ["$CHANNEL"],
  "enabled": true
}
EOF

if gcloud alpha monitoring policies list --project "$PROJECT" --filter='displayName="Pizza Sosi – backend errors"' --format="value(name)" 2>/dev/null | grep -q .; then
  echo "• alert policy already exists"
else
  gcloud alpha monitoring policies create --project "$PROJECT" --policy-from-file="$POLICY" --quiet >/dev/null
  echo "✓ alert policy created – errors will be emailed to $EMAIL"
fi
rm -f "$POLICY"
