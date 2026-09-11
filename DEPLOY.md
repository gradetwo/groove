# Groove & Genre Odyssey 部署与运维指南

本系统基于 **纯前端静态架构 (Pure Frontend Static Architecture)** 设计，无任何后端服务或外部采样音频依赖，具备真正的零延迟、离线即用 (Offline-first PWA) 特性。

---

## 1. 部署产物概览

- **部署包位置**: `release/groove-release.tar.gz` (约 236 KB)
- **解压后目录**: `dist/`
  - `index.html`: 单页面应用入口
  - `assets/`: 编译压缩后的 JS / CSS 核心产物
  - `manifest.webmanifest`: PWA Web App 清单
  - `sw.js`: 离线优先 Service Worker 缓存脚本
  - `icons/`: 高清 SVG 矢量图标

---

## 2. 快速启动与预览

### 本地预览 (Node.js)
```bash
# 使用内置 preview 命令 (基于 Vite)
npm run preview

# 或使用 npx serve
npx serve -s dist -l 3000

# 或使用 Python 内置静态服务器
cd dist && python3 -m http.server 8080
```
启动后在浏览器打开 `http://localhost:3000` 或 `http://localhost:8080` 即可使用。

---

## 3. 生产环境部署方案

### 方案 A: Nginx 部署
解压 `release/groove-release.tar.gz` 到 Web 根目录，例如 `/var/www/groove`:
```bash
tar -xzvf release/groove-release.tar.gz -C /var/www/groove --strip-components=1
```

在 Nginx 配置文件中加入：
```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/groove;
    index index.html;

    # 启用 Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    # 单页面应用路由重定向
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Service Worker 与 Manifest 不缓存或短缓存
    location ~* (sw\.js|manifest\.webmanifest)$ {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # 静态静态资源长缓存
    location ~* \.(js|css|svg|png|jpg|ico|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 方案 B: Docker 极简容器化
使用轻量级 Nginx Alpine 镜像运行：
```dockerfile
FROM nginx:alpine
COPY dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

构建与运行：
```bash
docker build -t groove-odyssey .
docker run -d -p 80:80 --name groove-odyssey groove-odyssey
```

### 方案 C: Vercel / Netlify / Cloudflare Pages
1. 将代码仓库推送到 GitHub / GitLab。
2. 在托管平台选择项目，构建配置设置为：
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. 点击 Deploy 即可秒级上线，自带全局 CDN 加速和 HTTPS。

---

## 4. 特性与技术规范验证

- **曲风库容量**: 159 个独立曲风（包含 93 个电子音乐曲风，66 个其他主流曲风），均配备中英双语制作指南与 8 轨节奏模板。
- **纯合成音频**: 原生 Web Audio API 振荡器与滤镜实时生成，支持 MIDI 文件导出与 Base64 URL 分享。
- **PWA 与离线现状**: 当前主动注销旧版 Service Worker 以杜绝静态资源死锁；静态资源依托 Cloudflare Edge CDN 全球强缓存与 Vite 产物 Hash 版本控制；现代化 Workbox 离线精细缓存策略规划于 Phase 5 实施。
- **测试与质量验证**: 62 项严格单元与集成测试（覆盖音频限幅/Panic、时钟/Worker、和弦生成、BPM 解析、URL 编解码安全、全站 ErrorBoundary 容灾与 159 曲风数据完整性），通过 GitHub Actions CI 及本地 `npm test` 双重门禁校验。

