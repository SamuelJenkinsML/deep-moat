import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, MIN, match, buildRules, nextChange } from '../core.js';

const MON = (h, m = 0) => new Date(2026, 8, 28, h, m).getTime();
const SUN = h => new Date(2026, 8, 27, h).getTime();
const SAT = h => new Date(2026, 8, 26, h).getTime();
const group = o => ({ id: 'g', name: 'G', mode: 'block', patterns: ['reddit.com', 'youtube.com/shorts', 'doomscroll'], schedule: W([0, 1, 2, 3, 4, 5, 6], 0, 0), pomodoro: false, budget: 0, ...o });
const state = (groups, o = {}) => ({ ...DEFAULTS, groups, live: null, ...o });
const W = (days, start, end) => [{ days, start: start * 60, end: end * 60 }];
const WEEKDAYS = W([1, 2, 3, 4, 5], 9, 17);
const cases = (t, rows, fn) => rows.forEach(([name, ...args]) => t.test(name, () => fn(...args)));

test('pattern matching', t => cases(t, [
  ['bare domain', 'https://reddit.com/', true],
  ['subdomain', 'https://old.reddit.com/r/x', true],
  ['lookalike prefix', 'https://notreddit.com/', false],
  ['lookalike suffix', 'https://reddit.company.com/', false],
  ['path pattern', 'https://www.youtube.com/shorts/abc', true],
  ['sibling path', 'https://youtube.com/watch?v=1', false],
  ['keyword', 'https://example.com/doomscroll-tips', true],
  ['non-web scheme', 'chrome://settings', false],
], (url, want) => assert.equal(!!match(state([group()]), url, MON(10)), want)));

test('activation', t => cases(t, [
  ['weekday window', { schedule: WEEKDAYS }, {}, MON(10), true],
  ['window end is exclusive', { schedule: WEEKDAYS }, {}, MON(17), false],
  ['weekend outside mon-fri', { schedule: WEEKDAYS }, {}, SAT(10), false],
  ['overnight before midnight', { schedule: W([0], 22, 2) }, {}, SUN(23), true],
  ['overnight after midnight', { schedule: W([0], 22, 2) }, {}, MON(1), true],
  ['overnight over', { schedule: W([0], 22, 2) }, {}, MON(3), false],
  ['pomodoro work', { schedule: [], pomodoro: true }, { pomo: { work: 25, rest: 5, startedAt: MON(10) - 10 * MIN } }, MON(10), true],
  ['pomodoro rest', { schedule: [], pomodoro: true }, { pomo: { work: 25, rest: 5, startedAt: MON(10) - 27 * MIN } }, MON(10), false],
  ['paused work still blocks', { schedule: [], pomodoro: true }, { pomo: { work: 25, rest: 5, startedAt: MON(9), pausedAt: MON(9, 10) } }, MON(10), true],
  ['rest does not lift schedule', { pomodoro: true }, { pomo: { work: 25, rest: 5, startedAt: MON(10) - 27 * MIN } }, MON(10), true],
  ['budget spent', { schedule: [], budget: 20 }, { usage: { date: '2026-09-28', byGroup: { g: 20 * MIN } } }, MON(10), true],
  ['budget resets daily', { schedule: [], budget: 20 }, { usage: { date: '2026-09-27', byGroup: { g: 20 * MIN } } }, MON(10), false],
  ['budget counts live session', { schedule: [], budget: 20 }, { usage: { date: '2026-09-28', byGroup: { g: 6 * MIN } }, live: { groupId: 'g', since: MON(10) - 15 * MIN } }, MON(10), true],
], (g, s, now, want) => assert.equal(!!match(state([group(g)], s), 'https://reddit.com/', now), want)));

const mixed = state([group(), group({ id: 'a', mode: 'allow', patterns: ['docs.rs', 'reddit.com'] })],
  { overrides: [{ pattern: 'youtube.com/shorts', until: MON(10) + MIN }, { pattern: 'doomscroll', until: MON(10) - MIN }] });
const urls = ['https://reddit.com/', 'https://docs.rs/tokio', 'https://github.com/', 'https://youtube.com/shorts/x', 'https://a.com/doomscroll'];

test('precedence', () => assert.deepEqual(urls.map(u => match(mixed, u, MON(10))?.pattern ?? (match(mixed, u, MON(10)) ? 'unlisted' : 'open')),
  ['reddit.com', 'open', 'unlisted', 'open', 'doomscroll']));

test('DNR rules mirror match()', () => {
  const rules = buildRules(mixed, MON(10), 'blocked#\\0');
  const dnr = url => rules.filter(r => new RegExp(r.condition.regexFilter, 'i').test(url)).sort((a, b) => b.priority - a.priority)[0]?.action.type;
  urls.forEach(u => assert.equal(dnr(u) === 'redirect', !!match(mixed, u, MON(10)), u));
});

test('nextChange picks the earliest edge', t => cases(t, [
  ['schedule end', [group({ schedule: WEEKDAYS })], {}, MON(10), MON(17)],
  ['overnight end', [group({ schedule: W([0], 22, 2) })], {}, MON(1), MON(2)],
  ['pomodoro phase', [group({ schedule: WEEKDAYS })], { pomo: { work: 25, rest: 5, startedAt: MON(10) - 10 * MIN } }, MON(10), MON(10, 15)],
  ['paused pomodoro has no edge', [group({ schedule: WEEKDAYS })], { pomo: { work: 25, rest: 5, startedAt: MON(9), pausedAt: MON(9, 10) } }, MON(10), MON(17)],
  ['override expiry', [group({ schedule: [] })], { overrides: [{ pattern: 'x.com', until: MON(10, 5) }] }, MON(10), MON(10, 5)],
  ['budget exhaustion', [group({ schedule: [], budget: 20 })], { usage: { date: '2026-09-28', byGroup: { g: 5 * MIN } }, live: { groupId: 'g', since: MON(10) } }, MON(10), MON(10, 15)],
  ['midnight fallback', [group({ schedule: [] })], {}, MON(10), MON(24)],
], (groups, s, now, want) => assert.equal(nextChange(state(groups, s), now), want)));
