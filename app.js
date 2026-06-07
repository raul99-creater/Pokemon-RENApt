(() => {
  const DATA = window.RP_DATA || { pokemons: [], locations: [], encounters: [], items: [], changes: [], meta: {}, storyOrder: [] };
  const TYPES = ['전체','노말','불꽃','물','풀','전기','얼음','격투','독','땅','비행','에스퍼','벌레','바위','고스트','드래곤','악','강철','페어리'];
  const GENERATIONS = [
    { value: '전체', label: '전체 세대', min: 1, max: 493 },
    { value: '1', label: '1세대 · 관동', min: 1, max: 151 },
    { value: '2', label: '2세대 · 성도', min: 152, max: 251 },
    { value: '3', label: '3세대 · 호연', min: 252, max: 386 },
    { value: '4', label: '4세대 · 신오', min: 387, max: 493 }
  ];
  const LEGENDARY_IDS = new Set([144,145,146,150,151,243,244,245,249,250,251,377,378,379,380,381,382,383,384,385,386,480,481,482,483,484,485,486,487,488,489,490,491,492,493]);
  const STORAGE_KEYS = { favorites: 'rpFavorites', drawn: 'rpDrawnIds' };
  const STORY_ORDER = DATA.storyOrder || [];
  const ITEM_CATEGORIES = ['전체','일반 도구','기술머신/비전머신','중요한 물건'];

  const POKEMONS = dedupeById(DATA.pokemons || []).sort((a, b) => a.id - b.id);
  const POKEMON_BY_ID = new Map(POKEMONS.map(p => [p.id, p]));
  const LOCATIONS = (DATA.locations || []).slice().sort((a, b) => storyRank(a.name) - storyRank(b.name) || a.name.localeCompare(b.name, 'ko'));
  const LOCATION_BY_NAME = new Map(LOCATIONS.map(l => [l.name, l]));
  const ITEMS = normalizeItems(DATA.items || []).sort((a, b) => itemStoryRank(a) - itemStoryRank(b) || a.name.localeCompare(b.name, 'ko'));
  const CHANGES = normalizeChanges(DATA.changes || []);
  const CHANGE_CATEGORIES = ['전체', ...unique(CHANGES.map(c => c.category))];

  const state = {
    view: 'dex', search: '', dexMode: 'type', selectedType: '전체', selectedDexLocation: '전체',
    favorites: new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.favorites) || '[]').map(Number)),
    party: Array(6).fill(null), partyType: '전체', partyGeneration: '전체', selectedPartySlot: null,
    drawnIds: new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.drawn) || '[]').map(Number)),
    modalPokemonId: null, modalLocation: '', modalTab: 'basic',
    itemCategory: '전체', changeCategory: '전체'
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s='') => String(s).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const randomItem = arr => arr[Math.floor(Math.random() * arr.length)];
  function unique(arr){ return [...new Set((arr || []).filter(Boolean))]; }
  function getPokemonGeneration(id){
    const dexNo = Number(id);
    const found = GENERATIONS.find(g => g.value !== '전체' && dexNo >= g.min && dexNo <= g.max);
    return found ? found.value : '전체';
  }
  function generationLabel(value){
    return (GENERATIONS.find(g => g.value === value) || GENERATIONS[0]).label;
  }

  window.RP_swapImage = function(img) {
    const sources = String(img.dataset.sources || '').split('|').filter(Boolean);
    const next = Number(img.dataset.sourceIndex || 0) + 1;
    if (next < sources.length) { img.dataset.sourceIndex = String(next); img.src = sources[next]; return; }
    const fallback = document.createElement('span');
    fallback.className = img.dataset.fallbackClass || 'fallback-img';
    fallback.textContent = img.dataset.fallback || '?';
    img.replaceWith(fallback);
  };

  function init() {
    renderTypeFilters(); renderDexLocationButtons(); renderPartyControls(); renderItemTabs(); renderChangeTabs(); bindEvents(); renderAll();
  }

  function bindEvents() {
    $$('.nav-item').forEach(btn => btn.addEventListener('click', () => { state.view = btn.dataset.view; renderView(); }));
    $('#globalSearch').addEventListener('input', e => { state.search = e.target.value.trim(); renderActiveContent(); });
    $('#clearSearch').addEventListener('click', () => { state.search = ''; $('#globalSearch').value = ''; renderActiveContent(); });
    $('#randomDexPick').addEventListener('click', () => { const pool = filteredPokemon(); if (pool.length) openPokemonModal(randomItem(pool).id); });
    $$('#dexBrowseTabs .browse-tab').forEach(btn => btn.addEventListener('click', () => { state.dexMode = btn.dataset.mode; renderDexFilters(); renderDex(); }));
    $('#generateParty').addEventListener('click', drawAllSlots);
    $('#resetDrawHistory').addEventListener('click', () => {
      state.drawnIds.clear();
      localStorage.removeItem(STORAGE_KEYS.drawn);
      state.party = Array(6).fill(null);
      state.selectedPartySlot = null;
      saveDrawnIds();
      renderParty();
    });
    $('#saveParty').addEventListener('click', () => { const names = state.party.filter(Boolean).map(p => p.name).join(', '); alert(names ? `현재 파티: ${names}` : '저장할 파티가 없습니다.'); });
    $('#clearFavorites').addEventListener('click', () => { state.favorites.clear(); saveFavorites(); renderFavorites(); renderDex(); });
    $$('[data-close-modal]').forEach(el => el.addEventListener('click', closePokemonModal));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closePokemonModal(); });
  }

  function renderAll(){ renderView(); renderDex(); renderParty(); renderItems(); renderChanges(); renderFavorites(); }
  function renderView(){
    $$('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === state.view));
    $$('.view').forEach(view => view.classList.toggle('active', view.id === `${state.view}View`));
    renderActiveContent();
  }
  function renderActiveContent(){
    if (state.view === 'dex') { renderDexLocationButtons(); renderDex(); }
    if (state.view === 'party') renderParty();
    if (state.view === 'items') renderItems();
    if (state.view === 'changes') renderChanges();
    if (state.view === 'favorites') renderFavorites();
  }

  function renderTypeFilters(){
    $('#typeFilters').innerHTML = TYPES.map(t => `<button class="chip ${t===state.selectedType?'active':''}" data-type="${esc(t)}">${typeIcon(t)}<span>${esc(t)}</span></button>`).join('');
    $$('#typeFilters .chip').forEach(btn => btn.addEventListener('click', () => { state.selectedType = btn.dataset.type; renderTypeFilters(); renderDex(); }));
  }
  function renderDexLocationButtons(){
    const wrap = $('#dexLocationButtons'); if (!wrap) return;
    const q = state.search.toLowerCase();
    const options = [{ name:'전체', count: POKEMONS.length, total: 0 }, ...LOCATIONS.map(l => ({ name:l.name, count:unique(l.encounters.map(e=>e.pokemonId)).length, total:l.encounters.length }))];
    const filtered = options.filter((v, idx) => idx === 0 || !q || v.name.toLowerCase().includes(q) || (LOCATION_BY_NAME.get(v.name)?.encounters || []).some(e => String(e.pokemonName || '').toLowerCase().includes(q)));
    wrap.innerHTML = filtered.map(v => `<button class="location-filter-btn ${v.name===state.selectedDexLocation?'active':''}" data-location="${esc(v.name)}"><b>${esc(v.name)}</b><small>${v.name==='전체'?'전체 보기':`${v.count}마리 · ${v.total}건`}</small></button>`).join('');
    $$('.location-filter-btn', wrap).forEach(btn => btn.addEventListener('click', () => { state.selectedDexLocation = btn.dataset.location; renderDexLocationButtons(); renderDex(); }));
  }
  function renderDexFilters(){
    $$('#dexBrowseTabs .browse-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === state.dexMode));
    $('#typeFilters').style.display = state.dexMode === 'type' ? 'flex' : 'none';
    $('#dexLocationFilterRow').style.display = state.dexMode === 'location' ? 'block' : 'none';
    if (state.dexMode === 'location') renderDexLocationButtons();
  }
  function filteredPokemon(){
    const q = state.search.toLowerCase();
    return POKEMONS.filter(p => {
      const locText = (p.locations || []).map(l => `${l.location} ${l.method} ${(l.notes || []).join(' ')}`).join(' ');
      const moveText = movesSearchText(p);
      const hay = `${p.id} ${p.num} ${p.name} ${cleanTypes(p.types).join(' ')} ${locText} ${moveText}`.toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (state.dexMode === 'type' && state.selectedType !== '전체' && !cleanTypes(p.types).includes(state.selectedType)) return false;
      if (state.dexMode === 'location' && state.selectedDexLocation !== '전체' && !(p.locations || []).some(l => cleanEventLocation(l.location) === state.selectedDexLocation)) return false;
      return true;
    });
  }
  function renderDex(){
    renderDexFilters();
    const list = filteredPokemon();
    $('#filteredCount').textContent = `${list.length}마리`;
    $('#pokemonGrid').innerHTML = list.length ? list.map(pokemonCard).join('') : '<div class="empty">조건에 맞는 포켓몬이 없습니다.</div>';
    $$('.pokemon-card', $('#pokemonGrid')).forEach(card => card.addEventListener('click', () => openPokemonModal(Number(card.dataset.id))));
  }
  function pokemonCard(p){ return `<button class="pokemon-card" data-id="${p.id}">${state.favorites.has(p.id)?'<span class="favorite-dot">★</span>':''}${pokemonImage(p)}<b>${esc(p.name)}</b></button>`; }
  function pokemonImage(p, cls=''){
    if (!p) return '<span class="fallback-img">?</span>';
    const sources = unique([p.sprite, p.image]);
    if (!sources.length) return `<span class="fallback-img">${esc((p.name||'?').slice(0,1))}</span>`;
    return `<img class="pokemon-sprite ${esc(cls)}" src="${esc(sources[0])}" data-sources="${esc(sources.join('|'))}" data-source-index="0" data-fallback="${esc((p.name||'?').slice(0,1))}" onerror="RP_swapImage(this)" loading="lazy" alt="${esc(p.name)}" />`;
  }
  function shinySpriteUrl(p){
    if (!p?.sprite) return '';
    return String(p.sprite).replace('/versions/generation-iv/diamond-pearl/', '/versions/generation-iv/diamond-pearl/shiny/');
  }
  function pokemonShinyImage(p, cls=''){
    if (!p) return '<span class="fallback-img">?</span>';
    const shiny = shinySpriteUrl(p);
    const sources = unique([shiny, p.sprite, p.image]);
    if (!sources.length) return `<span class="fallback-img">${esc((p.name||'?').slice(0,1))}</span>`;
    return `<img class="pokemon-sprite shiny-sprite ${esc(cls)}" src="${esc(sources[0])}" data-sources="${esc(sources.join('|'))}" data-source-index="0" data-fallback="${esc((p.name||'?').slice(0,1))}" onerror="RP_swapImage(this)" loading="lazy" alt="${esc(p.name)} 이로치" />`;
  }
  function statRowsHtml(stats={}){
    const rows = [
      ['HP', stats.hp], ['공격', stats.atk], ['방어', stats.def],
      ['특공', stats.spa], ['특방', stats.spd], ['스피드', stats.spe]
    ];
    return `<div class="base-stat-list">${rows.map(([label, value]) => {
      const num = Number(value) || 0;
      const width = Math.max(4, Math.min(100, Math.round(num / 255 * 100)));
      return `<div class="base-stat-row"><span>${esc(label)}</span><div class="base-stat-bar"><i style="width:${width}%"></i></div><b>${esc(num || '-')}</b></div>`;
    }).join('')}<div class="base-stat-total"><span>합계</span><b>${esc(stats.total || '-')}</b></div></div>`;
  }

  function openPokemonModal(id, preferredLocation=''){
    const p = POKEMON_BY_ID.get(Number(id)); if (!p) return;
    state.modalPokemonId = p.id; state.modalTab = 'basic';
    const locs = p.locations || [];
    const wildLocs = locs.filter(e => !isSpecialEvent(e));
    state.modalLocation = preferredLocation || wildLocs[0]?.location || inferBestAcquisitionLocation(p) || '특수 이벤트';
    renderPokemonModal();
    $('#pokemonModal').classList.add('open'); $('#pokemonModal').setAttribute('aria-hidden','false'); document.body.classList.add('modal-open');
  }
  function closePokemonModal(){ $('#pokemonModal').classList.remove('open'); $('#pokemonModal').setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open'); }

  function renderPokemonModal(){
    const p = POKEMON_BY_ID.get(state.modalPokemonId); if (!p) return;
    $('#modalBody').innerHTML = `
      <div class="modal-grid modal-grid-tabs">
        <section class="modal-summary">
          <div class="modal-art">${pokemonImage(p)}</div>
          <div class="modal-title-block"><span class="num">${esc(p.num)}</span><h2 id="modalTitle">${esc(p.name)}</h2><div class="type-badges">${cleanTypes(p.types).map(typeBadge).join('')}</div></div>
          <button class="ghost favorite-modal" id="toggleFavorite">${state.favorites.has(p.id) ? '★ 즐겨찾기 해제' : '☆ 즐겨찾기 추가'}</button>
        </section>
        <section class="modal-detail-tabs">
          <div class="modal-tab-buttons">
            <button class="modal-tab ${state.modalTab==='basic'?'active':''}" data-tab="basic">기본정보</button>
            <button class="modal-tab ${state.modalTab==='events'?'active':''}" data-tab="events">출현지역·이벤트</button>
            <button class="modal-tab ${state.modalTab==='moves'?'active':''}" data-tab="moves">배우는 기술</button>
          </div>
          <div class="modal-tab-content">${modalTabContent(p)}</div>
        </section>
      </div>`;
    $('#toggleFavorite').addEventListener('click', () => { if (state.favorites.has(p.id)) state.favorites.delete(p.id); else state.favorites.add(p.id); saveFavorites(); renderPokemonModal(); renderDex(); });
    $$('.modal-tab', $('#modalBody')).forEach(btn => btn.addEventListener('click', () => { state.modalTab = btn.dataset.tab; renderPokemonModal(); }));
    $$('.location-chip', $('#modalBody')).forEach(btn => btn.addEventListener('click', () => { state.modalLocation = btn.dataset.location; renderPokemonModal(); }));
  }
  function modalTabContent(p){
    if (state.modalTab === 'events') return modalEventsHtml(p);
    if (state.modalTab === 'moves') return movesHtml(p);
    return basicInfoHtml(p);
  }
  function basicInfoHtml(p){
    const guide = getAcquisitionGuide(p);
    return `<div class="modal-info single-panel"><h3>기본 정보</h3>
      <section class="appearance-panel">
        <div class="appearance-card"><b>일반 모습</b>${pokemonImage(p, 'appearance-sprite')}</div>
        <div class="appearance-card shiny"><b>이로치 모습</b>${pokemonShinyImage(p, 'appearance-sprite')}</div>
      </section>
      <div class="info-grid compact">
        <div><span>특성</span><b>${esc((p.abilities || []).join(' / ') || '-')}</b></div>
        <div><span>진화</span><b>${esc(cleanEvolutionText(p.evolution))}</b></div>
        <div><span>포획률</span><b>${esc(p.catchRate || '-')}</b></div>
        <div><span>성장</span><b>${esc(p.expGrowth || '-')}</b></div>
        <div><span>알 그룹</span><b>${esc((p.eggGroups || []).join(' / ') || '-')}</b></div>
        <div><span>노력치</span><b>${esc(p.evYield || '-')}</b></div>
      </div>
      <h3>종족값</h3>
      ${statRowsHtml(p.stats || {})}
      <h3>획득 요약</h3>${guideHtml(guide)}
    </div>`;
  }
  function modalEventsHtml(p){
    const rows = normalizedPokemonLocations(p);
    const directRows = rows.filter(e => !isSpecialEvent(e));
    const specialRows = rows.filter(isSpecialEvent);
    const activeLoc = state.modalLocation && directRows.some(e => e.location === state.modalLocation)
      ? state.modalLocation
      : (directRows[0]?.location || '');
    return `<div class="modal-locations single-panel"><h3>출현 지역 / 특수 이벤트</h3>${locationChipHtml(p, activeLoc, directRows)}${eventDetailsHtml(p, activeLoc, directRows, specialRows)}</div>`;
  }
  function movesHtml(p){
    const l = p.learnset || {};
    const has = (l.level?.length || l.machine?.length || l.tutor?.length || l.specialTutor?.length);
    if (!has) return '<div class="modal-info single-panel"><h3>배우는 기술</h3><div class="empty small-empty">기술 습득 데이터가 없습니다.</div></div>';
    return `<div class="modal-info single-panel"><h3>배우는 기술 목록</h3>
      ${levelMovesHtml(l.level || [])}
      ${machineMovesHtml(l.machine || [])}
      ${tutorMovesHtml('기술 가르침 NPC', l.tutor || [])}
      ${tutorMovesHtml('특수 기술 가르침 NPC', l.specialTutor || [])}
    </div>`;
  }
  function levelMovesHtml(list){
    if (!list.length) return '';
    return `<section class="move-section"><h4>레벨업</h4><div class="move-grid">${list.map(m => `<span class="move-pill"><b>Lv.${esc(m.level)}</b>${esc(m.move)}${m.note?`<em>${esc(m.note)}</em>`:''}</span>`).join('')}</div></section>`;
  }
  function machineMovesHtml(list){
    if (!list.length) return '';
    return `<section class="move-section"><h4>기술머신 / 비전머신</h4><div class="move-grid machine-grid">${list.map(m => `<span class="move-pill"><b>${esc(m.machine)}</b>${esc(m.move)}${m.note?`<em>${esc(m.note)}</em>`:''}</span>`).join('')}</div></section>`;
  }
  function tutorMovesHtml(title, list){
    if (!list.length) return '';
    return `<section class="move-section"><h4>${esc(title)}</h4><div class="move-grid">${list.map(m => `<span class="move-pill">${esc(m.move)}${m.note?`<em>${esc(m.note)}</em>`:''}</span>`).join('')}</div></section>`;
  }
  function movesSearchText(p){
    const l = p.learnset || {};
    return [ ...(l.level||[]).map(m=>m.move), ...(l.machine||[]).map(m=>`${m.machine} ${m.move}`), ...(l.tutor||[]).map(m=>m.move), ...(l.specialTutor||[]).map(m=>m.move) ].join(' ');
  }

  function locationChipHtml(p, activeLoc, directRowsOverride=null){
    const directRows = directRowsOverride || normalizedPokemonLocations(p).filter(e => !isSpecialEvent(e));
    if (!directRows.length){
      const inherited = getAcquisitionGuide(p).entries.filter(e => e.id !== p.id).flatMap(e => e.methods || []);
      if (!inherited.length) return '<div class="empty small-empty">일반 출현 지역은 없습니다. 아래 선물·특수 이벤트 정보를 확인하세요.</div>';
      return `<div class="location-chips modal-chips">${unique(inherited.map(l=>l.location)).slice(0,12).map(loc => { const e=inherited.find(x=>x.location===loc); return `<button class="location-chip inherited ${loc===activeLoc?'active':''}" data-location="${esc(loc)}"><span><b>${esc(loc)}</b><small>진화 전 포켓몬 획득 경로 · ${esc(cleanMethod(e.method))}${e.level?` · Lv.${esc(e.level)}`:''}</small></span><span>↗</span></button>`; }).join('')}</div>`;
    }
    return `<div class="location-chips modal-chips">${unique(directRows.map(l=>l.location)).map(loc => { const e=directRows.find(x=>x.location===loc); return `<button class="location-chip ${loc===activeLoc?'active':''}" data-location="${esc(loc)}"><span><b>${esc(loc)}</b><small>${esc(cleanMethod(e.method))}${e.level?` · Lv.${esc(e.level)}`:''}</small></span><span>✦</span></button>`; }).join('')}</div>`;
  }
  function eventDetailsHtml(p, activeLoc, directRowsOverride=null, specialRowsOverride=null){
    const directRows = directRowsOverride || normalizedPokemonLocations(p).filter(e => !isSpecialEvent(e));
    const specialRows = specialRowsOverride || normalizedPokemonLocations(p).filter(isSpecialEvent);
    const selectedDirect = dedupeEvents(directRows.filter(e => !activeLoc || e.location === activeLoc));
    const special = dedupeEvents(specialRows);
    const inherited = (!selectedDirect.length && !special.length)
      ? getAcquisitionGuide(p).entries.filter(entry => entry.id !== p.id).flatMap(entry => (entry.methods || []).map(m => ({...m, labelPrefix:`${entry.name} 획득 후 진화 · `}))).slice(0, 16)
      : [];
    const blocks = [];
    if (selectedDirect.length) blocks.push(eventSectionHtml(activeLoc ? `${activeLoc} 조우 조건` : '출현 지역 조우 조건', selectedDirect, 'encounter'));
    if (special.length) blocks.push(eventSectionHtml('선물 / 특수 이벤트', special, 'special'));
    if (inherited.length) blocks.push(eventSectionHtml('진화 전 포켓몬 획득 경로', inherited, 'inherited'));
    if (!blocks.length) return '<div class="empty small-empty">상세 조우 조건이 없습니다.</div>';
    return `<div class="event-details event-details-grouped">${blocks.join('')}</div>`;
  }
  function eventSectionHtml(title, rows, kind='encounter'){
    return `<section class="event-section event-${esc(kind)}"><h4>${esc(title)}</h4>${rows.map(eventRowHtml).join('')}</section>`;
  }
  function eventRowHtml(e){
    const location = displayEventLocation(e);
    const method = cleanMethod(e.method);
    const level = e.level ? ` · Lv.${esc(e.level)}` : '';
    return `<article class="event-row"><b>${esc(e.labelPrefix||'')}${esc(location)} · ${esc(method)}${level}</b>${e.rates?.length?`<p>${e.rates.map(r=>`${esc(r.label)} ${esc(r.value)}`).join(' / ')}</p>`:''}${e.notes?.length?`<ol>${e.notes.map(n=>`<li>${esc(cleanEventNote(n))}</li>`).join('')}</ol>`:''}</article>`;
  }

  function renderPartyControls(){
    const typeSelect = $('#partyTypeSelect');
    if (typeSelect) {
      typeSelect.innerHTML = TYPES.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
      typeSelect.value = state.partyType;
      typeSelect.addEventListener('change', e => { state.partyType = e.target.value; renderParty(); });
    }

    const generationSelect = $('#partyGenerationSelect');
    if (generationSelect) {
      generationSelect.innerHTML = GENERATIONS.map(g => `<option value="${esc(g.value)}">${esc(g.label)}</option>`).join('');
      generationSelect.value = state.partyGeneration;
      generationSelect.addEventListener('change', e => { state.partyGeneration = e.target.value; renderParty(); });
    }

    ['noDuplicate','lockDrawn','excludeLegend','onlyObtainable'].forEach(id => { const el=$('#'+id); if(el) el.addEventListener('change', renderParty); });
  }
  function getPartyFilters(){ return { noDuplicate: $('#noDuplicate')?.checked ?? true, lockDrawn: $('#lockDrawn')?.checked ?? true, excludeLegend: $('#excludeLegend')?.checked ?? true, onlyObtainable: $('#onlyObtainable')?.checked ?? false, type: state.partyType, generation: state.partyGeneration }; }
  function partyPool(){
    const f = getPartyFilters(); const current = new Set(state.party.filter(Boolean).map(p=>p.id));
    return POKEMONS.filter(p => {
      if (!p.isFinalEvolution) return false;
      if (f.excludeLegend && LEGENDARY_IDS.has(p.id)) return false;
      if (f.type !== '전체' && !cleanTypes(p.types).includes(f.type)) return false;
      if (f.generation !== '전체' && getPokemonGeneration(p.id) !== f.generation) return false;
      if (f.onlyObtainable && !(p.locations || []).length && !getAcquisitionGuide(p).locations.length) return false;
      if (f.noDuplicate && current.has(p.id)) return false;
      if (f.lockDrawn && state.drawnIds.has(p.id)) return false;
      return true;
    });
  }
  function drawSlot(index){
    const pool = partyPool();
    if (!pool.length){ alert('조건에 맞는 포켓몬이 없습니다. 필터나 뽑기 기록을 확인하세요.'); return; }
    const p = randomItem(pool); state.party[index] = p; state.selectedPartySlot = index; state.drawnIds.add(p.id); saveDrawnIds(); renderParty();
  }
  function drawAllSlots(){ for(let i=0;i<6;i++) drawSlot(i); }
  function renderParty(){ renderPartySlots(); renderPartyGuide(); }
  function renderPartySlots(){
    const wrap = $('#partySlots');
    wrap.innerHTML = state.party.map((p,i) => {
      if (!p) return `<article class="party-card empty-slot" data-slot="${i}"><span class="slot-num">${i+1}</span><div class="empty-slot-body"><b>빈 슬롯</b><small>버튼을 누르면 조건에 맞는 최종 진화체가 뽑힙니다.</small><button class="primary draw-slot" data-slot="${i}">이 슬롯 뽑기</button></div></article>`;
      const guide = getAcquisitionGuide(p);
      return `<article class="party-card ${state.selectedPartySlot===i?'active':''}" data-slot="${i}"><span class="slot-num">${i+1}</span><div class="party-mon-art">${pokemonImage(p)}</div><div class="party-mon-text"><b>${esc(p.name)}</b><div class="type-badges">${cleanTypes(p.types).map(typeBadge).join('')}</div><small>${esc(guide.short)}</small></div><div class="slot-actions"><button class="ghost open-party-mon" data-id="${p.id}">도감</button><button class="primary draw-slot" data-slot="${i}">다시 뽑기</button></div></article>`;
    }).join('');
    $$('.draw-slot', wrap).forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); drawSlot(Number(btn.dataset.slot)); }));
    $$('.open-party-mon', wrap).forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); openPokemonModal(Number(btn.dataset.id)); }));
    $$('.party-card', wrap).forEach(card => card.addEventListener('click', () => { state.selectedPartySlot = Number(card.dataset.slot); renderParty(); }));
  }
  function renderPartyGuide(){
    const selected = state.selectedPartySlot != null ? state.party[state.selectedPartySlot] : state.party.find(Boolean);
    const poolCount = partyPool().length;
    if (!selected){ $('#partyGuide').innerHTML = `<h3>획득 경로</h3><div class="empty">왼쪽 슬롯에서 포켓몬을 뽑으면 진화 전 포켓몬의 포획/선물/특수 이벤트 방법까지 표시됩니다.</div><div class="analysis-section"><b>현재 후보</b><p>${poolCount}마리 · 최종 진화체 기준</p><p class="muted-text">타입 제한: ${esc(state.partyType)} / 세대 제한: ${esc(generationLabel(state.partyGeneration))} / 뽑기 잠금: ${state.drawnIds.size}마리</p></div>`; return; }
    const guide = getAcquisitionGuide(selected);
    $('#partyGuide').innerHTML = `<h3>획득 경로</h3>${guidePanelHtml(selected, guide)}<div class="analysis-section"><b>현재 후보</b><p>${poolCount}마리 · 최종 진화체 기준</p><p class="muted-text">세대 제한: ${esc(generationLabel(state.partyGeneration))} / 초기화 전 재등장 방지에 걸린 포켓몬: ${state.drawnIds.size}마리</p></div>`;
    $$('.guide-detail-btn').forEach(btn => btn.addEventListener('click', () => openPokemonModal(Number(btn.dataset.id))));
  }
  function guidePanelHtml(p, guide){ return `<div class="party-guide-card"><div class="guide-head">${pokemonImage(p)}<span><b>${esc(p.name)}</b><small>${cleanTypes(p.types).map(typeBadge).join('')}</small></span></div>${guideHtml(guide)}<button class="ghost guide-detail-btn" data-id="${p.id}">도감 팝업 열기</button></div>`; }
  function guideHtml(guide){
    const list = (guide.entries || []).map(entry => `<section class="guide-entry"><b>${esc(entry.name)} ${entry.role?`<em>${esc(entry.role)}</em>`:''}</b>${entry.methods.length?`<ul>${entry.methods.map(m=>`<li>${esc(m.location)} · ${esc(cleanMethod(m.method))}${m.level?` · Lv.${esc(m.level)}`:''}${m.notes?.length?`<ol>${m.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ol>`:''}</li>`).join('')}</ul>`:'<p>직접 획득 데이터 없음</p>'}</section>`).join('');
    return `<div class="guide-box"><b>${esc(guide.short)}</b>${guide.steps.length?`<ol>${guide.steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol>`:''}${list}</div>`;
  }
  function getAcquisitionGuide(p){
    if (!p) return { short:'획득 정보 확인 필요', steps:[], locations:[], entries:[] };
    const chain = [...getPreEvolutionChain(p), p];
    const entries = chain.map((mon, idx) => ({ id:mon.id, name:mon.name, role:idx===chain.length-1?'선택 포켓몬':'미진화체', methods:(mon.locations || []).slice().sort((a,b)=>storyRank(a.location)-storyRank(b.location)).slice(0,12) }));
    const allLocations = entries.flatMap(e=>e.methods);
    const direct = (p.locations || []).slice().sort((a,b)=>storyRank(a.location)-storyRank(b.location));
    const first = direct[0] || allLocations[0]; const steps=[];
    if (direct.length) steps.push(`${p.name} 직접 획득 가능: ${direct[0].location} · ${cleanMethod(direct[0].method)}${direct[0].level?` · Lv.${direct[0].level}`:''}`);
    const preEntries = entries.filter(e => e.id !== p.id && e.methods.length);
    if (preEntries.length){ const base=preEntries[0]; const m=base.methods[0]; steps.push(`${base.name} 획득 후 진화 가능: ${m.location} · ${cleanMethod(m.method)}${m.level?` · Lv.${m.level}`:''}`); }
    if (p.evolution && p.evolution !== 'N') steps.push(`${p.name} 진화 조건: ${cleanEvolutionText(p.evolution)}`);
    return { short:first ? `${first.location} · ${cleanMethod(first.method)}` : '직접 획득 정보 없음', steps, locations:allLocations, entries };
  }
  function getPreEvolutionChain(p){ const out=[]; let cur=p; const guard=new Set([p.id]); while(true){ const pre=getPreEvolution(cur); if(!pre || guard.has(pre.id)) break; out.unshift(pre); guard.add(pre.id); cur=pre; } return out; }
  function getPreEvolution(p){ const ids=(p.preEvolutionIds || []).map(Number).filter(id=>POKEMON_BY_ID.has(id)); return ids.length ? POKEMON_BY_ID.get(ids[0]) : null; }
  function inferBestAcquisitionLocation(p){ return getAcquisitionGuide(p).locations?.[0]?.location || ''; }

  function renderItemTabs(){
    $('#itemCategoryTabs').innerHTML = ITEM_CATEGORIES.map(c => `<button class="browse-tab ${state.itemCategory===c?'active':''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
    $$('#itemCategoryTabs .browse-tab').forEach(btn => btn.addEventListener('click', () => { state.itemCategory = btn.dataset.cat; renderItemTabs(); renderItems(); }));
  }
  function renderItems(){
    const q = state.search.toLowerCase();
    const list = ITEMS.filter(it => {
      if (state.itemCategory !== '전체' && it.category !== state.itemCategory) return false;
      const hay = `${it.name} ${it.category} ${it.location} ${it.method} ${it.type} ${(it.locations||[]).map(l=>`${l.location} ${l.method} ${l.note||''}`).join(' ')}`.toLowerCase();
      return !q || hay.includes(q);
    });
    $('#itemCount').textContent = `${list.length}개`;
    $('#itemGrid').innerHTML = list.length ? list.map(itemCard).join('') : '<div class="empty">조건에 맞는 아이템이 없습니다.</div>';
    $$('.item-card', $('#itemGrid')).forEach(card => card.addEventListener('click', () => openItemModal(card.dataset.item)));
  }
  function itemCard(it){
    const first = (it.locations || [])[0];
    return `<button class="item-card item-card-button" data-item="${esc(it.name)}">
      <span class="item-card-icon">${itemIconHtml(it)}</span>
      <span class="item-card-main"><b>${esc(it.name)}</b><small>${esc(first ? compactItemLocation(first.location) : '획득 위치 확인')}</small></span>
      <span class="item-card-category">${esc(it.category)}</span>
    </button>`;
  }
  function openItemModal(name){
    const it = ITEMS.find(item => item.name === name); if (!it) return;
    $('#modalBody').innerHTML = itemModalHtml(it);
    $('#pokemonModal').classList.add('open');
    $('#pokemonModal').setAttribute('aria-hidden','false');
    document.body.classList.add('modal-open');
  }
  function itemModalHtml(it){
    const locs = it.locations || [];
    return `<div class="item-modal-layout">
      <section class="item-modal-summary">
        <div class="item-modal-icon">${itemIconHtml(it)}</div>
        <span class="item-category-pill">${esc(it.category)}</span>
        <h2>${esc(it.name)}</h2>
        ${it.type?`<div class="item-meta item-modal-meta"><span>${esc(it.type)}</span>${it.power?`<span>위력 ${esc(it.power)}</span>`:''}${it.accuracy?`<span>명중 ${esc(it.accuracy)}</span>`:''}${it.pp?`<span>PP ${esc(it.pp)}</span>`:''}</div>`:''}
      </section>
      <section class="item-modal-detail">
        <h3>획득 위치 / 방법</h3>
        ${locs.length ? `<div class="item-location-list">${locs.map((l,i)=>`<article class="item-location-row"><span>${i+1}</span><div><b>${esc(cleanItemLocation(l.location))}</b><p>${esc(cleanItemMethod(l.method || it.method || '획득 방법 확인'))}</p>${l.note?`<em>${esc(l.note)}</em>`:''}</div></article>`).join('')}</div>` : '<div class="empty small-empty">획득 위치 데이터가 없습니다.</div>'}
      </section>
    </div>`;
  }

  function renderChangeTabs(){
    $('#changeCategoryTabs').innerHTML = CHANGE_CATEGORIES.map(c => `<button class="browse-tab ${state.changeCategory===c?'active':''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
    $$('#changeCategoryTabs .browse-tab').forEach(btn => btn.addEventListener('click', () => { state.changeCategory = btn.dataset.cat; renderChangeTabs(); renderChanges(); }));
  }
  function renderChanges(){
    const q = state.search.toLowerCase();
    const list = CHANGES.filter(c => (state.changeCategory==='전체' || c.category===state.changeCategory) && (!q || `${c.category} ${c.title} ${c.body}`.toLowerCase().includes(q)) );
    $('#changeCount').textContent = `${list.length}건`;
    if (!list.length){ $('#changeList').innerHTML = '<div class="empty">조건에 맞는 변경점이 없습니다.</div>'; return; }
    const cats = state.changeCategory === '전체' ? CHANGE_CATEGORIES.filter(c => c !== '전체') : [state.changeCategory];
    $('#changeList').innerHTML = cats.map(cat => {
      const rows = list.filter(c => c.category === cat);
      if (!rows.length) return '';
      return `<section class="change-section"><header><span>${esc(cat)}</span><h2>${esc(cat)}</h2></header><div class="change-section-list">${rows.map(changeCard).join('')}</div></section>`;
    }).join('');
  }
  function changeCard(c){
    return `<article class="change-card change-card-wide"><b>${esc(c.title || c.category)}</b>${formatChangeBody(c.body)}</article>`;
  }
  function formatChangeBody(body=''){
    const parts = String(body || '').split(/\s+-\s+|\n+/).map(v => v.trim()).filter(Boolean);
    if (parts.length > 1) return `<ul>${parts.map(v => `<li>${esc(v)}</li>`).join('')}</ul>`;
    return `<p>${esc(parts[0] || '')}</p>`;
  }

  function renderFavorites(){
    const list = [...state.favorites].map(id=>POKEMON_BY_ID.get(Number(id))).filter(Boolean);
    $('#favoritesGrid').innerHTML = list.length ? list.map(pokemonCard).join('') : '<div class="empty">즐겨찾기한 포켓몬이 없습니다.</div>';
    $$('.pokemon-card', $('#favoritesGrid')).forEach(card => card.addEventListener('click', () => openPokemonModal(Number(card.dataset.id))));
  }

  function normalizeItems(items){
    return (items || []).map((it, index) => {
      const rawLocations = (it.locations && it.locations.length) ? it.locations : [{ location: it.location || '', method: it.method || '', note: it.note || '' }];
      const locations = rawLocations.flatMap(loc => splitItemLocations(loc.location).map(name => ({
        location: cleanItemLocation(name),
        method: cleanItemMethod(loc.method || it.method || '획득'),
        note: loc.note || it.note || ''
      }))).filter(loc => loc.location);
      return { ...it, originalIndex:index, locations:dedupeItemLocations(locations), location:(locations[0]?.location || it.location || '') };
    });
  }
  function splitItemLocations(text=''){
    const src = String(text || '').replace(/，/g, ',').replace(/ㆍ/g, ',');
    const parts = src.split(/\s*,\s*/).map(v => v.trim()).filter(Boolean);
    return parts.length ? parts : [src.trim()].filter(Boolean);
  }
  function cleanItemLocation(text=''){
    return String(text || '')
      .replace(/구매 가능/g, ' 구매 가능')
      .replace(/\s+/g, ' ')
      .replace(/\s+-\s+/g, ' - ')
      .replace(/^위치[:：]\s*/,'')
      .trim();
  }
  function compactItemLocation(text=''){
    const v = cleanItemLocation(text);
    return v.length > 22 ? `${v.slice(0, 22)}…` : v;
  }
  function cleanItemMethod(text=''){
    const v = String(text || '').replace(/\s+/g, ' ').trim();
    if (!v) return '획득 방법 확인';
    if (v === '필드/이벤트 획득') return '필드 또는 이벤트로 획득';
    return v;
  }
  function dedupeItemLocations(list){
    const map = new Map();
    (list || []).forEach(loc => {
      const key = `${loc.location}|${loc.method}|${loc.note || ''}`;
      if (!map.has(key)) map.set(key, loc);
    });
    return [...map.values()].sort((a,b)=>storyRank(a.location)-storyRank(b.location) || a.location.localeCompare(b.location,'ko'));
  }
  function itemStoryRank(it){
    const ranks = (it.locations || []).map(l => storyRank(l.location)).filter(v => Number.isFinite(v));
    const best = ranks.length ? Math.min(...ranks) : 9999;
    return best === 9999 ? 9999 + (it.originalIndex || 0) / 10000 : best;
  }
  function normalizeChanges(changes){
    const seen = new Set();
    return (changes || []).map(c => ({...c, body:String(c.body || '').replace(/\s+/g,' ').trim()})).filter(c => {
      const key = `${c.category}|${c.title}|${c.body}`;
      if (seen.has(key) || !c.body) return false;
      seen.add(key); return true;
    });
  }
  const ITEM_ICON_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/';
  const ITEM_ICON_SLUGS = {
    '각성의돌':'dawn-stone','강철플레이트':'iron-plate','검은띠':'black-belt','검은안경':'black-glasses','검은진흙':'black-sludge','검은철구':'iron-ball','검정비드로':'black-flute','고드름플레이트':'icicle-plate','고운비늘':'prism-scale','공포플레이트':'dread-plate','광각렌즈':'wide-lens','괴상한패치':'dubious-disc','괴상한향로':'odd-incense','교정깁스':'macho-brace','구애머리띠':'choice-band','구애스카프':'choice-scarf','구애안경':'choice-specs','굵은뼈':'thick-club','금강옥':'adamant-orb','금속코트':'metal-coat','금속파우더':'metal-powder','기적의씨':'miracle-seed','기합의띠':'focus-sash','기합의머리띠':'focus-band','꽃향로':'rose-incense','끈기갈고리손톱':'grip-claw','끈적끈적바늘':'sticky-barb','노랑밴드':'yellow-scarf','노랑비드로':'yellow-flute','녹지않는얼음':'never-melt-ice','느림보꼬리':'lagging-tail','달의돌':'moon-stone','달인의띠':'expert-belt','대지플레이트':'earth-plate','대파':'leek','독바늘':'poison-barb','동글동글돌':'oval-stone','딱딱한돌':'hard-stone','뜨거운바위':'heat-rock','럭키펀치':'lucky-punch','리프의돌':'leaf-stone','마그마부스터':'magmarizer','마음의물방울':'soul-dew','만복향로':'full-incense','맹독구슬':'toxic-orb','맹독플레이트':'toxic-plate','먹다남은음식':'leftovers','메트로놈':'metronome','멘탈허브':'mental-herb','목탄':'charcoal','무사태평향로':'lax-incense','물방울플레이트':'splash-plate','물의돌':'water-stone','바닷물향로':'sea-incense','박식안경':'wise-glasses','반짝가루':'bright-powder','백금옥':'griseous-orb','백옥':'lustrous-orb','변함없는돌':'everstone','보송보송바위':'smooth-rock','부드러운모래':'soft-sand','부적금화':'amulet-coin','분홍밴드':'pink-scarf','불구슬플레이트':'flame-plate','불꽃의돌':'fire-stone','비단벌레플레이트':'insect-plate','빛의돌':'shiny-stone','빛의점토':'light-clay','빨간실':'destiny-knot','빨강밴드':'red-scarf','빨강비드로':'red-flute','생명의구슬':'life-orb','선제공격손톱':'quick-claw','순결의부적':'cleanse-tag','순결의향로':'pure-incense','스피드파우더':'quick-powder','신비의물방울':'mystic-water','실크스카프':'silk-scarf','심해의비늘':'deep-sea-scale','심해의이빨':'deep-sea-tooth','아름다운허물':'shed-shell','암석플레이트':'stone-plate','암석향로':'rock-incense','어둠의돌':'dusk-stone','얼음의돌':'ice-stone','업그레이드':'upgrade','에레키부스터':'electirizer','연막탄':'smoke-ball','영계의천':'reaper-cloth','예리한부리':'sharp-beak','예리한손톱':'razor-claw','예리한이빨':'razor-fang','왕의징표석':'kings-rock','용의비늘':'dragon-scale','용의이빨':'dragon-fang','용의플레이트':'draco-plate','우뢰플레이트':'zap-plate','원령플레이트':'spooky-plate','은빛가루':'silver-powder','이상한플레이트':'mind-plate','자석':'magnet','잔물결향로':'wave-incense','저주의부적':'spell-tag','전기구슬':'light-ball','조개껍질방울':'shell-bell','주먹플레이트':'fist-plate','차가운바위':'icy-rock','천둥의돌':'thunder-stone','초록밴드':'green-scarf','초록플레이트':'meadow-plate','초점렌즈':'scope-lens','축축한바위':'damp-rock','큰뿌리':'big-root','태양의돌':'sun-stone','파랑밴드':'blue-scarf','파랑비드로':'blue-flute','파워렌즈':'power-lens','파워리스트':'power-bracer','파워밴드':'power-band','파워벨트':'power-belt','파워앵클릿':'power-anklet','파워웨이트':'power-weight','파워풀허브':'power-herb','평온의방울':'soothe-bell','포커스렌즈':'zoom-lens','푸른하늘플레이트':'sky-plate','프로텍터':'protector','하양비드로':'white-flute','하양허브':'white-herb','학습장치':'exp-share','행복의알':'lucky-egg','행운의향로':'luck-incense','화염구슬':'flame-orb','휘어진스푼':'twisted-spoon','힘의머리띠':'muscle-band',
    'GS볼':'gs-ball','갤럭시단의열쇠':'galactic-key','고대의부적':'old-charm','고라파덕물뿌리개':'sprayduck','교환권1':'coupon-1','교환권2':'coupon-2','교환권3':'coupon-3','그라시데아꽃':'gracidea','낡은낚싯대':'old-rod','대단한낚싯대':'super-rod','동전케이스':'coin-case','룰북':'rule-book','룸키':'room-key','멤버스카드':'member-card','모험노트':'adventure-rules','무지갯빛날개':'rainbow-wing','발전소키':'key-stone','배틀레코더':'vs-recorder','배틀서처':'vs-seeker','보물주머니':'treasure-bag','비밀의열쇠':'secret-key','비전신약':'secret-potion','수수께끼의 초대장':'member-card','승선티켓':'ss-ticket','실상자':'seal-case','실주머니':'seal-bag','액세서리상자':'accessory-box','연둣빛구슬':'green-orb','오박사의편지':'oaks-letter','은빛날개':'silver-wing','자전거':'bicycle','전해줄물건':'parcel','좋은낚싯대':'good-rod','주홍구슬':'red-orb','쪽빛구슬':'blue-orb','차':'tea','창고열쇠':'storage-key','천계의피리':'azure-flute','초승달날개':'lunar-wing','친구수첩':'pal-pad','콘테스트패스':'contest-pass','타운맵':'town-map','포인트카드':'point-card','포켓트레':'poke-radar','포핀케이스':'poffin-case'
  };
  const TYPE_TM_SLUGS = {'노말':'normal','불꽃':'fire','물':'water','풀':'grass','전기':'electric','얼음':'ice','격투':'fighting','독':'poison','땅':'ground','비행':'flying','에스퍼':'psychic','사이코키네시스':'psychic','벌레':'bug','바위':'rock','고스트':'ghost','드래곤':'dragon','악':'dark','강철':'steel','페어리':'fairy'};
  function itemIconUrlFromSlug(slug){ return `${ITEM_ICON_BASE}${slug}.png`; }
  function itemFallbackSlug(it){
    const name = String(it.name || '');
    const category = String(it.category || '');
    if (/비전머신|^HM/i.test(name)) return `hm-${TYPE_TM_SLUGS[it.type] || 'normal'}`;
    if (/기술머신|^TM/i.test(name) || /기술머신/.test(category)) return `tm-${TYPE_TM_SLUGS[it.type] || 'normal'}`;
    if (/볼$|볼\b/.test(name)) return 'poke-ball';
    if (/상처약|회복|만병통치|해독제|기력|PP|포인트업|사탕|약$/.test(name)) return 'potion';
    if (/중요한 물건|키|티켓|카드|열쇠|도감|낚싯대|자전거|수첩|케이스|주머니|피리|날개|구슬/.test(category + ' ' + name)) return 'key-stone';
    if (/플레이트/.test(name)) return 'legend-plate';
    if (/향로/.test(name)) return 'luck-incense';
    if (/밴드|띠|스카프|안경|렌즈|허브/.test(name)) return 'silk-scarf';
    if (/돌/.test(name)) return 'moon-stone';
    return 'poke-ball';
  }
  function itemIconHtml(it){
    const slug = ITEM_ICON_SLUGS[it.name] || itemFallbackSlug(it);
    const fallback = itemFallbackSlug(it);
    const src = itemIconUrlFromSlug(slug);
    const fallbackSrc = itemIconUrlFromSlug(fallback);
    const error = `this.onerror=null;this.src='${fallbackSrc}'`;
    return `<img src="${src}" alt="${esc(it.name)}" loading="lazy" decoding="async" onerror="${esc(error)}" />`;
  }

  function isSpecialEvent(e){
    if (e?.category === 'event') return true;
    if (e?.category === 'wild') return false;
    const method = cleanMethod(e.method);
    const source = String(e.source || '');
    if (source === 'GiFTSEVENTS' || source === 'NPCTRADES' || source === 'ENCOUNTERS_SPECIAL') return true;
    return /고정|선물|특수|이벤트|알|교환|NPC|포털|상세 조건/.test(method);
  }
  function normalizedPokemonLocations(p){
    return dedupeEvents((p.locations || []).map(e => ({...e, location: cleanEventLocation(e.location), method: cleanMethod(e.method), notes: dedupeNotes(e.notes || [])})));
  }
  function dedupeEvents(rows){
    const map = new Map();
    (rows || []).forEach(e => {
      const key = [cleanEventLocation(e.location), cleanMethod(e.method), e.level || '', cleanRates(e.rates || []), dedupeNotes(e.notes || []).map(cleanEventNote).join('|')].join('§');
      if (!map.has(key)) map.set(key, {...e, notes: dedupeNotes(e.notes || [])});
    });
    return [...map.values()].sort((a,b) => storyRank(a.location)-storyRank(b.location) || cleanEventLocation(a.location).localeCompare(cleanEventLocation(b.location),'ko') || cleanMethod(a.method).localeCompare(cleanMethod(b.method),'ko'));
  }
  function dedupeNotes(notes){
    const seen = new Set();
    return (notes || []).map(cleanEventNote).filter(Boolean).filter(note => {
      const key = note.replace(/[.。]+$/,'');
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }
  function cleanEventNote(text=''){
    return String(text || '').replace(/^[-•]\s*/, '').replace(/\s+/g, ' ').replace(/#(\d{3})\s*/g, '#$1 ').trim();
  }
  function cleanEventLocation(text=''){
    return String(text || '').replace(/^위치[:：]\s*/, '').replace(/\s+/g, ' ').replace(/\s+·\s+특수 이벤트$/,'').trim() || '특수 이벤트';
  }
  function displayEventLocation(e){
    const loc = cleanEventLocation(e.location);
    if (isSpecialEvent(e) && loc && loc !== '특수 이벤트') return `${loc}`;
    return loc;
  }
  function cleanRates(rates){
    return (rates || []).map(r => `${r.label || ''}:${r.value || ''}`).join('|');
  }

  function typeIcon(t){
    const items = {'노말':['silk-scarf.png','비단스카프'],'불꽃':['charcoal.png','목탄'],'물':['mystic-water.png','신비의물방울'],'풀':['miracle-seed.png','기적의씨'],'전기':['magnet.png','자석'],'얼음':['never-melt-ice.png','녹지않는얼음'],'격투':['black-belt.png','검은띠'],'독':['poison-barb.png','독바늘'],'땅':['soft-sand.png','부드러운모래'],'비행':['sharp-beak.png','예리한부리'],'에스퍼':['twisted-spoon.png','휘어진스푼'],'벌레':['silver-powder.png','은빛가루'],'바위':['hard-stone.png','딱딱한돌'],'고스트':['spell-tag.png','저주의부적'],'드래곤':['dragon-fang.png','용의이빨'],'악':['black-glasses.png','검은안경'],'강철':['metal-coat.png','금속코트'],'페어리':['pixie-plate.png','정령플레이트']};
    if (t === '전체') return '<span class="type-item-icon type-item-all">★</span>';
    const item = items[t]; if (!item) return '';
    return `<img class="type-item-icon" src="assets/type-items/${item[0]}" alt="${esc(item[1])}" loading="lazy" decoding="async" />`;
  }
  function typeBadge(t){ return `<i class="type-badge type-${esc(t)}">${esc(t)}</i>`; }
  function cleanTypes(types=[]){ return unique((types || []).map(t => String(t || '').replace(/[^가-힣A-Za-z0-9]/g,'')).filter(t => TYPES.includes(t))); }
  function cleanMethod(s=''){ return String(s || '').replace(/\s+/g,' ').trim() || '상세 조건 확인'; }
  function cleanEvolutionText(text=''){ return String(text || '').replace(/\s+/g,' ').trim() || '진화 조건 확인'; }
  function baseLocation(s=''){ return String(s || '').replace(/\s*\([^)]*\)/g,'').replace(/\s*[~/].*$/,'').replace(/\.\s*어디서든.*$/,'').trim(); }
  function storyRank(name=''){
    const base = baseLocation(name);
    for(let i=0;i<STORY_ORDER.length;i++){ const key=STORY_ORDER[i]; if(base===key || base.startsWith(key) || key.includes(base) || base.includes(key)) return i; }
    return 9999;
  }
  function dedupeById(list){ const map=new Map(); list.forEach(p => { if(!map.has(p.id)) map.set(p.id,p); }); return [...map.values()]; }
  function saveFavorites(){ localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify([...state.favorites])); }
  function saveDrawnIds(){ localStorage.setItem(STORAGE_KEYS.drawn, JSON.stringify([...state.drawnIds])); }

  init();
})();
