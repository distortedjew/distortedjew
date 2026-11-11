import { C, sh, circ, rect, big, small, place, stamp, ines, man, manSeated, walker, scrapPath } from './lib.mjs';
import { chapters, maskFace, f2, IN, SL, OUT, FADE, PUSH, mapAus, sea, wall, dawnBeach } from './chapters.mjs';

const bg = (p, fill) => `<rect width="1920" height="1080" fill="${fill}"/><rect width="1920" height="1080" fill="url(#${p}-dots)" opacity=".09"/>`;
const panel = (p, id, fill) => `<rect id="${id}" width="1920" height="1080" fill="${fill}"/>`;
const sweep = (p, s, t, from = 1920, d = 0.45) => `tl.set("#${p}-${s}",{opacity:1},${f2(t)});tl.fromTo("#${p}-${s}",{x:${from}},{x:0,duration:${d},ease:"power3.out"},${f2(t)});`;

// =============== CH 6 — LE TEORIE ===============
chapters.c6 = (x) => {
  const { p, cue, lines } = x; const L = lines;
  const heads = ['MISTERO A SOMERTON', "CHI ERA L'UOMO?", 'TAMAM SHUD', 'NESSUNO LO CONOSCE', 'CASO IRRISOLTO', 'VELENO? SPIA?'];
  const pos = [[120, 120, -5], [980, 90, 4], [260, 400, 3], [900, 470, -4], [140, 700, -3], [1000, 790, 5]];
  const world = `${bg(p, C.red)}
  <g id="${p}-s0">${heads.map((h, i) => `<g id="${p}-h${i}">${place(pos[i][0], pos[i][1], 1, `${sh(p, 'M0 0 H820 V170 H0Z', C.bone, { dx: 10, dy: 10, sw: 4 })}<rect x="24" y="22" width="772" height="8" fill="${C.ink}"/><text x="410" y="124" text-anchor="middle" font-family="'League Gothic'" font-size="108" letter-spacing="3" fill="${C.ink}">${h}</text>`, pos[i][2])}</g>`).join('')}</g>
  <g id="${p}-s1">${panel(p, p + '-p1', C.ink)}
    ${place(1000, 190, 1.5, mapAus(p, p + '-map'))}
    <g id="${p}-pin">${circ(p, 1000 + 357 * 1.5, 190 + 312 * 1.5, 20, C.mus, { dx: 0, dy: 0 })}${circ(p, 1000 + 384 * 1.5, 190 + 375 * 1.5, 20, C.red, { dx: 0, dy: 0 })}
      <path id="${p}-dash" d="M${1000 + 357 * 1.5} ${190 + 312 * 1.5} L${1000 + 384 * 1.5} ${190 + 375 * 1.5}" stroke="${C.mus}" stroke-width="6" stroke-dasharray="14 10"/>
      ${small(p + '-woo', 'WOOMERA', 1000 + 357 * 1.5 - 36, 190 + 312 * 1.5 - 10, 38, C.mus, { anchor: 'end', ls: 6 })}${small(p + '-adl', 'ADELAIDE', 1000 + 384 * 1.5 - 30, 190 + 375 * 1.5 + 62, 38, C.bone, { anchor: 'end', ls: 6 })}</g>
    ${big(p + '-spy', 'SPIA?', 90, 560, 480, C.bone, { plate: C.red, pd: 10 })}
    <g id="${p}-sp">${place(700, 1040, 2.0, walker(p, p + '-wk', C.bone, true))}</g>
  </g>
  <g id="${p}-s2">${panel(p, p + '-p2', C.mus)}
    <g id="${p}-heart">${place(1380, 600, 2.1, `<g id="${p}-hl"><path d="M0 120 L-150 -20 C-210 -90 -170 -190 -90 -190 C-40 -190 -10 -160 0 -130 L-28 -70 L12 -10 L-20 50Z" fill="${C.red}" stroke="${C.ink}" stroke-width="6" stroke-linejoin="round"/></g><g id="${p}-hr"><path d="M0 120 L150 -20 C210 -90 170 -190 90 -190 C40 -190 10 -160 0 -130 L28 -70 L-12 -10 L20 50Z" fill="${C.red}" stroke="${C.ink}" stroke-width="6" stroke-linejoin="round"/></g>`)}</g>
    ${big(p + '-am', 'AMORE?', 90, 600, 470, C.ink, { plate: C.red, pd: 10 })}
  </g>
  <g id="${p}-s3">${panel(p, p + '-p3', C.ver)}
    <g id="${p}-bottle">${place(1400, 120, 1.9, `${sh(p, 'M-50 120 H50 V420 Q50 470 0 470 Q-50 470 -50 420Z', C.bone)}${sh(p, 'M-24 20 H24 V120 H-24Z', C.bone, { dx: 5, dy: 5 })}<rect x="-30" y="-20" width="60" height="44" rx="6" fill="${C.mus}" stroke="${C.ink}" stroke-width="5"/><rect x="-42" y="260" width="84" height="150" fill="${C.mus}" opacity=".9"/><circle cx="0" cy="330" r="26" fill="${C.ink}"/><rect x="-14" y="350" width="28" height="22" fill="${C.ink}"/><circle cx="-9" cy="326" r="7" fill="${C.mus}"/><circle cx="9" cy="326" r="7" fill="${C.mus}"/>`, 8)}</g>
    ${big(p + '-ve', 'VELENO?', 90, 600, 470, C.ink, { plate: C.mus, pd: 10 })}
  </g>
  <g id="${p}-s4">${panel(p, p + '-p4', C.ink)}
    <g id="${p}-mk">${place(960, 600, 2.3, maskFace(p, p + '-mf'))}</g>
    <g id="${p}-ring"><circle cx="1060" cy="360" r="70" fill="none" stroke="${C.mus}" stroke-width="10" stroke-dasharray="18 12"/></g>
  </g>`;
  const js = `
  ${['s1', 's2', 's3', 's4'].map((s) => `gsap.set("#${p}-${s}",{opacity:0});`).join('')}
  ${heads.map((_, i) => `tl.fromTo("#${p}-h${i}",{y:-900,opacity:0,rotation:${(i % 2 ? 8 : -8)},transformOrigin:"50% 50%"},{y:0,opacity:1,rotation:0,duration:.35,ease:"back.out(1.5)"},${f2(L[0].ls + 0.15 + i * 0.28)});`).join('\n  ')}
  // l1 spy
  tl.to("#${p}-s0",{x:-2400,duration:.4,ease:"power3.in"},${f2(L[1].ls - 0.3)});
  ${sweep(p, 's1', L[1].ls - 0.2)}
  ${IN(`#${p}-spy`, L[1].ls + 0.1, { s: 1.4, o: '0% 100%' })}
  ${SL(`#${p}-sp`, L[1].ls + 0.3, -600, 0, { d: 0.5 })}
  ${IN(`#${p}-pin`, cue(1, 'Woomera'), { s: 1.5 })}
  tl.fromTo("#${p}-dash",{strokeDashoffset:80},{strokeDashoffset:0,duration:2,ease:"none"},${f2(cue(1, 'Woomera'))});
  // l2 love
  ${sweep(p, 's2', L[2].ls - 0.2)}
  tl.fromTo("#${p}-hl",{x:0,rotation:0,transformOrigin:"100% 100%"},{x:-26,rotation:-9,duration:.4,ease:"back.out(2)"},${f2(cue(2, 'finito male'))});
  tl.fromTo("#${p}-hr",{x:0,rotation:0,transformOrigin:"0% 100%"},{x:26,rotation:9,duration:.4,ease:"back.out(2)"},${f2(cue(2, 'finito male'))});
  ${IN(`#${p}-am`, L[2].ls + 0.1, { s: 1.4, o: '0% 100%' })}
  // l3 poison
  ${sweep(p, 's3', L[3].ls - 0.2)}
  ${IN(`#${p}-ve`, L[3].ls + 0.1, { s: 1.4, o: '0% 100%' })}
  ${SL(`#${p}-bottle`, L[3].ls + 0.2, 0, -900, { d: 0.6, e: 'bounce.out' })}
  // l4 the mask
  ${sweep(p, 's4', L[4].ls - 0.2)}
  ${SL(`#${p}-mk`, L[4].ls, 0, 900, { d: 0.7, e: 'power3.out' })}
  gsap.set("#${p}-ring",{opacity:0});
  ${PUSH(p, L[4].ls, L[4].d, 1.25, '960px 420px')}
  tl.fromTo("#${p}-ring",{opacity:0,scale:2,transformOrigin:"1060px 360px"},{opacity:1,scale:1,duration:.4,ease:"power3.out"},${f2(cue(4, 'conserva'))});
  `;
  return { bg: C.red, world, js };
};
chapters.c6.cardBg = C.red;

// =============== CH 7 — IL CAPELLO ===============
chapters.c7 = (x) => {
  const { p, cue, lines } = x; const L = lines;
  const helix = (() => {
    let a = '', b = '', r = '';
    for (let i = 0; i <= 40; i++) { const y = i * 22, xa = 110 * Math.sin(i * 0.42), xb = -xa; a += `${i ? 'L' : 'M'}${xa.toFixed(1)} ${y} `; b += `${i ? 'L' : 'M'}${xb.toFixed(1)} ${y} `; if (i % 2) r += `<path d="M${xa.toFixed(1)} ${y} L${xb.toFixed(1)} ${y}" stroke="${C.bone}" stroke-width="7" stroke-linecap="round"/>`; }
    return `${r}<path d="${a}" fill="none" stroke="${C.ink}" stroke-width="14" stroke-linecap="round"/><path d="${b}" fill="none" stroke="${C.red}" stroke-width="14" stroke-linecap="round"/>`;
  })();
  const nodes = [[960, 930, -1], [700, 780, 0], [1220, 780, 0], [520, 620, 1], [880, 620, 1], [1060, 620, 2], [1400, 620, 2], [420, 470, 3], [620, 470, 3], [800, 470, 4], [960, 470, 4], [1140, 470, 5], [1320, 470, 6], [1500, 470, 6]];
  const world = `${bg(p, C.ver)}
  <g id="${p}-s0">
    ${place(960, 1000, 1.0, `${sh(p, 'M-640 0 V-60 H640 V0Z', C.bone)}${sh(p, 'M-600 -60 V-100 H600 V-60Z', C.bone, { dx: 6, dy: 6 })}${Array.from({ length: 8 }, (_, i) => `<rect x="${-540 + i * 154}" y="-420" width="62" height="320" fill="${C.bone}" stroke="${C.ink}" stroke-width="4"/>`).join('')}${sh(p, 'M-620 -420 H620 V-480 H-620Z', C.mus)}${sh(p, 'M-640 -480 L0 -640 L640 -480Z', C.bone)}<text x="0" y="-436" text-anchor="middle" font-family="Montserrat" font-weight="800" font-size="30" letter-spacing="10" fill="${C.ink}">UNIVERSITÀ DI ADELAIDE</text>`)}
    <g id="${p}-ytxt">${big(p + '-yr', '2020', 960, 440, 380, C.ink, { plate: C.mus, anchor: 'middle' })}</g>
    <g id="${p}-tgA">${place(130, 700, 1, `${sh(p, 'M0 0 H620 V140 H0Z', C.bone, { sw: 4 })}<text x="310" y="104" text-anchor="middle" font-family="'League Gothic'" font-size="96" letter-spacing="3" fill="${C.ink}">DEREK ABBOTT</text>`, -4)}</g>
  </g>
  <g id="${p}-s1">
    <g id="${p}-hx">${place(1500, -60, 1, helix, 4)}</g>
    <g id="${p}-iw">${place(430, 1040, 1.0, ines(p, p + '-in'))}</g>
    ${big(p + '-dna', 'DNA', 760, 400, 520, C.ink, { plate: C.mus })}
    <g id="${p}-tgB">${place(740, 540, 1, `${sh(p, 'M0 0 H760 V140 H0Z', C.bone, { sw: 4 })}<text x="380" y="104" text-anchor="middle" font-family="'League Gothic'" font-size="96" letter-spacing="3" fill="${C.ink}">COLLEEN FITZPATRICK</text>`, 3)}</g>
  </g>
  <g id="${p}-s2">
    <g id="${p}-mk">${place(1250, 560, 2.2, maskFace(p, p + '-mf'))}</g>
    ${big(p + '-nu', 'NIENTE', 90, 470, 400, C.ink, { plate: C.mus })}${big(p + '-nu2', 'DA ANALIZZARE', 90, 700, 250, C.ink, { plate: C.mus })}
    <g id="${p}-ns">${stamp(p, p + '-nss', 'RESTA IL GESSO', 520, 900, 110, C.red, -6)}</g>
  </g>
  <g id="${p}-s3">
    <g id="${p}-mk2">${place(520, 600, 1.35, maskFace(p, p + '-mf2'))}</g>
    <path d="M560 400 L1000 220 M560 520 L1000 860" stroke="${C.ink}" stroke-width="5" stroke-dasharray="14 12"/>
    <circle cx="560" cy="460" r="66" fill="none" stroke="${C.ink}" stroke-width="10"/>
    <g id="${p}-lens">${circ(p, 1390, 540, 380, C.bone, { dx: 14, dy: 14, sw: 12 })}
      <circle cx="1390" cy="540" r="352" fill="url(#${p}-dots)" opacity=".16"/>
      <path id="${p}-strand" d="M1130 700 C1180 380 1420 300 1560 440 S1660 640 1560 700" fill="none" stroke="${C.ink}" stroke-width="16" stroke-linecap="round"/>
      <g id="${p}-root"><circle cx="1130" cy="706" r="30" fill="${C.rose}" stroke="${C.ink}" stroke-width="7"/></g>
      ${small(p + '-rd', 'RADICE', 1130, 790, 44, C.red, { anchor: 'middle', ls: 8 })}</g>
  </g>
  <g id="${p}-s4">
    <g id="${p}-tr">${nodes.slice(1).map(([nx, ny, par], i) => `<path id="${p}-ln${i}" d="M${nodes[par][0]} ${nodes[par][1] - 120} L${nx} ${ny - 120}" stroke="${C.ink}" stroke-width="8" fill="none" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>`).join('')}
      ${nodes.slice(1).map(([nx, ny], i) => `<g id="${p}-nd${i}">${circ(p, nx, ny - 120, 34, C.bone, { dx: 5, dy: 5 })}</g>`).join('')}</g>
    <g id="${p}-root2">${circ(p, 960, 810, 56, C.red, { dx: 6, dy: 6 })}<text x="960" y="842" text-anchor="middle" font-family="'League Gothic'" font-size="100" fill="${C.bone}">?</text></g>
    ${big(p + '-cug', 'CUGINI LONTANI', 90, 250, 190, C.ink, { plate: C.mus })}
  </g>`;
  const js = `
  ${['s1', 's2', 's3', 's4'].map((s) => `gsap.set("#${p}-${s}",{opacity:0});`).join('')}
  gsap.set("#${p}-tgA",{opacity:0});
  ${SL(`#${p}-ytxt`, L[0].ls, 0, -600, { d: 0.6, e: 'back.out(1.4)' })}
  ${IN(`#${p}-tgA`, cue(0, 'Derek Abbott'), { s: 1.3 })}
  ${PUSH(p, L[0].ls, L[0].d, 1.06, '960px 700px')}
  // l1 dna
  tl.to("#${p}-s0",{x:-2400,duration:.4,ease:"power3.in"},${f2(L[1].ls - 0.3)});
  tl.set("#${p}-s1",{opacity:1},${f2(L[1].ls - 0.2)});
  gsap.set("#${p}-tgB",{opacity:0});
  ${SL(`#${p}-iw`, L[1].ls - 0.1, -700, 0, { d: 0.5 })}
  tl.fromTo("#${p}-hx",{y:-100},{y:60,duration:${f2(L[1].d + 1)},ease:"none"},${f2(L[1].ls)});
  ${IN(`#${p}-tgB`, cue(1, 'Colleen'), { s: 1.3 })}
  ${IN(`#${p}-dna`, cue(1, 'il DNA'), { s: 1.5, o: '0% 100%' })}
  tl.fromTo("#${p}-in-lens",{rotation:-10,transformOrigin:"50% 50%"},{rotation:14,duration:1.2,ease:"sine.inOut",yoyo:true,repeat:3},${f2(L[1].ls + 0.5)});
  // l2 only the mask
  tl.to("#${p}-s1",{opacity:0,duration:.2},${f2(L[2].ls - 0.1)});
  tl.set("#${p}-s2",{opacity:1},${f2(L[2].ls - 0.1)});
  ${IN(`#${p}-nu`, L[2].ls, { s: 1.4, o: '0% 100%' })}
  ${IN(`#${p}-nu2`, L[2].ls + 0.3, { s: 1.4, o: '0% 100%' })}
  tl.to(["#${p}-nu","#${p}-nu2"],{opacity:0,duration:.25},${f2(cue(2, 'Resta') - 0.1)});
  ${SL(`#${p}-mk`, cue(2, 'Resta') - 0.2, 1000, 0, { d: 0.6 })}
  ${IN(`#${p}-ns`, cue(2, 'maschera'), { s: 2.2, d: 0.16 })}
  // l3 macro on the hair
  tl.to("#${p}-s2",{opacity:0,duration:.2},${f2(L[3].ls - 0.1)});
  tl.set("#${p}-s3",{opacity:1},${f2(L[3].ls - 0.1)});
  ${SL(`#${p}-mk2`, L[3].ls, -900, 0, { d: 0.6 })}
  ${IN(`#${p}-lens`, cue(3, 'capello'), { s: 0.2, d: 0.5, o: '560px 460px' })}
  tl.fromTo("#${p}-strand",{strokeDasharray:1500,strokeDashoffset:1500},{strokeDashoffset:0,duration:1.6,ease:"power2.inOut"},${f2(cue(3, 'capello') + 0.3)});
  ${IN(`#${p}-root`, cue(3, 'radice'), { s: 3, d: 0.25 })}
  ${IN(`#${p}-rd`, cue(3, 'radice') + 0.1, { s: 1.6, d: 0.2 })}
  // l4 family tree
  tl.to("#${p}-s3",{opacity:0,duration:.2},${f2(L[4].ls - 0.1)});
  tl.set("#${p}-s4",{opacity:1},${f2(L[4].ls - 0.1)});
  ${IN(`#${p}-root2`, L[4].ls, { s: 1.6 })}
  ${IN(`#${p}-cug`, cue(4, 'cugini'), { s: 1.4, o: '0% 100%' })}
  ${nodes.slice(1).map((n, i) => { const t0 = cue(4, 'ramo dopo ramo') + (i / 13) * (L[4].le - cue(4, 'ramo dopo ramo') - 1.2); return `gsap.set("#${p}-nd${i}",{opacity:0});tl.to("#${p}-ln${i}",{strokeDashoffset:0,duration:.5,ease:"power2.out"},${f2(t0)});tl.fromTo("#${p}-nd${i}",{opacity:0,scale:.2,transformOrigin:"${n[0]}px ${n[1] - 120}px"},{opacity:1,scale:1,duration:.3,ease:"back.out(2)"},${f2(t0 + 0.4)});`; }).join('\n  ')}
  tl.to("#${p}-root2",{scale:1.12,transformOrigin:"960px 810px",duration:.6,yoyo:true,repeat:5,ease:"sine.inOut"},${f2(L[4].ls + 1)});
  `;
  return { bg: C.ver, world, js };
};
chapters.c7.cardBg = C.ver;

// =============== CH 8 — IL NOME ===============
chapters.c8 = (x) => {
  const { p, cue, lines } = x; const L = lines;
  const gear = Array.from({ length: 10 }, (_, i) => `<rect x="-14" y="-96" width="28" height="30" fill="${C.ink}" transform="rotate(${i * 36})"/>`).join('');
  const world = `${bg(p, C.mus)}
  <g id="${p}-s0">
    ${big(p + '-lu', 'LUGLIO', 960, 450, 420, C.ink, { plate: C.red, anchor: 'middle', pd: 10 })}
    ${big(p + '-an', '2022', 960, 860, 420, C.ink, { plate: C.red, anchor: 'middle', pd: 10 })}
    <g id="${p}-ri">${stamp(p, p + '-ris', 'LA RISPOSTA', 1540, 250, 120, C.red, -9)}</g>
  </g>
  <g id="${p}-s1">
    ${panel(p, p + '-pn', C.ink)}
    ${big(p + '-cw', 'CARL WEBB', 960, 500, 380, C.bone, { plate: C.red, anchor: 'middle', pd: 10 })}
    ${small(p + '-dc', 'DETTO CHARLES', 960, 590, 54, C.mus, { anchor: 'middle', ls: 16 })}
    <g id="${p}-ie">${big(p + '-iet', 'INGEGNERE ELETTRICO', 960, 740, 120, C.mus, { anchor: 'middle', plate: C.red, pd: 6 })}</g>
    <g id="${p}-ic">${place(300, 780, 1, `${circ(p, 0, 0, 100, C.bone, { dx: 8, dy: 8 })}<path d="M-70 40 A80 80 0 0 1 70 40" fill="none" stroke="${C.ink}" stroke-width="6"/><path id="${p}-nee" d="M0 40 L50 -40" stroke="${C.red}" stroke-width="8" stroke-linecap="round"/><circle cy="40" r="10" fill="${C.ink}"/>`)}
      ${place(1620, 780, 1, `<g id="${p}-gr">${circ(p, 0, 0, 82, C.mus, { dx: 8, dy: 8 })}${gear}<circle r="26" fill="${C.ink}"/></g>`)}</g>
    <g id="${p}-me">${small(p + '-met', 'MELBOURNE · 1905', 960, 830, 50, C.bone, { anchor: 'middle', ls: 14 })}</g>
  </g>
  <g id="${p}-s2">
    ${big(p + '-n43', '43', 130, 520, 460, C.ink, { plate: C.red, pd: 10 })}${big(p + '-an2', 'ANNI', 500, 520, 200, C.ink, { plate: C.red, pd: 8 })}
    <rect id="${p}-tlb" x="240" y="760" width="1440" height="18" fill="${C.ink}"/>
    ${[['1905', 240], ['1947', 1640], ['1948', 1676]].map(([y, xx], i) => `<g id="${p}-tk${i}"><rect x="${xx - 5}" y="730" width="10" height="80" fill="${i ? C.red : C.ink}"/>${small(p + '-ty' + i, y, xx, i === 2 ? 880 : 710, 44, i ? C.red : C.ink, { anchor: i === 2 ? 'start' : 'middle', ls: 4 })}</g>`).join('')}
    <g id="${p}-last">${small(p + '-lt', 'ULTIMA TRACCIA · APRILE 1947', 1640, 960, 40, C.red, { anchor: 'end', ls: 6 })}</g>
  </g>
  <g id="${p}-s3">${dawnBeach(p, C.mus)}
    <g id="${p}-sman">${place(960, 990, 0.9, manSeated(p, p + '-man'))}</g>
    <g id="${p}-nm">${place(960, 800, 1, `${sh(p, 'M-170 -48 H170 V48 H-170Z', C.bone, { sw: 5 })}<text x="0" y="22" text-anchor="middle" font-family="'League Gothic'" font-size="82" letter-spacing="4" fill="${C.ink}">CARL WEBB</text>`, -3)}</g>
    <g id="${p}-qm">${big(p + '-qmt', '?', 1480, 900, 700, C.red, { plate: C.ink, pd: 12, anchor: 'middle' })}</g>
  </g>`;
  const js = `
  ${['s1', 's2', 's3'].map((s) => `gsap.set("#${p}-${s}",{opacity:0});`).join('')}
  ${IN(`#${p}-lu`, L[0].ls, { s: 1.3, o: '50% 100%' })}
  ${IN(`#${p}-an`, L[0].ls + 0.5, { s: 1.3, o: '50% 100%' })}
  ${IN(`#${p}-ri`, cue(0, 'risposta'), { s: 2.2, d: 0.16 })}
  // l1 name
  tl.to("#${p}-s0",{opacity:0,duration:.2},${f2(L[1].ls - 0.1)});
  tl.set("#${p}-s1",{opacity:1},${f2(L[1].ls - 0.1)});
  ${IN(`#${p}-cw`, cue(1, 'Carl Webb'), { s: 1.5, d: 0.22 })}
  tl.fromTo("#${p}-dc",{opacity:0,y:20},{opacity:1,y:0,duration:.35,ease:"power3.out"},${f2(cue(1, 'detto'))});
  ${SL(`#${p}-ie`, cue(1, 'Ingegnere'), 0, 60, { d: 0.35 })}
  tl.fromTo("#${p}-nee",{rotation:-70,transformOrigin:"0% 100%"},{rotation:20,duration:1.2,ease:"elastic.out(1,.4)"},${f2(cue(1, 'costruttore'))});
  ${IN(`#${p}-ic`, cue(1, 'costruttore'), { s: 1.4 })}
  tl.fromTo("#${p}-gr",{rotation:0,transformOrigin:"50% 50%"},{rotation:200,duration:${f2(L[1].d)},ease:"none"},${f2(cue(1, 'costruttore'))});
  ${IN(`#${p}-me`, cue(1, 'Melbourne'), { s: 1.3 })}
  // l2 timeline
  tl.to("#${p}-s1",{opacity:0,duration:.2},${f2(L[2].ls - 0.1)});
  tl.set("#${p}-s2",{opacity:1},${f2(L[2].ls - 0.1)});
  tl.fromTo("#${p}-tlb",{scaleX:0,transformOrigin:"0% 50%"},{scaleX:1,duration:${f2(L[2].d * 0.55)},ease:"power1.inOut"},${f2(L[2].ls)});
  ${IN(`#${p}-n43`, L[2].ls, { s: 1.4, o: '0% 100%' })}
  ${IN(`#${p}-an2`, L[2].ls + 0.2, { s: 1.4, o: '0% 100%' })}
  gsap.set(["#${p}-tk0","#${p}-tk1","#${p}-tk2","#${p}-last"],{opacity:0});
  ${IN(`#${p}-tk0`, L[2].ls + 0.3, { s: 1.5 })}
  ${IN(`#${p}-tk1`, cue(2, 'aprile'), { s: 1.8 })}
  ${IN(`#${p}-last`, cue(2, 'aprile'), { s: 1.4, o: '100% 50%' })}
  ${IN(`#${p}-tk2`, cue(2, 'lasciò'), { s: 1.8 })}
  // l3 beach
  tl.to("#${p}-s2",{opacity:0,duration:.2},${f2(L[3].ls - 0.1)});
  tl.set("#${p}-s3",{opacity:1},${f2(L[3].ls - 0.1)});
  gsap.set("#${p}-nm",{opacity:0});
  gsap.set("#${p}-cam",{transformOrigin:"960px 700px"});
  tl.fromTo("#${p}-cam",{scale:1.35},{scale:1,duration:${f2(L[3].d + 0.8)},ease:"power1.inOut",immediateRender:false},${f2(L[3].ls)});
  tl.to("#${p}-sun",{y:-80,duration:${f2(L[3].d)},ease:"none"},${f2(L[3].ls)});
  ${SL(`#${p}-qm`, cue(3, 'punto interrogativo'), 0, -900, { d: 0.6, e: 'bounce.out' })}
  tl.to("#${p}-qm",{opacity:0,duration:.4},${f2(L[3].le - 1.3)});
  ${IN(`#${p}-nm`, L[3].le - 1.0, { s: 1.8, d: 0.2 })}
  `;
  return { bg: C.mus, world, js };
};
chapters.c8.cardBg = C.mus;

// =============== CH 9 — COSA RESTA ===============
chapters.c9 = (x) => {
  const { p, cue, lines } = x; const L = lines;
  const Q = [
    ['DI COSA', 'È MORTO?', C.red, 'v'], ['COSA DICONO', 'LE LETTERE?', C.mus, 'l'], ['PERCHÉ TAGLIARE', 'LE ETICHETTE?', C.ver, 's'], ['E CHE CI FACEVA', 'LÌ, QUELLA NOTTE?', C.cor, 'm'],
  ];
  const icon = (k) => ({
    v: `<path d="M-50 0 H50 V220 Q50 270 0 270 Q-50 270 -50 220Z" fill="${C.bone}" stroke="${C.ink}" stroke-width="6"/><rect x="-62" y="-20" width="124" height="30" rx="6" fill="${C.mus}" stroke="${C.ink}" stroke-width="5"/>`,
    l: ['W', 'R', 'G', 'O'].map((c, i) => `<g transform="translate(${(i % 2) * 120 - 60} ${Math.floor(i / 2) * 120})">${sh(p, 'M-48 -48 H48 V48 H-48Z', C.bone, { dx: 5, dy: 5 })}<text x="0" y="24" text-anchor="middle" font-family="Montserrat" font-weight="800" font-size="64" fill="${C.ink}">${c}</text></g>`).join(''),
    s: `<path d="M0 0 L140 -34 L144 -20 L12 14Z M0 0 L140 34 L144 20 L12 -14Z" fill="${C.bone}" stroke="${C.ink}" stroke-width="6" stroke-linejoin="round"/><circle cx="-30" cy="24" r="26" fill="none" stroke="${C.red}" stroke-width="12"/><circle cx="-30" cy="-24" r="26" fill="none" stroke="${C.red}" stroke-width="12"/>`,
    m: `<circle r="110" fill="${C.bone}" stroke="${C.ink}" stroke-width="6"/><circle cx="40" cy="-16" r="96" fill="${C.cor}"/>`,
  })[k];
  const world = `${bg(p, C.deep)}
  <g id="${p}-s0">
    ${place(960, 120, 1.0, `${sh(p, 'M-520 0 H-300 L-240 -50 H520 V640 H-520Z', C.mus)}${sh(p, 'M-540 40 H540 V680 H-540Z', '#F7C75C', { dx: 8, dy: 8 })}`, -2)}
    ${small(p + '-fl', 'SOMERTON · 1948', 960, 250, 58, C.ink, { anchor: 'middle', ls: 14 })}
    <g id="${p}-st1">${stamp(p, p + '-s1s', 'CHIUSO?', 960, 480, 220, C.red, -8)}</g>
    <g id="${p}-st2">${stamp(p, p + '-s2s', 'NON VERIFICATO', 960, 700, 150, C.red, 5)}</g>
  </g>
  <g id="${p}-s1">${Q.map(([a, b, col, ic], i) => `<g id="${p}-q${i}">${panel(p, p + '-qp' + i, col)}<rect width="1920" height="1080" fill="url(#${p}-dots)" opacity=".1"/>${big(p + '-qa' + i, a, 100, 440, 270, C.ink, { plate: C.bone, pd: 8 })}${big(p + '-qb' + i, b, 100, 720, 270, C.ink, { plate: C.bone, pd: 8 })}<g id="${p}-qi${i}">${place(1580, 430, 1.3, icon(ic))}</g></g>`).join('')}</g>
  <g id="${p}-s2">${dawnBeach(p, C.mus)}
    <g id="${p}-pa">${place(640, 1010, 0.86, man(p, p + '-mn'))}</g><g id="${p}-pb">${place(1280, 1010, 0.86, ines(p, p + '-in'))}</g>
    <g id="${p}-f1">${big(p + '-ft', 'È FINITO.', 960, 225, 165, C.ink, { plate: C.red, anchor: 'middle' })}<rect id="${p}-strk" x="680" y="148" width="560" height="14" fill="${C.red}"/></g>
    <g id="${p}-f2">${big(p + '-co', 'COMINCIA.', 960, 440, 230, C.bone, { plate: C.ink, anchor: 'middle', pd: 10 })}</g>
  </g>
  <g id="${p}-s3">${panel(p, p + '-lp', C.mus)}<rect width="1920" height="1080" fill="url(#${p}-dots)" opacity=".1"/>
    <g id="${p}-lock">${big(p + '-l1', 'CASO CHIUSO', 960, 560, 420, C.ink, { anchor: 'middle', plate: C.red, pd: 10 })}${small(p + '-l2', 'UN MISTERO VERO ALLA VOLTA', 960, 690, 60, C.ink, { anchor: 'middle', ls: 14 })}
    ${stamp(p, p + '-ls', 'CHIUSO', 1520, 850, 130, C.red, -8)}</g>
  </g>`;
  const js = `
  ${['s1', 's2', 's3'].map((s) => `gsap.set("#${p}-${s}",{opacity:0});`).join('')}
  ${Q.map((_, i) => `gsap.set("#${p}-q${i}",{opacity:0});`).join('')}
  tl.fromTo("#${p}-s0",{y:60,opacity:0},{y:0,opacity:1,duration:.5,ease:"power3.out"},${f2(L[0].ls - 0.1)});
  ${IN(`#${p}-st1`, L[0].ls + 0.2, { s: 2.4, d: 0.16 })}
  ${IN(`#${p}-st2`, cue(0, 'non ha ancora'), { s: 2.4, d: 0.16 })}
  ${PUSH(p, L[0].ls, L[0].d, 1.05, '960px 500px')}
  // l1 four questions
  tl.set("#${p}-s1",{opacity:1},${f2(L[1].ls - 0.3)});
  tl.to("#${p}-s0",{opacity:0,duration:.1},${f2(L[1].ls - 0.2)});
  ${Q.map(([, , , ], i) => { const ph = ['Di cosa', 'Cosa dicono', 'Perché tagliare', 'E cosa ci faceva'][i]; return `tl.set("#${p}-q${i}",{opacity:1},${f2(cue(1, ph) - 0.1)});tl.fromTo("#${p}-q${i}",{x:1920},{x:0,duration:.35,ease:"power3.out"},${f2(cue(1, ph) - 0.1)});tl.fromTo("#${p}-qi${i}",{scale:.2,rotation:-30,transformOrigin:"1580px 430px"},{scale:1,rotation:0,duration:.5,ease:"back.out(1.8)"},${f2(cue(1, ph) + 0.25)});`; }).join('\n  ')}
  // l2 dawn
  tl.set("#${p}-s2",{opacity:1},${f2(L[2].ls - 0.2)});
  tl.fromTo("#${p}-s2",{x:1920},{x:0,duration:.5,ease:"power3.out"},${f2(L[2].ls - 0.2)});
  gsap.set(["#${p}-f1","#${p}-f2"],{opacity:0});
  tl.fromTo("#${p}-sun",{y:140},{y:-120,duration:${f2(L[2].d + 3)},ease:"none",immediateRender:false},${f2(L[2].ls)});
  tl.fromTo("#${p}-pa",{y:60,opacity:0},{y:0,opacity:1,duration:.45,ease:"back.out(1.4)"},${f2(L[2].ls + 0.2)});
  tl.fromTo("#${p}-pb",{y:60,opacity:0},{y:0,opacity:1,duration:.45,ease:"back.out(1.4)"},${f2(L[2].ls + 0.5)});
  tl.to("#${p}-in-lens",{rotation:14,transformOrigin:"50% 50%",duration:1.2,ease:"sine.inOut",yoyo:true,repeat:6},${f2(L[2].ls + 1)});
  ${IN(`#${p}-f1`, cue(2, 'è finito'), { s: 1.4 })}
  tl.fromTo("#${p}-strk",{scaleX:0,transformOrigin:"0% 50%"},{scaleX:1,duration:.3,ease:"power3.out"},${f2(cue(2, 'Ma:'))});
  ${IN(`#${p}-f2`, cue(2, 'qualcosa può'), { s: 1.5, o: '50% 100%' })}
  // l3 lockup
  tl.set("#${p}-s3",{opacity:1},${f2(L[3].ls - 0.2)});
  tl.fromTo("#${p}-s3",{y:1080},{y:0,duration:.5,ease:"power3.out"},${f2(L[3].ls - 0.2)});
  ${IN(`#${p}-l1`, L[3].ls + 0.5, { s: 1.15, d: 0.22 })}
  tl.fromTo("#${p}-l2",{opacity:0,y:24},{opacity:1,y:0,duration:.4,ease:"power3.out"},${f2(L[3].ls + 1.1)});
  ${IN(`#${p}-ls`, L[3].ls + 1.8, { s: 2.4, d: 0.16 })}
  tl.fromTo("#${p}-lock",{scale:1,transformOrigin:"50% 50%"},{scale:1.05,duration:${f2(L[3].d + 2.5)},ease:"none"},${f2(L[3].ls + 2.0)});
  `;
  return { bg: C.deep, world, js };
};
chapters.c9.cardBg = C.deep;
