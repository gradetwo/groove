# 部署与运维

应用是纯静态产物：没有后端、没有数据库、不需要 API key。任何静态托管都能跑。本仓库的线上版本
<https://groove.wangda.today/> 部署在 Cloudflare Workers 上。

## 1. 构建

```bash
npm ci
npm run build        # 产物在 dist/
```

**先提升版本、再构建、最后部署。** `scripts/deploy.mjs` 会比对 `dist/version.json` 与
`package.json`，两者不一致就拒绝上传——否则会把上一版的产物挂到新版本号下面。

**这道关卡只比对版本号，认不出「版本号对、内容旧」的 `dist/`。** 实测踩过一次：`verify` 里已经 build 完，
之后才改 `public/changelog.json` 的发布日期，再直接 deploy——版本号当然一致，于是 09-20 的旧日期又上了一次线
（`version.json`、`changelog.json` 都一样，Edge 与源站都是旧值）。所以**任何 `public/` 下的改动之后都要重新
`npm run build` 再部署**；线上核对时用 `curl https://<域名>/version.json` 看 `latest.date`，缓存戳（`?cb=`）
只绕过 CDN 缓存，绕过不了自己上传的旧产物。

```bash
npm run preview      # 本地预览 dist/（默认 :4173）
```

## 2. 部署到 Cloudflare Workers

1. 复制 `wrangler.toml.example` 为 `wrangler.toml`，把 `name` 改成你自己的 worker 名。
   `wrangler.toml` 不入库，因为它写的是各自的 worker 名。
2. 准备凭据：复制 `.env.deploy.example` 为 `.env.deploy`，填入 `CLOUDFLARE_API_TOKEN`
   （可选 `CLOUDFLARE_ACCOUNT_ID`）。脚本也接受同名环境变量，如果两者都没有，会退回
   wrangler 自己的登录态（`npx wrangler login`）。
3. 部署：

```bash
npm run deploy                      # 先跑 npm run verify，再上传
npm run deploy:only                 # 跳过 verify，只上传
node scripts/deploy.mjs --dry-run   # 只打包、不上传
```

## 3. 其他静态托管

`dist/` 是普通静态目录，直接放上去即可，但需要 **SPA 回退**（未知路径返回 `index.html`）。
Nginx 例子：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/groove;
    index index.html;
    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    location / {
        try_files $uri $uri/ /index.html;
    }
    # 带 hash 的资源可以长缓存；Service Worker 不能缓存，否则更新会滞后
    location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
    location ~* (sw\.js|manifest\.webmanifest|version\.json)$ {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
```

Docker 只需一个静态镜像：

```dockerfile
FROM nginx:alpine
COPY dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

Vercel / Netlify / Cloudflare Pages：Build Command `npm run build`，Output Directory `dist`。

`public/_headers` 是给 Cloudflare 静态资源用的缓存头（`/assets/*` 一年 immutable、`sw.js`
不缓存）。换平台时要配等价规则，否则用户会一直拿到旧的 Service Worker。

## 4. 本地端口

`vite.config.ts` 的端口由环境变量驱动，方便在同一台机器上并行跑多个 worktree：

| 变量 | 作用 | 默认 |
| --- | --- | --- |
| `PORT` | `npm run dev`（优先级最高） | 3000 |
| `VITE_PORT` | `npm run dev`（`PORT` 未设时生效） | 3000 |
| `PREVIEW_PORT` | `npm run preview` | 4173 |

两个 server 都是 `strictPort: false`：端口被占用时自动顺延，实际端口以终端输出为准。

## 5. 端到端测试

`playwright` 是正式的 devDependency：

```bash
npm ci
npx playwright install --with-deps chromium firefox webkit
npm run test:e2e        # 三个桌面引擎（PC 档）
npm run test:e2e:all    # 7 端：桌面 + iPhone 竖/横 + iPad 竖/横
```

`scripts/test_matrix.js` 的静态服务器用内核临时端口（`listen(0)`），多实例并行不会抢端口。

## 6. 发布流程（本仓库的约定）

```bash
npm test && npm run verify      # 门禁全绿
# 提升 package.json 的版本号
# 在 public/changelog.json 头部加入该版本的条目（中英双语）
npm run version:sync            # 同步 src/version.ts / public/version.json / public/sw.js 与规划文档的版本头
npm run build
npm run deploy
```

`npm run verify` 是会拦住改动的门禁：版本与文档一致性、分层依赖、CSS 用法、类型、lint、数据
schema、测试、生产构建、两个实测探针和端到端矩阵。
