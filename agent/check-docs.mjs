#!/usr/bin/env node
// Механическая проверка документов (метод proto, слой 2):
//   1) относительные ссылки в *.md ведут на существующие файлы и папки;
//   2) каждый AGENTS.md и CLAUDE.md (включая вложенные) не разросся — они загружаются в сессии агента.
// Пути, упомянутые как `код`, не проверяются: слишком много ложных срабатываний (имена в деревьях,
// пути будущего проекта). Такой дрейф ловит гармонизация (/harmonize).
// Запуск: node scripts/check-docs.mjs [корень]. Код выхода 1 — есть проблемы.
// Без зависимостей: нужен только Node 18+.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, basename } from 'node:path';

const MAX_LINES = 150;
const MAX_BYTES = 12_000;
const AGENT_FILES = new Set(['AGENTS.md', 'CLAUDE.md']);
const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'target', 'dist', 'build', 'gen', 'coverage',
  'test-results', 'playwright-report', '.venv', '.next', '.svelte-kit',
]);

const root = resolve(process.argv[2] ?? '.');
const problems = [];

function* markdownFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('dist-')) yield* markdownFiles(join(dir, entry.name));
    } else if (entry.name.endsWith('.md')) {
      yield join(dir, entry.name);
    }
  }
}

// Блоки кода убираем: ссылки и пути в примерах проверять не нужно.
const stripFences = (text) => text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '');
const LINK = /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;

const where = (file) => relative(root, file) || basename(file);

for (const file of markdownFiles(root)) {
  const raw = readFileSync(file, 'utf8');
  const text = stripFences(raw);
  const name = basename(file);

  for (const [, target] of text.replace(/`[^`\n]*`/g, '').matchAll(LINK)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue; // http:, mailto:, якорь
    let path = target.split('#')[0].split('?')[0];
    try { path = decodeURIComponent(path); } catch { /* оставляем как есть */ }
    const abs = path.startsWith('/') ? join(root, path) : resolve(dirname(file), path);
    if (!existsSync(abs)) problems.push(`${where(file)}: битая ссылка → ${target}`);
  }

  if (!AGENT_FILES.has(name)) continue;

  const bytes = Buffer.byteLength(raw);
  const lines = raw.length === 0 ? 0 : raw.split('\n').length - (raw.endsWith('\n') ? 1 : 0);
  if (lines > MAX_LINES || bytes > MAX_BYTES) {
    problems.push(
      `${where(file)}: ${lines} строк, ${bytes} байт (предел ${MAX_LINES} строк и ${MAX_BYTES} байт). ` +
      'Перенеси подробности в docs/ или skill и оставь ссылку — см. docs/method/agent.md.',
    );
  }
}

if (problems.length) {
  console.error(`check-docs: проблем — ${problems.length}`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('check-docs: OK');
