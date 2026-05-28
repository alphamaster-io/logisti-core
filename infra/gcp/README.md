# Deploying LogistiCore to Google Cloud Run

One-shot deploy script for Phase 1. Target: project `logisticore-497718`, region `asia-east1`.

## What it provisions

| Resource | Type | Why |
|---|---|---|
| `logisti-core` | Artifact Registry repo | Hosts api + web images |
| `logisti-core-db` | Cloud SQL Postgres 16 (db-f1-micro) | Application database |
| Six secrets | Secret Manager | JWT secrets + DB password + seed passwords |
| `logisti-core-run` | IAM service account | Cloud Run runtime identity (cloudsql.client + secretmanager.secretAccessor) |
| `logisti-core-api` | Cloud Run service | NestJS backend, scale-to-zero, max-instances=1 |
| `logisti-core-web` | Cloud Run service | Next.js frontend, scale-to-zero, max-instances=1 |
| `logisti-core-seed` | Cloud Run Job | Runs `prisma db seed` once |

**Not provisioned (intentional):**
- Memorystore (Redis) — api uses an in-memory fallback for login lockout + idempotency; safe at max-instances=1.
- Custom domain / SSL — Cloud Run's default `*.run.app` URLs are used. Add Cloud Run domain mapping later.
- GCS / MinIO replacement — Phase 2.
- VPC connector — not needed; Cloud SQL via Unix socket.

## Prereqs

- `gcloud` CLI installed locally
- `gcloud auth login` complete
- Billing enabled on the project
- Your account has Owner on `logisticore-497718` (or this scoped role bundle):
  - `roles/run.admin`
  - `roles/cloudsql.admin`
  - `roles/artifactregistry.admin`
  - `roles/secretmanager.admin`
  - `roles/iam.serviceAccountAdmin`
  - `roles/serviceusage.serviceUsageAdmin`
  - `roles/cloudbuild.builds.editor`

## Run it

From the repo root:

```bash
PROJECT_ID=logisticore-497718 REGION=asia-east1 bash infra/gcp/deploy.sh
```

First run takes ~10–15 min (Cloud SQL is the long pole). Subsequent runs (redeploys) take ~3–5 min.

The script is **idempotent** — re-running on an existing setup skips already-created resources and only rebuilds + redeploys images.

## Cost estimate

| Component | Idle | Active |
|---|---|---|
| Cloud SQL db-f1-micro | ~$8/mo | ~$8/mo |
| Cloud Run (api + web, scale-to-zero) | $0 | $0.000024/req-CPU-s |
| Artifact Registry | <$1/mo | <$1/mo |
| Secret Manager | <$1/mo | <$1/mo |
| Cloud Build | per build (~$0.003 each) | n/a |
| **Total at zero traffic** | **~$10/mo** | scales with usage |

## After deploy

1. **Rotate the master password.** Sign in once with `AlphabyteMaster!2026`, then change it via `/users/me`. The seed passwords are bootstrap-only.
2. **Tighten CORS.** The script sets `ALLOWED_ORIGINS` to the web URL. If you add a custom domain, append it.
3. **Watch logs:** `gcloud run services logs read logisti-core-api --region=asia-east1`.

## Redeploy

```bash
git pull
PROJECT_ID=logisticore-497718 bash infra/gcp/deploy.sh
```

That's it — script reuses existing infra and only rebuilds + rolls the two services.

## Tear down (careful)

```bash
gcloud run services delete logisti-core-api logisti-core-web --region=asia-east1 --quiet
gcloud run jobs delete logisti-core-seed --region=asia-east1 --quiet
gcloud sql instances delete logisti-core-db --quiet
gcloud artifacts repositories delete logisti-core --location=asia-east1 --quiet
# Secrets + service account: delete from console if you really want to.
```

## Phase 2+ deltas (not in this script)

- Add Memorystore (Redis Basic, ~$50/mo smallest tier) and set `REDIS_URL`. Then `--max-instances` can rise above 1.
- Custom domain + managed cert via `gcloud run domain-mappings create`.
- Replace `--allow-unauthenticated` on the API with IAP or signed JWTs from the web tier.
- BullMQ workers as a separate Cloud Run service (needs Redis).
- File upload module → GCS bucket + signed URLs.
- Promote the seed job into a migration-only job; seed only runs on demand.
