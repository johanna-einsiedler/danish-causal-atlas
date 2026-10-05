/* The Danish Causal Atlas — viewer.
   Reads ONLY site/data/. Never touches the pipeline: that separation is what
   lets a redacted public export reuse this file unchanged.
   Hash routing, so back/forward work and any view is linkable. */
'use strict';
const ARROW = '→', MINUS = '−', DASH = '—';
const $ = s => document.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t);
  if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SIGN = { positive: ['+', 'pos'], negative: [MINUS, 'neg'], null: ['0', 'nul'],
               mixed: ['~', 'nul'], nonmonotonic: ['~', 'nul'] };
const sgn = s => SIGN[s] || ['?', 'nul'];
const lbl = id => (NODE[id] && NODE[id].label) || id;
const nice = s => String(s || '').replace(/_/g, ' ');
/* Superscripts/subscripts for the notation papers actually use: b^I_q,
   alpha_1j, DeltaE[...]. Deliberately conservative — it only fires when the
   string contains a caret, because plain prose is full of underscores that
   must stay literal (variable ids, file names). Run AFTER esc(). */
function mathy(str) {
  const t = String(str == null ? '' : str);
  if (t.indexOf('^') < 0) return esc(t);
  return esc(t)
    .replace(/([A-Za-z0-9\)\]])_\{([^}]{1,12})\}/g, '$1<sub>$2</sub>')
    .replace(/([A-Za-z0-9\)\]])_([A-Za-z0-9]{1,3})\b/g, '$1<sub>$2</sub>')
    .replace(/([A-Za-z0-9\)\]])\^\{([^}]{1,12})\}/g, '$1<sup>$2</sup>')
    .replace(/([A-Za-z0-9\)\]])\^([A-Za-z0-9+\-]{1,4})/g, '$1<sup>$2</sup>');
}

let G, CLAIMS, PAPERS, WIKI, TAX, RELIABILITY, SEARCH,
    NODE = {}, EDGE = {}, BY_CLAIM = {}, DEG = {};
const PAPER_YEAR = {};

/* ================= load ================= */
(async function init() {
  const [g, c, p, wk, tx, rel] = await Promise.all(
    ['data/graph.json', 'data/claims.json', 'data/papers.json',
     'data/wiki.json', 'data/taxonomy.json', 'data/reliability.json']
      .map(u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null)));
  G = g; CLAIMS = c; PAPERS = p; WIKI = wk; TAX = tx; RELIABILITY = rel;
  G.nodes.forEach(n => NODE[n.id] = n);
  G.edges.forEach(e => { EDGE[e.from + ' ' + e.to] = e;
    DEG[e.from] = (DEG[e.from] || 0) + 1; DEG[e.to] = (DEG[e.to] || 0) + 1; });
  CLAIMS.forEach(x => BY_CLAIM[x.claim_id] = x);
  PAPERS.forEach(p => PAPER_YEAR[p.artid] = p.year || 0);

  SEARCH = new MiniSearch({
    fields: ['statement', 'tl', 'ol', 'td', 'od', 'sov', 'title', 'design'],
    storeFields: ['claim_id'], searchOptions: { prefix: true, fuzzy: 0.15 } });
  SEARCH.addAll(CLAIMS.map(x => ({
    id: x.claim_id, claim_id: x.claim_id, statement: x.statement || '',
    tl: x.treatment.label || '', ol: x.outcome.label || '',
    td: x.treatment.definition || '', od: x.outcome.definition || '',
    sov: x.source_of_variation || '', title: x.paper.title || '', design: x.design || '' })));

  window.addEventListener('hashchange', route);
  route();
})();

/* ================= router ================= */
function route() {
  const h = decodeURIComponent(location.hash.slice(1) || '/');
  const [, head, ...rest] = h.split('/');
  const arg = rest.join('/');
  document.querySelectorAll('nav .links a').forEach(a =>
    a.classList.toggle('on', a.dataset.r === head));
  window.scrollTo(0, 0);
  const app = $('#app'); app.innerHTML = '';
  if (head === 'graph') return viewGraph(app, arg);
  if (head === 'variables') return viewVariables(app);
  if (head === 'relations') return viewRelations(app);
  if (head === 'papers') return viewPapers(app);
  if (head === 'node') return viewNode(app, arg);
  if (head === 'edge') return viewEdge(app, arg);
  if (head === 'claim') return viewClaim(app, arg);
  if (head === 'paper') return viewPaper(app, arg);
  if (head === 'wiki') return viewWiki(app);
  if (head === 'design' || head === 'variation' || head === 'theory')
    return viewWikiPage(app, head, arg);
  if (head === 'taxonomy') return arg ? viewTaxonomyCol(app, arg) : viewTaxonomy(app);
  if (head === 'reliability') return viewReliability(app);
  if (head === 'corrections') return viewCorrections(app);
  if (head === 'about') return viewAbout(app);
  return viewLanding(app);
}
const go = h => { location.hash = h; };
const edgeHref = e => '#/edge/' + encodeURIComponent(e.from + '|' + e.to);
const wrap = (app, cls) => { const w = el('div', 'wrap' + (cls ? ' ' + cls : ''));
  app.appendChild(w); return w; };
function crumb(w, items) {
  const c = el('div', 'crumb');
  c.innerHTML = items.map(([t, h]) => h ? '<a href="' + h + '">' + esc(t) + '</a>'
                                        : esc(t)).join(' / ');
  w.appendChild(c);
}

/* Where am I in the corpus? An indented tree beats a one-line breadcrumb here,
   because the levels are a real containment hierarchy: corpus > domain >
   variable > relation. Every level above the current one is clickable. */
function hierarchy(w, levels) {
  const t = el('div', 'tree');
  levels.forEach((L, i) => {
    const rail = i === 0 ? '' :
      '<span class="rail">' + '\u00a0'.repeat((i - 1) * 4) + '\u2514\u2500\u2500\u2500 </span>';
    const here = i === levels.length - 1;
    const body = (L.href && !here) ? '<a href="' + L.href + '">' + esc(L.label) + '</a>'
                                   : esc(L.label);
    t.appendChild(el('div', 'lvl' + (here ? ' here' : ''),
      rail + body + (L.count != null ? ' <span class="cnt">(' + L.count + ')</span>' : '')));
  });
  w.appendChild(t);
  return t;
}
const domainOf = id => (NODE[id] || {}).domain || 'other';
const domCount = d => G.nodes.filter(n => n.domain === d).length;

/* ================= landing ================= */
function viewLanding(app) {
  const contested = G.edges.filter(e => e.has_contradiction).length;
  const designs = new Set(CLAIMS.map(c => c.design).filter(Boolean)).size;
  const hero = el('div', 'hero');
  hero.appendChild(el('h1', null, 'The Danish Causal Atlas'));
  hero.appendChild(el('p', 'lede',
    'Published economics research built on Danish administrative registers, read ' +
    'and reduced to its causal claims. Every arrow is a relation some paper tested, ' +
    'carrying its direction, estimate, design, population and period.'));
  hero.appendChild(el('p', 'lede',
    'Because the claims share a vocabulary, the literature can be queried rather ' +
    'than only read: where papers corroborate one another, where they contradict, ' +
    'and which relations nobody has tested yet.'));

  const figs = el('div', 'figures');
  [[PAPERS.length, 'papers'], [CLAIMS.length, 'claims'],
   [G.nodes.length, 'variables'], [G.edges.length, 'relations'],
   [designs, 'designs'], [contested, 'contested']].forEach(([n, k]) => {
    figs.appendChild(el('div', 'fig', '<b>' + n + '</b><span>' + k + '</span>')); });
  hero.appendChild(figs);

  const doors = el('div', 'doors');
  [['Explore the graph', 'The whole corpus as one map, rolled up to domains. ' +
      'Expand a domain, follow an arrow, land on the papers behind it.', '#/graph'],
   ['Search variables', 'Every concept the corpus measures, with the relations ' +
      'running into and out of it, and who studied them.', '#/variables'],
   ['Search papers', 'All ' + PAPERS.length + ' extracted papers: their claims, their ' +
      'identification strategy, and their own causal graph.', '#/papers'],
   ['Read the wiki', 'Living pages on every design, source of identifying variation and ' +
      'theory in the corpus — each paragraph citing the claims it was written from.', '#/wiki']
  ].forEach(([t, d, h]) => {
    const c = el('div', 'door',
      '<h4>' + t + '</h4><p>' + d + '</p><span class="arr">' + t + ' ' + ARROW + '</span>');
    c.onclick = () => go(h); doors.appendChild(c);
  });
  hero.appendChild(doors);
  app.appendChild(hero);
}

/* ================= graph (full page) ================= */
function viewGraph(app, domain) {
  const w = wrap(app);
  w.appendChild(el('h2', null, domain ? (G.domain_label[domain] || domain)
                                      : 'The corpus at a glance'));
  hierarchy(w, [{ label: 'Whole corpus', href: '#/graph', count: G.nodes.length }]
    .concat(domain ? [{ label: G.domain_label[domain] || domain,
                        count: domCount(domain) }] : []));
  const sub = el('p', 'sub'); w.appendChild(sub);

  const f = { causal: false, contested: false, since: null, sex: null,
              design: null, minPapers: 1 };
  const facets = el('div', 'facets'); w.appendChild(facets);
  const cyd = el('div'); cyd.id = 'cy'; cyd.className = 'full'; w.appendChild(cyd);
  const after = el('div'); w.appendChild(after);

  const keep = e => (!f.causal || e.causal) &&
    (!f.contested || e.has_contradiction) &&
    (!f.since || (e.pub_year || 0) >= f.since) &&
    (!f.sex || (e.sexes || []).indexOf(f.sex) >= 0) &&
    (!f.design || (e.designs || []).indexOf(f.design) >= 0) &&
    (e.n_papers >= f.minPapers);

  const chips = () => { facets.innerHTML = '';
    const add = (t, on, fn) => { const c = el('span', 'chip' + (on ? ' on' : ''), esc(t));
      c.onclick = () => { fn(); chips(); draw(); }; facets.appendChild(c); };
    add('causal only', f.causal, () => f.causal = !f.causal);
    add('contested', f.contested, () => f.contested = !f.contested);
    add('2+ papers', f.minPapers > 1, () => f.minPapers = f.minPapers > 1 ? 1 : 2);
    [2010, 2015, 2020].forEach(y => add('published ' + y + '+', f.since === y,
      () => f.since = f.since === y ? null : y));
    ['women', 'men'].forEach(x => add(x, f.sex === x,
      () => f.sex = f.sex === x ? null : x));
    const ds = [...new Set(G.edges.flatMap(e => e.designs || []))]
      .sort((a, b) => G.edges.filter(e => (e.designs || []).indexOf(b) >= 0).length -
                      G.edges.filter(e => (e.designs || []).indexOf(a) >= 0).length)
      .slice(0, 4);
    ds.forEach(d => add(nice(d), f.design === d, () => f.design = f.design === d ? null : d));
  };

  const draw = () => {
    after.innerHTML = '';
    const edges = G.edges.filter(keep);
    if (domain) {
      const ids = new Set(G.nodes.filter(n => n.domain === domain).map(n => n.id));
      const sub2 = edges.filter(e => ids.has(e.from) || ids.has(e.to)).slice(0, 90);
      const keepIds = new Set(); sub2.forEach(e => { keepIds.add(e.from); keepIds.add(e.to); });
      sub.innerHTML = ids.size + ' variables, ' + sub2.length +
        ' relations shown. Click a variable to focus it, an arrow for its papers.';
      drawForce('#cy', keepIds, sub2, { big: false });
      after.appendChild(legend());
      return;
    }
    // domain roll-up: aggregate to supernodes so the overview stays readable
    const dom = id => (NODE[id] || {}).domain || 'other';
    const agg = {}, counts = {};
    G.nodes.forEach(n => counts[n.domain] = (counts[n.domain] || 0) + 1);
    edges.forEach(e => {
      const a = dom(e.from), b = dom(e.to); if (a === b) return;
      const k = a + '|' + b;
      const o = (agg[k] = agg[k] || { from: a, to: b, n_papers: 0, kinds: ['causal_tested'],
                 has_contradiction: false, causal: true, papers: [], claims: [], n: 0 });
      o.n++; o.n_papers = Math.max(o.n_papers, e.n_papers);
      if (e.has_contradiction) o.has_contradiction = true;
    });
    const superEdges = Object.values(agg).map(o =>
      Object.assign(o, { agg: true }));
    sub.innerHTML = edges.length + ' of ' + G.edges.length +
      ' relations, rolled up to ' + Object.keys(counts).length +
      ' domains. Click a domain to open it.';
    const ids = new Set(Object.keys(counts));
    const nodeData = {};
    Object.keys(counts).forEach(d => nodeData[d] = {
      id: d, label: (G.domain_label[d] || d) + ' (' + counts[d] + ')',
      domain: d, domain_label: G.domain_label[d] || d,
      n_papers: Math.min(9, counts[d]) });
    drawForce('#cy', ids, superEdges, {
      nodeData: nodeData, big: true,
      onNode: d => go('#/graph/' + d.id),
      onEdge: () => {} });
    after.appendChild(legend());

    after.appendChild(el('h3', null, 'Most studied variables'));
    const t = el('table');
    t.innerHTML = '<tr><th>variable</th><th>domain</th><th class="num">papers</th>' +
                  '<th class="num">relations</th></tr>';
    G.nodes.slice().sort((a, b) => b.n_papers - a.n_papers ||
        (DEG[b.id] || 0) - (DEG[a.id] || 0)).slice(0, 18).forEach(n => {
      const tr = el('tr', 'clickable');
      tr.innerHTML = '<td>' + esc(n.label) +
        (n.resolved ? '' : ' <span class="tag unres">unmapped</span>') + '</td><td>' +
        esc(n.domain_label) + '</td><td class="num">' + n.n_papers +
        '</td><td class="num">' + (DEG[n.id] || 0) + '</td>';
      tr.onclick = () => go('#/node/' + encodeURIComponent(n.id)); t.appendChild(tr);
    });
    after.appendChild(t);
  };
  chips(); draw();
}

/* ---- D3 force renderer ----
   Directed only where the relation is causal: an association has no direction
   worth an arrowhead, so those are drawn as plain lines. Force layout rather
   than a layered one because the graph is not a clean DAG (reverse edges and
   cycles exist across papers) and force degrades more gracefully.

   Dragged nodes STAY where you put them -- the usual d3 idiom releases them on
   mouseup, which undoes the arrangement the reader just made. Double-click a
   node to release it back to the simulation. */
function drawForce(sel, nodeIds, edges, opts) {
  opts = opts || {};
  const host = document.querySelector(sel);
  if (!host) return;
  host.innerHTML = '';
  const W = host.clientWidth || 900, H = host.clientHeight || 560;
  const nodes = [...nodeIds].map(id =>
    Object.assign({ id: id }, (opts.nodeData && opts.nodeData[id]) || NODE[id] || {}));
  const byId = new Set(nodes.map(n => n.id));
  const links = edges.filter(e => byId.has(e.from) && byId.has(e.to))
    .map(e => ({ source: e.from, target: e.to, e: e }));

  const svg = d3.select(host).append('svg')
    .attr('width', '100%').attr('height', H).attr('viewBox', [0, 0, W, H]);
  const defs = svg.append('defs');
  [['arrow', '#8b897e'], ['arrow-contra', '#a5311f']].forEach(([id, col]) => {
    defs.append('marker').attr('id', id).attr('viewBox', '0 -5 10 10')
      .attr('refX', 26).attr('refY', 0).attr('markerWidth', 6)
      .attr('markerHeight', 6).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-4L9,0L0,4').attr('fill', col);
  });
  const g = svg.append('g');
  const zoom = d3.zoom().scaleExtent([0.15, 5])
    .on('zoom', ev => g.attr('transform', ev.transform));
  svg.call(zoom);

  const colOf = e => e.has_contradiction ? '#a5311f'
    : ((G.kind_style[e.kinds[0]] || {}).color || '#8b897e');
  const dashOf = e => { if (e.has_contradiction) return '6,3';
    const d = (G.kind_style[e.kinds[0]] || {}).dash;
    return d === 'dashed' ? '6,3' : d === 'dotted' ? '2,3' : null; };
  const rOf = d => 6 + Math.min(11, (d.n_papers || 1) * 1.8);

  const link = g.append('g').selectAll('line').data(links).join('line')
    .attr('stroke', d => colOf(d.e))
    .attr('stroke-width', d => 1.1 + 0.8 * (d.e.n_papers - 1))
    .attr('stroke-dasharray', d => dashOf(d.e))
    .attr('stroke-linecap', 'round').attr('stroke-opacity', .8)
    .attr('marker-end', d => d.e.causal
      ? (d.e.has_contradiction ? 'url(#arrow-contra)' : 'url(#arrow)') : null)
    .style('cursor', 'pointer')
    .on('click', (ev, d) => { if (opts.onEdge) opts.onEdge(d.e); else go(edgeHref(d.e)); });
  link.append('title').text(d =>
    lbl(d.e.from) + (d.e.causal ? ' \u2192 ' : ' \u2014 ') + lbl(d.e.to) +
    '  (' + d.e.n_papers + ' paper(s), ' + (d.e.causal ? 'causal' : 'associational') + ')');

  const node = g.append('g').selectAll('g').data(nodes).join('g')
    .style('cursor', 'pointer')
    .on('click', (ev, d) => opts.onNode ? opts.onNode(d)
                                        : go('#/node/' + encodeURIComponent(d.id)))
    .on('dblclick', (ev, d) => { ev.stopPropagation();
      d.fx = null; d.fy = null; d3.select(ev.currentTarget).select('circle')
        .attr('stroke-dasharray', null); sim.alpha(.3).restart(); })
    .call(d3.drag()
      .on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(.25).restart();
        d.fx = d.x; d.fy = d.y; })
      .on('drag', (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
      .on('end', (ev, d) => { if (!ev.active) sim.alphaTarget(0);
        // keep it pinned where the reader dropped it
        d.fx = ev.x; d.fy = ev.y;
        d3.select(ev.sourceEvent.currentTarget || ev.currentTarget)
          .select('circle').attr('stroke-dasharray', '2,2'); }));
  node.append('circle').attr('r', rOf)
    .attr('fill', d => G.domain_tint[d.domain] || '#f2f0e6')
    .attr('stroke', d => opts.focus && opts.focus.indexOf(d.id) >= 0 ? '#111' : '#9b998c')
    .attr('stroke-width', d => opts.focus && opts.focus.indexOf(d.id) >= 0 ? 2.2 : 1);
  node.append('text').text(d => d.label || d.id)
    .attr('x', d => rOf(d) + 5).attr('dy', '.32em')
    .attr('font-size', opts.big ? 13 : 11.5)
    .attr('font-family', 'Georgia,serif').attr('fill', '#111')
    .attr('paint-order', 'stroke').attr('stroke', '#fffff8').attr('stroke-width', 3.5);
  node.append('title').text(d => (d.label || d.id) + ' \u2014 ' +
    (d.domain_label || '') + ', ' + (d.n_papers || 0) + ' paper(s). Drag to pin, double-click to release.');

  /* More air: the previous settings packed everything into the middle. */
  const n = nodes.length;
  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id)
      .distance(opts.big ? 190 : 145).strength(.22))
    .force('charge', d3.forceManyBody()
      .strength(opts.big ? -1500 : -820).distanceMax(900))
    .force('center', d3.forceCenter(W / 2, H / 2).strength(.05))
    .force('collide', d3.forceCollide().radius(d => rOf(d) + (opts.big ? 46 : 34)).iterations(2))
    .force('x', d3.forceX(W / 2).strength(.015))
    .force('y', d3.forceY(H / 2).strength(.03))
    .alphaDecay(n > 40 ? .028 : .018)
    .on('tick', () => {
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
    })
    .on('end', () => fit());

  /* Zoom to fit whatever is actually there, so the graph fills the panel. */
  function fit(dur) {
    if (!nodes.length) return;
    const xs = nodes.map(d => d.x), ys = nodes.map(d => d.y);
    const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    const y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    const pad = 90;                       // room for the labels, which sit right of each node
    const k = Math.max(0.15, Math.min(2.2,
      0.95 * Math.min(W / (x1 - x0 + pad * 2), H / (y1 - y0 + pad))));
    const tx = W / 2 - k * (x0 + x1) / 2, ty = H / 2 - k * (y0 + y1) / 2;
    svg.transition().duration(dur == null ? 450 : dur)
      .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
  }
  setTimeout(() => fit(0), 350);          // early fit so it never opens off-screen
  host.__fit = fit;
  return sim;
}

function legend() {
  const box = el('div', 'legend');
  Object.entries(G.kind_style).forEach(([k, v]) => box.appendChild(el('span', null,
    '<i style="border-top-color:' + v.color + ';border-top-style:' +
    (v.dash === 'solid' ? 'solid' : v.dash) + '"></i>' + nice(k))));
  box.appendChild(el('span', null,
    '<i style="border-top-color:#a5311f;border-top-style:dashed"></i><b>contested</b>'));
  box.appendChild(el('span', null, ARROW + ' causal \u00b7 \u2014 associational'));
  return box;
}

/* A capped neighbourhood, never the whole graph. */
function drawNeighbourhood(focus, hops, cap) {
  const keep = new Set(focus);
  for (let h = 0; h < (hops || 1); h++) {
    G.edges.filter(e => keep.has(e.from) || keep.has(e.to))
      .sort((a, b) => b.n_papers - a.n_papers).slice(0, (cap || 16) * (h + 1))
      .forEach(e => { keep.add(e.from); keep.add(e.to); });
  }
  const all = G.edges.filter(e => keep.has(e.from) && keep.has(e.to));
  const shown = all.slice(0, 70);
  const ids = new Set(); shown.forEach(e => { ids.add(e.from); ids.add(e.to); });
  drawForce('#cy', ids, shown, { focus: focus });
  if (all.length > shown.length) document.querySelector('#cy').after(
    el('div', 'crumb', 'showing ' + shown.length + ' of ' + all.length + ' relations'));
}

/* ================= variables ================= */
function viewVariables(app) {
  const w = wrap(app);
  crumb(w, [['Atlas', '#/'], ['Variables', null]]);
  w.appendChild(el('h2', null, 'Variables'));
  w.appendChild(el('p', 'sub', 'Every concept the corpus measures. ' +
    'Type to filter; ' + G.nodes.filter(n => !n.resolved).length +
    ' of ' + G.nodes.length + ' are still free-text labels awaiting canonicalisation.'));
  const q = el('input', 'searchbar'); q.placeholder =
    'Filter variables…  try "earnings", "education", "tax"'; w.appendChild(q);
  const facets = el('div', 'facets'); w.appendChild(facets);
  const host = el('div'); w.appendChild(host);
  let onlyResolved = false, dom = null;

  const chips = () => { facets.innerHTML = '';
    const add = (t, on, fn) => { const c = el('span', 'chip' + (on ? ' on' : ''), esc(t));
      c.onclick = () => { fn(); chips(); draw(); }; facets.appendChild(c); };
    add('mapped only', onlyResolved, () => onlyResolved = !onlyResolved);
    [...new Set(G.nodes.map(n => n.domain))]
      .sort((a, b) => G.nodes.filter(n => n.domain === b).length -
                      G.nodes.filter(n => n.domain === a).length).slice(0, 8)
      .forEach(d => add(G.domain_label[d] || d, dom === d,
        () => dom = dom === d ? null : d)); };

  const draw = () => {
    const term = q.value.trim().toLowerCase();
    let list = G.nodes.filter(n =>
      (!onlyResolved || n.resolved) && (!dom || n.domain === dom) &&
      (!term || n.id.toLowerCase().includes(term) || n.label.toLowerCase().includes(term)));
    list.sort((a, b) => b.n_papers - a.n_papers || (DEG[b.id] || 0) - (DEG[a.id] || 0));
    host.innerHTML = '';
    host.appendChild(el('h3', null, list.length + ' variables'));
    if (!list.length) { host.appendChild(el('p', 'empty', 'Nothing matches.')); return; }
    const t = el('table');
    t.innerHTML = '<tr><th>variable</th><th>domain</th><th class="num">papers</th>' +
                  '<th class="num">relations</th></tr>';
    list.slice(0, 300).forEach(n => {
      const tr = el('tr', 'clickable');
      tr.innerHTML = '<td>' + esc(n.label) +
        (n.resolved ? '' : ' <span class="tag unres">unmapped</span>') +
        '</td><td>' + esc(n.domain_label) + '</td><td class="num">' + n.n_papers +
        '</td><td class="num">' + (DEG[n.id] || 0) + '</td>';
      tr.onclick = () => go('#/node/' + encodeURIComponent(n.id)); t.appendChild(tr);
    });
    host.appendChild(t);
  };
  q.addEventListener('input', draw); chips(); draw(); q.focus();
}

/* ================= relations ================= */
/* A browser over edges, parallel to the variables browser. Filters here are on
   the RELATION, not on individual claims: "causal only", "published since",
   "contested" are questions about the state of the literature on a link. */
function viewRelations(app) {
  const w = wrap(app);
  w.appendChild(el('h2', null, 'Relations'));
  w.appendChild(el('p', 'sub', G.edges.length + ' relations asserted across the corpus. ' +
    G.edges.filter(e => e.causal).length + ' are causal; the rest are associational.'));
  const q = el('input', 'searchbar');
  q.placeholder = 'Filter by either variable…  try "earnings", "education"';
  w.appendChild(q);
  const facets = el('div', 'facets'); w.appendChild(facets);
  const host = el('div'); w.appendChild(host);

  const f = { causal: false, contested: false, sign: null, since: null,
              design: null, minPapers: 1, sex: null };
  const chips = () => { facets.innerHTML = '';
    const add = (t, on, fn) => { const c = el('span', 'chip' + (on ? ' on' : ''), esc(t));
      c.onclick = () => { fn(); chips(); draw(); }; facets.appendChild(c); };
    add('causal only', f.causal, () => f.causal = !f.causal);
    add('contested', f.contested, () => f.contested = !f.contested);
    add('2+ papers', f.minPapers > 1, () => f.minPapers = f.minPapers > 1 ? 1 : 2);
    ['positive', 'negative', 'null'].forEach(x =>
      add(x, f.sign === x, () => f.sign = f.sign === x ? null : x));
    [2010, 2015, 2020].forEach(y => add('published ' + y + '+', f.since === y,
      () => f.since = f.since === y ? null : y));
    ['women', 'men'].forEach(x => add(x, f.sex === x, () => f.sex = f.sex === x ? null : x));
    [...new Set(G.edges.flatMap(e => e.designs || []))]
      .sort((a, b) => G.edges.filter(e => (e.designs || []).indexOf(b) >= 0).length -
                      G.edges.filter(e => (e.designs || []).indexOf(a) >= 0).length)
      .slice(0, 5).forEach(d => add(nice(d), f.design === d,
        () => f.design = f.design === d ? null : d));
  };

  const draw = () => {
    const term = q.value.trim().toLowerCase();
    const list = G.edges.filter(e =>
      (!f.causal || e.causal) &&
      (!f.contested || e.has_contradiction) &&
      (!f.sign || e.consensus_sign === f.sign) &&
      (!f.since || (e.pub_year || 0) >= f.since) &&
      (!f.sex || (e.sexes || []).indexOf(f.sex) >= 0) &&
      (!f.design || (e.designs || []).indexOf(f.design) >= 0) &&
      e.n_papers >= f.minPapers &&
      (!term || (lbl(e.from) + ' ' + lbl(e.to) + ' ' + e.from + ' ' + e.to)
        .toLowerCase().includes(term)));
    list.sort((a, b) => b.n_papers - a.n_papers || b.n_claims - a.n_claims);
    host.innerHTML = '';
    host.appendChild(el('h3', null, list.length + ' relations' +
      (list.length !== G.edges.length ? ' of ' + G.edges.length : '')));
    if (!list.length) { host.appendChild(el('p', 'empty',
      'No relations match these filters.')); return; }
    const t = el('table');
    t.innerHTML = '<tr><th>relation</th><th>kind</th><th class="num">papers</th>' +
                  '<th>direction</th><th>designs</th><th class="num">latest</th></tr>';
    list.slice(0, 400).forEach(e => {
      const cs = e.consensus_sign;
      const cls = cs === 'positive' ? 'pos' : cs === 'negative' ? 'neg' : 'nul';
      const tr = el('tr', 'clickable');
      tr.innerHTML = '<td>' + mathy(lbl(e.from)) + ' ' +
        (e.causal ? ARROW : '\u2014') + ' ' + mathy(lbl(e.to)) + '</td>' +
        '<td>' + (e.causal ? 'causal' : 'associational') + '</td>' +
        '<td class="num">' + e.n_papers + '</td>' +
        '<td><span class="sign ' + cls + '">' + esc(cs || DASH) + '</span>' +
        (e.has_contradiction ? ' <span class="tag contra">contested</span>' : '') +
        (e.within_paper_mixed ? ' <span class="tag">mixed</span>' : '') + '</td>' +
        '<td>' + esc((e.designs || []).slice(0, 2).map(nice).join(', ')) + '</td>' +
        '<td class="num">' + (e.pub_year || '') + '</td>';
      tr.onclick = () => go(edgeHref(e)); t.appendChild(tr);
    });
    host.appendChild(t);
  };
  q.addEventListener('input', draw); chips(); draw(); q.focus();
}

/* ================= papers ================= */
function viewPapers(app) {
  const w = wrap(app);
  crumb(w, [['Atlas', '#/'], ['Papers', null]]);
  w.appendChild(el('h2', null, 'Papers'));
  w.appendChild(el('p', 'sub', PAPERS.length + ' papers read and reduced to claims.'));
  const q = el('input', 'searchbar');
  q.placeholder = 'Filter by title, author, journal, design…'; w.appendChild(q);
  const host = el('div'); w.appendChild(host);
  const draw = () => {
    const t0 = q.value.trim().toLowerCase();
    const list = PAPERS.filter(p => !t0 ||
      [p.title, (p.authors || []).join(' '), p.journal, (p.designs || []).join(' ')]
        .join(' ').toLowerCase().includes(t0))
      .sort((a, b) => (b.year || 0) - (a.year || 0));
    host.innerHTML = '';
    host.appendChild(el('h3', null, list.length + ' papers'));
    const t = el('table');
    t.innerHTML = '<tr><th>paper</th><th>journal</th><th class="num">year</th>' +
                  '<th class="num">claims</th><th>design</th></tr>';
    list.forEach(p => {
      const tr = el('tr', 'clickable');
      tr.innerHTML = '<td>' + esc(p.title || p.artid) + '<br><span class="sub">' +
        esc((p.authors || []).slice(0, 3).join(', ')) + '</span></td>' +
        '<td>' + esc(p.journal || '') + '</td>' +
        '<td class="num">' + (p.year || '') + '</td>' +
        '<td class="num">' + p.n_claims + '</td><td>' +
        esc((p.designs || []).slice(0, 2).map(nice).join(', ')) + '</td>';
      tr.onclick = () => go('#/paper/' + p.artid); t.appendChild(tr);
    });
    host.appendChild(t);
  };
  q.addEventListener('input', draw); draw(); q.focus();
}

/* ================= node ================= */
/* One merged relationship list, not incoming/outgoing. Direction is only
   meaningful for the causal kinds; a descriptive or correlational relation has
   no direction worth splitting a table over. Direction is shown per row. */
function viewNode(app, id) {
  const n = NODE[id]; const w = wrap(app);
  if (!n) { w.appendChild(el('p', 'empty', 'Unknown variable.')); return; }
  w.appendChild(el('h2', null, esc(n.label)));
  w.appendChild(el('p', 'sub', '<code>' + esc(n.id) + '</code> \u00b7 ' +
    esc(n.domain_label) + ' \u00b7 studied in ' + n.n_papers + ' paper(s)' +
    (n.resolved ? '' : ' <span class="tag unres">unmapped label</span>')));
  hierarchy(w, [
    { label: 'Whole corpus', href: '#/graph', count: G.nodes.length },
    { label: n.domain_label, href: '#/graph/' + n.domain, count: domCount(n.domain) },
    { label: n.label }]);
  if (n.description) w.appendChild(el('p', null, mathy(n.description)));
  if (!n.resolved) w.appendChild(el('div', 'note',
    'This is a free-text label rather than an ontology concept, so it cannot yet ' +
    'merge with equivalent variables from other papers. Every such node in this ' +
    'corpus appears in exactly one paper, which is why canonicalisation matters.'));

  const rels = G.edges.filter(x => x.from === n.id || x.to === n.id)
    .map(x => ({ e: x, other: x.from === n.id ? x.to : x.from,
                 out: x.from === n.id }));
  const CAUSAL = ['causal_tested', 'causal_assumed', 'instrument'];
  const isCausal = e => e.kinds.some(k => CAUSAL.indexOf(k) >= 0);
  const yearOf = a => (PAPER_YEAR[a] || 0);
  const maxYear = e => Math.max.apply(null, [0].concat(e.papers.map(yearOf)));

  const f = { sign: null, since: null, design: null, causal: false, contested: false };
  const facets = el('div', 'facets'); w.appendChild(facets);
  const host = el('div'); w.appendChild(host);

  const chips = () => { facets.innerHTML = '';
    const add = (t, on, fn) => { const c = el('span', 'chip' + (on ? ' on' : ''), esc(t));
      c.onclick = () => { fn(); chips(); draw(); }; facets.appendChild(c); };
    add('causal only', f.causal, () => f.causal = !f.causal);
    add('contested', f.contested, () => f.contested = !f.contested);
    ['positive', 'negative', 'null'].forEach(sg =>
      add(sg, f.sign === sg, () => f.sign = f.sign === sg ? null : sg));
    [2010, 2015, 2020].forEach(y =>
      add('since ' + y, f.since === y, () => f.since = f.since === y ? null : y));
    const designs = [...new Set(rels.flatMap(r => r.e.designs || []))].slice(0, 5);
    designs.forEach(d => add(nice(d), f.design === d,
      () => f.design = f.design === d ? null : d));
  };

  const draw = () => {
    const list = rels.filter(r =>
      (!f.causal || isCausal(r.e)) &&
      (!f.contested || r.e.has_contradiction) &&
      (!f.sign || r.e.consensus_sign === f.sign) &&
      (!f.since || maxYear(r.e) >= f.since) &&
      (!f.design || (r.e.designs || []).indexOf(f.design) >= 0));
    host.innerHTML = '';
    host.appendChild(el('h3', null, 'Relationships \u00b7 ' + list.length +
      (list.length !== rels.length ? ' of ' + rels.length : '')));
    if (!list.length) { host.appendChild(el('p', 'empty',
      'No relationships match these filters.')); return; }
    const t = el('table');
    t.innerHTML = '<tr><th>relationship</th><th>kind</th><th class="num">papers</th>' +
                  '<th>direction of effect</th><th>designs</th></tr>';
    list.sort((a, b) => b.e.n_papers - a.e.n_papers).forEach(r => {
      const tr = el('tr', 'clickable');
      const rel = r.out
        ? esc(n.label) + ' ' + ARROW + ' <b>' + esc(lbl(r.other)) + '</b>'
        : '<b>' + esc(lbl(r.other)) + '</b> ' + ARROW + ' ' + esc(n.label);
      const cs = r.e.consensus_sign;
      const cls = cs === 'positive' ? 'pos' : cs === 'negative' ? 'neg' : 'nul';
      tr.innerHTML = '<td>' + rel + '</td>' +
        '<td>' + (isCausal(r.e) ? 'causal' : 'associational') + '</td>' +
        '<td class="num">' + r.e.n_papers + '</td>' +
        '<td><span class="sign ' + cls + '">' + esc(cs || DASH) + '</span>' +
        (r.e.has_contradiction ? ' <span class="tag contra">contested</span>' : '') +
        (r.e.within_paper_mixed ? ' <span class="tag">mixed within paper</span>' : '') +
        (r.e.role_conflict ? ' <span class="tag role">role conflict</span>' : '') +
        '</td><td>' + esc((r.e.designs || []).slice(0, 2).map(nice).join(', ')) + '</td>';
      tr.onclick = () => go(edgeHref(r.e)); t.appendChild(tr);
    });
    host.appendChild(t);
  };
  chips(); draw();

  w.appendChild(el('h3', null, 'Neighbourhood'));
  const cyd = el('div'); cyd.id = 'cy'; cyd.className = 'full'; w.appendChild(cyd);
  drawNeighbourhood([n.id], 1, 16);
  w.appendChild(legend());
}

/* ================= edge (the payoff view) ================= */
function viewEdge(app, arg) {
  const [a, b] = String(arg).split('|');
  const e = EDGE[a + ' ' + b]; const w = wrap(app);
  if (!e) { w.appendChild(el('p', 'empty', 'Unknown relation.')); return; }
  const da = domainOf(a);
  w.appendChild(el('h2', null, esc(lbl(a)) + ' ' + ARROW + ' ' + esc(lbl(b))));
  hierarchy(w, [
    { label: 'Whole corpus', href: '#/graph', count: G.nodes.length },
    { label: G.domain_label[da] || da, href: '#/graph/' + da, count: domCount(da) },
    { label: lbl(a), href: '#/node/' + encodeURIComponent(a) },
    { label: (e.causal ? ARROW + ' ' : '\u2014 ') + lbl(b) }]);
  if (e.description) w.appendChild(el('p', null, mathy(e.description)));
  const cs = e.claims.map(id => BY_CLAIM[id]).filter(Boolean);
  const n = s => cs.filter(c => c.sign === s).length;
  w.appendChild(el('p', 'sub', e.n_papers + ' paper(s) · ' + cs.length +
    ' claim(s) · ' + n('positive') + ' positive, ' + n('negative') +
    ' negative, ' + n('null') + ' null' +
    (e.has_contradiction ? ' <span class="tag contra">contested</span>' : '') +
    (e.role_conflict ? ' <span class="tag role">role conflict</span>' : '')));
  if (e.role_conflict) w.appendChild(el('div', 'note',
    'One paper adjusts this relation away as a confounder while another claims it ' +
    'as a mediator. They disagree about the causal structure, not the estimate.'));
  if (e.has_contradiction) w.appendChild(el('div', 'note',
    'Two or more different papers report opposite signs here. That is a '  +
    'candidate for adjudication, not a verdict: check first whether their ' +
    'populations, periods and estimands are comparable — opposite signs ' +
    'for different populations are heterogeneity, not conflict.'));
  if (e.within_paper_mixed) w.appendChild(el('div', 'note',
    'A single paper reports both positive and negative estimates here, across ' +
    'subgroups or outcomes. That is heterogeneity within one study, not a ' +
    'disagreement between studies.'));

  w.appendChild(el('h3', null, 'Asserted as'));
  w.appendChild(el('p', null, e.kinds.map(k => '<span class="tag" style="border-color:' +
    ((G.kind_style[k] || {}).color || '#ccc') + ';color:' +
    ((G.kind_style[k] || {}).color || '#666') + '">' + nice(k) + '</span>').join(' ')));

  if (cs.length) {
    w.appendChild(el('h3', null, 'Evidence by paper'));
    const t = el('table');
    t.innerHTML = '<tr><th></th><th>estimate</th><th>design</th><th>population</th>' +
                  '<th>period</th><th>paper</th></tr>';
    cs.forEach(c => {
      const s = sgn(c.sign); const tr = el('tr', 'clickable');
      tr.innerHTML = '<td class="sign ' + s[1] + '">' + s[0] + '</td><td>' +
        (c.estimate != null ? esc(c.estimate) : DASH) +
        (c.se ? ' ' + esc(c.se) : '') +
        (c.units ? '<br><span class="sub">' + esc(c.units) + '</span>' : '') +
        '</td><td>' + esc(nice(c.design)) + '</td><td>' +
        esc((c.population.description || '').slice(0, 70)) + '</td><td>' +
        esc(c.population.period || '') + '</td><td>' +
        esc((c.paper.title || '').slice(0, 60)) + '</td>';
      tr.onclick = () => go('#/claim/' + c.claim_id); t.appendChild(tr);
    });
    w.appendChild(t);
  }
  w.appendChild(el('h3', null, 'Neighbourhood'));
  const cyd = el('div'); cyd.id = 'cy'; cyd.className = 'full'; w.appendChild(cyd);
  drawNeighbourhood([a, b], 1, 14);
  w.appendChild(legend());
}

/* ================= claim ================= */
function viewClaim(app, id) {
  const c = BY_CLAIM[id]; const w = wrap(app);
  if (!c) { w.appendChild(el('p', 'empty', 'Unknown claim.')); return; }
  const e = EDGE[c.treatment.node + ' ' + c.outcome.node];
  crumb(w, [['Atlas', '#/'], ['Papers', '#/papers'],
            [(c.paper.title || c.artid).slice(0, 44), '#/paper/' + c.artid],
            ['claim', null]]);
  const s = sgn(c.sign);
  w.appendChild(el('h2', null, mathy(c.treatment.label) +
    ' <span class="sign ' + s[1] + '">' + s[0] + '</span> ' + mathy(c.outcome.label)));
  w.appendChild(el('p', 'sub', esc(c.paper.title || '') + ' · ' +
    esc(c.paper.journal || '') + ' ' + (c.paper.year || '')));
  if (c.statement) w.appendChild(el('p', null, mathy(c.statement)));

  const kv = el('dl', 'kv');
  const row = (k, v) => { if (v == null || v === '') return;
    kv.appendChild(el('dt', null, esc(k))); kv.appendChild(el('dd', null, v)); };
  row('Estimate', c.estimate != null ? '<b>' + esc(c.estimate) + '</b>' +
      (c.se ? ' ' + esc(c.se) : '') + ' ' + esc(c.units || '') : null);
  row('Significant', c.significant == null ? 'not reported' : (c.significant ? 'yes' : 'no'));
  row('Design', (c.designs && c.designs.length ? c.designs : (c.design ? [c.design] : []))
    .map(d => (WIKI && (WIKI.pages || []).some(p => p.group === 'design' && p.key === d))
      ? '<a href="#/design/' + encodeURIComponent(d) + '">' + esc(nice(d)) + '</a>'
      : esc(nice(d))).join(' · ') || null);
  row('Estimand', esc(c.estimand));
  row('Variation', mathy(c.source_of_variation));
  row('Identifying variation', c.identifying_variation == null ? null :
    mathy(c.identifying_variation) + (c.identifying_variation_concept
      ? ' · <a href="#/variation/' + encodeURIComponent(c.identifying_variation_concept) +
        '"><code>' + esc(c.identifying_variation_concept) + '</code></a>' : ''));
  row('Instrument', mathy(c.instrument));
  row('Population', mathy(c.population.description));
  row('Period', esc(c.population.period));
  row('Sample N', esc(c.sample_n));
  row('Source', esc(c.source_table));
  row('Variables', '<code>' + esc(c.treatment.node || DASH) + '</code> ' + ARROW +
      ' <code>' + esc(c.outcome.node || DASH) + '</code>' +
      (e ? ' · <a href="' + edgeHref(e) + '">all evidence on this relation</a>' : ''));
  row('Verification', esc(c.verification) + (c.confidence ? ' · confidence ' + esc(c.confidence) : ''));
  row('Link status', esc(c.link_status));
  w.appendChild(el('h3', null, 'Specification')); w.appendChild(kv);

  w.appendChild(el('h3', null, 'Measured as'));
  const mt = el('table');
  mt.innerHTML = '<tr><th>role</th><th>the paper\u2019s variable</th>' +
                 '<th>construction</th><th>register</th><th>timing</th></tr>';
  [['treatment', c.treatment], ['outcome', c.outcome]].forEach(pair => {
    const role = pair[0], v = pair[1];
    const tr = el('tr');
    tr.innerHTML = '<td>' + role + '</td>' +
      '<td><b>' + mathy(v.label) + '</b>' +
      (v.node ? '<br><code>' + esc(v.node) + '</code>' : '') + '</td>' +
      '<td>' + mathy(v.definition || DASH) + '</td>' +
      '<td>' + esc(v.register || DASH) + '</td>' +
      '<td>' + esc(v.timing || DASH) + '</td>';
    mt.appendChild(tr);
  });
  w.appendChild(mt);
  if (c.units) w.appendChild(el('p', 'sub',
    'The estimate is expressed in: <b>' + esc(c.units) + '</b>.'));

  if (c.assumptions && c.assumptions.length) {
    w.appendChild(el('h3', null, 'Identifying assumptions (' + c.n_assumptions + ')'));
    const ul = el('ul'); c.assumptions.forEach(a =>
      ul.appendChild(el('li', null, mathy(a)))); w.appendChild(ul);
  }
  const rr = (c.results || []).filter(r => r.point_estimate != null || r.equation_formula);
  if (rr.length) {
    w.appendChild(el('h3', null, 'Reported estimates (' + rr.length + ')'));
    const rt = el('table');
    rt.innerHTML = '<tr><th>outcome</th><th class="num">estimate</th><th>horizon</th>' +
                   '<th>where</th><th>specification</th></tr>';
    rr.forEach(r => {
      const tr = el('tr');
      tr.innerHTML = '<td>' + mathy(r.outcome_variable || '') +
        (r.subgroup ? '<br><span class="sub">' + esc(r.subgroup) + '</span>' : '') + '</td>' +
        '<td class="num">' + (r.point_estimate != null ? '<b>' + esc(r.point_estimate) + '</b>' : DASH) +
        (r.estimate_se != null ? ' (' + esc(r.estimate_se) + ')' : '') +
        (r.theory_parameter ? '<br><span class="sub">' + esc(r.theory_parameter) + '</span>' : '') + '</td>' +
        '<td>' + esc(r.horizon || DASH) + '</td>' +
        '<td>' + esc([r.source_table, r.panel, r.column].filter(Boolean).join(' · ') || DASH) +
        (r._crosscheck ? '<br><span class="sub">cross-check: ' + esc(r._crosscheck) + '</span>' : '') + '</td>' +
        '<td>' + (r.equation_formula ? '<code>' + esc(r.equation_formula) + '</code>' : DASH) + '</td>';
      rt.appendChild(tr);
    });
    w.appendChild(rt);
    const eq = rr.find(r => r.equation_tex);
    if (eq) w.appendChild(el('p', 'sub', 'Equation as printed: ' + mathy(eq.equation_tex)));
  }
  w.appendChild(el('h3', null, 'Evidence in the paper'));
  if (!c.evidence.length) w.appendChild(el('p', 'empty', 'No quotes recorded.'));
  c.evidence.forEach(ev => {
    w.appendChild(el('blockquote', null, esc(ev.text) + '<span class="cite">p.' +
      esc(ev.page_label == null ? '?' : ev.page_label) +
      (ev.page_index ? ' · PDF page ' + ev.page_index : '') +
      (ev.located_ratio != null ? ' · located at ' +
        (ev.located_ratio * 100).toFixed(0) + '% match' : '') + '</span>'));

  });
  correctionBox(w, 'claim', c.claim_id,
    'Claim: ' + (c.treatment.label || '') + ' → ' + (c.outcome.label || '') +
    ' (' + (c.paper.title || '') + ')');
}

/* ================= paper ================= */
function viewPaper(app, artid) {
  const p = PAPERS.find(x => x.artid === artid); const w = wrap(app);
  if (!p) { w.appendChild(el('p', 'empty', 'Unknown paper.')); return; }
  crumb(w, [['Atlas', '#/'], ['Papers', '#/papers'], [(p.title || artid).slice(0, 50), null]]);
  w.appendChild(el('h2', null, esc(p.title || artid)));
  w.appendChild(el('p', 'sub', esc((p.authors || []).join(', ')) + ' · ' +
    esc(p.journal || '') + ' ' + (p.year || '') +
    (p.doi ? ' · <a href="https://doi.org/' + esc(p.doi) +
             '" target="_blank" rel="noopener">doi</a>' : '')));
  // The abstract belongs here: it is what a reader needs to orient. The
  // exogenous-variation line moved to the design section, where it is a fact
  // about identification rather than a summary of the paper.
  if (p.abstract) {
    const a = el('p', 'abstract', mathy(p.abstract));
    // say where it came from: a publisher abstract and one we recovered from
    // the text layer are not equally trustworthy
    if (p.abstract_source === 'pdf') a.appendChild(el('span', 'src',
      ' \u00b7 recovered from the PDF'));
    w.appendChild(a);
  }
  if ((p.jel || []).length) w.appendChild(el('p', 'sub',
    'JEL: ' + p.jel.map(j => '<code>' + esc(j) + '</code>').join(' ')));
  if ((p.keywords || []).length) w.appendChild(el('p', 'sub',
    'Keywords: ' + p.keywords.slice(0, 8).map(esc).join(' \u00b7 ')));

  const mine = CLAIMS.filter(c => c.artid === p.artid);
  w.appendChild(el('h3', null, 'Claims (' + mine.length + ')'));
  const t = el('table');
  t.innerHTML = '<tr><th></th><th>relation</th><th>estimate</th><th>design</th></tr>';
  mine.forEach(c => { const s = sgn(c.sign); const tr = el('tr', 'clickable');
    tr.innerHTML = '<td class="sign ' + s[1] + '">' + s[0] + '</td><td>' +
      mathy(c.treatment.label) + ' ' + ARROW + ' ' + mathy(c.outcome.label) +
      (c.headline ? ' <span class="tag">headline</span>' : '') + '</td><td>' +
      (c.estimate != null ? esc(c.estimate) : DASH) +
      (c.units ? '<br><span class="sub">' + esc(c.units) + '</span>' : '') +
      '</td><td>' + esc(nice(c.design)) + '</td>';
    tr.onclick = () => go('#/claim/' + c.claim_id); t.appendChild(tr); });
  w.appendChild(t);

  w.appendChild(el('h3', null, 'This paper’s causal graph'));
  const cyd = el('div'); cyd.id = 'cy'; w.appendChild(cyd);
  const ids = new Set();
  G.edges.filter(x => x.papers.indexOf(p.artid) >= 0)
    .forEach(x => { ids.add(x.from); ids.add(x.to); });
  drawNeighbourhood([...ids], 0, 0);
  w.appendChild(legend());

  if (p.unused_outcomes && p.unused_outcomes.length) {
    w.appendChild(el('h3', null, 'Reusable variation'));
    w.appendChild(el('p', null, 'This design identified ' +
      new Set(mine.map(c => c.outcome.node)).size +
      ' outcome(s). Outcomes studied elsewhere in the corpus that it has not been ' +
      'applied to: ' + p.unused_outcomes.slice(0, 10).map(o =>
        '<code>' + esc(o) + '</code>').join(', ') + '.'));
  }
}


/* ================= about ================= */
function viewAbout(app) {
  const w = wrap(app);
  crumb(w, [['Atlas', '#/'], ['About', null]]);
  w.appendChild(el('h2', null, 'About this atlas'));
  w.appendChild(el('p', null,
    'An enormous amount of empirical research has been conducted on Danish administrative ' +
    'register data — but it has never been aggregated in one place, because doing so by ' +
    'hand would take a prohibitive amount of manual labour.'));
  w.appendChild(el('p', null,
    'LLM-based agents, however, are now at a stage where they just might read papers ' +
    'accurately enough to make that aggregation possible. This site is an experiment in ' +
    'exactly that: every claim here was extracted from a paper\u2019s own wording by an agent, ' +
    'with verbatim quotes back to the source.'));
  w.appendChild(el('h3', null, 'Why build it?'));
  w.appendChild(el('p', null,
    'A causal graph over the register-data literature could let us identify ' +
    '<b>holes</b> where research is needed, test the <b>robustness</b> of claims across ' +
    'papers and methods, and surface <b>contradictions</b> between findings that are never ' +
    'usually read side by side.'));
  w.appendChild(el('h3', null, 'Read it with caution'));
  w.appendChild(el('p', null,
    'All data here is agent-extracted (Claude Opus) and has been verified on only a few ' +
    'examples so far. Treat every conclusion drawn from this graph with caution.'));
  w.appendChild(el('h3', null, 'Built with'));
  w.appendChild(el('p', null,
    'The dataset behind this graph was built with ' +
    '<a href="https://metalens.tech" target="_blank" rel="noopener">Metalens</a>, and ' +
    'everything is open source: ' +
    '<a href="https://github.com/johanna-einsiedler/danish-causal-atlas" target="_blank" rel="noopener">this site</a> and ' +
    '<a href="https://github.com/johanna-einsiedler/metalens" target="_blank" rel="noopener">Metalens itself</a>. ' +
    'Maintained by Claude and ' +
    '<a href="https://johannaeinsiedler.com" target="_blank" rel="noopener">Johanna Einsiedler</a>.'));
  w.appendChild(el('h3', null, 'How reliable is the extraction?'));
  w.appendChild(el('p', null,
    'Every paper was extracted three times by independent blind agent runs and the runs ' +
    'were compared claim by claim: signs agreed 44/44, coded designs 42/44, and wherever ' +
    'two runs read the same estimate they never disagreed on its value. ' +
    'The full tables are on the <a href="#/reliability">reliability page</a>.'));
  w.appendChild(el('h3', null, 'Something looks wrong?'));
  w.appendChild(el('p', null,
    'Every claim and wiki page has a “suggest a correction” link that opens a prefilled ' +
    'GitHub issue or pull request — see <a href="#/corrections">how corrections work</a>.'));
}

/* ================= corrections: issue or PR, prefilled ================= */
const REPO = 'https://github.com/johanna-einsiedler/danish-causal-atlas';
function issueURL(title, body) {
  return REPO + '/issues/new?labels=correction&title=' + encodeURIComponent(title) +
         '&body=' + encodeURIComponent(body);
}
function prURL(path, content) {
  // GitHub's new-file flow: for non-collaborators it forks the repo and turns
  // the saved file into a pull request — no backend needed on a static site.
  return REPO + '/new/main?filename=' + encodeURIComponent(path) +
         '&value=' + encodeURIComponent(content);
}
function correctionBox(w, what, ref, context) {
  const stamp = new Date().toISOString().slice(0, 10);
  const body = '**What is wrong?**\n\n(describe the error — wrong sign, wrong number, ' +
    'misread quote, wrong variable, missing claim …)\n\n**What should it say instead?**\n\n' +
    '\n\n---\nReference: `' + ref + '`\n' + (context ? context + '\n' : '') +
    'Page: ' + location.href + '\n';
  const file = 'corrections/' + stamp + '-' + ref.replace(/[^A-Za-z0-9_.-]+/g, '_') + '.md';
  const md = '---\nref: ' + ref + '\ndate: ' + stamp + '\nstatus: proposed\n---\n\n' + body;
  const d = el('div', 'correct');
  d.innerHTML = '<b>Spotted an error in this ' + esc(what) + '?</b> ' +
    'Corrections are welcome and reviewed against the paper itself: ' +
    '<a href="' + issueURL('Correction: ' + ref, body) + '" target="_blank" rel="noopener">open an issue</a> or ' +
    '<a href="' + prURL(file, md) + '" target="_blank" rel="noopener">propose it as a pull request</a> ' +
    '(GitHub forks this repository for you; the file lands under <code>corrections/</code>).';
  w.appendChild(d);
}
function viewCorrections(app) {
  const w = wrap(app);
  crumb(w, [['Atlas', '#/'], ['Corrections', null]]);
  w.appendChild(el('h2', null, 'Suggesting a correction'));
  w.appendChild(el('p', null,
    'Everything on this site was extracted from the papers by an AI agent, with verbatim ' +
    'quotes back to the source — and none of it is individually human-verified. ' +
    'If you know a paper and see a misreading, you can fix it.'));
  w.appendChild(el('p', null,
    'Every claim page and wiki page carries a <b>“suggest a correction”</b> box with two routes:'));
  const ul = el('ul');
  ul.appendChild(el('li', null, '<b>Open an issue</b> — the quickest way: a prefilled GitHub ' +
    'issue naming the claim or page, where you describe what is wrong.'));
  ul.appendChild(el('li', null, '<b>Propose a pull request</b> — GitHub forks this repository ' +
    'and your note lands as a file under <code>corrections/</code>. Merging it records the ' +
    'proposal; the data itself is then corrected upstream in the Metalens dataset (where every ' +
    'change is reviewed against the paper and logged), and the site is rebuilt from the next release.'));
  w.appendChild(ul);
  w.appendChild(el('p', 'sub',
    'Corrections never edit the generated data files directly: the dataset is the source of ' +
    'truth, and its audit trail is the point.'));
  correctionBox(w, 'site', 'general', null);
}

/* ================= wiki ================= */
const GROUP_META = {
  design:    { title: 'Designs', one: 'design', lede: 'One living page per identification ' +
               'design: what identifies the effect, how the corpus applies it, and what to watch for.' },
  variation: { title: 'Identifying variation', one: 'variation', lede: 'One page per source of ' +
               'exogenous variation the corpus leans on — the actual event or policy quirk, ' +
               'across every paper that uses it.' },
  theory:    { title: 'Theories', one: 'theory', lede: 'One page per theory model family the ' +
               'papers name, with the mechanisms they argue and the parameters they estimate.' },
};
function wikiHref(p) { return '#/' + p.group + '/' + encodeURIComponent(p.key); }

function viewWiki(app) {
  const w = wrap(app);
  crumb(w, [['Atlas', '#/'], ['Wiki', null]]);
  w.appendChild(el('h2', null, 'The methods wiki'));
  w.appendChild(el('p', 'lede',
    'Prose with an audit trail: every page below was written by one model call from the ' +
    'dataset’s own rows, every paragraph names the claims it was written from, and ' +
    'pages are versioned with each release.'));
  if (!WIKI || !WIKI.pages || !WIKI.pages.length) {
    w.appendChild(el('p', 'empty', 'No pages in this release.')); return;
  }
  ['design', 'variation', 'theory'].forEach(g => {
    const ps = WIKI.pages.filter(p => p.group === g);
    if (!ps.length) return;
    const m = GROUP_META[g];
    w.appendChild(el('h3', null, m.title + ' (' + ps.length + ')'));
    w.appendChild(el('p', 'sub', m.lede));
    const t = el('table');
    t.innerHTML = '<tr><th>' + m.one + '</th><th class="num">claims</th>' +
                  '<th class="num">papers</th><th>opening</th></tr>';
    ps.forEach(p => {
      const tr = el('tr', 'clickable');
      const first = ((p.sections[0] || {}).text || '').slice(0, 110);
      tr.innerHTML = '<td><b>' + esc(p.label) + '</b><br><code>' + esc(p.key) + '</code></td>' +
        '<td class="num">' + p.claims.length + '</td><td class="num">' + p.papers.length + '</td>' +
        '<td class="sub">' + esc(first) + '…</td>';
      tr.onclick = () => go(wikiHref(p)); t.appendChild(tr);
    });
    w.appendChild(t);
  });
}

function viewWikiPage(app, group, key) {
  const w = wrap(app);
  const p = (WIKI && WIKI.pages || []).find(x => x.group === group && x.key === key);
  const m = GROUP_META[group];
  if (!p) { crumb(w, [['Atlas', '#/'], ['Wiki', '#/wiki']]);
    w.appendChild(el('p', 'empty', 'No such page in this release.')); return; }
  crumb(w, [['Atlas', '#/'], ['Wiki', '#/wiki'], [m.title, '#/wiki'], [p.label, null]]);
  w.appendChild(el('h2', null, esc(p.title || p.label)));
  w.appendChild(el('p', 'sub', '<code>' + esc(p.key) + '</code> · ' + p.claims.length +
    ' claims in ' + p.papers.length + ' paper' + (p.papers.length === 1 ? '' : 's') +
    ' · page v' + (p.version || 1) + ', generated by ' + esc(p.model || 'a model') +
    ' from the rows below — each paragraph cites the claims it was written from.'));
  if (p.definition) w.appendChild(el('p', 'lede', esc(p.definition)));
  if (p.curated_md) w.appendChild(el('p', 'abstract', esc(p.curated_md)));

  p.sections.forEach(s => {
    const sec = el('div', 'wikisec');
    sec.appendChild(el('p', null, mathy(s.text)));
    const chips = el('div', 'chips');
    (s.sources || []).forEach(cid => {
      const c = BY_CLAIM[cid];
      const a = el('a', 'chip src', esc(c ? (c.treatment.label + ' ' + ARROW + ' ' +
        c.outcome.label).slice(0, 48) : cid));
      a.href = '#/claim/' + encodeURIComponent(cid);
      a.title = c ? (c.paper.title || '') : cid;
      chips.appendChild(a);
    });
    sec.appendChild(chips);
    w.appendChild(sec);
  });

  if (group === 'variation' && (p.phrases || []).length) {
    w.appendChild(el('h3', null, 'As the papers put it'));
    const ul = el('ul'); p.phrases.forEach(x => ul.appendChild(el('li', null, '“' + esc(x) + '”')));
    w.appendChild(ul);
  }

  const members = p.claims.map(id => BY_CLAIM[id]).filter(Boolean);
  if (members.length) {
    w.appendChild(el('h3', null, 'Claims using this ' + m.one + ' (' + members.length + ')'));
    const t = el('table');
    t.innerHTML = '<tr><th></th><th>relation</th><th>estimate</th><th>paper</th></tr>';
    members.forEach(c => { const s = sgn(c.sign); const tr = el('tr', 'clickable');
      tr.innerHTML = '<td class="sign ' + s[1] + '">' + s[0] + '</td><td>' +
        mathy(c.treatment.label) + ' ' + ARROW + ' ' + mathy(c.outcome.label) + '</td><td>' +
        (c.estimate != null ? esc(c.estimate) : DASH) + '</td><td>' +
        esc((c.paper.title || '').slice(0, 60)) + '</td>';
      tr.onclick = () => go('#/claim/' + c.claim_id); t.appendChild(tr); });
    w.appendChild(t);
  }
  correctionBox(w, m.one + ' page', group + '/' + key, 'Wiki page: ' + (p.title || p.label));
}

/* ================= taxonomy ================= */
const TAX_META = {
  cause: ['Causes', 'treatment-side variables: what the papers shift'],
  effect: ['Outcomes', 'outcome-side variables: what the papers measure'],
  identifying_variation: ['Identifying variation', 'the sources of exogenous variation'],
  theory_model: ['Theory models', 'the model families papers name'],
  theory_parameter: ['Theory parameters', 'the structural parameters estimates carry'],
};
function viewTaxonomy(app) {
  const w = wrap(app);
  crumb(w, [['Atlas', '#/'], ['Taxonomy', null]]);
  w.appendChild(el('h2', null, 'The taxonomies'));
  w.appendChild(el('p', 'lede',
    'The committed vocabularies the corpus is coded with. Every phrase a paper uses is ' +
    'assigned to a concept under review; the graph, the wiki and the tables all key on ' +
    'these concept ids.'));
  if (!TAX || !TAX.vocabularies) { w.appendChild(el('p', 'empty', 'No taxonomy shipped.')); return; }
  const t = el('table');
  t.innerHTML = '<tr><th>vocabulary</th><th class="num">concepts</th>' +
                '<th class="num">phrases</th><th>covers</th></tr>';
  TAX.vocabularies.forEach(v => {
    const m = TAX_META[v.column] || [v.column, ''];
    const tr = el('tr', 'clickable');
    tr.innerHTML = '<td><b>' + esc(m[0]) + '</b><br><code>' + esc(v.column) + '</code> v' +
      v.version + '</td><td class="num">' + v.concepts.length + '</td><td class="num">' +
      v.concepts.reduce((n, c) => n + (c.phrases || []).length, 0) + '</td><td class="sub">' +
      esc(m[1]) + '</td>';
    tr.onclick = () => go('#/taxonomy/' + v.column); t.appendChild(tr);
  });
  w.appendChild(t);
}

function viewTaxonomyCol(app, column) {
  const w = wrap(app);
  const v = (TAX && TAX.vocabularies || []).find(x => x.column === column);
  if (!v) { crumb(w, [['Atlas', '#/'], ['Taxonomy', '#/taxonomy']]);
    w.appendChild(el('p', 'empty', 'No such vocabulary.')); return; }
  const m = TAX_META[column] || [column, ''];
  crumb(w, [['Atlas', '#/'], ['Taxonomy', '#/taxonomy'], [m[0], null]]);
  w.appendChild(el('h2', null, esc(m[0])));
  w.appendChild(el('p', 'sub', '<code>' + esc(column) + '</code> · vocabulary v' + v.version +
    ' · ' + v.concepts.length + ' concepts. Click a variable concept for its graph node; ' +
    'variation and theory concepts link to their wiki page.'));
  v.concepts.slice().sort((a, b) => b.n_claims - a.n_claims).forEach(c => {
    const d = el('div', 'wikisec');
    let link = null;
    if (column === 'cause' || column === 'effect') link = NODE[c.id] ? '#/node/' + encodeURIComponent(c.id) : null;
    if (column === 'identifying_variation') link = '#/variation/' + encodeURIComponent(c.id);
    if (column === 'theory_model') link = '#/theory/' + encodeURIComponent(c.id);
    d.appendChild(el('h4', null, (link ? '<a href="' + link + '">' + esc(c.label) + '</a>'
                                       : esc(c.label)) +
      ' <code>' + esc(c.id) + '</code>' +
      (c.n_claims ? ' <span class="cnt">' + c.n_claims + ' claim' + (c.n_claims === 1 ? '' : 's') +
        ' · ' + (c.papers || []).length + ' paper' + ((c.papers || []).length === 1 ? '' : 's') +
        '</span>' : '')));
    if (c.definition) d.appendChild(el('p', 'sub', esc(c.definition)));
    if ((c.phrases || []).length) {
      const ch = el('div', 'chips');
      c.phrases.forEach(ph => ch.appendChild(el('span', 'chip', '“' + esc(ph) + '”')));
      d.appendChild(ch);
    }
    w.appendChild(d);
  });
  if ((v.left_out || []).length) {
    w.appendChild(el('h3', null, 'Left out'));
    w.appendChild(el('p', 'sub', 'Values the review left unassigned: ' +
      v.left_out.map(x => '“' + esc(typeof x === 'string' ? x : x.value || '') + '”').join(' · ')));
  }
  correctionBox(w, 'taxonomy', 'taxonomy/' + column, null);
}

/* ================= reliability ================= */
function viewReliability(app) {
  const w = wrap(app);
  crumb(w, [['Atlas', '#/'], ['Reliability', null]]);
  w.appendChild(el('h2', null, 'How stable is the extraction?'));
  if (!RELIABILITY) { w.appendChild(el('p', 'empty', 'No reliability data shipped.')); return; }
  const R = RELIABILITY;
  w.appendChild(el('p', 'lede', esc(R.note)));
  const c = R.corpus;
  w.appendChild(el('p', null, 'Of the <b>' + c.claim_keys_in_all_runs[1] + '</b> distinct claims ' +
    'any run found, <b>' + c.claim_keys_in_all_runs[0] + '</b> were found independently by all ' +
    R.runs_per_paper + ' runs. Over those shared claims:'));
  const t = el('table');
  t.innerHTML = '<tr><th>dimension</th><th class="num">agree</th><th>note</th></tr>';
  c.dimensions.forEach(d => {
    const tr = el('tr');
    tr.innerHTML = '<td>' + esc(d.name) + '</td><td class="num"><b>' + d.agree + '/' + d.of +
      '</b></td><td class="sub">' + esc(d.comment) + '</td>';
    t.appendChild(tr);
  });
  w.appendChild(t);
  w.appendChild(el('p', null, '<b>Numbers:</b> ' + esc(c.numeric_pairs.comment) +
    ' (' + c.numeric_pairs.in_all_runs + ' of ' + c.numeric_pairs.union + ' (outcome, value) pairs ' +
    'appear in all three runs).'));
  w.appendChild(el('p', null, '<b>Theory:</b> the paper’s theory role and named model were ' +
    'unanimous on ' + c.theory_unanimous_papers[0] + ' of ' + c.theory_unanimous_papers[1] + ' papers.'));
  w.appendChild(el('p', null, '<b>Quotes:</b> ' + esc(c.verbatim_snippets.comment) + '.'));
  w.appendChild(el('h3', null, 'Per paper'));
  const t2 = el('table');
  t2.innerHTML = '<tr><th>paper</th><th>claims found by all runs</th><th>notable</th></tr>';
  (R.papers || []).forEach(p => {
    const pp = PAPERS.find(x => x.artid === p.artid);
    const tr = el('tr', 'clickable');
    tr.innerHTML = '<td>' + esc(pp ? (pp.title || p.artid).slice(0, 56) : p.artid) + '</td>' +
      '<td>' + esc(p.structural) + '</td><td class="sub">' + esc(p.highlight) + '</td>';
    tr.onclick = () => go('#/paper/' + p.artid); t2.appendChild(tr);
  });
  w.appendChild(t2);
  w.appendChild(el('p', 'sub', 'Checked on ' + esc(R.date) + '. Agreement is measured over ' +
    'claims matched on (cause concept, effect concept, population, type); phrasing-only ' +
    'divergence in free-text fields is reported as disagreement, so these numbers are lower bounds.'));
}
