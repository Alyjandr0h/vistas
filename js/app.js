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
  signature: 'With all my love',   // TODO(you): sign it the way you sign things to her
};

const $ = selector => document.querySelector(selector);
const openSheets = [];
let greetTimer = 0;

function boot() {
  navigator.serviceWorker?.register('sw.js').catch(() => {});
  // A problem in one part (say, music) must never stop the letter or the photos from showing.
  for (const setUp of [setUpSheets, setUpPhotoButtons, setUpMusic, setUpInfo, setUpInstall, keepScreenAwake, measureControls]) {
    try { setUp(); } catch (err) { console.error(err); }
  }

  const firstTime = !load('welcomed', false);
  if (firstTime) photos.hold('letter', true);
  photos.init({
    stage: $('#stage'), status: $('#status'), title: $('#cap-title'), credit: $('#cap-credit'),
    bar: $('#bar'), pause: $('#btn-pause'), pauseIcon: $('#btn-pause use'),
    save: $('#btn-save'), saveLabel: $('#save-label'), savedCount: $('#saved-count'),
    clockTime: $('#clock-time'), clockTitle: $('#clock-title'),
  }, { startWithFirstPhoto: firstTime }).catch(err => {
    console.error(err);
    $('#status').textContent = 'Couldn’t load the photos. Check the internet, then close and reopen the app.';
  });

  if (firstTime) showLetter();
  else openingScreen();
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

const letterLines = () => [...FROM_YOU.letter, FROM_YOU.signature].filter(Boolean);

async function showLetter() {
  const box = $('#letter'), paper = $('#letter-text'), begin = $('#letter-begin');
  box.hidden = false;
  await fontReady();
  const lines = letterLines();
  let t = 500;
  for (const [i, line] of lines.entries()) {
    const p = document.createElement('p');
    if (i === lines.length - 1 && FROM_YOU.signature) p.className = 'signature';
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
function greet() {
  const hour = new Date().getHours();
  const hello = hour < 5 ? 'Hello' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const box = $('#greeting'), line = $('#greeting-text');
  line.replaceChildren();
  const end = writeOut(line, FROM_YOU.name ? `${hello}, ${FROM_YOU.name}` : hello, 200, 70);
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
function openingScreen() {
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
    setTimeout(() => { splash.hidden = true; }, 900);
  };
  const closeWhenReady = () => { if (photoReady && greeted) close(); };
  photos.onChange(() => { photoReady = true; closeWhenReady(); });
  splash.addEventListener('click', close);
  fontReady().then(() => {
    const end = greet();
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
    tile.onclick = () => openViewer(p);
    return tile;
  }));
  $('#saved-empty').hidden = list.length > 0;
}

const mapLink = p => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.g ? p.g.join(',') : p.t)}`;

function openViewer(p) {
  $('#viewer-img').src = photos.photoUrl(p, 1280);
  $('#viewer-img').alt = p.t;
  $('#viewer-title').textContent = p.t;
  $('#viewer-credit').textContent = `Photo: ${p.a} · ${p.l}`;
  $('#v-share').onclick = () => photos.sharePhoto(p);
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

const rowSongs = new Map();

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
  $('#m-play').onclick = () => music.toggle();
  $('#m-next').onclick = () => music.next();
  $('#m-back').onclick = () => music.back();
  $('#m-fav').onclick = () => music.toggleFavorite();
  $('#m-playlists').onclick = e => {
    const button = e.target.closest('[data-playlist]');
    if (button) music.setPlaylist(button.dataset.playlist);
  };
  $('#m-list').onclick = e => {
    const button = e.target.closest('button[data-action]');
    const song = button && rowSongs.get(button.closest('li').dataset.id);
    if (!song) return;
    if (button.dataset.action === 'heart') music.toggleFavorite(song);
    else music.playSong(song);
  };
  music.events.addEventListener('change', renderMusic);
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

function songRow(song, current) {
  rowSongs.set(song.id, song);
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

function emptyRow(playlist) {
  const li = document.createElement('li');
  li.className = 'empty-row';
  li.textContent = playlist === 'favorites' ? 'No favorites yet. Tap the heart on a song you love.' : 'Songs you play will show up here.';
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

function setUpInfo() {
  const lines = letterLines();
  if (lines.length) {
    $('#note').replaceChildren(...lines.map((line, i) => {
      const p = document.createElement('p');
      p.textContent = line;
      if (i === lines.length - 1 && FROM_YOU.signature) p.className = 'signature';
      return p;
    }));
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
