// js/app.js
// Экран и навигация: загрузка content.md, сетка плиток, папки, клик, автовозврат.

import { parseContent, ContentError } from './parser.js';
import { Sound } from './sound.js';

const screenEl = document.getElementById('screen');
const backBtn = document.getElementById('backBtn');
const errorBox = document.getElementById('errorBox');

const DEFAULT_BORDER = '#cbd5e1';
const ACTIVE_MS = 300; // длительность подсветки рамки и защиты от двойного клика

let settings = {};
let rootTiles = [];
let navStack = []; // navStack[0] — главный экран; глубже — открытые папки
let cols = 6;
let rows = 3;
let sound = null;

let autoReturnTimer = null;
const lastClickAt = new Map(); // id плитки -> время последнего клика (мс)

function showError(err) {
  let msg;
  if (err instanceof ContentError) {
    msg = `Ошибка в content.md — строка ${err.line}: ${err.message}`;
  } else {
    msg =
      'Не удалось загрузить content/content.md. ' +
      (err && err.message ? err.message : String(err));
  }
  errorBox.textContent = msg;
  errorBox.hidden = false;
}

function applyGridSetting() {
  const grid = String(settings['сетка'] || '6x3');
  const m = /(\d+)\s*[x×]\s*(\d+)/i.exec(grid);
  cols = m ? parseInt(m[1], 10) : 6;
  rows = m ? parseInt(m[2], 10) : 3;
  if (!(cols >= 1)) cols = 1;
  if (!(rows >= 1)) rows = 1;
}

function resetAutoReturn() {
  if (autoReturnTimer) {
    clearTimeout(autoReturnTimer);
    autoReturnTimer = null;
  }
}

// Возврат на главный экран через N секунд (только внутри папки; 0 — выключено).
function scheduleAutoReturn() {
  resetAutoReturn();
  const secs = Number(settings['автовозврат_сек']);
  if (!isFinite(secs) || secs <= 0) return;
  if (navStack.length <= 1) return; // на главном экране возвращаться некуда
  autoReturnTimer = setTimeout(() => {
    autoReturnTimer = null;
    navStack = [rootTiles];
    render();
  }, secs * 1000);
}

function makeTileEl(tile) {
  const el = document.createElement('div');
  el.className = 'tile';
  el.dataset.id = tile.id;
  el.style.borderColor = tile.border || DEFAULT_BORDER;

  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = tile.label;

  // «подписи: нет» скрывает подпись только у плиток с картинкой.
  const hideLabel = settings['подписи'] === false && Boolean(tile.image);

  if (tile.image) {
    const img = document.createElement('img');
    img.src = 'content/' + tile.image;
    img.alt = tile.label;
    img.draggable = false;
    img.addEventListener('error', () => {
      // Картинка не найдена — показываем цветной блок с подписью.
      img.remove();
      el.classList.add('no-image');
      label.style.display = '';
    });
    el.appendChild(img);
    if (!hideLabel) el.classList.remove('no-image');
  } else {
    el.classList.add('no-image');
  }

  if (hideLabel) label.style.display = 'none';
  el.appendChild(label);

  el.addEventListener('click', () => onTileClick(tile, el));
  return el;
}

function onTileClick(tile, el) {
  const now = Date.now();
  const prev = lastClickAt.get(tile.id) || 0;
  if (now - prev < ACTIVE_MS) return; // защита от случайного повторного клика
  lastClickAt.set(tile.id, now);

  // Любой новый клик сбрасывает таймер автовозврата.
  resetAutoReturn();

  // Подсветка рамки и лёгкое увеличение на 300 мс.
  el.classList.add('active');

  setTimeout(() => {
    el.classList.remove('active');

    // Затем озвучка.
    if (sound) sound.play(tile);

    const hasChildren = tile.children && tile.children.length > 0;
    if (hasChildren) {
      navStack.push(tile.children);
      render();
    } else if (tile.url) {
      window.open(tile.url, '_blank', 'noopener');
      scheduleAutoReturn();
    } else {
      scheduleAutoReturn();
    }
  }, ACTIVE_MS);
}

function render() {
  screenEl.innerHTML = '';
  screenEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  screenEl.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

  const tiles = navStack[navStack.length - 1] || [];
  for (const tile of tiles) {
    if (tile.visible === false) continue; // невидимые плитки не показываем
    screenEl.appendChild(makeTileEl(tile));
  }

  // «Назад» видна только внутри папки, но место не меняется (visibility).
  backBtn.classList.toggle('is-hidden', navStack.length <= 1);
}

backBtn.addEventListener('click', () => {
  resetAutoReturn();
  if (navStack.length > 1) {
    navStack.pop();
    render();
  }
});

// Отключить контекстное меню и перетаскивание.
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('dragstart', (e) => e.preventDefault());

async function init() {
  let parsed;
  try {
    const res = await fetch('content/content.md');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    parsed = parseContent(text);
  } catch (err) {
    showError(err);
    return;
  }

  settings = parsed.settings || {};
  rootTiles = parsed.tiles || [];
  applyGridSetting();
  sound = new Sound(settings);

  navStack = [rootTiles];
  render();
}

init();
