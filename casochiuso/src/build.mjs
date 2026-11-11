import fs from 'node:fs';
import { C, defs, sh, circ, rect, big, small, place, stamp, ines, man, manSeated, walker, scrapPath } from './lib.mjs';
import { chapters as sceneDefs } from './chapters.mjs';
import './chapters2.mjs';
import './chapters3.mjs';

const TL = JSON.parse(fs.readFileSync('src/timeline.json', 'utf8'));
const DUR = Math.ceil(TL.duration * 30) / 30;
fs.mkdirSync('compositions', { recursive: true });

// ---------- title card (chapter openers) ----------
const ROMAN = { uno: 'I', due: 'II', tre: 'III', quattro: 'IV', cinque: 'V', sei: 'VI', sette: 'VII', otto: 'VIII' };
function card(p, ch, bg) {
  if (!ch.title) return { svg: '', js: '' };
  const [kicker, name] = ch.title;
  const isBrand = ch.id === 'brand';
  const word = kicker.split(' ')[1]?.toLowerCase();
  const num = ROMAN[word] || '';
  const fs1 = name.length > 12 ? 190 : 250;
  const svg = isBrand
    ? `<g id="${p}-card"><rect width="1920" height="1080" fill="${C.mus}"/><rect y="0" width="1920" height="1080" fill="url(#${p}-dots)" opacity=".10"/>
       ${big(p + '-t1', 'CASO CHIUSO', 960, 560, 420, C.ink, { anchor: 'middle', plate: C.red, pd: 10 })}
       ${small(p + '-t2', name, 960, 700, 64, C.ink, { anchor: 'middle', ls: 14 })}
       ${stamp(p, p + '-st', 'CHIUSO', 1480, 170, 120, C.red, -8)}</g>`
    : `<g id="${p}-card"><rect width="1920" height="1080" fill="${bg}"/>
       <text id="${p}-num" x="1790" y="980" text-anchor="end" font-family="'League Gothic'" font-size="1100" fill="${C.ink}" opacity=".92">${num}</text>
       <text x="1797" y="987" text-anchor="end" font-family="'League Gothic'" font-size="1100" fill="${C.mus}" opacity=".0">${num}</text>
       ${small(p + '-k', kicker, 150, 420, 46, C.ink, { ls: 14 })}
       ${big(p + '-n', name, 144, 420 + fs1 * 0.82, fs1, C.bone, { plate: C.ink, pd: 9 })}
       <rect id="${p}-bar" x="150" y="350" width="260" height="14" fill="${C.ink}"/></g>`;
  const js = isBrand
    ? `tl.fromTo("#${p}-t1",{scale:1.18,transformOrigin:"50% 50%",opacity:0},{scale:1,opacity:1,duration:.22,ease:"power4.out"},.05);
       tl.fromTo("#${p}-t2",{opacity:0,y:30},{opacity:1,y:0,duration:.35,ease:"power3.out"},.5);
       tl.fromTo("#${p}-st",{scale:2.4,transformOrigin:"50% 50%",opacity:0},{scale:1,opacity:1,duration:.16,ease:"power4.in"},1.2);
       tl.to("#${p}-card",{y:-1080,duration:.42,ease:"power3.inOut"},3.0);`
    : `tl.fromTo("#${p}-num",{scale:1.25,transformOrigin:"100% 100%",opacity:0},{scale:1,opacity:.92,duration:.2,ease:"power4.out"},.05);
       tl.fromTo("#${p}-k",{opacity:0,x:-40},{opacity:1,x:0,duration:.3,ease:"power3.out"},.25);
       tl.fromTo("#${p}-n",{opacity:0,x:-120},{opacity:1,x:0,duration:.35,ease:"power4.out"},.4);
       tl.fromTo("#${p}-bar",{scaleX:0,transformOrigin:"0% 50%"},{scaleX:1,duration:.4,ease:"power3.out"},.6);
       tl.to("#${p}-card",{y:-1080,duration:.42,ease:"power3.inOut"},3.0);`;
  return { svg, js };
}

// ---------- build chapter compositions ----------
const hosts = [];
TL.chapters[0].start = 0;
for (const ch of TL.chapters) {
  const def = sceneDefs[ch.id];
  if (!def) { console.warn('no scene for', ch.id); continue; }
  const p = ch.id;
  const lines = ch.lines.map((l) => ({ ...l, ls: l.s - ch.start, le: l.e - ch.start, d: l.e - l.s }));
  const ctx = {
    p, lines, ch,
    cue: (k, phrase, frac) => {
      const l = lines[k]; const i = l.text.indexOf(phrase);
      if (i < 0 && frac == null) throw new Error(`cue ${p}[${k}] "${phrase}" not found`);
      return l.ls + (frac != null ? frac : (i / l.text.length)) * l.d;
    },
    off: ch.title ? 3.4 : 0,
  };
  const body = def(ctx);
  const cd = card(p, ch, def.cardBg || C.cor);
  const dur = +(ch.end - ch.start + (ch === TL.chapters.at(-1) ? 2.5 : 0)).toFixed(3);
  const html = `<template>
<style>
  #root{position:absolute;inset:0;overflow:hidden;background:${body.bg || C.cor};}
  #root .cam{position:absolute;inset:0;}
  #root svg{position:absolute;left:0;top:0;width:1920px;height:1080px;}
  #root svg text{font-family:Montserrat;}
  #root svg text[font-family*="League"]{font-family:'League Gothic',sans-serif;}
  ${body.css || ''}
</style>
<div id="root" data-composition-id="${p}" data-width="1920" data-height="1080">
  <div class="cam" id="${p}-cam"><svg id="${p}-world" viewBox="0 0 1920 1080">${defs(p)}${body.world}</svg></div>
  <svg id="${p}-ovl" viewBox="0 0 1920 1080">${body.ovl || ''}</svg>
  <svg id="${p}-cardsvg" viewBox="0 0 1920 1080">${cd.svg}</svg>
</div>
<script>
const tl = gsap.timeline({ paused: true });
${cd.js}
${body.js}
gsap.set("#${p}-world",{transformOrigin:"50% 55%"});tl.fromTo("#${p}-world",{scale:1},{scale:1.04,duration:${dur.toFixed(2)},ease:"none",immediateRender:false},0);
window.__timelines["${p}"] = tl;
</script>
</template>`;
  fs.writeFileSync(`compositions/${p}.html`, html.replace(/<text /g, '<text data-layout-allow-overlap '));
  hosts.push({ p, start: +ch.start.toFixed(3), dur });
}

// ---------- captions ----------
const capItems = [];
function chunk(text, max = 96) {
  if (text.length <= max) return [text];
  const parts = text.match(/[^.,;:!?…]+[.,;:!?…]*\s*/g) || [text];
  const out = []; let cur = '';
  for (const s of parts) { if ((cur + s).trim().length > max && cur) { out.push(cur.trim()); cur = s; } else cur += s; }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
for (const ch of TL.chapters) for (const [i, l] of ch.lines.entries()) {
  const ck = chunk(l.text); const tot = ck.reduce((a, c) => a + c.length, 0); let t0 = l.s;
  ck.forEach((c, j) => {
    const d = (l.e - l.s) * c.length / tot; const last = j === ck.length - 1;
    capItems.push(`<div id="cap-${ch.id}-${i}-${j}" class="clip cap" data-start="${t0.toFixed(3)}" data-duration="${(d + (last ? 0.3 : 0)).toFixed(3)}" data-track-index="1"><span>${c.replace(/&/g, '&amp;')}</span></div>`);
    t0 += d;
  });
}
fs.writeFileSync('compositions/captions.html', `<template>
<style>
  #root{position:absolute;inset:0;}
  .cap{position:absolute;left:160px;right:160px;bottom:62px;text-align:center;font-family:Montserrat;font-weight:800;font-size:40px;line-height:1.22;color:${C.bone};}
  .cap span{-webkit-text-stroke:9px ${C.ink};paint-order:stroke fill;}
</style>
<div id="root" data-composition-id="captions" data-width="1920" data-height="1080">
${capItems.join('\n')}
</div>
<script>
const tl = gsap.timeline({ paused: true });
window.__timelines["captions"] = tl;
</script>
</template>`);

// ---------- index ----------
const hostHtml = hosts.map((h, i) => `    <div id="${h.p}" data-composition-id="${h.p}" data-composition-src="compositions/${h.p}.html" data-start="${h.start}" data-duration="${h.dur}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index:${10 + i}"></div>`).join('\n');
fs.writeFileSync('index.html', `<!doctype html>
<html lang="it">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=1920, height=1080"/>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1920px;height:1080px;overflow:hidden;background:${C.cor}}
  #root{position:relative;width:1920px;height:1080px;}
  #grain{position:absolute;inset:0;z-index:60;mix-blend-mode:multiply;opacity:.16;pointer-events:none}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${DUR.toFixed(3)}" data-width="1920" data-height="1080">
${hostHtml}
    <div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="${DUR.toFixed(3)}" data-track-index="2" data-track-kind="captions" data-width="1920" data-height="1080" style="z-index:50"></div>
    <svg id="grain" width="1920" height="1080" viewBox="0 0 1920 1080"><filter id="gf"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/><feColorMatrix type="matrix" values="0 0 0 0 .16  0 0 0 0 .07  0 0 0 0 .08  0 0 0 1.1 -.35"/></filter><rect width="1920" height="1080" filter="url(#gf)"/></svg>
    <audio id="mix" class="clip" src="assets/audio/mix.wav" data-start="0" data-duration="${DUR.toFixed(3)}" data-track-index="3" data-volume="1"></audio>
</div>
<script>
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
window.__timelines["main"] = tl;
</script>
</body>
</html>`);
console.log('built', hosts.length, 'chapters', DUR);
