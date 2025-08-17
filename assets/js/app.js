// ===== Config & Helpers =====
const API = {
  list: (limit=24, offset=0) => `https://pokeapi.co/api/v2/pokemon?limit=${limit}&offset=${offset}`,
  pokemon: (idOrName) => `https://pokeapi.co/api/v2/pokemon/${idOrName}`,
  species: (idOrName) => `https://pokeapi.co/api/v2/pokemon-species/${idOrName}`,
  evolutionChain: (id) => `https://pokeapi.co/api/v2/evolution-chain/${id}`,
  types: () => `https://pokeapi.co/api/v2/type`,
  type: (name) => `https://pokeapi.co/api/v2/type/${name}`,
  generations: () => `https://pokeapi.co/api/v2/generation`,
  generation: (idOrName) => `https://pokeapi.co/api/v2/generation/${idOrName}`,
  items: (limit=24, offset=0) => `https://pokeapi.co/api/v2/item?limit=${limit}&offset=${offset}`,
  item: (idOrName) => `https://pokeapi.co/api/v2/item/${idOrName}`,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const cache = {
  pokemon: new Map(),
  set(k, v) { this.pokemon.set(k, v); try { localStorage.setItem('pkm:'+k, JSON.stringify(v)); } catch {} },
  get(k) { if (this.pokemon.has(k)) return this.pokemon.get(k); try { const s = localStorage.getItem('pkm:'+k); if (s) { const v = JSON.parse(s); this.pokemon.set(k, v); return v; } } catch {} return null; }
};

// Simple cache for items
const itemCache = {
  map: new Map(),
  set(k, v){ this.map.set(k, v); try { localStorage.setItem('itm:'+k, JSON.stringify(v)); } catch {} },
  get(k){ if (this.map.has(k)) return this.map.get(k); try { const s = localStorage.getItem('itm:'+k); if (s){ const v = JSON.parse(s); this.map.set(k, v); return v; } } catch {} return null; }
};

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

const typeColors = new Map(Object.entries({
  normal: '#a8a77a', fire: '#ee8130', water: '#6390f0', electric: '#f7d02c', grass: '#7ac74c', ice: '#96d9d6',
  fighting: '#c22e28', poison: '#a33ea1', ground: '#e2bf65', flying: '#a98ff3', psychic: '#f95587', bug: '#a6b91a',
  rock: '#b6a136', ghost: '#735797', dragon: '#6f35fc', dark: '#705746', steel: '#b7b7ce', fairy: '#d685ad'
}));

// Limit concurrency for detail fetches
async function pMap(items, mapper, concurrency = 6) {
  const ret = []; let i = 0; const exec = new Set();
  async function run() {
    const idx = i++; if (idx >= items.length) return;
    const p = Promise.resolve(mapper(items[idx], idx)).then(v => ret[idx] = v).finally(()=> exec.delete(p));
    exec.add(p);
    if (exec.size >= concurrency) await Promise.race(exec);
    return run();
  }
  await run(); await Promise.all(exec); return ret;
}

function artwork(p) {
  return p?.sprites?.other?.['official-artwork']?.front_default
      || p?.sprites?.front_default
      || 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png';
}
function artworkById(id){
  if (!id) return 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png';
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
}

function idFmt(id){ return '#'+String(id).padStart(4,'0'); }
function cap(s){ return s ? s.charAt(0).toUpperCase()+s.slice(1) : s; }
function hexAlpha(hex, a=0.15){
  if(!hex) return 'transparent';
  if(hex.length===4) hex = '#'+[hex[1],hex[1],hex[2],hex[2],hex[3],hex[3]].join('');
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
function showAlert(msg) { const el = $('#alert'); el.textContent = msg; el.hidden = !msg; }

// ===== URL Sync =====
function getParams(){ const p = new URLSearchParams(location.search); return { q: p.get('q')||'', type: p.get('type')||'', gen: p.get('gen')||'', tab: p.get('tab')||'explore' }; }
function setParams({q, type, gen, tab}={}){
  const p = new URLSearchParams(location.search);
  if (q!==undefined) (q? p.set('q', q) : p.delete('q'));
  if (type!==undefined) (type? p.set('type', type) : p.delete('type'));
  if (gen!==undefined) (gen? p.set('gen', gen) : p.delete('gen'));
  if (tab!==undefined) (tab && tab!=='explore'? p.set('tab', tab) : p.delete('tab'));
  const url = `${location.pathname}?${p.toString()}${location.hash}`.replace(/\?$/,'');
  history.replaceState(null, '', url);
}

// ===== Favorites =====
const favStore = {
  key: 'favorites',
  all(){ try { return new Set(JSON.parse(localStorage.getItem(this.key)||'[]')); } catch { return new Set(); } },
  save(set){ try { localStorage.setItem(this.key, JSON.stringify([...set])); } catch {} },
  has(id){ return this.all().has(id); },
  toggle(id){ const s = this.all(); if (s.has(id)) s.delete(id); else s.add(id); this.save(s); return s.has(id); }
};

// ===== UI: Cards & Grid =====
const grid = $('#grid');
const loadMoreBtn = $('#loadMore');
const compareBar = $('#compareBar');
const compareList = $('#compareList');
const compareClear = $('#compareClear');
function cardSkeleton() {
  const c = document.createElement('article');
  c.className = 'card';
  c.innerHTML = `<div class="thumb skeleton" style="aspect-ratio:1.2/1"></div>
    <div class="meta">
      <div class="name"><span class="skeleton" style="height:1em;width:60%"></span><span class="id skeleton" style="height:1em;width:3.5em"></span></div>
      <div class="badges"><span class="badge skeleton" style="width:3em;height:1.1em"></span></div>
    </div>`;
  return c;
}

function favButton(p){
  const b = document.createElement('button'); b.className='fav-btn'; b.title='Favorito';
  const key = String(p.id);
  const sync = ()=>{ const on = favStore.has(key); b.classList.toggle('active', on); b.textContent = on ? '★' : '☆'; };
  sync();
  b.addEventListener('click', (e)=>{ e.stopPropagation(); favStore.toggle(key); sync(); if (currentTab==='favorites') renderFavorites(); });
  return b;
}

function cardFor(p) {
  const c = document.createElement('article');
  c.className = 'card'; c.tabIndex = 0; c.setAttribute('role','button'); c.setAttribute('aria-label', `Abrir ${p.name}`);
  const types = p.types?.map(t=>t.type.name) || [];
  c.innerHTML = `
    <div class="thumb"><img loading="lazy" src="${artwork(p)}" alt="${p.name}" /></div>
    <div class="meta">
      <div class="name"><strong>${cap(p.name)}</strong><span class="id">${idFmt(p.id)}</span></div>
      <div class="badges">${types.map(t => `<span class="badge" style="border-color:${typeColors.get(t)||'var(--border)'};background: ${hexAlpha(typeColors.get(t)||'#888', 0.12)}">${t}</span>`).join('')}</div>
    </div>`;
  c.appendChild(favButton(p));
  c.addEventListener('click', (e) => {
    if (currentTab === 'compare') { addToCompare(p); e.stopPropagation(); return; }
    openModal(p);
  });
  c.addEventListener('keydown', (e)=>{
    if (e.key==='Enter' || e.key===' ') {
      e.preventDefault();
      if (currentTab === 'compare') addToCompare(p); else openModal(p);
    }
  });
  return c;
}

// ===== State & Flow =====
const state = {
  mode: 'browse', // browse | filter | search
  nextOffset: 0,
  pageSize: 24,
  currentType: '',
  currentGen: '',
  searchTerm: '',
  loading: false,
  scroll: { top: 0 },
};
const itemsState = {
  mode: 'browse', // browse | search
  nextOffset: 0,
  pageSize: 24,
  searchTerm: '',
  loading: false,
};

async function ensurePokemon(idOrNameOrUrl) {
  const key = String(idOrNameOrUrl).replace(/^https?:\/\/.+\/pokemon\//,'').replace(/\/$/,'');
  const cached = cache.get(key);
  if (cached) return cached;
  const url = String(idOrNameOrUrl).startsWith('http') ? idOrNameOrUrl : API.pokemon(key);
  const p = await fetchJSON(url);
  cache.set(String(p.id), p); cache.set(p.name, p);
  return p;
}

function cardForItem(it){
  const c = document.createElement('article');
  c.className = 'card item-card'; c.tabIndex = 0; c.setAttribute('role','button'); c.setAttribute('aria-label', `Abrir ${it.name}`);
  const img = it?.sprites?.default || it?.sprites?.default;
  c.innerHTML = `
    <div class="thumb"><img loading="lazy" src="${img}" alt="${it.name}" /></div>
    <div class="meta">
      <div class="name"><strong>${cap(it.name)}</strong><span class="id">#${String(it.id).padStart(4,'0')}</span></div>
      <div class="badges"><span class="badge">${cap(it.category?.name || 'Item')}</span></div>
    </div>`;
  const open = ()=> openItemModal(it);
  c.addEventListener('click', open);
  c.addEventListener('keydown', (e)=>{ if (e.key==='Enter' || e.key===' '){ e.preventDefault(); open(); } });
  return c;
  }

async function ensureItem(idOrNameOrUrl){
  const key = String(idOrNameOrUrl).replace(/^https?:\/\/.+\/item\//,'').replace(/\/$/,'');
  const cached = itemCache.get(key);
  if (cached) return cached;
  const url = String(idOrNameOrUrl).startsWith('http') ? idOrNameOrUrl : API.item(key);
  const it = await fetchJSON(url);
  itemCache.set(String(it.id), it); itemCache.set(it.name, it);
  return it;
}

async function loadNextPage() {
  if (state.loading || state.mode !== 'browse') return;
  state.loading = true; grid.setAttribute('aria-busy','true');
  const skeletons = Array.from({length: 8}, cardSkeleton);
  skeletons.forEach(s => grid.appendChild(s));
  try {
    const data = await fetchJSON(API.list(state.pageSize, state.nextOffset));
    state.nextOffset += state.pageSize;
    const detailed = await pMap(data.results, async r => ensurePokemon(r.url), 8);
    skeletons.forEach(el => el.remove());
    detailed.forEach(p => grid.appendChild(cardFor(p)));
  } catch (e) {
    showAlert('No pudimos cargar más Pokémon. Intenta de nuevo.');
    console.error(e);
  } finally {
    state.loading = false; grid.setAttribute('aria-busy','false');
  updateLoadMoreVisibility();
  }
}

async function loadNextItemsPage(){
  if (itemsState.loading || itemsState.mode !== 'browse') return;
  itemsState.loading = true; grid.setAttribute('aria-busy','true');
  const skeletons = Array.from({length: 8}, cardSkeleton); skeletons.forEach(s=>grid.appendChild(s));
  try {
    const data = await fetchJSON(API.items(itemsState.pageSize, itemsState.nextOffset));
    itemsState.nextOffset += itemsState.pageSize;
    const detailed = await pMap(data.results, r=>ensureItem(r.url), 8);
    skeletons.forEach(el=>el.remove());
    detailed.forEach(it=> grid.appendChild(cardForItem(it)));
  } catch(e){
    showAlert('No pudimos cargar más items.');
    console.error(e);
  } finally {
    itemsState.loading = false; grid.setAttribute('aria-busy','false');
  updateLoadMoreVisibility();
  }
}

// List caches for filters
const listCache = { type: new Map(), gen: new Map() };

async function getTypeNames(typeName){
  if (!typeName) return [];
  if (listCache.type.has(typeName)) return listCache.type.get(typeName);
  const data = await fetchJSON(API.type(typeName));
  const names = (data?.pokemon || []).map(p=>p.pokemon.name);
  listCache.type.set(typeName, names);
  return names;
}

async function getGenNames(genName){
  if (!genName) return new Set();
  if (listCache.gen.has(genName)) return listCache.gen.get(genName);
  const data = await fetchJSON(API.generation(genName));
  const set = new Set((data?.pokemon_species || []).map(s=>s.name));
  listCache.gen.set(genName, set);
  return set;
}

async function recomputeResults(){
  const { currentType, currentGen, searchTerm } = state;
  grid.innerHTML = '';
  showAlert('');
  // No filters -> browse mode with infinite scroll
  if (!currentType && !currentGen && !searchTerm) {
  state.mode = 'browse'; state.nextOffset = 0; await loadNextPage(); return;
  }
  state.mode = searchTerm ? 'search' : 'filter';
  grid.setAttribute('aria-busy','true');
  const skeletons = Array.from({length: 12}, cardSkeleton); skeletons.forEach(s=>grid.appendChild(s));
  try {
    if (searchTerm) {
      // Single item search constrained by filters if any
      const p = await ensurePokemon(searchTerm);
      if (currentType && !(p.types||[]).some(t=>t.type.name===currentType)) {
        throw new Error('no-match');
      }
      if (currentGen) {
        const genSet = await getGenNames(currentGen);
        if (!genSet.has(p.name)) throw new Error('no-match');
      }
      grid.innerHTML=''; grid.appendChild(cardFor(p));
    } else {
      let names = [];
      const capCount = (val)=> (val==='all'||!val) ? Infinity : Number(val);
      const maxCount = capCount($('#countFilter')?.value || '24');
      if (currentType && currentGen) {
        const [typeNames, genSet] = await Promise.all([getTypeNames(currentType), getGenNames(currentGen)]);
        names = typeNames.filter(n => genSet.has(n)).slice(0, maxCount);
      } else if (currentType) {
        names = (await getTypeNames(currentType)).slice(0, maxCount);
      } else if (currentGen) {
        names = Array.from(await getGenNames(currentGen)).slice(0, maxCount);
      }
      const detailed = await pMap(names, async name => ensurePokemon(name), 10);
      grid.innerHTML = '';
      detailed.sort((a,b)=>a.id-b.id).forEach(p=> grid.appendChild(cardFor(p)));
      if (names.length===0) showAlert('Sin resultados con los filtros actuales.');
    }
  } catch (e) {
    grid.innerHTML = '';
    showAlert('No hay resultados con los filtros actuales.');
    if (e?.message !== 'no-match') console.warn(e);
  } finally {
    grid.setAttribute('aria-busy','false');
  }
  setParams({ q: state.searchTerm, type: state.currentType, gen: state.currentGen, tab: currentTab });
  updateLoadMoreVisibility();
}

async function applyTypeFilter(typeName) {
  state.currentType = typeName || '';
  await recomputeResults();
}

async function applyGenerationFilter(gen) {
  state.currentGen = gen || '';
  await recomputeResults();
}

async function runSearch(q) {
  state.searchTerm = (q||'').trim().toLowerCase();
  await recomputeResults();
}

// ===== Modal =====
const overlay = $('#overlay');
const modal = $('#modal');
const modalImg = $('#modalImg');
const modalTitle = $('#modalTitle');
const modalStats = $('#modalStats');
const modalMeta = $('#modalMeta');
const modalGames = $('#modalGames');
function openModal(p) {
  modalTitle.textContent = `${cap(p.name)} ${idFmt(p.id)}`;
  modalImg.src = artwork(p);
  modalMeta.innerHTML = '';
  const t = (p.types||[]).map(t=>t.type.name);
  const abilities = (p.abilities||[]).map(a=>a.ability.name);
  const metaList = [
    ['Tipos', t],
    ['Altura', (p.height/10)+' m'],
    ['Peso', (p.weight/10)+' kg'],
    ['Habilidades', abilities],
  ];
  for (const [label, val] of metaList) {
    const span = document.createElement('span'); span.className='badge'; span.textContent = Array.isArray(val) ? `${label}: ${val.join(', ')}` : `${label}: ${val}`;
    if (label==='Tipos' && t.length) span.style.borderColor = typeColors.get(t[0])||'var(--border)';
    modalMeta.appendChild(span);
  }
  modalStats.innerHTML = '';
  for (const s of (p.stats||[])) {
    const row = document.createElement('div'); row.className='stat';
    const name = s.stat?.name || '';
    row.innerHTML = `<span class="muted">${name}</span><div class="bar"><i style="width:${Math.min(100, (s.base_stat/160)*100)}%"></i></div><span>${s.base_stat}</span>`;
    modalStats.appendChild(row);
  }
  // Games (versions)
  if (modalGames) {
    const gamesSection = modalGames.parentElement;
    const versions = (p.game_indices||[]).map(g=>g.version?.name).filter(Boolean);
    modalGames.innerHTML = (versions.length ? versions.sort().map(v=>`<span class="badge">${cap(v)}</span>`).join('') : '');
    gamesSection.style.display = versions.length ? '' : 'none';
  }
  overlay.classList.add('show');
  modal.classList.add('show');
  modal.showModal?.();
  // update hash
  const hashStr = `#/pokemon/${p.id}`;
  if (location.hash !== hashStr) history.replaceState(null, '', location.pathname + location.search + hashStr);
  // load evolutions
  loadEvolutions(p).catch(console.warn);
}
function closeModal(){ overlay.classList.remove('show'); modal.classList.remove('show'); try { modal.close?.(); } catch {} }
$('#modalClose').addEventListener('click', closeModal);
overlay.addEventListener('click', closeModal);
window.addEventListener('keydown', (e)=>{ if (e.key==='Escape') closeModal(); });

async function loadEvolutions(p){
  const box = $('#modalEvos'); if (!box) return; box.innerHTML = '';
  try {
    const species = await fetchJSON(API.species(p.id));
    const chainUrl = species?.evolution_chain?.url; if (!chainUrl) return;
    const chainId = chainUrl.match(/evolution-chain\/(\d+)/)?.[1];
    const chain = await fetchJSON(API.evolutionChain(chainId));
    // Build paths from base to leaves. Attach condition on the edge (from previous to current).
    const rawPaths = [];
    function dfs(node, current, condFromPrev){
      if (!node) return;
      const sid = Number(node.species?.url?.match(/pokemon-species\/(\d+)\//)?.[1]||'');
      const step = { name: node.species?.name, id: sid, cond: (Array.isArray(condFromPrev) ? condFromPrev[0] : condFromPrev) || null };
      const next = [...current, step];
      if (!node.evolves_to || node.evolves_to.length === 0) rawPaths.push(next);
      else node.evolves_to.forEach(n => dfs(n, next, n.evolution_details||null));
    }
    dfs(chain?.chain, [], null);
    // Dedupe identical sequences of species (ignore condition differences)
    const seenSeq = new Set();
    const paths = [];
    for (let path of rawPaths){
      // collapse repeated species within the same path
      path = path.filter((s, i, arr)=> i===0 || s.name !== arr[i-1].name);
      const sig = path.map(s=>s.name).join('>');
      if (seenSeq.has(sig)) continue;
      seenSeq.add(sig); paths.push(path);
    }

    // Gather all unique names to prefetch
  const names = Array.from(new Set(paths.flat().map(s=>s.name)));
  const fetched = await pMap(names, async n=>{ try { return await ensurePokemon(n); } catch { return null; } }, 8);
  const map = new Map(fetched.filter(Boolean).map(p=>[p.name, p]));

    // Render each path in a row with conditions between
    const list = document.createElement('div'); list.className = 'evo-list';
    paths.forEach(path => {
      const row = document.createElement('div'); row.className = 'evo-path';
      path.forEach((step, idx) => {
        const pkm = map.get(step.name);
        const item = document.createElement('div'); item.className='evo-item';
        const imgSrc = pkm ? artwork(pkm) : artworkById(step.id || 0);
        item.innerHTML = `<img src="${imgSrc}" alt="${pkm?.name||step.name}"><div>${cap(pkm?.name||step.name)}</div>`;
        item.addEventListener('click', ()=> pkm && openModal(pkm));
        row.appendChild(item);
        if (idx < path.length-1) {
          const condText = formatEvoCondition(path[idx+1]?.cond || {});
          const arrow = document.createElement('span'); arrow.className='evo-cond'; arrow.textContent = condText || '→'; row.appendChild(arrow);
        }
      });
      list.appendChild(row);
    });
    box.appendChild(list);
  } catch(e) { console.warn('Evolutions error', e); }
}

function formatEvoCondition(c){
  const parts = [];
  if (c.min_level) parts.push(`Lv ${c.min_level}`);
  if (c.item?.name) parts.push(cap(c.item.name));
  if (c.held_item?.name) parts.push(`Held ${cap(c.held_item.name)}`);
  if (c.trigger?.name) {
    const t = c.trigger.name;
    if (t === 'trade') parts.push('Intercambio');
    else if (t === 'level-up') { /* already covered by min_level, keep minimal */ }
    else parts.push(cap(t));
  }
  if (c.min_happiness) parts.push(`Amistad ${c.min_happiness}+`);
  if (c.min_beauty) parts.push(`Belleza ${c.min_beauty}+`);
  if (c.min_affection) parts.push(`Afecto ${c.min_affection}+`);
  if (c.time_of_day) parts.push(c.time_of_day === 'day' ? 'Día' : c.time_of_day === 'night' ? 'Noche' : cap(c.time_of_day));
  if (c.location?.name) parts.push(cap(c.location.name));
  if (c.known_move?.name) parts.push(`Move ${cap(c.known_move.name)}`);
  if (c.known_move_type?.name) parts.push(`Tipo ${cap(c.known_move_type.name)}`);
  if (c.gender === 1) parts.push('Hembra'); else if (c.gender === 2) parts.push('Macho');
  if (c.needs_overworld_rain) parts.push('Lluvia');
  if (c.relative_physical_stats === 1) parts.push('Atk>Def');
  if (c.relative_physical_stats === -1) parts.push('Def>Atk');
  if (c.turn_upside_down) parts.push('3DS invertida');
  return parts.join(' • ') || '→';
}

// ===== Controls & Tabs =====
const themeToggle = $('#themeToggle');
function applyTheme(v){ document.documentElement.setAttribute('data-theme', v); themeToggle.setAttribute('aria-pressed', (v==='dark')); themeToggle.textContent = (v==='dark' ? '🌙' : v==='light' ? '☀️' : '🌓'); }
const savedTheme = localStorage.getItem('theme') || 'auto'; applyTheme(savedTheme);
themeToggle.addEventListener('click', ()=>{ const cur = document.documentElement.getAttribute('data-theme'); const next = cur==='dark' ? 'light' : cur==='light' ? 'auto' : 'dark'; localStorage.setItem('theme', next); applyTheme(next); });

$('#resetBtn').addEventListener('click', async ()=>{ $('#searchInput').value=''; $('#typeFilter').value=''; $('#genFilter').value=''; state.currentType=''; state.currentGen=''; state.searchTerm=''; currentTab='explore'; tabs.forEach(x=>{ x.classList.toggle('active', x.dataset.tab==='explore'); x.setAttribute('aria-selected', x.dataset.tab==='explore'); }); await recomputeResults(); });
$('#searchForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const q = $('#searchInput').value;
  if (currentTab === 'items') runItemSearch(q);
  else runSearch(q);
});

// Type & Generation selectors
(async function loadFilters(){
  try {
    const [typesData, gensData] = await Promise.all([fetchJSON(API.types()), fetchJSON(API.generations())]);
    const typeSel = $('#typeFilter'); (typesData?.results||[]).forEach(t => { const opt = document.createElement('option'); opt.value = t.name; opt.textContent = cap(t.name); typeSel.appendChild(opt); });
    typeSel.addEventListener('change', (e)=> applyTypeFilter(e.target.value));

    const genSel = $('#genFilter'); (gensData?.results||[]).forEach((g, idx) => { const opt = document.createElement('option'); opt.value = g.name; opt.textContent = `Gen ${idx+1} – ${cap(g.name)}`; genSel.appendChild(opt); });
    genSel.addEventListener('change', (e)=> applyGenerationFilter(e.target.value));

    // Count selector
    const countSel = $('#countFilter');
    if (countSel) {
      const saved = localStorage.getItem('count') || '24';
      countSel.value = saved;
      const applyCount = (val)=>{
        localStorage.setItem('count', val);
        const n = (val==='all') ? 9999 : Number(val)||24;
        state.pageSize = n; itemsState.pageSize = n;
        if (currentTab==='explore') { state.nextOffset = 0; grid.innerHTML=''; state.mode='browse'; loadNextPage(); }
        else if (currentTab==='items') { itemsState.nextOffset=0; grid.innerHTML=''; itemsState.mode='browse'; loadNextItemsPage(); }
        else if (currentTab==='evolutions') { renderEvolutionCatalog(); }
        else if (currentTab==='favorites') { renderFavorites(); }
      };
      applyCount(saved);
      countSel.addEventListener('change', (e)=> applyCount(e.target.value));
    }
  } catch(e) { console.warn('No se pudieron cargar filtros.', e); }
})();

// Tabs behavior
let currentTab = 'explore';
const tabs = $$('.tab');
tabs.forEach(t => t.addEventListener('click', ()=>{
  tabs.forEach(x=>{ x.classList.toggle('active', x===t); x.setAttribute('aria-selected', x===t); });
  currentTab = t.dataset.tab;
  if (currentTab === 'explore') {
    // restaurar vista de exploración (no favoritos)
    grid.innerHTML = '';
    if (!state.currentType && !state.currentGen && !state.searchTerm) {
      state.mode='browse'; state.nextOffset=0; loadNextPage().then(()=>{ window.scrollTo({top: state.scroll.top, behavior: 'auto'}); });
    } else { recomputeResults(); }
  } else if (currentTab === 'favorites') {
    // guarda posición de scroll antes de cambiar
    state.scroll.top = window.scrollY || 0;
    renderFavorites();
  } else if (currentTab === 'evolutions') {
    renderEvolutionCatalog();
  } else if (currentTab === 'items') {
    grid.innerHTML = '';
    itemsState.mode='browse'; itemsState.nextOffset=0; loadNextItemsPage();
  } else if (currentTab === 'compare') {
    if (compareSet.size > 0) renderCompareView(); else renderCompareIntro();
  }
  setParams({ q: state.searchTerm, type: state.currentType, gen: state.currentGen, tab: currentTab });
  updateLoadMoreVisibility();
  renderCompareBar();
}));

function renderFavorites(){
  const ids = [...favStore.all()].map(Number).sort((a,b)=>a-b);
  grid.innerHTML = '';
  if (ids.length===0) { showAlert('Aún no tienes favoritos.'); return; } else { showAlert(''); }
  grid.setAttribute('aria-busy','true');
  const skeletons = Array.from({length: Math.min(8, ids.length)}, cardSkeleton); skeletons.forEach(s=>grid.appendChild(s));
  (async ()=>{
    try {
      const detailed = await pMap(ids, async id=>ensurePokemon(id), 10);
      grid.innerHTML = '';
      detailed.forEach(p=> grid.appendChild(cardFor(p)));
    } catch(e){ console.error(e); showAlert('No pudimos cargar tus favoritos.'); }
    finally { grid.setAttribute('aria-busy','false'); }
  })();
}

// Infinite scroll (only for browse)
const sentinel = $('#sentinel');
const io = new IntersectionObserver((entries)=>{
  for (const entry of entries) {
  if (!entry.isIntersecting) continue;
  if (currentTab==='explore' && state.mode==='browse' && !state.currentType && !state.currentGen && !state.searchTerm) { loadNextPage(); }
  else if (currentTab==='items' && itemsState.mode==='browse') { loadNextItemsPage(); }
  }
}, { rootMargin: '800px 0px' });
io.observe(sentinel);

function isBrowseExplore(){
  return currentTab==='explore' && state.mode==='browse' && !state.currentType && !state.currentGen && !state.searchTerm;
}
function isBrowseItems(){
  return currentTab==='items' && itemsState.mode==='browse';
}
function updateLoadMoreVisibility(){
  if (!loadMoreBtn) return;
  const visible = isBrowseExplore() || isBrowseItems();
  loadMoreBtn.parentElement.style.display = visible ? 'flex' : 'none';
}
if (loadMoreBtn){
  loadMoreBtn.addEventListener('click', ()=>{
    if (isBrowseExplore()) loadNextPage();
    else if (isBrowseItems()) loadNextItemsPage();
  });
}

// ===== Compare =====
const compareSet = new Set();
const MAX_COMPARE = 6;
function addToCompare(p){
  if (!compareSet.has(p.id) && compareSet.size >= MAX_COMPARE) { showAlert(`Máximo ${MAX_COMPARE} para comparar.`); return; }
  compareSet.add(p.id);
  renderCompareBar();
  if (currentTab === 'compare') renderCompareView();
}
function removeFromCompare(id){
  compareSet.delete(id);
  renderCompareBar();
  if (currentTab === 'compare') {
    if (compareSet.size > 0) renderCompareView(); else renderCompareIntro();
  }
}
function renderCompareBar(){
  if (!compareBar) return;
  const shouldShow = (compareSet.size > 0) && (currentTab === 'compare');
  compareBar.classList.toggle('show', shouldShow);
  compareBar.hidden = !shouldShow;
  compareList.innerHTML = '';
  const ids = [...compareSet].slice(0, 6);
  (async()=>{
    const ps = await pMap(ids, id=>ensurePokemon(id), 6);
    ps.forEach(p=>{
      const pill = document.createElement('span'); pill.className='compare-pill';
      pill.innerHTML = `<img src="${artwork(p)}" alt="${p.name}"><span>${cap(p.name)}</span><button title="Quitar">✕</button>`;
      pill.querySelector('button').addEventListener('click', ()=> removeFromCompare(p.id));
      compareList.appendChild(pill);
    });
  })();
}
compareClear?.addEventListener('click', ()=>{ compareSet.clear(); renderCompareBar(); if (currentTab==='compare') renderCompareIntro(); });

function renderCompareIntro(){
  showAlert('Haz clic en tarjetas para añadirlas a la comparación.');
  grid.innerHTML = '';
  // Muestra una selección inicial rápida
  (async()=>{
    try {
      const data = await fetchJSON(API.list(12,0));
      const detailed = await pMap(data.results, r=>ensurePokemon(r.url), 8);
      detailed.forEach(p=> grid.appendChild(cardFor(p)));
    } catch {}
  })();
}

function renderCompareView(){
  showAlert('');
  grid.innerHTML = '';
  const ids = [...compareSet].slice(0, MAX_COMPARE);
  (async()=>{
    try {
      const ps = await pMap(ids, id=>ensurePokemon(id), 6);
      ps.forEach(p=>{
        const col = document.createElement('article'); col.className = 'card';
        const types = (p.types||[]).map(t=>t.type.name);
        const statsHtml = (p.stats||[]).map(s=>{
          const name = s.stat?.name || '';
          const val = s.base_stat || 0;
          const pct = Math.min(100, (val/160)*100);
          return `<div class="stat"><span class="muted">${name}</span><div class="bar"><i style="width:${pct}%"></i></div><span>${val}</span></div>`;
        }).join('');
        col.innerHTML = `
          <div class="thumb"><img src="${artwork(p)}" alt="${p.name}"></div>
          <div class="meta">
            <div class="name"><strong>${cap(p.name)}</strong><span class="id">${idFmt(p.id)}</span></div>
            <div class="badges">${types.map(t => `<span class="badge" style="border-color:${typeColors.get(t)||'var(--border)'};background:${hexAlpha(typeColors.get(t)||'#888', 0.12)}">${t}</span>`).join('')}</div>
            <div class="stats">${statsHtml}</div>
            <div class="muted">Altura: ${(p.height/10).toFixed(1)} m • Peso: ${(p.weight/10).toFixed(1)} kg</div>
          </div>
        `;
        grid.appendChild(col);
      });
    } catch(e){ console.warn('Compare view error', e); showAlert('No pudimos mostrar la comparación.'); }
  })();
}

// Routing: open modal by hash and sync initial filters from URL
function applyInitialState(){
  const { q, type, gen, tab } = getParams();
  if (q) { $('#searchInput').value = q; state.searchTerm = q; }
  if (type) { $('#typeFilter').value = type; state.currentType = type; }
  if (gen) { $('#genFilter').value = gen; state.currentGen = gen; }
  // Set tab
  if (tab && tab !== 'explore') { const t = tabs.find(x=>x.dataset.tab===tab); t?.click(); }
}

window.addEventListener('hashchange', async ()=>{
  const m = location.hash.match(/^#\/pokemon\/(\w+)/);
  if (m) {
    try { const p = await ensurePokemon(m[1]); openModal(p); } catch {}
  } else {
    const mi = location.hash.match(/^#\/item\/(\w+)/);
    if (mi) {
      try { const it = await ensureItem(mi[1]); openItemModal(it); } catch {}
    } else {
      // closed
      closeModal();
    }
  }
});

(async function bootstrap(){
  applyInitialState();
  await recomputeResults(); // this covers both browse and filtered/search states
  // if hash has pokemon, open it
  const m = location.hash.match(/^#\/pokemon\/(\w+)/);
  if (m) { try { openModal(await ensurePokemon(m[1])); } catch {} }
  else {
    const mi = location.hash.match(/^#\/item\/(\w+)/);
    if (mi) { try { openItemModal(await ensureItem(mi[1])); } catch {} }
  }
  // Ensure compare bar visibility is correct on startup
  renderCompareBar();
})();

// Evolutions Tab (catalog)
async function renderEvolutionCatalog(){
  grid.innerHTML = '';
  grid.setAttribute('aria-busy','true');
  try {
    // Build a small catalog based on current filters if any; otherwise, base starters of each gen
    let names = [];
    if (state.currentType || state.currentGen) {
      // reuse recompute logic: get intersection of names without rendering
      if (state.currentType && state.currentGen){
        const [typeNames, genSet] = await Promise.all([getTypeNames(state.currentType), getGenNames(state.currentGen)]);
        names = typeNames.filter(n=>genSet.has(n));
      } else if (state.currentType) names = (await getTypeNames(state.currentType));
      else if (state.currentGen) names = Array.from(await getGenNames(state.currentGen));
    } else {
      // default sample: first 24 Pokémon
      const limit = ($('#countFilter')?.value==='all') ? 24 : Number($('#countFilter')?.value||24);
      const data = await fetchJSON(API.list(limit,0));
      names = data.results.map(r=>r.name);
    }
    const maxCount = ($('#countFilter')?.value==='all') ? Infinity : Number($('#countFilter')?.value||24);
    names = names.slice(0, maxCount);
    const detailed = await pMap(names, n=>ensurePokemon(n), 8);
    // Track chains we've already rendered to avoid duplicates across listed Pokémon
    const renderedChains = new Set();
    // render each with its evo chain compact
    for (const pkm of detailed) {
      const species = await fetchJSON(API.species(pkm.id));
      const chainUrl = species?.evolution_chain?.url; if (!chainUrl) continue;
      const chainId = chainUrl.match(/evolution-chain\/(\d+)/)?.[1];
      const chain = await fetchJSON(API.evolutionChain(chainId));
      // Build raw paths with edge conditions
      const rawPaths = [];
      function dfs(node, current, condFromPrev){
        if (!node) return;
        const sid = Number(node.species?.url?.match(/pokemon-species\/(\d+)\//)?.[1]||'');
        const step = { name: node.species?.name, id: sid, cond: (Array.isArray(condFromPrev) ? condFromPrev[0] : condFromPrev) || null };
        const next = [...current, step];
        if (!node.evolves_to || node.evolves_to.length===0) rawPaths.push(next); else node.evolves_to.forEach(n=>dfs(n, next, n.evolution_details||null));
      }
      dfs(chain?.chain, [], null);
  // Collapse repeated species within a path, then dedupe sequences (ignore condition differences)
      const seenSeq = new Set();
      const paths = [];
  for (let path of rawPaths){ path = path.filter((s,i,arr)=> i===0 || s.name!==arr[i-1].name); const sig = path.map(s=>s.name).join('>'); if (seenSeq.has(sig)) continue; seenSeq.add(sig); paths.push(path); }
      const chainSig = paths.map(p=>p.map(s=>s.name).join('>')).sort().join('|');
      if (renderedChains.has(chainSig)) continue; // already rendered this chain for a previous Pokémon
      renderedChains.add(chainSig);
  const uniqueNames = Array.from(new Set(paths.flat().map(s=>s.name)));
  const fetched = await pMap(uniqueNames, async n=>{ try { return await ensurePokemon(n); } catch { return null; }}, 6);
  const map = new Map(fetched.filter(Boolean).map(p=>[p.name,p]));
      const wrap = document.createElement('div'); wrap.className='evo-card';
      wrap.innerHTML = `<div class="head"><strong>${cap(pkm.name)}</strong><span class="muted">${idFmt(pkm.id)}</span></div><div class="paths"></div>`;
      const pathsEl = wrap.querySelector('.paths');
      paths.forEach(path=>{
        const row = document.createElement('div'); row.className='evo-path';
        path.forEach((step, idx)=>{
          const ep = map.get(step.name);
          const imgSrc = ep ? artwork(ep) : artworkById(step.id || 0);
          const item = document.createElement('div'); item.className='evo-item'; item.innerHTML = `<img src="${imgSrc}" alt="${ep?.name||step.name}"><div>${cap(ep?.name||step.name)}</div>`; item.addEventListener('click', ()=> ep && openModal(ep)); row.appendChild(item);
          if (idx<path.length-1){ const condText = formatEvoCondition(path[idx+1]?.cond || {}); const chip = document.createElement('span'); chip.className='evo-cond'; chip.textContent = condText || '→'; row.appendChild(chip); }
        });
        pathsEl.appendChild(row);
      });
      grid.appendChild(wrap);
    }
  } catch(e){ console.warn('Evolution catalog error', e); showAlert('No pudimos cargar la pestaña de evoluciones.'); }
  finally { grid.setAttribute('aria-busy','false'); }
}

// Items search and modal
async function runItemSearch(q){
  itemsState.searchTerm = (q||'').trim().toLowerCase();
  grid.innerHTML = ''; showAlert('');
  if (!itemsState.searchTerm){
    itemsState.mode='browse'; itemsState.nextOffset=0; await loadNextItemsPage(); return;
  }
  itemsState.mode='search'; grid.setAttribute('aria-busy','true');
  const skeletons = Array.from({length: 6}, cardSkeleton); skeletons.forEach(s=>grid.appendChild(s));
  try { const it = await ensureItem(itemsState.searchTerm); grid.innerHTML=''; grid.appendChild(cardForItem(it)); }
  catch(e){ grid.innerHTML=''; showAlert('No hay items con ese término.'); }
  finally { grid.setAttribute('aria-busy','false'); }
}

function openItemModal(it){
  modalTitle.textContent = `${cap(it.name)} #${String(it.id).padStart(4,'0')}`;
  modalImg.src = it?.sprites?.default || '';
  modalMeta.innerHTML = '';
  const meta = [
    ['Categoría', cap(it.category?.name||'')],
    ['Coste', (it.cost!=null? it.cost+' ₽':'Desconocido')],
  ];
  if (Array.isArray(it.attributes) && it.attributes.length){ meta.push(['Atributos', it.attributes.map(a=>cap(a.name)).join(', ')]); }
  for (const [label, val] of meta){ const span = document.createElement('span'); span.className='badge'; span.textContent = `${label}: ${val}`; modalMeta.appendChild(span); }
  const eff = (it.effect_entries||[]).find(e=>e.language?.name==='es') || (it.effect_entries||[]).find(e=>e.language?.name==='en');
  const text = eff?.short_effect || eff?.effect || 'Sin descripción.';
  modalStats.innerHTML = `<div style="color:var(--text)">${text}</div>`;
  if (modalGames) modalGames.parentElement.style.display = 'none';
  const evoSection = document.getElementById('modalEvos')?.parentElement; if (evoSection) { evoSection.style.display='none'; document.getElementById('modalEvos').innerHTML=''; }
  overlay.classList.add('show'); modal.classList.add('show'); modal.showModal?.();
  const hashStr = `#/item/${it.id}`; if (location.hash !== hashStr) history.replaceState(null, '', location.pathname + location.search + hashStr);
}
