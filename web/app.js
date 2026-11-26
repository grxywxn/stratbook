(() => {
'use strict';

/* ================= helpers ================= */

const $ = (s, r = document) => r.querySelector(s);

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  let value;
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'value') value = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : String(kid));
  }
  if (value !== undefined) el.value = value;
  return el;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/ø/g, 'o').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pad = n => String(n).padStart(2, '0');
const clock = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const byName = (a, b) => a.name.localeCompare(b.name);
const typing = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
const pct = (w, n) => n ? Math.round(w / n * 100) : 0;

const STATUSES = [['idea', 'Idea'], ['testing', 'Testing'], ['works', 'Works'], ['retired', 'Retired']];
const PHASES = { atk: ['Prep phase', 'Execute', 'Post-plant'], def: ['Setup', 'Hold', 'Retake / late round'] };
const PHASE_HINT = {
  atk: ['Drone routes, who clears what, where to spawn', 'Breach order, util timing, who swings first', 'Plant spot, where everyone holds, denial'],
  def: ['Reinforcements, rotates, gadget placement', 'Who holds what angle, when to rotate', 'What to do when they plant or take a room']
};
const ROLES = {
  atk: ['Hard breach', 'Breach support', 'Intel', 'Entry / flex', 'Flank watch'],
  def: ['Anchor', 'Anchor support', 'Roamer', 'Intel / denial', 'Flex']
};

/* ================= modal, toast ================= */

function ask(title, value, opts = {}) {
  return new Promise(resolve => {
    const m = $('#modal'), input = $('#modalInput');
    $('#modalTitle').textContent = title;
    $('#modalBody').textContent = opts.body || '';
    $('#modalBody').hidden = !opts.body;
    input.hidden = !!opts.confirm;
    input.value = value || '';
    $('#modalOk').textContent = opts.ok || 'OK';
    $('#modalOk').classList.toggle('danger-btn', !!opts.danger);
    m.hidden = false;
    setTimeout(() => (opts.confirm ? $('#modalOk') : input).focus(), 0);
    if (!opts.confirm) input.select();
    const done = v => {
      m.hidden = true;
      $('#modalForm').onsubmit = null; $('#modalCancel').onclick = null; m.onkeydown = null;
      resolve(v);
    };
    $('#modalForm').onsubmit = e => { e.preventDefault(); done(opts.confirm ? true : input.value); };
    $('#modalCancel').onclick = () => done(opts.confirm ? false : null);
    m.onkeydown = e => { if (e.key === 'Escape') { e.stopPropagation(); done(opts.confirm ? false : null); } };
  });
}
const confirmBox = (title, body, ok, danger) => ask(title, '', { confirm: true, body, ok, danger });

let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4200);
}

function pickImage() {
  return new Promise(resolve => {
    const input = $('#imageFile');
    input.value = '';
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}

function pickImages() {
  return new Promise(resolve => {
    const input = $('#imagesFile');
    input.value = '';
    input.onchange = () => resolve([...input.files]);
    input.click();
  });
}

/* ================= data ================= */

let db;
const ui = { side: 'all', sitesOpen: false, floorsOpen: false, opQuery: '', wide: false, floor: {}, phase: 1, ghosts: true, showCallouts: true };

function makeFloors(mapName) {
  const names = SEED.floors[mapName] || SEED.floors.default;
  return names.map(n => ({ id: slug(n) || uid(), name: n, img: null, ratio: 0.625 }));
}

function seedWeapons() {
  return Object.entries(ARSENAL.weapons).map(([name, type]) => ({ id: slug(name), name, type, attach: '', recoil: '', notes: '', rating: 0, img: null }));
}
function seedGadgets() {
  return ARSENAL.gadgets.map(name => ({ id: slug(name), name, notes: '', when: '' }));
}
function seedLoadout(opName) {
  const l = ARSENAL.loadouts[opName];
  const ids = str => (str || '').split('|').map(x => x.trim()).filter(Boolean).map(slug);
  return l ? { primaries: ids(l[0]), secondaries: ids(l[1]), gadgets: ids(l[2]) } : { primaries: [], secondaries: [], gadgets: [] };
}

function freshDB() {
  return {
    version: 3,
    weapons: seedWeapons(),
    gadgets: seedGadgets(),
    maps: SEED.maps.map(([name, sites]) => ({ id: slug(name), name, sites: [...sites], floors: makeFloors(name), callouts: {} })),
    operators: [
      ...SEED.attackers.map(n => ({ id: slug(n), name: n, side: 'atk', loadout: seedLoadout(n) })),
      ...SEED.defenders.map(n => ({ id: slug(n), name: n, side: 'def', loadout: seedLoadout(n) }))
    ],
    strats: [],
    guides: {}
  };
}

function normalize(d) {
  if (!d || typeof d !== 'object') return freshDB();
  d.version = 3;
  d.maps = Array.isArray(d.maps) ? d.maps : [];
  d.operators = Array.isArray(d.operators) ? d.operators : [];
  if (!Array.isArray(d.weapons)) d.weapons = seedWeapons();
  if (!Array.isArray(d.gadgets)) d.gadgets = seedGadgets();
  for (const o of d.operators) {
    if (!o.loadout) o.loadout = seedLoadout(o.name);
    for (const k of ['primaries', 'secondaries', 'gadgets']) if (!Array.isArray(o.loadout[k])) o.loadout[k] = [];
  }
  for (const g of Object.values(d.guides || {})) {
    g.pick = g.pick || { primary: '', secondary: '', gadget: '' };
    if (g.attach == null) g.attach = [g.primary, g.secondary, g.gadget].filter(Boolean).join(' · ');
  }
  d.strats = Array.isArray(d.strats) ? d.strats : [];
  d.guides = d.guides && typeof d.guides === 'object' ? d.guides : {};
  for (const m of d.maps) {
    m.sites = Array.isArray(m.sites) ? m.sites : [];
    m.floors = Array.isArray(m.floors) && m.floors.length ? m.floors : makeFloors(m.name);
    m.callouts = m.callouts && typeof m.callouts === 'object' ? m.callouts : {};
  }
  for (const s of d.strats) {
    s.lineup = Array.from({ length: 5 }, (_, i) => (s.lineup && s.lineup[i]) || { op: '', role: '' });
    s.phases = Array.from({ length: 3 }, (_, i) => (s.phases && s.phases[i]) || '');
    s.tags = Array.isArray(s.tags) ? s.tags : [];
    s.results = Array.isArray(s.results) ? s.results : [];
    s.board = s.board && typeof s.board === 'object' ? s.board : {};
  }
  return d;
}

const mapById = id => db.maps.find(m => m.id === id);
const opById = id => db.operators.find(o => o.id === id);
const stratById = id => db.strats.find(s => s.id === id);
const guideFor = id => (db.guides[id] = db.guides[id] || {
  comfort: 0, role: '', attach: '', pick: { primary: '', secondary: '', gadget: '' },
  playstyle: '', tips: '', counters: '', maps: [], notes: ''
});
const weaponById = id => db.weapons.find(w => w.id === id);
const gadgetById = id => db.gadgets.find(g => g.id === id);
const carriers = (id, kind) => db.operators.filter(o => (kind === 'gadget' ? o.loadout.gadgets : [...o.loadout.primaries, ...o.loadout.secondaries]).includes(id)).sort(byName);
const typeInfo = t => ARSENAL.types[t] || { label: t || 'Other', color: '#a39d91' };
const mapColor = m => m.color || Art.mapColor(m.name);
const bannerCache = new Map();
function bannerUrl(m) {
  const own = m.banner && Store.cachedBlob(m.banner);
  if (own) return `url("${own}")`;
  const key = m.name + mapColor(m);
  if (!bannerCache.has(key)) bannerCache.set(key, Art.svgUrl(Art.banner(m.name, mapColor(m))));
  return bannerCache.get(key);
}
const guideFilled = id => {
  const g = db.guides[id];
  return g && (g.playstyle || g.tips || g.notes || g.role || g.primary || g.comfort > 0);
};
const record = s => {
  const w = s.results.filter(r => r.w).length;
  return { w, l: s.results.length - w, n: s.results.length };
};
const boardLayer = (s, floorId, phase) => {
  const f = (s.board[floorId] = s.board[floorId] || [[], [], []]);
  while (f.length < 3) f.push([]);
  return f[phase];
};
const boardCount = s => Object.values(s.board).reduce((n, f) => n + f.reduce((m, l) => m + l.length, 0), 0);

/* ================= storage ================= */

let saveTimer = null, dirty = false;

function setSaveState(text, bad) {
  const el = $('#saveState');
  el.textContent = text;
  el.classList.toggle('err', !!bad);
}

async function load() {
  let d = null;
  try { d = await Store.load(); } catch (e) { d = null; setSaveState('Could not read data', true); }
  db = normalize(d);
  // Custom operator pictures are tiny; load them up front so icons draw instantly.
  await Promise.all([...db.operators, ...db.weapons, ...db.maps.map(m => ({ img: m.banner }))].filter(o => o.img).map(o => Store.getBlob(o.img).catch(() => null)));
  if (!d) save(true); else setSaveState('Saved');
}

function save(now) {
  dirty = true;
  setSaveState('Saving…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, now ? 0 : 400);
}

async function flush() {
  clearTimeout(saveTimer);
  if (!dirty) return;
  dirty = false;
  try {
    await Store.save(JSON.stringify(db));
    setSaveState('Saved ' + clock());
  } catch (e) {
    dirty = true;
    setSaveState('Not saved, retrying', true);
    saveTimer = setTimeout(flush, 3000);
  }
}

function touch(s) { s.updated = Date.now(); save(); }

Store.onClose(flush);
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

/* ================= routing ================= */

let board = null;
function go(hash) { if (location.hash !== hash) location.hash = hash; else route(); }

function route() {
  if (board) { board.destroy(); board = null; }
  const [view, a, b, c, d] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const tab = view === 'pictures' ? (a === 'weapons' ? 'arsenal' : 'ops') : ['ops', 'stats', 'arsenal'].includes(view) ? view : 'maps';
  document.querySelector('.main').style.removeProperty('--map');
  document.querySelectorAll('#tabs a').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
  if (view === 'pictures') {
    if (a === 'weapons') renderArsenalRail(); else renderOpsRail();
    renderPictures(a === 'weapons' ? 'weapons' : 'ops');
  } else if (tab === 'ops') {
    const op = opById(a) || [...db.operators].sort(byName)[0];
    renderOpsRail(op && op.id);
    renderOp(op);
  } else if (tab === 'arsenal') {
    renderArsenalRail(a, b);
    if (a === 'gadget') renderGadget(gadgetById(b) || db.gadgets[0]);
    else renderWeapon(weaponById(b) || weaponById(a) || db.weapons[0]);
  } else if (tab === 'stats') {
    renderStatsRail(a);
    renderStats(mapById(a));
  } else {
    const map = mapById(a);
    renderMapsRail(map && map.id);
    if (!map) { renderMapsHome(); return; }
    document.querySelector('.main').style.setProperty('--map', mapColor(map));
    if (b === 'blueprints') renderBlueprints(map, c);
    else renderMap(map, b === 's' ? c : null, d === 'board');
  }
}

/* ================= rail ================= */

function railKeep(fn) {
  const rail = $('#rail');
  const top = rail.scrollTop;
  rail.replaceChildren(...fn().flat(Infinity).filter(Boolean));
  rail.scrollTop = top;
}

function renderMapsRail(activeId) {
  railKeep(() => [
    h('a', { class: 'rail-item' + (!activeId ? ' on' : ''), href: '#/maps' },
      h('span', { class: 'num', text: '--' }), h('span', { class: 'name', text: 'All maps' }), h('span', { class: 'count', text: '' })),
    h('div', { class: 'rail-label' }, h('span', { text: 'Maps' }), h('span', { text: String(db.maps.length) })),
    db.maps.map((m, i) => {
      const n = db.strats.filter(s => s.mapId === m.id).length;
      const bp = m.floors.some(f => f.img);
      return h('a', { class: 'rail-item map' + (m.id === activeId ? ' on' : ''), href: '#/maps/' + m.id, style: '--map:' + mapColor(m) },
        h('span', { class: 'num', text: pad(i + 1) }),
        h('span', { class: 'name' }, m.name, bp ? h('i', { class: 'bp-dot', title: 'Has blueprints' }) : null),
        h('span', { class: 'count' + (n ? ' has' : ''), text: n ? String(n) : '·' }));
    }),
    h('div', { class: 'rail-label' }, h('button', { class: 'link', text: '+ Add map', onclick: addMap }))
  ]);
}

function renderOpsRail(activeId) {
  const q = ui.opQuery.trim().toLowerCase();
  const list = side => db.operators.filter(o => o.side === side && (!q || o.name.toLowerCase().includes(q))).sort(byName);
  const item = o => {
    const g = db.guides[o.id];
    const c = g ? g.comfort : 0;
    return h('a', { class: 'rail-item op' + (o.id === activeId ? ' on' : '') + (guideFilled(o.id) ? '' : ' dim'), href: '#/ops/' + o.id },
      Icons.opIcon(o, 20),
      h('span', { class: 'name', text: o.name }),
      c ? h('span', { class: 'pips', title: 'Comfort ' + c + '/5' }, [1, 2, 3, 4, 5].map(k => h('i', { class: 'pip' + (k <= c ? ' on' : '') }))) : h('span', { class: 'count', text: '' }));
  };
  const atk = list('atk'), def = list('def');
  railKeep(() => [
    h('input', {
      class: 'in rail-search', type: 'text', placeholder: 'Filter operators', value: ui.opQuery, id: 'opFilter',
      oninput: e => {
        ui.opQuery = e.target.value; renderOpsRail(activeId);
        const f = $('#opFilter'); f.focus(); f.setSelectionRange(f.value.length, f.value.length);
      }
    }),
    h('div', { class: 'rail-label' }, h('span', { text: 'Attack' }), h('span', { text: String(atk.length) })),
    atk.map(item),
    h('div', { class: 'rail-label' }, h('span', { text: 'Defense' }), h('span', { text: String(def.length) })),
    def.map(item),
    h('div', { class: 'rail-label col' },
      h('button', { class: 'link', text: '+ Add operator', onclick: addOperator }),
      h('a', { class: 'link strong', href: '#/pictures/ops', text: '+ Add operator pictures' }),
      h('button', { class: 'link', text: '+ Import icon pack', title: 'Pick many images at once; each is matched to an operator by its file name', onclick: importIconPack }))
  ]);
}

function renderStatsRail(activeId) {
  const withRounds = db.maps.filter(m => db.strats.some(s => s.mapId === m.id && s.results.length));
  railKeep(() => [
    h('a', { class: 'rail-item' + (!activeId ? ' on' : ''), href: '#/stats' },
      h('span', { class: 'num', text: '--' }), h('span', { class: 'name', text: 'All maps' }), h('span', { class: 'count', text: '' })),
    h('div', { class: 'rail-label' }, h('span', { text: 'Maps with rounds logged' }), h('span', { text: String(withRounds.length) })),
    withRounds.map((m, i) => {
      const rs = db.strats.filter(s => s.mapId === m.id).flatMap(s => s.results);
      const w = rs.filter(r => r.w).length;
      return h('a', { class: 'rail-item' + (m.id === activeId ? ' on' : ''), href: '#/stats/' + m.id },
        h('span', { class: 'num', text: pad(i + 1) }), h('span', { class: 'name', text: m.name }),
        h('span', { class: 'count has', text: pct(w, rs.length) + '%' }));
    }),
    withRounds.length ? null : h('p', { class: 'rail-note', text: 'Log wins and losses on your strats and your numbers show up here.' })
  ]);
}

async function addMap() {
  const name = await ask('New map', '');
  if (!name || !name.trim()) return;
  let id = slug(name) || uid();
  if (mapById(id)) id += '-' + uid().slice(0, 4);
  db.maps.push({ id, name: name.trim(), sites: [], floors: makeFloors(''), callouts: {} });
  db.maps.sort(byName);
  save();
  ui.sitesOpen = true;
  go('#/maps/' + id);
}

async function addOperator() {
  const name = await ask('New operator', '');
  if (!name || !name.trim()) return;
  const atk = await confirmBox('Which side is ' + name.trim() + ' on?', 'You can change this later on their page.', 'Attacker');
  let id = slug(name) || uid();
  if (opById(id)) id += '-' + uid().slice(0, 4);
  db.operators.push({ id, name: name.trim(), side: atk ? 'atk' : 'def' });
  save();
  go('#/ops/' + id);
}

/* ================= map: strats ================= */

let current = { map: null, strat: null, boardTab: false };

function mapHead(map, view) {
  const strats = db.strats.filter(s => s.mapId === map.id);
  const atk = strats.filter(s => s.side === 'atk').length;
  const idx = db.maps.indexOf(map) + 1;
  const viewSeg = h('div', { class: 'seg' },
    h('button', { class: view === 'strats' ? 'on' : '', text: 'Strats', onclick: () => go('#/maps/' + map.id) }),
    h('button', { class: view === 'blueprints' ? 'on' : '', text: 'Blueprints', onclick: () => go('#/maps/' + map.id + '/blueprints') }));
  const tools = view === 'strats'
    ? [
        h('div', { class: 'seg' }, [['all', 'All'], ['atk', 'Attack'], ['def', 'Defense']].map(([k, label]) =>
          h('button', { class: (ui.side === k ? 'on ' : '') + k, text: label, onclick: () => { ui.side = k; route(); } }))),
        h('button', { class: 'btn', text: ui.sitesOpen ? 'Done' : 'Edit sites', onclick: () => { ui.sitesOpen = !ui.sitesOpen; route(); } }),
        h('button', { class: 'btn primary', onclick: () => newStrat(map, '') }, 'New strat', h('kbd', { text: 'N' }))
      ]
    : [h('button', { class: 'btn', text: ui.floorsOpen ? 'Done' : 'Edit floors', onclick: () => { ui.floorsOpen = !ui.floorsOpen; route(); } })];
  return h('header', { class: 'head banner', style: `background-image: linear-gradient(90deg, #121110f0 0%, #121110b0 40%, #12111020 100%), ${bannerUrl(map)}` },
    h('div', { class: 'head-num', text: pad(idx) }),
    h('div', {},
      h('h1', { class: 'head-title', text: map.name }),
      h('div', { class: 'head-sub' },
        h('b', { text: map.sites.length + (map.sites.length === 1 ? ' site' : ' sites') }), ' · ',
        h('b', { text: String(strats.length) }), strats.length === 1 ? ' strat' : ' strats',
        strats.length ? ` (${atk} attack, ${strats.length - atk} defense)` : '', ' · ',
        h('b', { text: String(map.floors.filter(f => f.img).length) }), ' of ', String(map.floors.length), ' blueprints')),
    h('div', { class: 'head-tools' }, viewSeg, h('span', { class: 'tool-gap' }), tools));
}

function renderMap(map, stratId, boardTab) {
  const main = $('#main');
  if (!map) {
    main.replaceChildren(h('div', { class: 'empty' }, h('h3', { text: 'No maps' }), h('p', { text: 'Add a map from the list on the left.' })));
    return;
  }
  current.map = map;
  current.strat = stratById(stratId);
  if (current.strat && current.strat.mapId !== map.id) current.strat = null;
  current.boardTab = !!(current.strat && boardTab);

  const list = h('section', { class: 'list', id: 'stratList' });
  const detail = h('section', { class: 'detail', id: 'detail' });
  main.replaceChildren(mapHead(map, 'strats'), h('div', { class: 'body' + (ui.wide && current.boardTab ? ' wide' : '') }, list, detail));
  renderStratList();
  renderDetail();
}

function renderStratList() {
  const map = current.map;
  const list = $('#stratList');
  if (!list) return;
  const top = list.scrollTop;
  const strats = db.strats.filter(s => s.mapId === map.id && (ui.side === 'all' || s.side === ui.side));
  const groups = map.sites.map(site => ({ site, items: strats.filter(s => s.site === site) }));
  const loose = strats.filter(s => !map.sites.includes(s.site));
  if (loose.length || !map.sites.length) groups.push({ site: '', items: loose });

  const kids = [];
  if (ui.sitesOpen) kids.push(linesPanel(map.sites, 'Bomb sites, one per line, in the order you want them listed', '2F Gym / Bedroom\n1F Bar / Stock', next => {
    if (next.length === map.sites.length) {
      map.sites.forEach((old, i) => {
        if (old !== next[i]) db.strats.forEach(s => { if (s.mapId === map.id && s.site === old) s.site = next[i]; });
      });
    }
    map.sites = next;
    ui.sitesOpen = false;
  }, () => deleteMap(map)));
  for (const g of groups) {
    kids.push(h('div', { class: 'group-head' },
      h('span', { text: g.site || (map.sites.length ? 'Other / no site' : 'Strats') }),
      h('button', { class: 'add', text: '+ Add', onclick: () => newStrat(map, g.site) })));
    for (const s of g.items.sort((a, b) => (b.updated || 0) - (a.updated || 0))) kids.push(stratRow(s));
  }
  if (!map.sites.length && !ui.sitesOpen) {
    kids.push(h('div', { class: 'empty small' },
      h('p', { text: 'No bomb sites set for this map yet. Add them so strats group by site.' }),
      h('button', { class: 'btn', text: 'Add sites', onclick: () => { ui.sitesOpen = true; renderStratList(); } })));
  }
  list.replaceChildren(...kids);
  list.scrollTop = top;
}

function stratRow(s) {
  const r = record(s);
  const ops = s.lineup.map(l => l.op && opById(l.op)).filter(Boolean);
  const status = STATUSES.find(x => x[0] === s.status) || STATUSES[0];
  return h('div', {
    class: 'row ' + s.side + (current.strat && current.strat.id === s.id ? ' on' : ''),
    onclick: () => go('#/maps/' + s.mapId + '/s/' + s.id + (current.boardTab ? '/board' : ''))
  },
    h('div', { class: 'row-title' + (s.title ? '' : ' untitled'), text: s.title || 'Untitled strat' }),
    h('div', { class: 'row-side' },
      h('span', { class: 'rec', text: r.n ? `${r.w}–${r.l}` : '' }),
      h('span', { class: 'status ' + status[0], text: status[1] })),
    h('div', { class: 'row-ops' }, ops.length ? ops.map(o => Icons.opIcon(o, 18)) : h('span', { class: 'row-meta', text: s.side === 'atk' ? 'Attack' : 'Defense' })));
}

function linesPanel(lines, label, placeholder, apply, onDelete, deleteLabel) {
  const ta = h('textarea', { value: lines.join('\n'), spellcheck: 'false', placeholder });
  const del = onDelete ? h('button', { class: 'danger', style: 'margin-left:auto', text: deleteLabel || 'Delete map', onclick: onDelete }) : null;
  return h('div', { class: 'sites-panel' },
    h('span', { class: 'lbl block', text: label }),
    ta,
    h('div', { class: 'row-btns' },
      h('button', { class: 'btn primary', text: 'Save', onclick: () => { apply(ta.value.split('\n').map(x => x.trim()).filter(Boolean)); save(); route(); } }),
      h('button', { class: 'btn', text: 'Cancel', onclick: () => { ui.sitesOpen = false; ui.floorsOpen = false; route(); } }),
      del));
}

async function deleteMap(map) {
  const n = db.strats.filter(s => s.mapId === map.id).length;
  const ok = await confirmBox('Delete ' + map.name + '?', n ? `This also deletes its ${n} strat${n > 1 ? 's' : ''} and blueprints.` : 'This also deletes its blueprints.', 'Delete', true);
  if (!ok) return;
  for (const f of map.floors) if (f.img) Store.delBlob(f.img).catch(() => {});
  db.maps = db.maps.filter(m => m !== map);
  db.strats = db.strats.filter(s => s.mapId !== map.id);
  ui.sitesOpen = false;
  save();
  go('#/maps');
}

function newStrat(map, site) {
  const side = ui.side === 'def' ? 'def' : 'atk';
  const s = {
    id: uid(), mapId: map.id, side, site: site || '', title: '', status: 'idea',
    lineup: Array.from({ length: 5 }, () => ({ op: '', role: '' })),
    phases: ['', '', ''], notes: '', tags: [], results: [], board: {},
    created: Date.now(), updated: Date.now()
  };
  db.strats.push(s);
  save();
  go('#/maps/' + map.id + '/s/' + s.id);
  setTimeout(() => { const t = $('.ed-title'); if (t) t.focus(); }, 60);
}

function renderDetail() {
  const detail = $('#detail');
  const s = current.strat;
  if (!s) {
    const n = db.strats.filter(x => x.mapId === current.map.id).length;
    detail.replaceChildren(h('div', { class: 'empty' },
      h('h3', { text: n ? 'Pick a strat' : 'No strats yet' }),
      h('p', { text: n
        ? 'Choose one from the list, or start a new one.'
        : 'Write a plan for a site: who plays what, each person\'s job, and what happens in prep, the execute and after the plant. Then draw it on the blueprint and log wins and losses as you run it.' }),
      h('button', { class: 'btn primary', onclick: () => newStrat(current.map, '') }, 'New strat', h('kbd', { text: 'N' }))));
    return;
  }
  const top = detail.scrollTop;
  detail.replaceChildren(stratEditor(s));
  detail.scrollTop = top;
  if (current.boardTab) mountStratBoard(s);
}

function stratEditor(s) {
  const map = current.map;
  const refreshRow = () => renderStratList();
  const base = '#/maps/' + map.id + '/s/' + s.id;

  const title = h('input', {
    class: 'ed-title', type: 'text', placeholder: 'Name this strat', value: s.title, spellcheck: 'false',
    oninput: e => { s.title = e.target.value; touch(s); refreshRow(); }
  });

  const sideSeg = h('div', { class: 'seg' }, [['atk', 'Attack'], ['def', 'Defense']].map(([k, label]) =>
    h('button', { class: (s.side === k ? 'on ' : '') + k, text: label, onclick: () => {
      if (s.side === k) return;
      s.side = k; touch(s);
      if (ui.side !== 'all') ui.side = k;
      route();
    } })));

  const siteOpts = [...map.sites];
  if (s.site && !siteOpts.includes(s.site)) siteOpts.push(s.site);
  const site = h('select', { value: s.site, onchange: e => { s.site = e.target.value; touch(s); refreshRow(); } },
    h('option', { value: '', text: 'No site' }), siteOpts.map(x => h('option', { value: x, text: x })));

  const status = h('select', { value: s.status, onchange: e => { s.status = e.target.value; touch(s); refreshRow(); } },
    STATUSES.map(([v, t]) => h('option', { value: v, text: t })));

  const more = h('div', { class: 'more' },
    h('button', { class: 'link', text: 'Duplicate', onclick: () => duplicateStrat(s) }),
    h('button', { class: 'danger', text: 'Delete', onclick: async () => {
      if (!(await confirmBox('Delete this strat?', s.title || 'Untitled strat', 'Delete', true))) return;
      db.strats = db.strats.filter(x => x !== s); save();
      go('#/maps/' + map.id);
    } }));

  const tabs = h('div', { class: 'subtabs' },
    h('a', { href: base, class: current.boardTab ? '' : 'on' }, 'Plan'),
    h('a', { href: base + '/board', class: current.boardTab ? 'on' : '' }, 'Board', h('span', { class: 'subtab-n', text: boardCount(s) ? String(boardCount(s)) : '' })));

  const head = h('div', { class: 'ed-head' },
    title,
    h('div', { class: 'ed-meta' },
      sideSeg,
      h('label', { class: 'field-inline' }, h('span', { class: 'lbl', text: 'Site' }), site),
      h('label', { class: 'field-inline' }, h('span', { class: 'lbl', text: 'Status' }), status),
      more),
    tabs);

  if (current.boardTab) return h('div', { class: 'ed ed-board' }, head, h('div', { id: 'boardHost' }));

  const sideOps = db.operators.filter(o => o.side === s.side).sort(byName);
  const lineup = h('div', { class: 'lineup' }, s.lineup.map((slot, i) => {
    const opts = [...sideOps];
    const cur = slot.op && opById(slot.op);
    if (cur && cur.side !== s.side) opts.unshift(cur);
    const icoBox = h('span', { class: 'lineup-ico' }, Icons.opIcon(cur, 30));
    return [
      icoBox,
      h('select', { value: slot.op, onchange: e => {
        slot.op = e.target.value; touch(s); refreshRow();
        icoBox.replaceChildren(Icons.opIcon(opById(slot.op), 30));
      } }, h('option', { value: '', text: 'Operator ' + (i + 1) }), opts.map(o => h('option', { value: o.id, text: o.name }))),
      h('input', { class: 'in', type: 'text', value: slot.role, placeholder: ROLES[s.side][i],
        oninput: e => { slot.role = e.target.value; touch(s); } })
    ];
  }));

  const phases = h('div', { class: 'phases' }, PHASES[s.side].map((label, i) =>
    h('label', { class: 'phase' },
      h('span', { class: 'lbl block', text: label }),
      h('textarea', { class: 'steps', value: s.phases[i], placeholder: PHASE_HINT[s.side][i],
        oninput: e => { s.phases[i] = e.target.value; touch(s); } }))));

  const notes = h('textarea', { class: 'notes', value: s.notes, placeholder: 'Counters, what went wrong, what to try next',
    oninput: e => { s.notes = e.target.value; touch(s); } });

  const tags = h('input', { class: 'in wide-in', type: 'text', value: s.tags.join(', '), placeholder: 'e.g. ranked, scrims, fast, vertical',
    oninput: e => { s.tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean); touch(s); } });

  return h('div', { class: 'ed' },
    head,
    section('Lineup', 'Operator and job for each player', lineup),
    section('Plan', 'One step per line', phases),
    section('Results', 'Log each round you run it', resultsBlock(s)),
    section('Notes', null, notes),
    section('Tags', 'Comma separated', tags));
}

function duplicateStrat(s) {
  const copy = JSON.parse(JSON.stringify(s));
  copy.id = uid();
  copy.title = (s.title || 'Untitled strat') + ' (copy)';
  copy.results = [];
  copy.status = 'idea';
  copy.created = copy.updated = Date.now();
  db.strats.push(copy);
  save();
  go('#/maps/' + s.mapId + '/s/' + copy.id);
}

function section(title, hint, body) {
  return h('div', { class: 'sec' },
    h('div', { class: 'sec-head' }, h('h4', { text: title }), hint ? h('span', { class: 'hint', text: hint }) : null),
    body);
}

function resultsBlock(s) {
  const wrap = h('div', { class: 'results' });
  const paint = () => {
    const r = record(s);
    wrap.replaceChildren(
      h('div', { class: 'rec-big' }, `${r.w}–${r.l}`, h('span', { class: 'pct', text: r.n ? pct(r.w, r.n) + '%' : 'no rounds yet' })),
      h('div', { class: 'wl' },
        h('button', { class: 'w', text: '+ WIN', onclick: () => add(true) }),
        h('button', { class: 'l', text: '+ LOSS', onclick: () => add(false) })),
      h('div', { class: 'ticks', title: 'Last 20 rounds, oldest first' },
        s.results.slice(-20).map(x => h('i', { class: 'tick ' + (x.w ? 'w' : 'l') }))),
      r.n ? h('button', { class: 'undo', text: 'Undo last', onclick: () => { s.results.pop(); touch(s); paint(); renderStratList(); } }) : null);
  };
  const add = w => { s.results.push({ w, t: Date.now() }); touch(s); paint(); renderStratList(); };
  paint();
  return wrap;
}

/* ---------- strat board ---------- */

async function mountStratBoard(s) {
  const map = current.map;
  const host = $('#boardHost');
  if (!host) return;
  const floor = map.floors.find(f => f.id === ui.floor[map.id]) || map.floors.find(f => f.img) || map.floors[0];
  if (!floor) { host.replaceChildren(h('p', { class: 'hint', text: 'This map has no floors. Add some under Blueprints.' })); return; }
  ui.floor[map.id] = floor.id;
  const image = floor.img ? await Store.getBlob(floor.img) : null;
  if ($('#boardHost') !== host) return;

  const layer = boardLayer(s, floor.id, ui.phase);
  const ghosts = ui.ghosts ? [0, 1, 2].filter(p => p !== ui.phase).flatMap(p => boardLayer(s, floor.id, p)) : [];
  const lineup = s.lineup.map(l => opById(l.op)).filter(Boolean);

  const floorsSeg = h('div', { class: 'seg' }, map.floors.map(f => {
    const n = (s.board[f.id] || []).reduce((m, l) => m + l.length, 0);
    return h('button', { class: f.id === floor.id ? 'on' : '', onclick: () => { ui.floor[map.id] = f.id; renderDetail(); } },
      f.name, n ? h('span', { class: 'seg-n', text: String(n) }) : null);
  }));
  const phaseSeg = h('div', { class: 'seg' }, PHASES[s.side].map((p, i) =>
    h('button', { class: ui.phase === i ? 'on' : '', text: p, onclick: () => { ui.phase = i; renderDetail(); } })));
  const toggles = h('div', { class: 'toggles' },
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: ui.ghosts || null, onchange: e => { ui.ghosts = e.target.checked; renderDetail(); } }), 'Other phases'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: ui.showCallouts || null, onchange: e => { ui.showCallouts = e.target.checked; renderDetail(); } }), 'Callouts'));

  const exportBtn = h('button', { class: 'btn', text: 'Export PNG', onclick: async () => {
    const url = await board.toPNG();
    const name = slug(`${map.name}-${s.title || 'strat'}-${floor.name}-${PHASES[s.side][ui.phase]}`) + '.png';
    const where = await Store.exportImage(name, url);
    toast(where ? 'Saved to ' + where : 'Image downloaded');
  } });
  const clearBtn = h('button', { class: 'btn', text: 'Clear', title: 'Remove everything in this phase on this floor', onclick: async () => {
    if (!layer.length) return;
    if (!(await confirmBox('Clear this phase?', `Removes ${layer.length} item${layer.length > 1 ? 's' : ''} from ${floor.name}, ${PHASES[s.side][ui.phase]}.`, 'Clear', true))) return;
    layer.splice(0); touch(s); renderDetail(); renderStratList();
  } });
  const wideBtn = h('button', { class: 'btn', text: ui.wide ? 'Show list' : 'Wide', title: 'Hide the strat list to give the board more room', onclick: () => { ui.wide = !ui.wide; route(); } });

  const stage = h('div', { class: 'board-host' });
  host.replaceChildren(
    h('div', { class: 'board-top' }, floorsSeg, phaseSeg, toggles),
    stage,
    image ? null : h('p', { class: 'board-hint' },
      'No blueprint for ' + floor.name + ' yet, so you are drawing on a grid. ',
      h('a', { href: '#/maps/' + map.id + '/blueprints/' + floor.id, text: 'Import one' }), '.'));

  board = Board.mount(stage, {
    mode: 'strat', image, ratio: floor.ratio || 0.625,
    layer, ghosts, callouts: map.callouts[floor.id] || [], showCallouts: ui.showCallouts,
    lineup, findOp: opById, ask,
    allOps: db.operators.filter(o => o.side === s.side).sort(byName),
    onChange: () => { touch(s); refreshBoardCount(s); },
    extraTools: [wideBtn, clearBtn, exportBtn]
  });
}

function refreshBoardCount(s) {
  const n = $('.subtabs .subtab-n');
  if (n) n.textContent = boardCount(s) ? String(boardCount(s)) : '';
}

/* ================= map: blueprints + callouts ================= */

async function renderBlueprints(map, floorId) {
  const main = $('#main');
  if (!map) return;
  current.map = map; current.strat = null;
  const floor = map.floors.find(f => f.id === floorId) || map.floors.find(f => f.id === ui.floor[map.id]) || map.floors[0];
  if (floor) ui.floor[map.id] = floor.id;

  const body = h('section', { class: 'detail bp' });
  main.replaceChildren(mapHead(map, 'blueprints'), body);

  if (ui.floorsOpen) {
    body.append(linesPanel(map.floors.map(f => f.name), 'Floors, one per line, bottom to top', 'Basement\n1F\n2F\nRoof', names => {
      const old = map.floors;
      // Keep blueprints and boards for floors that kept their name or position.
      map.floors = names.map((n, i) => {
        const same = old.find(f => f.name === n) || (names.length === old.length ? old[i] : null);
        return same ? Object.assign(same, { name: n }) : { id: uid(), name: n, img: null, ratio: 0.625 };
      });
      for (const f of old) if (!map.floors.includes(f) && f.img) Store.delBlob(f.img).catch(() => {});
      ui.floorsOpen = false;
    }));
  }
  if (!floor) { body.append(h('div', { class: 'empty' }, h('p', { text: 'Add floors to this map to start.' }))); return; }

  const image = floor.img ? await Store.getBlob(floor.img) : null;
  const callouts = (map.callouts[floor.id] = map.callouts[floor.id] || []);

  const floorsSeg = h('div', { class: 'seg' }, map.floors.map(f =>
    h('a', { class: 'segl' + (f.id === floor.id ? ' on' : ''), href: '#/maps/' + map.id + '/blueprints/' + f.id },
      f.name, f.img ? h('i', { class: 'bp-dot' }) : null)));

  const importBtn = h('button', { class: 'btn primary', text: image ? 'Replace image' : 'Import blueprint', onclick: () => importBlueprint(map, floor) });
  const removeBtn = image ? h('button', { class: 'btn', text: 'Remove image', onclick: async () => {
    if (!(await confirmBox('Remove the ' + floor.name + ' blueprint?', 'Callouts and strat drawings on this floor stay.', 'Remove', true))) return;
    await Store.delBlob(floor.img).catch(() => {});
    floor.img = null; save(); route();
  } }) : null;

  const stage = h('div', { class: 'board-host' });
  body.append(h('div', { class: 'ed ed-board' },
    h('div', { class: 'board-top' }, floorsSeg,
      h('span', { class: 'hint', text: callouts.length ? `${callouts.length} callout${callouts.length > 1 ? 's' : ''} on this floor` : 'Pick Callout, then click the blueprint to name a spot' })),
    stage,
    image ? null : h('div', { class: 'bp-empty' },
      h('h3', { text: 'No blueprint for ' + floor.name }),
      h('p', { text: 'Import an image of this floor, such as a screenshot of the in-game map or a blueprint you have saved. Stratbook shrinks it to save space. You can still place callouts on the grid without one.' }),
      h('button', { class: 'btn primary', text: 'Import blueprint', onclick: () => importBlueprint(map, floor) }))));

  body.append(h('div', { class: 'ed banner-tools' },
    section('Map banner and colour', 'Used for this map\'s header, card and accents', h('div', { class: 'ed-meta' },
      h('label', { class: 'field-inline' }, h('span', { class: 'lbl', text: 'Colour' }),
        h('input', { type: 'color', value: toHex(mapColor(map)), onchange: e => { map.color = e.target.value; save(); route(); } })),
      h('button', { class: 'btn', text: map.banner ? 'Change banner image' : 'Use your own banner image', onclick: () => importBanner(map) }),
      map.banner || map.color ? h('button', { class: 'link', text: 'Back to the generated banner', onclick: async () => {
        if (map.banner) await Store.delBlob(map.banner).catch(() => {});
        map.banner = null; map.color = null; save(); route();
      } }) : null))));

  board = Board.mount(stage, {
    mode: 'callouts', image, ratio: floor.ratio || 0.625,
    layer: callouts, ask,
    onChange: () => save(),
    extraTools: [removeBtn, importBtn].filter(Boolean)
  });
}

function toHex(c) {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  const cv = document.createElement('canvas').getContext('2d');
  cv.fillStyle = c;
  return cv.fillStyle.startsWith('#') ? cv.fillStyle : '#888888';
}

async function importBanner(map) {
  const file = await pickImage();
  if (!file) return;
  const { url } = await shrinkImage(file, 1600, 0.82);
  const key = slug('banner-' + map.id) || 'banner-' + uid();
  await Store.putBlob(key, url);
  map.banner = key; save(); route();
}

async function importBlueprint(map, floor) {
  const file = await pickImage();
  if (!file) return;
  try {
    const { url, w, h: ih } = await shrinkImage(file, 2000, 0.82);
    const key = slug('bp-' + map.id + '-' + floor.id) || 'bp-' + uid();
    await Store.putBlob(key, url);
    floor.img = key;
    floor.ratio = +(ih / w).toFixed(4);
    save();
    toast(`${floor.name} blueprint saved (${Math.round(url.length * 0.75 / 1024)} KB)`);
    route();
  } catch (e) {
    toast('Could not read that image: ' + (e.message || e));
  }
}

/* ---------- bulk operator icons ---------- */

// Match image files to operators by file name, e.g. "thatcher.png",
// "R6S-icon-Thatcher.webp" or "operator_solid_snake.png".
function matchOperator(fileName) {
  const tokens = slug(fileName.replace(/\.[^.]+$/, '')).split('-').filter(Boolean);
  const ops = [...db.operators].sort((a, b) => b.id.length - a.id.length);
  return ops.find(o => {
    const want = o.id.split('-');
    for (let i = 0; i + want.length <= tokens.length; i++) {
      if (want.every((t, j) => tokens[i + j] === t)) return true;
    }
    return false;
  }) || null;
}

async function importIconPack() {
  const files = await pickImages();
  if (!files.length) return;
  let done = 0;
  const missed = [];
  for (const f of files) {
    const op = matchOperator(f.name);
    if (!op) { missed.push(f.name); continue; }
    try {
      const { url } = await shrinkImage(f, 128, 0.9);
      const key = slug('op-' + op.id) || 'op-' + uid();
      await Store.putBlob(key, url);
      op.img = key;
      done++;
    } catch (e) { missed.push(f.name); }
  }
  save();
  route();
  toast(`Set ${done} operator icon${done === 1 ? '' : 's'}` + (missed.length ? `. No match for ${missed.length}: ${missed.slice(0, 6).join(', ')}${missed.length > 6 ? '…' : ''}` : '.'));
}

async function resetIcons() {
  const withImg = db.operators.filter(o => o.img);
  if (!withImg.length) return;
  if (!(await confirmBox('Go back to emblems for every operator?', `Removes ${withImg.length} custom picture${withImg.length > 1 ? 's' : ''}.`, 'Reset', true))) return;
  for (const o of withImg) { await Store.delBlob(o.img).catch(() => {}); o.img = null; }
  save(); route();
}

/* ================= maps home ================= */

function renderMapsHome() {
  const total = db.strats.length;
  const cards = db.maps.map(m => {
    const strats = db.strats.filter(s => s.mapId === m.id);
    const rs = strats.flatMap(s => s.results);
    const w = rs.filter(r => r.w).length;
    const bps = m.floors.filter(f => f.img).length;
    return h('a', { class: 'map-card', href: '#/maps/' + m.id, style: `--map:${mapColor(m)}; background-image: linear-gradient(180deg, #12111000 30%, #121110f2 100%), ${bannerUrl(m)}` },
      h('span', { class: 'map-card-name', text: m.name }),
      h('span', { class: 'map-card-meta' },
        h('span', { text: strats.length ? `${strats.length} strat${strats.length > 1 ? 's' : ''}` : 'No strats' }),
        rs.length ? h('span', { text: `${pct(w, rs.length)}% win` }) : null,
        h('span', { text: `${bps}/${m.floors.length} blueprints` })));
  });
  $('#main').replaceChildren(
    h('header', { class: 'head' },
      h('div', { class: 'head-num', text: '--' }),
      h('div', {}, h('h1', { class: 'head-title', text: 'Maps' }),
        h('div', { class: 'head-sub' }, h('b', { text: String(db.maps.length) }), ' maps · ', h('b', { text: String(total) }), total === 1 ? ' strat' : ' strats')),
      h('div', { class: 'head-tools' }, h('button', { class: 'btn', text: '+ Add map', onclick: addMap }))),
    h('section', { class: 'detail', style: 'flex:1' }, h('div', { class: 'map-grid' }, cards)));
}

/* ================= arsenal ================= */

function weaponArt(w, width, height) {
  const own = w.img && Store.cachedBlob(w.img);
  const box = h('span', { class: 'gun-art', style: `width:${width}px;height:${height}px;--gun:${typeInfo(w.type).color}` });
  if (own) box.append(h('img', { src: own, alt: '' }));
  else box.innerHTML = Art.weaponSVG(w.type, typeInfo(w.type).color, width, height);
  return box;
}
function gadgetArt(g, px) {
  const box = h('span', { class: 'gadget-art' });
  box.innerHTML = Art.gadgetSVG(g.id, g.name, px);
  return box;
}

function renderArsenalRail(a, b) {
  const activeW = a !== 'gadget' ? (b || a) : null;
  const activeG = a === 'gadget' ? b : null;
  const q = (ui.armQuery || '').trim().toLowerCase();
  const match = x => !q || x.name.toLowerCase().includes(q);
  const groups = ARSENAL.typeOrder.concat([...new Set(db.weapons.map(w => w.type))].filter(t => !ARSENAL.typeOrder.includes(t)))
    .map(t => [t, db.weapons.filter(w => w.type === t && match(w)).sort(byName)]).filter(([, list]) => list.length);
  railKeep(() => [
    h('input', { class: 'in rail-search', type: 'text', placeholder: 'Filter weapons and gadgets', value: ui.armQuery || '', id: 'armFilter',
      oninput: e => { ui.armQuery = e.target.value; renderArsenalRail(a, b); const f = $('#armFilter'); f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }),
    groups.map(([t, list]) => [
      h('div', { class: 'rail-label', style: '--type:' + typeInfo(t).color }, h('span', { class: 'type-lbl', text: typeInfo(t).label }), h('span', { text: String(list.length) })),
      list.map(w => h('a', { class: 'rail-item gun' + (w.id === activeW ? ' on' : ''), href: '#/arsenal/w/' + w.id },
        weaponArt(w, 44, 15), h('span', { class: 'name', text: w.name }),
        h('span', { class: 'count', text: String(carriers(w.id).length || '') })))
    ]),
    (() => {
      const gs = db.gadgets.filter(match).sort(byName);
      return gs.length ? [
        h('div', { class: 'rail-label' }, h('span', { text: 'Secondary gadgets' }), h('span', { text: String(gs.length) })),
        gs.map(g => h('a', { class: 'rail-item gun' + (g.id === activeG ? ' on' : ''), href: '#/arsenal/gadget/' + g.id },
          gadgetArt(g, 20), h('span', { class: 'name', text: g.name }), h('span', { class: 'count', text: String(carriers(g.id, 'gadget').length || '') })))
      ] : [];
    })(),
    h('div', { class: 'rail-label col' },
      h('button', { class: 'link', text: '+ Add weapon', onclick: addWeapon }),
      h('button', { class: 'link', text: '+ Add gadget', onclick: addGadget }),
      h('a', { class: 'link strong', href: '#/pictures/weapons', text: '+ Add weapon pictures' }),
      h('button', { class: 'link', text: '+ Import weapon images', title: 'Pick many images at once; each is matched to a weapon by file name', onclick: importWeaponPack }))
  ]);
}

function carrierChips(list) {
  if (!list.length) return h('p', { class: 'hint', text: 'No operator has this in their loadout. Add it from an operator\'s Loadout section.' });
  return h('div', { class: 'op-chips' }, list.map(o => h('a', { class: 'op-chip ' + o.side, href: '#/ops/' + o.id }, Icons.opIcon(o, 26), h('span', { text: o.name }))));
}

function renderWeapon(w) {
  const main = $('#main');
  if (!w) { main.replaceChildren(h('div', { class: 'empty' }, h('h3', { text: 'No weapons' }))); return; }
  const ti = typeInfo(w.type);
  const field = (label, key, ph) => h('label', { class: 'stack' }, h('span', { class: 'lbl block', text: label }),
    h('input', { class: 'in', type: 'text', value: w[key] || '', placeholder: ph, oninput: e => { w[key] = e.target.value; save(); } }));
  const area = (key, ph) => h('textarea', { class: 'steps', value: w[key] || '', placeholder: ph, oninput: e => { w[key] = e.target.value; save(); } });
  const rating = h('div', { class: 'comfort' });
  const paintRating = () => rating.replaceChildren(...[1, 2, 3, 4, 5].map(k => h('button', { class: k <= (w.rating || 0) ? 'on' : '', 'aria-label': 'Rating ' + k,
    onclick: () => { w.rating = w.rating === k ? 0 : k; save(); paintRating(); } })));
  paintRating();

  const typeSel = h('select', { value: w.type, onchange: e => { w.type = e.target.value; save(); route(); } },
    ARSENAL.typeOrder.map(t => h('option', { value: t, text: typeInfo(t).label })));
  const nameIn = h('input', { class: 'in', type: 'text', value: w.name, onchange: e => { const v = e.target.value.trim(); if (v) { w.name = v; save(); route(); } } });

  const bigArt = weaponArt(w, 220, 77);
  bigArt.title = 'Drop a picture here to use it for ' + w.name;
  acceptImageDrop(bigArt, async imgs => { await setPicture('weapons', w, imgs[0].src); route(); toast(w.name + ' picture saved'); });
  main.replaceChildren(
    h('header', { class: 'head gun-head', style: '--gun:' + ti.color },
      bigArt,
      h('div', {},
        h('h1', { class: 'head-title', text: w.name }),
        h('div', { class: 'head-sub' }, h('span', { class: 'type-tag', text: ti.label }), '  ', h('b', { text: String(carriers(w.id).length) }), ' operators')),
      h('div', { class: 'head-tools' }, h('span', { class: 'lbl', text: 'My rating' }), rating)),
    h('section', { class: 'detail', style: 'flex:1' }, h('div', { class: 'ed' },
      section('Carried by', 'Click an operator to open their guide', carrierChips(carriers(w.id))),
      section('Attachments', 'What you run on it', h('div', { class: 'grid3' },
        field('Sight', 'sight', 'e.g. red dot, 1.5x'), field('Barrel', 'barrel', 'e.g. compensator'), field('Grip', 'grip', 'e.g. vertical grip'))),
      h('div', { class: 'grid2' },
        section('Recoil', 'How it kicks and how you pull it', area('recoil', 'e.g. straight up for 8 rounds, then right')),
        section('Notes', 'When to pick it, range, quirks', area('notes', 'Anything you want to remember'))),
      section('Picture', 'An original silhouette is drawn for each weapon type. You can use your own image instead.', h('div', { class: 'ed-meta' },
        h('button', { class: 'btn', text: w.img ? 'Change image' : 'Use your own image', onclick: async () => {
          const file = await pickImage(); if (!file) return;
          const { url } = await shrinkImage(file, 480, 0.85);
          const key = slug('wpn-' + w.id) || 'wpn-' + uid();
          await Store.putBlob(key, url); w.img = key; save(); route();
        } }),
        w.img ? h('button', { class: 'link', text: 'Back to the silhouette', onclick: async () => { await Store.delBlob(w.img).catch(() => {}); w.img = null; save(); route(); } }) : null,
        h('a', { class: 'link', href: '#/pictures/weapons', text: 'Add pictures for every weapon' }),
        h('button', { class: 'link', text: 'Import weapon images', onclick: importWeaponPack }))),
      section('Weapon', 'Rename, change type, or remove', h('div', { class: 'ed-meta' },
        h('label', { class: 'field-inline' }, h('span', { class: 'lbl', text: 'Name' }), nameIn),
        h('label', { class: 'field-inline' }, h('span', { class: 'lbl', text: 'Type' }), typeSel),
        h('button', { class: 'danger', text: 'Remove weapon', onclick: async () => {
          if (!(await confirmBox('Remove ' + w.name + '?', 'It is also taken out of every operator loadout.', 'Remove', true))) return;
          if (w.img) Store.delBlob(w.img).catch(() => {});
          db.weapons = db.weapons.filter(x => x !== w);
          db.operators.forEach(o => { o.loadout.primaries = o.loadout.primaries.filter(x => x !== w.id); o.loadout.secondaries = o.loadout.secondaries.filter(x => x !== w.id); });
          save(); go('#/arsenal');
        } }))))));
}

function renderGadget(g) {
  const main = $('#main');
  if (!g) { main.replaceChildren(h('div', { class: 'empty' }, h('h3', { text: 'No gadgets' }))); return; }
  const area = (key, ph) => h('textarea', { class: 'steps', value: g[key] || '', placeholder: ph, oninput: e => { g[key] = e.target.value; save(); } });
  main.replaceChildren(
    h('header', { class: 'head' },
      gadgetArt(g, 64),
      h('div', {}, h('h1', { class: 'head-title', text: g.name }),
        h('div', { class: 'head-sub' }, h('span', { class: 'type-tag', text: 'Secondary gadget' }), '  ', h('b', { text: String(carriers(g.id, 'gadget').length) }), ' operators')),
      h('div', { class: 'head-tools' })),
    h('section', { class: 'detail', style: 'flex:1' }, h('div', { class: 'ed' },
      section('Carried by', null, carrierChips(carriers(g.id, 'gadget'))),
      h('div', { class: 'grid2' },
        section('When I take it', null, area('when', 'e.g. on sites with soft walls I need to open')),
        section('Notes', 'Spots, throws, timings', area('notes', 'Anything you want to remember'))),
      section('Gadget', 'Rename or remove', h('div', { class: 'ed-meta' },
        h('label', { class: 'field-inline' }, h('span', { class: 'lbl', text: 'Name' }),
          h('input', { class: 'in', type: 'text', value: g.name, onchange: e => { const v = e.target.value.trim(); if (v) { g.name = v; save(); route(); } } })),
        h('button', { class: 'danger', text: 'Remove gadget', onclick: async () => {
          if (!(await confirmBox('Remove ' + g.name + '?', 'It is also taken out of every operator loadout.', 'Remove', true))) return;
          db.gadgets = db.gadgets.filter(x => x !== g);
          db.operators.forEach(o => { o.loadout.gadgets = o.loadout.gadgets.filter(x => x !== g.id); });
          save(); go('#/arsenal');
        } }))))));
}

async function addWeapon() {
  const name = await ask('New weapon', '');
  if (!name || !name.trim()) return;
  let id = slug(name) || uid();
  if (weaponById(id)) id += '-' + uid().slice(0, 4);
  db.weapons.push({ id, name: name.trim(), type: 'ar', attach: '', recoil: '', notes: '', rating: 0, img: null });
  save(); go('#/arsenal/w/' + id);
}
async function addGadget() {
  const name = await ask('New gadget', '');
  if (!name || !name.trim()) return;
  let id = slug(name) || uid();
  if (gadgetById(id)) id += '-' + uid().slice(0, 4);
  db.gadgets.push({ id, name: name.trim(), notes: '', when: '' });
  save(); go('#/arsenal/gadget/' + id);
}

// Match image files to weapons by file name ("R4-C.png", "weapon_mp5k.webp").
async function importWeaponPack() {
  const files = await pickImages();
  if (!files.length) return;
  const list = [...db.weapons].sort((a, b) => b.id.length - a.id.length);
  let done = 0; const missed = [];
  for (const f of files) {
    const base = slug(f.name.replace(/\.[^.]+$/, ''));
    const tokens = base.split('-').filter(Boolean);
    const w = list.find(x => x.id === base) || list.find(x => {
      const want = x.id.split('-');
      for (let i = 0; i + want.length <= tokens.length; i++) if (want.every((t, j) => tokens[i + j] === t)) return true;
      return false;
    });
    if (!w) { missed.push(f.name); continue; }
    try {
      const { url } = await shrinkImage(f, 480, 0.85);
      const key = slug('wpn-' + w.id) || 'wpn-' + uid();
      await Store.putBlob(key, url); w.img = key; done++;
    } catch (e) { missed.push(f.name); }
  }
  save(); route();
  toast(`Set ${done} weapon image${done === 1 ? '' : 's'}` + (missed.length ? `. No match for ${missed.length}: ${missed.slice(0, 6).join(', ')}${missed.length > 6 ? '…' : ''}` : '.'));
}

/* ---------- operator loadout ---------- */

function loadoutBlock(op, g) {
  const wrap = h('div', { class: 'loadout' });
  let editing = false;
  const paint = () => {
    const row = (label, key, pickKey, kind) => {
      const ids = op.loadout[key];
      const items = ids.map(id => kind === 'gadget' ? gadgetById(id) : weaponById(id)).filter(Boolean);
      const cards = items.map(x => {
        const picked = g.pick[pickKey] === x.id;
        const card = h('div', { class: 'gun-card' + (picked ? ' picked' : '') + (kind === 'gadget' ? ' gadget' : ''), title: editing ? '' : (picked ? 'Your pick. Click to clear.' : 'Click to mark as your pick'),
          style: kind === 'gadget' ? null : '--gun:' + typeInfo(x.type).color,
          onclick: () => { if (editing) return; g.pick[pickKey] = picked ? '' : x.id; save(); paint(); } },
          kind === 'gadget' ? gadgetArt(x, 34) : weaponArt(x, 132, 46),
          h('span', { class: 'gun-name' }, h('a', { href: kind === 'gadget' ? '#/arsenal/gadget/' + x.id : '#/arsenal/w/' + x.id, text: x.name, onclick: e => e.stopPropagation() })),
          h('span', { class: 'gun-type', text: kind === 'gadget' ? 'Gadget' : typeInfo(x.type).label }),
          picked ? h('span', { class: 'pick-tag', text: 'My pick' }) : null,
          editing ? h('button', { class: 'gun-x', text: '×', title: 'Remove from loadout', onclick: e => { e.stopPropagation(); op.loadout[key] = ids.filter(i => i !== x.id); save(); paint(); } }) : null);
        return card;
      });
      const pool = kind === 'gadget' ? db.gadgets : db.weapons;
      const adder = editing ? h('select', { class: 'gun-add', onchange: e => { if (e.target.value) { op.loadout[key] = [...ids, e.target.value]; save(); paint(); } } },
        h('option', { value: '', text: '+ Add ' + label.toLowerCase() }),
        [...pool].filter(x => !ids.includes(x.id)).sort(byName).map(x => h('option', { value: x.id, text: x.name }))) : null;
      return h('div', { class: 'loadout-row' }, h('span', { class: 'lbl block', text: label }),
        h('div', { class: 'gun-cards' }, cards, adder, !cards.length && !editing ? h('span', { class: 'hint', text: 'None set. Use Edit options to add.' }) : null));
    };
    wrap.replaceChildren(
      row('Primary', 'primaries', 'primary', 'weapon'),
      row('Secondary', 'secondaries', 'secondary', 'weapon'),
      row('Gadget', 'gadgets', 'gadget', 'gadget'),
      h('div', { class: 'loadout-foot' },
        h('button', { class: 'btn', text: editing ? 'Done' : 'Edit options', onclick: () => { editing = !editing; paint(); } }),
        h('span', { class: 'hint', text: editing ? 'Add or remove what this operator can take.' : 'Click a weapon or gadget to mark what you run. Loadouts are starting data: fix any that changed in the game.' })));
  };
  paint();
  return wrap;
}

/* ================= pictures: drag, drop, paste ================= */

const PIC = {
  ops: { label: 'operators', max: 128, q: 0.9, prefix: 'op-', list: () => db.operators.slice().sort((a, b) => (a.side === b.side ? byName(a, b) : a.side === 'atk' ? -1 : 1)), art: o => Icons.opIcon(o, 56), sub: o => o.side === 'atk' ? 'Attacker' : 'Defender' },
  weapons: { label: 'weapons', max: 480, q: 0.85, prefix: 'wpn-', list: () => db.weapons.slice().sort((a, b) => ARSENAL.typeOrder.indexOf(a.type) - ARSENAL.typeOrder.indexOf(b.type) || byName(a, b)), art: w => weaponArt(w, 104, 36), sub: w => typeInfo(w.type).label }
};

function looksLikeImageFile(f) { return f && (f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i.test(f.name)); }

// Turn whatever was dropped or pasted into a list of { src, name }:
// image files, or a web link to an image (downloaded for you).
async function imagesFrom(dt) {
  const files = [...(dt.files || [])].filter(looksLikeImageFile);
  if (!files.length && dt.items) for (const it of dt.items) if (it.kind === 'file') { const f = it.getAsFile(); if (looksLikeImageFile(f)) files.push(f); }
  if (files.length) return files.map(f => ({ src: f, name: f.name }));
  let url = '';
  const html = dt.getData && dt.getData('text/html');
  if (html) { const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html); if (m) url = m[1].replace(/&amp;/g, '&'); }
  if (!url && dt.getData) url = (dt.getData('text/uri-list') || '').split(/\r?\n/).find(l => l && !l.startsWith('#')) || dt.getData('text/plain') || '';
  url = url.trim();
  if (!url) return [];
  if (url.startsWith('data:image/')) return [{ src: url, name: 'image' }];
  if (!/^https?:\/\//i.test(url)) return [];
  const data = await Store.fetchImage(url);
  let name = 'image';
  try { name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || 'image'); } catch (e) {}
  return [{ src: data, name }];
}

async function setPicture(kind, item, src) {
  const cfg = PIC[kind];
  const { url } = await shrinkImage(src, cfg.max, cfg.q);
  const key = slug(cfg.prefix + item.id) || cfg.prefix + uid();
  await Store.putBlob(key, url);
  item.img = key;
  save();
}

function matchByName(fileName, list) {
  const tokens = slug(fileName.replace(/\.[^.]+$/, '')).split('-').filter(Boolean);
  const sorted = [...list].sort((a, b) => b.id.length - a.id.length);
  return sorted.find(x => x.id === tokens.join('-')) || sorted.find(x => {
    const want = x.id.split('-');
    for (let i = 0; i + want.length <= tokens.length; i++) if (want.every((t, j) => tokens[i + j] === t)) return true;
    return false;
  }) || null;
}

// Make any element accept a dropped image.
function acceptImageDrop(el, onImages) {
  el.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; el.classList.add('drop-over'); });
  el.addEventListener('dragleave', () => el.classList.remove('drop-over'));
  el.addEventListener('drop', async e => {
    e.preventDefault(); e.stopPropagation();
    el.classList.remove('drop-over');
    try {
      const imgs = await imagesFrom(e.dataTransfer);
      if (!imgs.length) { toast('No image in what you dropped. Try dragging the picture itself.'); return; }
      await onImages(imgs);
    } catch (err) { toast('Could not use that image: ' + (err.message || err)); }
  });
}

function renderPictures(kind) {
  const cfg = PIC[kind];
  const all = cfg.list();
  const have = all.filter(x => x.img).length;
  const q = (ui.picQuery || '').trim().toLowerCase();
  const filter = ui.picFilter || 'missing';
  const shown = all.filter(x => (filter === 'all' || !x.img) && (!q || x.name.toLowerCase().includes(q)));
  if (!shown.some(x => x.id === ui.picSel)) ui.picSel = shown[0] ? shown[0].id : null;

  const advance = fromId => {
    const list = cfg.list().filter(x => (filter === 'all' || !x.img) && (!q || x.name.toLowerCase().includes(q)));
    const i = cfg.list().findIndex(x => x.id === fromId);
    const next = cfg.list().slice(i + 1).find(x => !x.img && list.includes(x)) || list.find(x => !x.img);
    ui.picSel = next ? next.id : null;
  };

  const tile = item => {
    const el = h('div', { class: 'pic-tile' + (item.img ? ' done' : '') + (item.id === ui.picSel ? ' sel' : ''), tabindex: '0', 'data-id': item.id,
      onclick: () => { ui.picSel = item.id; renderPictures(kind); } },
      h('div', { class: 'pic-art' }, cfg.art(item)),
      h('div', { class: 'pic-name', text: item.name }),
      h('div', { class: 'pic-sub', text: item.img ? 'Done' : cfg.sub(item) }),
      item.img ? h('button', { class: 'pic-x', title: 'Remove this picture', text: '×', onclick: async e => {
        e.stopPropagation(); await Store.delBlob(item.img).catch(() => {}); item.img = null; save(); renderPictures(kind);
      } }) : null);
    acceptImageDrop(el, async imgs => {
      await setPicture(kind, item, imgs[0].src);
      advance(item.id);
      renderPictures(kind);
    });
    return el;
  };

  const zone = h('div', { class: 'pic-zone' },
    h('div', { class: 'pic-zone-big', text: 'Drop lots of files here' }),
    h('div', { class: 'pic-zone-small', text: 'Each one is matched to ' + (kind === 'ops' ? 'an operator' : 'a weapon') + ' by its file name, e.g. ' + (kind === 'ops' ? 'thatcher.png' : 'R4-C.png') }),
    h('button', { class: 'btn', text: 'Or choose files', onclick: kind === 'ops' ? importIconPack : importWeaponPack }));
  acceptImageDrop(zone, async imgs => {
    let done = 0; const missed = [];
    for (const im of imgs) {
      const item = matchByName(im.name, all);
      if (!item) { missed.push(im.name); continue; }
      try { await setPicture(kind, item, im.src); done++; } catch (e) { missed.push(im.name); }
    }
    renderPictures(kind);
    toast(`Set ${done} picture${done === 1 ? '' : 's'}` + (missed.length ? `. No match for: ${missed.slice(0, 5).join(', ')}${missed.length > 5 ? '…' : ''}. Drag those onto their tiles instead.` : '.'));
  });

  const detail = $('#picDetail');
  const top = detail ? detail.scrollTop : 0;
  $('#main').replaceChildren(
    h('header', { class: 'head' },
      h('div', { class: 'head-num', text: pct(have, all.length) + '%' }),
      h('div', {},
        h('h1', { class: 'head-title', text: kind === 'ops' ? 'Operator pictures' : 'Weapon pictures' }),
        h('div', { class: 'head-sub' }, h('b', { text: `${have} of ${all.length}` }), ` ${cfg.label} have a picture`),
        h('div', { class: 'pic-progress' }, h('span', { style: `width:${pct(have, all.length)}%` }))),
      h('div', { class: 'head-tools' },
        h('div', { class: 'seg' },
          h('a', { class: 'segl' + (kind === 'ops' ? ' on' : ''), href: '#/pictures/ops', text: 'Operators' }),
          h('a', { class: 'segl' + (kind === 'weapons' ? ' on' : ''), href: '#/pictures/weapons', text: 'Weapons' })))),
    h('section', { class: 'detail', id: 'picDetail', style: 'flex:1' }, h('div', { class: 'ed pics' },
      h('ol', { class: 'pic-steps' },
        h('li', {}, h('b', { text: 'Drag and drop. ' }), 'Open R6Calls or a wiki in your browser next to this window and drag a picture onto its tile.'),
        h('li', {}, h('b', { text: 'Or copy and paste. ' }), 'Right-click a picture, choose Copy image, then press ', h('kbd', { text: 'Ctrl V' }), ' here. It goes on the selected tile.'),
        h('li', {}, 'After each one, the next empty tile is selected for you.')),
      zone,
      h('div', { class: 'pic-tools' },
        h('div', { class: 'seg' },
          h('button', { class: filter === 'missing' ? 'on' : '', text: 'Still needed', onclick: () => { ui.picFilter = 'missing'; renderPictures(kind); } }),
          h('button', { class: filter === 'all' ? 'on' : '', text: 'All', onclick: () => { ui.picFilter = 'all'; renderPictures(kind); } })),
        h('input', { class: 'in', id: 'picFind', type: 'text', placeholder: 'Find', value: ui.picQuery || '',
          oninput: e => { ui.picQuery = e.target.value; renderPictures(kind); const f = $('#picFind'); f.focus(); f.setSelectionRange(f.value.length, f.value.length); } })),
      shown.length
        ? h('div', { class: 'pic-grid' }, shown.map(tile))
        : h('div', { class: 'empty' }, h('h3', { text: filter === 'missing' ? 'All done' : 'Nothing matches' }),
            h('p', { text: filter === 'missing' ? `Every one of your ${cfg.label} has a picture.` : 'Try another search.' })))));
  $('#picDetail').scrollTop = top;
  const selEl = document.querySelector('.pic-tile.sel');
  if (selEl) { const d = $('#picDetail'); const r = selEl.getBoundingClientRect(), dr = d.getBoundingClientRect(); if (r.top < dr.top || r.bottom > dr.bottom) selEl.scrollIntoView({ block: 'center' }); }
}

// Ctrl+V on the pictures page puts the copied image on the selected tile.
document.addEventListener('paste', async e => {
  if (!location.hash.startsWith('#/pictures') || typing(e)) return;
  const kind = location.hash.includes('weapons') ? 'weapons' : 'ops';
  const item = (kind === 'ops' ? db.operators : db.weapons).find(x => x.id === ui.picSel);
  if (!item) { toast('Click a tile first, then paste.'); return; }
  e.preventDefault();
  try {
    const imgs = await imagesFrom(e.clipboardData);
    if (!imgs.length) { toast('No image on the clipboard. Right-click a picture and choose Copy image.'); return; }
    await setPicture(kind, item, imgs[0].src);
    toast(item.name + ' done');
    const list = PIC[kind].list();
    const i = list.indexOf(item);
    const next = list.slice(i + 1).find(x => !x.img) || list.find(x => !x.img);
    ui.picSel = next ? next.id : null;
    renderPictures(kind);
  } catch (err) { toast('Could not use that image: ' + (err.message || err)); }
});

// Dropping an image anywhere else must not open it in place of the app.
document.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].some(t => t === 'Files' || t === 'text/uri-list' || t === 'text/html')) e.preventDefault(); });
document.addEventListener('drop', e => e.preventDefault());

/* ================= operators ================= */

function renderOp(op) {
  const main = $('#main');
  if (!op) {
    main.replaceChildren(h('div', { class: 'empty' }, h('h3', { text: 'No operators' }), h('p', { text: 'Add one from the list.' })));
    return;
  }
  const g = guideFor(op.id);

  const iconBox = h('div', { class: 'op-big', title: 'Drop a picture here to use it for ' + op.name }, Icons.opIcon(op, 72));
  acceptImageDrop(iconBox, async imgs => { await setPicture('ops', op, imgs[0].src); route(); toast(op.name + ' picture saved'); });
  const head = h('header', { class: 'head op-hero', style: `--op: hsl(${Icons.hue(op.name, op.side)} 60% 55%)` },
    iconBox,
    h('div', {},
      h('h1', { class: 'head-title', text: op.name }),
      h('div', { class: 'head-sub' }, h('span', { class: 'side-tag ' + op.side, text: op.side === 'atk' ? 'Attacker' : 'Defender' }))),
    h('div', { class: 'head-tools' },
      h('span', { class: 'lbl', text: 'Comfort' }),
      comfortPicker(g, op)));

  const field = (label, key, ph) => h('label', { class: 'stack' },
    h('span', { class: 'lbl block', text: label }),
    h('input', { class: 'in', type: 'text', value: g[key], placeholder: ph, oninput: e => { g[key] = e.target.value; save(); } }));
  const area = (key, ph, cls) => h('textarea', { class: cls || '', value: g[key], placeholder: ph, oninput: e => { g[key] = e.target.value; save(); } });

  const mapChips = h('div', { class: 'chips' }, db.maps.map(m =>
    h('button', { class: 'chip' + (g.maps.includes(m.id) ? ' on' : ''), text: m.name, onclick: e => {
      g.maps = g.maps.includes(m.id) ? g.maps.filter(x => x !== m.id) : [...g.maps, m.id];
      e.target.classList.toggle('on'); save();
    } })));

  const uses = db.strats.filter(s => s.lineup.some(l => l.op === op.id));
  const usesList = uses.length
    ? h('ul', { class: 'uses' }, uses.map(s => {
        const m = mapById(s.mapId);
        const slot = s.lineup.find(l => l.op === op.id);
        const r = record(s);
        return h('li', {}, h('a', { href: '#/maps/' + s.mapId + '/s/' + s.id },
          h('span', {}, s.title || 'Untitled strat', slot.role ? h('span', { class: 'where', text: '  ' + slot.role }) : null),
          h('span', { class: 'where', text: (m ? m.name : '?') + (s.site ? ' · ' + s.site : '') + (r.n ? `  ${r.w}–${r.l}` : '') })));
      }))
    : h('div', { class: 'hint', text: 'Not in any strat yet.' });

  const nameIn = h('input', { class: 'in', type: 'text', value: op.name, onchange: e => {
    const v = e.target.value.trim(); if (!v) return;
    op.name = v; save(); route();
  } });
  const sideSel = h('select', { value: op.side, onchange: e => { op.side = e.target.value; save(); route(); } },
    h('option', { value: 'atk', text: 'Attacker' }), h('option', { value: 'def', text: 'Defender' }));
  const del = h('button', { class: 'danger', text: 'Remove operator', onclick: async () => {
    if (!(await confirmBox('Remove ' + op.name + '?', 'Their guide is deleted and they are taken out of any strat lineups.', 'Remove', true))) return;
    if (op.img) Store.delBlob(op.img).catch(() => {});
    db.operators = db.operators.filter(o => o !== op);
    delete db.guides[op.id];
    db.strats.forEach(s => {
      s.lineup.forEach(l => { if (l.op === op.id) l.op = ''; });
      Object.values(s.board).forEach(f => f.forEach(layer => { for (let i = layer.length - 1; i >= 0; i--) if (layer[i].t === 'op' && layer[i].op === op.id) layer.splice(i, 1); }));
    });
    save(); go('#/ops');
  } });

  const iconActions = h('div', { class: 'ed-meta' },
    h('button', { class: 'btn', text: op.img ? 'Change picture' : 'Use your own picture', onclick: async () => {
      const file = await pickImage();
      if (!file) return;
      const { url } = await shrinkImage(file, 128, 0.85);
      const key = slug('op-' + op.id) || 'op-' + uid();
      await Store.putBlob(key, url);
      op.img = key; save(); route();
    } }),
    op.img ? h('button', { class: 'link', text: 'Back to the emblem', onclick: async () => {
      await Store.delBlob(op.img).catch(() => {});
      op.img = null; save(); route();
    } }) : null,
    h('a', { class: 'link', href: '#/pictures/ops', text: 'Add pictures for everyone' }),
    h('button', { class: 'link', text: 'Import icon pack', onclick: importIconPack }),
    db.operators.some(o => o.img) ? h('button', { class: 'link', text: 'Reset all to emblems', onclick: resetIcons }) : null);

  const ed = h('div', { class: 'ed' },
    section('Role', null, field('Role in your team', 'role', op.side === 'atk' ? 'e.g. hard breacher, entry, intel' : 'e.g. anchor, roamer, denial')),
    section('Loadout', 'Everything this operator can take', h('div', {},
      loadoutBlock(op, g),
      h('div', { style: 'margin-top:12px' }, field('Attachments and setup', 'attach', 'e.g. R4-C: red dot, compensator, angled grip')))),
    section('How I play it', 'Your plan for this operator', area('playstyle', 'When you pick them, where you go, what you do in the first 30 seconds')),
    h('div', { class: 'grid2' },
      section('Gadget tips', 'One per line', area('tips', 'Spots, timings, tricks', 'steps')),
      section('Counters and threats', 'One per line', area('counters', 'What shuts them down, who to watch for', 'steps'))),
    section('Good on', 'Maps where you like them', mapChips),
    section('In your strats', null, usesList),
    section('Notes', null, area('notes', 'Anything else', 'notes')),
    section('Icon', 'Use your own picture, or import a whole pack: select all the images at once and each is matched to an operator by file name.', iconActions),
    section('Operator', 'Rename, change side, or remove', h('div', { class: 'ed-meta' },
      h('label', { class: 'field-inline' }, h('span', { class: 'lbl', text: 'Name' }), nameIn),
      h('label', { class: 'field-inline' }, h('span', { class: 'lbl', text: 'Side' }), sideSel),
      del)));

  main.replaceChildren(head, h('section', { class: 'detail', style: 'flex:1' }, ed));
}

function comfortPicker(g, op) {
  const wrap = h('div', { class: 'comfort', title: 'How comfortable you are on this operator. Click the same box again to clear.' });
  const paint = () => wrap.replaceChildren(...[1, 2, 3, 4, 5].map(k =>
    h('button', { class: k <= g.comfort ? 'on' : '', 'aria-label': 'Comfort ' + k, onclick: () => {
      g.comfort = g.comfort === k ? 0 : k; save(); paint(); renderOpsRail(op.id);
    } })));
  paint();
  return wrap;
}

/* ================= stats ================= */

function bars(rows, opts = {}) {
  if (!rows.length) return h('p', { class: 'hint', text: opts.empty || 'Nothing logged yet.' });
  const max = Math.max(...rows.map(r => r.value), 1);
  return h('div', { class: 'bars' }, rows.map(r =>
    h(r.href ? 'a' : 'div', { class: 'bar-row', href: r.href },
      h('span', { class: 'bar-lbl' }, r.icon || null, h('span', { text: r.label })),
      h('span', { class: 'bar-track' },
        h('span', { class: 'bar-fill ' + (r.tone || ''), style: `width:${(opts.percent ? r.value : r.value / max * 100).toFixed(1)}%` + (r.color ? `;background:${r.color}` : '') }),
        opts.percent ? h('span', { class: 'bar-50' }) : null),
      h('span', { class: 'bar-val', text: r.text }))));
}

function renderStats(map) {
  const strats = map ? db.strats.filter(s => s.mapId === map.id) : db.strats;
  const rounds = strats.flatMap(s => s.results);
  const wins = rounds.filter(r => r.w).length;
  const tone = p => p >= 55 ? 'good' : p < 45 ? 'bad' : '';
  const sumRows = (groups) => groups.map(([label, list, href]) => {
    const rs = list.flatMap(s => s.results);
    const w = rs.filter(r => r.w).length;
    return { label, value: pct(w, rs.length), n: rs.length, text: `${pct(w, rs.length)}%  ${w}–${rs.length - w}`, tone: tone(pct(w, rs.length)), href };
  }).filter(r => r.n).sort((a, b) => b.n - a.n);

  const bySide = sumRows([['Attack', strats.filter(s => s.side === 'atk')], ['Defense', strats.filter(s => s.side === 'def')]]);
  const byWhere = map
    ? sumRows([...map.sites, ''].map(site => [site || 'No site', strats.filter(s => (site ? s.site === site : !map.sites.includes(s.site)))]))
    : sumRows(db.maps.map(m => [m.name, strats.filter(s => s.mapId === m.id), '#/stats/' + m.id])).map(r => ({ ...r, color: mapColor(db.maps.find(m => m.name === r.label)) }));

  const stratRows = strats.filter(s => s.results.length)
    .map(s => { const r = record(s); const p = pct(r.w, r.n); const m = mapById(s.mapId);
      return { label: (s.title || 'Untitled strat') + (map ? '' : '  · ' + (m ? m.name : '')), value: p, n: r.n, text: `${p}%  ${r.w}–${r.l}`, tone: tone(p), href: '#/maps/' + s.mapId + '/s/' + s.id }; })
    .sort((a, b) => b.value - a.value || b.n - a.n).slice(0, 12);

  const opCount = new Map();
  for (const s of strats) for (const l of s.lineup) if (l.op) {
    const e = opCount.get(l.op) || { n: 0, w: 0, r: 0 };
    const r = record(s);
    e.n++; e.w += r.w; e.r += r.n;
    opCount.set(l.op, e);
  }
  const opRows = [...opCount.entries()].map(([id, e]) => ({ op: opById(id), ...e })).filter(x => x.op)
    .sort((a, b) => b.n - a.n).slice(0, 14)
    .map(x => ({ label: x.op.name, icon: Icons.opIcon(x.op, 18), value: x.n, text: `${x.n} strat${x.n > 1 ? 's' : ''}` + (x.r ? `  ${pct(x.w, x.r)}%` : ''), href: '#/ops/' + x.op.id }));

  const statusCounts = STATUSES.map(([k, label]) => [label, strats.filter(s => s.status === k).length, k]);
  const statusBar = strats.length
    ? h('div', { class: 'stack-bar' }, statusCounts.filter(x => x[1]).map(([label, n, k]) =>
        h('span', { class: 'seg-part ' + k, style: `flex:${n}`, title: `${label}: ${n}` }, h('span', { text: `${label} ${n}` }))))
    : h('p', { class: 'hint', text: 'No strats yet.' });

  const tile = (big, small) => h('div', { class: 'tile' }, h('div', { class: 'tile-big', text: big }), h('div', { class: 'tile-small', text: small }));

  $('#main').replaceChildren(
    h('header', { class: 'head' },
      h('div', { class: 'head-num', text: map ? pad(db.maps.indexOf(map) + 1) : '--' }),
      h('div', {}, h('h1', { class: 'head-title', text: map ? map.name : 'Stats' }),
        h('div', { class: 'head-sub', text: map ? 'Results on this map' : 'Results across every map' })),
      h('div', { class: 'head-tools' }, map ? h('a', { class: 'btn', href: '#/maps/' + map.id, text: 'Open map' }) : null)),
    h('section', { class: 'detail', style: 'flex:1' }, h('div', { class: 'ed stats' },
      h('div', { class: 'tiles' },
        tile(rounds.length ? pct(wins, rounds.length) + '%' : '–', 'win rate'),
        tile(`${wins}–${rounds.length - wins}`, 'rounds logged'),
        tile(String(strats.length), strats.length === 1 ? 'strat' : 'strats'),
        tile(String(strats.filter(s => s.status === 'works').length), 'marked Works')),
      h('div', { class: 'grid2' },
        section('By side', null, bars(bySide, { percent: true })),
        section(map ? 'By site' : 'By map', 'Win rate, most played first', bars(byWhere, { percent: true }))),
      section('Strats', 'Best win rate first', bars(stratRows, { percent: true, empty: 'Log wins and losses on a strat to see it here.' })),
      h('div', { class: 'grid2' },
        section('Operators in your strats', 'How often they appear, and the win rate of those strats', bars(opRows, { empty: 'Add operators to strat lineups to see them here.' })),
        section('Strat status', null, statusBar)))));
}

/* ================= finder ================= */

let finderHits = [], finderIdx = 0;

function openFinder() {
  $('#finder').hidden = false;
  const inp = $('#finderInput');
  inp.value = '';
  runFinder('');
  inp.focus();
}
function closeFinder() { $('#finder').hidden = true; }

function runFinder(q) {
  q = q.trim().toLowerCase();
  const hits = [];
  const has = t => t && t.toLowerCase().includes(q);
  if (q) {
    for (const m of db.maps) if (has(m.name)) hits.push({ kind: 'Map', label: m.name, ctx: m.sites.length + ' sites', href: '#/maps/' + m.id });
    for (const m of db.maps) for (const f of m.floors) for (const c of (m.callouts[f.id] || []))
      if (has(c.text)) hits.push({ kind: 'Callout', label: c.text, ctx: m.name + ' · ' + f.name, href: '#/maps/' + m.id + '/blueprints/' + f.id });
    for (const w of db.weapons) if (has(w.name) || has(w.notes)) hits.push({ kind: 'Weapon', label: w.name, ctx: typeInfo(w.type).label, href: '#/arsenal/w/' + w.id });
    for (const g of db.gadgets) if (has(g.name)) hits.push({ kind: 'Gadget', label: g.name, ctx: 'secondary gadget', href: '#/arsenal/gadget/' + g.id });
    for (const o of db.operators) if (has(o.name)) hits.push({ kind: o.side === 'atk' ? 'Attack' : 'Defense', label: o.name, ctx: 'operator guide', href: '#/ops/' + o.id });
    for (const s of db.strats) {
      const text = [s.title, s.notes, s.site, s.tags.join(' '), ...s.phases, ...s.lineup.map(l => l.role)].join('\n');
      if (has(text)) {
        const m = mapById(s.mapId);
        hits.push({ kind: 'Strat', label: s.title || 'Untitled strat', ctx: (m ? m.name : '') + (s.site ? ' · ' + s.site : ''), href: '#/maps/' + s.mapId + '/s/' + s.id });
      }
    }
  }
  finderHits = hits.slice(0, 40);
  finderIdx = 0;
  paintFinder(q);
}

function paintFinder(q) {
  const ol = $('#finderResults');
  if (!q) { ol.replaceChildren(h('li', { class: 'none', text: 'Type to search maps, callouts, operators and everything written in your strats.' })); return; }
  if (!finderHits.length) { ol.replaceChildren(h('li', { class: 'none', text: 'Nothing matches.' })); return; }
  ol.replaceChildren(...finderHits.map((x, i) => h('li', { class: i === finderIdx ? 'on' : '' },
    h('a', { href: x.href, onclick: closeFinder },
      h('span', { class: 'kind', text: x.kind }), h('span', { text: x.label }), h('span', { class: 'ctx', text: x.ctx })))));
}

/* ================= import / export ================= */

async function exportData() {
  // Include images so a backup restores everything.
  const blobs = {};
  for (const m of db.maps) for (const f of m.floors) if (f.img) blobs[f.img] = await Store.getBlob(f.img);
  for (const o of db.operators) if (o.img) blobs[o.img] = await Store.getBlob(o.img);
  for (const w of db.weapons) if (w.img) blobs[w.img] = await Store.getBlob(w.img);
  for (const m of db.maps) if (m.banner) blobs[m.banner] = await Store.getBlob(m.banner);
  const name = 'stratbook-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  const where = await Store.exportText(name, JSON.stringify({ ...db, blobs }));
  toast(where ? 'Backup saved to ' + where : 'Backup downloaded');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    let d;
    try { d = JSON.parse(reader.result); } catch (e) { d = null; }
    if (!d || !Array.isArray(d.maps) || !Array.isArray(d.strats)) { toast('That file is not a Stratbook backup.'); return; }
    const ok = await confirmBox('Replace everything with this backup?', `${d.strats.length} strats, ${d.maps.length} maps. Your current data will be overwritten.`, 'Replace', true);
    if (!ok) return;
    const blobs = d.blobs || {};
    delete d.blobs;
    for (const [k, v] of Object.entries(blobs)) if (v) await Store.putBlob(k, v);
    db = normalize(d);
    save(true);
    route();
    toast('Backup restored');
  };
  reader.readAsText(file);
}

/* ================= keys + boot ================= */

document.addEventListener('keydown', e => {
  if (!$('#modal').hidden) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openFinder(); return; }
  if (!$('#finder').hidden) {
    if (e.key === 'Escape') closeFinder();
    else if (e.key === 'ArrowDown') { finderIdx = Math.min(finderIdx + 1, finderHits.length - 1); paintFinder($('#finderInput').value.trim()); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { finderIdx = Math.max(finderIdx - 1, 0); paintFinder($('#finderInput').value.trim()); e.preventDefault(); }
    else if (e.key === 'Enter' && finderHits[finderIdx]) { closeFinder(); go(finderHits[finderIdx].href); }
    return;
  }
  if (typing(e)) { if (e.key === 'Escape') e.target.blur(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (board && board.key(e)) { e.preventDefault(); return; }
  if (e.key === 'n' && current.map && location.hash.startsWith('#/maps') && !location.hash.includes('/blueprints')) { e.preventDefault(); newStrat(current.map, ''); }
});

$('#finderInput').addEventListener('input', e => runFinder(e.target.value));
$('#finder').addEventListener('mousedown', e => { if (e.target.id === 'finder') closeFinder(); });
$('#findBtn').addEventListener('click', openFinder);
$('#exportBtn').addEventListener('click', exportData);
$('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });
window.addEventListener('hashchange', route);
document.addEventListener('contextmenu', e => { if (!typing(e)) e.preventDefault(); });

load().then(route);
})();
