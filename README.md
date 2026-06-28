# PhotoFind

Умный поиск по галерее через ИИ. Пишешь что на фото — приложение находит.

## Стек

- React Native + Expo
- Claude API (claude-haiku) — парсинг запроса + описание фото
- expo-sqlite + FTS5 — локальный полнотекстовый поиск
- expo-media-library — доступ к галерее

## Запуск

```bash
npm install
```

Создай файл `.env` в корне проекта:
```
EXPO_PUBLIC_CLAUDE_API_KEY=твой_ключ_здесь
```

```bash
npx expo start
```

Отсканируй QR в приложении Expo Go на телефоне.

## Архитектура

1. **Первый запуск** → `indexer.ts` читает галерею батчами по 5 фото
2. Каждое фото сжимается до 512px и отправляется в Claude Vision
3. Claude возвращает описание + теги → сохраняется в SQLite FTS5 локально
4. **Поиск** → `claude.ts` парсит запрос в ключевые слова → FTS5 поиск по базе
5. Фото **никуда не уходят** — только сжатые копии для индексации

## Монетизация

- AdMob баннеры — ненавязчивые, внизу экранов
- Яндекс РСЯ — для СНГ аудитории
- Freemium: 5 поисков/день бесплатно → безлимит за подписку

## Партнёрки

- **AdMob**: admob.google.com
- **РСЯ**: partner.yandex.ru

## Структура

```
app/
  _layout.tsx     — навигация
  index.tsx       — главный экран
  results.tsx     — результаты поиска
  indexing.tsx    — экран индексации
  photo.tsx       — просмотр фото
  settings.tsx    — настройки
src/
  theme.ts        — цвета, шрифты
  services/
    claude.ts     — Claude API
    db.ts         — SQLite
    indexer.ts    — индексация галереи
```
