// The board: an SVG layer over a floor's blueprint. Used for drawing strats
// (operator tokens, paths, utility, text) and for placing callout labels.
// Positions are stored as fractions of the image (0..1), so boards stay
// put if you swap a blueprint for a sharper copy of the same floor.
window.Board = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 1000;
  const COLORS = ['#d9c34a', '#e8742a', '#3d8fd6', '#ebe6dc', '#c8553d', '#7fb069'];
  const tool = { name: 'select', util: 'breach', color: COLORS[0], op: null };
  let active = null;

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.append(n);
    return n;
  }
  function hel(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /**
   * host:   element to fill
   * o.image       data URL of the blueprint, or null for a blank grid
   * o.ratio       height / width of the stage
   * o.layer       array of items being edited (mutated in place)
   * o.ghosts      items from other phases, drawn faded (optional)
   * o.callouts    callout items drawn as a read-only overlay (optional)
   * o.mode        'strat' or 'callouts'
   * o.lineup      operators available as tokens (strat mode)
   * o.ask         async (title, value) => string|null, for text entry
   * o.onChange    called after every edit
   * o.extraTools  elements appended to the right end of the toolbar
   */
  function mount(host, o) {
    const H = Math.round(W * (o.ratio || 0.625));
    let sel = -1;
    let drag = null;

    const wrap = hel('div', 'board');
    const bar = hel('div', 'board-bar');
    const stageBox = hel('div', 'board-stage');
    wrap.append(bar, stageBox);
    host.replaceChildren(wrap);

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'board-svg', tabindex: '0' }, stageBox);
    const defs = el('defs', null, svg);
    COLORS.forEach((c, i) => {
      const m = el('marker', { id: 'ah' + i, viewBox: '0 0 10 10', refX: '7', refY: '5', markerWidth: '4', markerHeight: '4', orient: 'auto-start-reverse' }, defs);
      el('path', { d: 'M0 0 L10 5 L0 10 z', fill: c }, m);
    });
    const pattern = el('pattern', { id: 'grid', width: '40', height: '40', patternUnits: 'userSpaceOnUse' }, defs);
    el('path', { d: 'M40 0 H0 V40', fill: 'none', stroke: '#24231f', 'stroke-width': '1' }, pattern);

    const bg = el('g', null, svg);
    const ghostG = el('g', { opacity: '0.22', 'pointer-events': 'none' }, svg);
    const calloutG = el('g', { 'pointer-events': o.mode === 'callouts' ? null : 'none' }, svg);
    const itemG = el('g', null, svg);
    const draftG = el('g', { 'pointer-events': 'none' }, svg);

    if (o.image) {
      el('image', { href: o.image, x: 0, y: 0, width: W, height: H, preserveAspectRatio: 'none' }, bg);
    } else {
      el('rect', { x: 0, y: 0, width: W, height: H, fill: '#141412' }, bg);
      el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#grid)' }, bg);
    }

    /* ---------- drawing ---------- */

    const P = it => [it.x * W, it.y * H];
    const colorIdx = c => Math.max(0, COLORS.indexOf(c));

    function drawItem(it, parent, idx) {
      const g = el('g', { class: 'bi' + (idx === sel ? ' sel' : ''), 'data-i': idx }, parent);
      if (it.t === 'path') {
        const d = it.pts.map((p, i) => (i ? 'L' : 'M') + (p[0] * W).toFixed(1) + ' ' + (p[1] * H).toFixed(1)).join(' ');
        el('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': 18, 'stroke-linecap': 'round' }, g);
        el('path', {
          d, fill: 'none', stroke: it.c || COLORS[0], 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
          'stroke-dasharray': it.dash ? '10 8' : null, 'marker-end': `url(#ah${colorIdx(it.c)})`
        }, g);
      } else if (it.t === 'op') {
        const op = o.findOp ? o.findOp(it.op) : null;
        const [x, y] = P(it);
        const t = el('g', { transform: `translate(${x - 21} ${y - 21}) scale(1.05)` }, g);
        const img = op && op.img && Store.cachedBlob(op.img);
        if (img) {
          el('rect', { x: 0, y: 0, width: 40, height: 40, fill: '#111110', stroke: op.side === 'def' ? '#3d8fd6' : '#e8742a', 'stroke-width': 2 }, t);
          el('image', { href: img, x: 2, y: 2, width: 36, height: 36 }, t);
        } else {
          t.innerHTML = Icons.emblemBody(op ? op.name : '?', op ? op.side : 'atk');
        }
      } else if (it.t === 'util') {
        const [x, y] = P(it);
        const t = el('g', { transform: `translate(${x} ${y})` }, g);
        t.innerHTML = Icons.utilBody(it.k, 14);
      } else if (it.t === 'text' || it.t === 'callout') {
        const [x, y] = P(it);
        const callout = it.t === 'callout';
        const txt = el('text', {
          x, y, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
          'font-family': callout ? 'Bahnschrift, "Arial Narrow", sans-serif' : 'Segoe UI, sans-serif',
          'font-size': callout ? 15 : 19, 'font-weight': callout ? 600 : 600,
          'letter-spacing': callout ? 1.2 : 0,
          fill: callout ? '#ebe6dc' : (it.c || '#ebe6dc'),
          stroke: '#111110', 'stroke-width': 4, 'paint-order': 'stroke', 'stroke-linejoin': 'round'
        }, g);
        txt.textContent = callout ? it.text.toUpperCase() : it.text;
      }
      return g;
    }

    function render() {
      ghostG.replaceChildren();
      calloutG.replaceChildren();
      itemG.replaceChildren();
      (o.ghosts || []).forEach(it => drawItem(it, ghostG, -1));
      if (o.mode !== 'callouts' && o.showCallouts !== false) (o.callouts || []).forEach(it => drawItem(it, calloutG, -1));
      o.layer.forEach((it, i) => drawItem(it, itemG, i));
      paintBar();
    }

    /* ---------- toolbar ---------- */

    function btn(label, title, on, onclick, extraCls) {
      const b = hel('button', 'bt' + (on ? ' on' : '') + (extraCls ? ' ' + extraCls : ''));
      if (typeof label === 'string') b.textContent = label; else b.append(label);
      b.title = title; b.type = 'button';
      b.addEventListener('click', onclick);
      return b;
    }
    function svgSpan(markup) { const s = hel('span', 'bt-ico'); s.innerHTML = markup; return s; }

    function setTool(name, extra) {
      tool.name = name;
      if (extra) Object.assign(tool, extra);
      sel = -1;
      svg.dataset.tool = name;
      render();
    }

    function paintBar() {
      const groups = [];
      const tools = hel('div', 'bt-group');
      tools.append(...[
        btn('Move', 'Select and move (V). Delete removes the selected item.', tool.name === 'select', () => setTool('select')),
        o.mode === 'callouts'
          ? btn('Callout', 'Click the blueprint to place a callout (T)', tool.name === 'text', () => setTool('text'))
          : btn('Path', 'Drag to draw a route or arrow (P)', tool.name === 'path', () => setTool('path')),
        o.mode === 'callouts' ? null : btn('Text', 'Click to place a note (T)', tool.name === 'text', () => setTool('text')),
        btn('Erase', 'Click an item to remove it (E)', tool.name === 'erase', () => setTool('erase'))].filter(Boolean));
      groups.push(tools);

      if (o.mode !== 'callouts') {
        if (o.lineup && o.lineup.length) {
          const ops = hel('div', 'bt-group');
          ops.append(hel('span', 'bt-lbl', 'Ops'));
          o.lineup.forEach(op => ops.append(btn(Icons.opIcon(op, 24), 'Place ' + op.name, tool.name === 'op' && tool.op === op.id, () => setTool('op', { op: op.id }), 'icon')));
          groups.push(ops);
        }
        const utils = hel('div', 'bt-group');
        utils.append(hel('span', 'bt-lbl', 'Util'));
        Icons.UTIL.forEach(u => utils.append(btn(svgSpan(Icons.utilSVG(u.k, 22)), 'Place: ' + u.label, tool.name === 'util' && tool.util === u.k, () => setTool('util', { util: u.k }), 'icon')));
        groups.push(utils);

        const cols = hel('div', 'bt-group');
        COLORS.forEach(c => {
          const b = btn('', 'Colour for paths and text', tool.color === c, () => { tool.color = c; paintBar(); }, 'swatch');
          b.style.setProperty('--sw', c);
          cols.append(b);
        });
        cols.append(btn('Dash', 'Dashed path (for rotates or second options)', !!tool.dash, () => { tool.dash = !tool.dash; paintBar(); }));
        groups.push(cols);
      }
      const spacer = hel('div', 'bt-spacer');
      bar.replaceChildren(...groups, spacer, ...(o.extraTools || []));
    }

    /* ---------- pointer handling ---------- */

    function pt(e) {
      const p = svg.createSVGPoint();
      p.x = e.clientX; p.y = e.clientY;
      const r = p.matrixTransform(svg.getScreenCTM().inverse());
      return [Math.min(1, Math.max(0, r.x / W)), Math.min(1, Math.max(0, r.y / H))];
    }
    function hitIndex(e) {
      const g = e.target.closest && e.target.closest('g.bi');
      if (!g || !itemG.contains(g)) return -1;
      return Number(g.dataset.i);
    }
    const changed = () => { o.onChange && o.onChange(); render(); };

    svg.addEventListener('pointerdown', async e => {
      if (e.button !== 0) return;
      svg.focus({ preventScroll: true });
      const [x, y] = pt(e);
      const hit = hitIndex(e);

      if (tool.name === 'erase') {
        if (hit >= 0) { o.layer.splice(hit, 1); changed(); }
        return;
      }
      if (tool.name === 'select' || (hit >= 0 && tool.name !== 'path')) {
        if (hit < 0) { sel = -1; render(); return; }
        sel = hit;
        const it = o.layer[hit];
        drag = { start: [x, y], orig: JSON.parse(JSON.stringify(it)), moved: false };
        svg.setPointerCapture(e.pointerId);
        render();
        return;
      }
      if (tool.name === 'path') {
        drag = { path: [[x, y]] };
        svg.setPointerCapture(e.pointerId);
        return;
      }
      if (tool.name === 'op' && tool.op) {
        o.layer.push({ t: 'op', op: tool.op, x, y });
        changed();
      } else if (tool.name === 'util') {
        o.layer.push({ t: 'util', k: tool.util, x, y });
        changed();
      } else if (tool.name === 'text') {
        const text = await o.ask(o.mode === 'callouts' ? 'Callout name' : 'Note', '');
        if (text && text.trim()) {
          o.layer.push(o.mode === 'callouts' ? { t: 'callout', text: text.trim(), x, y } : { t: 'text', text: text.trim(), x, y, c: tool.color });
          changed();
        }
      }
    });

    svg.addEventListener('pointermove', e => {
      if (!drag) return;
      const [x, y] = pt(e);
      if (drag.path) {
        const last = drag.path[drag.path.length - 1];
        if (Math.hypot((x - last[0]) * W, (y - last[1]) * H) > 6) drag.path.push([x, y]);
        draftG.replaceChildren();
        const d = drag.path.map((p, i) => (i ? 'L' : 'M') + p[0] * W + ' ' + p[1] * H).join(' ') + ` L${x * W} ${y * H}`;
        el('path', { d, fill: 'none', stroke: tool.color, 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-dasharray': tool.dash ? '10 8' : null, opacity: 0.8 }, draftG);
        return;
      }
      const dx = x - drag.start[0], dy = y - drag.start[1];
      if (!drag.moved && Math.hypot(dx * W, dy * H) < 3) return;
      drag.moved = true;
      const it = o.layer[sel];
      if (!it) return;
      if (it.t === 'path') it.pts = drag.orig.pts.map(p => [p[0] + dx, p[1] + dy]);
      else { it.x = drag.orig.x + dx; it.y = drag.orig.y + dy; }
      render();
    });

    const end = e => {
      if (!drag) return;
      if (drag.path) {
        const [x, y] = pt(e);
        drag.path.push([x, y]);
        draftG.replaceChildren();
        const len = drag.path.reduce((s, p, i) => i ? s + Math.hypot((p[0] - drag.path[i - 1][0]) * W, (p[1] - drag.path[i - 1][1]) * H) : 0, 0);
        if (len > 12) {
          o.layer.push({ t: 'path', pts: simplify(drag.path).map(p => [+p[0].toFixed(4), +p[1].toFixed(4)]), c: tool.color, dash: tool.dash || undefined });
          drag = null;
          changed();
          return;
        }
      } else if (drag.moved) {
        drag = null;
        o.onChange && o.onChange();
        render();
        return;
      }
      drag = null;
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', () => { drag = null; draftG.replaceChildren(); });

    function removeSelected() {
      if (sel < 0 || !o.layer[sel]) return false;
      o.layer.splice(sel, 1);
      sel = -1;
      changed();
      return true;
    }

    // Ramer–Douglas–Peucker, so a hand-drawn path stores a handful of points.
    function simplify(pts) {
      const tol = 2.5;
      const dist = (p, a, b) => {
        const ax = a[0] * W, ay = a[1] * H, bx = b[0] * W, by = b[1] * H, px = p[0] * W, py = p[1] * H;
        const L = Math.hypot(bx - ax, by - ay) || 1;
        return Math.abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax) / L;
      };
      const rec = (a, b) => {
        let max = 0, idx = -1;
        for (let i = a + 1; i < b; i++) { const d = dist(pts[i], pts[a], pts[b]); if (d > max) { max = d; idx = i; } }
        return max > tol ? [...rec(a, idx).slice(0, -1), ...rec(idx, b)] : [pts[a], pts[b]];
      };
      return pts.length < 3 ? pts : rec(0, pts.length - 1);
    }

    // Render the stage (blueprint + current items + callouts) to a PNG data URL.
    async function toPNG() {
      const clone = svg.cloneNode(true);
      clone.setAttribute('xmlns', NS);
      clone.setAttribute('width', W * 2);
      clone.setAttribute('height', H * 2);
      clone.querySelectorAll('.sel').forEach(n => n.classList.remove('sel'));
      const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
      const c = document.createElement('canvas');
      c.width = W * 2; c.height = H * 2;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#111110';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
      return c.toDataURL('image/png');
    }

    svg.dataset.tool = tool.name;
    render();
    const handle = {
      render, removeSelected, toPNG,
      key(e) {
        const k = e.key.toLowerCase();
        if (k === 'delete' || k === 'backspace') return removeSelected();
        if (k === 'v') { setTool('select'); return true; }
        if (k === 'e') { setTool('erase'); return true; }
        if (k === 't') { setTool('text'); return true; }
        if (k === 'p' && o.mode !== 'callouts') { setTool('path'); return true; }
        if (k === 'escape') { sel = -1; setTool('select'); return true; }
        return false;
      },
      destroy() { if (active === handle) active = null; }
    };
    active = handle;
    return handle;
  }

  return { mount, get active() { return active; }, tool };
})();
