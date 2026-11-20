# Деплой Kinoroom через GitHub + Render

Проект полностью подготовлен для автоматического развертывания на **Render** из вашего **GitHub**-репозитория (включая Express API, WebSocket-синхронизацию комнат и сигналинг голосового WebRTC-чата на одном порту).

## Вариант 1: Через Render Blueprint (`render.yaml`)

1. Загрузите проект в новый репозиторий на **GitHub** (ветка `main`).
2. Перейдите в [Render Dashboard](https://dashboard.render.com/) → **New +** → **Blueprint**.
3. Подключите ваш GitHub-репозиторий — Render автоматически прочитает файл `render.yaml`:
   - **Build Command**: `npm install --include=dev && npm run build`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/health`
4. Нажмите **Apply** — через пару минут приложение будет доступно по HTTPS с поддержкой `wss://` (WebSocket).

## Вариант 2: Ручная привязка + GitHub Actions

1. Создайте **Web Service** на Render и выберите ваш репозиторий.
2. В настройках сервиса Render скопируйте **Deploy Hook URL** (`Settings` → `Deploy Hook`).
3. В репозитории GitHub откройте `Settings` → `Secrets and variables` → `Actions` → **New repository secret**:
   - Имя: `RENDER_DEPLOY_HOOK_URL`
   - Значение: ваш Deploy Hook URL.
4. При каждом `git push origin main` GitHub Actions (`.github/workflows/deploy.yml`) проверит типы (`npm run lint`), соберёт клиент и сервер (`npm run build`) и автоматически запустит деплой на Render.
