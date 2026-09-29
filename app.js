import { MIN, REASON, normalize, phase, used, why } from './core.js';
import { load, resetPomo, save, togglePomo } from './store.js';

const $ = q => document.querySelector(q);
const fmt = ms => `${Math.floor(ms / MIN)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const patternsOf = text => [...new Set(text.split('\n').map(normalize).filter(Boolean))];
const fieldsets = () => [...$('#groups').children];
const times = w => w.querySelectorAll('[type=time]');
let s = await load(), timer;

function fieldsetFor(g) {
  const f = $('#tpl').content.firstElementChild.cloneNode(true), e = f.elements;
  f.dataset.id = g.id;
  e.name.value = g.name;
  e.mode.value = g.mode;
  e.patterns.value = g.patterns.join('\n');
  f.querySelector('.wins').append(...g.schedule.map(windowFor));
  e.pomodoro.checked = g.pomodoro;
  e.budget.value = g.budget;
  return f;
}

function windowFor({ days, start, end }) {
  const w = $('#win').content.firstElementChild.cloneNode(true), [a, b] = times(w);
  w.querySelectorAll('[type=checkbox]').forEach(c => c.checked = days.includes(+c.value));
  a.valueAsNumber = start * MIN;
  b.valueAsNumber = end * MIN;
  return w;
}

const readWindow = w => ({ days: [...w.querySelectorAll(':checked')].map(c => +c.value), start: times(w)[0].valueAsNumber / MIN, end: times(w)[1].valueAsNumber / MIN });

function readGroup(f) {
  const e = f.elements;
  return {
    id: f.dataset.id, name: e.name.value.trim() || 'Untitled', mode: e.mode.value, patterns: patternsOf(e.patterns.value),
    schedule: [...f.querySelectorAll('.win')].map(readWindow).filter(w => w.days.length && w.start >= 0 && w.end >= 0),
    pomodoro: e.pomodoro.checked, budget: Math.max(0, +e.budget.value || 0),
  };
}

function commit() {
  clearTimeout(timer);
  save({ groups: fieldsets().map(readGroup) });
  renderStatus();
}

function renderTargets() {
  const sel = $('#hereGroup'), v = sel.value;
  sel.replaceChildren(...s.groups.filter(g => g.mode === 'block').map(g => new Option(g.name, g.id)));
  sel.value = v || sel.value;
  $('#here').hidden = !$('#hereHost').textContent || !sel.options.length;
}

function renderStatus() {
  const now = Date.now(), p = s.pomo.startedAt && phase(s.pomo, now);
  $('#pomo').textContent = !p ? 'Start focus' : s.pomo.pausedAt ? 'Resume' : 'Pause';
  $('#intent').hidden = !($('#reset').hidden = !p);
  $('#pomoState').textContent = p ? `${s.pomo.pausedAt ? 'Paused · ' : ''}${p.work ? 'Focus' : 'Rest'} ${fmt(p.left)}${s.pomo.intent ? ` · ${s.pomo.intent}` : ''}` : '';
  document.querySelectorAll('[data-key^="pomo."]').forEach(el => el.disabled = !!p);
  const rules = s.groups.reduce((n, g) => n + g.patterns.length, 0);
  $('#summary').value = rules > 900 ? `${rules}/1000 rules` : '';
  for (const f of fieldsets()) {
    const g = s.groups.find(g => g.id === f.dataset.id), e = f.elements, r = g && why(g, s, now);
    if (!g) continue;
    e.info.className = r ? 'on' : 'dim';
    e.info.value = [
      r ? `Blocking · ${REASON[r]}` : g.schedule.length || g.pomodoro || g.budget ? 'Open' : 'Never active — add a schedule, focus or budget',
      g.budget && `${Math.floor(used(s, g, now) / MIN)}/${g.budget} min today`,
    ].filter(Boolean).join(' · ');
  }
}

for (const el of document.querySelectorAll('[data-key]')) {
  const [obj, key] = el.dataset.key.split('.');
  el.value = s[obj][key];
  el.addEventListener('change', () => el.validity.valid && save({ [obj]: { ...s[obj], [key]: +el.value } }));
}

const toggle = () => togglePomo($('#intent').value).then(() => $('#intent').value = '');
$('#pomo').onclick = toggle;
$('#reset').onclick = resetPomo;
$('#intent').addEventListener('keydown', e => e.key === 'Enter' && toggle());
$('#groups').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(commit, 300); });
$('#groups').addEventListener('change', e => e.target.name === 'patterns' && (e.target.value = patternsOf(e.target.value).join('\n')));
$('#groups').addEventListener('click', ({ target: b }) => {
  if (b.name === 'addWin') return b.closest('fieldset').querySelector('.wins').append(windowFor({ days: [1, 2, 3, 4, 5], start: 540, end: 1020 })), commit();
  if (b.name === 'delWin') return b.closest('.win').remove(), commit();
  if (b.name !== 'del') return;
  if (b.dataset.armed) return b.closest('fieldset').remove(), commit();
  b.dataset.armed = 1;
  b.textContent = 'Confirm remove';
});
$('#add').onclick = () => {
  const f = fieldsetFor({ id: crypto.randomUUID().slice(0, 8), name: 'New group', mode: 'block', patterns: [], schedule: [], pomodoro: false, budget: 0 });
  $('#groups').append(f);
  commit();
  f.elements.name.select();
};
$('#blockHere').onclick = () => {
  const e = fieldsets().find(f => f.dataset.id === $('#hereGroup').value).elements;
  e.patterns.value = patternsOf(`${e.patterns.value}\n${$('#hereHost').textContent}`).join('\n');
  commit();
};
addEventListener('keydown', e => e.key === 'Escape' && window.close());
chrome.storage.onChanged.addListener(async () => { s = await load(); renderTargets(); renderStatus(); });

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
if (/^https?:/.test(tab?.url)) $('#hereHost').textContent = normalize(new URL(tab.url).hostname);
$('#groups').replaceChildren(...s.groups.map(fieldsetFor));
renderTargets();
renderStatus();
setInterval(renderStatus, 1000);
