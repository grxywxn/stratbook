// Original artwork generated in code: map banners, weapon silhouettes and
// gadget glyphs. Nothing here is taken from the game.
window.Art = (() => {
  function hash(s) {
    let h = 2166136261;
    for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed || 1;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const svgUrl = svg => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

  function mapColor(name) {
    if (window.MAP_COLORS && MAP_COLORS[name]) return MAP_COLORS[name];
    return `hsl(${hash(name) % 360} 55% 58%)`;
  }

  // Topographic banner: contour lines, a glow in the map's colour, a dot grid
  // and the map's initials set large.
  function banner(name, color, w = 1200, h = 300) {
    color = color || mapColor(name);
    const r = rng(hash(name));
    const lines = [];
    const cx = w * (0.55 + r() * 0.35), cy = h * (0.2 + r() * 0.6);
    for (let k = 0; k < 11; k++) {
      const base = 26 + k * 34;
      const f1 = 1 + r() * 2, f2 = 2 + r() * 3, a1 = 6 + r() * 14, a2 = 3 + r() * 8, ph = r() * 6.28;
      let d = '';
      for (let i = 0; i <= 64; i++) {
        const t = i / 64 * Math.PI * 2;
        const rad = base + Math.sin(t * f1 + ph) * a1 + Math.cos(t * f2 + ph * 2) * a2;
        const x = cx + Math.cos(t) * rad * 1.9, y = cy + Math.sin(t) * rad * 0.9;
        d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
      }
      lines.push(`<path d="${d}Z" fill="none" stroke="${color}" stroke-opacity="${(0.55 - k * 0.035).toFixed(2)}" stroke-width="${k % 3 === 0 ? 1.8 : 1}"/>`);
    }
    const initials = name.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
    const id = 'b' + hash(name).toString(36);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">
<defs>
<radialGradient id="${id}g" cx="${(cx / w).toFixed(2)}" cy="${(cy / h).toFixed(2)}" r="0.75"><stop offset="0" stop-color="${color}" stop-opacity="0.8"/><stop offset="0.55" stop-color="${color}" stop-opacity="0.2"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>
<linearGradient id="${id}f" x1="0" x2="1"><stop offset="0" stop-color="#121110" stop-opacity="0.92"/><stop offset="0.45" stop-color="#121110" stop-opacity="0.25"/><stop offset="1" stop-color="#121110" stop-opacity="0"/></linearGradient>
<pattern id="${id}d" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="${color}" fill-opacity="0.35"/></pattern>
<pattern id="${id}s" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="14" fill="${color}"/></pattern>
</defs>
<rect width="${w}" height="${h}" fill="#151412"/>
<rect width="${w}" height="${h}" fill="url(#${id}g)"/>
<rect width="${w}" height="${h}" fill="url(#${id}d)"/>
${lines.join('')}
<text x="${w - 30}" y="${h - 34}" text-anchor="end" font-family="Bahnschrift, 'Arial Narrow', sans-serif" font-weight="700" font-size="${h * 0.78}" fill="none" stroke="${color}" stroke-opacity="0.35" stroke-width="2">${esc(initials)}</text>
<rect x="0" y="${h - 10}" width="${w * 0.22}" height="10" fill="url(#${id}s)" opacity="0.8"/>
<rect width="${w}" height="${h}" fill="url(#${id}f)"/>
</svg>`;
  }

  /* ---------- weapons ---------- */

  // Each weapon type is built from parts: 0 = dark, 1 = mid, 2 = light, 's' = dark line.
  const GUN = {
    ar: [
      [0, 'M4 21 L30 18 L38 18 L38 33 L30 33 L8 36 L4 34 Z'],
      [1, 'M38 14 H100 V29 H38 Z'],
      [2, 'M100 16 H128 V28 H100 Z'],
      [0, 'M128 20 H154 V24 H128 Z'],
      [0, 'M50 29 H59 L54 44 H45 Z'],
      [1, 'M68 29 H79 L77 44 Q74 49 66 47 L70 29 Z'],
      [0, 'M54 8 H78 V14 H54 Z'],
      ['s', 'M59 29 Q62 36 68 33 M104 19 H124 M104 22 H124 M104 25 H124']
    ],
    smg: [
      [0, 'M14 21 H40 V31 H24 L14 34 Z'],
      [1, 'M40 15 H98 V30 H40 Z'],
      [0, 'M98 18 H130 V27 H98 Z'],
      [0, 'M52 30 H61 L56 45 H47 Z'],
      [2, 'M72 30 H81 V52 H72 Z'],
      [0, 'M58 10 H78 V15 H58 Z'],
      ['s', 'M61 30 Q64 37 71 33 M102 20 V25 M108 20 V25 M114 20 V25 M120 20 V25']
    ],
    lmg: [
      [0, 'M2 21 L28 17 L36 17 L36 33 L26 33 L4 36 Z'],
      [1, 'M36 13 H106 V30 H36 Z'],
      [2, 'M106 15 H130 V28 H106 Z'],
      [0, 'M130 20 H158 V24 H130 Z'],
      [2, 'M58 30 H90 V47 H58 Z'],
      [0, 'M42 30 H51 L46 44 H37 Z'],
      [0, 'M62 6 H88 V13 H84 V10 H66 V13 H62 Z'],
      ['s', 'M126 28 L116 51 M128 28 L138 51 M62 35 H86 M62 40 H86']
    ],
    dmr: [
      [0, 'M4 21 L30 18 L38 18 L38 33 L30 33 L8 36 L4 34 Z'],
      [1, 'M38 15 H98 V29 H38 Z'],
      [2, 'M98 17 H128 V27 H98 Z'],
      [0, 'M128 21 H158 V24 H128 Z'],
      [0, 'M50 29 H59 L54 44 H45 Z'],
      [1, 'M68 29 H78 V43 H68 Z'],
      [0, 'M42 3 H94 V11 H42 Z'],
      [2, 'M90 2 H96 V12 H90 Z'],
      [0, 'M52 11 H58 V15 H52 Z M78 11 H84 V15 H78 Z'],
      ['s', 'M59 29 Q62 36 68 33']
    ],
    shotgun: [
      [0, 'M4 23 L32 18 L44 18 L44 33 L34 33 L6 37 Z'],
      [1, 'M44 16 H100 V30 H44 Z'],
      [0, 'M100 17 H156 V23 H100 Z'],
      [1, 'M100 24 H150 V29 H100 Z'],
      [2, 'M104 22 H134 V34 H104 Z'],
      [0, 'M54 30 H63 L58 44 H49 Z'],
      ['s', 'M63 30 Q66 37 73 33 M108 25 V32 M114 25 V32 M120 25 V32 M126 25 V32']
    ],
    shield: [
      [1, 'M52 3 H108 Q116 3 116 11 V45 Q116 53 108 53 H52 Q44 53 44 45 V11 Q44 3 52 3 Z'],
      [0, 'M64 11 H96 V21 H64 Z'],
      [2, 'M66 13 H94 V19 H66 Z'],
      ['s', 'M50 28 H110 M50 38 H110']
    ],
    mp: [
      [2, 'M44 17 H114 V28 H44 Z'],
      [1, 'M48 28 H110 V32 H48 Z'],
      [0, 'M58 32 H72 L68 48 H54 Z'],
      [1, 'M55 46 H68 V55 H55 Z'],
      [0, 'M94 32 H102 V45 H94 Z'],
      [0, 'M114 19 H122 V26 H114 Z'],
      ['s', 'M72 32 Q76 40 86 33 M88 20 V25 M94 20 V25 M100 20 V25']
    ],
    pistol: [
      [2, 'M48 18 H116 V28 H48 Z'],
      [1, 'M52 28 H112 V32 H52 Z'],
      [0, 'M58 32 H76 L71 52 H53 Z'],
      [0, 'M114 20 H120 V26 H114 Z'],
      ['s', 'M76 32 Q80 41 92 33 M90 20 V26 M96 20 V26 M102 20 V26']
    ],
    revolver: [
      [2, 'M82 19 H126 V26 H82 Z'],
      [1, 'M62 15 H84 V32 H62 Z'],
      [0, 'M46 21 H62 V34 H46 Z'],
      [0, 'M46 30 H60 L56 52 Q48 55 41 51 Z'],
      [0, 'M42 15 H50 V22 H42 Z'],
      [0, 'M120 15 H124 V19 H120 Z'],
      ['s', 'M62 20 H84 M62 24 H84 M62 28 H84 M60 34 Q64 42 72 34']
    ],
    launcher: [
      [1, 'M24 18 H126 Q134 18 134 27 Q134 36 126 36 H24 Z'],
      [2, 'M120 16 H134 V38 H120 Z'],
      [0, 'M18 15 H28 V39 H18 Z'],
      [0, 'M80 36 H90 L86 51 H76 Z'],
      [0, 'M58 9 H70 V18 H58 Z'],
      ['s', 'M40 22 V32 M48 22 V32 M100 22 V32']
    ]
  };

  function shade(hex, f) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    const ch = k => Math.max(0, Math.min(255, Math.round(((n >> k) & 255) * f)));
    return `rgb(${ch(16)} ${ch(8)} ${ch(0)})`;
  }

  function weaponSVG(type, color, w = 160, h = 56) {
    const parts = GUN[type] || GUN.ar;
    const tones = [shade(color, 0.42), shade(color, 0.72), color];
    const body = parts.map(([tone, d]) => tone === 's'
      ? `<path d="${d}" fill="none" stroke="#0e0d0c" stroke-opacity="0.55" stroke-width="1.1" stroke-linecap="round"/>`
      : `<path d="${d}" fill="${tones[tone]}" stroke="#0e0d0c" stroke-width="1" stroke-linejoin="round"/>`).join('');
    return `<svg viewBox="0 0 160 56" width="${w}" height="${h}" aria-hidden="true"><g>${body}</g><path d="M38 14.6 H100" stroke="#fff" stroke-opacity="0.25" stroke-width="1"/></svg>`;
  }

  /* ---------- gadgets ---------- */

  const GADGET = {
    'frag-grenade': ['FG', '#d9594a', 'circle'], 'smoke-grenade': ['SM', '#a8a29a', 'circle'],
    'stun-grenade': ['ST', '#e3c23b', 'circle'], 'breach-charge': ['BC', '#e8742a', 'square'],
    'hard-breach-charge': ['HB', '#ff8a3d', 'square'], 'claymore': ['CL', '#d9594a', 'tri'],
    'impact-emp-grenade': ['EMP', '#5fa5e0', 'circle'], 'barbed-wire': ['BW', '#8a9bb0', 'square'],
    'deployable-shield': ['DS', '#6f8fb0', 'square'], 'bulletproof-camera': ['CAM', '#4fb8a5', 'square'],
    'impact-grenade': ['IG', '#d46a9b', 'circle'], 'nitro-cell': ['C4', '#e05a4a', 'square'],
    'proximity-alarm': ['PA', '#9a86e0', 'tri'], 'observation-blocker': ['OB', '#46b06a', 'circle']
  };
  function gadgetSVG(id, name, px) {
    const [code, color, shape] = GADGET[id] || [name.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase(), `hsl(${hash(name) % 360} 50% 60%)`, 'square'];
    const body = shape === 'circle' ? `<circle cx="20" cy="20" r="16" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="2"/>`
      : shape === 'tri' ? `<path d="M20 4 L37 34 H3 Z" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`
      : `<rect x="4" y="4" width="32" height="32" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="2"/>`;
    const fs = code.length > 2 ? 10.5 : 13;
    return `<svg viewBox="0 0 40 40" width="${px}" height="${px}" aria-hidden="true">${body}<text x="20" y="${shape === 'tri' ? 29 : 24.5}" text-anchor="middle" font-family="Bahnschrift, 'Arial Narrow', sans-serif" font-weight="700" font-size="${fs}" fill="${color}">${esc(code)}</text></svg>`;
  }

  return { hash, mapColor, banner, svgUrl, weaponSVG, gadgetSVG };
})();
