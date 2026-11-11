// Shared palette + SVG helpers for CASO CHIUSO (serigrafia a 3 inchiostri)
export const C = {
  ink: '#2A1215', bone: '#F4EBD9', mus: '#F2B632', cor: '#E0704F', ver: '#2F8F83',
  deep: '#17565A', red: '#C8342B', rose: '#E9A58F', brick: '#8A3A2E', night: '#0F3A3E',
};

// pattern / gradient defs; p = unique prefix per scene
export const defs = (p) => `<defs>
<pattern id="${p}-dots" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="6" cy="6" r="2.4" fill="${C.ink}"/></pattern>
<pattern id="${p}-dots2" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="4.5" cy="4.5" r="1.7" fill="${C.ink}"/></pattern>
<linearGradient id="${p}-fadeg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
<mask id="${p}-fade"><rect width="1920" height="1080" fill="url(#${p}-fadeg)"/></mask>
</defs>`;

// shape with halftone shadow + ink outline
export const sh = (p, d, fill, o = {}) => {
  const { dx = 10, dy = 10, sw = 4, id = '', sa = '' } = o;
  return `<g${id ? ` id="${id}"` : ''}><path d="${d}" fill="url(#${p}-dots)" opacity=".5" transform="translate(${dx} ${dy})"/><path d="${d}" fill="${fill}" stroke="${C.ink}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round" ${sa}/></g>`;
};
export const circ = (p, cx, cy, r, fill, o = {}) => {
  const { dx = 8, dy = 8, sw = 4, id = '' } = o;
  return `<g${id ? ` id="${id}"` : ''}><circle cx="${cx + dx}" cy="${cy + dy}" r="${r}" fill="url(#${p}-dots)" opacity=".5"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${C.ink}" stroke-width="${sw}"/></g>`;
};
export const rect = (p, x, y, w, h, fill, o = {}) => sh(p, `M${x} ${y}H${x + w}V${y + h}H${x}Z`, fill, o);

// big display type with misregistered second plate
export const big = (id, text, x, y, size, fill = C.ink, o = {}) => {
  const { anchor = 'start', plate = C.mus, pd = 7, font = "'League Gothic'", ls = 2, weight = 400, rot = 0 } = o;
  const t = (dx, dy, f, cls) => `<text x="${x + dx}" y="${y + dy}" font-family="${font}" font-weight="${weight}" font-size="${size}" letter-spacing="${ls}" text-anchor="${anchor}" fill="${f}" ${cls}>${text}</text>`;
  return `<g id="${id}"><g transform="rotate(${rot} ${x} ${y})">${plate ? t(pd, pd, plate, '') : ''}${t(0, 0, fill, '')}</g></g>`;
};
export const small = (id, text, x, y, size, fill = C.ink, o = {}) => {
  const { anchor = 'start', ls = 6, weight = 800, rot = 0 } = o;
  return `<text id="${id}" x="${x}" y="${y}" font-family="Montserrat" font-weight="${weight}" font-size="${size}" letter-spacing="${ls}" text-anchor="${anchor}" fill="${fill}" transform="rotate(${rot} ${x} ${y})">${text}</text>`;
};
export const place = (x, y, s, inner, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">${inner}</g>`;

// stamp (rubber stamp look)
export const stamp = (p, id, text, x, y, size = 90, color = C.red, rot = -7) => {
  const w = text.length * size * 0.5 + 60, h = size + 40;
  return `<g id="${id}"><g transform="translate(${x} ${y}) rotate(${rot})"><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="6" fill="none" stroke="${color}" stroke-width="10"/><rect x="${-w / 2 + 12}" y="${-h / 2 + 12}" width="${w - 24}" height="${h - 24}" fill="none" stroke="${color}" stroke-width="3"/><text x="0" y="${size * 0.34}" text-anchor="middle" font-family="'League Gothic'" font-size="${size}" letter-spacing="4" fill="${color}">${text}</text></g></g>`;
};

// ---------- characters ----------
// Ines "La Lente": origin = feet centre. ~620 units tall. parts: -head -armR (with lens) -armL -eyes
export const ines = (p, id, o = {}) => {
  const coat = o.coat || C.ver;
  return `<g id="${id}">
  <g id="${id}-legs">
    <path d="M-34 -250 L-40 -24 L-8 -24 L-6 -250Z" fill="${C.ink}"/><path d="M6 -250 L8 -24 L40 -24 L34 -250Z" fill="${C.ink}"/>
    <path d="M-52 -24 Q-24 -52 -4 -24 L-4 -2 L-54 -2Z" fill="${C.red}" stroke="${C.ink}" stroke-width="4"/><path d="M4 -24 Q24 -52 52 -24 L54 -2 L4 -2Z" fill="${C.red}" stroke="${C.ink}" stroke-width="4"/>
  </g>
  <g id="${id}-torso">
    ${sh(p, 'M-74 -480 Q-84 -380 -98 -230 L-98 -160 L98 -160 L88 -230 Q80 -380 74 -480 Q0 -512 -74 -480Z', coat)}
    <path d="M-12 -500 L0 -330 L12 -500Z" fill="${C.bone}" stroke="${C.ink}" stroke-width="3"/>
    <rect x="-96" y="-330" width="192" height="26" fill="${C.mus}" stroke="${C.ink}" stroke-width="4"/>
    <circle cx="0" cy="-440" r="7" fill="${C.mus}" stroke="${C.ink}" stroke-width="3"/><circle cx="0" cy="-392" r="7" fill="${C.mus}" stroke="${C.ink}" stroke-width="3"/>
    <path d="M-60 -498 L-6 -470 L-36 -440Z" fill="${C.bone}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/><path d="M60 -498 L6 -470 L36 -440Z" fill="${C.bone}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
  </g>
  <g id="${id}-armL"><path d="M-70 -472 L-104 -472 L-112 -300 L-80 -300Z" fill="${coat}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/><circle cx="-96" cy="-290" r="17" fill="${C.rose}" stroke="${C.ink}" stroke-width="4"/></g>
  <g id="${id}-head">
    <path d="M-12 -500 L-12 -520 L12 -520 L12 -500Z" fill="${C.rose}" stroke="${C.ink}" stroke-width="4"/>
    <circle cx="28" cy="-626" r="26" fill="${C.ink}"/>
    <circle cx="0" cy="-572" r="56" fill="${C.rose}" stroke="${C.ink}" stroke-width="4"/>
    <path d="M-58 -574 Q-56 -640 0 -636 Q56 -640 58 -574 Q30 -604 -8 -596 Q-40 -590 -58 -574Z" fill="${C.ink}"/>
    <g id="${id}-eyes"><circle cx="-21" cy="-566" r="21" fill="${C.bone}" stroke="${C.ink}" stroke-width="5"/><circle cx="21" cy="-566" r="21" fill="${C.bone}" stroke="${C.ink}" stroke-width="5"/>
    <path d="M-2 -566 L2 -566" stroke="${C.ink}" stroke-width="5"/><circle id="${id}-pupL" cx="-21" cy="-566" r="6" fill="${C.ink}"/><circle id="${id}-pupR" cx="21" cy="-566" r="6" fill="${C.ink}"/></g>
    <path d="M-16 -534 Q0 -522 16 -534" fill="none" stroke="${C.ink}" stroke-width="5" stroke-linecap="round"/>
  </g>
  <g id="${id}-armR"><path d="M70 -472 L104 -472 L112 -300 L78 -300Z" fill="${coat}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/><circle cx="96" cy="-290" r="17" fill="${C.rose}" stroke="${C.ink}" stroke-width="4"/>
    <g id="${id}-lens"><path d="M96 -284 L140 -200" stroke="${C.ink}" stroke-width="12" stroke-linecap="round"/><circle cx="162" cy="-150" r="62" fill="${C.bone}" fill-opacity=".55" stroke="${C.ink}" stroke-width="10"/><path d="M128 -170 Q140 -196 164 -200" fill="none" stroke="${C.bone}" stroke-width="7" stroke-linecap="round"/></g></g>
  </g>`;
};

// The Man (standing, front). blank face; no hat.
export const man = (p, id, o = {}) => `<g id="${id}">
  <path d="M-46 -260 L-52 -26 L-8 -26 L-6 -260Z" fill="#3A1A22" stroke="${C.ink}" stroke-width="4"/><path d="M6 -260 L8 -26 L52 -26 L46 -260Z" fill="#3A1A22" stroke="${C.ink}" stroke-width="4"/>
  <path d="M-70 -26 Q-30 -60 -6 -26 L-6 0 L-72 0Z" fill="${C.ink}"/><path d="M6 -26 Q30 -60 70 -26 L72 0 L6 0Z" fill="${C.ink}"/>
  <path d="M-56 -22 Q-34 -40 -14 -22" fill="none" stroke="${C.bone}" stroke-width="4" stroke-linecap="round"/><path d="M14 -22 Q34 -40 56 -22" fill="none" stroke="${C.bone}" stroke-width="4" stroke-linecap="round"/>
  ${sh(p, 'M-80 -488 Q-92 -380 -76 -250 L76 -250 Q92 -380 80 -488 Q0 -520 -80 -488Z', C.brick)}
  <path d="M-34 -496 L0 -330 L34 -496Z" fill="${C.bone}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
  <path id="${id}-tie" d="M-10 -490 L10 -490 L18 -340 L0 -312 L-18 -340Z" fill="${C.mus}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
  <g id="${id}-armL"><path d="M-78 -482 L-116 -482 L-124 -296 L-86 -296Z" fill="${C.brick}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/><circle cx="-106" cy="-284" r="18" fill="${C.bone}" stroke="${C.ink}" stroke-width="4"/></g>
  <g id="${id}-armR"><path d="M78 -482 L116 -482 L124 -296 L86 -296Z" fill="${C.brick}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/><circle cx="106" cy="-284" r="18" fill="${C.bone}" stroke="${C.ink}" stroke-width="4"/></g>
  <g id="${id}-head"><rect x="-14" y="-516" width="28" height="30" fill="${C.bone}" stroke="${C.ink}" stroke-width="4"/>
    <ellipse cx="0" cy="-566" rx="48" ry="58" fill="${C.bone}" stroke="${C.ink}" stroke-width="4"/>
    <path d="M-48 -572 Q-50 -626 0 -626 Q50 -626 48 -572 Q30 -596 0 -594 Q-30 -596 -48 -572Z" fill="${C.ink}"/>
    <ellipse cx="22" cy="-556" rx="24" ry="50" fill="url(#${p}-dots2)" opacity=".35"/>
  </g></g>`;

// The Man seated against a wall, front view, slumped
export const manSeated = (p, id) => `<g id="${id}">
  <path d="M-80 -110 L-210 0 L-160 56 L-20 -96Z" fill="#3A1A22" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/><path d="M80 -110 L210 0 L160 56 L20 -96Z" fill="#3A1A22" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
  <ellipse cx="-196" cy="44" rx="50" ry="24" fill="${C.ink}" transform="rotate(-38 -196 44)"/><ellipse cx="196" cy="44" rx="50" ry="24" fill="${C.ink}" transform="rotate(38 196 44)"/>
  <path d="M-222 34 Q-204 14 -176 22 M176 22 Q204 14 222 34" fill="none" stroke="${C.bone}" stroke-width="4" stroke-linecap="round"/>
  <g id="${id}-body">
  ${sh(p, 'M-100 -440 Q-116 -300 -100 -100 L100 -100 Q116 -300 100 -440 Q0 -478 -100 -440Z', C.brick)}
  <path d="M-40 -450 L0 -300 L40 -450Z" fill="${C.bone}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/><path d="M-9 -444 L9 -444 L16 -330 L0 -306 L-16 -330Z" fill="${C.mus}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
  <g id="${id}-armL"><path d="M-100 -430 L-138 -420 L-150 -150 L-108 -144Z" fill="${C.brick}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/><circle cx="-128" cy="-132" r="20" fill="${C.bone}" stroke="${C.ink}" stroke-width="4"/></g>
  <g id="${id}-armR"><path d="M100 -430 L138 -420 L150 -150 L108 -144Z" fill="${C.brick}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/><circle cx="128" cy="-132" r="20" fill="${C.bone}" stroke="${C.ink}" stroke-width="4"/></g></g>
  <g id="${id}-head"><rect x="-16" y="-476" width="32" height="34" fill="${C.bone}" stroke="${C.ink}" stroke-width="4"/>
    <ellipse cx="0" cy="-532" rx="52" ry="62" fill="${C.bone}" stroke="${C.ink}" stroke-width="4"/>
    <path d="M-52 -540 Q-54 -598 0 -598 Q54 -598 52 -540 Q32 -566 0 -564 Q-32 -566 -52 -540Z" fill="${C.ink}"/>
    <ellipse cx="24" cy="-520" rx="26" ry="54" fill="url(#${p}-dots2)" opacity=".35"/>
  </g></g>`;

// small walking silhouette (for crowd/couple)
export const walker = (p, id, fill = C.ink, hat = false) => `<g id="${id}"><circle cx="0" cy="-168" r="20" fill="${fill}"/><path d="M-22 -140 Q0 -150 22 -140 L28 -64 L-28 -64Z" fill="${fill}"/><g id="${id}-lg"><path d="M-22 -70 L-12 0 L2 0 L4 -70Z" fill="${fill}"/><path d="M4 -70 L12 0 L28 0 L24 -70Z" fill="${fill}"/></g>${hat ? `<path d="M-30 -178 L30 -178 L22 -196 L-22 -196Z" fill="${fill}"/>` : ''}</g>`;

// paper scrap with torn edge
export const scrapPath = 'M0 0 L70 6 L130 -4 L190 8 L196 52 L186 98 L194 140 L130 150 L70 140 L8 150 L-4 100 L6 48Z';
