import { C, sh, circ, rect, big, small, place, stamp, ines, man, manSeated, walker, scrapPath } from './lib.mjs';
import { chapters, maskFace, codeCard, scrap, f2, IN, SL, OUT, FADE, PUSH, mapAus } from './chapters.mjs';

const bg = (p, fill) => `<rect width="1920" height="1080" fill="${fill}"/><rect width="1920" height="1080" fill="url(#${p}-dots)" opacity=".09"/>`;
const breathe = (id, t, d) => `tl.to("#${id}",{y:-6,duration:1.6,ease:"sine.inOut",yoyo:true,repeat:${Math.max(1, Math.floor(d / 1.6))}},${f2(t)});`;

// =============== CH 2 — NESSUNO LO CONOSCE ===============
chapters.c2 = (x) => {
  const { p, cue, lines, off } = x; const L = lines;
  const teeth = Array.from({ length: 12 }, (_, i) => { const a = (-75 + i * 13.6) * Math.PI / 180; return `<rect x="${(300 * Math.sin(a) - 21).toFixed(1)}" y="${(150 * (1 - Math.cos(a)) - 31).toFixed(1)}" width="42" height="62" rx="16" fill="${C.bone}" stroke="${C.ink}" stroke-width="4" transform="rotate(${(a * 180 / Math.PI * 0.9).toFixed(1)} ${(300 * Math.sin(a)).toFixed(1)} ${(150 * (1 - Math.cos(a))).toFixed(1)})"/>`; }).join('');
  const prints = Array.from({ length: 9 }, (_, i) => `<ellipse cx="0" cy="0" rx="${(i + 1) * 17}" ry="${(i + 1) * 19}" fill="none" stroke="${C.ink}" stroke-width="7" stroke-dasharray="${i % 2 ? '130 20' : '210 26'}" transform="rotate(${i * 23})"/>`).join('');
  const calfL = 'M-40 -540 Q-118 -420 -76 -300 Q-56 -200 -48 -110 L-6 -110 Q-2 -220 8 -310 Q34 -420 -2 -540Z';
  const world = `${bg(p, C.ver)}
  <g id="${p}-s0">
    <g id="${p}-fp">${place(470, 540, 1, circ(p, 0, 0, 200, C.bone) + prints + `<rect id="${p}-scan" x="-190" y="-4" width="380" height="9" fill="${C.red}"/>`)}</g>
    <g id="${p}-ph">${place(1260, 300, 1, `${sh(p, 'M0 0 H300 V380 H0Z', C.bone)}<rect x="22" y="22" width="256" height="336" fill="${C.mus}"/>${circ(p, 150, 150, 62, C.bone, { dx: 0, dy: 0, sw: 4 })}<path d="M40 358 Q50 250 150 240 Q250 250 260 358Z" fill="${C.brick}" stroke="${C.ink}" stroke-width="4"/>`, 6)}</g>
    <g id="${p}-dn">${place(1130, 760, 1, teeth + `<path d="M-330 -10 Q0 -50 330 -10" fill="none" stroke="${C.ink}" stroke-width="0"/>`, -3)}</g>
    <g id="${p}-big">${stamp(p, p + '-bst', 'NESSUN RISCONTRO', 960, 560, 150, C.red, -8)}</g>
  </g>
  <g id="${p}-s1">
    ${place(990, 190, 1.5, mapAus(p, p + '-map'))}
    <g id="${p}-pins">${[[300, 250], [450, 160], [220, 140], [180, 300], [520, 270]].map(([a, b], i) => `<text x="${990 + a * 1.5}" y="${190 + b * 1.5}" font-family="'League Gothic'" font-size="90" fill="${C.ink}" opacity=".55" text-anchor="middle">?</text>`).join('')}</g>
    <g id="${p}-ad">${circ(p, 990 + 384 * 1.5, 190 + 375 * 1.5, 18, C.red, { dx: 0, dy: 0 })}<circle id="${p}-ring" cx="${990 + 384 * 1.5}" cy="${190 + 375 * 1.5}" r="40" fill="none" stroke="${C.red}" stroke-width="8"/></g>
    ${big(p + '-n1', 'NESSUNO', 90, 480, 330, C.ink, { plate: C.mus })}
    ${big(p + '-n2', 'LO CERCA', 90, 760, 330, C.ink, { plate: C.mus })}
  </g>
  <g id="${p}-s2">
    ${place(470, 1020, 1.0, ines(p, p + '-in'))}
    ${big(p + '-vv', 'VELENO?', 820, 300, 260, C.ink, { plate: C.mus })}
    <g id="${p}-vial">${place(1450, 420, 1.0, `${sh(p, 'M-62 0 H62 V380 Q62 440 0 440 Q-62 440 -62 380Z', C.bone)}<rect id="${p}-liq" x="-52" y="150" width="104" height="270" rx="30" fill="${C.red}" stroke="${C.ink}" stroke-width="3"/><rect x="-80" y="-16" width="160" height="34" rx="8" fill="${C.mus}" stroke="${C.ink}" stroke-width="5"/>`, 8)}</g>
    <g id="${p}-nt">${stamp(p, p + '-nts', 'NESSUNA TRACCIA', 1240, 800, 100, C.red, -6)}</g>
  </g>
  <g id="${p}-s3">
    ${place(1380, 1010, 0.95, `<path d="${calfL}" fill="${C.rose}" stroke="${C.ink}" stroke-width="5" stroke-linejoin="round"/><path transform="translate(190 0) scale(-1 1)" d="${calfL}" fill="${C.rose}" stroke="${C.ink}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M-76 -300 Q-100 -380 -70 -440" fill="none" stroke="${C.ink}" stroke-width="5" opacity=".5"/>
      <path d="M-52 -110 Q-64 -60 -76 -30 L-6 -30 L-6 -110Z" fill="${C.bone}" stroke="${C.ink}" stroke-width="5"/>
      <path d="M144 -110 L238 -110 L252 -40 L134 -40Z" fill="${C.red}" stroke="${C.ink}" stroke-width="5"/><rect x="134" y="-44" width="120" height="22" fill="${C.mus}" stroke="${C.ink}" stroke-width="4"/>`)}
    ${big(p + '-b1', 'UN BALLERINO', 90, 400, 230, C.ink, { plate: C.mus })}
    ${big(p + '-b2', 'O UN CORRIDORE', 90, 640, 230, C.ink, { plate: C.mus })}
  </g>
  <g id="${p}-s4">${big(p + '-q', '?', 1230, 1010, 1100, C.red, { plate: C.ink, pd: 16, anchor: 'middle' })}${place(560, 920, 0.82, man(p, p + '-m'))}</g>`;
  const js = `
  ${['s0', 's1', 's2', 's3', 's4'].map((s) => `gsap.set("#${p}-${s}",{opacity:0});`).join('')}
  tl.set("#${p}-s0",{opacity:1},${f2(L[0].ls)});
  ${IN(`#${p}-fp`, L[0].ls + 0.2, { s: 1.3 })}
  tl.fromTo("#${p}-scan",{y:-180},{y:180,duration:${f2(L[0].d * 0.4)},ease:"sine.inOut",yoyo:true,repeat:1},${f2(L[0].ls + 0.2)});
  ${IN(`#${p}-ph`, cue(0, 'fotografie'), { s: 1.3 })}
  ${IN(`#${p}-dn`, cue(0, 'registri'), { s: 1.3 })}
  ${IN(`#${p}-big`, cue(0, 'Niente'), { s: 2.2, d: 0.16 })}
  tl.to("#${p}-big",{x:6,duration:.05,yoyo:true,repeat:3},${f2(cue(0, 'Niente') + 0.16)});
  // l1 map
  tl.to("#${p}-s0",{x:-2400,duration:.45,ease:"power3.in"},${f2(L[1].ls - 0.2)});
  tl.set("#${p}-s0",{opacity:0},${f2(L[1].ls + 0.3)});
  tl.set("#${p}-s1",{opacity:1},${f2(L[1].ls - 0.2)});
  ${SL(`#${p}-s1`, L[1].ls - 0.2, 2000, 0, { d: 0.5 })}
  tl.fromTo("#${p}-ring",{scale:.4,transformOrigin:"50% 50%",opacity:1},{scale:2.4,opacity:0,duration:1.1,ease:"power1.out",repeat:4},${f2(L[1].ls + 0.5)});
  ${PUSH(p, L[1].ls, L[1].d, 1.05, '1500px 560px')}
  // l2 Ines + vial
  tl.to("#${p}-s1",{opacity:0,duration:.2},${f2(L[2].ls - 0.1)});
  tl.set("#${p}-s2",{opacity:1},${f2(L[2].ls - 0.1)});
  ${SL(`#${p}-in`, L[2].ls, -700, 0, { d: 0.5 })}
  ${breathe(p + '-in-torso', L[2].ls + 0.5, L[2].d)}
  tl.fromTo("#${p}-in-lens",{rotation:-10,transformOrigin:"50% 50%"},{rotation:14,duration:1.2,ease:"sine.inOut",yoyo:true,repeat:5},${f2(L[2].ls + 0.5)});
  ${IN(`#${p}-vv`, cue(2, 'veleno'), { o: '0% 100%' })}
  ${SL(`#${p}-vial`, L[2].ls + 0.8, 600, 0, { d: 0.5 })}
  tl.to("#${p}-liq",{scaleY:0,transformOrigin:"50% 100%",duration:1.1,ease:"power2.inOut"},${f2(cue(2, 'non ne trova'))});
  ${IN(`#${p}-nt`, cue(2, 'traccia') + 0.1, { s: 2.2, d: 0.16 })}
  // l3 calves
  tl.to("#${p}-s2",{x:-2400,duration:.45,ease:"power3.in"},${f2(L[3].ls - 0.2)});
  tl.set("#${p}-s2",{opacity:0},${f2(L[3].ls + 0.3)});
  tl.set("#${p}-s3",{opacity:1},${f2(L[3].ls - 0.2)});
  ${SL(`#${p}-s3`, L[3].ls - 0.2, 0, 900, { d: 0.5, e: 'back.out(1.3)' })}
  tl.fromTo("#${p}-b1",{opacity:0,x:-80},{opacity:1,x:0,duration:.3,ease:"power3.out"},${f2(cue(3, 'ballerino'))});
  tl.fromTo("#${p}-b2",{opacity:0,x:-80},{opacity:1,x:0,duration:.3,ease:"power3.out"},${f2(cue(3, 'corridore'))});
  // l4 question
  tl.to("#${p}-s3",{opacity:0,duration:.15},${f2(L[4].ls - 0.1)});
  tl.set("#${p}-s4",{opacity:1},${f2(L[4].ls - 0.1)});
  ${IN(`#${p}-q`, L[4].ls, { s: 1.5, o: '50% 80%', d: 0.25 })}
  ${SL(`#${p}-m`, L[4].ls + 0.1, -500, 0, { d: 0.5 })}
  `;
  return { bg: C.ver, world, js };
};
chapters.c2.cardBg = C.ver;

// =============== CH 3 — LA VALIGIA ===============
chapters.c3 = (x) => {
  const { p, cue, lines } = x; const L = lines;
  const hands = (a, b) => `<g id="${p}-hh"><path d="M0 0 L0 -50" stroke="${C.ink}" stroke-width="9" stroke-linecap="round" transform="rotate(${a})"/></g><g id="${p}-mh"><path d="M0 0 L0 -74" stroke="${C.ink}" stroke-width="6" stroke-linecap="round" transform="rotate(${b})"/></g>`;
  const world = `${bg(p, C.mus)}
  <path d="M120 700 V300 Q120 160 250 160 Q380 160 380 300 V700Z" fill="${C.deep}" stroke="${C.ink}" stroke-width="5"/>
  <path d="M1540 700 V300 Q1540 160 1670 160 Q1800 160 1800 300 V700Z" fill="${C.deep}" stroke="${C.ink}" stroke-width="5"/>
  <path d="M250 160 V700 M120 400 H380 M1670 160 V700 M1540 400 H1800" stroke="${C.mus}" stroke-width="8" opacity=".8"/>
  <g id="${p}-clock">${circ(p, 960, 230, 110, C.bone, { sw: 6 })}${place(960, 230, 1, `<g id="${p}-hh"><path d="M0 0 L0 -56" stroke="${C.ink}" stroke-width="10" stroke-linecap="round"/></g><g id="${p}-mh"><path d="M0 0 L0 -84" stroke="${C.ink}" stroke-width="6" stroke-linecap="round"/></g><circle r="8" fill="${C.red}"/>`)}
    ${Array.from({ length: 12 }, (_, i) => `<path d="M960 ${230 - 102} v14" stroke="${C.ink}" stroke-width="5" transform="rotate(${i * 30} 960 230)"/>`).join('')}</g>
  ${sh(p, 'M-100 790 H2020 V1180 H-100Z', C.brick, { dy: -8 })}
  <rect x="-100" y="790" width="2120" height="34" fill="${C.ink}"/>
  <g id="${p}-case">${place(960, 800, 1.25, `
     <g id="${p}-cbody">${sh(p, 'M-260 -310 H260 V0 H-260Z', '#B65A34')}<rect x="-260" y="-190" width="520" height="14" fill="${C.ink}" opacity=".7"/><rect x="-170" y="-310" width="26" height="310" fill="${C.ink}" opacity=".85"/><rect x="144" y="-310" width="26" height="310" fill="${C.ink}" opacity=".85"/>
       <rect x="-30" y="-230" width="60" height="44" rx="6" fill="${C.mus}" stroke="${C.ink}" stroke-width="5"/><path d="M-70 -310 Q-70 -370 0 -370 Q70 -370 70 -310" fill="none" stroke="${C.ink}" stroke-width="12"/></g>
     <ellipse id="${p}-inside" cx="0" cy="-306" rx="236" ry="26" fill="${C.ink}" opacity="0"/>
     <g id="${p}-tag">${place(-300, -270, 1, `<path d="M0 0 L60 -26" stroke="${C.ink}" stroke-width="4"/><g id="${p}-tagg">${sh(p, 'M40 -50 H150 V10 H40Z', C.bone, { dx: 5, dy: 5, sw: 3 })}<text x="95" y="-12" text-anchor="middle" font-family="Montserrat" font-weight="800" font-size="24" fill="${C.ink}">???</text></g>`)}</g>`)}</g>
  <g id="${p}-it1">${place(500, 470, 1.4, `<rect x="-14" y="-110" width="28" height="90" rx="10" fill="${C.brick}" stroke="${C.ink}" stroke-width="5"/><path d="M-40 -20 H40 L30 40 H-30Z" fill="${C.ink}"/><path d="M-30 40 H30 L22 66 H-22Z" fill="${C.mus}" stroke="${C.ink}" stroke-width="4"/>`, -25)}</g>
  <g id="${p}-it2">${place(1400, 450, 1.7, `<path d="M0 0 L120 -30 L124 -18 L10 12Z" fill="${C.bone}" stroke="${C.ink}" stroke-width="5" stroke-linejoin="round"/><path d="M0 0 L120 30 L124 18 L10 -12Z" fill="${C.bone}" stroke="${C.ink}" stroke-width="5" stroke-linejoin="round"/><circle cx="-26" cy="20" r="22" fill="none" stroke="${C.red}" stroke-width="10"/><circle cx="-26" cy="-20" r="22" fill="none" stroke="${C.red}" stroke-width="10"/>`, 20)}</g>
  <g id="${p}-it3">${place(700, 280, 1.5, `<ellipse cx="0" cy="0" rx="62" ry="16" fill="${C.cor}" stroke="${C.ink}" stroke-width="5"/><rect x="-62" y="0" width="124" height="82" fill="${C.cor}" stroke="${C.ink}" stroke-width="5"/><ellipse cx="0" cy="82" rx="62" ry="16" fill="${C.cor}" stroke="${C.ink}" stroke-width="5"/><path d="M-50 20 Q0 40 50 20 M-52 44 Q0 64 52 44" fill="none" stroke="${C.red}" stroke-width="7"/><path d="M62 40 Q130 20 160 80" fill="none" stroke="${C.cor}" stroke-width="6"/>`, 8)}</g>
  <g id="${p}-big">${place(960, 520, 2.4, `<g id="${p}-bigtag">${sh(p, 'M-110 -60 H110 V60 H-110Z', C.bone, { sw: 3 })}<text x="0" y="22" text-anchor="middle" font-family="'League Gothic'" font-size="92" letter-spacing="4" fill="${C.ink}">KEANE</text><circle cx="-90" cy="-40" r="9" fill="${C.ink}"/></g>`)}
    ${Array.from({ length: 7 }, (_, i) => `<path id="${p}-sl${i}" d="M${-250 + i * 80} 100 l24 -12 l8 22 l-26 10Z" fill="${C.bone}" stroke="${C.ink}" stroke-width="3" transform="translate(960 520)"/>`).join('')}</g>
  <g id="${p}-coin">${place(1350, 540, 1, `<g id="${p}-coinb">${circ(p, 0, 0, 170, C.bone, { dx: 10, dy: 10 })}<circle r="140" fill="none" stroke="${C.ink}" stroke-width="5" stroke-dasharray="10 12"/><text id="${p}-cv" x="0" y="26" text-anchor="middle" font-family="'League Gothic'" font-size="110" letter-spacing="3" fill="${C.ink}">VERO</text><text id="${p}-cf" x="0" y="26" text-anchor="middle" font-family="'League Gothic'" font-size="110" letter-spacing="3" fill="${C.red}" opacity="0">FALSO</text></g>`)}</g>
  <g id="${p}-in">${place(430, 1030, 0.98, ines(p, p + '-ine'))}</g>
  ${big(p + '-ques', '?', 1000, 640, 520, C.red, { plate: C.ink, pd: 10 })}`;
  const flips = Array.from({ length: 6 }, (_, i) => i);
  const js = `
  gsap.set(["#${p}-it1","#${p}-it2","#${p}-it3","#${p}-big","#${p}-coin","#${p}-in","#${p}-ques"],{opacity:0});
  gsap.set("#${p}-hh",{rotation:-45,svgOrigin:"960 230"});gsap.set("#${p}-mh",{rotation:150,svgOrigin:"960 230"});
  ${SL(`#${p}-case`, L[0].ls - 0.1, -1500, 0, { d: 0.8, e: 'power3.out' })}
  tl.to("#${p}-hh",{rotation:0,svgOrigin:"960 230",duration:3,ease:"none"},${f2(cue(0, 'poco prima') - 1)});
  tl.to("#${p}-mh",{rotation:360,svgOrigin:"960 230",duration:3,ease:"none"},${f2(cue(0, 'poco prima') - 1)});
  tl.fromTo("#${p}-tagg",{rotation:-12,transformOrigin:"0% 0%"},{rotation:10,duration:.9,ease:"sine.inOut",yoyo:true,repeat:6},${f2(L[0].ls + 0.9)});
  ${PUSH(p, L[0].ls, L[0].d, 1.08, '960px 700px')}
  // l1 case opens, items fly out
  tl.fromTo("#${p}-inside",{opacity:0},{opacity:1,duration:.2},${f2(L[1].ls)});
  tl.to("#${p}-cbody",{y:-14,duration:.2,yoyo:true,repeat:1},${f2(L[1].ls)});
  ${[['it1', 'pennello'], ['it2', 'forbici'], ['it3', 'filo arancione']].map(([id, ph]) => `tl.fromTo("#${p}-${id}",{opacity:0,x:${id === 'it1' ? 460 : id === 'it2' ? -440 : 260},y:${id === 'it3' ? 560 : 420},scale:.3,transformOrigin:"50% 50%"},{opacity:1,x:0,y:0,scale:1,duration:.55,ease:"back.out(1.5)"},${f2(cue(1, ph))});`).join('\n  ')}
  // l2 labels torn
  tl.to(["#${p}-it1","#${p}-it2","#${p}-it3"],{opacity:0,duration:.25},${f2(L[2].ls - 0.1)});
  tl.to("#${p}-case",{x:-520,scale:.8,duration:.5,ease:"power3.inOut",transformOrigin:"960px 800px"},${f2(L[2].ls - 0.1)});
  tl.set("#${p}-big",{opacity:1},${f2(L[2].ls + 0.5)});
  tl.fromTo("#${p}-bigtag",{scale:1.4,opacity:0,transformOrigin:"50% 0%"},{scale:1,opacity:1,duration:.22,ease:"power4.out"},${f2(cue(2, 'Keane'))});
  tl.fromTo("#${p}-bigtag",{rotation:-8},{rotation:8,duration:1,ease:"sine.inOut",yoyo:true,repeat:5},${f2(cue(2, 'Keane') + 0.25)});
  ${Array.from({ length: 7 }, (_, i) => `tl.fromTo("#${p}-sl${i}",{opacity:1,y:0,rotation:0},{opacity:0,y:420,rotation:${i % 2 ? 90 : -120},duration:1,ease:"power2.in"},${f2(L[2].ls + 0.6 + i * 0.13)});`).join('\n  ')}
  // l3 true or false
  tl.to("#${p}-big",{opacity:0,duration:.2},${f2(L[3].ls - 0.1)});
  tl.set(["#${p}-coin","#${p}-in","#${p}-ques"],{opacity:1},${f2(L[3].ls)});
  ${SL(`#${p}-in`, L[3].ls, -600, 0, { d: 0.5 })}
  ${IN(`#${p}-ques`, cue(3, 'depistaggio', 0.5), { s: 1.6, d: 0.25 })}
  ${IN(`#${p}-coin`, L[3].ls + 0.2, { s: 1.3 })}
  ${flips.map((i) => `tl.to("#${p}-coinb",{scaleX:0,transformOrigin:"50% 50%",duration:.22,ease:"sine.in"},${f2(L[3].ls + 0.8 + i * 0.9)});tl.set("#${p}-cv",{opacity:${i % 2 ? 1 : 0}},${f2(L[3].ls + 1.02 + i * 0.9)});tl.set("#${p}-cf",{opacity:${i % 2 ? 0 : 1}},${f2(L[3].ls + 1.02 + i * 0.9)});tl.to("#${p}-coinb",{scaleX:1,duration:.22,ease:"sine.out"},${f2(L[3].ls + 1.02 + i * 0.9)});`).join('\n  ')}
  tl.fromTo("#${p}-ine-lens",{rotation:-10,transformOrigin:"50% 50%"},{rotation:14,duration:1.2,ease:"sine.inOut",yoyo:true,repeat:4},${f2(L[3].ls + 0.5)});
  `;
  return { bg: C.mus, world, js };
};
chapters.c3.cardBg = C.mus;

// =============== CH 4 — TAMAM SHUD ===============
chapters.c4 = (x) => {
  const { p, cue, lines } = x; const L = lines;
  const pageR = 'M0 -260 H300 V120 L240 150 L270 200 L210 230 L240 260 H0Z';
  const piece = 'M300 120 L240 150 L270 200 L210 230 L240 260 H300Z';
  const bars = (x0, x1, n, y0) => Array.from({ length: n }, (_, i) => `<rect x="${x0}" y="${y0 + i * 36}" width="${x1 - x0 - (i % 3) * 26}" height="9" rx="4" fill="${C.ink}" opacity=".6"/>`).join('');
  const world = `${bg(p, C.deep)}
  <g id="${p}-s0">
    ${place(430, 1030, 1.0, ines(p, p + '-in'))}
    <g id="${p}-jk">${place(1330, 140, 1.7, `${sh(p, 'M-100 0 L-180 60 L-200 360 L-120 360 L-110 140 L110 140 L120 360 L200 360 L180 60 L100 0 L40 40 L0 20 L-40 40Z', C.brick)}<path d="M-100 140 H100 V420 H-100Z" fill="${C.brick}" stroke="${C.ink}" stroke-width="4"/><path d="M-40 40 L0 190 L40 40" fill="${C.bone}" stroke="${C.ink}" stroke-width="4"/><path d="M-84 220 H-30" stroke="${C.ink}" stroke-width="7" stroke-linecap="round"/>`)}</g>
    <g id="${p}-roll">${place(1260, 500, 1.7, `<rect x="-36" y="-16" width="72" height="32" rx="16" fill="${C.bone}" stroke="${C.ink}" stroke-width="4"/><path d="M-20 -6 Q0 6 20 -6" fill="none" stroke="${C.ink}" stroke-width="3"/>`)}</g>
    <g id="${p}-mag"><circle cx="0" cy="0" r="120" fill="${C.bone}" fill-opacity=".25" stroke="${C.ink}" stroke-width="12"/><path d="M84 84 L170 170" stroke="${C.ink}" stroke-width="20" stroke-linecap="round"/></g>
  </g>
  <g id="${p}-s1">
    ${place(470, 200, 5.1, `<g id="${p}-sc">${sh(p, scrapPath, C.bone, { dx: 3, dy: 3 })}<text x="98" y="62" text-anchor="middle" font-family="'League Gothic'" font-size="54" letter-spacing="2" fill="${C.ink}">TAMÁM</text><text x="98" y="118" text-anchor="middle" font-family="'League Gothic'" font-size="54" letter-spacing="2" fill="${C.ink}">SHUD</text></g>`, -3)}
    <g id="${p}-fin">${big(p + '-fint', 'È FINITO', 960, 1010, 210, C.mus, { anchor: 'middle', plate: C.ink })}</g>
  </g>
  <g id="${p}-s2">
    ${big(p + '-bk', 'RUBAIYAT', 960, 150, 150, C.bone, { anchor: 'middle', plate: C.red })}
    <g id="${p}-book">${place(960, 520, 1.3, `${sh(p, 'M-322 -286 H322 V286 H-322Z', C.red, { dx: 12, dy: 12 })}<rect x="-306" y="-270" width="612" height="540" fill="none" stroke="${C.mus}" stroke-width="5"/>
       ${sh(p, 'M-300 -260 H0 V260 H-300Z', C.bone, { dx: 0, dy: 0, sw: 3 })}${sh(p, pageR, C.bone, { dx: 0, dy: 0, sw: 3 })}
       ${bars(-264, -36, 12, -214)}${bars(36, 264, 7, -214)}<rect x="-2" y="-260" width="4" height="520" fill="${C.ink}"/>
       <path d="M300 120 L240 150 L270 200 L210 230 L240 260" fill="none" stroke="${C.ink}" stroke-width="4" stroke-dasharray="7 7"/>`)}</g>
  </g>
  <g id="${p}-s3">
    ${place(960, 700, 1.8, `<rect x="-420" y="40" width="840" height="14" fill="${C.ink}"/>
      ${sh(p, 'M-300 0 L-280 -60 Q-240 -110 -150 -118 L-40 -170 Q60 -190 150 -150 L240 -120 Q300 -100 310 -40 L312 0Z', C.cor)}
      <path d="M-120 -112 L-150 -30 H-20 L-20 -150Z" fill="${C.mus}" stroke="${C.ink}" stroke-width="4"/><path d="M0 -150 L0 -30 H150 L130 -125Z" fill="${C.mus}" stroke="${C.ink}" stroke-width="4"/>
      <path d="M-300 0 H312" stroke="${C.ink}" stroke-width="4"/>${circ(p, -190, 14, 52, C.ink, { dx: 5, dy: 5 })}${circ(p, 190, 14, 52, C.ink, { dx: 5, dy: 5 })}<circle cx="-190" cy="14" r="20" fill="${C.bone}"/><circle cx="190" cy="14" r="20" fill="${C.bone}"/>
      <path d="M-34 -118 L-28 -30 H56 L46 -118Z" fill="${C.brick}" opacity=".0"/>`)}
    <g id="${p}-flybook">${place(0, 0, 1.6, `<rect x="-60" y="-80" width="120" height="160" rx="6" fill="${C.red}" stroke="${C.ink}" stroke-width="5"/><rect x="-46" y="-66" width="92" height="132" fill="none" stroke="${C.mus}" stroke-width="3"/>`)}</g>
  </g>
  <g id="${p}-s4">
    ${place(760, 520, 1.7, `${sh(p, pageR, C.bone, { dx: 0, dy: 0, sw: 3 })}${bars(36, 264, 7, -214)}<rect x="-6" y="-260" width="6" height="520" fill="${C.ink}" opacity=".5"/>`)}
    <g id="${p}-pc">${place(760, 520, 1.7, `<g id="${p}-pcg">${sh(p, piece, C.bone, { dx: 0, dy: 0, sw: 3 })}<text x="262" y="196" text-anchor="middle" font-family="'League Gothic'" font-size="34" fill="${C.ink}" transform="rotate(-18 262 196)">SHUD</text></g>`)}</g>
    <g id="${p}-cm">${stamp(p, p + '-cms', 'COMBACIA', 1480, 520, 140, C.mus, -9)}</g>
  </g>`;
  const js = `
  ${['s1', 's2', 's3', 's4'].map((s) => `gsap.set("#${p}-${s}",{opacity:0});`).join('')}
  gsap.set(["#${p}-roll","#${p}-mag"],{opacity:0});
  ${SL(`#${p}-in`, L[0].ls - 0.1, -700, 0, { d: 0.5 })}
  ${SL(`#${p}-jk`, L[0].ls - 0.1, 1200, 0, { d: 0.5 })}
  tl.fromTo("#${p}-mag",{opacity:0,x:700,y:420},{opacity:1,x:1240,y:560,duration:2.5,ease:"power2.inOut"},${f2(cue(0, 'guarda meglio'))});
  tl.fromTo("#${p}-roll",{opacity:0,y:60,scale:.6,transformOrigin:"50% 50%"},{opacity:1,y:0,scale:1,duration:.5,ease:"back.out(2)"},${f2(cue(0, 'trova'))});
  tl.fromTo("#${p}-roll",{rotation:0},{rotation:360,duration:2.8,ease:"none"},${f2(cue(0, 'trova') + 0.5)});
  tl.to("#${p}-mag",{opacity:0,duration:.3},${f2(cue(0, 'trova'))});
  tl.to("#${p}-in-lens",{rotation:16,transformOrigin:"50% 50%",duration:1.2,ease:"sine.inOut",yoyo:true,repeat:5},${f2(L[0].ls)});
  // l1 scrap
  tl.to("#${p}-s0",{y:-1200,duration:.45,ease:"power3.in"},${f2(L[1].ls - 0.3)});
  tl.set("#${p}-s1",{opacity:1},${f2(L[1].ls - 0.1)});
  ${IN(`#${p}-sc`, L[1].ls, { s: 0.6, d: 0.45, o: '50% 50%' })}
  ${IN(`#${p}-fin`, cue(1, 'Significano'), { s: 1.6, d: 0.2 })}
  // l2 the book
  tl.to("#${p}-s1",{opacity:0,duration:.2},${f2(L[2].ls - 0.1)});
  tl.set("#${p}-s2",{opacity:1},${f2(L[2].ls - 0.1)});
  ${IN(`#${p}-bk`, L[2].ls, { s: 1.4 })}
  tl.fromTo("#${p}-book",{scaleX:0.05,transformOrigin:"50% 50%"},{scaleX:1,duration:.6,ease:"power3.out"},${f2(L[2].ls + 0.3)});
  // l3 the car
  tl.to("#${p}-s2",{opacity:0,duration:.2},${f2(L[3].ls - 0.1)});
  tl.set("#${p}-s3",{opacity:1},${f2(L[3].ls - 0.1)});
  ${SL('#' + p + '-s3', L[3].ls - 0.1, 1920, 0, { d: 0.6 })}
  tl.fromTo("#${p}-flybook",{x:-200,y:140,rotation:-60,opacity:1},{x:900,y:420,rotation:200,duration:1.4,ease:"power1.out"},${f2(cue(3, 'sedile posteriore') - 0.6)});
  tl.to("#${p}-flybook",{opacity:0,duration:.15},${f2(cue(3, 'sedile posteriore') + 0.85)});
  // l4 the piece fits
  tl.to("#${p}-s3",{opacity:0,duration:.2},${f2(L[4].ls - 0.1)});
  tl.set("#${p}-s4",{opacity:1},${f2(L[4].ls - 0.1)});
  tl.fromTo("#${p}-pc",{x:-1000,y:-200,rotation:-40,opacity:1},{x:0,y:0,rotation:0,duration:.9,ease:"power3.inOut"},${f2(cue(4, 'Il pezzetto'))});
  tl.fromTo("#${p}-pc",{scale:1.08,transformOrigin:"760px 520px"},{scale:1,duration:.12},${f2(cue(4, 'Il pezzetto') + 0.9)});
  ${IN(`#${p}-cm`, cue(4, 'perfettamente'), { s: 2.2, d: 0.16 })}
  `;
  return { bg: C.deep, world, js };
};
chapters.c4.cardBg = C.deep;

// =============== CH 5 — IL CODICE ===============
chapters.c5 = (x) => {
  const { p, cue, lines } = x; const L = lines;
  const code = ['WRGOABABD', 'MLIAOI', 'WTBIMPANETP', 'MLIABOAIAQC', 'ITTMTSAMSTGAB'];
  const holes = Array.from({ length: 10 }, (_, i) => { const a = (30 + i * 30) * Math.PI / 180; return `<circle cx="${(110 * Math.cos(a)).toFixed(1)}" cy="${(110 * Math.sin(a)).toFixed(1)}" r="23" fill="${C.cor}" stroke="${C.ink}" stroke-width="4"/>`; }).join('');
  const tiles = Array.from({ length: 26 }, (_, i) => { const r1 = (i * 137) % 97 / 97, r2 = (i * 59) % 89 / 89; return `<g id="${p}-tl${i}">${place(300 + r1 * 1400, 120 + r2 * 640, 1, `${sh(p, 'M-40 -40 H40 V40 H-40Z', C.bone, { dx: 6, dy: 6, sw: 4 })}<text x="0" y="22" text-anchor="middle" font-family="Montserrat" font-weight="800" font-size="60" fill="${C.ink}">${'ABCDEFGHILMNOPQRSTUVWXYZ'[i % 24]}</text>`, (r1 * 60 - 30) | 0)}</g>`; }).join('');
  const world = `${bg(p, C.cor)}
  <g id="${p}-s0">
    <g id="${p}-sheet">${place(700, 540, 1, `${sh(p, 'M-330 -400 H330 V400 H-330Z', C.bone, { dx: 14, dy: 14 })}${code.map((t, i) => `<text id="${p}-ln${i}" x="-290" y="${-250 + i * 128}" font-family="Montserrat" font-weight="800" font-size="62" letter-spacing="8" fill="${C.ink}">${t}</text>`).join('')}<rect id="${p}-strike" x="-300" y="${-250 + 128 - 22}" width="420" height="12" fill="${C.red}"/>`, -3)}</g>
    <g id="${p}-qq">${big(p + '-q1', '5', 1380, 560, 760, C.ink, { plate: C.mus, anchor: 'middle' })}${big(p + '-q2', 'RIGHE', 1380, 760, 200, C.ink, { plate: C.mus, anchor: 'middle' })}</g>
  </g>
  <g id="${p}-s1">
    <g id="${p}-dial">${place(560, 520, 1.5, `${circ(p, 0, 0, 170, C.ink, { dx: 8, dy: 8 })}<circle r="64" fill="${C.bone}" stroke="${C.ink}" stroke-width="4"/>${holes}<path d="M-190 -20 Q-200 -110 -150 -150" fill="none" stroke="${C.mus}" stroke-width="10" stroke-linecap="round"/><path d="M190 -20 Q200 -110 150 -150" fill="none" stroke="${C.mus}" stroke-width="10" stroke-linecap="round"/>`)}</g>
    <path id="${p}-wire" d="M760 540 Q1000 380 1280 640" fill="none" stroke="${C.ink}" stroke-width="9" stroke-dasharray="22 20"/>
    <g id="${p}-house">${place(1500, 760, 1.5, `${sh(p, 'M-120 0 V-170 H120 V0Z', C.bone)}${sh(p, 'M-150 -170 L0 -290 L150 -170Z', C.red)}<rect x="-30" y="-110" width="60" height="110" fill="${C.deep}" stroke="${C.ink}" stroke-width="4"/><rect x="62" y="-130" width="40" height="40" fill="${C.mus}" stroke="${C.ink}" stroke-width="4"/><path d="M-210 20 q22 -14 44 0 t44 0 t44 0 t44 0 t44 0 t44 0 t44 0 t44 0" fill="none" stroke="${C.ver}" stroke-width="9" stroke-linecap="round"/>`)}</g>
    ${small(p + '-vic', 'VICINISSIMA AL MARE', 1500, 880, 40, C.ink, { anchor: 'middle', ls: 8 })}
  </g>
  <g id="${p}-s2">
    <g id="${p}-wm">${place(520, 1010, 1.55, `<g fill="${C.ink}"><circle cx="0" cy="-520" r="50"/><circle cx="34" cy="-566" r="26"/><rect x="-14" y="-480" width="28" height="40"/><path d="M-70 -440 Q0 -470 70 -440 L96 -150 L-96 -150Z"/><path d="M-70 -436 L-108 -250 L-84 -244 L-52 -380Z"/><path d="M70 -436 L108 -250 L84 -244 L52 -380Z"/><rect x="-44" y="-150" width="30" height="150"/><rect x="14" y="-150" width="30" height="150"/><path d="M-60 0 H-8 V-18 H-60Z M8 0 H60 V-18 H8Z"/></g><path d="M-70 -440 Q0 -470 70 -440 L96 -150" fill="none" stroke="${C.mus}" stroke-width="6" opacity=".8"/>`)}</g>
    <g id="${p}-mk">${place(1400, 600, 1.9, maskFace(p, p + '-mf'))}</g>
    <g id="${p}-ex">${big(p + '-exm', '!', 640, 330, 330, C.mus, { plate: C.ink, pd: 8 })}</g>
  </g>
  <g id="${p}-s3">
    ${tiles}
    <g id="${p}-iw">${place(280, 1030, 0.9, ines(p, p + '-in'))}</g>
    ${['1949', '1968', '1978', '2001', '2020'].map((y, i) => `<g id="${p}-y${i}">${big(p + '-yt' + i, y, 1220, 520, 380, C.ink, { plate: C.mus })}</g>`).join('')}
    <g id="${p}-nd">${stamp(p, p + '-nds', 'NON DECIFRATO', 1180, 800, 120, C.red, -6)}</g>
  </g>`;
  const years = [0, 1, 2, 3, 4];
  const js = `
  ${['s1', 's2', 's3'].map((s) => `gsap.set("#${p}-${s}",{opacity:0});`).join('')}
  gsap.set(["#${p}-y0","#${p}-y1","#${p}-y2","#${p}-y3","#${p}-y4"],{opacity:0});
  ${SL(`#${p}-sheet`, L[0].ls - 0.1, -1400, 0, { d: 0.6 })}
  ${code.map((_, i) => `tl.fromTo("#${p}-ln${i}",{opacity:0,x:-30},{opacity:1,x:0,duration:.3,ease:"power3.out"},${f2(L[0].ls + 0.5 + i * 0.95)});`).join('\n  ')}
  ${IN(`#${p}-qq`, cue(0, 'cinque righe'), { s: 1.4 })}
  tl.fromTo("#${p}-strike",{scaleX:0,transformOrigin:"0% 50%"},{scaleX:1,duration:.35,ease:"power3.out"},${f2(cue(0, 'cancellata'))});
  ${PUSH(p, L[0].ls, L[0].d, 1.05, '700px 540px')}
  // l1 phone
  tl.to("#${p}-s0",{x:-2400,duration:.45,ease:"power3.in"},${f2(L[1].ls - 0.2)});
  tl.set("#${p}-s1",{opacity:1},${f2(L[1].ls - 0.2)});
  ${IN(`#${p}-dial`, L[1].ls, { s: 1.4 })}
  tl.fromTo("#${p}-dial",{rotation:-6,transformOrigin:"50% 50%"},{rotation:6,duration:.12,yoyo:true,repeat:11,immediateRender:false},${f2(L[1].ls + 0.5)});
  tl.fromTo("#${p}-wire",{strokeDashoffset:600},{strokeDashoffset:0,duration:2,ease:"none"},${f2(cue(1, 'infermiera') - 0.5)});
  ${SL(`#${p}-house`, cue(1, 'infermiera'), 0, 500, { d: 0.5, e: 'back.out(1.4)' })}
  ${SL(`#${p}-vic`, cue(1, 'vicinissima') , 0, 40, { d: 0.4 })}
  // l2 the mask
  tl.to("#${p}-s1",{opacity:0,duration:.2},${f2(L[2].ls - 0.1)});
  tl.set("#${p}-s2",{opacity:1},${f2(L[2].ls - 0.1)});
  ${SL(`#${p}-wm`, L[2].ls, -700, 0, { d: 0.6 })}
  ${SL(`#${p}-mk`, cue(2, 'volto di gesso') - 0.6, 900, 0, { d: 0.6 })}
  ${IN(`#${p}-ex`, cue(2, 'turbata'), { s: 1.8, o: '50% 100%', d: 0.2 })}
  tl.fromTo("#${p}-wm",{rotation:0},{rotation:-3,transformOrigin:"50% 100%",duration:.12,yoyo:true,repeat:5},${f2(cue(2, 'turbata'))});
  // l3 undeciphered
  tl.to("#${p}-s2",{opacity:0,duration:.2},${f2(L[3].ls - 0.1)});
  tl.set("#${p}-s3",{opacity:1},${f2(L[3].ls - 0.1)});
  ${Array.from({ length: 26 }, (_, i) => `tl.fromTo("#${p}-tl${i}",{opacity:0,scale:.2,transformOrigin:"50% 50%"},{opacity:1,scale:1,duration:.3,ease:"back.out(1.6)"},${f2(L[3].ls + (i % 13) * 0.07)});tl.to("#${p}-tl${i}",{x:${(i * 37) % 70 - 35},y:${(i * 53) % 70 - 35},rotation:${(i * 41) % 50 - 25},duration:${f2(L[3].d - 1)},ease:"sine.inOut"},${f2(L[3].ls + 0.5)});`).join('\n  ')}
  ${SL(`#${p}-iw`, L[3].ls, -600, 0, { d: 0.5 })}
  tl.fromTo("#${p}-in-lens",{rotation:-10,transformOrigin:"50% 50%"},{rotation:14,duration:1.2,ease:"sine.inOut",yoyo:true,repeat:4},${f2(L[3].ls + 0.5)});
  ${years.map((i) => `tl.set("#${p}-y${i}",{opacity:1},${f2(cue(3, 'per decenni') + i * 0.75)});tl.set("#${p}-y${i}",{opacity:0},${f2(cue(3, 'per decenni') + (i + 1) * 0.75 - 0.02)});`).join('\n  ')}
  ${IN(`#${p}-nd`, cue(3, 'Nessuno riesce'), { s: 2.2, d: 0.16 })}
  `;
  return { bg: C.cor, world, js };
};
chapters.c5.cardBg = C.cor;
