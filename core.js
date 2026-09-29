export const MIN = 60_000;
const DAY = 1440;
export const REASON = { schedule: 'Scheduled block', pomodoro: 'Focus session', budget: 'Daily budget spent' };

export const DEFAULTS = {
  groups: [{ id: 'main', name: 'Distractions', mode: 'block', patterns: [], schedule: [{ days: [1, 2, 3, 4, 5], start: 540, end: 1020 }], pomodoro: true, budget: 0 }],
  pomo: { work: 25, rest: 5, startedAt: null, pausedAt: null, intent: '' },
  glass: { grantMin: 5, baseWaitSec: 30, len: 60 },
  overrides: [],
  usage: { date: '', byGroup: {} },
  breaks: { date: '', n: 0 },
};

export const at = (now, day, min) => {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + day, 0, min).getTime();
};
export const today = now => new Date(now).toLocaleDateString('sv');

export const normalize = p => p.trim().toLowerCase()
  .replace(/^[a-z][\w+.-]*:\/\//, '').replace(/^www\./, '').replace(/[?#].*/, '').replace(/\/+$/, '');

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const toRegex = p => !p.includes('.') ? `^https?://.*${esc(p)}.*`
  : `^https?://([^/]+\\.)?${esc(p)}${p.includes('/') ? '.*' : '([:/?#].*)?$'}`;
export const hit = (p, url) => new RegExp(toRegex(p), 'i').test(url);

const intervals = (schedule, now) => schedule.flatMap(w => [-1, 0, 1, 2, 3, 4, 5, 6, 7]
  .filter(k => w.days.includes(new Date(at(now, k, 0)).getDay()))
  .map(k => [at(now, k, w.start), at(now, k, w.end + (w.end > w.start ? 0 : DAY))]));

export const phase = ({ work, rest, startedAt, pausedAt }, now) => {
  const t = ((pausedAt || now) - startedAt) % ((work + rest) * MIN);
  return t < work * MIN ? { work: true, left: work * MIN - t } : { work: false, left: (work + rest) * MIN - t };
};

export const used = (s, g, now) => (s.usage.date === today(now) && s.usage.byGroup[g.id] || 0)
  + (s.live?.groupId === g.id ? now - Math.max(s.live.since, at(now, 0, 0)) : 0);

export const why = (g, s, now) =>
  intervals(g.schedule, now).some(([a, b]) => a <= now && now < b) ? 'schedule'
  : g.pomodoro && s.pomo.startedAt && phase(s.pomo, now).work ? 'pomodoro'
  : g.budget && used(s, g, now) >= g.budget * MIN ? 'budget' : null;

const active = (s, now) => s.groups.map(g => ({ ...g, why: why(g, s, now) })).filter(g => g.why);
const overrides = (s, now) => s.overrides.filter(o => o.until > now);

export const match = (s, url, now) => {
  if (!/^https?:/i.test(url) || overrides(s, now).some(o => hit(o.pattern, url))) return null;
  const groups = active(s, now), allow = groups.filter(g => g.mode === 'allow');
  for (const group of groups) {
    const pattern = group.mode === 'block' && group.patterns.find(p => hit(p, url));
    if (pattern) return { group, pattern };
  }
  return allow.length && !allow.some(g => g.patterns.some(p => hit(p, url))) ? { group: allow[0], pattern: null } : null;
};

export const buildRules = (s, now, target) => {
  const groups = active(s, now);
  const rule = (priority, action) => regexFilter => ({ priority, action, condition: { regexFilter, resourceTypes: ['main_frame'] } });
  const allow = { type: 'allow' }, block = { type: 'redirect', redirect: { regexSubstitution: target } };
  const patterns = mode => groups.filter(g => g.mode === mode).flatMap(g => g.patterns.map(toRegex));
  return [
    ...overrides(s, now).map(o => toRegex(o.pattern)).map(rule(4, allow)),
    ...patterns('block').map(rule(3, block)),
    ...patterns('allow').map(rule(2, allow)),
    ...(groups.some(g => g.mode === 'allow') ? [rule(1, block)('^https?://.*')] : []),
  ].map((r, i) => ({ id: i + 1, ...r }));
};

export const nextChange = (s, now) => Math.min(...[
  at(now, 1, 0),
  ...s.groups.flatMap(g => intervals(g.schedule, now).flat()),
  s.pomo.startedAt && !s.pomo.pausedAt && now + phase(s.pomo, now).left,
  ...s.overrides.map(o => o.until),
  ...s.groups.filter(g => g.budget && s.live?.groupId === g.id).map(g => now + g.budget * MIN - used(s, g, now)),
].filter(t => t > now));
