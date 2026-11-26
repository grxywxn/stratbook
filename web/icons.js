// Original operator emblems and utility markers, drawn as SVG.
// Attackers get a clipped-corner plate, defenders a shield. Each operator
// gets a three-letter code and a small mark picked from its name, so the
// emblems are tellable apart at a glance.
window.Icons = (() => {
  const COLORS = {
    atk: { line: '#e8742a', fill: '#2b1a0f', mark: '#e8742a' },
    def: { line: '#3d8fd6', fill: '#0f1b27', mark: '#3d8fd6' }
  };

  function hash(s) {
    let h = 2166136261;
    for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function code(name) {
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length > 1) return words.map(w => w[0]).join('').slice(0, 3).toUpperCase();
    const w = words[0] || '?';
    return w.slice(0, w.length <= 3 ? 3 : 3).toUpperCase();
  }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Each operator gets its own hue: warm for attackers, cool for defenders,
  // so the side still reads at a glance.
  function hue(name, side) {
    const h = hash(name);
    return side === 'def' ? 168 + (h % 92) : (330 + (h % 80)) % 360;
  }

  // Returns the inner SVG markup of an emblem on a 40x40 grid.
  function emblemBody(name, side) {
    const H = hue(name, side);
    const id = 'e' + hash(name + side).toString(36);
    const light = `hsl(${H} 70% 62%)`, mid = `hsl(${H} 55% 34%)`, dark = `hsl(${H} 60% 14%)`;
    const v = hash(name) % 6;
    const outline = side === 'def'
      ? 'M20 2.5 L36.5 8 V21 C36.5 30 29.5 35.5 20 37.5 C10.5 35.5 3.5 30 3.5 21 V8 Z'
      : 'M3 3 H29 L37 11 V37 H3 Z';
    const marks = [
      `<rect x="7" y="31" width="26" height="2.2" fill="${light}"/>`,
      `<rect x="7" y="7" width="2.2" height="9" fill="${light}"/>`,
      `<circle cx="11" cy="31" r="1.7" fill="${light}"/><circle cx="16" cy="31" r="1.7" fill="${light}"/>`,
      `<path d="M25 34 L33 26" stroke="${light}" stroke-width="2.2"/>`,
      `<rect x="15" y="6" width="10" height="2.2" fill="${light}"/>`,
      `<path d="M7 33 H14 M7 29.5 H11" stroke="${light}" stroke-width="1.8"/>`
    ];
    const t = code(name);
    const size = t.length > 2 ? 11.5 : 13;
    return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs>` +
      `<path d="${outline}" fill="url(#${id})" stroke="${light}" stroke-width="1" stroke-linejoin="round"/>` +
      marks[v] +
      `<text x="20" y="${side === 'def' ? 23.5 : 24.5}" text-anchor="middle" font-family="Bahnschrift, 'DIN Alternate', 'Arial Narrow', sans-serif" font-weight="700" font-size="${size}" letter-spacing=".4" fill="#fffaf0">${esc(t)}</text>`;
  }

  function emblemSVG(name, side, px) {
    return `<svg viewBox="0 0 40 40" width="${px}" height="${px}" aria-hidden="true">${emblemBody(name, side)}</svg>`;
  }

  // An element for an operator: their custom image if they set one, else the emblem.
  function opIcon(op, px) {
    const span = document.createElement('span');
    span.className = 'op-ico ' + (op ? op.side : '');
    span.style.width = span.style.height = px + 'px';
    if (!op) {
      span.innerHTML = `<svg viewBox="0 0 40 40" width="${px}" height="${px}"><rect x="3" y="3" width="34" height="34" fill="none" stroke="#3a3833" stroke-dasharray="3 3"/></svg>`;
      return span;
    }
    const img = op.img && Store.cachedBlob(op.img);
    if (img) {
      const el = document.createElement('img');
      el.src = img; el.alt = ''; el.width = px; el.height = px;
      span.append(el);
    } else {
      span.innerHTML = emblemSVG(op.name, op.side, px);
    }
    return span;
  }

  const UTIL = [
    { k: 'breach', label: 'Hard breach', code: 'HB', color: '#e8742a' },
    { k: 'charge', label: 'Soft breach', code: 'SB', color: '#e8742a' },
    { k: 'drone', label: 'Drone', code: 'DR', color: '#a39d91', shape: 'circle' },
    { k: 'smoke', label: 'Smoke', code: 'SM', color: '#a39d91', shape: 'circle' },
    { k: 'flash', label: 'Flash / stun', code: 'FL', color: '#d9c34a', shape: 'circle' },
    { k: 'frag', label: 'Frag / impact', code: 'FR', color: '#c8553d', shape: 'circle' },
    { k: 'plant', label: 'Plant', code: 'P', color: '#d9c34a', shape: 'diamond' },
    { k: 'reinforce', label: 'Reinforced wall', code: 'R', color: '#3d8fd6' },
    { k: 'rotate', label: 'Rotate / hole', code: 'RO', color: '#3d8fd6', shape: 'circle' },
    { k: 'camera', label: 'Camera', code: 'CA', color: '#3d8fd6' },
    { k: 'trap', label: 'Trap', code: 'TR', color: '#3d8fd6', shape: 'triangle' },
    { k: 'barricade', label: 'Barricade', code: 'BA', color: '#7d776c' },
    { k: 'c4', label: 'C4 / denial', code: 'C4', color: '#c8553d' },
    { k: 'enemy', label: 'Enemy spotted', code: '!', color: '#c8553d', shape: 'triangle' }
  ];
  const utilByKey = Object.fromEntries(UTIL.map(u => [u.k, u]));

  // SVG markup for a utility marker centred at 0,0 with radius r.
  function utilBody(k, r) {
    const u = utilByKey[k] || UTIL[0];
    let shape;
    if (u.shape === 'circle') shape = `<circle r="${r}" fill="#111110" stroke="${u.color}" stroke-width="${r * 0.14}"/>`;
    else if (u.shape === 'diamond') shape = `<path d="M0 ${-r * 1.2} L${r * 1.2} 0 L0 ${r * 1.2} L${-r * 1.2} 0 Z" fill="${u.color}"/>`;
    else if (u.shape === 'triangle') shape = `<path d="M0 ${-r * 1.15} L${r * 1.1} ${r * 0.85} L${-r * 1.1} ${r * 0.85} Z" fill="#111110" stroke="${u.color}" stroke-width="${r * 0.14}"/>`;
    else shape = `<rect x="${-r}" y="${-r}" width="${r * 2}" height="${r * 2}" fill="#111110" stroke="${u.color}" stroke-width="${r * 0.14}"/>`;
    const ink = u.shape === 'diamond' ? '#111110' : u.color;
    const fs = u.code.length > 1 ? r * 0.85 : r * 1.05;
    const dy = u.shape === 'triangle' ? r * 0.55 : fs * 0.36;
    return shape + `<text y="${dy}" text-anchor="middle" font-family="Bahnschrift, 'Arial Narrow', sans-serif" font-weight="700" font-size="${fs}" fill="${ink}">${u.code}</text>`;
  }

  function utilSVG(k, px) {
    return `<svg viewBox="-14 -14 28 28" width="${px}" height="${px}" aria-hidden="true">${utilBody(k, 10)}</svg>`;
  }

  return { emblemBody, emblemSVG, opIcon, code, hue, UTIL, utilByKey, utilBody, utilSVG, esc };
})();
