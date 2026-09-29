import { DEFAULTS } from './core.js';

const SESSION = { live: null, rulesKey: '', lastPhase: null };

export const load = async () => {
  const s = { ...await chrome.storage.local.get(DEFAULTS), ...await chrome.storage.session.get(SESSION) };
  return { ...s, groups: s.groups.map(g => Array.isArray(g.schedule) ? g : { ...g, schedule: [] }) };
};
export const save = o => chrome.storage.local.set(o);

const setPomo = async f => { const { pomo } = await load(); return save({ pomo: { ...pomo, ...f(pomo, Date.now()) } }); };
export const togglePomo = (intent = '') => setPomo(({ startedAt, pausedAt }, now) =>
  !startedAt ? { startedAt: now, pausedAt: null, intent: intent.trim() }
  : pausedAt ? { startedAt: startedAt + now - pausedAt, pausedAt: null } : { pausedAt: now });
export const resetPomo = () => setPomo(() => ({ startedAt: null, pausedAt: null, intent: '' }));
