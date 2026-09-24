import { load, save } from './store.js';

/**
 * 📈 How many people use Paradise.
 * Counted with GoatCounter (goatcounter.com): no cookies, no names, nothing personal, only numbers.
 * The numbers are at https://STATS_CODE.goatcounter.com (sign in there). Leave STATS_CODE empty to
 * turn counting off.
 */
const STATS_CODE = '';

const on = !!STATS_CODE && !['localhost', '127.0.0.1'].includes(location.hostname);   // test copies never count

// Each count is one tiny image request (GoatCounter's "tracking pixel"), so there's no script to load.
function send(path, title, event = false) {
  if (!on) return Promise.resolve(false);
  const query = new URLSearchParams({ p: path, t: title, rnd: Math.random().toString(36).slice(2) });
  if (event) query.set('e', 'true');
  return new Promise(resolve => {
    const pixel = new Image();
    pixel.onload = () => resolve(true);
    pixel.onerror = () => resolve(false);
    pixel.src = `https://${STATS_CODE}.goatcounter.com/count?${query}`;
  });
}

// Counted once per phone. If it doesn't get through (no internet), it tries again next time.
async function once(key, path, title) {
  if (load(key, false)) return;
  if (await send(path, title, true)) save(key, true);
}

export function countOpen({ installed, apple }) {
  send('/', 'Opened Paradise');
  // An iPhone keeps a Home Screen app's storage apart from Safari's, so someone opening the
  // installed app there was already counted when they first opened the link in Safari.
  if (!(installed && apple)) once('stats.started', 'started-using-paradise', 'Someone new started using Paradise');
  if (installed) once('stats.installed', 'added-to-home-screen', 'Added Paradise to a Home screen');
}

export const countShare = () => send('shared-paradise', 'Shared Paradise with someone', true);
