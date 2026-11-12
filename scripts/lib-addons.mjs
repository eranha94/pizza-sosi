// Turns the old add-on rows ("מיוחדות- טונה/פילה אנשובי/... כל הפיצה", price) into topping groups
// where every topping is its own choice with a whole-pizza and (optionally) a half-pizza price.
import { createHash } from 'node:crypto';

const GROUP_ORDER = ['רגילות', 'FRESH', 'מיוחדות', 'סופר מיוחדים', 'תוספות'];
const normaliseGroup = (g) => (/^סופר מיוחד/.test(g) ? 'סופר מיוחדים' : g.trim());
const stableId = (...parts) => createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);

/** @param {{name: string, priceAgorot: number, active: boolean}[]} rows */
export function toAddOnGroups(rows) {
  const groups = new Map();
  for (const row of rows) {
    const m = /^\s*([^-–]+?)\s*[-–]\s*(.+)$/.exec(row.name);
    const groupName = m ? normaliseGroup(m[1]) : 'תוספות';
    let rest = (m ? m[2] : row.name).trim();
    let coverage = 'single';
    if (/\s*כל הפיצה\s*$/.test(rest)) {
      coverage = 'whole';
      rest = rest.replace(/\s*כל הפיצה\s*$/, '');
    } else if (/\s*חצי פיצה\s*$/.test(rest)) {
      coverage = 'half';
      rest = rest.replace(/\s*חצי פיצה\s*$/, '');
    }
    const names = rest.split('/').map((s) => s.trim()).filter(Boolean);
    const g = groups.get(groupName) ?? { options: new Map() };
    groups.set(groupName, g);
    for (const name of names) {
      const o = g.options.get(name) ?? { name, single: null, whole: null, half: null, active: false };
      o[coverage] = row.priceAgorot;
      o.active ||= row.active;
      g.options.set(name, o);
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (GROUP_ORDER.indexOf(a) + 1 || 99) - (GROUP_ORDER.indexOf(b) + 1 || 99))
    .map(([name, g], i) => ({
      id: stableId('group', name),
      name,
      order: i + 1,
      options: [...g.options.values()].map((o) => {
        const hasHalf = o.half !== null;
        return {
          id: stableId('opt', name, o.name),
          name: o.name,
          wholeAgorot: o.whole ?? o.single ?? o.half ?? 0,
          halfAgorot: hasHalf && (o.whole !== null || o.single !== null) ? o.half : null,
          active: o.active,
        };
      }),
    }));
}
