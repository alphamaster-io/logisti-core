#!/usr/bin/env bash
# LogistiCore — first-time GCP deploy script
# ----------------------------------------------------------------------------
# Target architecture: Cloud Run (api + web) + Cloud SQL Postgres 16,
# NO Memorystore (api falls back to in-memory KV; --max-instances=1).
# Artifact Registry hosts the images, Cloud Build builds them,
# Secret Manager holds the JWT + DB secrets.
#
# Idempotent: re-running on an existing setup will skip already-created
# resources (best-effort via `|| true`). Safe to interrupt and resume.
#
# Usage:
#   PROJECT_ID=logisticore-497718 \
#   REGION=asia-east1 \
#   bash infra/gcp/deploy.sh
#
# Prereqs on your machine:
#   - gcloud installed and `gcloud auth login` done
#   - You are an Owner (or have: Cloud Run Admin, Cloud SQL Admin,
#     Artifact Registry Admin, Secret Manager Admin, Service Account Admin,
#     Service Usage Admin, IAM Admin, Cloud Build Editor) on the project
#   - Billing enabled on the project
#   - Run from the repo root: `bash infra/gcp/deploy.sh`
# ----------------------------------------------------------------------------
set -euo pipefail

# ─── Inputs ─────────────────────────────────────────────────────────────────
PROJECT_ID="${PROJECT_ID:-logisticore-497718}"
REGION="${REGION:-asia-east1}"            # asia-east1 = Taiwan, closest to HK
AR_REPO="${AR_REPO:-logisti-core}"
DB_INSTANCE="${DB_INSTANCE:-logisti-core-db}"
DB_TIER="${DB_TIER:-db-f1-micro}"         # ~$8/mo idle, fine for Phase 1
DB_NAME="${DB_NAME:-logisti_core}"
DB_USER="${DB_USER:-logisti}"
SA_NAME="${SA_NAME:-logisti-core-run}"
API_SERVICE="${API_SERVICE:-logisti-core-api}"
WEB_SERVICE="${WEB_SERVICE:-logisti-core-web}"
SEED_JOB="${SEED_JOB:-logisti-core-seed}"

SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
IMAGE_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}"
API_IMAGE="${IMAGE_BASE}/api:latest"
WEB_IMAGE="${IMAGE_BASE}/web:latest"

say() { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
ok()  { printf "\033[1;32m✓ %s\033[0m\n" "$*"; }

# ─── 0. Sanity ──────────────────────────────────────────────────────────────
say "Targeting project ${PROJECT_ID} in ${REGION}"
gcloud config set project "$PROJECT_ID" --quiet
gcloud config set run/region "$REGION" --quiet

# ─── 1. Enable APIs ─────────────────────────────────────────────────────────
say "Enabling required APIs (takes ~30s first time)"
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  iam.googleapis.com \
  cloudresourcemanager.googleapis.com \
  --quiet
ok "APIs enabled"

# ─── 2. Artifact Registry ───────────────────────────────────────────────────
say "Ensuring Artifact Registry repo '${AR_REPO}'"
gcloud artifacts repositories describe "$AR_REPO" --location "$REGION" >/dev/null 2>&1 \
  || gcloud artifacts repositories create "$AR_REPO" \
       --repository-format=docker --location="$REGION" \
       --description="LogistiCore container images" --quiet
ok "Artifact Registry ready: ${IMAGE_BASE}"

# ─── 3. Service account for Cloud Run ───────────────────────────────────────
say "Ensuring Cloud Run service account ${SA_EMAIL}"
gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1 \
  || gcloud iam service-accounts create "$SA_NAME" \
       --display-name="LogistiCore Cloud Run runtime" --quiet

# Resource-scoped bindings: cloudsql.client at the SQL instance, secretAccessor
# at each secret. This avoids needing roles/resourcemanager.projectIamAdmin on
# the deploy-time identity. (These bindings happen later in the script, once
# the resources exist.)
ok "Service account ensured"

# ─── 4. Cloud SQL Postgres 16 ───────────────────────────────────────────────
say "Ensuring Cloud SQL Postgres instance '${DB_INSTANCE}' (this can take ~5 min on first create)"
if ! gcloud sql instances describe "$DB_INSTANCE" >/dev/null 2>&1; then
  gcloud sql instances create "$DB_INSTANCE" \
    --database-version=POSTGRES_16 \
    --edition=ENTERPRISE \
    --tier="$DB_TIER" \
    --region="$REGION" \
    --storage-auto-increase \
    --backup-start-time=03:00 \
    --availability-type=zonal \
    --quiet
fi
DB_CONN=$(gcloud sql instances describe "$DB_INSTANCE" --format='value(connectionName)')
ok "Cloud SQL ready: ${DB_CONN}"

# Database + user (idempotent; the password is only generated on first create)
SECRET_NAME_DB="logisti-db-password"
if ! gcloud secrets describe "$SECRET_NAME_DB" >/dev/null 2>&1; then
  say "Generating + storing DB password in Secret Manager"
  DB_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
  printf '%s' "$DB_PASSWORD" | gcloud secrets create "$SECRET_NAME_DB" --data-file=- --quiet
  gcloud sql users create "$DB_USER" --instance="$DB_INSTANCE" --password="$DB_PASSWORD" --quiet \
    || gcloud sql users set-password "$DB_USER" --instance="$DB_INSTANCE" --password="$DB_PASSWORD" --quiet
else
  DB_PASSWORD=$(gcloud secrets versions access latest --secret="$SECRET_NAME_DB")
fi
gcloud sql databases describe "$DB_NAME" --instance="$DB_INSTANCE" >/dev/null 2>&1 \
  || gcloud sql databases create "$DB_NAME" --instance="$DB_INSTANCE" --quiet
ok "DB + user ensured"

# ─── 5. Application secrets ─────────────────────────────────────────────────
ensure_random_secret() {
  local name="$1" bytes="$2"
  if ! gcloud secrets describe "$name" >/dev/null 2>&1; then
    openssl rand -base64 "$bytes" | tr -d '\n' | gcloud secrets create "$name" --data-file=- --quiet
    ok "Created secret ${name}"
  fi
}
ensure_literal_secret() {
  local name="$1" value="$2"
  if ! gcloud secrets describe "$name" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- --quiet
    ok "Created secret ${name}"
  fi
}

say "Ensuring app secrets"
ensure_random_secret "logisti-jwt-access-secret" 48
ensure_random_secret "logisti-jwt-refresh-secret" 48
# Seed passwords are bootstrap-only — ROTATE after first login.
ensure_literal_secret "logisti-seed-master-password" "AlphabyteMaster!2026"
ensure_literal_secret "logisti-seed-admin-password" "ChangeMe!Now-2026"
ensure_literal_secret "logisti-seed-demo-password" "DemoUser!Pass-2026"

# Grant runtime SA access to each (idempotent)
for s in logisti-db-password logisti-jwt-access-secret logisti-jwt-refresh-secret \
         logisti-seed-master-password logisti-seed-admin-password logisti-seed-demo-password; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role=roles/secretmanager.secretAccessor --quiet >/dev/null
done

# ─── 6. Build + push images via Cloud Build ─────────────────────────────────
say "Building API image via Cloud Build"
gcloud builds submit \
  --config=infra/gcp/cloudbuild.api.yaml \
  --substitutions=_IMAGE="$API_IMAGE" \
  .

say "Building Web image via Cloud Build"
gcloud builds submit \
  --config=infra/gcp/cloudbuild.web.yaml \
  --substitutions=_IMAGE="$WEB_IMAGE" \
  .
ok "Images pushed"

# ─── 7. Construct DATABASE_URL for Cloud Run (Unix socket) ──────────────────
# Cloud Run mounts the Cloud SQL proxy at /cloudsql/<connection-name>.
# Prisma's URL form: postgresql://user:pass@localhost/db?host=/cloudsql/<conn>&schema=public
DATABASE_URL_ENC=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$DB_PASSWORD")
DATABASE_URL="postgresql://${DB_USER}:${DATABASE_URL_ENC}@localhost/${DB_NAME}?host=/cloudsql/${DB_CONN}&schema=public"

# ─── 8. Deploy API ──────────────────────────────────────────────────────────
say "Deploying ${API_SERVICE}"
gcloud run deploy "$API_SERVICE" \
  --image="$API_IMAGE" \
  --region="$REGION" \
  --service-account="$SA_EMAIL" \
  --add-cloudsql-instances="$DB_CONN" \
  --port=8080 \
  --memory=1Gi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=1 \
  --timeout=300 \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production,LOG_LEVEL=info,API_GLOBAL_PREFIX=api,REDIS_URL=,DATABASE_URL=${DATABASE_URL}" \
  --set-secrets="JWT_ACCESS_SECRET=logisti-jwt-access-secret:latest,JWT_REFRESH_SECRET=logisti-jwt-refresh-secret:latest" \
  --quiet

API_URL=$(gcloud run services describe "$API_SERVICE" --region="$REGION" --format='value(status.url)')
ok "API at ${API_URL}"

# ─── 9. Deploy Web (pass API URL forward) ───────────────────────────────────
say "Deploying ${WEB_SERVICE}"
gcloud run deploy "$WEB_SERVICE" \
  --image="$WEB_IMAGE" \
  --region="$REGION" \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=1 \
  --timeout=60 \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production,NEXT_PUBLIC_API_BASE_URL=${API_URL}/api/v1,API_BASE_URL=${API_URL}/api/v1" \
  --quiet

WEB_URL=$(gcloud run services describe "$WEB_SERVICE" --region="$REGION" --format='value(status.url)')
ok "Web at ${WEB_URL}"

# ─── 10. Re-deploy API with CORS pointing back at the web URL ───────────────
say "Wiring CORS: ALLOWED_ORIGINS=${WEB_URL}"
gcloud run services update "$API_SERVICE" \
  --region="$REGION" \
  --update-env-vars="ALLOWED_ORIGINS=${WEB_URL},APP_URL=${WEB_URL}" \
  --quiet

# ─── 11. One-shot seed job ──────────────────────────────────────────────────
say "Ensuring Cloud Run Job ${SEED_JOB} (runs prisma seed once)"
if ! gcloud run jobs describe "$SEED_JOB" --region="$REGION" >/dev/null 2>&1; then
  gcloud run jobs create "$SEED_JOB" \
    --image="$API_IMAGE" \
    --region="$REGION" \
    --service-account="$SA_EMAIL" \
    --set-cloudsql-instances="$DB_CONN" \
    --set-env-vars="NODE_ENV=production,DATABASE_URL=${DATABASE_URL}" \
    --set-secrets="SEED_MASTER_PASSWORD=logisti-seed-master-password:latest,SEED_ADMIN_PASSWORD=logisti-seed-admin-password:latest,SEED_DEMO_PASSWORD=logisti-seed-demo-password:latest" \
    --command="sh" \
    --args="-c,cd /app/apps/api && npx prisma db seed" \
    --max-retries=0 \
    --task-timeout=600 \
    --quiet
else
  gcloud run jobs update "$SEED_JOB" \
    --image="$API_IMAGE" \
    --region="$REGION" \
    --quiet
fi
say "Executing seed job (idempotent — Prisma seed uses upserts)"
gcloud run jobs execute "$SEED_JOB" --region="$REGION" --wait --quiet
ok "Seed complete"

# ─── 12. Final summary ──────────────────────────────────────────────────────
cat <<EOF

╭──────────────────────────────────────────────────────────────╮
│  LogistiCore deployed                                        │
├──────────────────────────────────────────────────────────────┤
│  Web:    ${WEB_URL}
│  API:    ${API_URL}
│  Health: ${API_URL}/health
│  Docs:   ${API_URL}/api/docs
├──────────────────────────────────────────────────────────────┤
│  Master login:                                               │
│    alphabyte.master@logisti-core.local                       │
│    AlphabyteMaster!2026   ← ROTATE in /users after first sign-in
╰──────────────────────────────────────────────────────────────╯

Next:
  - To redeploy code: re-run this script (it's idempotent).
  - To rotate the master password, use the /users API or run:
      printf 'NEW_PASSWORD' | gcloud secrets versions add logisti-seed-master-password --data-file=-
    then re-execute the seed job.
  - Costs: ~\$10–25/mo at zero traffic (Cloud SQL f1-micro dominates).
EOF
