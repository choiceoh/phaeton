# PWA 전환 계획

## Context
Topworks를 PWA(Progressive Web App)로 전환하여 설치 가능한 앱 형태로 제공. 현재 아무런 PWA 인프라가 없는 상태(manifest, service worker, 아이콘 전무).

## 접근: vite-plugin-pwa

`vite-plugin-pwa`를 사용해 manifest.webmanifest와 service worker를 자동 생성.

## 변경 파일

### 1. `frontend/package.json` — 의존성 추가
- `vite-plugin-pwa` 설치

### 2. `frontend/vite.config.ts` — PWA 플러그인 설정
- `VitePWA` 플러그인 추가
- manifest 설정 (name, short_name, theme_color, icons 등)
- Service worker: `registerType: 'prompt'` (업데이트 시 사용자에게 알림)
- workbox runtime caching: API 요청은 NetworkFirst, static assets는 CacheFirst

### 3. `frontend/index.html` — 메타 태그 추가
- `<meta name="theme-color">` 
- `<meta name="description">`
- `<link rel="apple-touch-icon">`
- `<meta name="apple-mobile-web-app-capable">`

### 4. `frontend/public/` — 아이콘 생성
- `pwa-192x192.png`, `pwa-512x512.png` — 기본 아이콘 (SVG → PNG placeholder)
- `apple-touch-icon-180x180.png`
- `favicon.svg` — SVG 파비콘

### 5. `frontend/src/pwa.ts` — SW 업데이트 등록
- `registerSW` 호출, 업데이트 발견 시 reload prompt 표시

### 6. `frontend/src/main.tsx` — pwa.ts import

### 7. `backend/cmd/server/main.go` — 서비스 워커 캐시 헤더
- `sw.js`, `workbox-*.js` 파일에 `Cache-Control: no-cache` 헤더 설정 (항상 최신 SW 제공)

## 아이콘
실제 디자인된 아이콘이 없으므로 "T" 글자 기반 SVG 파비콘을 생성하고, PNG 아이콘은 단색 플레이스홀더로 생성. 추후 실제 아이콘으로 교체 가능.

## 검증
1. `cd frontend && npm run build` → static/ 에 `manifest.webmanifest`, `sw.js` 생성 확인
2. `make dev-ui` → Chrome DevTools > Application > Manifest 탭에서 설치 가능 확인
3. Service Worker 등록 확인
