// Minificatore CSS minimale e prudente (nessuna dipendenza): toglie commenti e spazi superflui
// fuori da stringhe e url(...), senza toccare gli spazi che hanno significato nei selettori e in calc().
export function minifyCss(css) {
  const out = [];
  let i = 0;
  const n = css.length;
  let pendingSpace = false;
  const push = (s) => { out.push(s); };
  while (i < n) {
    const c = css[i];
    // commento
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      pendingSpace = true;
      continue;
    }
    // stringhe
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && css[j] !== c) j += css[j] === '\\' ? 2 : 1;
      if (pendingSpace) { push(' '); pendingSpace = false; }
      push(css.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    // url(...) non quotato o quotato: lo copiamo intero
    if (c === 'u' && css.startsWith('url(', i)) {
      let j = i + 4;
      let q = null;
      if (css[j] === '"' || css[j] === "'") q = css[j];
      if (q) { j++; while (j < n && css[j] !== q) j += css[j] === '\\' ? 2 : 1; j++; }
      while (j < n && css[j] !== ')') j++;
      if (pendingSpace) { push(' '); pendingSpace = false; }
      push(css.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    if (/\s/.test(c)) { pendingSpace = true; i++; continue; }
    if (pendingSpace) {
      const prev = out.length ? out[out.length - 1].slice(-1) : '';
      // niente spazio dopo { } ; , : o prima di { } ; , (il resto mantiene lo spazio)
      const dropAfter = '{};,:';
      const dropBefore = '{};,';
      if (!(dropAfter.includes(prev) || dropBefore.includes(c) || prev === '')) push(' ');
      pendingSpace = false;
    }
    push(c);
    i++;
  }
  return out.join('').replace(/;}/g, '}');
}
