// tests/parser.test.mjs
// Запуск: node tests/parser.test.mjs
// Проверяет разбор content/content.md и три коротких неверных текста.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseContent, ContentError } from '../js/parser.js';

const here = dirname(fileURLToPath(import.meta.url));
const contentPath = join(here, '..', 'content', 'content.md');
const realContent = readFileSync(contentPath, 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('ok   -', name);
  } catch (err) {
    failed += 1;
    process.exitCode = 1;
    console.error('FAIL -', name);
    console.error('       ', err && err.message ? err.message : err);
  }
}

const MAIN_ORDER = [
  'Пить',
  'Кушать',
  'Туалет',
  'Сон',
  'Тишина',
  'Музыка',
  'Мультики',
  'Улица/прогулка',
  'Балкон',
  'Играть',
  'Внимание',
  'Болит',
  'Да',
  'Нет',
  'Не хочу',
  'Хватит',
  'Помоги',
];

test('главный экран: 17 плиток в нужном порядке', () => {
  const { tiles } = parseContent(realContent);
  assert.equal(tiles.length, 17, `ожидалось 17 плиток, получено ${tiles.length}`);
  assert.deepEqual(
    tiles.map((t) => t.label),
    MAIN_ORDER,
  );
});

test('у «Мультики» 3 ребёнка, у «Болит» 8', () => {
  const { tiles } = parseContent(realContent);
  const cartoons = tiles.find((t) => t.label === 'Мультики');
  const pain = tiles.find((t) => t.label === 'Болит');
  assert.ok(cartoons, 'плитка «Мультики» не найдена');
  assert.ok(pain, 'плитка «Болит» не найдена');
  assert.equal(cartoons.children.length, 3);
  assert.equal(pain.children.length, 8);
});

test('настройки разбираются (громкость/сетка/автовозврат/подписи)', () => {
  const { settings } = parseContent(realContent);
  assert.equal(settings['громкость'], 0.8);
  assert.equal(settings['сетка'], '6x3');
  assert.equal(settings['автовозврат_сек'], 8);
  assert.equal(settings['подписи'], true);
});

test('id и рамка читаются из content.md', () => {
  const { tiles } = parseContent(realContent);
  const drink = tiles.find((t) => t.label === 'Пить');
  assert.equal(drink.id, 'drink');
  const yes = tiles.find((t) => t.label === 'Да');
  assert.equal(yes.border, '#2b6cb0');
});

test('ошибка: нет раздела «Плитки» (строка 1)', () => {
  const bad = '# Настройки\n- громкость: 0.8\n';
  assert.throws(
    () => parseContent(bad),
    (e) => e instanceof ContentError && e.line === 1,
  );
});

test('ошибка: строка не вида «- ключ: значение» (строка 4)', () => {
  const bad = '# Плитки\n\n## Пить\nid: drink\n';
  assert.throws(
    () => parseContent(bad),
    (e) => e instanceof ContentError && e.line === 4,
  );
});

test('ошибка: пропуск уровня заголовка (строка 3)', () => {
  const bad = '# Плитки\n\n### Голова\n';
  assert.throws(
    () => parseContent(bad),
    (e) => e instanceof ContentError && e.line === 3,
  );
});

console.log(`\nИтого: ${passed} пройдено, ${failed} провалено.`);
