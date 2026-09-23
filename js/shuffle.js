import { load, save } from './store.js';

// A tiny seeded random number generator, so a shuffle can be rebuilt from one number.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deals items in random order with no repeats until every item has come up once, then reshuffles.
 * Only the seed and position are stored, so the order survives closing the app. If the list
 * itself changes (new photos, new songs), a fresh shuffle starts.
 * Items with a bigger weight tend to come up earlier in each round (they still come up only once).
 */
export class ShuffleBag {
  constructor(name, items, keyOf, weightOf = () => 1) {
    this.name = name;
    this.items = items;
    this.weightOf = weightOf;
    this.sig = items.length ? `${items.length}:${keyOf(items[0])}:${keyOf(items[items.length - 1])}` : '0';
    const saved = load(`bag.${name}`, null);
    if (saved && saved.sig === this.sig) {
      this.seed = saved.seed;
      this.pos = saved.pos;
    } else {
      this.reseed();
    }
    this.order = this.build();
  }

  reseed() {
    this.seed = (Math.random() * 2 ** 32) >>> 0;
    this.pos = 0;
  }

  // Weighted shuffle (Efraimidis–Spirakis): sort by random^(1/weight).
  build() {
    const rnd = mulberry32(this.seed);
    return this.items
      .map((item, i) => [rnd() ** (1 / this.weightOf(item)), i])
      .sort((a, b) => b[0] - a[0])
      .map(([, i]) => i);
  }

  next() {
    if (!this.items.length) return null;
    if (this.pos >= this.order.length) {
      this.reseed();
      this.order = this.build();
    }
    const item = this.items[this.order[this.pos++]];
    save(`bag.${this.name}`, { sig: this.sig, seed: this.seed, pos: this.pos });
    return item;
  }
}
