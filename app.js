/* The Danish Causal Atlas, viewer. Reads ONLY site/data/ (graph.json, taxonomy.json,
   papers.json, stats.json, written by pipeline/build_atlas.py). Hash routing so every
   view, with its filters, is a link.  Vendored d3 + minisearch, nothing else. */
'use strict';
const $ = s => document.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ARROW = '→', MINUS = '−', MID = ' · ';
const SIGNG = { '+': ['+', 'pos'], '-': [MINUS, 'neg'], '0': ['0', 'nul'], '?': ['?', 'unk'], contested: ['±', 'con'] };
const sg = s => SIGNG[s] || SIGNG['?'];
const signHtml = s => { const [g, c] = sg(s); return '<span class="sign ' + c + '" title="' + esc(signWord(s)) + '">' + g + '</span>'; };
const signWord = s => ({ '+': 'increases', '-': 'decreases', '0': 'no effect', '?': 'sign unclear', contested: 'contested' })[s] || s;
const nice = s => String(s || '').replace(/_/g, ' ');
const go = h => { location.hash = h; };
const num = (x, d) => x == null ? '' : (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('en') : Number(x).toFixed(d == null ? 2 : d));
function qmul(a, b) { if (a === '0' || b === '0') return '0'; if (a === '?' || b === '?') return '?'; return a === b ? '+' : '-'; }
function qadd(a, b) { if (a == null) return b || '0'; if (b == null) return a; if (a === b) return a; if (a === '0') return b; if (b === '0') return a; return '?'; }
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let G, TAX, PAPERS, STATS, SEARCH;
const NODE = {}, CONCEPT = {}, PAPER = {}, EDGE = {}, DOMCOL = {}, POS = {};
const PALETTE = ['#1a4f8a', '#17795e', '#a8621a', '#6b3fa0', '#2a7f9e', '#7a6a1a', '#b5485d', '#555'];
const domCol = d => DOMCOL[d] || '#9b998c';

/* ================= load ================= */
(async function init() {
  let data;
  try {
    data = await Promise.all(['data/graph.json', 'data/taxonomy.json', 'data/papers.json', 'data/stats.json']
      .map(u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); })));
  } catch (err) {
    $('#app').innerHTML = '<div class="wrap"><p class="empty">The atlas data did not load (' + esc(err.message) +
      '). Build it with <code>python pipeline/build_atlas.py --all</code> and serve the site folder.</p></div>';
    throw err;
  }
  [G, TAX, PAPERS, STATS] = data;
  G.nodes.forEach(n => NODE[n.id] = n);
  TAX.concepts.concat(TAX.unplaced).forEach(c => CONCEPT[c.id] = c);
  PAPERS.forEach(p => PAPER[p.artid] = p);
  G.edges.forEach(e => EDGE[e.id] = e);
  (G.meta.domains || []).forEach((d, i) => DOMCOL[d] = PALETTE[i % PALETTE.length]);
  DOMCOL.unplaced = '#9b998c';
  SEARCH = new MiniSearch({
    fields: ['label', 'aliases', 'summary', 'definition', 'wordings', 'id'], storeFields: ['id'],
    searchOptions: { prefix: true, fuzzy: 0.2, boost: { label: 3, aliases: 2, id: 2 } } });
  SEARCH.addAll(TAX.concepts.map(c => ({ id: c.id, label: c.label || '', aliases: (c.aliases || []).join(' '),
    summary: c.summary || '', definition: c.definition || '', wordings: (c.wordings || []).map(w => w.text).join(' ') })));
  window.addEventListener('hashchange', route);
  route();
})();

/* ================= router ================= */
function parseHash() {
  const h = location.hash.slice(1) || '/graph';
  const [path, qs] = h.split('?');
  const seg = path.split('/').filter(Boolean);
  const q = {};
  (qs || '').split('&').forEach(kv => { if (!kv) return; const i = kv.indexOf('=');
    const k = i < 0 ? kv : kv.slice(0, i), v = i < 0 ? '' : kv.slice(i + 1);
    try { q[decodeURIComponent(k)] = decodeURIComponent(v); } catch (e) { q[k] = v; } });
  let arg = seg.slice(1).join('/');
  try { arg = decodeURIComponent(arg); } catch (e) { /* keep */ }
  return { head: seg[0] || 'graph', arg: arg, q: q };
}
function hashFor(head, q) {
  const qs = Object.entries(q || {}).filter(([, v]) => v != null && v !== '' && v !== false)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
  return '#/' + head + (qs ? '?' + qs : '');
}
function route() {
  const r = parseHash();
  document.querySelectorAll('nav .links a').forEach(a => a.classList.toggle('on', a.dataset.r === r.head ||
    (r.head === 'paper' && a.dataset.r === 'papers') || (r.head === 'concept' && a.dataset.r === 'taxonomy')));
  window.scrollTo(0, 0);
  const app = $('#app'); app.innerHTML = '';
  const isGraph = !(r.head === 'taxonomy' || r.head === 'concept' || r.head === 'papers' || r.head === 'paper' || r.head === 'about');
  document.body.classList.toggle('graph-page', isGraph);
  setNavh(); window.addEventListener('resize', setNavh); if (document.fonts && document.fonts.ready) document.fonts.ready.then(setNavh);
  if (r.head === 'taxonomy') return viewTaxonomy(app, r.q);
  if (r.head === 'concept') return viewTaxonomy(app, { open: r.arg });
  if (r.head === 'papers') return viewPapers(app);
  if (r.head === 'about') return viewAbout(app);
  if (r.head === 'paper') return viewPaper(app, r.arg);
  return viewGraph(app, r.q);
}
const wrap = (app, cls) => { const w = el('div', 'wrap' + (cls ? ' ' + cls : '')); app.appendChild(w); return w; };

/* ================= citations ================= */
function cite(artid, withJournal) {
  const p = PAPER[artid]; if (!p) return artid;
  const last = a => { const t = String(a).trim().split(/\s+/); return t[t.length - 1]; };
  const au = (p.authors || []).map(last);
  let s = au.length === 0 ? (p.title || artid) : au.length === 1 ? au[0] : au.length === 2 ? au[0] + ' and ' + au[1]
        : au.length === 3 ? au[0] + ', ' + au[1] + ' and ' + au[2] : au[0] + ' et al.';
  if (p.year) s += ' (' + p.year + ')';
  return withJournal && p.journal ? s + ', ' + p.journal : s;
}
const citeLink = (artid, wj) => '<a href="#/paper/' + encodeURIComponent(artid) + '" title="' +
  esc((PAPER[artid] || {}).title || '') + '">' + esc(cite(artid, wj)) + '</a>';
const conceptLabel = id => (NODE[id] && NODE[id].label) || (CONCEPT[id] && CONCEPT[id].label) || id;
const conceptPath = id => { const c = CONCEPT[id]; if (!c) return ''; const parts = [c.domain];
  if (c.parent && CONCEPT[c.parent]) parts.push(CONCEPT[c.parent].label); return parts.map(nice).join(' › '); };

/* ================= the graph state and subset ================= */
const S = { concepts: [], scopes: [], years: null, mode: 'data', neighbours: true, fold: false, rejected: false, unplaced: false, view: 'network' };
function stateFrom(q) {
  S.concepts = (q.c || '').split(',').filter(Boolean);
  S.scopes = (q.s || '').split(',').filter(Boolean);
  S.mode = q.m === 'pub' ? 'pub' : 'data';
  const b = bounds();
  if (q.y && /^\d{4}-\d{4}$/.test(q.y)) { const [a, c] = q.y.split('-').map(Number); S.years = [Math.max(b[0], a), Math.min(b[1], c)]; }
  else S.years = null;
  S.neighbours = q.nb !== '0'; S.fold = q.fold === '1'; S.rejected = q.rej === '1'; S.unplaced = q.unp === '1';
  S.view = q.v === 'chord' ? 'chord' : 'network';
}
function stateQuery() {
  const b = bounds();
  return { c: S.concepts.join(','), s: S.scopes.join(','), m: S.mode === 'pub' ? 'pub' : '',
           y: S.years && (S.years[0] > b[0] || S.years[1] < b[1]) ? S.years[0] + '-' + S.years[1] : '',
           nb: S.neighbours ? '' : '0', fold: S.fold ? '1' : '', rej: S.rejected ? '1' : '', unp: S.unplaced ? '1' : '', v: S.view === 'chord' ? 'chord' : '' };
}
function bounds() { const y = G.meta.years[S.mode === 'pub' ? 'pub' : 'data']; return [y[0] || 1900, y[1] || 2030]; }
function recordYears(r) {
  if (S.mode === 'pub') { const y = (PAPER[r.paper] || {}).year; return [y, y]; }
  return [r.years.from, r.years.to];
}
function keepRecord(r) {
  if (r.verdict !== 'accepted' && !S.rejected) return false;
  if (S.scopes.length && !(r.scope_tags || []).some(t => S.scopes.indexOf(t) >= 0)) return false;
  if (S.years) { const [a, b] = recordYears(r); if (a != null && b != null && (b < S.years[0] || a > S.years[1])) return false; }
  return true;
}
/* Mirrors build_atlas.aggregate(): the corpus view of one concept pair. */
function aggregate(records) {
  const papers = [], signs = { '+': [], '-': [], '0': [], '?': [] }, kinds = {}, tags = new Set(), strategies = new Set();
  let sgn = null, causal = false, lo = null, hi = null;
  records.forEach(r => {
    if (papers.indexOf(r.paper) < 0) papers.push(r.paper);
    const s = signs[r.sign] ? r.sign : '?';
    if (signs[s].indexOf(r.paper) < 0) signs[s].push(r.paper);
    sgn = qadd(sgn, s);
    kinds[r.kind || 'unknown'] = (kinds[r.kind || 'unknown'] || 0) + 1;
    causal = causal || r.kind === 'causal';
    (r.scope_tags || []).forEach(t => tags.add(t));
    (r.strategies || []).forEach(x => { if (x.strategy) strategies.add(x.strategy); });
    const y = r.years || {};
    if (y.from != null) { lo = lo == null ? y.from : Math.min(lo, y.from); hi = hi == null ? y.to : Math.max(hi, y.to); }
  });
  const pos = new Set(signs['+']), neg = new Set(signs['-']);
  const union = new Set([...pos, ...neg]);
  const contradiction = pos.size > 0 && neg.size > 0 && union.size > 1;
  const flags = [];
  if (contradiction) flags.push('contradiction');
  if ([...pos].some(p => neg.has(p))) flags.push('within_paper_mixed');
  if (signs['0'].length && (pos.size || neg.size)) flags.push('null_vs_effect');
  return { papers, n_papers: papers.length, signs, design_pending: records.every(r => r.design_pending), consensus_sign: contradiction ? 'contested' : (sgn || '?'),
           has_contradiction: contradiction, flags, causal, kinds, years: { from: lo, to: hi },
           scope_tags: [...tags].sort(), strategies: [...strategies].sort() };
}
const foldId = id => { const c = CONCEPT[id]; return (S.fold && c && c.parent) ? c.parent : id; };
function foldSign(r, f, t) {
  let s = r.sign;
  [[r.from, f], [r.to, t]].forEach(([o, n]) => { if (o !== n && CONCEPT[o] && CONCEPT[o].direction === 'higher_is_less') s = qmul(s, '-'); });
  return s;
}
function subset(records, applyFilters) {
  const groups = {};
  records.forEach(r => {
    if (applyFilters && !keepRecord(r)) return;
    if (applyFilters && !S.unplaced && (r.from[0] === '?' || r.to[0] === '?')) return;
    const f = applyFilters ? foldId(r.from) : r.from, t = applyFilters ? foldId(r.to) : r.to;
    if (f === t) return;
    const rr = (f !== r.from || t !== r.to) ? Object.assign({}, r, { sign: foldSign(r, f, t), from: f, to: t, folded: true }) : r;
    (groups[f + '->' + t] = groups[f + '->' + t] || []).push(rr);
  });
  let edges = Object.entries(groups).map(([id, recs]) => Object.assign({ id, from: recs[0].from, to: recs[0].to, records: recs }, aggregate(recs)));
  edges.forEach(e => { if (groups[e.to + '->' + e.from]) e.flags.push('bidirectional'); });
  if (applyFilters && S.concepts.length) {
    const sel = new Set(S.concepts.flatMap(descendants).map(foldId));
    edges = edges.filter(e => S.neighbours ? (sel.has(e.from) || sel.has(e.to)) : (sel.has(e.from) && sel.has(e.to)));
  }
  const nodes = new Set(); edges.forEach(e => { nodes.add(e.from); nodes.add(e.to); });
  return { edges, nodes };
}
const allRecords = () => G.edges.flatMap(e => e.records);

/* ================= graph page ================= */
function descendants(id) { const out = [id]; ((CONCEPT[id] || {}).children || []).forEach(k => out.push(...descendants(k))); return out; }
function papersDeep(id) { const s = new Set(); descendants(id).forEach(x => ((CONCEPT[x] || {}).papers || []).forEach(p => s.add(p))); return s.size; }
function paperCount(c) {
  const deep = c.id ? papersDeep(c.id) : 0;
  return c.n_papers + ' paper' + (c.n_papers === 1 ? '' : 's') + (deep > c.n_papers ? ' (' + deep + ' with sub-concepts)' : '');
}
function viewGraph(app, q) {
  stateFrom(q || {});
  const stage = el('div', 'stage'); app.appendChild(stage);
  window.onresize = () => { const h = document.getElementById('cy'); if (h && h.__fit) h.__fit(0); };
  const cy = el('div'); cy.id = 'cy'; stage.appendChild(cy);

  /* left overlay: the filters */
  const left = el('div', 'overlay left'); stage.appendChild(left);
  const vw = el('div', 'ctl view'); left.appendChild(vw);
  vw.appendChild(el('label', 't', 'View'));
  const vchips = el('div', 'chips'); vw.appendChild(vchips);
  const c1 = el('div', 'ctl search'); left.appendChild(c1);
  c1.appendChild(el('label', 't', 'Concepts'));
  const q1 = el('input', 'searchbar'); q1.type = 'search'; q1.placeholder = 'type a concept…  earnings, mortality, tax rate'; q1.setAttribute('aria-label', 'search concepts');
  c1.appendChild(q1);
  const dd = el('div', 'dropdown'); dd.setAttribute('role', 'listbox'); c1.appendChild(dd);
  const chips1 = el('div', 'chips'); c1.appendChild(chips1);
  let hits = [], active = -1;
  const renderDD = () => { dd.innerHTML = ''; dd.classList.toggle('open', hits.length > 0);
    hits.forEach((h, i) => { const c = CONCEPT[h.id]; if (!c) return;
      const o = el('div', 'opt' + (i === active ? ' active' : ''), '<span>' + esc(c.label) + '</span><span class="d">' + esc(conceptPath(h.id)) +
        '</span><span class="n">' + esc(paperCount(c)) + '</span>');
      o.setAttribute('role', 'option'); o.onmousedown = ev => { ev.preventDefault(); pick(h.id); }; dd.appendChild(o); }); };
  const pick = id => { if (S.concepts.indexOf(id) < 0) S.concepts.push(id); q1.value = ''; hits = []; active = -1; renderDD(); apply(); };
  q1.oninput = () => { const t = q1.value.trim(); hits = t ? SEARCH.search(t).slice(0, 8) : []; active = -1; renderDD(); };
  q1.onkeydown = ev => { if (ev.key === 'ArrowDown') { active = Math.min(hits.length - 1, active + 1); renderDD(); ev.preventDefault(); }
    else if (ev.key === 'ArrowUp') { active = Math.max(0, active - 1); renderDD(); ev.preventDefault(); }
    else if (ev.key === 'Enter' && hits.length) { pick(hits[Math.max(0, active)].id); ev.preventDefault(); }
    else if (ev.key === 'Escape') { hits = []; renderDD(); } };
  q1.onblur = () => setTimeout(() => { hits = []; renderDD(); }, 150);

  const sect = (title, open) => { const d = el('details', 'sect'); d.open = !!open; d.appendChild(el('summary', null, title)); left.appendChild(d); return d; };
  const d2 = sect('Population', true); const chips2 = el('div', 'chips'); d2.appendChild(chips2);
  const d3 = sect('Years <span class="yr"></span>', true);
  const sl = el('div', 'slider', '<div class="track"></div><div class="fill"></div>'); d3.appendChild(sl);
  const r0 = el('input'), r1 = el('input'); r0.type = r1.type = 'range'; r0.setAttribute('aria-label', 'from year'); r1.setAttribute('aria-label', 'to year');
  sl.appendChild(r0); sl.appendChild(r1);
  const ticks = el('div', 'ticks'); sl.appendChild(ticks);
  const mode = el('div', 'mode'); d3.appendChild(mode);
  const note = el('div', 'small'); d3.appendChild(note);
  const d4 = sect('Options', false); const tog = el('div', 'toggles'); d4.appendChild(tog);

  /* bottom-left: numbers, counts after filters, legend */
  const foot = el('div', 'overlay foot'); stage.appendChild(foot);
  const T0 = STATS.totals;
  foot.appendChild(el('div', 'strip', [[T0.papers, 'papers'], [T0.records_accepted, 'relations'], [T0.concepts_touched, 'concepts'], [T0.contradictions, 'contested']]
    .map(([n, k]) => '<span><b>' + n + '</b> ' + k + '</span>').join('')));
  const counts = el('div', 'counts'); foot.appendChild(counts);
  const lg = el('details', 'sect'); lg.appendChild(el('summary', null, 'Legend')); lg.appendChild(legend());
  lg.appendChild(el('p', 'small', 'Arrows point from cause to effect and are coloured by sign: green increases, red decreases, grey no effect; dashed when the sign is unclear or contested; ' +
    'dotted when the paper\u2019s design records exist but none is an identified design; faint when the design pass has not run for the paper yet. Line width counts papers; node colour is the concept\u2019s domain. ' +
    'Click an arrow for the papers behind it with their evidence, a concept for its summary and wordings. Every view, with its filters, is a link.'));
  foot.appendChild(lg);

  /* right: the evidence panel, shown on click */
  const panel = el('aside', 'overlay panel'); panel.id = 'panel'; panel.hidden = true; stage.appendChild(panel);
  const pclose = el('button', 'pclose', '×'); pclose.title = 'close'; pclose.setAttribute('aria-label', 'close panel'); pclose.onclick = () => { panel.hidden = true; if (cy.__focus) cy.__focus(null); };
  setNavh();
  window.onkeydown = ev => { if (ev.key === 'Escape') { panel.hidden = true; if (cy.__focus) cy.__focus(null); } };
  const pbody = el('div', 'pbody'); panel.appendChild(pclose); panel.appendChild(pbody);
  const open = fn => { panel.hidden = false; fn(pbody); panel.scrollTop = 0; };

  /* bottom-right: zoom */
  const zb = el('div', 'overlay zoom'); stage.appendChild(zb);
  [['+', 'zoom in', () => cy.__zoomBy && cy.__zoomBy(1.5)], ['−', 'zoom out', () => cy.__zoomBy && cy.__zoomBy(1 / 1.5)],
   ['fit', 'zoom out to the whole graph', () => cy.__fit && cy.__fit(400, 1)]].forEach(([t, title, fn]) => {
    const b = el('button', 'zbtn', t); b.title = title; b.onclick = fn; zb.appendChild(b); });

  let first = true;
  const apply = () => { history.replaceState(null, '', hashFor('graph', stateQuery())); draw(); };
  const chipsRender = () => {
    vchips.innerHTML = '';
    [['network', 'network'], ['chord', 'chord diagram']].forEach(([v, t]) => { const c = el('span', 'chip' + (S.view === v ? ' on' : ''), esc(t));
      c.setAttribute('role', 'button'); c.setAttribute('aria-pressed', S.view === v); c.onclick = () => { if (S.view !== v) { S.view = v; first = true; apply(); } }; vchips.appendChild(c); });
    chips1.innerHTML = '';
    S.concepts.forEach(id => { const c = el('span', 'chip sel', esc(conceptLabel(id)) + ' <span class="x">×</span>');
      c.title = 'remove'; c.onclick = () => { S.concepts = S.concepts.filter(x => x !== id); apply(); }; chips1.appendChild(c); });
    if (S.concepts.length) { const c = el('span', 'chip', 'clear'); c.onclick = () => { S.concepts = []; apply(); }; chips1.appendChild(c); }
    chips2.innerHTML = '';
    (G.meta.scope_tags || []).forEach(x => { const on = S.scopes.indexOf(x.tag) >= 0;
      const c = el('span', 'chip' + (on ? ' on' : ''), esc(nice(x.tag)) + ' <span class="cnt">' + x.n + '</span>');
      c.setAttribute('role', 'button'); c.setAttribute('aria-pressed', on);
      c.onclick = () => { S.scopes = on ? S.scopes.filter(t => t !== x.tag) : S.scopes.concat([x.tag]); apply(); }; chips2.appendChild(c); });
    tog.innerHTML = '';
    [['neighbours', 'show neighbours of selected concepts'], ['fold', 'fold sub-concepts into parents'],
     ['rejected', 'show rejected edges'], ['unplaced', 'show wordings not yet in the taxonomy']].forEach(([k, t]) => {
      const l = el('label'); const i = el('input'); i.type = 'checkbox'; i.checked = !!S[k];
      i.onchange = () => { S[k] = i.checked; apply(); }; l.appendChild(i); l.appendChild(document.createTextNode(t)); tog.appendChild(l); });
    const b = bounds(); const y = S.years || b;
    r0.min = r1.min = b[0]; r0.max = r1.max = b[1]; r0.value = y[0]; r1.value = y[1];
    d3.querySelector('.yr').textContent = y[0] + '–' + y[1];
    const pct = v => 100 * (v - b[0]) / Math.max(1, b[1] - b[0]);
    sl.querySelector('.fill').style.left = pct(y[0]) + '%'; sl.querySelector('.fill').style.right = (100 - pct(y[1])) + '%';
    ticks.innerHTML = '<span>' + b[0] + '</span><span>' + b[1] + '</span>';
    mode.innerHTML = '';
    [['data', 'data period'], ['pub', 'publication year']].forEach(([v, t]) => { const l = el('label'); const i = el('input'); i.type = 'radio'; i.name = 'mode'; i.value = v; i.checked = S.mode === v;
      i.onchange = () => { S.mode = v; S.years = null; apply(); }; l.appendChild(i); l.appendChild(document.createTextNode(t)); mode.appendChild(l); });
  };
  const slide = () => { let a = +r0.value, b = +r1.value; if (a > b) { if (document.activeElement === r0) b = a; else a = b; }
    S.years = [a, b]; apply(); };
  r0.oninput = slide; r1.oninput = slide;

  let focus = null;
  const draw = () => {
    chipsRender();
    const sub = subset(allRecords(), true);
    const nPapers = new Set(sub.edges.flatMap(e => e.papers)).size;
    const nPub = sub.edges.reduce((n, e) => n + e.records.filter(r => r.years.source === 'publication').length, 0);
    const filtered = S.concepts.length || S.scopes.length || S.years;
    counts.innerHTML = '<b>' + sub.nodes.size + '</b> concepts, <b>' + sub.edges.length + '</b> relations from <b>' + nPapers + '</b> paper' + (nPapers === 1 ? '' : 's') +
      (filtered ? ' after filters' : '') +
      (sub.edges.filter(e => e.has_contradiction).length ? MID + '<span class="con">' + sub.edges.filter(e => e.has_contradiction).length + ' contradicted</span>' : '');
    note.textContent = S.mode === 'data' ? (nPub ? nPub + ' edge' + (nPub === 1 ? '' : 's') + ' dated by publication year only' : 'years the evidence covers, from the claims’ stated periods') : 'the year each paper appeared';
    if (!sub.edges.length) {
      cy.innerHTML = '<p class="empty stage-empty">Nothing matches these filters.' +
        (S.concepts.length && !S.neighbours ? ' With neighbours off, only relations between selected concepts are drawn: select more concepts or switch neighbours on.' : '') + '</p>';
      return;
    }
    /* first view: the whole graph, a little zoomed in; after any filter: zoomed out to fit what is left */
    const o = { onEdge: e => { focus = e.id; open(h => showEdge(h, e)); }, onNode: n => { const id = n.id || n; if (cy.__focus) cy.__focus(id, true); open(h => showNode(h, id, sub)); },
                onBackground: () => { panel.hidden = true; }, focusEdge: focus, zoom: first ? 1.6 : 1 };
    if (S.view === 'chord') drawChord(cy, sub.nodes, sub.edges, o); else drawForce(cy, sub.nodes, sub.edges, o);
    first = false;
  };
  draw();
}

function legend() {
  const box = el('div', 'legend');
  [['+', 'var(--pos)', 'solid', 'increases'], ['-', 'var(--neg)', 'solid', 'decreases'], ['0', 'var(--nul)', 'solid', 'no effect'],
   ['?', 'var(--nul)', 'dashed', 'sign unclear'], ['c', 'var(--neg)', 'dashed', 'contested between papers']].forEach(([, col, dash, t]) =>
    box.appendChild(el('span', null, '<i style="border-top-color:' + col + ';border-top-style:' + dash + '"></i>' + t)));
  box.appendChild(el('span', null, '<i style="border-top-color:var(--ink);border-top-style:dotted"></i>not identified: an observational design, or no design record joined to the edge'));
  box.appendChild(el('span', null, '<i style="border-top-color:var(--ink);border-top-style:solid;opacity:.4"></i>faint: design pass pending'));
  box.appendChild(el('span', null, 'line width: papers'));
  (G.meta.domains || []).forEach(d => box.appendChild(el('span', null, '<span class="dot" style="background:' + domCol(d) + '"></span>' + esc(nice(d)))));
  return box;
}

/* ---- D3 force renderer. Directed: every edge is a stated claim with a cause and an
   effect. Force rather than layered because cross-paper graphs have cycles. Dragged
   nodes stay pinned (double-click releases); positions persist across redraws. */
function drawForce(host, nodeIds, edges, opts) {
  opts = opts || {};
  host.innerHTML = '';
  const W = host.clientWidth || 900, H = host.clientHeight || 560;
  const nodes = [...nodeIds].map(id => Object.assign({ id: id }, NODE[id] || { label: id, domain: 'unplaced', n_papers: 1 }, POS[id] || {}));
  const byId = new Set(nodes.map(n => n.id));
  const links = edges.filter(e => byId.has(e.from) && byId.has(e.to)).map(e => ({ source: e.from, target: e.to, e: e }));
  const svg = d3.select(host).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', [0, 0, W, H]);
  const defs = svg.append('defs');
  const COL = { pos: getCSS('--pos'), neg: getCSS('--neg'), nul: getCSS('--nul'), unk: getCSS('--nul'), con: getCSS('--neg') };
  Object.entries(COL).forEach(([k, col]) => defs.append('marker').attr('id', 'arrow-' + k).attr('viewBox', '0 -5 10 10')
    .attr('refX', 9).attr('refY', 0).attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
    .append('path').attr('d', 'M0,-4L9,0L0,4').attr('fill', col));
  const g = svg.append('g');
  const zoom = d3.zoom().scaleExtent([0.15, 5]).on('zoom', ev => g.attr('transform', ev.transform));
  svg.call(zoom);
  const cls = e => sg(e.consensus_sign)[1];
  const rOf = d => 6 + Math.min(11, (d.n_papers || 1) * 1.8);
  const link = g.append('g').selectAll('path').data(links).join('path')
    .attr('fill', 'none').attr('stroke', d => COL[cls(d.e)])
    .attr('stroke-width', d => 1.2 + 0.9 * (d.e.n_papers - 1))
    .attr('stroke-dasharray', d => d.e.has_contradiction || d.e.consensus_sign === '?' ? '6,3' : (d.e.causal || d.e.design_pending ? null : '2,3'))
    .attr('stroke-linecap', 'round').attr('stroke-opacity', d => opts.focusEdge && opts.focusEdge !== d.e.id ? .25 : (d.e.design_pending ? .45 : .85))
    .attr('marker-end', d => 'url(#arrow-' + cls(d.e) + ')').style('cursor', 'pointer')
    .on('click', (ev, d) => { ev.stopPropagation(); if (opts.onEdge) opts.onEdge(d.e); });
  link.append('title').text(d => conceptLabel(d.e.from) + ' ' + ARROW + ' ' + conceptLabel(d.e.to) + ': ' + signWord(d.e.consensus_sign) +
    ' (' + d.e.n_papers + ' paper' + (d.e.n_papers === 1 ? '' : 's') + (d.e.causal ? ', identified design' : d.e.design_pending ? ', design pass pending' : ', no identified design') + ')');
  const node = g.append('g').selectAll('g').data(nodes).join('g').style('cursor', 'pointer')
    .on('click', (ev, d) => { ev.stopPropagation(); if (opts.onNode) opts.onNode(d); })
    .on('dblclick', (ev, d) => { ev.stopPropagation(); d.fx = null; d.fy = null; delete POS[d.id]; d3.select(ev.currentTarget).select('circle').attr('stroke-dasharray', null); sim.alpha(.3).restart(); })
    .call(d3.drag()
      .on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(.25).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
      .on('end', (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = ev.x; d.fy = ev.y; POS[d.id] = { x: ev.x, y: ev.y, fx: ev.x, fy: ev.y };
        d3.select(ev.sourceEvent.currentTarget || ev.currentTarget).select('circle').attr('stroke-dasharray', '2,2'); }));
  node.append('circle').attr('r', rOf).attr('fill', d => domCol(d.domain)).attr('fill-opacity', .85)
    .attr('stroke', d => d.unplaced ? getCSS('--muted') : getCSS('--surface')).attr('stroke-width', 1.5)
    .attr('stroke-dasharray', d => d.unplaced ? '3,2' : (POS[d.id] ? '2,2' : null));
  node.append('text').text(d => d.label || d.id).attr('x', d => rOf(d) + 5).attr('dy', '.32em')
    .attr('font-size', 11.5).attr('font-family', 'Georgia,serif')
    .attr('paint-order', 'stroke').attr('stroke', getCSS('--paper')).attr('stroke-width', 3.5);
  node.append('title').text(d => (d.label || d.id) + ' — ' + nice(d.domain) + ', ' + (d.n_papers || 0) + ' paper(s). Drag to pin, double-click to release.');
  const n = nodes.length;
  const path = d => {
    const x1 = d.source.x, y1 = d.source.y, x2 = d.target.x, y2 = d.target.y;
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
    const bow = (d.e.flags.indexOf('bidirectional') >= 0 ? 0.28 : 0.16) * L;        // perpendicular offset of the control point
    const cx = (x1 + x2) / 2 - dy / L * bow, cy = (y1 + y2) / 2 + dx / L * bow;
    const rs = rOf(d.source) + 1, rt = rOf(d.target) + 3;
    const ls = Math.hypot(cx - x1, cy - y1) || 1, lt = Math.hypot(x2 - cx, y2 - cy) || 1;
    const sx = x1 + (cx - x1) / ls * rs, sy = y1 + (cy - y1) / ls * rs;            // leave the source along the tangent
    const tx = x2 - (x2 - cx) / lt * rt, ty = y2 - (y2 - cy) / lt * rt;            // arrive at the target along the tangent
    return 'M' + sx + ',' + sy + 'Q' + cx + ',' + cy + ' ' + tx + ',' + ty;
  };
  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(150).strength(.25))
    .force('charge', d3.forceManyBody().strength(-850).distanceMax(900))
    .force('center', d3.forceCenter(W / 2, H / 2).strength(.05))
    .force('collide', d3.forceCollide().radius(d => rOf(d) + 36).iterations(2))
    .force('x', d3.forceX(W / 2).strength(.02)).force('y', d3.forceY(H / 2).strength(.035))
    .alphaDecay(n > 40 ? .03 : .02)
    .on('tick', () => { link.attr('d', path); node.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')'); })
    .on('end', () => { nodes.forEach(d => { if (!POS[d.id]) POS[d.id] = { x: d.x, y: d.y }; }); fit(); });
  if (REDUCED) { sim.stop(); for (let i = 0; i < 300; i++) sim.tick(); link.attr('d', path); node.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')'); fit(0); }
  function fit(dur, factor) {
    factor = factor == null ? (opts.zoom || 1) : factor;
    if (!nodes.length) return;
    const xs = nodes.map(d => d.x), ys = nodes.map(d => d.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), pad = 90;
    const k = Math.max(0.15, Math.min(1.4, 0.95 * Math.min(W / (x1 - x0 + pad * 2), H / (y1 - y0 + pad)))) * factor;
    svg.transition().duration(dur == null ? 450 : dur).call(zoom.transform, d3.zoomIdentity.translate(W / 2 - k * (x0 + x1) / 2, H / 2 - k * (y0 + y1) / 2).scale(k));
  }
  setTimeout(() => fit(0), 350);
  const sid = x => (x && typeof x === 'object') ? x.id : x;
  function focus(id, zoomIn) {
    if (!id) { node.classed('dim', false); link.classed('dim', false); host.__focused = null; return; }
    const keep = new Set([id]);
    links.forEach(l => { const a = sid(l.source), b = sid(l.target); if (a === id) keep.add(b); if (b === id) keep.add(a); });
    node.classed('dim', d => !keep.has(d.id));
    link.classed('dim', l => sid(l.source) !== id && sid(l.target) !== id);
    host.__focused = id;
    const d = nodes.find(n => n.id === id);
    if (zoomIn && d && d.x != null) {
      const k = Math.max(1.6, Math.min(2.6, d3.zoomTransform(svg.node()).k * 1.3));
      svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(W / 2 - k * d.x, H / 2 - k * d.y).scale(k));
    }
  }
  svg.on('click', () => { focus(null); if (opts.onBackground) opts.onBackground(); });
  host.__fit = fit;
  host.__focus = focus;
  host.__zoomBy = k => svg.transition().duration(250).call(zoom.scaleBy, k);
  return sim;
}
function setNavh() { const nav = document.querySelector('nav'); if (nav) document.documentElement.style.setProperty('--navh', nav.offsetHeight + 'px'); }
function getCSS(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#888'; }

/* ---- layered renderer for one paper, after the review page: longest-path ranks into
   columns (sources left), boxes with wrapped labels, cubic curves carrying the sign in a
   circle, back-edges looping out to the right. Edges are the atlas pairs. */
function wrapLabel(t, n) {
  const out = []; let line = '';
  String(t || '').split(/\s+/).forEach(w => { if ((line + ' ' + w).trim().length > n && line) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); });
  if (line) out.push(line);
  if (out.length > 3) { out.length = 3; out[2] = out[2].replace(/\s*\S*$/, '') + '…'; }
  return out;
}
function drawDag(host, nodeIds, edges, opts) {
  opts = opts || {};
  host.innerHTML = '';
  const ns = 'http://www.w3.org/2000/svg';
  const N = [...nodeIds].map(id => ({ id, label: conceptLabel(id), lines: wrapLabel(conceptLabel(id), 24), node: NODE[id] || {} }));
  const E = edges.filter(e => e.from !== e.to);
  if (!N.length) { host.appendChild(el('p', 'empty', 'No accepted edges.')); return; }
  const rank = {}; N.forEach(n => rank[n.id] = 0);
  for (let it = 0; it < N.length + 1; it++) { let ch = false;
    E.forEach(e => { if (rank[e.to] < rank[e.from] + 1 && rank[e.from] + 1 <= 3) { rank[e.to] = rank[e.from] + 1; ch = true; } });
    if (!ch) break; }
  const cols = {}; N.forEach(n => (cols[rank[n.id]] = cols[rank[n.id]] || []).push(n));
  const ks = Object.keys(cols).map(Number).sort((a, b) => a - b);
  const W = 186, GAPX = 128, GAPY = 14, pos = {};
  ks.forEach((k, ci) => { const col = cols[k];
    if (ci > 0) { col.forEach(n => { const ys = E.filter(e => e.to === n.id && pos[e.from]).map(e => pos[e.from].cy); n.bc = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 1e6; }); col.sort((a, b) => a.bc - b.bc); }
    else col.sort((a, b) => a.label.localeCompare(b.label));
    let y = 10; col.forEach(n => { const h = 15 * n.lines.length + 14; pos[n.id] = { x: 10 + ci * (W + GAPX), y, w: W, h, cy: y + h / 2 }; y += h + GAPY; }); cols[k].H = y; });
  const H = Math.max(...ks.map(k => cols[k].H)) + 6, WW = 10 + ks.length * (W + GAPX) - GAPX + 70;
  ks.forEach(k => { const off = (H - cols[k].H) / 2; cols[k].forEach(n => { pos[n.id].y += off; pos[n.id].cy += off; }); });
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 ' + WW + ' ' + H); svg.setAttribute('width', WW); svg.setAttribute('height', H); svg.setAttribute('class', 'dag');
  const COL = { pos: getCSS('--pos'), neg: getCSS('--neg'), nul: getCSS('--nul'), unk: getCSS('--nul'), con: getCSS('--neg') };
  const defs = document.createElementNS(ns, 'defs');
  Object.entries(COL).forEach(([k, col]) => { const m = document.createElementNS(ns, 'marker'); m.setAttribute('id', 'dag-' + k); m.setAttribute('viewBox', '0 0 10 10'); m.setAttribute('refX', '9'); m.setAttribute('refY', '5');
    m.setAttribute('markerWidth', '7'); m.setAttribute('markerHeight', '7'); m.setAttribute('orient', 'auto-start-reverse');
    const t = document.createElementNS(ns, 'path'); t.setAttribute('d', 'M0,0 L10,5 L0,10 z'); t.setAttribute('fill', col); m.appendChild(t); defs.appendChild(m); });
  svg.appendChild(defs);
  const pair = {}; E.forEach(e => (pair[e.from + '>' + e.to] = pair[e.from + '>' + e.to] || []).push(e));
  const outN = {}, inN = {}; E.forEach(e => { outN[e.from] = (outN[e.from] || 0) + 1; inN[e.to] = (inN[e.to] || 0) + 1; }); const slot = {};
  const bez = (t, a, b, c, d) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; };
  E.forEach(e => { const a = pos[e.from], b = pos[e.to]; if (!a || !b) return;
    const [glyph, cls] = sg(e.consensus_sign); const col = COL[cls];
    const sib = pair[e.from + '>' + e.to]; const off = (sib.indexOf(e) - (sib.length - 1) / 2) * 16;
    const g = document.createElementNS(ns, 'g'); g.setAttribute('class', 'e');
    let x1, y1, x2, y2, d, mx, my;
    if (rank[e.to] > rank[e.from]) { x1 = a.x + a.w; y1 = a.cy + off * .4; x2 = b.x - 2; y2 = b.cy + off * .4; const c = (x2 - x1) * .5;
      d = 'M' + x1 + ',' + y1 + ' C' + (x1 + c) + ',' + (y1 + off) + ' ' + (x2 - c) + ',' + (y2 + off) + ' ' + x2 + ',' + y2;
      const nearTarget = (outN[e.from] || 0) >= (inN[e.to] || 0); const sk = nearTarget ? 't:' + e.to : 's:' + e.from; const i = slot[sk] = (slot[sk] || 0) + 1;
      const t = nearTarget ? Math.max(.5, .96 - .2 * i) : Math.min(.5, .04 + .2 * i);
      mx = bez(t, x1, x1 + c, x2 - c, x2); my = bez(t, y1, y1 + off, y2 + off, y2); }
    else { x1 = a.x + a.w; y1 = a.cy; x2 = b.x + b.w + 2; y2 = b.cy + 6; const r = 54 + Math.abs(off);
      d = 'M' + x1 + ',' + y1 + ' C' + (x1 + r) + ',' + y1 + ' ' + (x2 + r) + ',' + y2 + ' ' + x2 + ',' + y2; mx = Math.max(x1, x2) + r * .75; my = (y1 + y2) / 2; }
    const p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); p.setAttribute('stroke', col); p.setAttribute('fill', 'none');
    p.setAttribute('stroke-width', e.has_contradiction ? '2.2' : '1.6'); if (!e.causal && !e.design_pending) p.setAttribute('stroke-dasharray', '2,3'); if (e.design_pending) p.setAttribute('stroke-opacity', '.5'); if (e.consensus_sign === '?' || e.has_contradiction) p.setAttribute('stroke-dasharray', '6,3');
    p.setAttribute('marker-end', 'url(#dag-' + cls + ')'); g.appendChild(p);
    const hit = document.createElementNS(ns, 'path'); hit.setAttribute('d', d); hit.setAttribute('stroke', 'transparent'); hit.setAttribute('stroke-width', '14'); hit.setAttribute('fill', 'none'); g.appendChild(hit);
    const c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', mx); c.setAttribute('cy', my); c.setAttribute('r', 9); c.setAttribute('fill', getCSS('--surface')); c.setAttribute('stroke', col); c.setAttribute('stroke-width', '1.6'); g.appendChild(c);
    const t = document.createElementNS(ns, 'text'); t.setAttribute('x', mx); t.setAttribute('y', my + 4); t.setAttribute('text-anchor', 'middle'); t.setAttribute('class', 'sg'); t.setAttribute('fill', col); t.textContent = glyph; g.appendChild(t);
    const tt = document.createElementNS(ns, 'title'); tt.textContent = conceptLabel(e.from) + ' ' + ARROW + ' ' + conceptLabel(e.to) + ': ' + signWord(e.consensus_sign) + (e.records[0] && e.records[0].from_wording ? '\nas written: ' + e.records[0].from_wording + ' ' + ARROW + ' ' + e.records[0].to_wording : ''); g.appendChild(tt);
    g.style.cursor = 'pointer'; g.onclick = ev => { ev.stopPropagation(); svg.querySelectorAll('.e').forEach(x => x.classList.toggle('dim', x !== g)); g.classList.remove('dim'); if (opts.onEdge) opts.onEdge(e); };
    svg.appendChild(g); });
  N.forEach(n => { const q = pos[n.id]; const g = document.createElementNS(ns, 'g'); g.setAttribute('class', 'n' + (n.node.unplaced ? ' unplaced' : ''));
    const r = document.createElementNS(ns, 'rect'); r.setAttribute('x', q.x); r.setAttribute('y', q.y); r.setAttribute('width', q.w); r.setAttribute('height', q.h); r.setAttribute('rx', 7); g.appendChild(r);
    const dot = document.createElementNS(ns, 'circle'); dot.setAttribute('cx', q.x + 11); dot.setAttribute('cy', q.y + 11); dot.setAttribute('r', 3.5); dot.setAttribute('fill', domCol(n.node.domain)); g.appendChild(dot);
    n.lines.forEach((ln, i) => { const t = document.createElementNS(ns, 'text'); t.setAttribute('x', q.x + q.w / 2); t.setAttribute('y', q.y + 18 + i * 15); t.setAttribute('text-anchor', 'middle'); t.textContent = ln; g.appendChild(t); });
    const tt = document.createElementNS(ns, 'title'); tt.textContent = n.id + (n.node.summary ? '\n' + n.node.summary : ''); g.appendChild(tt);
    g.style.cursor = 'pointer'; g.onclick = ev => { ev.stopPropagation(); if (opts.onNode) opts.onNode(n.id); };
    svg.appendChild(g); });
  svg.onclick = () => svg.querySelectorAll('.e').forEach(x => x.classList.remove('dim'));
  host.appendChild(svg);
}

/* ---- chord view: concepts on a circle grouped by domain, ribbons from cause to effect
   coloured by the cause's domain, width = papers, arrowhead at the effect. ---- */
function clipLabel(t, n) { t = String(t || ''); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t; }
function drawChord(host, nodeIds, edges, opts) {
  opts = opts || {};
  host.innerHTML = '';
  const W = host.clientWidth || 900, H = host.clientHeight || 600;
  const ids = [...nodeIds].map(id => ({ id, label: conceptLabel(id), domain: (NODE[id] || {}).domain || 'unplaced' }))
    .sort((a, b) => a.domain.localeCompare(b.domain) || a.label.localeCompare(b.label));
  const n = ids.length;
  if (n < 2) { host.innerHTML = '<p class="empty stage-empty">Too few concepts for a chord view.</p>'; return; }
  const index = {}; ids.forEach((x, i) => index[x.id] = i);
  const M = Array.from({ length: n }, () => new Array(n).fill(0)), EM = {};
  edges.forEach(e => { const i = index[e.from], j = index[e.to]; if (i == null || j == null || i === j) return; M[i][j] += e.n_papers || 1; EM[i + '-' + j] = e; });
  const R = Math.max(110, Math.min(W, H) / 2 - 170), inner = R - 9;
  const layout = (d3.chordDirected ? d3.chordDirected() : d3.chord()).padAngle(10 / inner).sortSubgroups(d3.descending).sortChords(d3.descending);
  const chords = layout(M);
  const arc = d3.arc().innerRadius(inner).outerRadius(R);
  const ribbon = (d3.ribbonArrow ? d3.ribbonArrow().headRadius(9) : d3.ribbon()).radius(inner - 1).padAngle(1 / inner);
  const svg = d3.select(host).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', [0, 0, W, H]);
  const g = svg.append('g');
  const zoom = d3.zoom().scaleExtent([0.3, 5]).on('zoom', ev => g.attr('transform', ev.transform));
  svg.call(zoom);
  const root = g.append('g').attr('transform', 'translate(' + W / 2 + ',' + H / 2 + ')');
  const COL = { pos: getCSS('--pos'), neg: getCSS('--neg'), nul: getCSS('--nul'), unk: getCSS('--nul'), con: getCSS('--neg') };
  /* the domain ring: contiguous runs of one domain, label along the outer edge */
  const runs = [];
  chords.groups.forEach(gr => { const d = ids[gr.index].domain; const last = runs[runs.length - 1];
    if (last && last.domain === d) last.end = gr.endAngle; else runs.push({ domain: d, start: gr.startAngle, end: gr.endAngle }); });
  const ring = root.append('g');
  const ringArc = d3.arc().innerRadius(R + 3).outerRadius(R + 8);
  runs.forEach((r, i) => {
    ring.append('path').attr('d', ringArc({ startAngle: r.start, endAngle: r.end })).attr('fill', domCol(r.domain));
    const rr = R + 150, mid = (r.start + r.end) / 2, lower = mid > Math.PI / 2 && mid < 3 * Math.PI / 2;
    const a0 = (lower ? r.end : r.start) - Math.PI / 2, a1 = (lower ? r.start : r.end) - Math.PI / 2;
    const p = 'M' + rr * Math.cos(a0) + ',' + rr * Math.sin(a0) + 'A' + rr + ',' + rr + ' 0 ' + (Math.abs(r.end - r.start) > Math.PI ? 1 : 0) + ' ' + (lower ? 0 : 1) + ' ' + rr * Math.cos(a1) + ',' + rr * Math.sin(a1);
    ring.append('path').attr('id', 'ring-' + i).attr('d', p).attr('fill', 'none');
    ring.append('text').attr('font-family', 'Georgia,serif').attr('font-size', 13).attr('fill', domCol(r.domain)).attr('dy', lower ? 10 : -3)
      .append('textPath').attr('href', '#ring-' + i).attr('startOffset', '50%').attr('text-anchor', 'middle').text(nice(r.domain));
  });
  const fade = (keep) => { rb.attr('stroke-opacity', d => keep == null || keep(d) ? .85 : .08).attr('stroke-width', d => keep != null && keep(d) ? 2 : 1); };
  const groups = root.append('g').selectAll('g').data(chords.groups).join('g').style('cursor', 'pointer')
    .on('click', (ev, d) => { ev.stopPropagation(); if (opts.onNode) opts.onNode(ids[d.index].id); })
    .on('mouseover', (ev, d) => fade(c => c.source.index === d.index || c.target.index === d.index))
    .on('mouseout', () => fade(null));
  groups.append('path').attr('d', arc).attr('fill', d => domCol(ids[d.index].domain)).attr('stroke', getCSS('--paper'));
  groups.append('text').each(d => d.angle = (d.startAngle + d.endAngle) / 2).attr('dy', '.32em')
    .attr('transform', d => 'rotate(' + (d.angle * 180 / Math.PI - 90) + ') translate(' + (R + 12) + ',0)' + (d.angle > Math.PI ? ' rotate(180)' : ''))
    .attr('text-anchor', d => d.angle > Math.PI ? 'end' : null).attr('font-size', n > 40 ? 10 : 11.5).attr('font-family', 'Georgia,serif').attr('fill', getCSS('--ink'))
    .text(d => clipLabel(ids[d.index].label, 28));
  groups.append('title').text(d => ids[d.index].label + ' — ' + nice(ids[d.index].domain) + ', ' + ((NODE[ids[d.index].id] || {}).n_papers || 0) + ' paper(s)');
  const signOf = d => { const e = EM[d.source.index + '-' + d.target.index]; return e ? e.consensus_sign : '?'; };
  const rb = root.append('g').attr('fill', 'none').selectAll('path').data(chords).join('path')
    .attr('d', ribbon).attr('stroke', d => COL[sg(signOf(d))[1]]).attr('stroke-width', 1).attr('stroke-opacity', d => { const e = EM[d.source.index + '-' + d.target.index]; return e && e.design_pending ? .4 : .85; }).attr('stroke-linejoin', 'round')
    .attr('stroke-dasharray', d => { const e = EM[d.source.index + '-' + d.target.index]; return e && (e.has_contradiction || e.consensus_sign === '?') ? '4,2' : null; })
    .style('cursor', 'pointer').style('pointer-events', 'stroke')
    .on('click', (ev, d) => { ev.stopPropagation(); const e = EM[d.source.index + '-' + d.target.index]; if (e && opts.onEdge) opts.onEdge(e); })
    .on('mouseover', (ev, d) => fade(c => c === d)).on('mouseout', () => fade(null));
  rb.append('title').text(d => { const e = EM[d.source.index + '-' + d.target.index] || {};
    return ids[d.source.index].label + ' ' + ARROW + ' ' + ids[d.target.index].label + ': ' + signWord(e.consensus_sign || '?') + ' (' + (e.n_papers || 0) + ' paper' + (e.n_papers === 1 ? '' : 's') + ')'; });
  host.__fit = (dur, factor) => { factor = factor == null ? 1 : factor;
    svg.transition().duration(dur == null ? 450 : dur).call(zoom.transform, d3.zoomIdentity.translate(W / 2 * (1 - factor), H / 2 * (1 - factor)).scale(factor)); };
  host.__zoomBy = k => svg.transition().duration(250).call(zoom.scaleBy, k);
}

/* ================= side panel ================= */
function showEdge(panel, e) {
  panel.innerHTML = '';
  panel.appendChild(el('h4', null, esc(conceptLabel(e.from)) + ' ' + ARROW + ' ' + esc(conceptLabel(e.to))));
  const pills = el('div');
  pills.innerHTML = '<span class="pill' + (e.has_contradiction ? ' con' : '') + '">' + signHtml(e.consensus_sign) + ' ' + esc(signWord(e.consensus_sign)) + '</span>' +
    '<span class="pill">' + e.n_papers + ' paper' + (e.n_papers === 1 ? '' : 's') + '</span>' +
    (e.causal ? '<span class="pill ok">identified design</span>' : e.design_pending ? '<span class="pill">design pass pending</span>' :
      e.records.some(r => r.design_basis === 'observational' || r.design_basis === 'descriptive') ? '<span class="pill">observational or descriptive design</span>' : '<span class="pill warn">no design record joined to this edge</span>') +
    e.flags.filter(f => f !== 'contradiction').map(f => '<span class="pill warn">' + esc(nice(f)) + '</span>').join('');
  panel.appendChild(pills);
  panel.appendChild(el('p', 'sub', '<a href="' + hashFor('graph', { c: e.from + ',' + e.to, nb: '0' }) + '">only this pair</a>' + MID +
    '<a href="#/concept/' + encodeURIComponent(e.from) + '">' + esc(conceptLabel(e.from)) + '</a> in the taxonomy' + MID +
    '<a href="#/concept/' + encodeURIComponent(e.to) + '">' + esc(conceptLabel(e.to)) + '</a>'));
  e.records.forEach(r => panel.appendChild(recordCard(r)));
}
function recordCard(r, full) {
  const d = el('div', 'rec');
  const k = r.kind === 'causal' ? 'causal' : r.kind === 'associational' ? 'associational (observational or descriptive design)' : r.design_pending ? 'design pass pending' : 'no design record joined to this edge\u2019s cells';
  let h = '<div class="cite">' + citeLink(r.paper, true) + '</div>';
  h += '<div class="line">' + signHtml(r.sign) + ' <b>' + esc(signWord(r.sign)) + '</b>' + (r.folded ? ' (folded into the parent concept)' : '') +
       (r.raw_sign !== r.sign ? ' <span title="the paper’s wording is a mirror image of the concept">read through polarity</span>' : '') + '</div>';
  if (r.from_wording || r.to_wording) h += '<div class="line">as written: <b>' + esc(r.from_wording) + '</b> ' + ARROW + ' <b>' + esc(r.to_wording) + '</b></div>';
  h += '<div class="line"><b>' + esc(k) + '</b>' + (r.design_basis && r.design_basis !== 'unknown' ? MID + esc(nice(r.design_basis)) : '') +
       (r.strategies.length ? MID + r.strategies.map(s => esc(nice(s.strategy)) + (s.basis === 'candidate' ? ' (candidate record)' : '')).join(', ') : '') + '</div>';
  h += '<div class="line">' + (r.verdict === 'accepted' ? '<span class="pill ok">accepted</span>' : '<span class="pill con">rejected: ' + esc(nice(r.reason)) + '</span>') +
       '<span class="pill">' + esc(r.tier || '') + ' ' + r.support + '/' + r.k + ' runs</span>' +
       (r.flags || []).map(f => '<span class="pill warn">' + esc(nice(f)) + '</span>').join('') + '</div>';
  if (r.populations.length) h += '<div class="line">population: <b>' + r.populations.map(esc).join('; ') + '</b></div>';
  h += '<div class="line">groups: ' + r.scope_tags.map(nice).map(esc).join(', ') + MID + 'years ' + (r.years.from == null ? 'unknown' : r.years.from + '–' + r.years.to) +
       (r.years.source === 'publication' ? ' (publication year)' : r.years.source === 'design' ? ' (from the design record)' : r.years.source === 'estimates' ? ' (sample of the linked estimates)' : '') + '</div>';
  if (r.scope_source) h += '<div class="line">scope ' + (r.scope_source === 'estimates' ? 'from the linked estimates' : 'from the stated claim only (no estimate linked)') +
       (r.scope_disagreement ? MID + '<span class="pill warn">stated vs estimates</span> ' + esc(r.scope_disagreement) : '') + '</div>';
  d.innerHTML = h;
  (r.evidence || []).forEach(x => { const b = el('blockquote', null, esc(x.text) + '<span class="cite">' + esc(x.kind) + (x.page ? ', p. ' + esc(x.page) : '') +
    MID + esc(x.label) + (x.n_runs ? ' (' + x.n_runs + ' run' + (x.n_runs === 1 ? '' : 's') + ')' : '') + '</span>'); d.appendChild(b); });
  if (r.cells && r.cells.length) d.appendChild(el('div', 'line', 'cells: ' + r.cells.map(c => '<code>' + esc(c.cell) + '</code>' + (c.value != null ? ' = ' + esc(num(c.value)) : '')).join(', ')));
  if (r.t && r.t.length) d.appendChild(el('div', 'line', 't: ' + r.t.map(t => '<b>' + (t.t == null ? '–' : num(t.t, 1)) + '</b>' + (t.approx ? '≈' : '') + ' <span class="role">' + esc(t.record_id) + '</span>').join(', ')));
  if (full || true) {
    const seen = new Set();
    (r.claims || []).forEach(c => { if (!c.statement || seen.has(c.statement)) return; seen.add(c.statement);
      d.appendChild(el('div', 'line', '<span class="role">' + esc(c.run) + ' ' + esc(c.id) + '</span> ' + esc(c.statement))); });
  }
  return d;
}
function showNode(panel, id, sub) {
  const c = CONCEPT[id] || NODE[id] || { id, label: id };
  panel.innerHTML = '';
  panel.appendChild(el('h4', null, esc(c.label)));
  panel.appendChild(el('div', null, '<span class="pill dom" style="background:' + domCol(c.domain) + '">' + esc(nice(c.domain)) + '</span>' +
    (c.parent ? '<span class="pill">under ' + esc(conceptLabel(c.parent)) + '</span>' : '') + '<span class="pill">' + esc(paperCount(Object.assign({ n_papers: 0 }, c))) + '</span>' +
    (c.unplaced ? '<span class="pill warn">not yet in the taxonomy</span>' : '')));
  if (c.summary) panel.appendChild(el('p', null, esc(c.summary)));
  if (c.definition && c.definition !== c.summary) panel.appendChild(el('p', 'sub', esc(c.definition)));
  const acts = el('p', 'sub');
  const b = el('button', 'btn', S.concepts.indexOf(id) >= 0 ? 'in selection' : 'add to selection');
  b.onclick = () => { if (S.concepts.indexOf(id) < 0) S.concepts.push(id); go(hashFor('graph', stateQuery())); route(); };
  acts.appendChild(b); acts.appendChild(document.createTextNode(' '));
  if (!c.unplaced) acts.insertAdjacentHTML('beforeend', '<a href="#/concept/' + encodeURIComponent(id) + '">open in the taxonomy</a>');
  panel.appendChild(acts);
  const es = (sub ? sub.edges : G.edges).filter(e => e.from === id || e.to === id);
  if (es.length) {
    panel.appendChild(el('h3', null, 'Relations'));
    const ul = el('ul', 'plain');
    es.forEach(e => { const li = el('li', null, (e.from === id ? '<b>this</b> ' + ARROW + ' ' + esc(conceptLabel(e.to)) : esc(conceptLabel(e.from)) + ' ' + ARROW + ' <b>this</b>') +
      ' ' + signHtml(e.consensus_sign) + ' <span class="role">' + e.n_papers + 'p</span>'); li.style.cursor = 'pointer'; li.onclick = () => showEdge(panel, e); ul.appendChild(li); });
    panel.appendChild(ul);
  }
  if (c.wordings && c.wordings.length) {
    panel.appendChild(el('h3', null, 'Wordings in the papers'));
    const ul = el('ul', 'plain');
    c.wordings.slice(0, 8).forEach(w => ul.appendChild(el('li', null, '“' + esc(w.text) + '” <span class="role">' + (w.polarity === 'mirror' ? 'mirror image' + MID : '') +
      w.papers.map(p => cite(p.artid)).join('; ') + '</span>')));
    if (c.wordings.length > 8) ul.appendChild(el('li', 'sub', '+ ' + (c.wordings.length - 8) + ' more in the taxonomy'));
    panel.appendChild(ul);
  }
}

/* ================= taxonomy page ================= */
function viewTaxonomy(app, q) {
  const w = wrap(app, 'tax');
  w.appendChild(el('h2', null, 'Concept taxonomy'));
  const nW = TAX.concepts.reduce((n, c) => n + (c.wordings || []).length, 0);
  w.appendChild(el('p', 'sub', TAX.concepts.length + ' concepts in ' + TAX.domains.length + ' domains, ' + nW + ' wordings from ' + PAPERS.length +
    ' papers' + MID + 'batch ' + esc(TAX.batch) + ' (' + esc(TAX.status) + ')' + MID + 'click a concept to unfold its sub-concepts and the papers’ own wordings.'));
  const qi = el('input', 'searchbar'); qi.type = 'search'; qi.placeholder = 'closest matching concepts…'; qi.value = q.q || ''; qi.setAttribute('aria-label', 'search the taxonomy');
  w.appendChild(qi);
  const host = el('div'); w.appendChild(host);
  const render = () => {
    const t = qi.value.trim();
    history.replaceState(null, '', hashFor('taxonomy', { q: t, open: t ? '' : (q.open || '') }));
    host.innerHTML = '';
    if (t) {
      const hits = SEARCH.search(t).slice(0, 15);
      if (!hits.length) { host.appendChild(el('p', 'empty', 'No concept matches “' + esc(t) + '”.')); return; }
      hits.forEach(h => { const c = CONCEPT[h.id]; if (!c) return;
        host.appendChild(el('div', 'hit', '<a href="#/concept/' + encodeURIComponent(c.id) + '">' + esc(c.label) + '</a><span class="path">' + esc(conceptPath(c.id)) + '</span>' +
          '<p>' + esc(c.summary || '') + '</p><span class="act">' + esc(paperCount(c)) + MID + (c.wordings || []).length + ' wordings' + MID +
          '<a href="' + hashFor('graph', { c: c.id }) + '">show in graph</a></span>')); });
      return;
    }
    const top = TAX.concepts.filter(c => !c.parent);
    TAX.domains.forEach(d => {
      const cs = top.filter(c => c.domain === d); if (!cs.length) return;
      host.appendChild(el('h3', 'domain', '<span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + domCol(d) + ';margin-right:.4rem"></span>' + esc(nice(d))));
      cs.sort((a, b) => b.n_papers - a.n_papers || a.label.localeCompare(b.label)).forEach(c => host.appendChild(conceptNode(c)));
    });
    if (TAX.unplaced.length) {
      host.appendChild(el('h3', 'domain', 'Not yet in the taxonomy'));
      host.appendChild(el('p', 'sub', 'Wordings the adjudication kept apart that no concept covers yet. They enter the vocabulary at the next taxonomy pass; the graph hides them unless asked.'));
      TAX.unplaced.filter(c => !c.left_out).forEach(c => host.appendChild(conceptNode(c)));
      const lo = TAX.unplaced.filter(c => c.left_out);
      if (lo.length) { host.appendChild(el('h3', 'domain', 'Left out by the taxonomy pass')); host.appendChild(el('p', 'sub', 'Wordings judged not to be variables (a time trend, a named effect, a country contrast); they stay out of the graph.'));
        lo.forEach(c => host.appendChild(conceptNode(c))); }
    }
    if (TAX.left_out.length) {
      host.appendChild(el('h3', 'domain', 'Left out of the vocabulary'));
      const t2 = el('table'); t2.innerHTML = '<tr><th>label</th><th>reason</th><th>why</th></tr>' +
        TAX.left_out.map(l => '<tr><td>' + esc(l.label) + '</td><td>' + esc(nice(l.reason)) + '</td><td>' + esc(l.why) + '</td></tr>').join('');
      host.appendChild(t2);
    }
    if (q.open) { const d = host.querySelector('details[data-id="' + CSS.escape(q.open) + '"]'); if (d) { let x = d; while (x && x.tagName === 'DETAILS') { x.open = true; x = x.parentElement.closest('details'); } d.scrollIntoView({ block: 'start' }); } }
  };
  qi.oninput = render; render();
}
function conceptNode(c) {
  const d = el('details', 'concept'); d.dataset.id = c.id;
  const kids = (c.children || []).map(id => CONCEPT[id]).filter(Boolean);
  const s = el('summary', null, '<span class="lbl">' + esc(c.label) + '</span><span class="meta">' + esc(paperCount(c)) + MID +
    (c.wordings || []).length + ' wording' + ((c.wordings || []).length === 1 ? '' : 's') + (kids.length ? MID + kids.length + ' sub-concept' + (kids.length === 1 ? '' : 's') : '') + '</span>' +
    (c.summary ? '<span class="sum">' + esc(c.summary) + '</span>' : ''));
  d.appendChild(s);
  const body = el('div', 'body');
  let kv = '';
  if (c.definition && c.definition !== c.summary) kv += '<dt>definition</dt><dd>' + esc(c.definition) + '</dd>';
  if (c.more_means) kv += '<dt>more means</dt><dd>' + esc(c.more_means) + '</dd>';
  if (c.direction && c.parent) kv += '<dt>direction</dt><dd>' + esc(nice(c.direction)) + ' (relative to ' + esc(conceptLabel(c.parent)) + ')</dd>';
  if (c.aliases && c.aliases.length) kv += '<dt>aliases</dt><dd>' + c.aliases.map(esc).join(', ') + '</dd>';
  kv += '<dt>id</dt><dd><code>' + esc(c.id) + '</code>' + MID + '<a href="' + hashFor('graph', { c: c.id }) + '">show in graph</a></dd>';
  body.appendChild(el('dl', 'kv', kv));
  if (kids.length) { const k = el('div', 'kids'); kids.sort((a, b) => b.n_papers - a.n_papers).forEach(x => k.appendChild(conceptNode(x))); body.appendChild(k); }
  if (c.wordings && c.wordings.length) {
    body.appendChild(el('h3', null, 'Paper wordings'));
    const tw = el('div', 'tablewrap'); const t = el('table');
    let rows = '<tr><th>wording</th><th>role</th><th>polarity</th><th>paper</th><th>the stated claim</th></tr>';
    c.wordings.forEach(w => w.papers.forEach(p => {
      const seen = new Set(); const cl = [];
      p.claims.forEach(x => { if (!x.statement || seen.has(x.id)) return; seen.add(x.id);
        cl.push('<span class="role">' + esc(x.id) + '</span> ' + signHtml(x.sign) + ' ' + esc(x.statement)); });
      const variants = (w.variants || []).filter(v => v !== w.text);
      rows += '<tr><td>“' + esc(w.text) + '”' + (variants.length ? '<br><span class="role">also: ' + variants.map(esc).join('; ') + '</span>' : '') +
        (w.how !== 'exact' ? '<br><span class="role">placed by ' + esc(w.how) + '</span>' : '') + '</td>' +
        '<td class="role">' + Object.entries(w.roles || {}).map(([r, n]) => r + (n > 1 ? ' ×' + n : '')).join(', ') + '</td>' +
        '<td>' + (w.polarity === 'mirror' ? 'mirror image' : 'same') + '</td><td>' + citeLink(p.artid, true) + '</td><td>' + (cl.join('<br>') || '<span class="role">–</span>') + '</td></tr>';
    }));
    t.innerHTML = rows; tw.appendChild(t); body.appendChild(tw);
  }
  d.appendChild(body);
  return d;
}

/* ================= papers page ================= */
function viewPapers(app) {
  const w = wrap(app);
  w.appendChild(el('h2', null, 'Papers'));
  const T = STATS.totals;
  w.appendChild(el('p', 'sub', 'What the corpus covers: the concepts its claims touch, the designs behind them, the years and journals, and how strongly the main estimates speak.'));
  const k = el('div', 'kpis');
  [[T.papers, 'papers'], [T.records_accepted, 'accepted edges'], [T.concepts_touched, 'concepts'], [T.designs, 'design records'],
   [T.headline + ' / ' + T.headline_with_t, 'headline estimates / with a t'], [T.contradictions, 'contradictions']].forEach(([n, l]) =>
    k.appendChild(el('div', 'kpi', '<b>' + n + '</b><span>' + l + '</span>')));
  w.appendChild(k);
  const figs = el('div', 'figs'); w.appendChild(figs);
  figs.appendChild(figConcepts()); figs.appendChild(figStrategies()); figs.appendChild(figTime()); figs.appendChild(figJournals()); figs.appendChild(figT());
  w.appendChild(el('h3', null, 'All papers'));
  const tw = el('div', 'tablewrap'); const t = el('table');
  t.innerHTML = '<tr><th>paper</th><th>journal</th><th class="num">year</th><th>main design</th><th class="num">edges</th><th class="num">rejected</th><th class="num">headline</th><th class="num">median |t|</th></tr>';
  const tb = {}; STATS.t_by_paper.forEach(x => tb[x.artid] = x);
  PAPERS.slice().sort((a, b) => (b.year || 0) - (a.year || 0)).forEach(p => {
    const tr = el('tr', 'clickable');
    tr.innerHTML = '<td>' + esc(cite(p.artid)) + '<br><span class="role">' + esc(p.title) + '</span></td><td>' + esc(p.journal || '') + '</td><td class="num">' + (p.year || '') +
      '</td><td>' + esc(nice(p.main_strategy)) + '</td><td class="num">' + p.n_accepted + '</td><td class="num">' + p.n_rejected + '</td><td class="num">' + p.n_headline +
      '</td><td class="num">' + (tb[p.artid] && tb[p.artid].median_abs_t != null ? num(tb[p.artid].median_abs_t, 1) : '–') + '</td>';
    tr.onclick = () => go('#/paper/' + encodeURIComponent(p.artid)); t.appendChild(tr);
  });
  tw.appendChild(t); w.appendChild(tw);
}
function figure(title, sub) {
  const f = el('figure'); f.appendChild(el('figcaption', null, '<b>' + esc(title) + '</b>' + esc(sub || '')));
  return f;
}
function tableAlt(f, head, rows) {
  const d = el('details', null, '<summary>as a table</summary>');
  const t = el('table'); t.innerHTML = '<tr>' + head.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr>' + rows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('');
  d.appendChild(t); f.appendChild(d);
}
/* horizontal bars: rows [{label, value, color, title, href}] */
function hbars(f, rows, opts) {
  opts = opts || {};
  const W = 520, rowH = 20, L = opts.labelW || 190, R = 40;
  const H = rows.length * rowH + 6;
  const max = Math.max(1, ...rows.map(r => r.value));
  const x = v => L + (W - L - R) * v / max;
  const svg = d3.select(f).append('svg').attr('viewBox', [0, 0, W, H]).attr('role', 'img').attr('aria-label', opts.aria || '');
  const g = svg.selectAll('g').data(rows).join('g').attr('class', 'bar').attr('transform', (d, i) => 'translate(0,' + (i * rowH + 3) + ')')
    .on('click', (ev, d) => { if (d.href) go(d.href); });
  g.append('rect').attr('x', L).attr('y', 3).attr('height', rowH - 7).attr('width', d => Math.max(1, x(d.value) - L)).attr('fill', d => d.color || getCSS('--accent'));
  g.append('text').attr('x', L - 6).attr('y', rowH / 2 + 2).attr('text-anchor', 'end').text(d => d.label.length > 30 ? d.label.slice(0, 29) + '…' : d.label);
  g.append('text').attr('x', d => x(d.value) + 4).attr('y', rowH / 2 + 2).text(d => d.value).attr('class', 'num');
  g.append('title').text(d => d.title || d.label);
}
/* vertical bars: rows [{label, value, color, title, href, onClick}] */
function vbars(host, rows, opts) {
  opts = opts || {};
  const n = rows.length, W = 520, H = opts.height || 250, L = 30, B = opts.labelH || 78, T = 16, R = 8;
  const max = Math.max(1, ...rows.map(r => r.value));
  const bw = (W - L - R) / Math.max(1, n), y = v => T + (H - T - B) * (1 - v / max);
  const svg = d3.select(host).append('svg').attr('viewBox', [0, 0, W, H]).attr('role', 'img').attr('aria-label', opts.aria || '');
  svg.append('line').attr('x1', L).attr('x2', W - R).attr('y1', H - B + .5).attr('y2', H - B + .5).attr('stroke', getCSS('--rule'));
  const rot = opts.rotate == null ? -35 : opts.rotate;
  const g = svg.selectAll('g').data(rows).join('g').attr('class', 'bar').attr('transform', (d, i) => 'translate(' + (L + i * bw) + ',0)')
    .on('click', (ev, d) => { if (d.onClick) d.onClick(d); else if (d.href) go(d.href); });
  g.append('rect').attr('x', bw * .12).attr('width', Math.max(2, bw * .76)).attr('y', d => y(d.value)).attr('height', d => Math.max(0, H - B - y(d.value))).attr('fill', d => d.color || getCSS('--accent'));
  g.append('text').attr('x', bw / 2).attr('y', d => y(d.value) - 3).attr('text-anchor', 'middle').attr('class', 'num').text(d => d.value || '');
  g.append('text').attr('transform', 'translate(' + (bw / 2) + ',' + (H - B + 12) + ') rotate(' + rot + ')').attr('text-anchor', rot === 0 ? 'middle' : 'end')
    .text(d => clipLabel(d.label, opts.clip || 24));
  g.append('title').text(d => d.title || d.label);
}
function figConcepts() {
  const f = figure('Papers by concept', 'papers whose accepted claims touch the concept. Domains first; click a bar to open its concepts, a concept to open its sub-concepts, a leaf to show it in the graph.');
  const crumb = el('p', 'opts'); f.appendChild(crumb);
  const host = el('div'); f.appendChild(host);
  const papersOf = id => { const s = new Set(); descendants(id).forEach(x => ((CONCEPT[x] || {}).papers || []).forEach(p => s.add(p))); return s; };
  let level = { kind: 'domains' };
  const link = (t, fn) => { const a = el('a', null, esc(t)); a.onclick = fn; return a; };
  const draw = () => {
    host.innerHTML = ''; crumb.innerHTML = '';
    let rows = [];
    const conceptRow = c => { const ps = papersOf(c.id); return { label: c.label, value: ps.size, color: domCol(c.domain), title: c.label + ': ' + [...ps].map(p => cite(p)).join('; ') + ((c.children || []).length ? '\n(click to open its sub-concepts)' : '\n(click to show in the graph)'),
      onClick: () => { if ((c.children || []).length) { level = { kind: 'concept', id: c.id }; draw(); } else go(hashFor('graph', { c: c.id })); } }; };
    if (level.kind === 'domains') {
      rows = (G.meta.domains || []).map(d => { const s = new Set(); TAX.concepts.filter(c => c.domain === d).forEach(c => (c.papers || []).forEach(p => s.add(p)));
        return { label: nice(d), value: s.size, color: domCol(d), title: nice(d) + ': ' + [...s].map(p => cite(p)).join('; '), onClick: () => { level = { kind: 'domain', domain: d }; draw(); } }; });
      crumb.appendChild(document.createTextNode('all domains'));
    } else if (level.kind === 'domain') {
      rows = TAX.concepts.filter(c => c.domain === level.domain && !c.parent).map(conceptRow);
      crumb.appendChild(link('all domains', () => { level = { kind: 'domains' }; draw(); })); crumb.appendChild(document.createTextNode(' › ' + nice(level.domain)));
    } else {
      const c = CONCEPT[level.id];
      rows = (c.children || []).map(k => CONCEPT[k]).filter(Boolean).map(conceptRow);
      crumb.appendChild(link('all domains', () => { level = { kind: 'domains' }; draw(); })); crumb.appendChild(document.createTextNode(' › '));
      crumb.appendChild(link(nice(c.domain), () => { level = { kind: 'domain', domain: c.domain }; draw(); }));
      if (c.parent && CONCEPT[c.parent]) { crumb.appendChild(document.createTextNode(' › ')); crumb.appendChild(link(CONCEPT[c.parent].label, () => { level = { kind: 'concept', id: c.parent }; draw(); })); }
      crumb.appendChild(document.createTextNode(' › ' + c.label + MID)); const a = el('a', null, 'show in graph'); a.href = hashFor('graph', { c: c.id }); crumb.appendChild(a);
    }
    rows.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
    vbars(host, rows, { aria: 'papers by concept', clip: rows.length > 12 ? 16 : 24 });
    const old = f.querySelector('details'); if (old) old.remove();
    tableAlt(f, ['concept', 'papers'], rows.map(r => [esc(r.label), r.value]));
  };
  draw();
  return f;
}
function figTime() {
  const f = figure('Papers by time', 'publication years above; below, the years each paper’s evidence covers');
  const years = STATS.by_year.map(y => y.year); const y0 = Math.min(...years), y1 = Math.max(...years);
  const byY = {}; STATS.by_year.forEach(y => byY[y.year] = y);
  const rows = []; for (let y = y0; y <= y1; y++) rows.push({ label: String(y), value: byY[y] ? byY[y].n : 0, title: byY[y] ? y + ': ' + byY[y].papers.map(p => cite(p)).join('; ') : String(y) });
  vbars(f, rows, { aria: 'papers by publication year', rotate: 0, height: 170, labelH: 26 });
  const prs = STATS.periods.filter(p => p.from != null).sort((a, b) => a.from - b.from || a.to - b.to);
  if (prs.length) {
    const W = 520, rowH = 18, L = 190, R = 16, H = prs.length * rowH + 28;
    const p0 = Math.min(...prs.map(r => r.from)), p1 = Math.max(...prs.map(r => r.to));
    const x = d3.scaleLinear().domain([p0, p1]).range([L, W - R]);
    const svg = d3.select(f).append('svg').attr('viewBox', [0, 0, W, H]).attr('role', 'img').attr('aria-label', 'data period per paper');
    svg.append('g').attr('class', 'axis').attr('transform', 'translate(0,' + (H - 20) + ')').call(d3.axisBottom(x).ticks(6).tickFormat(d3.format('d')));
    const g = svg.selectAll('g.bar').data(prs).join('g').attr('class', 'bar').attr('transform', (d, i) => 'translate(0,' + (i * rowH + 2) + ')')
      .on('click', (ev, d) => go('#/paper/' + encodeURIComponent(d.artid)));
    g.append('rect').attr('x', d => x(d.from)).attr('width', d => Math.max(3, x(d.to) - x(d.from))).attr('y', 4).attr('height', rowH - 8)
      .attr('fill', getCSS('--accent')).attr('fill-opacity', d => d.source === 'scope' ? .85 : d.source === 'design' ? .5 : .25)
      .attr('stroke', d => d.source === 'publication' ? getCSS('--accent') : 'none').attr('stroke-dasharray', '3,2');
    g.append('text').attr('x', L - 6).attr('y', rowH / 2 + 3).attr('text-anchor', 'end').text(d => cite(d.artid));
    g.append('title').text(d => cite(d.artid, true) + ': ' + d.from + '–' + d.to + ' (' + (d.source === 'scope' ? 'stated period' : d.source === 'design' ? 'design record' : 'publication year only') + ')');
  }
  tableAlt(f, ['paper', 'published', 'evidence from', 'to', 'source'], STATS.periods.map(p => [esc(cite(p.artid)), p.year || '', p.from || '', p.to || '', esc(p.source)]));
  return f;
}
function figStrategies() {
  const f = figure('Papers by identification', 'the strategy of each paper’s headline design records');
  const rows = STATS.by_strategy;
  hbars(f, rows.map(s => ({ label: nice(s.strategy), value: s.n_papers, title: nice(s.strategy) + ' (' + s.n_records + ' records): ' + s.papers.map(p => cite(p)).join('; ') })), { aria: 'papers by identification strategy' });
  tableAlt(f, ['strategy', 'papers', 'records'], rows.map(s => [esc(nice(s.strategy)), s.papers.map(p => esc(cite(p))).join('; '), s.n_records]));
  return f;
}
function figJournals() {
  const f = figure('Papers by journal', '');
  hbars(f, STATS.by_journal.map(j => ({ label: j.journal, value: j.n, title: j.journal + ': ' + j.papers.map(p => cite(p)).join('; ') })), { aria: 'papers by journal' });
  tableAlt(f, ['journal', 'papers'], STATS.by_journal.map(j => [esc(j.journal), j.papers.map(p => esc(cite(p))).join('; ')]));
  return f;
}
function figT() {
  const f = figure('t-statistics of the main claims', '|t| of each headline estimate (estimate / standard error); hollow = standard error approximated from a 95% interval; tick = median; lines at 1.96 and 2.58');
  const rows = STATS.t_by_paper.slice().sort((a, b) => (b.median_abs_t || 0) - (a.median_abs_t || 0));
  const W = 520, rowH = 22, L = 190, R = 16, H = rows.length * rowH + 30;
  const all = rows.flatMap(r => r.ts.map(t => Math.abs(t.t))).filter(v => v > 0);
  const mx = Math.max(10, ...all);
  const x = d3.scaleLog().domain([0.1, mx * 1.2]).range([L, W - R]).clamp(true);
  const svg = d3.select(f).append('svg').attr('viewBox', [0, 0, W, H]).attr('role', 'img').attr('aria-label', 't statistics per paper');
  const ax = svg.append('g').attr('class', 'axis').attr('transform', 'translate(0,' + (H - 22) + ')').call(d3.axisBottom(x).tickValues([0.1, 0.5, 1, 1.96, 5, 10, 30, 100].filter(v => v <= mx * 1.2)).tickFormat(d3.format('~g')));
  const ref = svg.append('g').attr('class', 'ref');
  [[1.96, '1.96'], [2.58, '2.58']].forEach(([v, t]) => { ref.append('line').attr('x1', x(v)).attr('x2', x(v)).attr('y1', 0).attr('y2', H - 22); ref.append('text').attr('x', x(v) + 2).attr('y', 9).text(t); });
  const g = svg.selectAll('g.row').data(rows).join('g').attr('class', 'row bar').attr('transform', (d, i) => 'translate(0,' + (i * rowH + 12) + ')')
    .on('click', (ev, d) => go('#/paper/' + encodeURIComponent(d.artid)));
  g.append('text').attr('x', L - 6).attr('y', 4).attr('text-anchor', 'end').text(d => cite(d.artid));
  g.append('line').attr('x1', L).attr('x2', W - R).attr('y1', 0).attr('y2', 0).attr('stroke', getCSS('--rule'));
  g.each(function (d) {
    const gg = d3.select(this);
    if (!d.ts.length) { gg.append('text').attr('x', L + 4).attr('y', 4).attr('class', 'axis').text(d.n_headline ? 'no standard errors printed (intervals or figures only)' : 'no headline estimate'); return; }
    gg.selectAll('circle').data(d.ts).join('circle').attr('cx', t => x(Math.max(0.1, Math.abs(t.t)))).attr('cy', 0).attr('r', 4)
      .attr('fill', t => t.approx ? 'none' : getCSS('--accent')).attr('stroke', getCSS('--accent')).attr('fill-opacity', .6)
      .append('title').text(t => t.record_id + ': t = ' + num(t.t, 2) + (t.approx ? ' (approximate)' : ''));
    if (d.median_abs_t != null) gg.append('line').attr('x1', x(d.median_abs_t)).attr('x2', x(d.median_abs_t)).attr('y1', -7).attr('y2', 7).attr('stroke', getCSS('--ink')).attr('stroke-width', 2);
  });
  tableAlt(f, ['paper', 'headline', 'with t', 'approx', 'median |t|'], rows.map(r => [esc(cite(r.artid)), r.n_headline, r.n_with_t, r.n_approx, r.median_abs_t == null ? '–' : num(r.median_abs_t, 1)]));
  return f;
}

/* ================= about ================= */
function searchRecord() {
  const r = G.meta.search; if (!r) return '';
  const names = { openalex: 'OpenAlex', semantic_scholar: 'Semantic Scholar', scopus: 'Scopus', econlit: 'EconLit', wos: 'Web of Science' };
  const src = (r.sources || []).map(x => (names[x.db] || x.db) + ' ' + (x.hits == null ? '' : x.hits.toLocaleString('en')) + (x.automated ? '' : ' (export)')).join(', ');
  return '<h3>Search record</h3>' +
    '<p>Literature last searched on ' + esc(r.date) + ' with the protocol\u2019s string in ' + esc(src) + '. ' +
    (r.economics_only ? 'Restricted to economics' + (r.not_economics != null ? ' (' + r.not_economics.toLocaleString('en') + ' records from other fields left out)' : '') + '. ' : '') +
    (r.cutoff_year ? 'Papers published before ' + r.cutoff_year + ' are left out' + (r.published_before_cutoff != null ? ' (' + r.published_before_cutoff.toLocaleString('en') + ' records)' : '') + '. ' : '') +
    (r.unique != null ? 'After deduplication by DOI and title: ' + r.unique.toLocaleString('en') + ' unique records, ' + r.in_corpus.toLocaleString('en') + ' already in the corpus, ' + r.new.toLocaleString('en') + ' new. ' : '') +
    (r.focus != null ? 'The <b>focus set</b>, records whose title or abstract mentions both Denmark and register or administrative data, holds ' + r.focus.toLocaleString('en') + ' records (' + r.focus_in_corpus.toLocaleString('en') + ' already in the corpus) and is the starting point for extraction; ' : '') +
    'the remaining candidates wait for the full-text screen, which catches papers whose abstract does not name their data. Working-paper indexes and citation snowballing are not part of the search yet.</p>';
}
function viewAbout(app) {
  const w = wrap(app, 'about');
  const m = G.meta, T = STATS.totals;
  const built = (m.built_at || '').slice(0, 10);
  w.innerHTML =
    '<h2>About the atlas</h2>' +
    '<p class="sub">Built ' + esc(built) + ' from ' + T.papers + ' papers' + MID + T.records_accepted + ' relations' + MID + T.concepts_touched + ' concepts' + MID + 'taxonomy batch ' + esc(m.taxonomy.batch) + ' (' + esc(m.taxonomy.status) + ')</p>' +
    '<p>The atlas reads published economics research built on Danish administrative registers and reduces each paper to its stated causal claims: ' +
    'one cause, one effect, a sign, the population and years it holds for, and the evidence behind it. Across papers the claims are placed on one ' +
    'concept vocabulary, which turns the literature into a signed graph that can be queried rather than only read. Everything here is produced by an ' +
    'automated pipeline, including the reading of the papers, and should be taken as a machine-made index into the literature, not as a verdict on it.</p>' +
    '<h3>The corpus</h3>' +
    '<p>The first harvest came from OpenAlex through three channels: phrases for Danish register or administrative data in titles and abstracts, ' +
    'mentions of Denmark in a curated list of economics journals screened for register terms, and works citing canonical Danish-register papers. ' +
    'A written protocol now fixes the eligibility criteria: the setting is Denmark; the main data are Statistics Denmark register microdata, including ' +
    'survey data when they are linked to the registers; the discipline is economics; the paper estimates something; journal articles and the main ' +
    'working-paper series. One search string, (Denmark OR Danish) and a register-data term, is run in OpenAlex and Semantic Scholar by API and in Scopus ' +
    'and EconLit by export, each run logged with its date and hit count; records are deduplicated by DOI and then by title, and screened in two stages, ' +
    'first the title and abstract against the criteria, then the full text\u2019s data section.</p>' +
    searchRecord() +
    '<h3>How a paper is read</h3>' +
    '<p>Four objects are extracted per paper, each by a separate model pass with its own prompt, output schema and deterministic checks.</p>' +
    '<ul>' +
    '<li><b>Exhibits.</b> Every table column and figure panel, cell by cell, with the design each column reports (model, fixed effects, sample).</li>' +
    '<li><b>Stated claims.</b> The abstract decides which claims exist: each is an atomic directional statement anchored on a verbatim abstract sentence, ' +
    'typed as an edge, a comparison or a non-causal statement, with its scope (setting, population, period, identification). The introduction may refine a claim but cannot add one. ' +
    'This protocol is shared, text for text, with a companion project on reproduction, so that the two cannot drift apart.</li>' +
    '<li><b>Claim map.</b> Each claim is linked to the exhibit cells that test it, with a role (main, robustness, placebo) and the cell the paper itself points to as its headline.</li>' +
    '<li><b>Design records.</b> One record per estimate: identification strategy, source of variation, instrument, stated and implicit assumptions with quotes, population, horizon and magnitude.</li>' +
    '</ul>' +
    '<h3>Runs, adjudication and verdicts</h3>' +
    '<p>The claim pass is run at least twice per paper. An adjudication call partitions the runs’ wordings into variables (the same thing, a mirror image, ' +
    'or a sub-variable), after which everything is deterministic: one graph per paper with every edge any run stated, the support of each edge across runs, ' +
    'and flags where runs disagree on existence, direction or sign. The default rule is strict and needs no reviewer: an edge is causal only if an identified design ' +
    'record stands behind it; a sign conflict is settled by the paper’s own tables or the edge is rejected; a direction conflict is rejected; an edge stated by a minority of runs ' +
    'without a design behind it is rejected as unsupported. When an existence disagreement remains that another run could settle, one more run is added, up to five. ' +
    'The graph shows accepted edges; rejected ones can be switched on, with their reason.</p>' +
    '<h3>The concept vocabulary</h3>' +
    '<p>The vocabulary starts empty. A structure pass reads every cause and effect phrase with its claims and abstract sentences and proposes domains, concepts and ' +
    'sub-concepts, each with a definition, a direction relative to its parent, aliases and a placement for every phrase. A node is a variable, never a statistic of one: ' +
    'the level, growth or logarithm of a quantity are one concept. Polarity is a property of the pair (phrase, concept): a paper stated in net-of-tax terms and one stated in ' +
    'tax-rate terms land on the same signed edge. Pure parents, such as a concept that only groups its sub-concepts, carry no paper of their own; selecting one in the graph selects its sub-concepts.</p>' +
    '<h3>How the graph is joined</h3>' +
    '<p>A corpus node is a concept. Each paper’s adjudicated variables are placed on concepts through their wordings (an exact member of the vocabulary, an alias, ' +
    'or the closest placed phrase under lexical rules); a variable no concept covers folds into its placed parent or appears as a wording not yet in the taxonomy. ' +
    'Signs are composed on the way: the edge sign, the wording’s polarity relative to its variable, the placement’s polarity relative to the concept, and, when sub-concepts ' +
    'are folded into their parent, the sub-concept’s declared direction. One concept pair carries one record per paper, and the page recomputes the pair’s consensus ' +
    'after every filter: contested means opposite signs from different papers among the records on screen.</p>' +
    '<p>Population groups come from a scope pass over the estimates each claim links to: the table columns’ sample restrictions, unit and time period, the figures’ sample ' +
    'descriptions and the design records’ population fields, placed on small per-facet dictionaries (sex, life stage, role, event, sector, comparison) that grow paper by paper so ' +
    'the same group is one chip across papers. The years are the sample period of those estimates. Where the pass has not run, the chips fall back to a lexicon over the stated ' +
    'populations and the years to the stated period, the design records’ range, then the publication year. A t statistic is a headline design record’s point estimate over its ' +
    'standard error; when only a confidence interval is printed the standard error is approximated from it and the point is drawn hollow.</p>' +
    '<h3>Reading the graph</h3>' +
    '<p>Arrows point from cause to effect and are coloured by sign: green increases, red decreases, grey no effect; dashed when the sign is unclear or contested; dotted when the paper\u2019s design records exist but none is an identified design; faint when the design pass has not run for the paper yet. Line width counts papers; node colour is the concept’s domain. Click an arrow for the papers behind it with their evidence, a concept for its summary ' +
    'and wordings. Every view, with its filters, is a link.</p>';
}

/* ================= paper page ================= */
function viewPaper(app, artid) {
  const p = PAPER[artid];
  const w = wrap(app);
  if (!p) { w.appendChild(el('p', 'empty', 'No paper ' + esc(artid) + ' in the atlas.')); return; }
  w.appendChild(el('p', 'sub', '<a href="#/papers">Papers</a> / ' + esc(cite(artid))));
  w.appendChild(el('h2', null, esc(p.title)));
  const cb = el('div', 'citebox');
  cb.innerHTML = '<div class="authors">' + esc((p.authors || []).join(', ')) + (p.journal ? MID + esc(p.journal) : '') + (p.year ? MID + p.year : '') +
    (p.doi ? MID + '<a href="https://doi.org/' + esc(p.doi) + '" rel="noopener">doi:' + esc(p.doi) + '</a>' : '') + '</div>';
  w.appendChild(cb);
  const k = el('div', 'kpis');
  [[p.n_stated, 'stated edges'], [p.n_accepted, 'accepted'], [p.n_rejected, 'rejected'], [p.n_designs, 'design records'], [p.n_headline, 'headline'], [p.k + ' (' + (p.runs || []).length + ')', 'claim runs']].forEach(([n, l]) =>
    k.appendChild(el('div', 'kpi', '<b>' + n + '</b><span>' + l + '</span>')));
  w.appendChild(k);
  let kv = '<dt>identification</dt><dd>' + Object.entries(p.strategies).sort((a, b) => b[1] - a[1]).map(([s, n]) => esc(nice(s)) + ' (' + n + ')').join(', ') +
    (Object.keys(p.strategies_all).length > Object.keys(p.strategies).length ? '<br><span class="role">all records: ' + Object.entries(p.strategies_all).map(([s, n]) => esc(nice(s)) + ' ' + n).join(', ') + '</span>' : '') + '</dd>';
  kv += '<dt>evidence years</dt><dd>' + (p.period.from == null ? 'unknown' : p.period.from + '–' + p.period.to) + ' <span class="role">(' + esc(p.period.source) + ')</span></dd>';
  kv += '<dt>groups</dt><dd>' + p.scope_tags.map(nice).map(esc).join(', ') + '</dd>';
  kv += '<dt>concepts</dt><dd>' + p.concepts.map(c => '<a href="#/concept/' + encodeURIComponent(c) + '">' + esc(conceptLabel(c)) + '</a>').join(', ') + '</dd>';
  if (p.n_unplaced) kv += '<dt>unplaced</dt><dd>' + p.n_unplaced + ' variable' + (p.n_unplaced === 1 ? '' : 's') + ' not yet in the taxonomy</dd>';
  w.appendChild(el('dl', 'kv', kv));
  const recs = allRecords().filter(r => r.paper === artid);
  const sub = subset(recs, false);
  w.appendChild(el('h3', null, 'The paper’s graph'));
  const split = el('div', 'split'); w.appendChild(split);
  const left = el('div'); split.appendChild(left);
  const cy = el('div'); cy.id = 'cy'; cy.className = 'paper'; left.appendChild(cy);
  left.appendChild(el('p', 'sub', 'Causes left, effects right; the sign sits on the arrow. Click an arrow for its evidence, a box for the concept.'));
  const panel = el('aside'); panel.id = 'panel'; panel.innerHTML = '<p class="hint">Click an arrow for its evidence.</p>'; split.appendChild(panel);
  if (sub.edges.length) drawDag(cy, sub.nodes, sub.edges, { onEdge: e => showEdge(panel, e), onNode: id => showNode(panel, id, sub) });
  else cy.innerHTML = '<p class="empty" style="padding:2rem">No accepted edges.</p>';
  w.appendChild(el('h3', null, 'Edges'));
  const tw = el('div', 'tablewrap'); const t = el('table');
  t.innerHTML = '<tr><th>cause</th><th></th><th>effect</th><th>kind</th><th>verdict</th><th>runs</th><th>population</th><th>years</th></tr>';
  recs.forEach(r => { const tr = el('tr', 'clickable');
    tr.innerHTML = '<td>' + esc(conceptLabel(r.from)) + '<br><span class="role">' + esc(r.from_wording) + '</span></td><td>' + signHtml(r.sign) + '</td><td>' + esc(conceptLabel(r.to)) + '<br><span class="role">' + esc(r.to_wording) + '</span></td>' +
      '<td>' + esc(r.kind) + (r.strategies.length ? '<br><span class="role">' + r.strategies.map(s => nice(s.strategy)).map(esc).join(', ') + '</span>' : '') + '</td>' +
      '<td>' + (r.verdict === 'accepted' ? 'accepted' : '<span class="con">rejected</span><br><span class="role">' + esc(nice(r.reason)) + '</span>') + '</td><td class="num">' + r.support + '/' + r.k + '</td>' +
      '<td>' + esc(r.populations.join('; ')) + '</td><td class="num">' + (r.years.from == null ? '' : r.years.from + '–' + r.years.to) + '</td>';
    tr.onclick = () => { const e = Object.assign({ id: r.from + '->' + r.to, from: r.from, to: r.to, records: [r] }, aggregate([r])); showEdge(panel, e); panel.scrollIntoView({ block: 'nearest' }); };
    t.appendChild(tr); });
  tw.appendChild(t); w.appendChild(tw);
  if (p.headline && p.headline.length) {
    w.appendChild(el('h3', null, 'Headline estimates'));
    const tw2 = el('div', 'tablewrap'); const t2 = el('table');
    t2.innerHTML = '<tr><th>record</th><th>what it estimates</th><th>design</th><th class="num">estimate</th><th class="num">se</th><th class="num">t</th><th>exhibit</th></tr>' +
      p.headline.map(h => '<tr><td class="role">' + esc(h.record_id) + '</td><td>' + esc(h.statement || '') + '</td><td>' + esc(nice(h.strategy)) + '</td><td class="num">' + num(h.estimate) +
        '</td><td class="num">' + (h.se == null ? '' : num(h.se)) + '</td><td class="num">' + (h.t == null ? '–' : num(h.t, 1) + (h.approx ? '≈' : '')) + '</td><td class="role">' + esc(h.source_table_id || '') + '</td></tr>').join('');
    tw2.appendChild(t2); w.appendChild(tw2);
  }
}
