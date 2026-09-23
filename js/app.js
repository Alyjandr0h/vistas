import * as photos from './photos.js';
import * as music from './music.js';
import { load, save } from './store.js';
import { toast } from './toast.js';

/**
 * ✍️ From you to her.
 * The letter writes itself out in calligraphy the very first time she opens the app, and it stays
 * in the (i) menu so she can read it again. Every visit after that she's greeted by name:
 * "Good morning, Mom".
 * Heads up: the app is a public web page, so anyone with the link could read this.
 */
const FROM_YOU = {
  name: 'Mom',
  letter: [
    'Mom,',
    'I realize I haven’t ever bought you nearly enough flowers over the years.',
    'So today, I’d like to give you a piece of the world.',
  ],
  signature: ['Alex, your son,', 'The Gillyflower'],
};

const $ = selector => document.querySelector(selector);
const openSheets = [];
let greetTimer = 0;

// Hand-drawn ornaments in the spirit of her own penwork: black ink lines, green shading on the
// inside of the curls, green leaves and buds. Every path has pathLength="1", so CSS can draw it in
// like a pen stroke (stroke-dashoffset from 1 to 0), and the green fills in afterwards.
const vine = corner => `<svg class="vine ${corner}" viewBox="0 0 120 120" aria-hidden="true">
  <g class="shade">
    <path pathLength="1" d="M22 14 C16 10 10 14 14 22" transform="translate(1.6 1.6)"/>
    <path pathLength="1" d="M56 8 C52 20 64 24 66 16 C67 11 61 10 60 14" transform="translate(-1.4 1.2)"/>
    <path pathLength="1" d="M8 56 C20 52 24 64 16 66 C11 67 10 61 14 60" transform="translate(1.2 -1.4)"/>
  </g>
  <g class="line">
    <path pathLength="1" d="M22 14 C16 10 10 14 14 22"/>
    <path pathLength="1" d="M14 22 C30 8 56 6 78 10 C92 13 102 12 112 6"/>
    <path pathLength="1" d="M22 14 C8 30 6 56 10 78 C13 92 12 102 6 112"/>
    <path pathLength="1" d="M56 8 C52 20 64 24 66 16 C67 11 61 10 60 14"/>
    <path pathLength="1" d="M8 56 C20 52 24 64 16 66 C11 67 10 61 14 60"/>
  </g>
  <g class="leaves">
    <path pathLength="1" d="M34 10 C38 2 47 1 50 3 C46 9 40 11 34 10 M34 10 L46 5"/>
    <path pathLength="1" d="M86 11 C90 18 98 21 102 19 C99 13 93 11 86 11 M86 11 L98 17"/>
    <path pathLength="1" d="M10 34 C2 38 1 47 3 50 C9 46 11 40 10 34 M10 34 L5 46"/>
    <path pathLength="1" d="M11 86 C18 90 21 98 19 102 C13 99 11 93 11 86 M11 86 L17 98"/>
  </g>
  <circle class="bud" cx="112" cy="6" r="2.6"/><circle class="bud" cx="6" cy="112" r="2.6"/>
  <circle class="bud" cx="60" cy="14" r="1.8"/><circle class="bud" cx="14" cy="60" r="1.8"/>
</svg>`;
const FLOURISH = `<svg class="flourish" viewBox="0 0 240 32" aria-hidden="true">
  <path pathLength="1" d="M118 20 C104 26 92 24 80 16 C66 7 44 6 30 14 C22 19 22 27 30 27 C36 27 38 20 32 18"/>
  <path pathLength="1" d="M122 20 C136 26 148 24 160 16 C174 7 196 6 210 14 C218 19 218 27 210 27 C204 27 202 20 208 18"/>
  <path class="leaf" pathLength="1" d="M120 20 C114 12 116 6 120 3 C124 6 126 12 120 20"/>
  <path class="leaf" pathLength="1" d="M120 19 C112 17 108 12 109 9 C114 9 118 13 120 19"/>
  <path class="leaf" pathLength="1" d="M120 19 C128 17 132 12 131 9 C126 9 122 13 120 19"/>
</svg>`;
const addVines = el => el.insertAdjacentHTML('afterbegin', vine('tl') + vine('br'));

// Who is using this copy: Mom (the letter, "Good morning, Mom", your note in Help) or someone she
// shared it with (the same app without the personal parts). Any phone that used the app before
// sharing existed is hers. On a new phone of hers, the link …/vistas/?for=mom brings the letter back.
function whoIsThis() {
  if (new URLSearchParams(location.search).get('for') === 'mom') save('for', 'mom');
  let who = load('for', null);
  if (!who) {
    who = load('welcomed', false) || load('photos.history', null) ? 'mom' : 'friend';
    save('for', who);
  }
  return who;
}
const forMom = whoIsThis() === 'mom';

function boot() {
  navigator.serviceWorker?.register('sw.js').catch(() => {});
  // A problem in one part (say, music) must never stop the letter or the photos from showing.
  for (const setUp of [setUpSheets, setUpPhotoButtons, setUpMusic, setUpInfo, setUpInstall, keepScreenAwake, measureControls]) {
    try { setUp(); } catch (err) { console.error(err); }
  }

  const firstTime = !load('welcomed', false);
  const letterFirst = forMom && firstTime;
  if (letterFirst) photos.hold('letter', true);
  photos.init({
    stage: $('#stage'), status: $('#status'), title: $('#cap-title'), credit: $('#cap-credit'),
    bar: $('#bar'), pause: $('#btn-pause'), pauseIcon: $('#btn-pause use'),
    save: $('#btn-save'), saveLabel: $('#save-label'), savedCount: $('#saved-count'),
    clockTime: $('#clock-time'), clockDate: $('#clock-date'),
  }, { startWithFirstPhoto: letterFirst }).catch(err => {
    console.error(err);
    $('#status').textContent = 'Couldn’t load the photos. Check the internet, then close and reopen the app.';
  });

  if (letterFirst) showLetter();
  else if (firstTime) {
    // Someone Mom shared it with: a welcome instead of the letter, then how it works.
    openingScreen('Welcome to Paradise', () => { save('welcomed', true); openSheet($('#sheet-info')); });
  } else openingScreen();
  greetAgainAfterABreak();
  if (!firstTime && new URLSearchParams(location.search).get('open') === 'music') openSheet($('#sheet-music'));
}

// ------------------------------------------------------------------ calligraphy

const scriptFont = () => getComputedStyle(document.documentElement).getPropertyValue('--script').split(',')[0].trim();

function fontReady() {
  const loaded = document.fonts?.load(`40px ${scriptFont()}`) ?? Promise.resolve();
  return Promise.race([loaded, new Promise(resolve => setTimeout(resolve, 2500))]).catch(() => {});
}

// Reveals text a word at a time, left to right, like ink from a pen. Returns when it'll finish (ms).
function writeOut(el, text, startAt, msPerLetter = 42) {
  let t = startAt;
  for (const word of text.split(' ')) {
    const span = document.createElement('span');
    span.className = 'ink';
    span.textContent = word;
    const duration = Math.max(220, word.length * msPerLetter);
    span.style.animationDelay = `${t}ms`;
    span.style.animationDuration = `${duration}ms`;
    el.append(span, ' ');
    t += duration + 60;
  }
  return t;
}

const letterLines = () => [...FROM_YOU.letter, ...[].concat(FROM_YOU.signature ?? [])].filter(Boolean);
const isSignature = i => i >= FROM_YOU.letter.length;

async function showLetter() {
  const box = $('#letter'), paper = $('#letter-text'), begin = $('#letter-begin');
  addVines(paper);
  box.hidden = false;
  await fontReady();
  const lines = letterLines();
  let t = 500;
  for (const [i, line] of lines.entries()) {
    const p = document.createElement('p');
    if (isSignature(i)) p.className = 'signature';
    paper.append(p);
    t = writeOut(p, line, t) + 380;
  }
  const finish = () => { box.classList.add('done'); begin.classList.add('show'); };
  const finishTimer = setTimeout(finish, t);
  paper.addEventListener('click', () => { clearTimeout(finishTimer); finish(); });   // tap to skip ahead
  begin.onclick = () => {
    save('welcomed', true);
    box.classList.add('leaving');
    setTimeout(() => { box.hidden = true; }, 900);
    photos.hold('letter', false);
  };
}

// Writes the greeting and fades it out on its own. Returns when the writing finishes (ms).
function greet(text) {
  const hour = new Date().getHours();
  const hello = hour < 5 ? 'Hello' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const box = $('#greeting'), line = $('#greeting-text');
  line.replaceChildren();
  const end = writeOut(line, text ?? (forMom && FROM_YOU.name ? `${hello}, ${FROM_YOU.name}` : hello), 200, 70);
  $('#greeting-flourish').innerHTML = FLOURISH;          // a fresh copy, so it draws in again
  $('#greeting-flourish').style.setProperty('--draw-delay', `${end}ms`);
  $('#greeting-date').textContent = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  box.classList.remove('fade');
  box.hidden = false;
  document.body.classList.add('greeting-on');
  clearTimeout(greetTimer);
  greetTimer = setTimeout(hideGreeting, end + 2800);
  return end;
}

function hideGreeting() {
  clearTimeout(greetTimer);
  $('#greeting').classList.add('fade');
  greetTimer = setTimeout(() => {
    $('#greeting').hidden = true;
    document.body.classList.remove('greeting-on', 'splash-on');
  }, 1300);
}

const isNight = () => { const h = new Date().getHours(); return h >= 19 || h < 6; };

// Her painting (the day one, or her mountain at night) with the greeting underneath. It fades
// into the photos once the greeting is written and the first photo is ready; a tap skips it.
function openingScreen(greeting, afterwards) {
  const splash = $('#splash');
  $('#splash-art').src = isNight() ? 'img/painting-night.jpg' : 'img/painting-day.jpg';
  splash.hidden = false;
  document.body.classList.add('splash-on');
  photos.hold('splash', true);
  let photoReady = false, greeted = false, closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    splash.classList.add('fade');
    hideGreeting();
    photos.hold('splash', false);
    setTimeout(() => { splash.hidden = true; afterwards?.(); }, 900);
  };
  const closeWhenReady = () => { if (photoReady && greeted) close(); };
  photos.onChange(() => { photoReady = true; closeWhenReady(); });
  splash.addEventListener('click', close);
  fontReady().then(() => {
    const end = greet(greeting);
    setTimeout(() => { greeted = true; closeWhenReady(); }, end + 1600);
  });
}

// Coming back to the app after a while feels like opening it again, so say hello again.
function greetAgainAfterABreak() {
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 30 * 60 * 1000 && load('welcomed', false)) greet();
  });
}

// ------------------------------------------------------------------ sheets (they slide up)

// Each sheet gets a history entry, so the phone's own Back gesture closes it instead of the app.
function openSheet(node) {
  if (openSheets.includes(node)) return;
  node.inert = false;
  node.classList.add('open');
  openSheets.push(node);
  history.pushState({ sheet: node.id }, '');
  photos.hold('sheet', true);
  node.dispatchEvent(new Event('open'));
}

function closeTopSheet() {
  const node = openSheets.pop();
  if (!node) return;
  node.classList.remove('open');
  node.inert = true;
  if (!openSheets.length) photos.hold('sheet', false);
}

function setUpSheets() {
  addEventListener('popstate', closeTopSheet);
  document.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) history.back();
  });
}

// ------------------------------------------------------------------ photos

function setUpPhotoButtons() {
  $('#btn-next').onclick = () => photos.next();
  $('#btn-back').onclick = () => photos.back();
  $('#btn-save').onclick = () => photos.saveCurrent();
  $('#btn-share').onclick = () => photos.shareCurrent();
  $('#btn-pause').onclick = () => photos.togglePause();
  $('#btn-saver').onclick = () => photos.enterSaver();
  $('#btn-saved').onclick = () => openSheet($('#sheet-saved'));
  $('#btn-info').onclick = () => openSheet($('#sheet-info'));
  $('#btn-music-top').onclick = () => openSheet($('#sheet-music'));
  $('#sheet-saved').addEventListener('open', renderSavedGrid);

  document.addEventListener('keydown', e => {
    if (openSheets.length || e.target.closest('input')) return;
    if (e.key === 'ArrowRight') photos.next();
    else if (e.key === 'ArrowLeft') photos.back();
    else if (e.key === ' ') { e.preventDefault(); photos.togglePause(); }
  });
}

function renderSavedGrid() {
  const list = photos.savedPhotos();
  $('#saved-grid').replaceChildren(...list.map(p => {
    const tile = document.createElement('button');
    tile.style.backgroundImage = `url("${photos.photoUrl(p, 330)}")`;
    tile.setAttribute('aria-label', p.t);
    tile.onclick = () => openViewer(p, { fromSaved: true });
    return tile;
  }));
  $('#saved-empty').hidden = list.length > 0;
}

const mapLink = p => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.g ? p.g.join(',') : p.t)}`;

// A photo, big. From the Saved list it offers Remove; from the music screen it offers Save.
function openViewer(p, { fromSaved = false, loadedUrl } = {}) {
  $('#viewer-img').src = loadedUrl || photos.photoUrl(p, 1280);
  $('#viewer-img').alt = p.t;
  $('#viewer-title').textContent = p.t;
  $('#viewer-credit').textContent = `Photo: ${p.a} · ${p.l}`;
  const saveButton = $('#v-save');
  const showSaved = on => {
    saveButton.classList.toggle('is-saved', on);
    saveButton.querySelector('span').textContent = on ? 'Saved' : 'Save';
  };
  saveButton.hidden = fromSaved;
  $('#v-remove').hidden = !fromSaved;
  showSaved(photos.isSavedPhoto(p));
  saveButton.onclick = async () => {
    saveButton.disabled = true;
    showSaved(await photos.savePhoto(p, loadedUrl));
    saveButton.disabled = false;
  };
  $('#v-share').onclick = () => photos.sharePhoto(p, loadedUrl);
  $('#v-map').hidden = !p.g && !!p.u;          // Pexels photos don't say where they were taken
  $('#v-map').onclick = () => window.open(mapLink(p), '_blank', 'noopener');
  $('#v-remove').onclick = () => {
    photos.removeSaved(p);
    renderSavedGrid();
    history.back();
    toast('Removed from this list. It’s still in your Gallery.');
  };
  openSheet($('#viewer'));
}

// Photos sit between the top buttons and the bottom panel, never underneath them.
function measureControls() {
  const root = document.documentElement.style;
  const top = $('.topbar'), panel = $('.panel');
  const update = () => {
    root.setProperty('--top-gap', `${Math.max(0, top.offsetHeight - 20)}px`);
    root.setProperty('--bottom-gap', `${Math.max(0, panel.offsetHeight - 34)}px`);
  };
  const watcher = new ResizeObserver(update);
  watcher.observe(top);
  watcher.observe(panel);
  update();
}

// ------------------------------------------------------------------ music

const rowSongs = new Map();        // songs in the music screen's list
const playlistSongs = new Map();   // songs in the open playlist
let openPlaylistKey = null;

// Taps on a song list: the heart (un)favorites the song; anywhere else on the row plays it.
const songListTaps = (songs, play) => e => {
  const button = e.target.closest('button[data-action]');
  const song = button && songs.get(button.closest('li').dataset.id);
  if (!song) return;
  if (button.dataset.action === 'heart') music.toggleFavorite(song);
  else play(song);
};

function setUpMusic() {
  music.init({
    artwork: () => {
      const p = photos.currentPhoto();
      return p
        ? [{ src: photos.photoUrl(p, 500), sizes: `500x${Math.round((500 * p.h) / p.w)}`, type: 'image/jpeg' }]
        : [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }];
    },
  });
  $('#mb-play').onclick = () => music.toggle();
  $('#mb-open').onclick = () => openSheet($('#sheet-music'));
  // The photo on the music screen opens big, to save or share it.
  $('#np-art').onclick = () => {
    const p = photos.currentPhoto();
    if (p) openViewer(p, { loadedUrl: photos.currentImageUrl() });
  };
  $('#m-play').onclick = () => music.toggle();
  $('#m-next').onclick = () => music.next();
  $('#m-back').onclick = () => music.back();
  $('#m-fav').onclick = () => music.toggleFavorite();
  $('#m-playlists').onclick = e => {
    const button = e.target.closest('[data-playlist]');
    if (button) openPlaylist(button.dataset.playlist);
  };
  $('#m-list').onclick = songListTaps(rowSongs, song => music.playSong(song));
  $('#pl-list').onclick = songListTaps(playlistSongs, song => music.playFrom(openPlaylistKey, song));
  $('#pl-shuffle').onclick = () => music.playFrom(openPlaylistKey);
  music.events.addEventListener('change', () => { renderMusic(); renderPlaylistSheet(); });
  music.events.addEventListener('time', renderSongTime);
  $('#sheet-music').addEventListener('open', renderMusic);
  renderMusic();
}

function setIcon(button, icon, label) {
  button.querySelector('use').setAttribute('href', `#${icon}`);
  button.setAttribute('aria-label', label);
}

function renderMusic() {
  const { current, playing, playlist, favorites } = music.state();

  $('#minibar').classList.toggle('playing', playing);
  $('#mb-title').textContent = current ? current.t : 'Play music';
  $('#mb-sub').textContent = music.playlistName(playlist);
  setIcon($('#mb-play'), playing ? 'i-pause' : 'i-play', playing ? 'Pause music' : 'Play music');
  setIcon($('#m-play'), playing ? 'i-pause' : 'i-play', playing ? 'Pause' : 'Play');

  $('#np-title').textContent = current ? current.t : 'Ready when you are';
  $('#np-sub').textContent = current ? `${music.sourceName(current.c)} · jw.org` : `Tap play for ${music.playlistName(playlist)}`;
  const art = photos.currentImageUrl();
  $('#np-art').style.backgroundImage = art ? `url("${art}")` : '';
  $('#np-art').disabled = !art;

  const fav = music.isFavorite(current);
  $('#m-fav').classList.toggle('on', fav);
  $('#m-fav').disabled = !current;
  $('#m-fav-label').textContent = fav ? 'In your favorites' : 'Add to favorites';

  renderPlaylists(playlist);
  const list = playlist === 'favorites' ? favorites : music.recent();
  $('#m-list-title').textContent = playlist === 'favorites' ? 'Your favorites' : 'Recently played';
  rowSongs.clear();
  $('#m-list').replaceChildren(...(list.length ? list.map(song => songRow(song, current)) : [emptyRow(playlist)]));
  renderSongTime();
}

function renderPlaylists(active) {
  $('#m-playlists').replaceChildren(...music.PLAYLISTS.map(p => {
    const button = document.createElement('button');
    button.dataset.playlist = p.key;
    button.setAttribute('aria-pressed', String(p.key === active));
    const name = document.createElement('b');
    name.textContent = p.name;
    const about = document.createElement('small');
    const count = music.songsIn(p.key).length;
    about.textContent = count ? `${p.blurb} · ${count}` : p.blurb;
    button.append(name, about);
    return button;
  }));
}

// A playlist's own page: every song in it to scroll through and pick, or Shuffle all.
function openPlaylist(key) {
  openPlaylistKey = key;
  $('#pl-title').textContent = music.playlistName(key);
  renderPlaylistSheet();
  $('#sheet-playlist .body').scrollTop = 0;
  openSheet($('#sheet-playlist'));
}

function renderPlaylistSheet() {
  if (!openPlaylistKey) return;
  const list = music.songsIn(openPlaylistKey);
  const { current } = music.state();
  $('#pl-count').textContent = list.length ? `${list.length} songs · tap one to play it` : '';
  playlistSongs.clear();
  $('#pl-list').replaceChildren(...(list.length
    ? list.map(song => songRow(song, current, playlistSongs))
    : [emptyRow(openPlaylistKey, 'Getting the songs from jw.org…')]));
}

function songRow(song, current, songs = rowSongs) {
  songs.set(song.id, song);
  const li = document.createElement('li');
  li.dataset.id = song.id;
  li.classList.toggle('now', song.id === current?.id);
  const playButton = document.createElement('button');
  playButton.className = 'song';
  playButton.dataset.action = 'play';
  const title = document.createElement('b');
  title.textContent = song.t;
  const where = document.createElement('small');
  where.textContent = music.sourceName(song.c);
  playButton.append(title, where);
  const fav = music.isFavorite(song);
  const heart = document.createElement('button');
  heart.className = `heart${fav ? ' on' : ''}`;
  heart.dataset.action = 'heart';
  heart.setAttribute('aria-label', fav ? `Remove ${song.t} from favorites` : `Add ${song.t} to favorites`);
  heart.innerHTML = '<svg><use href="#i-heart"/></svg>';
  li.append(playButton, heart);
  return li;
}

function emptyRow(playlist, otherwise = 'Songs you play will show up here.') {
  const li = document.createElement('li');
  li.className = 'empty-row';
  li.textContent = playlist === 'favorites' ? 'No favorites yet. Tap the heart on a song you love.' : otherwise;
  return li;
}

const minutes = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function renderSongTime() {
  const { current, position, duration } = music.state();
  $('#np-bar').style.width = duration ? `${Math.min(100, (position / duration) * 100)}%` : '0%';
  $('#np-pos').textContent = current ? minutes(position) : '';
  $('#np-dur').textContent = current && duration ? minutes(duration) : '';
}

// ------------------------------------------------------------------ help and settings

// Shares the plain link (never the ?for=mom one), so whoever gets it has their own copy.
async function shareApp() {
  const url = location.origin + location.pathname;
  const text = 'Paradise: breathtaking photos of the world, and songs from jw.org. '
    + 'Open the link in Chrome, then tap ⋮ and “Add to Home screen” to keep it as an app.';
  try {
    if (navigator.share) await navigator.share({ title: 'Paradise', text, url });
    else {
      await navigator.clipboard.writeText(url);
      toast('Link copied');
    }
  } catch (err) {
    if (err?.name !== 'AbortError') toast('Couldn’t share just now. Try again?');
  }
}

function setUpInfo() {
  $('#btn-share-app').onclick = shareApp;
  const lines = forMom ? letterLines() : [];
  if (lines.length) {
    $('#note').replaceChildren(...lines.map((line, i) => {
      const p = document.createElement('p');
      p.textContent = line;
      if (isSignature(i)) p.className = 'signature';
      return p;
    }));
    addVines($('#note'));
    $('#note').hidden = false;
  }

  const speed = $('#speed');
  const markSpeed = () => speed.querySelectorAll('[data-s]')
    .forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.s) === photos.getSeconds())));
  speed.onclick = e => {
    const button = e.target.closest('[data-s]');
    if (!button) return;
    photos.setSeconds(Number(button.dataset.s));
    markSpeed();
  };
  markSpeed();
}

function setUpInstall() {
  let installPrompt = null;
  $('#install-box').hidden = navigator.standalone || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
  if (photos.onApple()) {
    $('#install-tip').innerHTML = 'To keep this on your Home Screen: in Safari, tap <b>Share</b> (the square with the arrow), then <b>Add to Home Screen</b>.';
  }
  addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    installPrompt = e;
    $('#btn-install').hidden = false;
    $('#install-tip').hidden = true;
  });
  $('#btn-install').onclick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    installPrompt = null;
    if (outcome === 'accepted') $('#install-box').hidden = true;
  };
  addEventListener('appinstalled', () => { $('#install-box').hidden = true; });
}

// ------------------------------------------------------------------ keep the screen on

// Like the TV: the screen stays on while she's watching. It's allowed to sleep after 10 quiet
// minutes (unless the screen saver is on), so a forgotten phone doesn't drain its battery.
function keepScreenAwake() {
  if (!('wakeLock' in navigator)) return;
  let lock = null, busy = false, lastTouch = Date.now();
  const wanted = () => document.visibilityState === 'visible'
    && (document.body.classList.contains('saver') || Date.now() - lastTouch < 10 * 60 * 1000);
  const update = async () => {
    if (busy) return;
    busy = true;
    try {
      if (wanted() && !lock) {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => { lock = null; });
      } else if (!wanted() && lock) {
        await lock.release();
        lock = null;
      }
    } catch {
      lock = null;
    } finally {
      busy = false;
    }
  };
  addEventListener('pointerdown', () => { lastTouch = Date.now(); update(); }, { passive: true });
  document.addEventListener('visibilitychange', update);
  setInterval(update, 30_000);
  update();
}

boot();
