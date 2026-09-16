import './style.css';
import bart from './assets/tiles/bart.png';
import krusty from './assets/tiles/krusty.png';
import lisa from './assets/tiles/lisa.png';
import otto from './assets/tiles/otto.png';
import marge from './assets/tiles/marge.png';
import homer from './assets/tiles/homer.png';
import grampa from './assets/tiles/grampa.png';

const ROWS = 9;
const COLS = 17;
const TILE_TYPES = [bart, krusty, lisa, otto, marge, homer, grampa];
const app = document.querySelector('#app');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let board;
let score;
let level;
let bombs;
let bombMode;
let notice;
let finished;
let busy;
let dropping = new Set();
let settling = new Set();
let lovePopup = false;
let loveTimer;
let loginError = '';
let isLoggedIn = sessionStorage.getItem('springfield-login') === 'yes';
let best = Number(localStorage.getItem('springfield-best') || 0);
let highest = Number(localStorage.getItem('springfield-highest') || 0);

const randomTile = () => Math.floor(Math.random() * TILE_TYPES.length);
const keyOf = (r, c) => `${r}:${c}`;

function makeBoard() {
  const next = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => [randomTile(), randomTile()])
  );
  // Preserve the random layout while guaranteeing at least two opening moves.
  next[7][0][1] = next[8][0][1] = 0;
  next[4][8][1] = next[4][9][1] = next[5][9][1] = 1;
  return next;
}

function topTile(row, col) {
  const stack = board[row]?.[col];
  return stack?.length ? stack[stack.length - 1] : null;
}

function connectedGroup(row, col) {
  const type = topTile(row, col);
  if (type === null) return [];
  const queue = [[row, col]];
  const seen = new Set();
  const group = [];

  while (queue.length) {
    const [r, c] = queue.pop();
    const key = keyOf(r, c);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS || seen.has(key) || topTile(r, c) !== type) continue;
    seen.add(key);
    group.push([r, c]);
    queue.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
  }
  return group;
}

function findMoves() {
  const checked = new Set();
  const moves = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const key = keyOf(r, c);
    if (checked.has(key) || topTile(r, c) === null) continue;
    const group = connectedGroup(r, c);
    group.forEach(([gr, gc]) => checked.add(keyOf(gr, gc)));
    if (group.length > 1) moves.push(group);
  }
  return moves;
}

function settle() {
  const before = new Map();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (board[r][c].length) before.set(board[r][c], keyOf(r, c));
  }

  for (let c = 0; c < COLS; c++) {
    const stacks = [];
    for (let r = ROWS - 1; r >= 0; r--) if (board[r][c].length) stacks.push(board[r][c]);
    for (let r = ROWS - 1; r >= 0; r--) board[r][c] = stacks[ROWS - 1 - r] || [];
  }

  let targetCol = 0;
  for (let c = 0; c < COLS; c++) {
    if (!board.some(row => row[c].length)) continue;
    if (c !== targetCol) for (let r = 0; r < ROWS; r++) {
      board[r][targetCol] = board[r][c];
      board[r][c] = [];
    }
    targetCol++;
  }

  const moved = new Set();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const stack = board[r][c];
    if (stack.length && before.get(stack) !== keyOf(r, c)) moved.add(keyOf(r, c));
  }
  return moved;
}

function groupsCreatedBy(moved) {
  const groups = [];
  const claimed = new Set();
  for (const key of moved) {
    const [r, c] = key.split(':').map(Number);
    if (claimed.has(key) || topTile(r, c) === null) continue;
    const group = connectedGroup(r, c);
    if (group.length < 2) continue;
    const unseen = group.some(([gr, gc]) => !claimed.has(keyOf(gr, gc)));
    if (!unseen) continue;
    group.forEach(([gr, gc]) => claimed.add(keyOf(gr, gc)));
    groups.push(group);
  }
  return groups;
}

function remaining() {
  return board.reduce((sum, row) => sum + row.reduce((count, stack) => count + stack.length, 0), 0);
}

function updateRecords() {
  if (score > best) {
    best = score;
    localStorage.setItem('springfield-best', String(best));
  }
  if (level - 1 > highest) {
    highest = level - 1;
    localStorage.setItem('springfield-highest', String(highest));
  }
}

async function resolveGravityAndCombos() {
  let moved = settle();
  let chain = 0;

  while (moved.size) {
    settling = moved;
    render();
    await sleep(280);
    settling = new Set();

    const combos = groupsCreatedBy(moved);
    if (!combos.length) break;
    chain++;
    const comboTiles = combos.flat();
    dropping = new Set(comboTiles.map(([r, c]) => keyOf(r, c)));
    bombs = Math.min(9, bombs + combos.length);
    score += comboTiles.length * 10 * (chain + 1);
    notice = `AUTO COMBO × ${chain}  +${combos.length} BOMB${combos.length > 1 ? 'S' : ''}`;
    render();
    await sleep(430);

    combos.forEach(group => group.forEach(([r, c]) => board[r][c].pop()));
    dropping = new Set();
    moved = settle();
  }
}

async function afterMove() {
  updateRecords();
  if (remaining() === 0) {
    if (level === 3) {
      finished = 'win';
      notice = 'ALL 3 LEVELS CLEARED!';
      busy = false;
      render();
      return;
    }
    highest = Math.max(highest, level);
    localStorage.setItem('springfield-highest', String(highest));
    level++;
    notice = `LEVEL ${level}`;
    render();
    await sleep(1100);
    board = makeBoard();
    notice = '';
    busy = false;
    render();
    return;
  }

  if (!findMoves().length) {
    if (bombs > 0) {
      bombMode = true;
      notice = 'NO MOVES — BOMB READY';
    } else {
      finished = 'lose';
      notice = 'NO MOVES LEFT';
    }
  } else {
    bombMode = false;
    if (!notice.startsWith('AUTO COMBO')) notice = '';
  }
  busy = false;
  render();
}

async function removeMatch(group, withBomb = false) {
  if (busy) return;
  busy = true;
  dropping = new Set(group.map(([r, c]) => keyOf(r, c)));
  notice = withBomb ? 'BOMB!' : `${group.length} TILE MATCH`;
  render();
  await sleep(430);

  group.forEach(([r, c]) => board[r][c].pop());
  dropping = new Set();
  score += withBomb ? 0 : group.length * 10;

  if (!withBomb) {
    lovePopup = true;
    clearTimeout(loveTimer);
    loveTimer = setTimeout(() => {
      lovePopup = false;
      render();
    }, 1500);
  }

  await resolveGravityAndCombos();
  await afterMove();
}

function clickTile(row, col) {
  if (finished || busy || topTile(row, col) === null) return;
  if (bombMode) {
    bombs--;
    bombMode = false;
    removeMatch([[row, col]], true);
    return;
  }
  const group = connectedGroup(row, col);
  if (group.length > 1) removeMatch(group);
}

function newGame() {
  board = makeBoard();
  score = 0;
  level = 1;
  bombs = 5;
  bombMode = false;
  notice = '';
  finished = false;
  busy = false;
  dropping = new Set();
  settling = new Set();
  lovePopup = false;
  render();
}

function attemptLogin(event) {
  event.preventDefault();
  const passwordInput = document.querySelector('#password');
  const password = String(passwordInput?.value || '')
    .normalize('NFKD')
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  if (password === '자기'.normalize('NFKD')) {
    sessionStorage.setItem('springfield-login', 'yes');
    isLoggedIn = true;
    loginError = '';
    render();
  } else {
    loginError = '비밀번호가 달라요. 다시 생각해 봐요!';
    render();
    document.querySelector('#password')?.focus();
  }
}

function bindBombCursor() {
  const cursor = document.querySelector('#bombCursor');
  const gameBoard = document.querySelector('.board');
  if (!cursor || !gameBoard || !bombMode) return;
  gameBoard.onpointermove = event => {
    cursor.style.left = `${event.clientX + 14}px`;
    cursor.style.top = `${event.clientY + 14}px`;
    cursor.classList.add('visible');
  };
  gameBoard.onpointerleave = () => cursor.classList.remove('visible');
}

function render() {
  if (!isLoggedIn) {
    const previewTiles = TILE_TYPES.slice(0, 5).map(src => `<span><img src="${src}" alt=""></span>`).join('');
    app.innerHTML = `<main class="login-page"><section class="login-card ${loginError ? 'has-error' : ''}">
      <div class="login-tiles" aria-hidden="true">${previewTiles}</div><p class="eyebrow">WELCOME TO</p><h1>SPRINGFIELD<br>TILES</h1>
      <form id="loginForm"><label for="nickname">PLAYER</label><input id="nickname" name="nickname" value="나물" autocomplete="username">
      <label for="password">PASSWORD</label><input id="password" name="password" type="text" placeholder="자기" autocomplete="off" inputmode="text" required>
      <p class="login-error" role="alert">${loginError}</p><button type="submit">[ START GAME ]</button></form>
      <p class="login-note">A LITTLE PUZZLE MADE WITH LOVE ♥</p></section></main>`;
    document.querySelector('#loginForm').onsubmit = attemptLogin;
    return;
  }

  const tiles = board.map((row, r) => row.map((stack, c) => {
    const type = topTile(r, c);
    const key = keyOf(r, c);
    const classes = ['tile', stack.length === 0 ? 'is-empty' : '', stack.length === 2 ? 'is-stacked' : '', dropping.has(key) ? 'is-dropping' : '', settling.has(key) ? 'is-settling' : ''].filter(Boolean).join(' ');
    return `<button class="${classes}" data-row="${r}" data-col="${c}" ${type === null ? 'disabled' : ''} aria-label="타일 ${r + 1}-${c + 1}">${type === null ? '' : `<img src="${TILE_TYPES[type]}" alt="" draggable="false">`}</button>`;
  }).join('')).join('');

  app.innerHTML = `<main class="game-page">
    <header class="scoreboard"><span>YOUR BEST SCORE: <b>${best}</b></span><span>HIGHEST LEVEL FINISHED: <b>${highest}</b> OF 3</span><span class="maker">SPRINGFIELD TILES</span></header>
    <section class="game-layout"><aside class="bomb-stack" aria-label="폭탄 ${bombs}개">${Array.from({ length: Math.max(5, bombs) }, (_, i) => `<span class="tnt ${i >= bombs ? 'is-used' : ''}">TNT</span>`).join('')}</aside><div class="board ${bombMode ? 'bomb-active' : ''}" aria-label="게임 보드">${tiles}</div></section>
    <section class="game-footer"><strong class="tile-count">${score}</strong><div class="notice">${notice}</div><nav class="actions"><button id="helpButton">[ HELP ]</button><button id="newButton">[ NEW GAME ]</button></nav></section>
    <p class="credit">A CLASSIC TILE-MATCHING PUZZLE · LEVEL ${level} OF 3</p>
  </main>
  <div class="overlay hidden" id="helpOverlay"><section class="help-card"><h2>HOW TO PLAY</h2><p>Tiles are laid out randomly and stacked 2 high. Click any connected group of the same tile to remove it.</p><p>Removing a bottom tile makes a gap. Tiles fall down and every new match made by the fall is cleared automatically, earning points and bombs.</p><p>When there are no moves, the bomb cursor appears. Click any tile to remove it. Clear all 3 levels.</p><button id="closeHelp">[ CLOSE HELP ]</button></section></div>
  ${finished ? `<div class="overlay end-screen"><section class="help-card"><h2>${finished === 'win' ? 'YOU WIN!' : 'GAME OVER'}</h2><p>FINAL SCORE: ${score}</p><button id="playAgain">[ PLAY AGAIN ]</button></section></div>` : ''}
  ${bombMode ? '<div class="bomb-cursor" id="bombCursor">TNT</div>' : ''}`;

  if (lovePopup) app.insertAdjacentHTML('beforeend', `<div class="love-pop" role="dialog" aria-live="polite"><div class="love-pop-card"><span class="heart">♥</span><p>MATCH FOUND!</p><h2>나물이 사랑하구나</h2></div></div>`);

  document.querySelectorAll('.tile:not(.is-empty)').forEach(tile => tile.onclick = () => clickTile(Number(tile.dataset.row), Number(tile.dataset.col)));
  document.querySelector('#newButton').onclick = newGame;
  document.querySelector('#helpButton').onclick = () => document.querySelector('#helpOverlay').classList.remove('hidden');
  document.querySelector('#closeHelp').onclick = () => document.querySelector('#helpOverlay').classList.add('hidden');
  document.querySelector('#playAgain')?.addEventListener('click', newGame);
  bindBombCursor();
}

newGame();
