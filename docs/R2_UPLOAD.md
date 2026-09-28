# Uploading the mirror to R2 — what is needed, and what happens next

The bucket `groove` exists. This file lists **exactly** what else the upload needs, why each item is needed, and what is done with it — so the answer to
"还需要什么凭据" is in the repository rather than in a conversation.

## 1. The credentials (3 values)

| # | value | where it comes from | why it is needed |
|---|---|---|---|
| 1 | **Account ID** | R2 → Overview, right-hand side | it forms the S3 endpoint: `https://<account-id>.r2.cloudflarestorage.com` |
| 2 | **Access Key ID** | R2 → **Manage R2 API Tokens** → Create API token | the token's public half |
| 3 | **Secret Access Key** | shown **once** when that token is created | the token's secret half |

Create the token with permission **Object Read & Write**, scoped to the single bucket **`groove`** — not account-wide. Nothing in this project needs to create or delete buckets, and a
token that cannot do so is a token whose leak costs less.

## 2. Public read access (1 value + 1 setting)

| # | value | where it comes from | why it is needed |
|---|---|---|---|
| 4 | **public base URL** | R2 → the bucket → Settings → either enable the **`r2.dev`** development URL, or bind a **custom domain** | the browser fetches samples directly, so there must be a public URL; it becomes `VITE_SAMPLE_ROOT` |
| 5 | **CORS policy** | R2 → the bucket → Settings → CORS | the app fetches with `fetch()`, so without CORS the browser blocks every sample regardless of the URL being right |

The CORS rule needs `GET` and `HEAD` allowed for the site's origin — `https://groove.wangda.today` — plus `http://localhost:5173` for development. A permissive `*` origin also works for a
public sample mirror and is simpler; the choice is a deployment decision rather than a code one.

## 3. Where the values go

* **locally**: `.env.local` (already outside version control) — `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `VITE_SAMPLE_ROOT` for the app;
* **in CI**: the same three as repository secrets, so the mirror run can upload without anyone's laptop being involved.

**None of these are ever committed**, and the upload tool takes them from the environment only.

## 4. What happens once they exist

1. the upload runs over the **1660 planned files** (1659 files + the `*silence` built-in, which is skipped because it is not a file) and compares each object's size against the
   manifest — **the manifest already carries `sha256` and `bytes` for all 1659**, which is what makes the upload verifiable rather than hopeful;
2. `VITE_SAMPLE_ROOT` is set to the public base URL, which is the one change that turns the catalogue from empty to populated — **until then the runtime catalogue stays empty by
   design, so nothing in the app can change**;
3. the manifest's `files[]` is checked against what is actually on the mirror, and any disagreement is reported by path rather than as a failed upload.
