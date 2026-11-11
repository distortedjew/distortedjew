import { C, sh, circ, rect, big, small, place, stamp, ines, man, manSeated, walker, scrapPath } from './lib.mjs';
export const chapters = {};

// ---- shared bits ----
export const sea = (p, y0, y1, fill, line) => `<rect x="-200" y="${y0}" width="2320" height="${y1 - y0}" fill="${fill}"/>` +
  Array.from({ length: 7 }, (_, i) => `<path class="${p}-wave" d="M${-100 + (i % 2) * 90} ${y0 + 36 + i * ((y1 - y0 - 50) / 7)} q40 -16 80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0" fill="none" stroke="${line}" stroke-width="5" stroke-linecap="round" opacity=".7"/>`).join('');
export const wall = (p, y, fill = C.bone) => `<g>${sh(p, `M-100 ${y} H2020 V${y + 150} H-100Z`, fill, { dy: 12 })}
  <rect x="-100" y="${y}" width="2120" height="26" fill="${C.ink}" opacity=".9"/>
  ${Array.from({ length: 16 }, (_, i) => `<path d="M${i * 140 - 60} ${y + 26} V${y + 150}" stroke="${C.ink}" stroke-width="4" opacity=".55"/>`).join('')}
  <path d="M-100 ${y + 88} H2020" stroke="${C.ink}" stroke-width="4" opacity=".55"/></g>`;
export const maskFace = (p, id) => `<g id="${id}">${sh(p, 'M-110 -40 Q-120 -170 0 -178 Q120 -170 110 -40 Q100 80 40 140 Q0 170 -40 140 Q-100 80 -110 -40Z', C.bone)}
  <path d="M-110 -40 Q-100 80 -40 140 Q0 170 0 -178 Q-120 -170 -110 -40Z" fill="url(#${p}-dots2)" opacity=".4"/>
  <path d="M-76 -48 Q-52 -66 -28 -48 M28 -48 Q52 -66 76 -48" fill="none" stroke="${C.ink}" stroke-width="7" stroke-linecap="round"/>
  <path d="M0 -30 L-10 40 L12 44" fill="none" stroke="${C.ink}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M-34 96 Q0 108 34 96" fill="none" stroke="${C.ink}" stroke-width="7" stroke-linecap="round"/>
  <path d="M-96 -128 Q-40 -176 20 -170 Q70 -166 100 -124 Q40 -132 -20 -122 Q-70 -116 -96 -128Z" fill="${C.ink}"/></g>`;
export const codeCard = (p, id) => `<g id="${id}">${sh(p, 'M0 0 H380 V250 H0Z', C.bone)}
  ${['WRGOABABD', 'MLIAOI', 'WTBIMPANETP', 'MLIABOAIAQC', 'ITTMTSAMSTGAB'].map((t, i) => `<text x="26" y="${52 + i * 46}" font-family="Montserrat" font-weight="800" font-size="30" letter-spacing="6" fill="${C.ink}">${t}</text>`).join('')}</g>`;
export const scrap = (p, id, txt = 'TAMÁM') => `<g id="${id}">${sh(p, scrapPath, C.bone)}<text x="98" y="90" text-anchor="middle" font-family="'League Gothic'" font-size="62" letter-spacing="3" fill="${C.ink}">${txt}</text></g>`;

// =============== PROLOGUE ===============
chapters.c0 = (x) => {
  const { p, cue, lines } = x;
  const L = lines;
  const world = `
  <rect width="1920" height="1080" fill="${C.mus}"/>
  <rect width="1920" height="560" fill="url(#${p}-dots)" opacity=".22" mask="url(#${p}-fade)"/>
  <g id="${p}-sun">${circ(p, 1250, 600, 300, C.red, { dx: 14, dy: 14 })}<circle cx="1250" cy="600" r="236" fill="none" stroke="${C.mus}" stroke-width="10" opacity=".55"/></g>
  <g id="${p}-sea">${sea(p, 590, 850, C.ver, C.deep)}</g>
  ${wall(p, 700)}
  <rect x="-100" y="850" width="2120" height="260" fill="${C.cor}"/>
  <rect x="-100" y="850" width="2120" height="260" fill="url(#${p}-dots)" opacity=".16"/>
  <path d="M-100 850 H2020" stroke="${C.ink}" stroke-width="5"/>
  ${Array.from({ length: 14 }, (_, i) => `<ellipse cx="${(i * 197 + 40) % 1900}" cy="${910 + (i * 71) % 150}" rx="${14 + (i % 4) * 5}" ry="7" fill="${C.ink}" opacity=".25"/>`).join('')}
  <g id="${p}-manwrap">${place(1290, 985, 0.8, manSeated(p, p + '-man'))}</g>`;
  const ovl = `
  <g id="${p}-t1">${big(p + '-adel', 'ADELAIDE', 100, 410, 360, C.ink, { plate: C.red, pd: 8 })}
  ${small(p + '-date', '1° DICEMBRE 1948', 108, 500, 64, C.ink, { ls: 12 })}</g>
  <g id="${p}-t2">${big(p + '-nonlo', 'NON LO È.', 100, 380, 330, C.ink, { plate: C.red, pd: 8 })}</g>
  <g id="${p}-t3">${big(p + '-74', '74', 100, 640, 640, C.red, { plate: C.ink, pd: 10 })}${small(p + '-anni', 'ANNI SENZA UN NOME', 118, 730, 60, C.ink, { ls: 8 })}</g>
  <g id="${p}-f1">${place(110, 110, 1.35, scrap(p, p + '-scrap'), -9)}</g>
  <g id="${p}-f2">${place(110, 470, 1, codeCard(p, p + '-code'), 4)}</g>
  <g id="${p}-f3">${place(640, 420, 1.1, maskFace(p, p + '-mask'), -5)}</g>`;
  const js = `
  const cam = "#${p}-cam";
  gsap.set(cam,{transformOrigin:"1290px 640px"});
  tl.fromTo("#${p}-adel",{x:-30},{x:0,duration:.6,ease:"power3.out"},0);
  tl.to(cam,{scale:1.1,duration:${L[1].ls.toFixed(2)},ease:"power1.inOut"},0);
  tl.to("#${p}-sun",{y:-60,duration:${(L[3].le).toFixed(2)},ease:"none"},0);
  // line 2: type leaves, camera pushes onto the man
  tl.to("#${p}-t1",{x:-2300,duration:.5,ease:"power3.in"},${L[1].ls.toFixed(2)});
  tl.to(cam,{scale:1.85,duration:${(L[1].d).toFixed(2)},ease:"power2.inOut"},${L[1].ls.toFixed(2)});
  tl.to("#${p}-man-head",{rotation:5,transformOrigin:"50% 100%",duration:2.5,ease:"sine.inOut",yoyo:true,repeat:1},${L[1].ls.toFixed(2)});
  // line 3
  tl.fromTo("#${p}-t2",{scale:1.2,transformOrigin:"0% 50%",opacity:0},{scale:1,opacity:1,duration:.2,ease:"power4.out"},${L[2].ls.toFixed(2)});
  tl.to("#${p}-t2",{x:-2300,duration:.45,ease:"power3.in"},${cue(2, 'E per').toFixed(2)});
  tl.fromTo("#${p}-t3",{scale:1.25,transformOrigin:"0% 100%",opacity:0},{scale:1,opacity:1,duration:.2,ease:"power4.out"},${(cue(2, 'E per') + 0.3).toFixed(2)});
  tl.to("#${p}-t3",{x:-2300,duration:.45,ease:"power3.in"},${L[3].ls.toFixed(2)});
  // line 4: three objects arrive with their words
  const fl=(id,t,fx,fy,r)=>tl.fromTo(id,{x:fx,y:fy,rotation:r,opacity:0},{x:0,y:0,rotation:0,opacity:1,duration:.4,ease:"back.out(1.6)"},t);
  fl("#${p}-f1",${cue(3, 'di un biglietto').toFixed(2)},-700,-200,-40);
  fl("#${p}-f2",${cue(3, 'di un codice').toFixed(2)},-800,300,30);
  fl("#${p}-f3",${cue(3, 'di una maschera', 0.80).toFixed(2)},600,700,25);
  tl.to(cam,{scale:1.5,duration:3,ease:"power2.inOut"},${(L[3].ls + 0.2).toFixed(2)});
  tl.to(["#${p}-f1","#${p}-f2","#${p}-f3"],{x:-2400,duration:.5,ease:"power3.in",stagger:.05},${(L[3].le + 0.15).toFixed(2)});
  `;
  return { bg: C.mus, world, ovl, js };
};

// =============== BRAND CARD ===============
chapters.brand = () => ({ bg: C.mus, world: '', js: '' });
chapters.brand.cardBg = C.mus;

// =============== CH 1 — LA SPIAGGIA ===============
chapters.c1 = (x) => {
  const { p, cue, lines, off } = x; const L = lines;
  const world = `
  <rect id="${p}-sky" width="1920" height="1080" fill="${C.night}"/>
  <rect id="${p}-dawn" width="1920" height="700" y="0" fill="${C.mus}"/>
  <g id="${p}-sun">${circ(p, 1480, 700, 160, C.red, { dx: 10, dy: 10 })}</g>
  <rect width="1920" height="600" fill="url(#${p}-dots)" opacity=".22" mask="url(#${p}-fade)"/>
  <g id="${p}-moon">${circ(p, 1480, 250, 120, C.bone, { dx: 10, dy: 10 })}</g>
  <g id="${p}-sea">${sea(p, 560, 800, '#1B6A68', C.night)}</g>
  ${wall(p, 690, '#CFC3A8')}
  <rect x="-100" y="840" width="2120" height="260" fill="#B9573F"/>
  <rect x="-100" y="840" width="2120" height="260" fill="url(#${p}-dots)" opacity=".2"/>
  <path d="M-100 840 H2020" stroke="${C.ink}" stroke-width="5"/>
  <g id="${p}-lying">${place(1540, 930, 0.8, `
     <path d="M-210 -20 L-60 -50 L-60 6 L-210 22Z" fill="#3A1A22" stroke="${C.ink}" stroke-width="4"/>
     <path d="M-210 -20 L-250 -30 L-252 20 L-210 24Z" fill="${C.ink}"/>
     ${sh(p, 'M-60 -56 Q40 -90 130 -60 L130 12 Q40 40 -60 10Z', C.brick)}
     <g id="${p}-lyarm"><path d="M30 -70 L58 -70 L60 -150 L34 -150Z" fill="${C.brick}" stroke="${C.ink}" stroke-width="4"/><circle cx="46" cy="-156" r="14" fill="${C.bone}" stroke="${C.ink}" stroke-width="4"/></g>
     <circle cx="176" cy="-30" r="46" fill="${C.bone}" stroke="${C.ink}" stroke-width="4"/>
     <path d="M140 -56 Q176 -88 214 -50 Q188 -62 140 -56Z" fill="${C.ink}"/>`)}</g>
  <g id="${p}-couple">${place(0, 1010, 2.0, walker(p, p + '-w1', C.ink) + `<g transform="translate(70 0) scale(.92)">${walker(p, p + '-w2', '#3A1A22')}</g>`)}</g>
  <g id="${p}-jockey">${place(0, 1010, 2.3, walker(p, p + '-j', C.ink, true) + `<path d="M26 -110 L66 -150" stroke="${C.ink}" stroke-width="5"/>`)}</g>
  <g id="${p}-ex" opacity="0">${big(p + '-exm', '!', 0, 0, 260, C.red, { plate: C.ink, pd: 6 })}</g>
  `;
  // cutaway: dressed man
  const cut = `<g id="${p}-cut"><rect width="1920" height="1080" fill="${C.mus}"/><rect width="1920" height="1080" fill="url(#${p}-dots)" opacity=".1"/>
    ${place(960, 905, 0.88, man(p, p + '-m'))}
    <g id="${p}-hat"><ellipse cx="960" cy="332" rx="110" ry="30" fill="none" stroke="${C.ink}" stroke-width="7" stroke-dasharray="16 14"/><path d="M902 324 Q906 262 960 260 Q1014 262 1018 324" fill="none" stroke="${C.ink}" stroke-width="7" stroke-dasharray="16 14"/>
      <path d="M906 236 L1014 346 M1014 236 L906 346" stroke="${C.red}" stroke-width="16" stroke-linecap="round"/></g>
    <g id="${p}-co1">${small(p + '-l1', 'GIACCA', 1190, 612, 52, C.ink, { ls: 10 })}<path d="M1180 598 H1040" stroke="${C.ink}" stroke-width="6"/></g>
    <g id="${p}-co2">${small(p + '-l2', 'CRAVATTA', 770, 530, 52, C.ink, { ls: 10, anchor: 'end' })}<path d="M790 516 H940" stroke="${C.ink}" stroke-width="6"/></g>
    <g id="${p}-co3">${small(p + '-l3', 'SCARPE LUCIDE', 1130, 900, 52, C.ink, { ls: 10 })}<path d="M1120 886 H1010" stroke="${C.ink}" stroke-width="6"/></g>
    ${[['t1', 888, 468], ['t2', 1010, 668], ['t3', 880, 672], ['t4', 958, 556]].map(([id, tx, ty]) => `<g id="${p}-${id}">${place(tx, ty, 1, `${sh(p, 'M0 0 H62 V40 H0Z', C.bone, { dx: 5, dy: 5, sw: 3 })}<text x="31" y="30" text-anchor="middle" font-family="Montserrat" font-weight="800" font-size="28" fill="${C.ink}">?</text>`, -8)}</g>`).join('')}
    <g id="${p}-sc">${place(0, 0, 1.4, `<g id="${p}-scA"><path d="M0 0 L120 -30 L124 -18 L10 12Z" fill="${C.bone}" stroke="${C.ink}" stroke-width="5" stroke-linejoin="round"/><circle cx="-26" cy="20" r="22" fill="none" stroke="${C.red}" stroke-width="10"/></g><g id="${p}-scB"><path d="M0 0 L120 30 L124 18 L10 -12Z" fill="${C.bone}" stroke="${C.ink}" stroke-width="5" stroke-linejoin="round"/><circle cx="-26" cy="-20" r="22" fill="none" stroke="${C.red}" stroke-width="10"/></g>`)}</g>
  </g>`;
  const jx = 960;
  const snip = (pt, atn) => { const at = atn.toFixed(2); return `
    tl.to("#${p}-sc",{x:${pt[0] + 40},y:${pt[1]},duration:.3,ease:"power2.out"},${at});
    tl.to("#${p}-scA",{rotation:-16,transformOrigin:"0% 50%",duration:.08,yoyo:true,repeat:3},${(atn + 0.3).toFixed(2)});
    tl.to("#${p}-scB",{rotation:16,transformOrigin:"0% 50%",duration:.08,yoyo:true,repeat:3},${(atn + 0.3).toFixed(2)});`; };
  const tags = [['t1', 888, 468], ['t4', 958, 556], ['t2', 1010, 668], ['t3', 880, 672]];
  const tcue = cue(4, 'qualcuno ha tagliato');
  const js = `
  const cam="#${p}-cam"; gsap.set(cam,{transformOrigin:"960px 700px"});
  gsap.set(["#${p}-cut"],{opacity:0});
  // l1 couple walks
  const stopT=${cue(0, 'Vede un uomo').toFixed(2)}, armT=${cue(0, 'muovere un braccio').toFixed(2)};
  tl.fromTo("#${p}-couple",{x:-320},{x:1050,duration:${(cue(0, 'Vede un uomo') - off).toFixed(2)},ease:"none"},${(off).toFixed(2)});
  for(let i=0;i<14;i++){ tl.to(["#${p}-w1-lg","#${p}-w2-lg"],{rotation:i%2?9:-9,transformOrigin:"50% 0%",duration:.45,ease:"sine.inOut"},${off}+i*.45); }
  gsap.set("#${p}-ex",{opacity:0});
  tl.fromTo("#${p}-ex",{opacity:0,scale:.5,x:1000,y:560,transformOrigin:"50% 100%"},{opacity:1,scale:1,x:1000,y:560,duration:.2,ease:"back.out(2)"},stopT);
  tl.to("#${p}-ex",{opacity:0,duration:.2},stopT+1.2);
  tl.fromTo("#${p}-lyarm",{rotation:0,transformOrigin:"50% 100%"},{rotation:-35,duration:.5,ease:"sine.inOut",yoyo:true,repeat:1},armT);
  tl.to(cam,{scale:1.25,duration:${(cue(0, 'Vede un uomo') - off).toFixed(2)},ease:"power1.inOut"},${off});
  // l2 they move on
  tl.to("#${p}-couple",{x:2500,duration:${(L[1].d + 0.5).toFixed(2)},ease:"none"},${(L[1].ls - 0.2).toFixed(2)});
  tl.to(cam,{scale:1,duration:1.2,ease:"power2.inOut"},${L[1].ls.toFixed(2)});
  // l3 dawn, jockey
  gsap.set("#${p}-dawn",{y:700});gsap.set("#${p}-sun",{y:240});
  tl.to("#${p}-dawn",{y:0,duration:2.6,ease:"power2.inOut"},${L[2].ls.toFixed(2)});
  tl.to("#${p}-moon",{y:500,duration:2.2,ease:"power1.in"},${L[2].ls.toFixed(2)});
  tl.to("#${p}-sun",{y:-160,duration:3,ease:"power1.out"},${(L[2].ls + 0.8).toFixed(2)});
  tl.fromTo("#${p}-jockey",{x:-300},{x:1120,duration:${(L[2].d - 0.6).toFixed(2)},ease:"none"},${L[2].ls.toFixed(2)});
  for(let i=0;i<8;i++){ tl.to("#${p}-j-lg",{rotation:i%2?9:-9,transformOrigin:"50% 0%",duration:.4,ease:"sine.inOut"},${L[2].ls.toFixed(2)}+i*.4); }
  tl.fromTo("#${p}-ex",{opacity:0,scale:.5,x:1120,y:520},{opacity:1,scale:1,x:1120,y:520,duration:.2,ease:"back.out(2)",immediateRender:false},${(L[2].le - 0.8).toFixed(2)});
  tl.to("#${p}-jockey",{x:2600,duration:.9,ease:"power1.in"},${(L[2].le + 0.1).toFixed(2)});
  // l4 cutaway to the dressed man
  tl.set("#${p}-cut",{opacity:1},${L[3].ls.toFixed(2)});
  tl.fromTo("#${p}-cut",{x:1920},{x:0,duration:.4,ease:"power3.out"},${L[3].ls.toFixed(2)});
  tl.fromTo("#${p}-m",{y:80,opacity:0},{y:0,opacity:1,duration:.4,ease:"back.out(1.5)"},${(L[3].ls + 0.1).toFixed(2)});
  tl.fromTo("#${p}-co1",{opacity:0,x:60},{opacity:1,x:0,duration:.3,ease:"power3.out"},${cue(3, 'giacca').toFixed(2)});
  tl.fromTo("#${p}-co2",{opacity:0,x:-60},{opacity:1,x:0,duration:.3,ease:"power3.out"},${cue(3, 'cravatta').toFixed(2)});
  tl.fromTo("#${p}-co3",{opacity:0,x:60},{opacity:1,x:0,duration:.3,ease:"power3.out"},${cue(3, 'scarpe').toFixed(2)});
  tl.fromTo("#${p}-hat",{opacity:0,y:-40},{opacity:1,y:0,duration:.3,ease:"power3.out"},${cue(3, 'non porta il cappello').toFixed(2)});
  tl.to(["#${p}-co1","#${p}-co2","#${p}-co3"],{opacity:0,duration:.3},${L[3].le.toFixed(2)});
  tl.to("#${p}-hat",{opacity:0,duration:.3},${L[3].le.toFixed(2)});
  // l5 labels cut away
  tl.fromTo(["#${p}-t1","#${p}-t2","#${p}-t3","#${p}-t4"],{opacity:0,scale:.2,transformOrigin:"50% 50%"},{opacity:1,scale:1,duration:.25,ease:"back.out(2)",stagger:.1},${(L[4].ls + 0.3).toFixed(2)});
  gsap.set("#${p}-sc",{x:1500,y:300});
  ${tags.map(([id, tx, ty], i) => `${snip([tx, ty], tcue + i * 1.1)}
  tl.to("#${p}-${id}",{y:520,x:${i % 2 ? 60 : -60},rotation:${i % 2 ? 140 : -160},opacity:0,duration:.7,ease:"power2.in"},${(tcue + i * 1.1 + 0.7).toFixed(2)});`).join('\n')}
  tl.to("#${p}-sc",{x:2300,duration:.6,ease:"power2.in"},${(tcue + 4.6).toFixed(2)});
  `;
  return { bg: C.night, world: world + cut, js };
};
chapters.c1.cardBg = C.cor;

// ---- extra helpers (exported) ----
export const f2 = (n) => (+n).toFixed(2);
export const IN = (sel, t, o = {}) => `tl.fromTo("${sel}",{scale:${o.s || 1.25},transformOrigin:"${o.o || '50% 50%'}",opacity:0},{scale:1,opacity:1,duration:${o.d || 0.2},ease:"power4.out"},${f2(t)});`;
export const SL = (sel, t, fx, fy = 0, o = {}) => `tl.fromTo("${sel}",{x:${fx},y:${fy},opacity:0},{x:0,y:0,opacity:1,duration:${o.d || 0.35},ease:"${o.e || 'power3.out'}"},${f2(t)});`;
export const OUT = (sel, t, x = -2400, d = 0.45) => `tl.to("${sel}",{x:${x},duration:${d},ease:"power3.in"},${f2(t)});`;
export const FADE = (sel, t, d = 0.3) => `tl.to("${sel}",{opacity:0,duration:${d}},${f2(t)});`;
export const PUSH = (p, t, d, s = 1.06, o = '50% 50%') => `gsap.set("#${p}-cam",{transformOrigin:"${o}"});tl.fromTo("#${p}-cam",{scale:1},{scale:${s},duration:${f2(d)},ease:"none",immediateRender:false},${f2(t)});`;
export const AUS = 'M442 0 L465 50 L495 96 L540 141 L600 217 L600 255 L573 353 L520 395 L480 415 L430 405 L384 378 L350 365 L330 362 L240 330 L165 340 L75 370 L30 359 L42 324 L7 233 L15 172 L80 120 L135 111 L195 50 L267 26 L345 20 L350 40 L372 75 L420 96 L425 50Z';
export const mapAus = (p, id) => `<g id="${id}">${sh(p, AUS, C.bone, { dx: 12, dy: 12 })}
  <path d="M384 378 L330 362 L240 330 L165 340 L75 370 L30 359 L42 324 L7 233 L15 172 L80 120 L135 111 L195 50 L267 26 L240 200Z" fill="url(#${p}-dots2)" opacity=".16"/></g>`;
export const dawnBeach = (p, ground = C.mus) => `
  <rect width="1920" height="1080" fill="${ground}"/>
  <rect width="1920" height="560" fill="url(#${p}-dots)" opacity=".2" mask="url(#${p}-fade)"/>
  <g id="${p}-sun">${circ(p, 960, 640, 300, C.red, { dx: 14, dy: 14 })}<circle cx="960" cy="640" r="236" fill="none" stroke="${C.mus}" stroke-width="10" opacity=".55"/></g>
  <g>${sea(p, 600, 860, C.ver, C.deep)}</g>
  ${wall(p, 710)}
  <rect x="-100" y="860" width="2120" height="260" fill="${C.cor}"/><rect x="-100" y="860" width="2120" height="260" fill="url(#${p}-dots)" opacity=".16"/>
  <path d="M-100 860 H2020" stroke="${C.ink}" stroke-width="5"/>`;
