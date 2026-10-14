// js/parser.js
// Разбор content/content.md. Чистый модуль без DOM — работает и в браузере, и в Node.
// Экспортирует parseContent(text) -> { settings, tiles } и класс ошибки ContentError.

export class ContentError extends Error {
  constructor(message, line) {
    super(message);
    this.name = 'ContentError';
    this.line = line; // номер строки (с 1), где найдена ошибка
  }
}

// Ключи плитки, которые раскладываются по полям. Всё остальное уходит в extra.
const TILE_KEYS = {
  id: 'id',
  ссылка: 'url',
  озвучить: 'speak',
  текст_озвучки: 'spokenText',
  видимость: 'visible',
  рамка: 'border',
  картинка: 'image',
  звук: 'sound',
};

const DEFAULT_BORDER = '#cbd5e1';

// «да»/«нет» -> true/false, целые и дробные числа -> number, остальное -> строка.
function convertValue(raw) {
  const s = String(raw).trim();
  if (s === 'да') return true;
  if (s === 'нет') return false;
  if (s !== '' && /^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

function applyTileKey(node, key, value, line) {
  const field = TILE_KEYS[key];
  if (!field) {
    node.extra[key] = value; // неизвестный ключ — сохранить и игнорировать
    return;
  }
  switch (field) {
    case 'id': {
      const id = String(value).trim();
      if (id !== '') {
        node.id = id;
        node.__hasId = true;
        node.__idLine = line;
      }
      break;
    }
    case 'url':
      node.url = String(value);
      break;
    case 'speak':
      node.speak = value !== false; // «нет» -> false, иначе true (по умолчанию да)
      break;
    case 'spokenText':
      node.spokenText = String(value);
      break;
    case 'visible':
      node.visible = value !== false; // «нет» -> false, иначе true (по умолчанию да)
      break;
    case 'border':
      node.border = String(value);
      break;
    case 'image':
      node.image = String(value);
      break;
    case 'sound':
      node.sound = String(value);
      break;
    default:
      node.extra[key] = value;
  }
}

export function parseContent(text) {
  const lines = String(text).split(/\r?\n/);

  const settings = {};
  const tiles = []; // плитки главного экрана
  const flat = []; // все плитки в порядке появления (для id и проверки дублей)

  let section = null; // 'settings' | 'tiles' | 'other'
  let sawTiles = false;

  // Стек родителей. Нижний элемент — контейнер раздела «Плитки» (уровень 1).
  const stack = [];

  for (let i = 0; i < lines.length; i++) {
    const line = i + 1;
    const trimmed = lines[i].trim();

    // Пустые строки и HTML-комментарии игнорируются.
    if (trimmed === '') continue;
    if (trimmed.startsWith('<!--')) continue;

    // Заголовок.
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      const title = heading[2].trim();

      if (level === 1) {
        if (title === 'Настройки') {
          section = 'settings';
        } else if (title === 'Плитки') {
          section = 'tiles';
          sawTiles = true;
          stack.length = 0;
          stack.push({ level: 1, node: null, children: tiles });
        } else {
          section = 'other'; // неизвестный раздел первого уровня — игнорируем
        }
        continue;
      }

      // Заголовки плиток (## и глубже) имеют смысл только внутри «Плитки».
      if (section !== 'tiles') continue;

      // Подняться к ближайшему родителю с уровнем меньше текущего.
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      const parent = stack[stack.length - 1];

      if (!parent || level !== parent.level + 1) {
        throw new ContentError(
          `Пропущен уровень заголовка: «${title}»`,
          line,
        );
      }

      const node = {
        id: null,
        label: title,
        children: [],
        speak: true,
        spokenText: null,
        visible: true,
        border: DEFAULT_BORDER,
        image: null,
        sound: null,
        url: null,
        extra: {},
        __line: line,
        __hasId: false,
        __idLine: null,
      };
      parent.children.push(node);
      stack.push({ level, node, children: node.children });
      flat.push(node);
      continue;
    }

    // Строка свойства «- ключ: значение».
    const item = /^-\s+(.*)$/.exec(trimmed);
    if (!item) {
      throw new ContentError('Строка не вида «- ключ: значение»', line);
    }
    const body = item[1];
    const colon = body.indexOf(':');
    const key = colon === -1 ? '' : body.slice(0, colon).trim();
    if (colon === -1 || key === '') {
      throw new ContentError('Строка не вида «- ключ: значение»', line);
    }
    const value = convertValue(body.slice(colon + 1));

    if (section === 'settings') {
      settings[key] = value;
    } else if (section === 'tiles') {
      const parent = stack[stack.length - 1];
      if (!parent || !parent.node) {
        throw new ContentError('Свойство плитки вне заголовка плитки', line);
      }
      applyTileKey(parent.node, key, value, line);
    }
    // section === 'other' или null — игнорируем.
  }

  if (!sawTiles) {
    throw new ContentError('Нет раздела «Плитки»', 1);
  }

  // Авто-id (t1, t2, …) по порядку для плиток без id, без пересечений с явными.
  const explicit = new Set();
  for (const node of flat) {
    if (node.__hasId && node.id) explicit.add(node.id);
  }
  let counter = 0;
  for (const node of flat) {
    if (!(node.__hasId && node.id)) {
      do {
        counter += 1;
      } while (explicit.has('t' + counter));
      node.id = 't' + counter;
    }
  }

  // Проверка повторяющихся id.
  const seen = new Set();
  for (const node of flat) {
    if (seen.has(node.id)) {
      throw new ContentError(
        `Повторяющийся id: «${node.id}»`,
        node.__idLine || node.__line,
      );
    }
    seen.add(node.id);
  }

  // Убрать служебные поля перед возвратом.
  (function clean(nodes) {
    for (const n of nodes) {
      delete n.__line;
      delete n.__hasId;
      delete n.__idLine;
      clean(n.children);
    }
  })(tiles);

  return { settings, tiles };
}
