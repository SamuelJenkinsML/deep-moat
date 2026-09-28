import { MIN, REASON, match, nextChange, phase, today } from './core.js';
import { load, save } from './store.js';

const $ = id => document.getElementById(id);

const CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const url = location.hash.slice(1), s = await load(), now = Date.now(), m = url && match(s, url, now);

if (url && !m) location.replace(url);
else if (m) {
  const p = s.pomo.startedAt && phase(s.pomo, now);
  document.body.classList.toggle('rest', !!p && !p.work);
  $('host').textContent = new URL(url).hostname;
  $('why').textContent = `${REASON[m.group.why]} · ${m.group.name} · ${m.pattern ?? 'not on allowlist'}`;
  if (p?.work) Object.assign($('focus'), { hidden: false, textContent: `${s.pomo.intent || 'Focus'} — rest in ${Math.ceil(p.left / MIN)}m` });
  setTimeout(() => $('typed').disabled || location.reload(), nextChange(s, now) - now);

  const breaks = s.breaks.date === today(now) ? s.breaks.n : 0;
  const code = Array.from(crypto.getRandomValues(new Uint8Array(s.glass.len)), b => CHARS[b % CHARS.length])
    .join('').replace(/.{5}(?=.)/g, '$& ');
  $('challenge').textContent = code;
  $('typed').addEventListener('beforeinput', e => /Paste|Drop|Yank/.test(e.inputType) && e.preventDefault());
  $('typed').addEventListener('input', e => e.target.value === code && countdown(s.glass.baseWaitSec * 2 ** breaks, breaks));
}

function countdown(left, breaks) {
  $('typed').disabled = true;
  const tick = setInterval(async () => {
    if (document.visibilityState === 'visible') left--;
    $('wait').textContent = `Wait ${left}s — stay on this tab.`;
    if (left > 0) return;
    clearInterval(tick);
    const { overrides, glass } = await load(), t = Date.now();
    await save({
      overrides: [...overrides.filter(o => o.until > t), { pattern: m.pattern ?? new URL(url).hostname, until: t + glass.grantMin * MIN }],
      breaks: { date: today(t), n: breaks + 1 },
    });
    await chrome.runtime.sendMessage('apply');
    location.replace(url);
  }, 1000);
}
