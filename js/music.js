import { load, save } from './store.js';
import { ShuffleBag } from './shuffle.js';
import { toast } from './toast.js';

// Songs are listed and played straight from jw.org; nothing is copied or stored anywhere else.
// jw.org's terms allow free, non-commercial apps that play/download files from its public pages.

// jw.org language code for the songs: E = English, S = Spanish, T = Portuguese, F = French.
const LANGUAGE = 'E';
const LIST_URL = key =>
  `https://b.jw-cdn.org/apis/mediator/v1/categories/${LANGUAGE}/${key}?detailed=1&clientType=www&limit=500`;
const CHECK_FOR_NEW_SONGS = 12 * 60 * 60 * 1000;   // twice a day

// The playlists she picks from. Each one draws on one or more jw.org collections.
export const PLAYLISTS = [
  { key: 'broadcasting', name: 'JW Broadcasting songs', blurb: 'Original songs by our brothers and sisters',
    sources: ['AudioOriginalSongs', 'VODOriginalSongs', 'MakingMusic', 'AudioInternationalMusic'] },
  { key: 'convention', name: 'Convention music', blurb: 'Music-video presentations · best on Wi‑Fi',
    sources: ['VODConvMusic'] },
  { key: 'kingdomhall', name: 'Kingdom Hall songs', blurb: '“Sing Out Joyfully” to Jehovah, sung',
    sources: ['SJJChorus'] },
  { key: 'melodies', name: 'Kingdom Melodies', blurb: 'Orchestral and calm',
    sources: ['KingdomMelodies'] },
  { key: 'favorites', name: 'My favorites', blurb: 'Songs you’ve hearted' },
];
const SOURCES = [...new Set(PLAYLISTS.flatMap(p => p.sources ?? []))];
const SOURCE_NAMES = {
  AudioOriginalSongs: 'Original Songs', VODOriginalSongs: 'Original Songs', MakingMusic: 'Making Music',
  AudioInternationalMusic: 'International Music', VODConvMusic: 'Convention music',
  SJJChorus: '“Sing Out Joyfully” to Jehovah', KingdomMelodies: 'Kingdom Melodies',
};
export const sourceName = key => SOURCE_NAMES[key] ?? 'jw.org';
export const playlistName = key => PLAYLISTS.find(p => p.key === key)?.name ?? '';

let catalog = load('music.catalog2', null);       // { at, lang, songs }
let songs = [];                                   // { id, t: title, c: collection, d: seconds, u: file }
let byId = new Map();
let favorites = load('music.favorites', []);      // newest first
let playlist = load('music.playlist', 'broadcasting');
let history = load('music.history', []);          // song ids, oldest first
let at = history.length - 1;                      // which song in `history` is playing
let current = null;
let bag = null;
let errorsInARow = 0;
let loading = null;
let artworkFor = () => [];

const audio = new Audio();
audio.preload = 'auto';
export const events = new EventTarget();
const changed = () => events.dispatchEvent(new Event('change'));

// ------------------------------------------------------------------ start

export function init({ artwork }) {
  artworkFor = artwork;
  useSongs(catalog?.songs ?? []);
  refresh();

  audio.addEventListener('ended', () => next());
  audio.addEventListener('error', onError);
  audio.addEventListener('playing', () => { errorsInARow = 0; setPosition(); changed(); });
  for (const type of ['play', 'pause', 'durationchange']) {
    audio.addEventListener(type, () => { setPlaybackState(); changed(); });
  }
  audio.addEventListener('timeupdate', () => events.dispatchEvent(new Event('time')));

  // Lock screen, headphones and car buttons (over Bluetooth) all come through here.
  const session = navigator.mediaSession;
  if (session) {
    session.setActionHandler('play', () => play());
    session.setActionHandler('pause', () => audio.pause());
    session.setActionHandler('nexttrack', () => next());
    session.setActionHandler('previoustrack', () => back());
  }
}

// ------------------------------------------------------------------ the song list, from jw.org

// Songs that only exist as music videos have no audio file, so the smallest video is used:
// the phone just plays its sound.
function pickFile(files = []) {
  const mp3 = files.find(f => f.mimetype === 'audio/mpeg' && f.progressiveDownloadURL);
  if (mp3) return mp3;
  return files
    .filter(f => f.mimetype === 'video/mp4' && f.progressiveDownloadURL)
    .sort((a, b) => (a.filesize || Infinity) - (b.filesize || Infinity))[0];
}

async function fetchCollection(key) {
  const res = await fetch(LIST_URL(key));
  if (!res.ok) throw new Error(`${key}: ${res.status}`);
  const { category } = await res.json();
  return (category?.media ?? []).flatMap(m => {
    const file = pickFile(m.files);
    if (!file) return [];
    return [{
      id: m.languageAgnosticNaturalKey || m.guid,
      t: tidyTitle(m.title),
      c: key,
      d: Math.round(m.duration || file.duration || 0),
      u: file.progressiveDownloadURL,
    }];
  });
}

// Kingdom Melodies are titled with song numbers only, like "195, 224".
const tidyTitle = t => (/^[\d,\s]+$/.test(t) ? `${t.includes(',') ? 'Songs' : 'Song'} ${t}` : t.trim());
// "It Will Not Be Late! (2023 Convention Song—Lyrics)" and "It Will Not Be Late!" are the same song.
const sameSong = t => t.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const playlistOf = source => PLAYLISTS.find(p => p.sources?.includes(source))?.key;

// New songs on jw.org show up on their own: the lists are re-checked twice a day.
function refresh(force = false) {
  const fresh = catalog && catalog.lang === LANGUAGE && Date.now() - catalog.at < CHECK_FOR_NEW_SONGS;
  if (fresh && !force) return Promise.resolve();
  loading ??= (async () => {
    const results = await Promise.allSettled(SOURCES.map(fetchCollection));
    if (!results.some(r => r.status === 'fulfilled')) return;   // offline: keep what we have
    const seen = new Set();
    const list = results.flatMap((r, i) => (r.status === 'fulfilled'
      ? r.value
      : (catalog?.songs ?? []).filter(s => s.c === SOURCES[i])))
      .filter(s => {                         // within a playlist, the audio version (listed first) wins
        const key = `${playlistOf(s.c)}:${sameSong(s.t)}`;
        return !seen.has(key) && seen.add(key);
      });
    catalog = { at: Date.now(), lang: LANGUAGE, songs: list };
    save('music.catalog2', catalog);
    useSongs(list);
  })().catch(() => {}).finally(() => { loading = null; });
  return loading;
}

function useSongs(list) {
  songs = list;
  byId = new Map(list.map(s => [s.id, s]));
  bag = null;
  changed();
}

const songById = id => byId.get(id) ?? favorites.find(f => f.id === id);

export function songsIn(key) {
  if (key === 'favorites') return favorites;
  const sources = PLAYLISTS.find(p => p.key === key)?.sources ?? [];
  return songs.filter(s => sources.includes(s.c));
}

function currentBag() {
  if (playlist === 'favorites' && favorites.length < 2) choosePlaylist('broadcasting');
  bag ??= new ShuffleBag(`playlist.${playlist}.${LANGUAGE}`, songsIn(playlist), s => s.id);
  return bag;
}

// A new song, never the one that's playing (a fresh shuffle could otherwise start with it).
function drawNewSong() {
  const pool = currentBag();
  let song = pool.next();
  if (song && song.id === current?.id && pool.items.length > 1) song = pool.next();
  return song;
}

// ------------------------------------------------------------------ playing

export function play() {
  if (!current) return next();
  if (audio.error) audio.src = current.u;     // try again after a network hiccup
  audio.play().catch(() => {});
}

export function toggle() {
  if (!current || audio.paused) play();
  else audio.pause();
}

export async function next() {
  let song = null;
  while (!song && at < history.length - 1) song = songById(history[++at]);   // after going Back
  if (!song) {
    if (!songsIn(playlist).length && playlist !== 'favorites') {
      toast('Getting songs from jw.org…');
      await refresh(true);
    }
    song = drawNewSong();
    if (!song) return toast('Couldn’t reach jw.org. Check the internet and try again.');
    remember(song);
  }
  start(song);
}

// "Back" always means the song before this one, never "start this one over".
export function back() {
  for (let i = at - 1; i >= 0; i--) {
    const song = songById(history[i]);
    if (song && song.id !== current?.id) {
      at = i;
      return start(song);
    }
  }
  toast('That’s the first song');
}

export function playSong(song) {
  remember(song);
  start(song);
}

function remember(song) {
  if (history[history.length - 1] === song.id) { at = history.length - 1; return; }
  history.push(song.id);
  if (history.length > 150) history = history.slice(-150);
  at = history.length - 1;
  save('music.history', history);
}

function start(song) {
  current = song;
  audio.src = song.u;
  audio.play().catch(() => {});   // if the phone blocks it, the play button still works
  updateSession();
  changed();
}

function onError() {
  if (!current) return;
  errorsInARow++;
  if (errorsInARow >= 3 || !navigator.onLine) {
    errorsInARow = 0;
    toast('Can’t reach jw.org right now. Tap play to try again.');
    changed();
    return;
  }
  setTimeout(next, 1200);   // skip a song that won't load
}

// ------------------------------------------------------------------ lock screen / car display

function updateSession() {
  if (!navigator.mediaSession || !current) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: current.t,
    artist: sourceName(current.c),
    album: 'jw.org',
    artwork: artworkFor(),
  });
}

function setPlaybackState() {
  if (navigator.mediaSession) navigator.mediaSession.playbackState = !current ? 'none' : audio.paused ? 'paused' : 'playing';
}

function setPosition() {
  try {
    if (audio.duration) navigator.mediaSession?.setPositionState({ duration: audio.duration, position: audio.currentTime, playbackRate: 1 });
  } catch { /* some browsers don't support it */ }
}

// ------------------------------------------------------------------ favorites and playlists

export const isFavorite = song => !!song && favorites.some(f => f.id === song.id);

export function toggleFavorite(song = current) {
  if (!song) return;
  const wasOn = isFavorite(song);
  favorites = wasOn ? favorites.filter(f => f.id !== song.id) : [{ ...song, added: Date.now() }, ...favorites];
  save('music.favorites', favorites);
  if (playlist === 'favorites') bag = null;
  toast(wasOn ? 'Removed from your favorites' : 'Added to your favorites');
  changed();
}

function choosePlaylist(key) {
  playlist = key;
  save('music.playlist', key);
  bag = null;
}

// Picking a playlist starts playing from it right away.
export function setPlaylist(key) {
  if (key === 'favorites' && favorites.length < 2) {
    return toast(favorites.length ? 'Heart one more song to shuffle your favorites' : 'Tap the heart on songs you love first');
  }
  choosePlaylist(key);
  at = history.length - 1;
  next();
}

// ------------------------------------------------------------------ for the screens

export function recent() {
  const seen = new Set(), list = [];
  for (let i = history.length - 1; i >= 0 && list.length < 30; i--) {
    const s = songById(history[i]);
    if (s && !seen.has(s.id)) { seen.add(s.id); list.push(s); }
  }
  return list;
}

export const state = () => ({
  current,
  playlist,
  favorites,
  playing: !!current && !audio.paused,
  position: audio.currentTime || 0,
  duration: audio.duration || current?.d || 0,
});
