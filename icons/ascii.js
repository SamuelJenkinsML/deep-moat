import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const RAMP = ' ·~=+*x%$@', PAD = 8, SHOW = 12;
const rad = d => d * Math.PI / 180, round = s => s.replace(/\d+\.\d{2,}/g, v => +(+v).toFixed(1));

const MASK = { body: '#fff', face: '#000', cheek: '#f00' }, LOGO = { body: '#7aa2f7', face: '#1a1b26', cheek: '#f7768e' };

const source = ({ turn = 0, eyes = 'open', dx = 0 }, ink = MASK) => {
  const at = a => ({ x: 64 + dx + 36 * Math.sin(rad(turn + a)), c: Math.cos(rad(turn + a)) });
  const facing = (a, draw) => { const { x, c } = at(a); return c > 0.15 ? draw(x, c) : ''; };
  const merlons = [0, 60, 120, 180, 240, 300].map(a => { const { x, c } = at(a), w = 16 * Math.abs(c) + 4; return `<rect x="${x - w / 2}" y="14" width="${w}" height="36" rx="${Math.min(8, w / 2)}"/>`; }).map(round);
  const eye = a => facing(a, (x, c) => ({
    open: `<ellipse class="e" cx="${x}" cy="62" rx="${6 * c}" ry="6" stroke="none"/>`,
    half: `<ellipse cx="${x}" cy="63" rx="${6 * c}" ry="2.5" stroke="none"/>`,
    shut: `<path d="M${x - 7 * c} 62q${7 * c} 6 ${14 * c} 0" fill="none"/>`,
    happy: `<path d="M${x - 7 * c} 65q${7 * c} -7 ${14 * c} 0" fill="none"/>`,
  })[eyes]);
  const mouth = facing(0, (x, c) => `<path d="M${x - 8 * c} 74q${8 * c} ${eyes === 'happy' ? '12 ' + 16 * c + ' 0z' : '8 ' + 16 * c + ' 0" fill="none'}"/>`);
  const cheek = a => facing(a, (x, c) => `<ellipse cx="${x}" cy="74" rx="${6 * c}" ry="6"/>`);
  return round(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><g fill="${ink.body}">${[...new Set(merlons)].join('')}<rect x="${28 + dx}" y="36" width="72" height="80" rx="16"/></g>
<g fill="${ink.face}" stroke="${ink.face}" stroke-width="5" stroke-linecap="round">${eye(-22)}${eye(22)}${mouth}</g><g fill="${ink.cheek}">${cheek(-42)}${cheek(42)}</g></svg>`);
};

const esc = c => ({ '&': '&amp;', '<': '&lt;' })[c] ?? c;
const text = (y, chars, cls = '') => `<text${cls} y="${y}" textLength="${chars.length * 8}">${chars.map(([c, k]) => k ? `<tspan class="${k}">${esc(c)}</tspan>` : esc(c)).join('')}</text>`;

const frame = (pose, cols, rows, top) => {
  const png = execFileSync('rsvg-convert', ['-w', 1280], { input: source(pose) });
  const pixels = (...ops) => execFileSync('magick', ['png:-', '-background', 'black', '-flatten', '-crop', '960x800+160+120', ...ops, '-filter', 'box', '-resize', `${cols}x${rows}!`, '-depth', '8', 'rgb:-'], { input: png });
  const soft = pixels('-blur', '0x14'), hard = pixels();
  return Array.from({ length: rows }, (_, j) => {
    const chars = Array.from({ length: cols }, (_, k) => {
      const i = (j * cols + k) * 3, light = 1.2 - 0.35 * Math.hypot(k / cols - 0.35, j / rows - 0.3);
      const ink = hard[i] ? Math.min(1, (soft[i] + soft[i + 1]) / 2 / 255 * light) : 0;
      const pink = hard[i + 1] < hard[i] / 2, level = Math.round(ink ** 1.5 * (RAMP.length - 1));
      return [RAMP[pink ? Math.max(level, 7) : level], pink && 'p'];
    });
    while (chars.at(-1)?.[0] === ' ') chars.pop();
    return chars.length ? text(top + (j + 1) * 16, chars) : '';
  }).join('');
};

const sea = (cols, waves, top, p) => Array.from({ length: waves }, (_, r) => text(top + (r + 1) * 16, Array.from({ length: cols + p }, (_, c) => {
  const t = 2 * Math.PI * c / p + r * 2.3, f = (Math.sin(t) + 0.5 * Math.sin(2 * t + r) + 1.5) / 3;
  return [RAMP[Math.round(f ** 1.5 * (3 + r))]];
}), ' class="w"')).join('\n');

const POSES = {
  idle: {}, half: { eyes: 'half' }, shut: { eyes: 'shut' },
  ...Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`t${i}`, { turn: (i + 1) * 30 }])),
  g0: { eyes: 'happy' }, g1: { eyes: 'happy', dx: -2 }, g2: { eyes: 'happy', dx: 2 },
};
const blink = [['half', 1], ['shut', 1], ['half', 1]];
const AWAKE = [['idle', 20], ...blink, ['idle', 25], ...blink, ['idle', 2], ...blink, ['idle', 20],
  ...Object.keys(POSES).filter(k => /^t\d/.test(k)).map(k => [k, 1]), ['idle', 18],
  ...Array(5).fill([['g1', 2], ['g2', 2]]).flat(), ['g0', 5], ['idle', 20]];
const ZZZ = [[400, 150, 0], [430, 110, 1.3], [460, 70, 2.6]].map(([x, y, d]) => `<text class="z" x="${x}" y="${y}" style="animation-delay:${d}s">z</text>`).join('');

const art = ({ cols, rows, waves, p, timeline, bob = 3, extra = '' }) => {
  const play = (name, period, fn) => `animation:${name} ${period}s ${fn} ${SHOW / period}`;
  const keys = [...new Set(timeline.map(([k]) => k))], fh = rows * 16, w = cols * 8, h = PAD + fh + waves * 16 + 6;
  const ticks = timeline.reduce((n, [, t]) => n + t, 0);
  let t = 0;
  const steps = timeline.map(([k, n]) => `${(100 * (t += n) / ticks - 100 * n / ticks).toFixed(2)}%{transform:translateY(-${keys.indexOf(k) * fh}px)}`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" xml:space="preserve" font-family="ui-monospace,'JetBrains Mono',Menlo,monospace" font-size="14" font-weight="700" style="font-variant-ligatures:none">
<style>text{fill:#c0caf5;white-space:pre}.p{fill:#f7768e}.w{fill:#7aa2f7;${play('flow', 4, `steps(${p})`)}}.w:nth-of-type(even){animation-direction:reverse}
.bob{${play('bob', bob, 'ease-in-out')}}.film{${play('film', SHOW, 'step-end')}}.z{font-size:20px;opacity:0;${play('z', 4, 'ease-out')}}
@keyframes flow{to{transform:translateX(-${p * 8}px)}}@keyframes bob{50%{transform:translateY(-${PAD * 0.75}px)}}@keyframes film{${steps}}
@keyframes z{30%{opacity:.8}to{opacity:0;transform:translate(12px,-40px)}}
@media (prefers-color-scheme:light){text{fill:#3760bf}.p{fill:#f52a65}.w{fill:#2e7de9}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>
<linearGradient id="f"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".25" stop-color="#fff"/><stop offset=".75" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<mask id="m"><rect width="${w}" height="${h}" fill="url(#f)"/></mask>
<g class="bob"><svg y="${PAD}" width="${w}" height="${fh}"><g class="film">
${keys.map((k, i) => frame(POSES[k], cols, rows, i * fh)).join('\n')}
</g></svg></g>
<g mask="url(#m)">
${sea(cols, waves, PAD + fh, p)}
</g>${extra}
</svg>
`;
};

const out = (f, o) => writeFileSync(new URL(f, import.meta.url), art(o));
const BIG = { cols: 72, rows: 30, waves: 5, p: 16 };
out('moatie.svg', { ...BIG, timeline: AWAKE });
out('moatie-rest.svg', { ...BIG, timeline: [['shut', 1]], bob: 4, extra: ZZZ });
writeFileSync(new URL('logo.svg', import.meta.url), source({}, LOGO)
  .replace('>', '><style>.e{transform-box:fill-box;transform-origin:center;animation:blink 3s 2}@keyframes blink{46%,54%{transform:none}50%{transform:scaleY(.1)}}</style><rect width="128" height="128" rx="28" fill="#1a1b26"/>')
  .replace('</svg>', '<path d="M14 108q10-8 20 0t20 0t20 0t20 0t20 0" fill="none" stroke="#7dcfff" stroke-width="7" stroke-linecap="round"/></svg>\n'));
