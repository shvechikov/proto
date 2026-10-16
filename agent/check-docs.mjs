#!/usr/bin/env node
// Механическая проверка документов (метод proto, слой 2):
//   1) относительные ссылки в *.md ведут на существующие файлы и папки;
//   2) AGENTS.md и CLAUDE.md не разрослись (они загружаются в каждую сессию агента).
// Запуск: node scripts/check-docs.mjs [корень]. Код выхода 1 — есть проблемы.
// Без зависимостей: нужен только Node 18+.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const MAX_LINES = 150;
const MAX_BYTES = 12_000;
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

// Убираем блоки кода и `код в строке`: ссылки в примерах проверять не нужно.
function stripCode(text) {
  return text
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '')
    .replace(/`[^`\n]*`/g, '');
}

const LINK = /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;

for (const file of markdownFiles(root)) {
  const text = stripCode(readFileSync(file, 'utf8'));
  for (const [, target] of text.matchAll(LINK)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue; // http:, mailto:, якорь
    let path = target.split('#')[0].split('?')[0];
    try { path = decodeURIComponent(path); } catch { /* оставляем как есть */ }
    const abs = path.startsWith('/') ? join(root, path) : resolve(dirname(file), path);
    if (!existsSync(abs)) problems.push(`${relative(root, file)}: битая ссылка → ${target}`);
  }
}

for (const name of ['AGENTS.md', 'CLAUDE.md']) {
  const file = join(root, name);
  if (!existsSync(file)) continue;
  const bytes = statSync(file).size;
  const lines = readFileSync(file, 'utf8').split('\n').length;
  if (lines > MAX_LINES || bytes > MAX_BYTES) {
    problems.push(
      `${name}: ${lines} строк, ${bytes} байт (предел ${MAX_LINES} строк и ${MAX_BYTES} байт). ` +
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
