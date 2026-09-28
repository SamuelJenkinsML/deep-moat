import { DEFAULTS, phase } from './core.js';

const SESSION = { live: null, rulesKey: '', lastPhase: null };

export const load = async () => ({ ...await chrome.storage.local.get(DEFAULTS), ...await chrome.storage.session.get(SESSION) });
export const save = o => chrome.storage.local.set(o);

export const togglePomo = async (intent = '') => {
  const { pomo } = await load(), now = Date.now();
  if (!pomo.startedAt) return save({ pomo: { ...pomo, startedAt: now, intent: intent.trim() } }).then(() => true);
  if (phase(pomo, now).work) return false;
  return save({ pomo: { ...pomo, startedAt: null, intent: '' } }).then(() => true);
};
