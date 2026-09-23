import { load, save } from './store.js';
import { ShuffleBag } from './shuffle.js';
import { toast } from './toast.js';

const THUMBS = 'https://upload.wikimedia.org/wikipedia/commons/thumb/';
const ORIGINALS = 'https://upload.wikimedia.org/wikipedia/commons/';
const SAVER_SECONDS = 45;   // screen saver mode goes slower, like the TV
// With the phone held upright, this share of photos are tall ones that fill the whole screen.
// Turned sideways, it's all wide photos (they fill the screen that way).
const TALL_SHARE = 0.6;

/**
 * ✍️ YOUR PART: how often a funny animal sneaks into the slideshow.
 *
 * This runs once for every new photo. `photosSinceLastAnimal` counts the landscapes shown since
 * the last animal (it starts at 99, so one can show up early on). Return true to make the next
 * photo an animal, false for a landscape.
 *
 * Ways to think about it:
 *   - Pure chance (say 1 in 10) keeps it a surprise, but now and then two land close together.
 *   - A fixed rhythm (every 8th photo) is never too often, but she'll start expecting it.
 *   - A minimum gap plus some chance sits in between.
 * Until this is filled in, the slideshow is landscapes only.
 */
function shouldShowAnimal(photosSinceLastAnimal) {
  // TODO(you): replace this line with your rule.
  return false;
}

// ------------------------------------------------------------------ where the pictures live

const fileName = p => p.f.slice(p.f.lastIndexOf('/') + 1);
const isTall = p => p.h > p.w * 1.15;
const upright = () => innerHeight > innerWidth;

// Both Pexels (photos with `u`) and Wikimedia make resized copies on request.
export function photoUrl(p, width) {
  if (p.u) return `${p.u}?auto=compress&cs=tinysrgb&w=${width}`;
  return p.w > width ? `${THUMBS}${p.f}/${width}px-${p.n || fileName(p)}` : ORIGINALS + p.f;
}

export const sourcePage = p => (p.u
  ? `https://www.pexels.com/photo/${p.f.split('/')[1]}/`
  : `https://commons.wikimedia.org/wiki/File:${fileName(p)}`);

function srcsetFor(p) {
  if (p.u) return [960, 1280, 1920, 2560].filter(w => w <= p.w).map(w => `${photoUrl(p, w)} ${w}w`).join(', ');
  const list = [960, 1280, 1920].filter(w => w < p.w).map(w => `${photoUrl(p, w)} ${w}w`);
  if (p.w <= 1920) list.push(`${ORIGINALS}${p.f} ${p.w}w`);
  return list.join(', ');
}

// The phone picks the right size for how the photo is shown: tall photos fill an upright screen
// (so they need more width), wide ones fit inside it. Resolves once the photo has downloaded. Decoding ahead of time makes the fade smoother, but
// browsers pause decoding while the app is in the background, so it's never waited on for long.
function loadImage(p) {
  const img = new Image();
  img.crossOrigin = 'anonymous';   // so Share can reuse the copy that's already downloaded
  img.decoding = 'async';
  img.alt = p.t;
  return new Promise((resolve, reject) => {
    img.onload = () => {
      const decoded = img.decode().catch(() => {});
      Promise.race([decoded, new Promise(r => setTimeout(r, 1500))]).then(() => resolve(img));
    };
    img.onerror = () => reject(new Error(`couldn't load ${p.f}`));
    img.sizes = `${isTall(p) ? 'max' : 'min'}(100vw, ${(p.w / p.h).toFixed(3)} * 100vh)`;
    img.srcset = srcsetFor(p);
  });
}

// ------------------------------------------------------------------ state

let el = null;                  // page elements, handed over by app.js
let animals = [], tallBag, wideBag, animalBag;
let history = [];               // photos shown so far, newest last (kept between visits)
let at = -1;                    // which photo in `history` is on screen
let upcoming = null;            // the next new photo, picked early so it can load ahead of time
const preloads = new Map();     // photo path -> Promise<img>
let shown = null;               // { p, img } on screen right now
let sinceAnimal = load('photos.sinceAnimal', 99);
let seconds = load('photos.seconds', 20);
let saved = load('photos.saved', []);
const listeners = new Set();

// Pausing: she can pause (going Back pauses too), and the app holds the slideshow
// while a sheet covers it or the app is in the background.
let userPause = null;           // null | 'you' | 'back'
const holds = new Set();
let timer = 0, ticking = false, remaining = 0, startedAt = 0;
let showToken = 0, failures = 0, clockTimer = 0;

// ------------------------------------------------------------------ start

export async function init(elements) {
  el = elements;
  bindGestures();
  document.addEventListener('visibilitychange', () => hold('away', document.hidden));
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) exitSaver(); });

  const res = await fetch('photos.json');
  if (!res.ok) throw new Error(`photos.json: ${res.status}`);
  const data = await res.json();
  const landscapes = data.photos.filter(p => p.k === 'l');
  animals = data.photos.filter(p => p.k === 'a');
  if (!landscapes.length) throw new Error('photos.json has no landscapes');
  const vivid = p => (p.b ? 2 : 1);
  tallBag = new ShuffleBag('tall', landscapes.filter(isTall), p => p.f, vivid);
  wideBag = new ShuffleBag('wide', landscapes.filter(p => !isTall(p)), p => p.f, vivid);
  animalBag = new ShuffleBag('animals', animals, p => p.f);
  const byPath = new Map([data.first, ...data.photos].map(p => [p.f, p]));
  history = load('photos.history', []).map(f => byPath.get(f)).filter(Boolean);
  saved = saved.map(s => ({ ...s, ...byPath.get(s.f), savedAt: s.savedAt }));   // pick up improved captions
  save('photos.saved', saved);

  if (!load('photos.startedOnce', false)) {
    save('photos.startedOnce', true);
    addToHistory(data.first);     // Mount Shuksan from Picture Lake
    return show();
  }
  at = history.length - 1;
  return next();                  // every visit opens on something new
}

// ------------------------------------------------------------------ moving through photos

function drawNew() {
  const animal = animals.length > 0 && shouldShowAnimal(sinceAnimal);
  sinceAnimal = animal ? 0 : sinceAnimal + 1;
  save('photos.sinceAnimal', sinceAnimal);
  if (animal) return animalBag.next();
  const tall = upright() && tallBag.items.length > 0 && Math.random() < TALL_SHARE;
  return (tall ? tallBag : wideBag).next();
}

function addToHistory(p) {
  history.push(p);
  if (history.length > 80) history.shift();
  at = history.length - 1;
  save('photos.history', history.map(h => h.f));
}

export function next() {
  if (at < history.length - 1) {
    at++;
  } else {
    addToHistory(upcoming || drawNew());
    upcoming = null;
  }
  if (userPause === 'back' && at === history.length - 1) userPause = null;   // caught up: carry on
  return show();
}

export function back() {
  if (at <= 0) return toast('That’s the first photo');
  at--;
  userPause ??= 'back';           // give her time to look (and save)
  return show();
}

async function show() {
  const p = history[at];
  const token = ++showToken;
  stopTimer();
  let img;
  try {
    img = await (takePreload(p) || loadImage(p));
  } catch {
    if (token === showToken) await onBroken(token);
    return;
  }
  if (token !== showToken) return;   // she already moved on
  failures = 0;
  setStatus('');
  document.body.classList.remove('is-loading');

  const slide = document.createElement('div');
  slide.className = isTall(p) ? 'slide tall' : 'slide';
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  backdrop.style.backgroundImage = `url("${photoUrl(p, 120)}")`;
  const frame = document.createElement('div');
  frame.className = 'frame';
  frame.append(img);
  slide.append(backdrop, frame);
  el.stage.append(slide);
  slide.getBoundingClientRect();     // make sure the fade-in actually animates
  slide.classList.add('in');
  const older = [...el.stage.children].slice(0, -1);
  setTimeout(() => older.forEach(n => n.remove()), 1000);

  shown = { p, img };
  el.title.textContent = p.t;
  el.title.hidden = !p.t;
  el.credit.textContent = `Photo: ${p.a} · ${p.l}`;
  el.clockTitle.textContent = p.t;
  renderSaved();
  startTimer();
  preloadNext();
  listeners.forEach(fn => fn(p));
}

function takePreload(p) {
  const pending = preloads.get(p.f);
  preloads.delete(p.f);
  return pending;
}

function preloadNext() {
  const p = at < history.length - 1 ? history[at + 1] : (upcoming ??= drawNew());
  if (!p || preloads.has(p.f)) return;
  const pending = loadImage(p);
  pending.catch(() => {});           // a failure is handled when it's shown
  preloads.set(p.f, pending);
  if (preloads.size > 3) preloads.delete(preloads.keys().next().value);
}

// A photo didn't load: skip it. If the internet is gone, wait for it to come back.
async function onBroken(token) {
  failures++;
  if (!navigator.onLine || failures > 3) {
    setStatus(navigator.onLine ? 'Having trouble loading photos…' : 'Waiting for the internet…');
    await new Promise(resolve => {
      if (navigator.onLine) setTimeout(resolve, 10_000);
      else addEventListener('online', resolve, { once: true });
    });
    if (token !== showToken) return;
  }
  history.splice(at, 1);
  if (at >= history.length) {
    addToHistory(upcoming || drawNew());
    upcoming = null;
  }
  return show();
}

function setStatus(message) {
  el.status.textContent = message;
}

// ------------------------------------------------------------------ timing and pausing

function stopTimer() {
  clearTimeout(timer);
  ticking = false;
}

function startTimer() {
  stopTimer();
  const ms = (document.body.classList.contains('saver') ? SAVER_SECONDS : seconds) * 1000;
  remaining = ms;
  el.bar.classList.remove('run');
  el.bar.style.setProperty('--dur', `${ms}ms`);
  void el.bar.offsetWidth;           // restart the progress bar animation
  el.bar.classList.add('run');
  sync();
}

const shouldRun = () => !!shown && !userPause && holds.size === 0;

function sync() {
  if (!el) return;
  if (shouldRun() && !ticking) {
    ticking = true;
    startedAt = performance.now();
    timer = setTimeout(next, remaining);
  } else if (!shouldRun() && ticking) {
    clearTimeout(timer);
    ticking = false;
    remaining = Math.max(0, remaining - (performance.now() - startedAt));
  }
  el.bar.style.animationPlayState = ticking ? 'running' : 'paused';
  document.body.classList.toggle('is-paused', !!userPause);
  el.pauseIcon.setAttribute('href', userPause ? '#i-play' : '#i-pause');
  el.pause.setAttribute('aria-label', userPause ? 'Continue the slideshow' : 'Pause the slideshow');
}

export function togglePause() {
  userPause = userPause ? null : 'you';
  sync();
}

export function hold(reason, on) {
  if (on) holds.add(reason); else holds.delete(reason);
  sync();
}

export const getSeconds = () => seconds;

export function setSeconds(value) {
  seconds = value;
  save('photos.seconds', value);
  if (shown) startTimer();
}

// ------------------------------------------------------------------ save and share

const isSaved = p => saved.some(s => s.f === p.f);
const fileNameFor = p => `${(p.t || 'Photo').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)}.jpg`;

function renderSaved() {
  const on = !!shown && isSaved(shown.p);
  el.save.classList.toggle('is-saved', on);
  el.saveLabel.textContent = on ? 'Saved' : 'Save';
  el.savedCount.textContent = saved.length ? String(saved.length) : '';
}

async function fetchBlob(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.blob();
}

// Downloads land in the phone's Download folder, which the Gallery app shows as an album.
async function downloadToPhone(p) {
  const blob = await fetchBlob(photoUrl(p, 1920));
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileNameFor(p);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
}

// iPhone and iPad keep downloads in the Files app, so there Save goes through the share sheet,
// whose "Save Image" puts the photo in Photos. (iPads say they're Macs; the touch screen gives them away.)
const isApple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

async function saveThroughShareSheet(p, loadedUrl) {
  const blob = await fetchBlob(loadedUrl || photoUrl(p, 1920));
  await navigator.share({ files: [new File([blob], fileNameFor(p), { type: 'image/jpeg' })] });
}

export async function saveCurrent() {
  if (!shown) return;
  const { p } = shown;
  if (isSaved(p)) return toast(isApple ? 'Already saved. It’s in your Photos.' : 'Already saved. It’s in your Gallery.');
  el.save.disabled = true;
  try {
    if (isApple && navigator.canShare) await saveThroughShareSheet(p, shown.img.currentSrc);
    else await downloadToPhone(p);
    saved = [{ ...p, savedAt: Date.now() }, ...saved];
    save('photos.saved', saved);
    window.caches?.open('saved-photos').then(c => c.add(photoUrl(p, 330))).catch(() => {});
    toast(isApple ? 'Saved' : 'Saved to your Gallery');
  } catch (e) {
    if (e?.name !== 'AbortError') toast('Couldn’t save it. Check the internet and try again.');
  } finally {
    el.save.disabled = false;
    renderSaved();
  }
}

export const shareCurrent = () => shown && sharePhoto(shown.p, shown.img.currentSrc);

// Opens the phone's share menu (Messages, WhatsApp, ...) with the photo attached.
export async function sharePhoto(p, alreadyLoadedUrl) {
  try {
    const blob = await fetchBlob(alreadyLoadedUrl || photoUrl(p, 1280));
    const file = new File([blob], fileNameFor(p), { type: 'image/jpeg' });
    const text = [p.t, `(Photo: ${p.a}, ${p.l})`].filter(Boolean).join('\n');
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text });
    } else if (navigator.share) {
      await navigator.share({ title: p.t, text, url: sourcePage(p) });
    } else {
      await navigator.clipboard.writeText(sourcePage(p));
      toast('Link copied');
    }
  } catch (e) {
    if (e?.name !== 'AbortError') toast('Couldn’t share that one. Try again?');
  }
}

export const savedPhotos = () => saved;

export function removeSaved(p) {
  saved = saved.filter(s => s.f !== p.f);
  save('photos.saved', saved);
  window.caches?.open('saved-photos').then(c => c.delete(photoUrl(p, 330))).catch(() => {});
  renderSaved();
}

// ------------------------------------------------------------------ screen saver

export function enterSaver() {
  document.body.classList.add('saver');
  document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
  userPause = null;
  tickClock();
  clockTimer = setInterval(tickClock, 10_000);
  startTimer();
  setTimeout(() => addEventListener('pointerdown', onSaverTap, true), 400);
}

// Any tap ends the screen saver, and that tap shouldn't also press a button underneath.
function onSaverTap(e) {
  e.stopPropagation();
  const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
  addEventListener('click', swallow, { capture: true, once: true });
  setTimeout(() => removeEventListener('click', swallow, true), 700);
  exitSaver();
}

export function exitSaver() {
  if (!document.body.classList.contains('saver')) return;
  removeEventListener('pointerdown', onSaverTap, true);
  document.body.classList.remove('saver');
  clearInterval(clockTimer);
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  startTimer();
}

function tickClock() {
  el.clockTime.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ------------------------------------------------------------------ touch

// Swipe left/right to move through photos; a simple tap hides or shows the buttons.
function bindGestures() {
  let x0 = 0, y0 = 0, t0 = 0, down = false;
  el.stage.addEventListener('pointerdown', e => { down = true; x0 = e.clientX; y0 = e.clientY; t0 = e.timeStamp; });
  el.stage.addEventListener('pointercancel', () => { down = false; });
  el.stage.addEventListener('pointerup', e => {
    if (!down) return;
    down = false;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx < 0) next(); else back();
    } else if (Math.hypot(dx, dy) < 12 && e.timeStamp - t0 < 600) {
      document.body.classList.toggle('clean');
    }
  });
}

// ------------------------------------------------------------------ for the rest of the app

export const onChange = fn => listeners.add(fn);
export const onApple = () => isApple;
export const currentPhoto = () => shown?.p ?? null;
export const currentImageUrl = () => shown?.img.currentSrc ?? '';
