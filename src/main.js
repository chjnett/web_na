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

let board;
let score;
let level;
let bombs;
let selected;
let bombMode;
let notice;
let finished;
let dropping = new Set();
let busy = false;
let lovePopup = false;
let loveTimer;
let loginError = '';
let isLoggedIn = sessionStorage.getItem('springfield-login') === 'yes';
let best = Number(localStorage.getItem('springfield-best') || 0);
let highest = Number(localStorage.getItem('springfield-highest') || 0);

const randomTile = () => Math.floor(Math.random() * TILE_TYPES.length);

function makeBoard() {
  const next = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => [randomTile(), randomTile()])
  );
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
    const key = `${r}:${c}`;
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
    const key = `${r}:${c}`;
    if (checked.has(key) || topTile(r, c) === null) continue;
    const group = connectedGroup(r, c);
    group.forEach(([gr, gc]) => checked.add(`${gr}:${gc}`));
    if (group.length > 1) moves.push(group);
  }
  return moves;
}

function settle() {
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

function afterMove() {
  updateRecords();
  if (remaining() === 0) {
    if (level === 3) {
      finished = 'win';
      notice = 'ALL 3 LEVELS CLEARED!';
    } else {
      level++;
      bombs += 2;
      board = makeBoard();
      notice = `LEVEL ${level}`;
      setTimeout(() => { notice = ''; render(); }, 1300);
    }
  } else if (!findMoves().length) {
    bombMode = bombs > 0;
    finished = bombs > 0 ? false : 'lose';
    notice = bombs > 0 ? 'NO MOVES — PICK A TILE TO BOMB' : 'NO MOVES LEFT';
  }
}

function removeGroup(group, withBomb = false) {
  group.forEach(([r, c]) => board[r][c].pop());
  score += withBomb ? 25 : group.length * group.length * 10;
  selected = [];
  settle();
  afterMove();
  render();
}

function celebrateMatch(group) {
  busy = true;
  selected = [];
  dropping = new Set(group.map(([r, c]) => `${r}:${c}`));
  notice = 'MATCH FOUND!';
  render();

  setTimeout(() => {
    dropping = new Set();
    lovePopup = true;
    busy = false;
    removeGroup(group);
    clearTimeout(loveTimer);
    loveTimer = setTimeout(() => {
      lovePopup = false;
      render();
    }, 1500);
  }, 430);
}

function clickTile(row, col) {
  if (finished || busy || topTile(row, col) === null) return;
  if (bombMode) {
    bombs--;
    bombMode = false;
    removeGroup([[row, col]], true);
    return;
  }

  const group = connectedGroup(row, col);
  if (group.length < 2) {
    selected = [];
    notice = 'MATCH 2 OR MORE';
    render();
    return;
  }

  if (selected.some(([r, c]) => r === row && c === col)) {
    celebrateMatch(group);
  } else {
    selected = group;
    notice = `${group.length} TILE MATCH — CLICK AGAIN`;
    render();
  }
}

function useBomb() {
  if (!bombs || finished) return;
  selected = [];
  bombMode = !bombMode;
  notice = bombMode ? 'BOMB READY — PICK ONE TILE' : '';
  render();
}

function showHint() {
  const move = findMoves().sort((a, b) => b.length - a.length)[0];
  if (!move) return;
  selected = move;
  notice = 'TRY THIS GROUP';
  render();
  setTimeout(() => {
    selected = [];
    notice = '';
    render();
  }, 950);
}

function newGame() {
  board = makeBoard();
  score = 0;
  level = 1;
  bombs = 5;
  selected = [];
  bombMode = false;
  notice = '';
  finished = false;
  dropping = new Set();
  busy = false;
  lovePopup = false;
  render();
}

function attemptLogin(event) {
  event.preventDefault();
  const passwordInput = document.querySelector('#password');
  const password = String(passwordInput?.value || '')
    .normalize('NFKD')
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  const expectedPassword = '자기'.normalize('NFKD');
  if (password === expectedPassword) {
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

function render() {
  if (!isLoggedIn) {
    const previewTiles = TILE_TYPES.slice(0, 5).map(src => `<span><img src="${src}" alt=""></span>`).join('');
    app.innerHTML = `<main class="login-page">
      <section class="login-card ${loginError ? 'has-error' : ''}">
        <div class="login-tiles" aria-hidden="true">${previewTiles}</div>
        <p class="eyebrow">WELCOME TO</p>
        <h1>SPRINGFIELD<br>TILES</h1>
        <form id="loginForm">
          <label for="nickname">PLAYER</label>
          <input id="nickname" name="nickname" value="나물" autocomplete="username">
          <label for="password">PASSWORD</label>
          <input id="password" name="password" type="password" placeholder="자기" autocomplete="current-password" inputmode="text" required>
          <p class="login-error" role="alert">${loginError}</p>
          <button type="submit">[ START GAME ]</button>
        </form>
        <p class="login-note">A LITTLE PUZZLE MADE WITH LOVE ♥</p>
      </section>
    </main>`;
    document.querySelector('#loginForm').onsubmit = attemptLogin;
    return;
  }

  const selectedKeys = new Set(selected.map(([r, c]) => `${r}:${c}`));
  const tiles = board.map((row, r) => row.map((stack, c) => {
    const type = topTile(r, c);
    const classes = [
      'tile',
      stack.length === 0 ? 'is-empty' : '',
      stack.length === 2 ? 'is-stacked' : '',
      selectedKeys.has(`${r}:${c}`) ? 'is-selected' : '',
      dropping.has(`${r}:${c}`) ? 'is-dropping' : ''
    ].filter(Boolean).join(' ');
    return `<button class="${classes}" data-row="${r}" data-col="${c}" ${type === null ? 'disabled' : ''} aria-label="타일 ${r + 1}-${c + 1}">
      ${type === null ? '' : `<img src="${TILE_TYPES[type]}" alt="" draggable="false">`}
    </button>`;
  }).join('')).join('');

  app.innerHTML = `<main class="game-page">
    <header class="scoreboard">
      <span>YOUR BEST SCORE: <b>${best.toLocaleString()}</b></span>
      <span>HIGHEST LEVEL FINISHED: <b>${highest}</b> OF 3</span>
      <span class="maker">SPRINGFIELD TILES</span>
    </header>

    <section class="game-layout">
      <aside class="bomb-stack" aria-label="폭탄 ${bombs}개">
        ${Array.from({ length: 5 }, (_, i) => `<button class="tnt ${i >= bombs ? 'is-used' : ''} ${bombMode && i === Math.min(bombs - 1, 4) ? 'is-armed' : ''}" title="폭탄 사용">TNT</button>`).join('')}
      </aside>
      <div class="board" aria-label="게임 보드">${tiles}</div>
    </section>

    <section class="game-footer">
      <strong class="tile-count">${remaining()}</strong>
      <div class="notice">${notice}</div>
      <nav class="actions" aria-label="게임 메뉴">
        <button id="bombButton">[ BOMB ]</button>
        <button id="hintButton">[ HINT ]</button>
        <button id="helpButton">[ HELP ]</button>
        <button id="newButton">[ NEW GAME ]</button>
      </nav>
    </section>

    <p class="credit">A CLASSIC TILE-MATCHING PUZZLE · LEVEL ${level} OF 3</p>
  </main>

  <div class="overlay hidden" id="helpOverlay">
    <section class="help-card">
      <h2>HOW TO PLAY</h2>
      <p>Tiles are stacked 2 high. Click a connected group of matching tiles, then click the group once more to remove it.</p>
      <p>Empty spaces collapse downward and to the left. Clear all three levels. When no matches remain, use a bomb on any one tile.</p>
      <button id="closeHelp">[ CLOSE HELP ]</button>
    </section>
  </div>

  ${finished ? `<div class="overlay end-screen"><section class="help-card"><h2>${finished === 'win' ? 'YOU WIN!' : 'GAME OVER'}</h2><p>FINAL SCORE: ${score.toLocaleString()}</p><button id="playAgain">[ PLAY AGAIN ]</button></section></div>` : ''}`;

  if (lovePopup) {
    app.insertAdjacentHTML('beforeend', `<div class="love-pop" role="dialog" aria-live="polite"><div class="love-pop-card"><span class="heart">♥</span><p>MATCH FOUND!</p><h2>나물이 사랑하구나</h2><button id="closeLove">[ 좋아! ]</button></div></div>`);
  }

  document.querySelectorAll('.tile:not(.is-empty)').forEach(tile => {
    tile.onclick = () => clickTile(Number(tile.dataset.row), Number(tile.dataset.col));
  });
  document.querySelectorAll('.tnt:not(.is-used)').forEach(tile => tile.onclick = useBomb);
  document.querySelector('#bombButton').onclick = useBomb;
  document.querySelector('#hintButton').onclick = showHint;
  document.querySelector('#newButton').onclick = newGame;
  document.querySelector('#helpButton').onclick = () => document.querySelector('#helpOverlay').classList.remove('hidden');
  document.querySelector('#closeHelp').onclick = () => document.querySelector('#helpOverlay').classList.add('hidden');
  document.querySelector('#playAgain')?.addEventListener('click', newGame);
  document.querySelector('#closeLove')?.addEventListener('click', () => {
    clearTimeout(loveTimer);
    lovePopup = false;
    render();
  });
}

newGame();
