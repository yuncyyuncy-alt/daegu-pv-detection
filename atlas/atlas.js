/* 태양광 탐지 아틀라스 — NGII 정사영상에서 새로 찾은 태양광을 보여 주고 검토한다.
   데이터는 build_atlas_data.py가 /atlas_data/ 에 만든다. */
(async function () {
  const D = new URL('../atlas_data/', location.href).href;   // MapLibre 워커가 불러오므로 전체 주소 (상대 경로 기준)
  const T = new URL('../tiles/', location.href).href;
  const [summary, tilesInfo] = await Promise.all([
    fetch(D + 'summary.json').then(r => r.json()),
    fetch(T + 'tiles.json').then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  const runs = Object.fromEntries(summary.runs.map(r => [r.key, r]));
  let run = new URLSearchParams(location.search).get('run');
  if (!runs[run]) run = summary.default_run;
  let det = await fetch(D + `detect_${run}.geojson`).then(r => r.json());
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const fmt = (v, d = 0) => v == null || isNaN(v) ? '–' : Number(v).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });
  const $ = id => document.getElementById(id);
  const adm2Name = Object.fromEntries(summary.adm2.map(a => [a.id, a.name]));
  const SIZE = ['소규모(<300m²)', '중규모(300–3,000m²)', '대규모(≥3,000m²)'];
  const RAMP = ['#e3f6ea', '#a9e2bd', '#5cc489', '#22964f', '#0d5c2c'];

  const reviewKey = () => 'pv-review-v1-' + run;   // 검토 표시는 결과(모델)마다 따로 저장
  let review = {};
  const loadReview = () => { try { review = JSON.parse(localStorage.getItem(reviewKey()) || '{}'); } catch { review = {}; } };
  const saveReview = () => { try { localStorage.setItem(reviewKey(), JSON.stringify(review)); } catch { } };
  loadReview();

  const state = { adm2: '', metric: '', prob: runs[run].th, popover: true };
  const hash = location.hash.slice(1).split('/');

  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        sat: { type: 'raster', tileSize: 256, maxzoom: 19,
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' },
        osm: { type: 'raster', tileSize: 256, maxzoom: 19,
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], attribution: '© OpenStreetMap contributors' },
      },
      layers: [
        { id: 'base-sat', type: 'raster', source: 'sat' },
        { id: 'base-osm', type: 'raster', source: 'osm', layout: { visibility: 'none' } },
      ],
    },
    center: [128.62, 35.88], zoom: 10.5, attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
  // 'load'는 첫 렌더링을 기다려 백그라운드 탭에서 멈추므로 스타일 준비만 기다린다
  if (!map.isStyleLoaded()) await new Promise(r => map.once('style.load', r));

  // ---------- 레이어 ----------
  if (tilesInfo) {
    map.addSource('ortho', { type: 'raster', tiles: [T + '{z}/{x}/{y}.webp'], tileSize: 256,
      minzoom: tilesInfo.minzoom, maxzoom: tilesInfo.maxzoom, bounds: tilesInfo.bounds, attribution: '정사영상 © 국토지리정보원' });
    map.addLayer({ id: 'ortho', type: 'raster', source: 'ortho' });
  }
  map.addSource('adm2', { type: 'geojson', data: D + 'adm2_aoi.geojson', promoteId: 'id' });
  map.addSource('grw', { type: 'geojson', data: D + 'grw_solar_aoi.geojson' });
  map.addSource('det', { type: 'geojson', data: det, promoteId: 'id' });
  map.addSource('detpts', { type: 'geojson', data: D + `detect_pts_${run}.geojson`, promoteId: 'id' });

  map.addLayer({ id: 'adm-fill', type: 'fill', source: 'adm2', layout: { visibility: 'none' },
    paint: { 'fill-color': ['coalesce', ['feature-state', 'color'], 'rgba(0,0,0,0)'], 'fill-opacity': 0.6 } });
  map.addLayer({ id: 'adm-line', type: 'line', source: 'adm2', paint: { 'line-color': '#ffffff', 'line-opacity': 0.6, 'line-width': 1 } });
  map.addLayer({ id: 'adm-sel', type: 'line', source: 'adm2', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': '#ffd23f', 'line-width': 2.5 } });
  map.addLayer({ id: 'grw', type: 'line', source: 'grw', layout: { visibility: 'none' },
    paint: { 'line-color': '#4aa3ff', 'line-width': 2, 'line-dasharray': [2, 1] } });

  const NEW = css('--new') || '#22c55e', KNOWN = css('--known') || '#2d9cdb';
  const reviewColor = ['match', ['feature-state', 'review'], 'ok', '#ffffff', 'fp', '#ff4d4f', 'none'];
  map.addLayer({ id: 'det-fill', type: 'fill', source: 'det', minzoom: 13,
    paint: { 'fill-color': ['case', ['get', 'in_grw'], KNOWN, NEW], 'fill-opacity': 0.35 } });
  map.addLayer({ id: 'det-line', type: 'line', source: 'det', minzoom: 13,
    paint: { 'line-color': ['case', ['==', ['feature-state', 'review'], 'fp'], '#ff4d4f',
                            ['==', ['feature-state', 'review'], 'ok'], '#ffffff',
                            ['get', 'in_grw'], KNOWN, NEW],
             'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1, 18, 2.5] } });
  map.addLayer({ id: 'det-dot', type: 'circle', source: 'detpts', maxzoom: 13,
    paint: { 'circle-color': ['case', ['get', 'in_grw'], KNOWN, NEW],
             'circle-radius': ['interpolate', ['linear'], ['get', 'area_m2'], 10, 2.5, 300, 4, 3000, 7, 30000, 11],
             'circle-stroke-color': '#ffffff', 'circle-stroke-width': 0.8, 'circle-opacity': 0.9 } });

  const GROUPS = { ortho: ['ortho'], 'det-new': [], 'det-known': [], grw: ['grw'], adm: ['adm-line'] };
  document.querySelectorAll('[data-layer]').forEach(cb => cb.addEventListener('change', () => {
    if (cb.dataset.layer.startsWith('det-')) return applyFilter();
    for (const id of GROUPS[cb.dataset.layer]) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', cb.checked ? 'visible' : 'none');
  }));
  $('selBase').addEventListener('change', e => {
    map.setLayoutProperty('base-sat', 'visibility', e.target.value === 'sat' ? 'visible' : 'none');
    map.setLayoutProperty('base-osm', 'visibility', e.target.value === 'osm' ? 'visible' : 'none');
  });

  // ---------- 필터 (신뢰도, 신규/기존, 지역) ----------
  function applyFilter() {
    const showNew = document.querySelector('[data-layer="det-new"]').checked;
    const showKnown = document.querySelector('[data-layer="det-known"]').checked;
    const f = ['all', ['>=', ['get', 'prob'], state.prob],
      ['any', ['all', ['!', ['get', 'in_grw']], showNew], ['all', ['get', 'in_grw'], showKnown]]];
    if (state.adm2) f.push(['==', ['get', 'adm2'], state.adm2]);
    for (const id of ['det-fill', 'det-line', 'det-dot']) map.setFilter(id, f);
    renderPanel(); renderChoropleth();
  }
  $('rngProb').addEventListener('input', e => { state.prob = e.target.value / 100; $('lblProb').textContent = state.prob.toFixed(2); applyFilter(); writeHash(); });

  // ---------- 결과(모델) 선택 ----------
  const selRun = $('selRun');
  for (const r of summary.runs) selRun.add(new Option(r.label, r.key));
  selRun.value = run;
  const setProb = v => { state.prob = v; $('rngProb').value = Math.round(v * 100); $('lblProb').textContent = v.toFixed(2); };
  selRun.addEventListener('change', async () => {
    run = selRun.value;
    det = await fetch(D + `detect_${run}.geojson`).then(r => r.json());
    map.getSource('det').setData(det);
    map.getSource('detpts').setData(D + `detect_pts_${run}.geojson`);
    map.removeFeatureState({ source: 'det' });
    loadReview(); setProb(runs[run].th);
    const u = new URL(location.href); u.searchParams.set('run', run); history.replaceState(null, '', u);
    applyFilter(); writeHash(); map.once('idle', applyReviewStates);
  });
  $('regionRun').textContent = runs[run].label;

  // ---------- 지역 ----------
  const sel = $('selAdm2');
  for (const a of summary.adm2.filter(a => a.aoi).sort((x, y) => x.name.localeCompare(y.name))) sel.add(new Option(`${a.name} (${a.adm1_name})`, a.id));
  sel.addEventListener('change', () => {
    state.adm2 = sel.value;
    map.setFilter('adm-sel', ['==', ['get', 'id'], state.adm2]);
    const a = summary.adm2.find(x => x.id === state.adm2);
    const b = a ? a.aoi_bbox : summary.aoi_bbox;
    map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 40, duration: 800 });
    applyFilter(); writeHash();
  });

  // ---------- 패널 ----------
  function visible() {
    return det.features.filter(f => f.properties.prob >= state.prob && (!state.adm2 || f.properties.adm2 === state.adm2));
  }
  function stats(fs) {
    return { n: fs.length, area: fs.reduce((a, f) => a + f.properties.area_m2, 0),
      mwp: fs.reduce((a, f) => a + f.properties.kwp, 0) / 1000, new: fs.filter(f => !f.properties.in_grw).length };
  }
  function renderPanel() {
    const fs = visible(), s = stats(fs);
    $('regionName').textContent = state.adm2 ? adm2Name[state.adm2] : '탐지 영역 전체';
    $('regionNote').textContent = `정사영상 ${summary.sheets}도엽(약 ${fmt(summary.aoi_km2)} km²) · 신뢰도 ${state.prob.toFixed(2)} 이상`;
    $('kN').textContent = fmt(s.n); $('kNew').textContent = fmt(s.new);
    $('kArea').textContent = fmt(s.area); $('kMw').textContent = fmt(s.mwp, 2);
    const bySize = SIZE.map(k => [k, fs.filter(f => f.properties.size_class === k).length]);
    const max = Math.max(1, ...bySize.map(([, v]) => v));
    $('sizeBars').innerHTML = bySize.map(([k, v]) => `<div class="bar"><span>${k}</span><span class="track"><span class="fill" style="width:${100 * v / max}%"></span></span><span class="pct">${fmt(v)}</span></div>`).join('');
    const byAdm = {};
    for (const f of fs) { const k = f.properties.adm2; (byAdm[k] = byAdm[k] || []).push(f); }
    $('admTable').tBodies[0].innerHTML = Object.entries(byAdm).map(([k, v]) => [k, stats(v)]).sort((a, b) => b[1].mwp - a[1].mwp)
      .map(([k, st]) => `<tr data-adm="${k}"><td>${adm2Name[k] || '–'}</td><td>${fmt(st.n)}</td><td>${fmt(st.mwp, 2)}</td><td>${fmt(st.new)}</td></tr>`).join('')
      || '<tr><td colspan="4" class="muted">탐지 없음</td></tr>';
    $('regionRun').textContent = runs[run].label;
    renderReviewStats();
  }
  $('admTable').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-adm]'); if (!tr) return;
    sel.value = tr.dataset.adm; sel.dispatchEvent(new Event('change'));
  });

  // ---------- 단계구분도 (탐지 영역 안 시군구) ----------
  function renderChoropleth() {
    const legend = $('mapLegend');
    map.setLayoutProperty('adm-fill', 'visibility', state.metric ? 'visible' : 'none');
    if (!state.metric) { legend.hidden = true; return; }
    const fs = det.features.filter(f => f.properties.prob >= state.prob);
    const agg = {};
    for (const f of fs) { const k = f.properties.adm2; (agg[k] = agg[k] || []).push(f); }
    const vals = Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, stats(v)[state.metric]]));
    const max = Math.max(1e-9, ...Object.values(vals));
    try {
      map.removeFeatureState({ source: 'adm2' });
      for (const [k, v] of Object.entries(vals)) if (v > 0)
        map.setFeatureState({ source: 'adm2', id: k }, { color: RAMP[Math.min(4, Math.floor(Math.sqrt(v / max) * 5))] });
    } catch { map.once('idle', renderChoropleth); return; }
    const label = { n: '탐지 수', area: '패널 면적 (m²)', mwp: '추정 용량 (MWp)', new: '신규 발견 수' }[state.metric];
    legend.hidden = false;
    legend.innerHTML = `<div>${label}</div><div class="ramp">${RAMP.map(c => `<span style="background:${c}"></span>`).join('')}</div><div class="ends"><span>0</span><span>${fmt(max, max < 10 ? 2 : 0)}</span></div>`;
  }
  $('selMetric').addEventListener('change', e => { state.metric = e.target.value; renderChoropleth(); writeHash(); });

  // ---------- 검토 ----------
  function applyReviewStates() {
    for (const [id, v] of Object.entries(review)) {
      try { map.setFeatureState({ source: 'det', id }, { review: v }); } catch { }
    }
  }
  function renderReviewStats() {
    const v = Object.values(review);
    $('reviewStats').textContent = `맞음 ${v.filter(x => x === 'ok').length} · 오탐 ${v.filter(x => x === 'fp').length}`;
  }
  window.__setReview = (id, v) => {
    if (review[id] === v) { delete review[id]; map.removeFeatureState({ source: 'det', id }, 'review'); }
    else { review[id] = v; map.setFeatureState({ source: 'det', id }, { review: v }); }
    saveReview(); renderReviewStats(); popup.remove();
  };
  $('btnExport').addEventListener('click', () => {
    const feats = det.features.filter(f => review[f.properties.id]).map(f => ({ ...f, properties: { ...f.properties, review: review[f.properties.id] } }));
    const blob = new Blob([JSON.stringify({ type: 'FeatureCollection', features: feats })], { type: 'application/geo+json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'pv_review.geojson'; a.click();
  });

  // ---------- 팝오버 ----------
  $('chkPopover').addEventListener('change', e => state.popover = e.target.checked);
  const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '300px' });
  const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
  const clickable = ['det-fill', 'det-dot', 'adm-fill'];
  map.on('click', e => {
    if (!state.popover) return;
    const f = map.queryRenderedFeatures(e.point, { layers: clickable.filter(id => map.getLayoutProperty(id, 'visibility') !== 'none') })[0];
    if (!f) return;
    const p = f.properties;
    let html;
    if (f.layer.id === 'adm-fill') {
      const st = stats(det.features.filter(x => x.properties.adm2 === p.id && x.properties.prob >= state.prob));
      html = `<div class="pop"><h4>${p.name}</h4><table>${row('탐지', fmt(st.n) + '곳')}${row('추정 용량', fmt(st.mwp, 2) + ' MWp')}${row('신규', fmt(st.new) + '곳')}</table></div>`;
    } else {
      const inGrw = p.in_grw === true || p.in_grw === 'true';
      html = `<div class="pop"><h4>태양광 탐지 · ${inGrw ? 'GRW와 일치' : '신규 발견'}</h4><table>
        ${row('위치', adm2Name[p.adm2] || '–')}
        ${row('패널 면적', fmt(p.area_m2) + ' m²')}
        ${row('추정 용량', fmt(p.kwp, 1) + ' kWp')}
        ${row('규모', p.size_class)}
        ${row('모델 신뢰도', Number(p.prob).toFixed(2))}
        ${row('직사각형도', Number(p.rectangularity).toFixed(2))}
        ${row('검토', review[p.id] === 'ok' ? '맞음' : review[p.id] === 'fp' ? '오탐' : '미검토')}</table>
        <div class="pop-actions"><button type="button" onclick="__setReview('${p.id}','ok')">맞음</button>
        <button type="button" onclick="__setReview('${p.id}','fp')">오탐</button></div></div>`;
    }
    popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
  });
  for (const id of clickable) {
    map.on('mouseenter', id, () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', id, () => map.getCanvas().style.cursor = '');
  }

  // ---------- 패널 접기 / 공유 / 주소 ----------
  $('btnPanel').addEventListener('click', e => {
    const p = $('panel'); p.classList.toggle('collapsed');
    e.target.textContent = p.classList.contains('collapsed') ? '⟩' : '⟨';
    setTimeout(() => map.resize(), 220);
  });
  function writeHash() {
    const c = map.getCenter();
    history.replaceState(null, '', `#${map.getZoom().toFixed(2)}/${c.lat.toFixed(5)}/${c.lng.toFixed(5)}/${state.prob}/${state.metric}/${state.adm2}`);
  }
  map.on('moveend', writeHash);
  $('btnShare').addEventListener('click', async e => {
    writeHash();
    try { await navigator.clipboard.writeText(location.href); e.target.textContent = '복사됨'; } catch { e.target.textContent = '주소창 복사'; }
    setTimeout(() => e.target.textContent = '위치 공유', 1500);
  });

  // ---------- 초기화 ----------
  if (hash.length >= 3 && hash.slice(0, 3).every(v => v !== '' && isFinite(v))) {
    map.jumpTo({ zoom: +hash[0], center: [+hash[2], +hash[1]] });
    if (hash[3]) setProb(+hash[3]);
    state.metric = hash[4] || ''; $('selMetric').value = state.metric;
    state.adm2 = hash[5] || ''; sel.value = state.adm2; map.setFilter('adm-sel', ['==', ['get', 'id'], state.adm2]);
  } else {
    const b = summary.aoi_bbox; map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 30, duration: 0 });
    setProb(state.prob);
  }
  applyFilter();
  map.on('sourcedata', e => { if (e.sourceId === 'det' && e.isSourceLoaded) applyReviewStates(); });
  map.once('idle', applyReviewStates);
})();
