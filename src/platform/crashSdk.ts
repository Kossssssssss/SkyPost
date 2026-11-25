// Лише потрібне з @sentry/browser: імпорт усього пакета тягне в чанк Replay і Feedback (~140 КБ gzip замість ~30)
export { addBreadcrumb, captureException, captureMessage, init, setTag, setTags } from '@sentry/browser';
