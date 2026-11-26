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
  const sens = defaultSens();
  return {
    version: 4,
    settings: defaultSettings(),
    profile: defaultProfile(),
    sens, sensCurrent: sens[sens.length - 1].id,
    sessions: [],
    matches: [],
    goals: defaultGoals(),
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
  d.version = 4;
  d.maps = Array.isArray(d.maps) ? d.maps : [];
  d.operators = Array.isArray(d.operators) ? d.operators : [];
  if (!Array.isArray(d.weapons)) d.weapons = seedWeapons();
  if (!Array.isArray(d.gadgets)) d.gadgets = seedGadgets();
  for (const o of d.operators) {
    if (!o.loadout) o.loadout = seedLoadout(o.name);
    for (const k of ['primaries', 'secondaries', 'gadgets']) if (!Array.isArray(o.loadout[k])) o.loadout[k] = [];
  }
  d.settings = Object.assign(defaultSettings(), d.settings || {});
  d.profile = mergeDeep(defaultProfile(), d.profile || {});
  if (!Array.isArray(d.sens)) { d.sens = defaultSens(); d.sensCurrent = d.sens[d.sens.length - 1].id; }
  if (!Array.isArray(d.sessions)) d.sessions = [];
  if (!Array.isArray(d.matches)) d.matches = [];
  d.ubi = Object.assign({ connected: false, name: '', autolog: true, snapshots: [], lastSync: null, lastError: '' }, d.ubi || {});
  if (!Array.isArray(d.goals)) d.goals = defaultGoals();
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
  const p = db.profile;
  await Promise.all([p.avatar, p.banner, ...Object.values(p.gear).map(g => g.img)].filter(Boolean).map(k => Store.getBlob(k).catch(() => null)));
  applySettings();
  paintNavAvatar();
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

let lastView = '';
function route() {
  if (board) { board.destroy(); board = null; }
  const [view0, a, b, c, d] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const view = view0 || 'home';
  const solo = ['home', 'progress', 'tracker', 'sens', 'profile', 'settings'];
  const tab = view === 'pictures' ? (a === 'weapons' ? 'arsenal' : a === 'maps' ? 'maps' : 'ops')
    : solo.includes(view) || ['ops', 'stats', 'arsenal'].includes(view) ? view : 'maps';
  const main = document.querySelector('.main');
  main.style.removeProperty('--map');
  document.querySelectorAll('#tabs a').forEach(t => t.classList.toggle('on', t.dataset.tab === (tab === 'progress' ? 'tracker' : tab)));
  $('#app').classList.toggle('no-rail', solo.includes(view));
  // Play the page-enter animation when the page (not just a detail) changes.
  const pageKey = view + '/' + (a || '');
  if (pageKey !== lastView) { main.classList.remove('enter'); void main.offsetWidth; main.classList.add('enter'); lastView = pageKey; }
  else main.classList.remove('enter');
  if (view === 'home') renderHome();
  else if (view === 'progress' || view === 'tracker') renderTracker(view === 'progress' ? 'daily' : (a || ''), b);
  else if (view === 'sens') renderSens();
  else if (view === 'profile') renderProfile();
  else if (view === 'settings') renderSettings();
  else if (view === 'pictures') {
    if (a === 'weapons') renderArsenalRail(); else if (a === 'maps') renderMapsRail(); else renderOpsRail();
    renderPictures(PIC[a] ? a : 'ops');
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
    main.style.setProperty('--map', mapColor(map));
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
    h('div', { class: 'rail-label col' }, h('a', { class: 'link strong', href: '#/pictures/maps', text: '+ Set map banners' }), h('button', { class: 'link', text: '+ Add map', onclick: addMap }))
  ]);
}

function renderOpsRail(activeId) {
  const q = ui.opQuery.trim().toLowerCase();
  const list = side => db.operators.filter(o => o.side === side && (!q || o.name.toLowerCase().includes(q))).sort(byName);
  const item = o => {
    const g = db.guides[o.id];
    const c = g ? g.comfort : 0;
    return h('a', { class: 'rail-item op' + (o.id === activeId ? ' on' : '') + (guideFilled(o.id) ? '' : ' dim'), href: '#/ops/' + o.id },
      Icons.opIcon(o, 28),
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

function bannerDrop(head, map) {
  head.title = 'Drop a picture here to use it as the ' + map.name + ' banner';
  acceptImageDrop(head, async imgs => { await setPicture('maps', map, imgs[0].src); route(); toast(map.name + ' banner saved'); });
  return head;
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
  main.replaceChildren(bannerDrop(mapHead(map, 'strats'), map), h('div', { class: 'body' + (ui.wide && current.boardTab ? ' wide' : '') }, list, detail));
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
    h('div', { class: 'row-ops' }, ops.length ? ops.map(o => Icons.opIcon(o, 24)) : h('span', { class: 'row-meta', text: s.side === 'atk' ? 'Attack' : 'Defense' })));
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
    const icoBox = h('span', { class: 'lineup-ico' }, Icons.opIcon(cur, 40));
    return [
      icoBox,
      h('select', { value: slot.op, onchange: e => {
        slot.op = e.target.value; touch(s); refreshRow();
        icoBox.replaceChildren(Icons.opIcon(opById(slot.op), 40));
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
      h('div', { class: 'head-tools' }, h('a', { class: 'btn primary', href: '#/pictures/maps', text: 'Set map banners' }), h('button', { class: 'btn', text: '+ Add map', onclick: addMap }))),
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
  return h('div', { class: 'op-chips' }, list.map(o => h('a', { class: 'op-chip ' + o.side, href: '#/ops/' + o.id }, Icons.opIcon(o, 34), h('span', { text: o.name }))));
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
  maps: { label: 'maps', field: 'banner', max: 1600, q: 0.82, prefix: 'banner-', list: () => db.maps.slice(), art: m => h('span', { class: 'pic-banner', style: `background-image:${bannerUrl(m)}` }), sub: m => m.floors.length + ' floors' },
  ops: { label: 'operators', field: 'img', max: 128, q: 0.9, prefix: 'op-', list: () => db.operators.slice().sort((a, b) => (a.side === b.side ? byName(a, b) : a.side === 'atk' ? -1 : 1)), art: o => Icons.opIcon(o, 76), sub: o => o.side === 'atk' ? 'Attacker' : 'Defender' },
  weapons: { label: 'weapons', field: 'img', max: 480, q: 0.85, prefix: 'wpn-', list: () => db.weapons.slice().sort((a, b) => ARSENAL.typeOrder.indexOf(a.type) - ARSENAL.typeOrder.indexOf(b.type) || byName(a, b)), art: w => weaponArt(w, 104, 36), sub: w => typeInfo(w.type).label }
};

const ENGINES = {
  bing: { label: 'Bing Images', url: q => 'https://www.bing.com/images/search?q=' + encodeURIComponent(q) },
  ddg: { label: 'DuckDuckGo', url: q => 'https://duckduckgo.com/?ia=images&iax=images&q=' + encodeURIComponent(q) },
  google: { label: 'Google Images', url: q => 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(q) }
};

// Search box value is a web address -> open it; otherwise search for it.
async function webSearch(text) {
  const t = (text || '').trim();
  if (!t) return;
  const looksLikeUrl = /^https?:\/\//i.test(t) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t);
  const url = looksLikeUrl ? (/^https?:/i.test(t) ? t : 'https://' + t) : ENGINES[ui.engine || 'bing'].url(t);
  try {
    const how = await Store.openWeb(url);
    if (typeof how === 'string' && how.startsWith('browser')) toast('Opened in your web browser. Drag pictures from it into Stratbook, or copy and press Ctrl+V.');
  } catch (e) { toast('Could not open the web search: ' + (e.message || e)); }
}

function webBar(defaultQuery) {
  const input = h('input', { class: 'in web-in', id: 'webQuery', type: 'text', value: defaultQuery || '', placeholder: 'Search the web, or paste a web address',
    onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); webSearch(input.value); } } });
  return h('div', { class: 'web-bar' },
    h('span', { class: 'lbl', text: 'Web' }),
    input,
    h('select', { value: ui.engine || 'bing', onchange: e => { ui.engine = e.target.value; } },
      Object.entries(ENGINES).map(([k, v]) => h('option', { value: k, text: v.label }))),
    h('button', { class: 'btn primary', text: 'Search', onclick: () => webSearch(input.value) }));
}

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
  item[cfg.field] = key;
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
  const F = cfg.field;
  const has = x => !!x[F];
  const have = all.filter(has).length;
  const q = (ui.picQuery || '').trim().toLowerCase();
  const filter = ui.picFilter || 'missing';
  const shown = all.filter(x => (filter === 'all' || !has(x)) && (!q || x.name.toLowerCase().includes(q)));
  if (!shown.some(x => x.id === ui.picSel)) ui.picSel = shown[0] ? shown[0].id : null;

  const advance = fromId => {
    const list = cfg.list().filter(x => (filter === 'all' || !has(x)) && (!q || x.name.toLowerCase().includes(q)));
    const i = cfg.list().findIndex(x => x.id === fromId);
    const next = cfg.list().slice(i + 1).find(x => !has(x) && list.includes(x)) || list.find(x => !has(x));
    ui.picSel = next ? next.id : null;
  };

  const tile = item => {
    const el = h('div', { class: 'pic-tile' + (has(item) ? ' done' : '') + (item.id === ui.picSel ? ' sel' : ''), tabindex: '0', 'data-id': item.id,
      onclick: () => { ui.picSel = item.id; renderPictures(kind); } },
      h('div', { class: 'pic-art' }, cfg.art(item)),
      h('div', { class: 'pic-name', text: item.name }),
      h('div', { class: 'pic-sub', text: has(item) ? 'Done' : cfg.sub(item) }),
      has(item) ? h('button', { class: 'pic-x', title: 'Remove this picture', text: '×', onclick: async e => {
        e.stopPropagation(); await Store.delBlob(item[F]).catch(() => {}); item[F] = null; save(); renderPictures(kind);
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
    h('div', { class: 'pic-zone-small', text: 'Each one is matched to ' + ({ ops: 'an operator', weapons: 'a weapon', maps: 'a map' })[kind] + ' by its file name, e.g. ' + ({ ops: 'thatcher.png', weapons: 'R4-C.png', maps: 'clubhouse.jpg' })[kind] }),
    h('button', { class: 'btn', text: 'Or choose files', onclick: async () => {
      const files = await pickImages(); if (!files.length) return;
      zone.dispatchEvent(Object.assign(new Event('stratbook-files'), { files }));
    } }));
  zone.addEventListener('stratbook-files', async e => {
    let done = 0; const missed = [];
    for (const f of e.files) { const item = matchByName(f.name, all); if (!item) { missed.push(f.name); continue; } try { await setPicture(kind, item, f); done++; } catch (err) { missed.push(f.name); } }
    renderPictures(kind);
    toast(`Set ${done} picture${done === 1 ? '' : 's'}` + (missed.length ? `. No match for: ${missed.slice(0, 5).join(', ')}` : '.'));
  });
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
        h('h1', { class: 'head-title', text: ({ ops: 'Operator pictures', weapons: 'Weapon pictures', maps: 'Map banners' })[kind] }),
        h('div', { class: 'head-sub' }, h('b', { text: `${have} of ${all.length}` }), ` ${cfg.label} have ${kind === 'maps' ? 'your own banner' : 'a picture'}`),
        h('div', { class: 'pic-progress' }, h('span', { style: `width:${pct(have, all.length)}%` }))),
      h('div', { class: 'head-tools' },
        h('div', { class: 'seg' },
          h('a', { class: 'segl' + (kind === 'maps' ? ' on' : ''), href: '#/pictures/maps', text: 'Maps' }),
          h('a', { class: 'segl' + (kind === 'ops' ? ' on' : ''), href: '#/pictures/ops', text: 'Operators' }),
          h('a', { class: 'segl' + (kind === 'weapons' ? ' on' : ''), href: '#/pictures/weapons', text: 'Weapons' })))),
    h('section', { class: 'detail', id: 'picDetail', style: 'flex:1' }, h('div', { class: 'ed pics' },
      h('ol', { class: 'pic-steps' },
        h('li', {}, h('b', { text: 'Search. ' }), 'Click a tile, then Search: a web window opens beside this one with results for it. Or type any site, like a wiki.'),
        h('li', {}, h('b', { text: 'Drag and drop. ' }), 'Drag a picture from the web window (or any browser) onto its tile.'),
        h('li', {}, h('b', { text: 'Or copy and paste. ' }), 'Right-click a picture, choose Copy image, then press ', h('kbd', { text: 'Ctrl V' }), ' here. It goes on the selected tile.'),
        h('li', {}, 'After each one, the next empty tile is selected for you.')),
      webBar((() => { const it = all.find(x => x.id === ui.picSel); return it ? it.name + ({ ops: ' Rainbow Six Siege operator', weapons: ' Rainbow Six Siege', maps: ' Rainbow Six Siege map wallpaper' })[kind] : ''; })()),
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
            h('p', { text: filter === 'missing' ? `Every one of your ${cfg.label} has ${kind === 'maps' ? 'a banner' : 'a picture'}.` : 'Try another search.' })))));
  $('#picDetail').scrollTop = top;
  const selEl = document.querySelector('.pic-tile.sel');
  if (selEl) { const d = $('#picDetail'); const r = selEl.getBoundingClientRect(), dr = d.getBoundingClientRect(); if (r.top < dr.top || r.bottom > dr.bottom) selEl.scrollIntoView({ block: 'center' }); }
}

// Ctrl+V on the pictures page puts the copied image on the selected tile.
document.addEventListener('paste', async e => {
  if (!location.hash.startsWith('#/pictures') || typing(e)) return;
  const kind = location.hash.includes('weapons') ? 'weapons' : location.hash.includes('maps') ? 'maps' : 'ops';
  const item = PIC[kind].list().find(x => x.id === ui.picSel);
  if (!item) { toast('Click a tile first, then paste.'); return; }
  e.preventDefault();
  try {
    const imgs = await imagesFrom(e.clipboardData);
    if (!imgs.length) { toast('No image on the clipboard. Right-click a picture and choose Copy image.'); return; }
    await setPicture(kind, item, imgs[0].src);
    toast(item.name + ' done');
    const list = PIC[kind].list();
    const i = list.indexOf(item);
    const F = PIC[kind].field;
    const next = list.slice(i + 1).find(x => !x[F]) || list.find(x => !x[F]);
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

  const iconBox = h('div', { class: 'op-big', title: 'Drop a picture here to use it for ' + op.name }, Icons.opIcon(op, 104));
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
    .map(x => ({ label: x.op.name, icon: Icons.opIcon(x.op, 24), value: x.n, text: `${x.n} strat${x.n > 1 ? 's' : ''}` + (x.r ? `  ${pct(x.w, x.r)}%` : ''), href: '#/ops/' + x.op.id }));

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

/* ================= settings, profile, sensitivity, progress ================= */

const FONTS = [
  ['system', 'Segoe UI (default)', '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif'],
  ['bahnschrift', 'Bahnschrift', 'Bahnschrift, "Segoe UI", sans-serif'],
  ['verdana', 'Verdana (wide, easy to read)', 'Verdana, Geneva, sans-serif'],
  ['tahoma', 'Tahoma', 'Tahoma, "Segoe UI", sans-serif'],
  ['trebuchet', 'Trebuchet MS', '"Trebuchet MS", "Segoe UI", sans-serif'],
  ['calibri', 'Calibri', 'Calibri, Carlito, "Segoe UI", sans-serif'],
  ['arial', 'Arial', 'Arial, Helvetica, sans-serif'],
  ['georgia', 'Georgia (serif)', 'Georgia, "Times New Roman", serif'],
  ['consolas', 'Consolas (monospace)', 'Consolas, "Cascadia Mono", monospace']
];
const ACCENTS = ['#f5b544', '#ff7a45', '#f0566a', '#ec6fb5', '#9b7cf6', '#4e9ff0', '#2fc4b2', '#5ccf7a'];

function defaultSettings() {
  return { theme: 'dark', accent: '#f5b544', font: 'system', headingFont: 'system', fontSize: 15, density: 'comfortable', motion: true, contrast: false };
}

function applySettings() {
  const st = db.settings, root = document.documentElement;
  root.dataset.theme = st.theme;
  root.dataset.density = st.density;
  root.dataset.motion = st.motion ? 'on' : 'off';
  root.dataset.contrast = st.contrast ? 'high' : 'normal';
  const font = (FONTS.find(f => f[0] === st.font) || FONTS[0])[2];
  const head = (FONTS.find(f => f[0] === st.headingFont) || FONTS.find(f => f[0] === st.font) || FONTS[0])[2];
  root.style.setProperty('--fs', Math.max(11, Math.min(24, +st.fontSize || 15)) + 'px');
  root.style.setProperty('--font', font);
  root.style.setProperty('--font-display', head);
  root.style.setProperty('--accent', st.accent);
  // Pick dark or light text for buttons filled with the accent colour.
  const m = /^#?([0-9a-f]{6})$/i.exec(st.accent);
  if (m) {
    const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    root.style.setProperty('--accent-ink', lum > 0.55 ? '#1a1406' : '#ffffff');
  }
}

function mergeDeep(base, over) {
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) base[k] = mergeDeep(base[k], v);
    else base[k] = v;
  }
  return base;
}

const GEAR = [
  ['mouse', 'Mouse', 'M7 3h10v6H7zM12 3v6M6 9h12v6a6 6 0 0 1-12 0z'],
  ['mousepad', 'Mousepad', 'M3 6h18v12H3z'],
  ['keyboard', 'Keyboard', 'M2 7h20v10H2zM6 11h.01M10 11h.01M14 11h.01M18 11h.01M7 14h10'],
  ['headset', 'Headset', 'M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H4zM17 14h3v6h-3z'],
  ['monitor', 'Monitor', 'M3 4h18v12H3zM8 20h8M12 16v4'],
  ['mic', 'Microphone', 'M9 3h6v10H9zM5 11a7 7 0 0 0 14 0M12 18v3']
];

function defaultProfile() {
  return {
    name: '', tag: '', platform: 'PC', region: '', rank: '', peak: '', role: '', aim: 'Wrist', hours: '', bio: '',
    avatar: null, banner: null,
    mainsAtk: [], mainsDef: [],
    gear: {
      mouse: { name: '', notes: '2000 DPI', img: null },
      mousepad: { name: '', notes: '', img: null },
      keyboard: { name: 'MADLIONS MAD 60 HE', notes: '60%, Hall effect, rapid trigger', img: null },
      headset: { name: '', notes: '', img: null },
      monitor: { name: '', notes: '', img: null },
      mic: { name: '', notes: '', img: null }
    },
    specs: { cpu: '', gpu: '', ram: '', storage: '', board: '', os: 'Windows', internet: '' },
    game: { resolution: '', aspect: '5:4', fov: '90', display: 'Fullscreen', fps: '250–300', preset: '', brightness: '', vsync: 'Off', reflex: '', ads: 'Hold', lean: 'Toggle', crouch: 'Hold (Ctrl)', prone: 'Toggle (C)' },
    audio: { range: '', master: '', voice: '', notes: '' },
    keybinds: [
      ['Move', 'W A S D'], ['Lean left / right', 'Q / E'], ['Sprint', 'Left Shift'], ['Crouch (hold)', 'Left Ctrl'],
      ['Prone (toggle)', 'C'], ['Interact / reinforce', 'F'], ['Vault / rappel', 'Space'], ['Reload', 'R'],
      ['Melee', 'V'], ['Secondary gadget', 'G or Mouse 5'], ['Operator ability', 'X or Mouse 4'], ['Drone / cameras', 'T'],
      ['Fire mode', 'B'], ['Push to talk', 'Caps Lock'], ['Ping', 'Middle mouse'], ['Scoreboard', 'Tab']
    ],
    keyboard: [
      ['W A S D', '0.8–1.0 mm', '0.20 mm', '0.15 mm', 'Quick reset on'],
      ['Q / E', '1.2 mm', '0.30 mm', '0.30 mm', 'Quick reset off'],
      ['Ctrl (crouch)', '1.0 mm', '0.20 mm', '0.20 mm', 'Quick reset on'],
      ['Shift (sprint)', '1.2 mm', 'Off', 'Off', ''],
      ['Everything else', '1.5–2.0 mm', 'Off', 'Off', 'Top dead zone 0.15 mm, bottom 0.2 mm']
    ]
  };
}

function defaultSens() {
  return [
    { id: 'sens-before', label: 'Before the change', date: '2026-11-12', dpi: 2000, h: 17, v: 17, mult: 0.02, fov: 90, ads: { '1x': 40, '2.5x': 55, '3.5x': 64, '8x': 73 }, rating: 2, note: 'Recoil was hard to control at this speed.' },
    { id: 'sens-rec', label: 'New setup', date: '2026-11-12', dpi: 2000, h: 9, v: 9, mult: 0.008, fov: 90, ads: { '1x': 50, '2.5x': 50, '3.5x': 50, '8x': 50 }, rating: 0, note: 'About 22 cm/360. Give it a week before judging. Change this if you went with something else.' }
  ];
}

function defaultGoals() {
  return [
    { id: uid(), text: 'Learn every Clubhouse callout', done: false },
    { id: uid(), text: 'Play a week on the new sensitivity before changing it', done: false }
  ];
}

const SCOPES = ['1x', '2.5x', '3.5x', '8x'];
function cm360(e) {
  const degPerInch = (+e.dpi || 0) * (+e.h || 0) * ((+e.mult || 0.02) / 0.02) * 0.00572958;
  return degPerInch > 0 ? 360 / degPerInch * 2.54 : 0;
}
const edpi = e => Math.round((+e.dpi || 0) * (+e.h || 0) * ((+e.mult || 0.02) / 0.02));
const fmtDate = iso => { try { return new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return iso; } };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const currentSens = () => db.sens.find(e => e.id === db.sensCurrent) || db.sens[db.sens.length - 1];
const playerName = () => db.profile.name || db.profile.tag || 'Player';
const initials = () => playerName().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

function paintNavAvatar() {
  const el = $('#navAvatar');
  if (!el) return;
  const img = db.profile.avatar && Store.cachedBlob(db.profile.avatar);
  el.replaceChildren(img ? h('img', { src: img, alt: '' }) : document.createTextNode(initials()));
}

// A line chart drawn in SVG. points: [{ y, label }] in order.
function lineChart(points, opts = {}) {
  const pts = points.filter(p => Number.isFinite(p.y));
  if (pts.length < 2) return h('div', { class: 'chart-empty', text: opts.empty || 'Log at least two entries to see a chart.' });
  const W = 760, H = opts.height || 200, L = 44, R = 14, T = 14, B = 28;
  let lo = Math.min(...pts.map(p => p.y)), hi = Math.max(...pts.map(p => p.y));
  if (opts.min != null) lo = Math.min(lo, opts.min);
  if (lo === hi) { lo -= 1; hi += 1; }
  const padY = (hi - lo) * 0.12; lo -= padY; hi += padY;
  const X = i => L + (W - L - R) * (pts.length === 1 ? 0.5 : i / (pts.length - 1));
  const Y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const color = opts.color || 'var(--accent)';
  const span = hi - lo;
  const fmt = opts.fmt || (v => span > 20 ? Math.round(v) : Math.round(v * 10) / 10);
  const gid = 'g' + uid();
  const ticks = [0, 1, 2, 3].map(k => lo + (hi - lo) * k / 3);
  const path = pts.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ');
  const area = path + ` L${X(pts.length - 1).toFixed(1)} ${H - B} L${X(0).toFixed(1)} ${H - B} Z`;
  const labelIdx = [...new Set([0, Math.floor((pts.length - 1) / 2), pts.length - 1])];
  const esc = Icons.esc;
  const svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.title || 'chart')}">
<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
<g class="grid">${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}"/>`).join('')}</g>
<g class="axis">${ticks.map(t => `<text x="${L - 8}" y="${(Y(t) + 4).toFixed(1)}" text-anchor="end">${esc(fmt(t))}</text>`).join('')}
${labelIdx.map(i => `<text x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}">${esc(pts[i].label || '')}</text>`).join('')}</g>
<path d="${area}" fill="url(#${gid})"/>
<path class="line" d="${path}" stroke="${color}"/>
${pts.map((p, i) => `<circle class="dot" cx="${X(i).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="4.5" fill="${color}"><title>${esc((p.label ? p.label + ': ' : '') + fmt(p.y) + (opts.unit || ''))}</title></circle>`).join('')}
</svg>`;
  const wrap = h('div', {});
  wrap.innerHTML = svg;
  return wrap.firstElementChild;
}

// Image slot used for avatar, banner and gear: click to choose, drop, or paste while hovering.
let hoverSlot = null;
function imageSlot(el, { get, set, max = 512, q = 0.86, key }) {
  const apply = async src => {
    const { url } = await shrinkImage(src, max, q);
    const old = get();
    await Store.putBlob(key, url);
    if (old && old !== key) Store.delBlob(old).catch(() => {});
    set(key); save(); route(); paintNavAvatar();
  };
  el.addEventListener('click', async e => { if (e.target.closest('input,button:not(.slot-btn)')) return; const f = await pickImage(); if (f) apply(f); });
  el.addEventListener('mouseenter', () => { hoverSlot = apply; });
  el.addEventListener('mouseleave', () => { if (hoverSlot === apply) hoverSlot = null; });
  acceptImageDrop(el, async imgs => apply(imgs[0].src));
  return el;
}
document.addEventListener('paste', async e => {
  if (!hoverSlot || typing(e)) return;
  try { const imgs = await imagesFrom(e.clipboardData); if (imgs.length) { e.preventDefault(); await hoverSlot(imgs[0].src); } } catch (err) { toast('Could not use that image: ' + (err.message || err)); }
});

function field(obj, key, label, opts = {}) {
  const input = opts.options
    ? h('select', { value: obj[key] || '', onchange: e => { obj[key] = e.target.value; save(); opts.onchange && opts.onchange(); } },
        opts.options.map(o => h('option', { value: o, text: o || '—' })))
    : h('input', { class: 'in', type: opts.type || 'text', value: obj[key] ?? '', placeholder: opts.ph || '', step: opts.step,
        oninput: e => { obj[key] = opts.type === 'number' ? (e.target.value === '' ? '' : +e.target.value) : e.target.value; save(); opts.oninput && opts.oninput(); } });
  return h('label', { class: 'stack' }, h('span', { class: 'lbl block', text: label }), input);
}

function toggleCtl(checked, onchange) {
  return h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: checked || null, onchange: e => onchange(e.target.checked) }), h('span'));
}

/* ---------- home ---------- */

function renderHome() {
  const p = db.profile;
  const banner = p.banner && Store.cachedBlob(p.banner);
  const avatarImg = p.avatar && Store.cachedBlob(p.avatar);
  const cur = currentSens();
  const rounds = db.strats.flatMap(s => s.results);
  const wins = rounds.filter(r => r.w).length;
  const lastSession = [...db.sessions].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  const hr = new Date().getHours();
  const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';

  const recent = [...db.strats].sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, 5);
  const recentList = recent.length
    ? h('div', { class: 'recent' }, recent.map(s => {
        const m = mapById(s.mapId); const r = record(s);
        return h('a', { href: '#/maps/' + s.mapId + '/s/' + s.id },
          h('span', { class: 'thumb', style: m ? `background-image:${bannerUrl(m)}` : '' }),
          h('span', {}, h('div', { class: 't', text: s.title || 'Untitled strat' }), h('div', { class: 's', text: (m ? m.name : '') + (s.site ? ' · ' + s.site : '') })),
          h('span', { class: 'rec', text: r.n ? `${r.w}–${r.l}` : (s.side === 'atk' ? 'Attack' : 'Defense') }));
      }))
    : h('div', { class: 'chart-empty' }, 'No strats yet. ', h('a', { class: 'link strong', href: '#/maps', text: 'Pick a map to start one' }));

  const goals = h('div', {}, db.goals.slice(0, 6).map(goalRow), db.goals.length ? null : h('p', { class: 'hint', text: 'No goals yet. Add some on the Progress page.' }));

  const sessionsSorted = [...db.sessions].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let runRp = 0;
  const rankedRp = [...db.matches].sort((a, b) => (a.date || '').localeCompare(b.date || '')).filter(m => m.playlist === 'Ranked' && m.rp !== '' && m.rp != null).map(m => { runRp += +m.rp; return { y: runRp, label: fmtDate(dayOf(m)) }; });
  const rpPoints = rankedRp.length >= 2 ? rankedRp : sessionsSorted.filter(s => s.rp !== '' && s.rp != null).map(s => ({ y: +s.rp, label: fmtDate(s.date) }));
  const mains = [...p.mainsAtk, ...p.mainsDef].map(opById).filter(Boolean);

  $('#main').replaceChildren(
    h('div', { class: 'detail', style: 'flex:1' },
      h('section', { class: 'hero', style: banner ? `background-image:linear-gradient(0deg, transparent, transparent), url("${banner}")` : '' },
        h('div', { class: 'hero-row' },
          h('a', { class: 'avatar', href: '#/profile' }, avatarImg ? h('img', { src: avatarImg, alt: '' }) : initials()),
          h('div', {},
            h('div', { class: 'hero-sub', style: 'margin:0 0 .2rem' }, greet),
            h('div', { class: 'hero-name', text: playerName() }),
            h('div', { class: 'hero-sub' },
              p.rank ? h('span', { class: 'pill accent', text: p.rank }) : null,
              h('span', { class: 'pill', text: cm360(cur).toFixed(1) + ' cm/360' }),
              p.platform ? h('span', { class: 'pill', text: p.platform }) : null,
              p.aim ? h('span', { class: 'pill', text: p.aim + ' aimer' }) : null)),
          h('div', { class: 'hero-tools' },
            h('a', { class: 'btn primary', href: '#/tracker/log', text: 'Log a match' }),
            h('a', { class: 'btn', href: '#/maps', text: 'Strats' }),
            h('a', { class: 'btn', href: '#/profile', text: 'Edit profile' })))),
      h('div', { class: 'ed', style: 'max-width:80rem' },
        h('div', { class: 'tiles', style: 'margin-top:var(--gap)' },
          h('div', { class: 'tile accent' }, h('div', { class: 'tile-big', text: cm360(cur).toFixed(1) }), h('div', { class: 'tile-small', text: 'cm/360 · ' + cur.label })),
          h('div', { class: 'tile' }, h('div', { class: 'tile-big', text: String(db.strats.length) }), h('div', { class: 'tile-small', text: db.strats.length === 1 ? 'strat written' : 'strats written' })),
          h('div', { class: 'tile' }, h('div', { class: 'tile-big', text: rounds.length ? pct(wins, rounds.length) + '%' : '–' }), h('div', { class: 'tile-small', text: rounds.length ? `strat win rate (${wins}–${rounds.length - wins})` : 'strat win rate' })),
          (() => { const td = mstats(db.matches.filter(m => dayOf(m) === today())); return h('a', { class: 'tile', href: '#/tracker' }, h('div', { class: 'tile-big', text: td.n ? `${td.w}–${td.l}` : '–' }), h('div', { class: 'tile-small', text: td.n ? `today · ${fmtKD(td.kd)} K/D` : 'no matches today' })); })()),
        ubiState().connected ? h('div', { style: 'margin-top:var(--gap)' }, ubiCard()) : null,
        h('div', { class: 'grid2' },
          section('Pick up where you left off', null, recentList),
          section('Goals', null, goals)),
        h('div', { class: 'grid2' },
          section('Rank points', 'From your logged matches', lineChart(rpPoints, { empty: 'Log ranked matches with their RP change to see your climb.' })),
          section('Your mains', null, mains.length
            ? h('div', { class: 'op-chips' }, mains.map(o => h('a', { class: 'op-chip ' + o.side, href: '#/ops/' + o.id }, Icons.opIcon(o, 34), h('span', { text: o.name }))))
            : h('div', { class: 'chart-empty' }, 'Pick your mains on your ', h('a', { class: 'link strong', href: '#/profile', text: 'profile' }), '.'))))));
}

/* ---------- profile ---------- */

function renderProfile() {
  const p = db.profile;
  const banner = p.banner && Store.cachedBlob(p.banner);
  const avatarImg = p.avatar && Store.cachedBlob(p.avatar);
  const refreshHero = () => {
    const n = $('#heroName'); if (n) n.textContent = playerName();
    paintNavAvatar();
  };

  const hero = h('section', { class: 'hero', title: 'Drop or paste a picture here for your banner', style: banner ? `background-image:url("${banner}")` : '' },
    h('div', { class: 'hero-row' },
      imageSlot(h('div', { class: 'avatar', title: 'Click, drop or paste a picture' }, avatarImg ? h('img', { src: avatarImg, alt: '' }) : initials()),
        { get: () => p.avatar, set: k => { p.avatar = k; }, key: 'profile-avatar', max: 400 }),
      h('div', {},
        h('div', { class: 'hero-name', id: 'heroName', text: playerName() }),
        h('div', { class: 'hero-sub' },
          p.tag ? h('span', { class: 'pill', text: '@' + p.tag }) : null,
          p.rank ? h('span', { class: 'pill accent', text: p.rank }) : null,
          p.platform ? h('span', { class: 'pill', text: p.platform }) : null,
          p.aim ? h('span', { class: 'pill', text: p.aim + ' aimer' }) : null)),
      h('div', { class: 'hero-tools' },
        h('button', { class: 'btn slot-btn', text: banner ? 'Change banner' : 'Add a banner', onclick: async e => { e.stopPropagation(); const f = await pickImage(); if (f) heroApply(f); } }),
        banner ? h('button', { class: 'btn slot-btn', text: 'Remove banner', onclick: async e => { e.stopPropagation(); await Store.delBlob(p.banner).catch(() => {}); p.banner = null; save(); route(); } }) : null)));
  const heroApply = async src => { const { url } = await shrinkImage(src, 1800, 0.84); await Store.putBlob('profile-banner', url); p.banner = 'profile-banner'; save(); route(); };
  acceptImageDrop(hero, async imgs => heroApply(imgs[0].src));
  hero.addEventListener('mouseenter', () => { hoverSlot = heroApply; });
  hero.addEventListener('mouseleave', () => { if (hoverSlot === heroApply) hoverSlot = null; });

  const mainsGrid = (side, key) => h('div', { class: 'mains' }, db.operators.filter(o => o.side === side).sort(byName).map(o => {
    const on = p[key].includes(o.id);
    return h('button', { class: 'main-pick' + (on ? ' on' : ''), title: on ? 'Remove from mains' : 'Add to mains', onclick: e => {
      p[key] = on ? p[key].filter(x => x !== o.id) : [...p[key], o.id]; save();
      e.currentTarget.classList.toggle('on');
    } }, Icons.opIcon(o, 38), h('span', { text: o.name }));
  }));

  const gear = h('div', { class: 'gear-grid' }, GEAR.map(([k, label, icon]) => {
    const g = p.gear[k] = p.gear[k] || { name: '', notes: '', img: null };
    const img = g.img && Store.cachedBlob(g.img);
    const slot = imageSlot(h('div', { class: 'gear-img' + (img ? ' has' : ''), title: 'Click, drop or paste a picture of your ' + label.toLowerCase() },
      img ? h('img', { src: img, alt: '' }) : (() => { const s = h('span'); s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${icon}"/></svg>`; return s; })()),
      { get: () => g.img, set: key => { g.img = key; }, key: 'gear-' + k, max: 360 });
    return h('div', { class: 'gear-card' }, slot,
      h('span', { class: 'gear-kind', text: label }),
      h('input', { class: 'in', type: 'text', value: g.name, placeholder: 'Model', oninput: e => { g.name = e.target.value; save(); } }),
      h('input', { class: 'in', type: 'text', value: g.notes, placeholder: 'Settings, notes', oninput: e => { g.notes = e.target.value; save(); } }));
  }));

  const table = (rows, cols, ph, onAdd) => {
    const t = h('table', { class: 'kb-table' }, h('thead', {}, h('tr', {}, cols.map(c => h('th', { class: 'lbl', style: 'text-align:left;padding:0 .4rem .3rem', text: c })), h('th'))), h('tbody', {}, rows.map((row, ri) => h('tr', {},
      cols.map((c, ci) => h('td', { class: ci === 1 && cols.length === 2 ? 'kb-key' : '' },
        h('input', { class: 'in', type: 'text', value: row[ci] || '', placeholder: ph[ci], oninput: e => { row[ci] = e.target.value; save(); } }))),
      h('td', { class: 'kb-x' }, h('button', { title: 'Remove row', text: '×', onclick: () => { rows.splice(ri, 1); save(); route(); } }))))));
    return h('div', {}, t,
      h('div', { class: 'loadout-foot' }, h('button', { class: 'btn', text: '+ Add row', onclick: () => { rows.push(cols.map(() => '')); save(); route(); } }), onAdd || null));
  };

  $('#main').replaceChildren(h('div', { class: 'detail', style: 'flex:1' },
    hero,
    h('div', { class: 'ed', style: 'max-width:80rem' },
      section('Player', null, h('div', {},
        h('div', { class: 'form-grid' },
          field(p, 'name', 'Display name', { ph: 'What should Stratbook call you?', oninput: refreshHero }),
          field(p, 'tag', 'Ubisoft username', { ph: 'In-game name' }),
          field(p, 'platform', 'Platform', { options: ['PC', 'PlayStation', 'Xbox'] }),
          field(p, 'region', 'Region', { ph: 'e.g. EU West' }),
          field(p, 'rank', 'Current rank', { ph: 'e.g. Platinum 2' }),
          field(p, 'peak', 'Peak rank', { ph: 'e.g. Emerald 4' }),
          field(p, 'role', 'Role', { ph: 'e.g. Entry, support, anchor' }),
          field(p, 'aim', 'Aim style', { options: ['Wrist', 'Arm', 'Hybrid', ''] }),
          field(p, 'hours', 'Hours played', { ph: 'e.g. 900' })),
        h('div', { style: 'margin-top:.8rem' }, h('span', { class: 'lbl block', text: 'About me' }),
          h('textarea', { class: 'notes', value: p.bio, placeholder: 'Playstyle, what you are working on, anything', oninput: e => { p.bio = e.target.value; save(); } })))),
      section('Connected accounts', null, ubiCard()),
      section('Attack mains', 'Click to pick', mainsGrid('atk', 'mainsAtk')),
      section('Defense mains', 'Click to pick', mainsGrid('def', 'mainsDef')),
      section('Gear', 'Click, drop or paste a picture on each box', gear),
      h('div', { class: 'grid2' },
        section('PC specs', null, h('div', { class: 'form-grid' },
          field(p.specs, 'cpu', 'CPU'), field(p.specs, 'gpu', 'Graphics card'), field(p.specs, 'ram', 'RAM'),
          field(p.specs, 'storage', 'Storage'), field(p.specs, 'board', 'Motherboard'), field(p.specs, 'os', 'Windows version'),
          field(p.specs, 'internet', 'Internet / ping'))),
        section('Audio', null, h('div', { class: 'form-grid' },
          field(p.audio, 'range', 'Dynamic range', { options: ['', 'Night mode', 'Hi-fi', 'TV'] }),
          field(p.audio, 'master', 'Master volume'), field(p.audio, 'voice', 'Voice chat volume'), field(p.audio, 'notes', 'Notes')))),
      section('Game settings', 'What you run in Siege', h('div', { class: 'form-grid' },
        field(p.game, 'resolution', 'Resolution', { ph: 'e.g. 1280×1024' }), field(p.game, 'aspect', 'Aspect ratio'),
        field(p.game, 'fov', 'Field of view'), field(p.game, 'display', 'Display mode', { options: ['Fullscreen', 'Borderless', 'Windowed'] }),
        field(p.game, 'fps', 'Frame rate'), field(p.game, 'preset', 'Graphics preset', { ph: 'e.g. Low, textures medium' }),
        field(p.game, 'brightness', 'Brightness'), field(p.game, 'vsync', 'V-Sync', { options: ['Off', 'On'] }),
        field(p.game, 'reflex', 'NVIDIA Reflex', { options: ['', 'Off', 'On', 'On + Boost'] }),
        field(p.game, 'ads', 'Aim down sights', { options: ['Hold', 'Toggle'] }), field(p.game, 'lean', 'Lean', { options: ['Toggle', 'Hold'] }),
        field(p.game, 'crouch', 'Crouch'), field(p.game, 'prone', 'Prone'),
        h('label', { class: 'stack' }, h('span', { class: 'lbl block', text: 'Sensitivity' }),
          h('a', { class: 'btn', href: '#/sens', text: cm360(currentSens()).toFixed(1) + ' cm/360 · open tracker' })))),
      section('Keybinds', null, table(p.keybinds, ['Action', 'Key'], ['Action', 'Key'])),
      section('Keyboard setup', 'Actuation and rapid trigger per key (Hall effect keyboards)',
        table(p.keyboard, ['Keys', 'Actuation', 'Rapid trigger press', 'Rapid trigger release', 'Notes'], ['Keys', 'Actuation', 'Press', 'Release', 'Notes'])))));
}

/* ---------- sensitivity ---------- */

function renderSens() {
  const cur = currentSens();
  const draft = ui.sensDraft = ui.sensDraft || JSON.parse(JSON.stringify(cur));
  draft.ads = draft.ads || {};

  const out = {};
  const readout = h('div', { class: 'readout' },
    ['cm', 'in', 'edpi', 'cmp'].map(k => h('div', { class: 'tile' + (k === 'cm' ? ' accent' : '') },
      out[k] = h('div', { class: 'tile-big' }), out[k + 'l'] = h('div', { class: 'tile-small' }))));
  const paintReadout = () => {
    const c = cm360(draft), was = cm360(cur);
    out.cm.textContent = c ? c.toFixed(1) : '–'; out.cml.textContent = 'cm per 360°';
    out.in.textContent = c ? (c / 2.54).toFixed(1) : '–'; out.inl.textContent = 'inches per 360°';
    out.edpi.textContent = edpi(draft).toLocaleString(); out.edpil.textContent = 'eDPI (DPI × sens at the default multiplier)';
    const diff = was ? (c - was) / was * 100 : 0;
    out.cmp.textContent = Math.abs(diff) < 0.5 ? 'Same' : (diff > 0 ? 'Slower' : 'Faster');
    out.cmpl.textContent = Math.abs(diff) < 0.5 ? 'as your current setup' : `${Math.abs(diff).toFixed(0)}% compared with your current setup`;
  };
  const num = (obj, key, label, step) => field(obj, key, label, { type: 'number', step: step || 'any', oninput: paintReadout });

  const calc = section('Calculator', 'Change any value to see your cm/360. Nothing is saved until you press a button.', h('div', { class: 'calc' },
    h('div', {},
      h('div', { class: 'grid3' },
        num(draft, 'dpi', 'Mouse DPI', 50), num(draft, 'h', 'Horizontal', 1), num(draft, 'v', 'Vertical', 1),
        num(draft, 'mult', 'Multiplier (MouseSensitivityMultiplierUnit)'), num(draft, 'fov', 'Field of view', 1),
        h('label', { class: 'stack' }, h('span', { class: 'lbl block', text: 'Label' }),
          h('input', { class: 'in', type: 'text', value: draft.label || '', placeholder: 'e.g. Slower test', oninput: e => { draft.label = e.target.value; } }))),
      h('div', { class: 'lbl', style: 'margin:1rem 0 .4rem', text: 'Aim down sights' }),
      h('div', { class: 'grid4' }, SCOPES.map(sc => num(draft.ads, sc, sc, 1))),
      h('div', { class: 'loadout-foot' },
        h('button', { class: 'btn primary', text: 'Save as a new setup', onclick: async () => {
          const label = await ask('Name this setup', draft.label && draft.label !== cur.label ? draft.label : '');
          if (label === null) return;
          const e = { ...JSON.parse(JSON.stringify(draft)), id: uid(), label: label.trim() || 'Setup ' + (db.sens.length + 1), date: today(), rating: 0, note: '' };
          db.sens.push(e); db.sensCurrent = e.id; ui.sensDraft = null; save(); route(); toast('Saved and set as your current sensitivity');
        } }),
        h('button', { class: 'btn', text: 'Update current setup', onclick: () => {
          Object.assign(cur, JSON.parse(JSON.stringify(draft)), { id: cur.id, date: cur.date, note: cur.note, rating: cur.rating });
          ui.sensDraft = null; save(); route(); toast('Current setup updated');
        } }),
        h('button', { class: 'link', text: 'Reset to current', onclick: () => { ui.sensDraft = null; route(); } }))),
    h('div', {}, readout,
      h('p', { class: 'hint', style: 'margin:.8rem 0 0' }, 'Most Siege players sit somewhere around 18–30 cm/360. Lower numbers are faster.'))));

  const stars = e => h('span', { class: 'stars', title: 'How it felt' }, [1, 2, 3, 4, 5].map(k =>
    h('button', { class: k <= (e.rating || 0) ? 'on' : '', text: '★', 'aria-label': k + ' stars', onclick: () => { e.rating = e.rating === k ? 0 : k; save(); route(); } })));

  const history = [...db.sens].reverse().map(e => h('div', { class: 'sens-entry' + (e.id === cur.id ? ' current' : '') },
    h('div', {},
      h('div', { style: 'display:flex;align-items:baseline;gap:.7rem;flex-wrap:wrap' },
        h('span', { class: 'big', text: cm360(e).toFixed(1) + ' cm' }),
        h('b', { text: e.label || 'Setup' }),
        e.id === cur.id ? h('span', { class: 'status works', text: 'Current' }) : null,
        h('span', { class: 'hint', text: fmtDate(e.date) })),
      h('div', { class: 'vals', text: `${e.dpi} DPI · ${e.h}/${e.v} · multiplier ${e.mult} · FOV ${e.fov} · ADS ${SCOPES.map(s => s + ' ' + ((e.ads || {})[s] ?? '–')).join(', ')}` })),
    h('div', { class: 'acts' },
      stars(e),
      e.id !== cur.id ? h('button', { class: 'btn', text: 'Use this', onclick: () => { db.sensCurrent = e.id; ui.sensDraft = null; save(); route(); } }) : null,
      h('button', { class: 'link', text: 'Load', title: 'Load into the calculator', onclick: () => { ui.sensDraft = JSON.parse(JSON.stringify(e)); route(); } }),
      db.sens.length > 1 ? h('button', { class: 'danger', text: 'Delete', onclick: async () => {
        if (!(await confirmBox('Delete "' + (e.label || 'Setup') + '"?', null, 'Delete', true))) return;
        db.sens = db.sens.filter(x => x !== e); if (db.sensCurrent === e.id) db.sensCurrent = db.sens[db.sens.length - 1].id; save(); route();
      } }) : null),
    h('textarea', { class: 'note notes', style: 'min-height:3rem', value: e.note || '', placeholder: 'How did it feel? Recoil, flicks, holding angles…', oninput: ev => { e.note = ev.target.value; save(); } })));

  const chartPts = db.sens.map(e => ({ y: +cm360(e).toFixed(2), label: (e.label || '') }));
  $('#main').replaceChildren(
    h('header', { class: 'head' }, h('div', { class: 'head-num' }),
      h('div', {}, h('h1', { class: 'head-title', text: 'Sensitivity' }),
        h('div', { class: 'head-sub' }, 'Current: ', h('b', { text: cm360(cur).toFixed(1) + ' cm/360' }), '·', cur.label)),
      h('div', { class: 'head-tools' })),
    h('section', { class: 'detail', style: 'flex:1' }, h('div', { class: 'ed', style: 'max-width:80rem' },
      calc,
      section('Every setup you have tried', 'Newest first', h('div', {}, history)),
      section('cm/360 over time', null, lineChart(chartPts, { unit: ' cm', empty: 'Save a second setup to see how your sensitivity changes.' })))));
  paintReadout();
}

/* ---------- progress ---------- */

function goalRow(g) {
  return h('div', { class: 'goal' + (g.done ? ' done' : '') },
    h('input', { type: 'checkbox', checked: g.done || null, onchange: e => { g.done = e.target.checked; save(); e.target.closest('.goal').classList.toggle('done', g.done); } }),
    h('span', { class: 'text', text: g.text }),
    h('button', { class: 'del', text: '×', title: 'Remove goal', onclick: () => { db.goals = db.goals.filter(x => x !== g); save(); route(); } }));
}

function renderProgress() {
  const sessions = [...db.sessions].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const sum = k => sessions.reduce((n, s) => n + (+s[k] || 0), 0);
  const kills = sum('kills'), deaths = sum('deaths'), wins = sum('wins'), losses = sum('losses');
  const hsList = sessions.filter(s => s.hs !== '' && s.hs != null);
  const avgHs = hsList.length ? hsList.reduce((n, s) => n + +s.hs, 0) / hsList.length : null;

  const f = ui.sessionDraft = ui.sessionDraft || { date: today(), mode: 'Ranked', rank: db.profile.rank || '', rp: '', kills: '', deaths: '', wins: '', losses: '', hs: '', feel: '', notes: '' };
  const form = h('div', {},
    h('div', { class: 'log-form' },
      field(f, 'date', 'Date', { type: 'date' }),
      field(f, 'mode', 'Playlist', { options: ['Ranked', 'Unranked', 'Quick Match', 'Custom / scrim', 'Aim training'] }),
      field(f, 'rank', 'Rank', { ph: 'e.g. Plat 2' }),
      field(f, 'rp', 'Rank points', { type: 'number' }),
      field(f, 'kills', 'Kills', { type: 'number' }), field(f, 'deaths', 'Deaths', { type: 'number' }),
      field(f, 'wins', 'Matches won', { type: 'number' }), field(f, 'losses', 'Matches lost', { type: 'number' }),
      field(f, 'hs', 'Headshot %', { type: 'number' }),
      field(f, 'feel', 'How it went', { options: ['', 'Great', 'Good', 'Okay', 'Rough', 'Tilted'] }),
      h('label', { class: 'stack wide' }, h('span', { class: 'lbl block', text: 'Notes' }),
        h('input', { class: 'in', type: 'text', value: f.notes, placeholder: 'What went well, what to work on', oninput: e => { f.notes = e.target.value; } }))),
    h('div', { class: 'loadout-foot' }, h('button', { class: 'btn primary', text: 'Add session', onclick: () => {
      db.sessions.push({ ...f, id: uid() });
      if (f.rank) db.profile.rank = f.rank;
      ui.sessionDraft = null; save(); route(); toast('Session logged');
    } })));

  const kdPts = sessions.filter(s => (+s.kills || +s.deaths)).map(s => ({ y: +((+s.kills || 0) / Math.max(1, +s.deaths || 0)).toFixed(2), label: fmtDate(s.date) }));
  const rpPts = sessions.filter(s => s.rp !== '' && s.rp != null).map(s => ({ y: +s.rp, label: fmtDate(s.date) }));
  const rows = [...sessions].reverse();
  const tbl = rows.length ? h('table', { class: 'session-table' },
    h('thead', {}, h('tr', {}, ['Date', 'Playlist', 'Rank', 'RP', 'K–D', 'K/D', 'W–L', 'HS %', 'Felt', 'Notes', ''].map(t => h('th', { text: t })))),
    h('tbody', {}, rows.map(s => h('tr', {},
      h('td', { text: fmtDate(s.date) }), h('td', { text: s.mode }), h('td', { text: s.rank || '' }), h('td', { class: 'num', text: s.rp ?? '' }),
      h('td', { class: 'num', text: (s.kills !== '' || s.deaths !== '') ? `${s.kills || 0}–${s.deaths || 0}` : '' }),
      h('td', { class: 'num', text: (+s.kills || +s.deaths) ? ((+s.kills || 0) / Math.max(1, +s.deaths || 0)).toFixed(2) : '' }),
      h('td', { class: 'num', text: (s.wins !== '' || s.losses !== '') ? `${s.wins || 0}–${s.losses || 0}` : '' }),
      h('td', { class: 'num', text: s.hs !== '' && s.hs != null ? s.hs + '%' : '' }),
      h('td', { text: s.feel || '' }), h('td', { class: 'hint', text: s.notes || '' }),
      h('td', {}, h('button', { class: 'del', text: '×', title: 'Delete session', onclick: async () => {
        if (!(await confirmBox('Delete this session?', fmtDate(s.date) + ' · ' + s.mode, 'Delete', true))) return;
        db.sessions = db.sessions.filter(x => x !== s); save(); route();
      } })))))) : h('div', { class: 'chart-empty', text: 'No sessions yet. Log your first one above.' });

  const goalIn = h('input', { class: 'in', type: 'text', placeholder: 'Add a goal, e.g. Reach Emerald', style: 'flex:1',
    onkeydown: e => { if (e.key === 'Enter' && e.target.value.trim()) { db.goals.push({ id: uid(), text: e.target.value.trim(), done: false }); save(); route(); } } });
  const done = db.goals.filter(g => g.done).length;

  $('#main').replaceChildren(
    trackerHead('daily'),
    h('section', { class: 'detail', style: 'flex:1' }, h('div', { class: 'ed', style: 'max-width:80rem' },
      h('div', { class: 'tiles' },
        h('div', { class: 'tile accent' }, h('div', { class: 'tile-big', text: deaths || kills ? (kills / Math.max(1, deaths)).toFixed(2) : '–' }), h('div', { class: 'tile-small', text: `K/D overall (${kills}–${deaths})` })),
        h('div', { class: 'tile' }, h('div', { class: 'tile-big', text: wins + losses ? pct(wins, wins + losses) + '%' : '–' }), h('div', { class: 'tile-small', text: `match win rate (${wins}–${losses})` })),
        h('div', { class: 'tile' }, h('div', { class: 'tile-big', text: avgHs != null ? avgHs.toFixed(0) + '%' : '–' }), h('div', { class: 'tile-small', text: 'average headshot rate' })),
        h('div', { class: 'tile' }, h('div', { class: 'tile-big', text: String(sessions.length) }), h('div', { class: 'tile-small', text: sessions.length === 1 ? 'session logged' : 'sessions logged' }))),
      section('Log a whole session', 'For days when you just want to jot down totals instead of each match', form),
      h('div', { class: 'grid2' },
        section('Rank points', null, lineChart(rpPts, { empty: 'Add rank points to two sessions to see your climb.' })),
        section('K/D per session', null, lineChart(kdPts, { color: 'var(--good)', fmt: v => v.toFixed(2), empty: 'Add kills and deaths to two sessions to see a trend.' }))),
      section('Sessions', 'Newest first', h('div', { style: 'overflow-x:auto' }, tbl)),
      section('Goals', db.goals.length ? `${done} of ${db.goals.length} done` : null, h('div', {},
        db.goals.map(goalRow),
        h('div', { class: 'loadout-foot' }, goalIn, h('button', { class: 'btn', text: 'Add', onclick: () => { if (goalIn.value.trim()) { db.goals.push({ id: uid(), text: goalIn.value.trim(), done: false }); save(); route(); } } })))))));
}

/* ---------- settings ---------- */

function renderSettings() {
  const st = db.settings;
  const set = (k, v, rerender = true) => { st[k] = v; save(); applySettings(); if (rerender) route(); };
  const row = (t, d, ctl) => h('div', { class: 'setting' }, h('div', { class: 't', text: t }), d ? h('div', { class: 'd', text: d }) : null, h('div', { class: 'c' }, ctl));
  const segCtl = (k, opts) => h('div', { class: 'seg' }, opts.map(([v, label]) => h('button', { class: st[k] === v ? 'on' : '', text: label, onclick: () => set(k, v) })));
  const sizeVal = h('span', { class: 'range-val', text: st.fontSize + ' px' });
  const sizeRange = h('input', { type: 'range', min: '12', max: '22', step: '1', value: st.fontSize, style: 'width:12rem',
    oninput: e => { st.fontSize = +e.target.value; sizeVal.textContent = st.fontSize + ' px'; applySettings(); save(); } });
  const fontSel = k => h('select', { value: st[k], onchange: e => set(k, e.target.value) }, FONTS.map(([v, label]) => h('option', { value: v, text: label })));

  $('#main').replaceChildren(
    h('header', { class: 'head' }, h('div', { class: 'head-num' }),
      h('div', {}, h('h1', { class: 'head-title', text: 'Settings' }), h('div', { class: 'head-sub', text: 'Make Stratbook look and feel the way you want.' })),
      h('div', { class: 'head-tools' })),
    h('section', { class: 'detail', style: 'flex:1' }, h('div', { class: 'ed', style: 'max-width:56rem' },
      section('Text', null, h('div', {},
        row('Text size', 'Scales the whole app', h('div', { class: 'field-inline' },
          h('button', { class: 'btn', text: 'A−', 'aria-label': 'Smaller text', onclick: () => set('fontSize', Math.max(12, st.fontSize - 1)) }),
          sizeRange, sizeVal,
          h('button', { class: 'btn', text: 'A+', 'aria-label': 'Larger text', onclick: () => set('fontSize', Math.min(22, st.fontSize + 1)) }))),
        row('Font', 'Used for all text', fontSel('font')),
        row('Heading font', 'Used for page titles and big numbers', fontSel('headingFont')),
        h('div', { class: 'font-preview' },
          h('div', { class: 'a', style: 'font-family:var(--font-display)', text: 'Clubhouse · CCTV fast hit' }),
          h('div', { class: 'b', text: 'Hibana opens the CCTV wall from Rafters while Thatcher clears the Bandit batteries. 0123456789' })))),
      section('Appearance', null, h('div', {},
        row('Theme', null, segCtl('theme', [['dark', 'Dark'], ['midnight', 'Midnight'], ['light', 'Light']])),
        row('Accent colour', 'Buttons, highlights and charts', h('div', { class: 'swatches' },
          ACCENTS.map(c => h('button', { class: 'swatch-btn' + (st.accent.toLowerCase() === c ? ' on' : ''), style: '--c:' + c, 'aria-label': 'Accent ' + c, onclick: () => set('accent', c) })),
          h('input', { type: 'color', value: st.accent, title: 'Any colour', onchange: e => set('accent', e.target.value) }))),
        row('Spacing', 'How roomy pages are', segCtl('density', [['compact', 'Compact'], ['comfortable', 'Comfortable'], ['spacious', 'Spacious']])))),
      section('Accessibility', null, h('div', {},
        row('Animations', 'Turn off to stop movement and transitions', toggleCtl(st.motion, v => set('motion', v))),
        row('High contrast', 'Brighter text and stronger outlines', toggleCtl(st.contrast, v => set('contrast', v))),
        row('Reset look', 'Back to the default theme, font and size', h('button', { class: 'btn', text: 'Reset', onclick: () => { db.settings = defaultSettings(); save(); applySettings(); route(); } })))),
      section('Your data', null, h('div', {},
        row('Back up everything', 'Strats, boards, profile, progress and all your pictures in one file', h('button', { class: 'btn primary', text: 'Export backup', onclick: exportData })),
        row('Restore a backup', 'Replaces what is in the app now', h('button', { class: 'btn', text: 'Import backup', onclick: () => $('#importFile').click() })),
        (() => { const r = row('Data folder', 'Where Stratbook keeps your files', h('span', { class: 'hint', text: '…' })); Store.dataPath().then(p => { r.querySelector('.c span').textContent = p; }).catch(() => {}); return r; })())),
      section('About', null, h('p', { class: 'hint', style: 'margin:0' }, 'Stratbook 2.2 · made for you · keyboard: ', h('kbd', { text: 'Ctrl K' }), ' search, ', h('kbd', { text: 'N' }), ' new strat on a map')))));
}


/* ================= tracker (your own R6 tracker, from matches you log) ================= */

const PLAYLISTS = ['Ranked', 'Unranked', 'Quick Match', 'Custom / scrim', 'Arcade'];
const nowLocal = () => { const d = new Date(); return `${today()}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dayOf = m => (m.date || '').slice(0, 10);

function blankMatch() {
  const last = [...db.matches].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  return { date: nowLocal(), playlist: last ? last.playlist : 'Ranked', map: last ? last.map : '', result: '', rw: '', rl: '',
    kills: '', deaths: '', assists: '', hs: '', ops: [], rp: '', rank: last ? last.rank : (db.profile.rank || ''), mvp: false, notes: '' };
}

// Totals for a list of matches.
function mstats(list) {
  const t = { n: list.length, w: 0, l: 0, d: 0, k: 0, de: 0, a: 0, hs: 0, hsK: 0, rw: 0, rl: 0, rp: 0, mvp: 0 };
  for (const m of list) {
    if (m.result === 'W') t.w++; else if (m.result === 'L') t.l++; else if (m.result === 'D') t.d++;
    t.k += +m.kills || 0; t.de += +m.deaths || 0; t.a += +m.assists || 0;
    if (m.hs !== '' && m.hs != null) { t.hs += +m.hs || 0; t.hsK += +m.kills || 0; }
    t.rw += +m.rw || 0; t.rl += +m.rl || 0; t.rp += +m.rp || 0; if (m.mvp) t.mvp++;
  }
  t.kd = t.de ? t.k / t.de : t.k;
  t.win = t.w + t.l ? t.w / (t.w + t.l) * 100 : null;
  t.hsp = t.hsK ? t.hs / t.hsK * 100 : null;
  t.kpr = t.rw + t.rl ? t.k / (t.rw + t.rl) : null;
  t.avgK = t.n ? t.k / t.n : 0;
  return t;
}

function streak(list) {
  const s = [...list].filter(m => m.result === 'W' || m.result === 'L').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!s.length) return null;
  let n = 0; for (const m of s) { if (m.result === s[0].result) n++; else break; }
  return { kind: s[0].result, n };
}

const kdTone = kd => kd >= 1.15 ? 'good' : kd < 0.9 ? 'bad' : '';
const fmtKD = v => (Math.round(v * 100) / 100).toFixed(2);
const fmtPct = v => v == null ? '–' : Math.round(v) + '%';
const fmtRP = v => (v > 0 ? '+' : '') + v;

function trackerHead(active) {
  const tabs = [['', 'Overview'], ['log', 'Log a match'], ['matches', 'Matches'], ['ops', 'Operators'], ['maps', 'Maps'], ['daily', 'Daily log']];
  return h('header', { class: 'head' }, h('div', { class: 'head-num' }),
    h('div', {}, h('h1', { class: 'head-title', text: 'Tracker' }),
      h('div', { class: 'head-sub', text: 'Your own R6 tracker: log matches in a few seconds and get the stats.' })),
    h('div', { class: 'head-tools' },
      h('div', { class: 'seg' }, tabs.map(([k, label]) => h('a', { class: 'segl' + (active === k ? ' on' : ''), href: '#/tracker' + (k ? '/' + k : ''), text: label })))));
}

function matchRow(m) {
  const map = mapById(m.map);
  const ops = (m.ops || []).map(opById).filter(Boolean);
  const kd = (+m.deaths || 0) ? (+m.kills || 0) / (+m.deaths) : (+m.kills || 0);
  return h('a', { class: 'match ' + (m.result === 'W' ? 'win' : m.result === 'L' ? 'loss' : 'draw'), href: '#/tracker/log/' + m.id, title: 'Click to edit' },
    h('span', { class: 'match-res', text: m.result === 'W' ? 'Win' : m.result === 'L' ? 'Loss' : m.result === 'D' ? 'Draw' : '–' }),
    h('span', { class: 'thumb', style: map ? `background-image:${bannerUrl(map)}` : '' }),
    h('span', { class: 'match-main' },
      h('span', { class: 't', text: (map ? map.name : 'Map not set') + (m.rw !== '' || m.rl !== '' ? `  ${m.rw || 0}–${m.rl || 0}` : '') }),
      h('span', { class: 's', text: `${m.playlist} · ${fmtDate(dayOf(m))}${m.date && m.date.length > 10 ? ' ' + m.date.slice(11, 16) : ''}${m.mvp ? ' · MVP' : ''}${m.synced ? ' · synced from Ubisoft' : ''}` })),
    h('span', { class: 'match-ops' }, ops.slice(0, 4).map(o => Icons.opIcon(o, 26))),
    h('span', { class: 'match-kda' }, h('b', { text: `${m.kills || 0} / ${m.deaths || 0} / ${m.assists || 0}` }), h('span', { class: 's ' + kdTone(kd), text: fmtKD(kd) + ' K/D' })),
    h('span', { class: 'match-rp ' + ((+m.rp || 0) > 0 ? 'up' : (+m.rp || 0) < 0 ? 'down' : ''), text: m.rp !== '' && m.rp != null ? fmtRP(+m.rp) + ' RP' : '' }));
}

function statTile(big, small, cls) {
  return h('div', { class: 'tile' + (cls ? ' ' + cls : '') }, h('div', { class: 'tile-big', text: big }), h('div', { class: 'tile-small', text: small }));
}

function renderTracker(tab, id) {
  if (tab === 'daily') { renderProgress(); return; }
  if (tab === 'log') { renderLogMatch(id); return; }
  const all = [...db.matches].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const body = h('div', { class: 'ed', style: 'max-width:84rem' });
  if (!tab) body.append(ubiCard());
  if (!all.length && tab !== 'log') {
    body.append(h('div', { class: 'empty', style: 'padding-left:0' },
      h('h3', { text: 'No matches yet' }),
      h('p', { text: 'After each match, log it here. It takes a few seconds, and your K/D, win rate, rank chart and operator and map stats build up automatically.' }),
      h('a', { class: 'btn primary', href: '#/tracker/log', text: 'Log your first match' })));
  } else if (!tab) body.append(...trackerOverview(all));
  else if (tab === 'matches') body.append(...trackerMatches(all));
  else if (tab === 'ops') body.append(...trackerOps(all));
  else if (tab === 'maps') body.append(...trackerMaps(all));
  $('#main').replaceChildren(trackerHead(tab || ''), h('section', { class: 'detail', style: 'flex:1' }, body));
}

function trackerOverview(all) {
  const t = mstats(all);
  const todays = all.filter(m => dayOf(m) === today());
  const td = mstats(todays);
  const st = streak(all);
  const ranked = all.filter(m => m.playlist === 'Ranked');

  // Rank points over ranked matches: running total of RP changes.
  let run = 0;
  const rpPts = ranked.filter(m => m.rp !== '' && m.rp != null).map(m => { run += +m.rp; return { y: run, label: fmtDate(dayOf(m)) }; });
  // K/D per day.
  const days = [...new Set(all.map(dayOf))];
  const kdPts = days.map(d => { const s = mstats(all.filter(m => dayOf(m) === d)); return { y: +s.kd.toFixed(2), label: fmtDate(d) }; });

  const opCounts = new Map();
  for (const m of all) for (const id of m.ops || []) opCounts.set(id, [...(opCounts.get(id) || []), m]);
  const topOps = [...opCounts.entries()].map(([id, ms]) => ({ op: opById(id), s: mstats(ms) })).filter(x => x.op).sort((a, b) => b.s.n - a.s.n).slice(0, 6);
  const mapRows = db.maps.map(mp => ({ mp, s: mstats(all.filter(m => m.map === mp.id)) })).filter(x => x.s.n);
  const bestMap = [...mapRows].filter(x => x.s.win != null).sort((a, b) => b.s.win - a.s.win || b.s.n - a.s.n)[0];
  const worstMap = [...mapRows].filter(x => x.s.win != null).sort((a, b) => a.s.win - b.s.win || b.s.n - a.s.n)[0];

  return [
    h('div', { class: 'today' },
      h('div', { class: 'today-head' }, h('b', { text: 'Today' }), h('span', { class: 'hint', text: fmtDate(today()) }),
        h('a', { class: 'btn primary', href: '#/tracker/log', style: 'margin-left:auto', text: '+ Log a match' })),
      todays.length
        ? h('div', { class: 'today-grid' },
            statTile(`${td.w}–${td.l}`, `${td.n} match${td.n === 1 ? '' : 'es'} · ${fmtPct(td.win)} wins`),
            statTile(fmtKD(td.kd), `K/D (${td.k} kills, ${td.de} deaths)`, kdTone(td.kd)),
            statTile(fmtPct(td.hsp), 'headshots'),
            statTile(td.rp ? fmtRP(td.rp) : '0', 'rank points today', td.rp > 0 ? 'good' : td.rp < 0 ? 'bad' : ''))
        : h('p', { class: 'hint', style: 'margin:.2rem 0 0', text: 'Nothing logged today yet.' })),
    h('div', { class: 'tiles', style: 'margin-top:var(--gap)' },
      statTile(fmtKD(t.kd), `K/D overall (${t.k}–${t.de})`, 'accent'),
      statTile(fmtPct(t.win), `win rate (${t.w}–${t.l}${t.d ? '–' + t.d : ''})`),
      statTile(t.kpr != null ? t.kpr.toFixed(2) : '–', 'kills per round'),
      statTile(fmtPct(t.hsp), 'headshot rate')),
    h('div', { class: 'tiles', style: 'margin-top:var(--gap)' },
      statTile(String(t.n), t.n === 1 ? 'match logged' : 'matches logged'),
      statTile(t.avgK.toFixed(1), 'kills per match'),
      statTile(st ? `${st.n} ${st.kind === 'W' ? 'W' : 'L'}` : '–', st ? (st.kind === 'W' ? 'win streak' : 'losing streak') : 'streak', st ? (st.kind === 'W' ? 'good' : 'bad') : ''),
      statTile(String(t.mvp), 'MVPs')),
    h('div', { class: 'grid2' },
      section('Rank points', 'Ranked matches, change since you started logging', lineChart(rpPts, { fmt: v => Math.round(v), empty: 'Add the RP change to ranked matches to see your climb.' })),
      section('K/D by day', null, lineChart(kdPts, { color: 'var(--good)', fmt: v => v.toFixed(2), empty: 'Log matches on two different days to see a trend.' }))),
    section('Recent matches', null, h('div', { class: 'matches' }, [...all].reverse().slice(0, 8).map(matchRow),
      all.length > 8 ? h('a', { class: 'link strong', href: '#/tracker/matches', text: 'See all ' + all.length + ' matches' }) : null)),
    h('div', { class: 'grid2' },
      section('Most played operators', null, topOps.length
        ? h('div', { class: 'bars' }, topOps.map(x => h('a', { class: 'bar-row', href: '#/ops/' + x.op.id },
            h('span', { class: 'bar-lbl' }, Icons.opIcon(x.op, 24), h('span', { text: x.op.name })),
            h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill ' + (x.s.win >= 55 ? 'good' : x.s.win != null && x.s.win < 45 ? 'bad' : ''), style: `width:${x.s.win ?? 0}%` }), h('span', { class: 'bar-50' })),
            h('span', { class: 'bar-val', text: `${x.s.n}×  ${fmtPct(x.s.win)}  ${fmtKD(x.s.kd)}` }))))
        : h('p', { class: 'hint', text: 'Pick the operators you played when you log a match.' })),
      section('Maps', bestMap ? `Best: ${bestMap.mp.name} (${fmtPct(bestMap.s.win)}) · Worst: ${worstMap.mp.name} (${fmtPct(worstMap.s.win)})` : null,
        mapRows.length ? h('div', { class: 'bars' }, mapRows.sort((a, b) => b.s.n - a.s.n).slice(0, 8).map(x => h('a', { class: 'bar-row', href: '#/tracker/maps' },
          h('span', { class: 'bar-lbl' }, h('span', { class: 'mini-banner', style: `background-image:${bannerUrl(x.mp)}` }), h('span', { text: x.mp.name })),
          h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: `width:${x.s.win ?? 0}%;background:${mapColor(x.mp)}` }), h('span', { class: 'bar-50' })),
          h('span', { class: 'bar-val', text: `${x.s.n}×  ${fmtPct(x.s.win)}` }))))
        : h('p', { class: 'hint', text: 'No maps yet.' }))),
    section('Goals', null, h('div', {}, db.goals.map(goalRow), db.goals.length ? null : h('p', { class: 'hint', text: 'Add goals on the Daily log tab.' })))
  ];
}

function trackerMatches(all) {
  ui.mFilter = ui.mFilter || { playlist: '', map: '' };
  const f = ui.mFilter;
  const list = [...all].reverse().filter(m => (!f.playlist || m.playlist === f.playlist) && (!f.map || m.map === f.map));
  const t = mstats(list);
  return [
    h('div', { class: 'pic-tools', style: 'margin-top:.4rem' },
      h('select', { value: f.playlist, onchange: e => { f.playlist = e.target.value; route(); } }, h('option', { value: '', text: 'All playlists' }), PLAYLISTS.map(p => h('option', { value: p, text: p }))),
      h('select', { value: f.map, onchange: e => { f.map = e.target.value; route(); } }, h('option', { value: '', text: 'All maps' }), db.maps.map(m => h('option', { value: m.id, text: m.name }))),
      h('span', { class: 'hint', text: `${t.n} matches · ${fmtPct(t.win)} wins · ${fmtKD(t.kd)} K/D · ${fmtPct(t.hsp)} headshots` })),
    h('div', { class: 'matches' }, list.map(matchRow))
  ];
}

function trackerOps(all) {
  const by = new Map();
  for (const m of all) for (const id of m.ops || []) by.set(id, [...(by.get(id) || []), m]);
  const rows = [...by.entries()].map(([id, ms]) => ({ op: opById(id), s: mstats(ms) })).filter(x => x.op).sort((a, b) => b.s.n - a.s.n);
  const head = ['Operator', 'Matches', 'Win %', 'W–L', 'Kills', 'Deaths', 'K/D', 'Headshots', 'K per match'];
  return [
    h('p', { class: 'hint', style: 'margin:.4rem 0 .2rem', text: 'Each match counts for every operator you picked in it, so stats from matches where you played more than one operator are shared between them.' }),
    section('Operators', null, rows.length ? h('div', { style: 'overflow-x:auto' }, h('table', { class: 'session-table' },
      h('thead', {}, h('tr', {}, head.map(x => h('th', { text: x })))),
      h('tbody', {}, rows.map(x => h('tr', {},
        h('td', {}, h('a', { class: 'op-cell', href: '#/ops/' + x.op.id }, Icons.opIcon(x.op, 26), h('span', { text: x.op.name }))),
        h('td', { class: 'num', text: x.s.n }), h('td', { class: 'num', text: fmtPct(x.s.win) }), h('td', { class: 'num', text: `${x.s.w}–${x.s.l}` }),
        h('td', { class: 'num', text: x.s.k }), h('td', { class: 'num', text: x.s.de }),
        h('td', { class: 'num ' + kdTone(x.s.kd), text: fmtKD(x.s.kd) }), h('td', { class: 'num', text: fmtPct(x.s.hsp) }),
        h('td', { class: 'num', text: x.s.avgK.toFixed(1) })))))) : h('p', { class: 'hint', text: 'Pick the operators you played when you log a match.' }))
  ];
}

function trackerMaps(all) {
  const rows = db.maps.map(mp => ({ mp, s: mstats(all.filter(m => m.map === mp.id)) })).filter(x => x.s.n).sort((a, b) => b.s.n - a.s.n);
  return [h('div', { class: 'map-stats' }, rows.map(x => h('a', { class: 'map-stat', href: '#/maps/' + x.mp.id, style: `--map:${mapColor(x.mp)};background-image:linear-gradient(90deg, var(--surface) 35%, transparent), ${bannerUrl(x.mp)}` },
    h('div', { class: 'ms-name', text: x.mp.name }),
    h('div', { class: 'ms-vals' },
      h('span', {}, h('b', { text: fmtPct(x.s.win) }), ' wins'),
      h('span', {}, h('b', { text: `${x.s.w}–${x.s.l}` }), ' record'),
      h('span', {}, h('b', { class: kdTone(x.s.kd), text: fmtKD(x.s.kd) }), ' K/D'),
      h('span', {}, h('b', { text: x.s.rw + x.s.rl ? `${x.s.rw}–${x.s.rl}` : '–' }), ' rounds'))))),
    rows.length ? null : h('p', { class: 'hint', text: 'No maps logged yet.' })];
}

function renderLogMatch(id) {
  const editing = id && db.matches.find(m => m.id === id);
  if (!ui.matchDraft || ui.matchDraft._for !== (id || 'new')) ui.matchDraft = Object.assign(editing ? JSON.parse(JSON.stringify(editing)) : blankMatch(), { _for: id || 'new' });
  const m = ui.matchDraft;

  const resBtn = (v, label) => h('button', { class: 'res-btn ' + v + (m.result === v ? ' on' : ''), text: label, onclick: () => { m.result = m.result === v ? '' : v; paintRes(); } });
  const resWrap = h('div', { class: 'res-btns' });
  const paintRes = () => resWrap.replaceChildren(resBtn('W', 'Win'), resBtn('L', 'Loss'), resBtn('D', 'Draw'));
  paintRes();

  const opQuery = { v: '' };
  const picks = h('div', {});
  const paintPicks = () => {
    const q = opQuery.v.trim().toLowerCase();
    picks.replaceChildren(...['atk', 'def'].map(side => h('div', { class: 'op-pick-row' },
      h('span', { class: 'lbl', text: side === 'atk' ? 'Attack' : 'Defense' }),
      h('div', { class: 'op-pick' }, db.operators.filter(o => o.side === side && (!q || o.name.toLowerCase().includes(q))).sort(byName).map(o =>
        h('button', { class: 'op-pick-btn' + (m.ops.includes(o.id) ? ' on' : ''), title: o.name, onclick: () => {
          m.ops = m.ops.includes(o.id) ? m.ops.filter(x => x !== o.id) : [...m.ops, o.id]; paintPicks();
        } }, Icons.opIcon(o, 34), h('span', { text: o.name })))))));
  };
  paintPicks();

  const numF = (key, label, ph) => h('label', { class: 'stack' }, h('span', { class: 'lbl block', text: label }),
    h('input', { class: 'in', type: 'number', value: m[key] ?? '', placeholder: ph || '', oninput: e => { m[key] = e.target.value === '' ? '' : +e.target.value; } }));

  const saveIt = more => {
    if (!m.result) { toast('Pick Win, Loss or Draw first'); return; }
    const clean = { ...m }; delete clean._for;
    if (editing) Object.assign(editing, clean);
    else { clean.id = uid(); db.matches.push(clean); }
    if (clean.rank) db.profile.rank = clean.rank;
    save();
    const next = blankMatch();
    ui.matchDraft = more ? Object.assign(next, { _for: 'new', ops: [...m.ops] }) : null;
    toast(editing ? 'Match updated' : 'Match logged');
    go(more ? '#/tracker/log' : '#/tracker');
    if (more) route();
  };

  const form = h('div', { class: 'ed', style: 'max-width:72rem' },
    section(editing ? 'Edit match' : 'Log a match', 'Only the result is required. Fill in what you remember.', h('div', {},
      h('div', { class: 'log-top' },
        resWrap,
        h('label', { class: 'stack' }, h('span', { class: 'lbl block', text: 'Map' }),
          h('select', { value: m.map, onchange: e => { m.map = e.target.value; } }, h('option', { value: '', text: 'Choose map' }), db.maps.map(mp => h('option', { value: mp.id, text: mp.name })))),
        h('label', { class: 'stack' }, h('span', { class: 'lbl block', text: 'Playlist' }),
          h('select', { value: m.playlist, onchange: e => { m.playlist = e.target.value; } }, PLAYLISTS.map(p => h('option', { value: p, text: p })))),
        h('label', { class: 'stack' }, h('span', { class: 'lbl block', text: 'When' }),
          h('input', { class: 'in', type: 'datetime-local', value: m.date, onchange: e => { m.date = e.target.value; } }))),
      h('div', { class: 'log-form', style: 'margin-top:1rem' },
        numF('rw', 'Rounds won', '4'), numF('rl', 'Rounds lost', '2'),
        numF('kills', 'Kills'), numF('deaths', 'Deaths'), numF('assists', 'Assists'), numF('hs', 'Headshot kills'),
        numF('rp', 'RP change', '+28 or -22'),
        h('label', { class: 'stack' }, h('span', { class: 'lbl block', text: 'Rank after' }),
          h('input', { class: 'in', type: 'text', value: m.rank || '', placeholder: 'e.g. Plat 2', oninput: e => { m.rank = e.target.value; } })),
        h('label', { class: 'stack' }, h('span', { class: 'lbl block', text: 'MVP' }), h('div', { style: 'height:2.3rem;display:flex;align-items:center' }, toggleCtl(m.mvp, v => { m.mvp = v; })))))),
    section('Operators you played', 'Click every operator you used this match', h('div', {},
      h('input', { class: 'in', type: 'text', placeholder: 'Find operator', style: 'width:15rem;margin-bottom:.6rem', oninput: e => { opQuery.v = e.target.value; paintPicks(); } }),
      picks)),
    section('Notes', null, h('textarea', { class: 'notes', value: m.notes || '', placeholder: 'What worked, what didn\'t, who was annoying', oninput: e => { m.notes = e.target.value; } })),
    h('div', { class: 'loadout-foot', style: 'margin-top:var(--gap)' },
      h('button', { class: 'btn primary', text: editing ? 'Save changes' : 'Save match', onclick: () => saveIt(false) }),
      editing ? null : h('button', { class: 'btn', text: 'Save and log another', onclick: () => saveIt(true) }),
      h('a', { class: 'link', href: '#/tracker', text: 'Cancel', onclick: () => { ui.matchDraft = null; } }),
      editing ? h('button', { class: 'danger', style: 'margin-left:auto', text: 'Delete match', onclick: async () => {
        if (!(await confirmBox('Delete this match?', null, 'Delete', true))) return;
        db.matches = db.matches.filter(x => x !== editing); ui.matchDraft = null; save(); go('#/tracker');
      } }) : null));

  $('#main').replaceChildren(trackerHead('log'), h('section', { class: 'detail', style: 'flex:1' }, form));
}


/* ================= Ubisoft connection ================= */

const UBI_BOARDS = { ranked: 'Ranked', standard: 'Unranked', casual: 'Quick Match', event: 'Arcade', warmup: 'Warm up' };
const RANK_TIERS = ['Copper', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond'];
function rankName(n) {
  n = +n || 0;
  if (n <= 0) return 'Unranked';
  if (n >= 36) return 'Champion';
  const tier = RANK_TIERS[Math.floor((n - 1) / 5)];
  const div = 5 - ((n - 1) % 5);
  return tier ? `${tier} ${div}` : 'Rank ' + n;
}

const ubiApi = {
  call(cmd, args) {
    const T = window.__TAURI__;
    if (!T || !T.core) return Promise.reject(new Error('Connecting Ubisoft only works in the installed app.'));
    return T.core.invoke(cmd, args || {});
  },
  login: (email, password) => ubiApi.call('ubi_login', { email, password }),
  login2fa: (ticket, code, appId) => ubiApi.call('ubi_login_2fa', { ticket, code, appId }),
  status: () => ubiApi.call('ubi_status'),
  logout: () => ubiApi.call('ubi_logout'),
  stats: () => ubiApi.call('ubi_fetch_stats')
};

function ubiState() {
  return (db.ubi = db.ubi || { connected: false, name: '', autolog: true, snapshots: [], lastSync: null, lastError: '' });
}

// Turn Ubisoft's full_profiles reply into { board: { kills, deaths, wins, losses, abandons, rp, rank, maxRank, season } }.
function parseUbi(text) {
  const j = JSON.parse(text);
  const out = {};
  const fams = j.platform_families_full_profiles || [];
  for (const fam of fams) for (const b of fam.board_ids_full_profiles || []) {
    const fp = (b.full_profiles || [])[0];
    if (!fp) continue;
    const pr = fp.profile || {}, ss = fp.season_statistics || {}, mo = ss.match_outcomes || {};
    out[b.board_id] = {
      kills: +ss.kills || 0, deaths: +ss.deaths || 0,
      wins: +mo.wins || 0, losses: +mo.losses || 0, abandons: +mo.abandons || 0,
      rp: +pr.rank_points || 0, rank: +pr.rank || 0, maxRank: +pr.max_rank || 0, season: pr.season_id ?? null
    };
  }
  if (!Object.keys(out).length) throw new Error('Ubisoft replied, but without any stats. Reply started: ' + text.slice(0, 160));
  return out;
}

const boardDelta = (a, b) => ({
  kills: b.kills - a.kills, deaths: b.deaths - a.deaths, wins: b.wins - a.wins, losses: b.losses - a.losses,
  abandons: b.abandons - a.abandons, rp: b.rp - a.rp
});

let ubiSyncing = false;
async function syncUbi(manual) {
  const u = ubiState();
  if (!u.connected || ubiSyncing) return;
  // After Ubisoft says "too many attempts", stay quiet for 30 minutes.
  if (!manual && u.pausedUntil && Date.now() < u.pausedUntil) return;
  if (manual && u.pausedUntil && Date.now() < u.pausedUntil) {
    toast(`Ubisoft asked Stratbook to slow down. Try again in about ${Math.ceil((u.pausedUntil - Date.now()) / 60000)} minutes.`);
    return;
  }
  ubiSyncing = true;
  try {
    const boards = parseUbi(await ubiApi.stats());
    const prev = u.snapshots[u.snapshots.length - 1];
    const snap = { t: Date.now(), boards };
    u.lastSync = snap.t; u.lastError = '';
    let logged = 0, sessions = 0;
    if (prev) {
      for (const [id, now] of Object.entries(boards)) {
        const was = prev.boards[id];
        if (!was || was.season !== now.season) continue;
        const d = boardDelta(was, now);
        const games = d.wins + d.losses + d.abandons;
        if (games <= 0) continue;
        if (!u.autolog) continue;
        const playlist = UBI_BOARDS[id] || id;
        if (games === 1) {
          db.matches.push({
            id: uid(), date: nowLocal(), playlist, map: '', result: d.wins ? 'W' : 'L', rw: '', rl: '',
            kills: d.kills, deaths: d.deaths, assists: '', hs: '', ops: [],
            rp: id === 'ranked' ? d.rp : '', rank: id === 'ranked' ? rankName(now.rank) : '', mvp: false,
            notes: d.abandons ? 'Abandoned. Synced from Ubisoft.' : 'Synced from Ubisoft. Add the map and operators.', synced: true
          });
          logged++;
        } else {
          db.sessions.push({ id: uid(), date: today(), mode: playlist, rank: id === 'ranked' ? rankName(now.rank) : '', rp: id === 'ranked' ? now.rp : '',
            kills: d.kills, deaths: d.deaths, wins: d.wins, losses: d.losses, hs: '', feel: '', notes: `${games} matches synced from Ubisoft` });
          sessions++;
        }
      }
    }
    if (boards.ranked) db.profile.rank = rankName(boards.ranked.rank);
    u.snapshots.push(snap);
    if (u.snapshots.length > 400) u.snapshots.splice(0, u.snapshots.length - 400);
    save();
    if (logged || sessions) toast(logged ? `Synced: ${logged} new match${logged > 1 ? 'es' : ''} logged from Ubisoft` : `Synced: ${sessions} batch${sessions > 1 ? 'es' : ''} added to your daily log`);
    else if (manual) toast('Synced with Ubisoft. Nothing new since last time.');
    const hsh = location.hash, act = document.activeElement;
    const busy = act && /^(INPUT|TEXTAREA|SELECT)$/.test(act.tagName);
    if (!busy && ['', '#/', '#/home', '#/tracker', '#/tracker/matches', '#/tracker/ops', '#/tracker/maps', '#/tracker/daily'].includes(hsh)) route();
  } catch (e) {
    u.lastError = e.message || String(e);
    if (/too many/i.test(u.lastError)) u.pausedUntil = Date.now() + 30 * 60 * 1000;
    save();
    if (manual) toast(u.lastError);
    if (/session expired/i.test(u.lastError)) { u.connected = false; save(); }
  } finally {
    ubiSyncing = false;
  }
}

// Ubisoft numbers for today: latest snapshot minus the last one taken before today.
function ubiToday() {
  const u = ubiState();
  const snaps = u.snapshots;
  if (!snaps.length) return null;
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const latest = snaps[snaps.length - 1];
  const base = [...snaps].reverse().find(s => s.t < midnight.getTime()) || snaps[0];
  const out = {};
  for (const [id, now] of Object.entries(latest.boards)) {
    const was = base.boards[id];
    out[id] = was && was.season === now.season ? boardDelta(was, now) : null;
  }
  return { latest: latest.boards, today: out };
}

function connectUbiDialog() {
  const overlay = h('div', { class: 'modal' });
  const email = h('input', { class: 'in', type: 'email', placeholder: 'Ubisoft account email', autocomplete: 'username' });
  const pass = h('input', { class: 'in', type: 'password', placeholder: 'Password', autocomplete: 'current-password' });
  const code = h('input', { class: 'in', type: 'text', placeholder: '6-digit code', inputmode: 'numeric', autocomplete: 'one-time-code' });
  const err = h('div', { class: 'ubi-err' });
  const step2 = h('div', { hidden: true }, h('p', { class: 'hint', text: 'Your account has two-step verification. Enter the code from your authenticator app, email or text.' }), code);
  const step1 = h('div', {}, email, pass);
  const ok = h('button', { class: 'btn primary', type: 'submit', text: 'Connect' });
  let tfa = null;
  const close = () => overlay.remove();
  const form = h('form', { class: 'modal-box ubi-box', onsubmit: async e => {
    e.preventDefault();
    const uu = ubiState();
    if (uu.pausedUntil && Date.now() < uu.pausedUntil) {
      err.textContent = `Ubisoft blocked sign-ins for a while after too many attempts. Wait about ${Math.ceil((uu.pausedUntil - Date.now()) / 60000)} more minutes, then try once.`;
      return;
    }
    err.textContent = ''; ok.disabled = true; ok.textContent = 'Connecting…';
    try {
      const r = tfa ? await ubiApi.login2fa(tfa.twoFactorTicket, code.value, tfa.appId) : await ubiApi.login(email.value.trim(), pass.value);
      if (r.status === '2fa') {
        tfa = r; step1.hidden = true; step2.hidden = false; ok.textContent = 'Verify'; ok.disabled = false; code.focus();
        return;
      }
      const u = ubiState();
      u.connected = true; u.name = r.name || ''; u.lastError = '';
      if (u.name && !db.profile.tag) db.profile.tag = u.name;
      pass.value = '';
      save(); close();
      toast('Connected to Ubisoft as ' + (u.name || 'your account'));
      await syncUbi(true);
      route();
    } catch (e2) {
      err.textContent = e2.message || String(e2);
      if (/too many/i.test(err.textContent)) { ubiState().pausedUntil = Date.now() + 30 * 60 * 1000; save(); }
      ok.disabled = false; ok.textContent = tfa ? 'Verify' : 'Connect';
    }
  } },
    h('div', { class: 'modal-title', text: 'Connect your Ubisoft account' }),
    h('p', { class: 'modal-body' }, 'Stratbook signs in to Ubisoft the way Ubisoft\'s own stats site does, then reads your season stats. ',
      h('b', { text: 'Your password is sent only to Ubisoft and is never saved.' }),
      ' Only Ubisoft\'s sign-in token is kept on this PC so you stay connected.'),
    step1, step2, err,
    h('p', { class: 'hint', style: 'margin:.2rem 0 1rem' }, 'This is not an official Ubisoft feature, so it can stop working if Ubisoft changes things. Disconnect any time.'),
    h('div', { class: 'modal-btns' }, h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: close }), ok));
  overlay.append(form);
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  document.body.append(overlay);
  setTimeout(() => email.focus(), 30);
}

async function disconnectUbi() {
  if (!(await confirmBox('Disconnect Ubisoft?', 'Stratbook stops syncing and deletes its saved Ubisoft sign-in. Matches already logged stay.', 'Disconnect', true))) return;
  try { await ubiApi.logout(); } catch (e) {}
  const u = ubiState(); u.connected = false; save(); route();
}

function ubiCard() {
  const u = ubiState();
  if (!u.connected) {
    return h('div', { class: 'ubi-card' },
      h('div', { class: 'ubi-logo', text: 'U' }),
      h('div', { class: 'ubi-text' }, h('b', { text: 'Connect your Ubisoft account' }),
        h('span', { class: 'hint', text: 'Sync your rank and season stats, and log matches automatically after each game.' }),
        u.lastError ? h('span', { class: 'ubi-err', text: u.lastError }) : null),
      h('button', { class: 'btn primary', text: 'Connect Ubisoft', onclick: connectUbiDialog }));
  }
  const t = ubiToday();
  const r = t && t.latest.ranked;
  const rt = t && t.today.ranked;
  const kd = r ? (r.deaths ? r.kills / r.deaths : r.kills) : 0;
  const ago = u.lastSync ? Math.max(0, Math.round((Date.now() - u.lastSync) / 60000)) : null;
  return h('div', { class: 'ubi-card on' },
    h('div', { class: 'ubi-logo', text: 'U' }),
    h('div', { class: 'ubi-text' },
      h('b', { text: 'Ubisoft · ' + (u.name || 'connected') }),
      h('span', { class: 'hint', text: u.lastSync ? `Last synced ${ago === 0 ? 'just now' : ago + ' min ago'} · checks every 4 minutes while Stratbook is open` : 'Not synced yet' }),
      u.lastError ? h('span', { class: 'ubi-err', text: u.lastError }) : null),
    r ? h('div', { class: 'ubi-stats' },
      h('div', {}, h('b', { text: rankName(r.rank) }), h('span', { text: `${r.rp} RP` })),
      h('div', {}, h('b', { text: `${r.wins}–${r.losses}` }), h('span', { text: 'ranked this season' })),
      h('div', {}, h('b', { text: fmtKD(kd) }), h('span', { text: 'season K/D' })),
      rt ? h('div', {}, h('b', { class: rt.rp > 0 ? 'good' : rt.rp < 0 ? 'bad' : '', text: (rt.rp > 0 ? '+' : '') + rt.rp + ' RP' }),
        h('span', { text: `today · ${rt.wins}–${rt.losses}, ${rt.kills}/${rt.deaths}` })) : null) : null,
    h('div', { class: 'ubi-acts' },
      h('button', { class: 'btn', text: 'Sync now', onclick: () => syncUbi(true) }),
      h('label', { class: 'check', title: 'Add a match to your tracker whenever a sync shows you played one' },
        h('input', { type: 'checkbox', checked: u.autolog || null, onchange: e => { u.autolog = e.target.checked; save(); } }), 'Auto-log matches'),
      h('button', { class: 'link', text: 'Disconnect', onclick: disconnectUbi })));
}

// Check the saved connection on start, then keep syncing while the app is open.
async function startUbi() {
  const u = ubiState();
  try {
    const st = await ubiApi.status();
    u.connected = !!st.connected;
    if (st.name) u.name = st.name;
  } catch (e) { u.connected = false; }
  if (u.connected) { setTimeout(() => syncUbi(false), 2500); setInterval(() => syncUbi(false), 4 * 60 * 1000); }
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
if ($('#exportBtn')) $('#exportBtn').addEventListener('click', exportData);
$('#webBtn').addEventListener('click', async () => { const q = await ask('Search the web', ''); if (q) webSearch(q); });
if ($('#importBtn')) $('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });
window.addEventListener('hashchange', route);
document.addEventListener('contextmenu', e => { if (!typing(e)) e.preventDefault(); });

load().then(() => { route(); startUbi(); });
})();
