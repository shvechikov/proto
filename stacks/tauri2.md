# Стек по умолчанию: Tauri 2

*Слой 3 метода. Проверено на 2026-10-15: Tauri 2.12. Версии меняются быстро — перед настройкой сверяйся с `npm view` и документацией.*

Один интерфейс на веб-технологиях даёт приложения для Mac, Windows и Linux, для iPhone и Android, а также веб-версию. Логика пишется на TypeScript, тонкая оболочка для операционной системы — на Rust. Автору Rust знать не нужно: оболочку пишет агент, и она маленькая.

Если проекту приложение не нужно, а хватит сайта, структура та же, только без `src-tauri/`. Оболочку можно добавить позже, ничего не переписывая.

## Версии — первое, на чём ошибаются агенты

- **Только Tauri 2: `^2` во всех `package.json` и `Cargo.toml`.** Никогда не `@next` — этот тег в npm теперь указывает на Tauri 3 alpha. То же для любых зависимостей: никаких тегов вместо версий (`next`, `beta`, `canary`) — завтра под ними окажется другое.
- Агенты путают API v1 и v2. Частые замены:

  | v1 (неправильно) | v2 |
  |---|---|
  | `allowlist` в конфиге | capabilities в `src-tauri/capabilities/` |
  | `@tauri-apps/api/tauri` | `@tauri-apps/api/core` |
  | `@tauri-apps/api/fs`, `dialog`, `shell`, `http` | плагины `@tauri-apps/plugin-*` |
  | `distDir` / `devPath` | `frontendDist` / `devUrl` |
  | `get_window` / `emit_all` | `get_webview_window` / `emit` |
  | `window.__TAURI__.invoke` | `window.__TAURI__.core.invoke` |

- `tauri-plugin-stronghold` объявлен устаревшим. Секреты хранить в системной связке ключей через crate `keyring`.
- `tauri-action` для GitHub Actions — версия 1.x, входные параметры переименованы по сравнению с 0.x.
- Справка для агента: [tauri.app/llms.txt](https://tauri.app/llms.txt) — это оглавление. Полные файлы весят мегабайты, поэтому читать нужные разделы, а не всё целиком.

## Старт

1. `npm create tauri-app@latest` → React + TypeScript + Vite, если автор не выбрал другое.
2. Настройки Vite, которые создал генератор (`clearScreen`, `strictPort`, `TAURI_DEV_HOST`, игнор `src-tauri` при слежении), не удалять: без них ломается разработка на телефоне.
3. Перестроить проект под скелет ниже. Первый срез — окно, в котором видно что-то настоящее из модели продукта, а не пустой каркас.

## Скелет

```
my-app/
├── AGENTS.md, CLAUDE.md, README.md, docs/
├── package.json         dev · app:dev · app:build · build:web · test · check · doctor
├── rust-toolchain.toml  точная версия Rust
├── core/                чистое TS-ядро: модель, команды, инварианты, демо-мир (+ *.test.ts)
├── src/                 интерфейс
│   └── platform/        порты и адаптеры: index.ts (интерфейс), tauri.ts, web.ts, memory.ts
├── src-tauri/           тонкая оболочка на Rust
│   ├── build.rs         список своих команд → права (ACL)
│   ├── tauri.conf.json  + tauri.dev.conf.json (свой identifier)
│   ├── capabilities/    по файлу на окно, с полем platforms
│   └── src/             main.rs, lib.rs, commands/
├── e2e/                 сценарии Playwright: Chromium + WebKit
└── scripts/check-docs.mjs
```

В режиме «лаборатория» у каждого эксперимента в `lab/NNN-slug/` такой же скелет, свой `package.json` и свои данные.

## Правила архитектуры

1. **Ядро чистое и детерминированное.** `core/` не знает ни про DOM, ни про Tauri, ни про файлы. Там модель, команды, которые её меняют, инварианты и демо-мир. Время, случайность и новые id передаются в ядро снаружи (`apply(world, command, now, …)`): в ядре нет `new Date()` и `Math.random()`. Тогда одно и то же даёт один и тот же мир — в приложении, в браузере, в тестах и на другом устройстве. Это правило стоит закрыть тестом или линтером.
2. **Платформа — за интерфейсом.** Всё, что зависит от среды (хранилище, секреты, уведомления, окна), описано интерфейсом в `src/platform/index.ts`. Реализаций три:
   - `tauri.ts` — **единственный** файл, который импортирует `@tauri-apps/*`;
   - `web.ts` — IndexedDB и WebCrypto;
   - `memory.ts` — для тестов и демо.

   Реализация выбирается при сборке (режим Vite), так что в веб-сборку Tauri не попадает. Во время выполнения — `isTauri()` из `@tauri-apps/api/core`.
3. **Оболочка тонкая.** Rust делает только то, что умеет ОС: файлы в папке приложения, связка ключей, трей, горячие клавиши, окна. Бизнес-логики в Rust нет.
4. **Права — минимальные и явные.**
   - Свои команды перечисляются в `build.rs` через `tauri_build::AppManifest::new().commands(&[...])`. Тогда каждой нужна явная запись `allow-<команда>` в capabilities.
   - Capabilities — по окну. Права только для desktop ограничиваются полем `"platforms"`.
   - CSP не `null`; в `connect-src` — только свои серверы. Если есть веб-версия, у неё и у приложения одна и та же политика.
   - `withGlobalTauri` выключен везде, кроме dev-конфига, если он там нужен. Он нужен страницам, которые не проходят через сборку. Лучше собирать и их через Vite — тогда флаг не нужен.
5. **Dev не видит настоящих данных.**
   - `src-tauri/tauri.dev.conf.json` задаёт другой `identifier` (например, `….dev`), а `app:dev` запускает `tauri dev --config src-tauri/tauri.dev.conf.json`.
   - Папка данных и имя записи в связке ключей **выводятся из `identifier`** (`app.config().identifier`, `app_data_dir()`), а не задаются константой. Иначе отдельный identifier ничего не разделит.
   - `npm run dev` открывает интерфейс в браузере на демо-мире.
6. **Данные — человекочитаемые файлы** в папке данных приложения (`app_data_dir`). Пишутся через свои команды оболочки: путь проверяется на выход за пределы папки и в Rust, и в TS, а запись атомарная. Если нужен SQLite, нужен и экспорт в читаемый формат.
7. **Логи видны агенту.** Интерфейс пишет через `@tauri-apps/plugin-log` (`info`, `warn`, `error`). Туда же отправляются `window.onerror` и `unhandledrejection`. Иначе ошибки окна не видны в терминале, и агент работает вслепую.
8. **Свой локальный сервер, если он есть,** слушает только `127.0.0.1`. Он отвечает только своим именам хоста (защита от подмены DNS) и принимает команды только в JSON.
9. **Сборки — в разные папки:** `dist-app`, `dist-web`, `dist-e2e`. Тогда `check` не перезаписывает то, что раздаёт работающее приложение.

### Новая команда ядра — чек-лист

Тип команды → `apply` → инварианты → генератор случайных команд (полноту проверяет компилятор) → строка в каталоге `docs/testing.md` → тест. Смысл существующей команды не меняется, если записанные команды где-то хранятся или синхронизируются: новое поведение — новая команда.

### Новая команда оболочки — чек-лист

`fn` с `#[tauri::command]` → `generate_handler!` → список в `build.rs` → `allow-…` в нужной capability → метод в `src/platform/tauri.ts` (и аналог в `web.ts` и `memory.ts`) → тест. Если команд много, есть [tauri-specta](https://github.com/specta-rs/tauri-specta): он генерирует типы для TS, но пока в статусе RC. Без него — тест, который сверяет четыре списка: `build.rs`, `generate_handler!`, capabilities и вызовы `invoke`.

## `check` — одна команда перед коммитом

По порядку, падает на первой ошибке:

1. `tsc --noEmit` и линтер.
2. `vitest run` — ядро, адаптеры, интерфейс.
3. `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` в `src-tauri/`.
4. `playwright test` — Chromium и WebKit.
5. `node scripts/check-docs.mjs`.

Отдельно: `npm test` для быстрых прогонов во время работы и `npm run doctor` — инварианты на настоящих данных, только чтение.

## Проверки по слоям

| Слой | Чем | Что важно |
|---|---|---|
| Ядро | Vitest + [fast-check](https://github.com/dubzzz/fast-check) | Инварианты после каждой команды; сотни случайных цепочек; демо-мир строится командами |
| Оболочка | `cargo test`; mock runtime `tauri::test` | Проверка путей, разбор данных, проводка команд без окна |
| Интерфейс | Vitest + Testing Library + `@tauri-apps/api/mocks` (`mockIPC`, `clearMocks` после каждого теста) | Компоненты без настоящего Tauri |
| Сценарии | Playwright: Chromium **и WebKit** на веб-сборке | Фиксированные «сегодня» и часовой пояс; ошибка в консоли валит сценарий; снимки экрана. Сценарии прогоняются через каждый адаптер, а не только через `memory`: гонки и различия хранилищ видны только так |
| Настоящее приложение | 3–10 smoke-тестов: WebdriverIO `@wdio/tauri-service` (на macOS — встроенный провайдер; проверить при настройке) или [tauri-pilot](https://github.com/mpiton/tauri-pilot) | Официальный `tauri-driver` macOS не поддерживает |
| Оболочка ОС и телефон | Ручной чек-лист в `docs/testing.md` | Трей, горячие клавиши, меню, deep links, первая установка подписанной сборки, возврат из фона на iOS |
| Мутационный прогон (на вехах) | [StrykerJS](https://github.com/stryker-mutator/stryker-js) для `core/`, [cargo-mutants](https://github.com/sourcefrog/cargo-mutants) для Rust | Только ядро; не в каждом `check` |

**Важно:** WebKit в Playwright — не тот же WKWebView, что в приложении на Mac и iPhone. Версия WKWebView зависит от версии ОС. Сценарии в WebKit ловят большую часть различий с Chromium, но не все. Шрифты в движках разные: проверку «влезает ли в строку» делать в обоих и на самых длинных данных.

## Глаза агента

- **MCP-мост к запущенному приложению** — [hypothesi/mcp-server-tauri](https://github.com/hypothesi/mcp-server-tauri). Это npm `@hypothesi/tauri-mcp-server` и crate `tauri-plugin-mcp-bridge` одной версии. Агент видит DOM, делает скриншоты, читает логи, следит за IPC, работает с симулятором iOS. Подключать **только в debug-сборке** (`#[cfg(debug_assertions)]`): мост открывает выполнение JS на локальном порту.
- **tauri-pilot** — CLI для агента: клики, проверки, логи, запись сценариев. Работает с iOS Simulator и Android.
- Без моста агент проверяет сценарии в Playwright и просит автора посмотреть на окно глазами.

## Телефон

- `npm run tauri ios init` и `ios dev`. Нужны Xcode и Rust-цели для iOS. Папку `src-tauri/gen/apple` коммитить без `build/` и `xcuserdata/`. После обновления CLI её пересоздают.
- Для живой перезагрузки на настоящем iPhone нужен `TAURI_DEV_HOST` (генератор настраивает его в Vite).
- Сборки с бесплатным аккаунтом разработчика живут 7 дней. Для App Store и нотаризации на Mac нужен платный аккаунт.
- `macOSPrivateApi: true` закрывает путь в Mac App Store. Если он нужен, записать это решение.

## Раздача сборок — когда понадобится

GitHub Actions с [tauri-action](https://github.com/tauri-apps/tauri-action) 1.x на `macos-latest`.

- Подпись для Mac — секреты `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`.
- Нотаризация — `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_PATH`.
- Обновления — `tauri-plugin-updater` и пара ключей `TAURI_SIGNING_PRIVATE_KEY`. Подключить его до первой раздачи, иначе первым пользователям придётся обновляться вручную.

## Частые грабли

1. **Права (ACL).** Нет нужной записи в capability — команда молча отклоняется, ошибка видна только в консоли окна. Названия окон в capabilities должны совпадать с настоящими.
2. **Origin зависит от режима.** В разработке это `http://localhost:ПОРТ`, в сборке — `tauri://localhost` (Mac, iOS, Linux) или `http://tauri.localhost` (Windows, Android). Поэтому localStorage и IndexedDB из разработки не переносятся в сборку. Запросы к чужим серверам блокирует CORS — их делать через `@tauri-apps/plugin-http` или из Rust.
3. **WebKit.** Не работают всплывающие `window.open`. Другие шрифты. Возможности браузера ограничены минимальной версией ОС, поэтому `build.target` в Vite задаётся по версии Safari.
4. **IPC.** Большие объёмы через JSON и много мелких `invoke` подряд работают медленно. Лучше пачками; потоки — через `Channel`, двоичные данные — через `Response`.
5. **Телефон.** В PATH у Xcode нет `~/.cargo/bin`. После обновления Xcode `ios dev` может сломаться — смотреть issues Tauri.
6. **Отладочное в релизе.** MCP-мост, WebDriver-плагин, `withGlobalTauri` не должны попасть в релизную сборку.

## `docs/architecture.md` в проекте на Tauri

Создаётся с первым кодом. В нём:

- **Карта кода** — что за части, где лежат, как связаны. Без пересказа кода: только названия, по которым можно искать.
- **Инварианты, особенно отсутствия:** «ядро не импортирует `src/` и `@tauri-apps/*`», «только `platform/tauri.ts` знает о Tauri», «оболочка не содержит бизнес-логики», «dev-сборка не видит настоящих данных».
- **Схема Mermaid**, когда частей больше двух (приложение, веб-версия, сервер синхронизации): кто с кем говорит и через что.

## Образцы

- [create-tauri-app](https://github.com/tauri-apps/create-tauri-app) — официальная основа, готовая к телефону.
- [dannysmith/tauri-template](https://github.com/dannysmith/tauri-template) — хорошая обвязка для агента: AGENTS.md, архитектурные правила, единая проверка. Только desktop.
