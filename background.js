import { MIN, at, buildRules, hit, match, nextChange, phase, today } from './core.js';
import { load, togglePomo } from './store.js';

const PAGE = chrome.runtime.getURL('blocked.html');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const notify = (title, message) => chrome.notifications.create({ type: 'basic', iconUrl: 'icons/128.png', title, message });

const budgetGroup = async s => {
  const [[tab], win, idle] = await Promise.all([
    chrome.tabs.query({ active: true, lastFocusedWindow: true }),
    chrome.windows.getLastFocused().catch(() => ({})),
    chrome.idle.queryState(60),
  ]);
  return win.focused && idle === 'active' && tab?.url
    && s.groups.find(g => g.budget && g.patterns.some(p => hit(p, tab.url)));
};

async function apply() {
  const s = await load(), now = Date.now(), date = today(now);
  const usage = s.usage.date === date ? structuredClone(s.usage) : { date, byGroup: {} };
  if (s.live) usage.byGroup[s.live.groupId] = (usage.byGroup[s.live.groupId] ?? 0) + now - Math.max(s.live.since, at(now, 0, 0));
  const g = await budgetGroup(s), live = g ? { groupId: g.id, since: now } : null;
  const next = { ...s, usage, live };

  const rules = buildRules(next, now, `${PAGE}#\\0`), rulesKey = JSON.stringify(rules);
  if (rulesKey !== s.rulesKey) {
    const old = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: old.map(r => r.id), addRules: rules });
    for (const t of await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }))
      if (match(next, t.url, now)) chrome.tabs.update(t.id, { url: `${PAGE}#${t.url}` });
  }

  const p = s.pomo.startedAt && phase(s.pomo, now), lastPhase = p ? (p.work ? 'work' : 'rest') : null;
  chrome.action.setBadgeText({ text: p ? `${Math.ceil(p.left / MIN)}m` : '' });
  if (p) chrome.action.setBadgeBackgroundColor({ color: p.work ? '#f7768e' : '#9ece6a' });
  if (s.lastPhase && lastPhase && lastPhase !== s.lastPhase)
    notify(p.work ? 'Back to focus' : 'Rest', p.work ? s.pomo.intent || 'The moat is up.' : `${s.pomo.rest} minutes. Stretch.`);

  await Promise.all([
    !same(usage, s.usage) && chrome.storage.local.set({ usage }),
    chrome.storage.session.set({ live, rulesKey, lastPhase }),
  ]);
  chrome.alarms.create('tick', { when: Math.min(nextChange(next, now), p ? now + (p.left % MIN || MIN) : Infinity) });
}

let queue = Promise.resolve(), pending = false;
const run = () => pending ? queue : (pending = true, queue = queue.then(() => (pending = false, apply())).catch(console.error));

chrome.idle.setDetectionInterval(60);
[chrome.runtime.onInstalled, chrome.runtime.onStartup, chrome.alarms.onAlarm, chrome.tabs.onActivated,
  chrome.windows.onFocusChanged, chrome.idle.onStateChanged].forEach(e => e.addListener(() => run()));
chrome.tabs.onUpdated.addListener((_, info) => info.url && run());
chrome.storage.onChanged.addListener((c, area) => area === 'local' && Object.keys(c).some(k => k !== 'usage') && run());
chrome.runtime.onMessage.addListener((msg, _, reply) => msg === 'apply' && (run().then(() => reply()), true));
chrome.commands.onCommand.addListener(async c => c === 'toggle-pomodoro'
  && !await togglePomo() && notify('Still focusing', 'Focus can only be stopped during rest.'));
