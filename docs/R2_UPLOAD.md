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

## 5. `VITE_SAMPLE_ROOT`：放在哪、什么格式（2026-09-28，读完代码后的确切答案）

### 格式（一行，无引号，末尾不要斜杠）

```
VITE_SAMPLE_ROOT=https://<你的公开域名>
```

* **不要引号** ✓、**不要 `export`** ✓ —— `.env` 语法就是 `KEY=value` ✓；
* **末尾斜杠可以不带** ✓ —— 代码会剥掉它（`root.replace(/\/$/, "")` ✓），**带了也对** ✓；
* ⭐ **它必须指向"桶的公开根"** ✓ —— 也就是 **`prefix` 所在的那一层** ✓：清单里 `virtuosity-drums-basic` 的 `prefix` 是 `virtuosity-drums` ✓、`sfz` 是 `Programs/01-basic-kit.sfz` ✓，所以最终 URL 是

```
https://<你的公开域名>/virtuosity-drums/Programs/01-basic-kit.sfz
```

### 放在哪（**这里有一个陷阱** ⚠️）

| 用途 | 放哪 |
|---|---|
| **本机开发** | `.env.local` ✓（**已被 gitignore** ✓ —— `.gitignore:44 .env.*` ✓） |
| ⚠️ **线上部署** | ⭐ **必须放进"构建时"的环境** ✗✓ —— **不能只放 `.env.local`** |

⭐ **原因**：Vite 把 `VITE_*` **在构建时内联进产物** ✓ —— 所以**部署包里的值是构建那一刻的值** ✓。而 `.env.local` **被忽略、CI 看不到它** ✓ → **只放那里，线上就是空的** ✗✓。

三种可选做法（按侵入性排序 ✓）：

1. ⭐ **Cloudflare Pages 的环境变量**（如果部署在 Pages 上构建 ✓ —— `.env` 里有 `CLOUDFLARE_API_TOKEN` ✓，看起来是 ✓）：Settings → Environment variables → 加 `VITE_SAMPLE_ROOT` ✓；
2. **GitHub Action 的构建步骤** ✓：仓库 variable/secret + 给 `npm run build` 那一步加 `env:` ✓；
3. **提交一个 `.env.production`** ✓（最简单 ✓，代价是这个公开 URL 进仓库 ✓ —— **而它本来就是公开地址** ✓，所以这个代价可以接受 ✓）。

⭐ 现在**任何 workflow 里都没有 `VITE_`** ✗（已查 ✓）→ 所以**线上构建目前拿不到它** ✓，第 1/2/3 条必须选一条 ✓。

### 清单在哪（**两者故意不同源** ✓）

* **清单**：`/samples/manifest.json` ✓ —— 由本仓库发布 ✓（`public/samples/manifest.json` ✓，347 KB ✓）；
* **采样字节**：R2 ✓。

⭐ 这正是既定的托管决定 ✓：**仓库里是清单，R2 上是字节** ✓✓ —— 所以**清单里的 `sha256`/`bytes` 才能用来核对 R2 上的东西** ✓。

### ⭐ 设好之后怎么验（一条命令 ✓）

```
curl -sI https://<你的公开域名>/virtuosity-drums/Programs/01-basic-kit.sfz | head -3
```

⭐ **要看到 `200` 与一个 `content-length`** ✓ —— ⚠️ 而**如果看到 `403`**，那说明桶的公开访问没打开 ✓（或 CORS/域名没绑对 ✓），**而不是路径写错了** ✓。

## 6. 已验过的三件事（2026-09-28，业主设好 `.env.local` 与 `gh secret set` 之后）

### ① `VITE_SAMPLE_ROOT` 的格式与生效 ✅

`.env.local` 里是 `VITE_SAMPLE_ROOT=https://r2mirror.groove.wangda.today` ✓ —— 自定义域 ✓、无末尾斜杠 ✓、**格式正确** ✓。

⭐ 而**它确实生效** ✓✓：`npx vite build` 之后，**产物里能搜到这个域名** ✓（`dist/assets/StudioView-*.js` ✓）—— 所以**本地部署这条路已经拿到了 root** ✓。

⚠️ 而 `gh secret set` **目前没有任何 workflow 引用它** ✓（部署是本地 `node scripts/deploy.mjs` ✓，`.github/workflows/` 里只有 `ci.yml`/`manual-verify.yml`/`voice-sweep.yml` ✓，没有一个用 `VITE_` ✓）→ ⭐ **无害，但也没起作用** ✓。**如果将来改成在 CI 里构建，就必须在那一步加 `env: VITE_SAMPLE_ROOT: ${{ secrets.VITE_SAMPLE_ROOT }}`** ✓，否则线上会是空的 ✓。

### ② R2 的域名与公开访问 ✅（**用对照验的** ✓）

```
真路径 /virtuosity-drums/Programs/01-basic-kit.sfz → 404（server: cloudflare）
假路径 /definitely-not-here.sfz                    → 404
```

⭐ **两者都是 404** ✓ → ⭐ **所以 404 的含义是"对象不在"，而不是"被拒绝"** ✓✓ —— **桶是空的**（上传还没做 ✓），**而域名是活的、公开访问是开的** ✓✓。⭐ **如果公开访问没开，对照会给出 403 而不是 404** ✓ —— **这就是对照组的作用** ✓。

### ③ ⚠️ 线上清单**还没有被提供** ✗ —— 一个真问题

```
GET https://groove.wangda.today/samples/manifest.json
→ HTTP/2 200  ✗  但 content-type: text/html, 内容是 index.html 的 SPA 兜底
```

⭐ **所以应用取到的是 HTML，不是清单** ✗✓ —— ⚠️ 而它**看起来像 200 ✓**，**所以症状会被误读成"清单坏了"** ✗✓（我的运行时会如实报一个解析问题 ✓，但**根因是路由/部署，不是清单** ✓）。

**构建本身是对的** ✓：`dist/samples/manifest.json` = **347158 字节** ✓ → ⭐ **所以这是"网站自清单提交以来还没重新部署"** ✓✓ —— 重新部署一次即可 ✓。

⚠️ 而 `npm run deploy` 会先跑 `npm run verify`（**完整校验链** ✓）；只部署用 `npm run deploy:only` ✓（`node scripts/deploy.mjs` ✓，用 `.env` 里的 `CLOUDFLARE_API_TOKEN` ✓）—— ⭐ **而"重新部署生产"是业主的决定，不是我的** ✓。
