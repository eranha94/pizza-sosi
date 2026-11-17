#!/usr/bin/env bash
# Prepare the live project (pizza-sosi) for keyless GitHub deploys, by copying what already works on dev:
#  - the same enabled Google APIs
#  - the deploy service accounts with the same project roles
#  - the GitHub Workload Identity pool + provider (same settings), allowed only for this repo
# Safe to run more than once. Changes nothing on dev. Does NOT deploy anything.
#   bash clone-gcp-setup.sh pizza-sosi-dev pizza-sosi
set -euo pipefail
FROM="${1:?usage: clone-gcp-setup.sh <from-project> <to-project>}"
TO="${2:?usage: clone-gcp-setup.sh <from-project> <to-project>}"
REPO="eranha94/pizza-sosi"
POOL=github
PROVIDER=pizza-sosi
TO_NUM=$(gcloud projects describe "$TO" --format='value(projectNumber)')

echo "== APIs"
gcloud services list --enabled --project "$FROM" --format='value(config.name)' | sort > /tmp/apis-from
gcloud services list --enabled --project "$TO" --format='value(config.name)' | sort > /tmp/apis-to
MISSING=$(comm -23 /tmp/apis-from /tmp/apis-to | tr '\n' ' ')
if [ -n "$MISSING" ]; then gcloud services enable $MISSING --project "$TO" --quiet; fi
echo "✓ APIs match dev"

for NAME in deploy-frontend deploy-backend; do
  echo "== service account $NAME"
  SA="$NAME@$TO.iam.gserviceaccount.com"
  gcloud iam service-accounts describe "$SA" --project "$TO" >/dev/null 2>&1 \
    || gcloud iam service-accounts create "$NAME" --project "$TO" --display-name="GitHub $NAME" --quiet
  ROLES=$(gcloud projects get-iam-policy "$FROM" --flatten='bindings[].members' \
    --filter="bindings.members:serviceAccount:$NAME@$FROM.iam.gserviceaccount.com" --format='value(bindings.role)')
  for R in $ROLES; do
    gcloud projects add-iam-policy-binding "$TO" --member="serviceAccount:$SA" --role="$R" --condition=None --quiet >/dev/null
    echo "  + $R"
  done
done

echo "== backend may deploy functions that run as the default runtime accounts"
for RUNTIME in "$TO_NUM-compute@developer.gserviceaccount.com" "$TO@appspot.gserviceaccount.com"; do
  if gcloud iam service-accounts describe "$RUNTIME" --project "$TO" >/dev/null 2>&1; then
    gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" --project "$TO" \
      --member="serviceAccount:deploy-backend@$TO.iam.gserviceaccount.com" --role=roles/iam.serviceAccountUser --quiet >/dev/null
    echo "  ✓ actAs $RUNTIME"
  fi
done

echo "== Workload Identity (GitHub → Google, no keys)"
gcloud iam workload-identity-pools describe "$POOL" --project "$TO" --location=global >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools create "$POOL" --project "$TO" --location=global --display-name="GitHub" --quiet
if ! gcloud iam workload-identity-pools providers describe "$PROVIDER" --project "$TO" --location=global --workload-identity-pool="$POOL" >/dev/null 2>&1; then
  MAPPING=$(gcloud iam workload-identity-pools providers describe "$PROVIDER" --project "$FROM" --location=global --workload-identity-pool="$POOL" \
    --format='json(attributeMapping)' | python3 -c 'import json,sys; m=json.load(sys.stdin)["attributeMapping"]; print(",".join(f"{k}={v}" for k,v in m.items()))')
  CONDITION=$(gcloud iam workload-identity-pools providers describe "$PROVIDER" --project "$FROM" --location=global --workload-identity-pool="$POOL" --format='value(attributeCondition)')
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --project "$TO" --location=global --workload-identity-pool="$POOL" \
    --issuer-uri="https://token.actions.githubusercontent.com" --attribute-mapping="$MAPPING" --attribute-condition="$CONDITION" --quiet
fi
for NAME in deploy-frontend deploy-backend; do
  gcloud iam service-accounts add-iam-policy-binding "$NAME@$TO.iam.gserviceaccount.com" --project "$TO" \
    --role=roles/iam.workloadIdentityUser \
    --member="principalSet://iam.googleapis.com/projects/$TO_NUM/locations/global/workloadIdentityPools/$POOL/attribute.repository/$REPO" --quiet >/dev/null
done
echo "✓ GitHub ($REPO) can deploy to $TO"

cat <<EOF

GitHub → Settings → Environments → prod → Variables:
  FIREBASE_PROJECT_ID                    = $TO
  GCP_WORKLOAD_IDENTITY_PROVIDER         = projects/$TO_NUM/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER
  GCP_DEPLOY_SERVICE_ACCOUNT_FRONTEND    = deploy-frontend@$TO.iam.gserviceaccount.com
  GCP_DEPLOY_SERVICE_ACCOUNT_BACKEND     = deploy-backend@$TO.iam.gserviceaccount.com
  RECAPTCHA_ENTERPRISE_KEY               = (the site key created for the live domains)
EOF
