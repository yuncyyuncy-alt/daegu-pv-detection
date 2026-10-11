/* 결과 포털 — /report_data/report.json 을 읽어 요약·평가·갤러리를 그린다 (build_report_data.py가 만든다). */
(async function () {
  const R = await fetch('report_data/report.json').then(r => r.json());
  const $ = id => document.getElementById(id);
  const fmt = (v, d = 0) => v == null || isNaN(v) ? '–' : Number(v).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const runs = Object.fromEntries(R.runs.map(r => [r.key, r]));
  const final = runs[R.default_run];
  const runShort = k => runs[k] ? runs[k].label.split(' · ')[0] : k;
  const atlasUrl = (run, lon, lat, z = 18) => `atlas/?run=${run}` + (lon != null ? `#${z}/${lat}/${lon}/${runs[run].th}//` : '');

  // ---------- 요약 ----------
  $('hSheets').textContent = R.area.sheets;
  $('hKm2').textContent = fmt(R.area.km2);
  $('hGrw').textContent = R.area.grw_in_aoi;
  const kpi = (l, v, u, hl) => `<div class="kpi${hl ? ' hl' : ''}"><div class="l">${l}</div><span class="v">${v}</span><span class="u">${u}</span></div>`;
  $('kpis').innerHTML = [
    kpi('탐지된 태양광', fmt(final.n), '곳', true),
    kpi('GRW에 없던 신규', fmt(final.new), '곳', true),
    kpi('패널 면적', fmt(final.area_m2), 'm²'),
    kpi('추정 설비 용량', fmt(final.mwp, 1), 'MWp'),
    kpi('조사 영역', fmt(R.area.km2), `km² · ${R.area.sheets}도엽`),
  ].join('');

  // ---------- 결과 비교 ----------
  $('runTable').tBodies[0].innerHTML = R.runs.map(r => `<tr class="${r.key === R.default_run ? 'sel' : ''}">
    <td>${esc(r.label)}</td><td>${r.th.toFixed(2)}</td><td>${fmt(r.n)}</td><td>${fmt(r.new)}</td>
    <td>${fmt(r.area_m2)}</td><td>${fmt(r.mwp, 1)}</td><td><a href="${atlasUrl(r.key)}">지도 ↗</a></td></tr>`).join('');

  // ---------- 방법 ----------
  const ds = R.dataset, base = R.training.base;
  $('dsInfo').textContent = `(${ds.name}, ${fmt(ds.samples)} 샘플: 학습 ${fmt(ds.train)} / 검증 ${fmt(ds.val)})`;
  if (base.length) $('baseIou').textContent = Math.max(...base.map(e => e.iou)).toFixed(3);

  // ---------- 평가 ----------
  $('eFp').textContent = R.eval.n_fp; $('eOk').textContent = R.eval.n_ok;
  $('evalTable').tBodies[0].innerHTML = R.eval.rows.map(e => `<tr class="${runs[e.run] && runs[e.run].th === e.th ? 'sel' : ''}">
    <td>${runShort(e.run)}</td><td>≥ ${e.th.toFixed(2)}</td><td>${fmt(e.n)}</td>
    <td>${e.fp_left} / ${R.eval.n_fp}</td><td>${e.ok_kept} / ${R.eval.n_ok}</td><td>${e.precision.toFixed(2)}</td><td>${fmt(e.mwp, 1)}</td></tr>`).join('');

  // 학습 곡선 (단일 계열: 범례 없이 제목이 이름)
  const tip = $('tip');
  function drawCurve() {
    const el = $('curve'); if (!base.length) { el.textContent = '학습 기록 없음'; return; }
    const W = Math.max(320, el.clientWidth), H = 220, m = { l: 40, r: 20, t: 14, b: 28 };
    const x = e => m.l + (e - 1) / (base.length - 1) * (W - m.l - m.r);
    const lo = Math.max(0, Math.floor((Math.min(...base.map(e => e.iou)) - 0.05) * 10) / 10);
    const y = v => m.t + (1 - (v - lo) / (1 - lo)) * (H - m.t - m.b);
    const best = base.reduce((a, b) => b.iou > a.iou ? b : a);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="에폭별 검증 IoU">`;
    for (const v of [0, 1, 2, 3, 4].map(i => lo + (1 - lo) * i / 4)) s += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><g class="axis"><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(2)}</text></g>`;
    for (const e of base) s += `<g class="axis"><text x="${x(e.epoch)}" y="${H - 8}" text-anchor="middle">${e.epoch}</text></g>`;
    s += `<path class="ln" d="${base.map((e, i) => (i ? 'L' : 'M') + x(e.epoch) + ',' + y(e.iou)).join('')}"/>`;
    s += `<line class="xh" id="xh" y1="${m.t}" y2="${H - m.b}" visibility="hidden"/>`;
    for (const e of base) s += `<circle class="dot${e === best ? ' best' : ''}" cx="${x(e.epoch)}" cy="${y(e.iou)}" r="4"/>`;
    const anc = best.epoch > base.length * 0.8 ? 'end' : best.epoch < base.length * 0.2 ? 'start' : 'middle';
    s += `<text class="lbl" x="${x(best.epoch)}" y="${y(best.iou) + 22}" text-anchor="${anc}">최고 ${best.iou.toFixed(3)}</text>`;
    const step = (W - m.l - m.r) / (base.length - 1);
    for (const e of base) s += `<rect class="hit" data-e="${e.epoch}" x="${x(e.epoch) - step / 2}" y="${m.t}" width="${step}" height="${H - m.t - m.b}"/>`;
    el.innerHTML = s + '</svg>';
    const xh = el.querySelector('#xh');
    el.querySelectorAll('.hit').forEach(r => {
      r.addEventListener('mousemove', ev => {
        const e = base[+r.dataset.e - 1];
        xh.setAttribute('x1', x(e.epoch)); xh.setAttribute('x2', x(e.epoch)); xh.setAttribute('visibility', 'visible');
        tip.hidden = false; tip.innerHTML = `에폭 ${e.epoch}<br>검증 IoU <b>${e.iou.toFixed(3)}</b><br>손실 ${e.loss.toFixed(3)}`;
        tip.style.left = Math.min(ev.clientX + 12, innerWidth - 150) + 'px'; tip.style.top = ev.clientY + 12 + 'px';
      });
      r.addEventListener('mouseleave', () => { tip.hidden = true; xh.setAttribute('visibility', 'hidden'); });
    });
  }
  drawCurve(); addEventListener('resize', drawCurve);
  $('curveTable').tBodies[0].innerHTML = base.map(e => `<tr><td>${e.epoch}</td><td>${e.loss.toFixed(3)}</td><td>${e.iou.toFixed(3)}</td></tr>`).join('');
  const ft = (k) => R.training[k].length ? R.training[k][R.training[k].length - 1].iou.toFixed(3) : '–';
  $('curveNote').textContent = `추가학습 후 데이터셋 IoU — 2차 ${ft('ft_r2')}, 3차 ${ft('ft_r3')}`;

  // ---------- 검증 사례 ----------
  $('figs').innerHTML = R.images.map(im => `<figure class="fig${im.file.startsWith('sheet') ? ' wide' : ''}">
    <img src="report_data/img/${im.file}" alt="${esc(im.caption)}" loading="lazy" data-cap="${esc(im.caption)}">
    <figcaption>${esc(im.caption)}</figcaption></figure>`).join('');
  const lb = $('lightbox');
  $('figs').addEventListener('click', e => {
    const img = e.target.closest('img'); if (!img) return;
    lb.querySelector('img').src = img.src; lb.querySelector('p').textContent = img.dataset.cap; lb.hidden = false;
  });
  lb.addEventListener('click', () => lb.hidden = true);
  addEventListener('keydown', e => { if (e.key === 'Escape') lb.hidden = true; });

  // ---------- 갤러리 ----------
  const names = R.adm2_names;
  $('galRun').textContent = `— ${runs[R.gallery_run].label}, 신뢰도 ≥ ${runs[R.gallery_run].th.toFixed(2)}`;
  const adms = [...new Set(R.gallery.map(g => g.adm2))].filter(Boolean).sort((a, b) => (names[a] || '').localeCompare(names[b] || ''));
  for (const a of adms) $('gAdm').add(new Option(names[a] || a, a));
  for (const s of [...new Set(R.gallery.map(g => g.size))]) $('gSize').add(new Option(s, s));
  const PAGE = 48; let shown = PAGE, list = [];
  function filterGallery() {
    const a = $('gAdm').value, z = $('gSize').value, srt = $('gSort').value;
    list = R.gallery.filter(g => (!a || g.adm2 === a) && (!z || g.size === z));
    if (srt === 'prob') list.sort((p, q) => q.prob - p.prob);
    else if (srt === 'probAsc') list.sort((p, q) => p.prob - q.prob);
    else list.sort((p, q) => q.area - p.area);
    shown = PAGE; renderGallery();
  }
  function renderGallery() {
    $('grid').innerHTML = list.slice(0, shown).map(g => `<a class="card" href="${atlasUrl(R.gallery_run, g.lon, g.lat)}" title="지도에서 보기">
      <img src="report_data/thumbs/${g.id}.jpg" alt="탐지 ${g.id}" loading="lazy">
      <div class="meta"><b>${fmt(g.area)} m²</b> · ${fmt(g.kwp)} kWp<br>${esc(names[g.adm2] || '영역 밖')} · 신뢰도 ${g.prob.toFixed(2)}${g.grw ? ' · GRW 일치' : ''}</div></a>`).join('');
    $('gCount').textContent = `${fmt(Math.min(shown, list.length))} / ${fmt(list.length)}곳 표시`;
    $('gMore').hidden = shown >= list.length;
  }
  ['gAdm', 'gSize', 'gSort'].forEach(id => $(id).addEventListener('change', filterGallery));
  $('gMore').addEventListener('click', () => { shown += PAGE; renderGallery(); });
  filterGallery();

  // ---------- 지역별 ----------
  const rows = R.adm2[R.default_run] || [];
  const maxMw = Math.max(1e-9, ...rows.map(r => r.mwp));
  $('admTable').tBodies[0].innerHTML = rows.map(r => `<tr><td>${esc(r.name)}</td><td>${fmt(r.n)}</td><td>${fmt(r.area)}</td><td>${fmt(r.mwp, 2)}</td>
    <td><div class="hbar" style="width:${100 * r.mwp / maxMw}%"></div></td></tr>`).join('');

  // ---------- 내려받기 ----------
  const dlName = f => {
    const m = f.match(/^pv_detect_(r\d)\.geojson$/);
    if (m) return `탐지 결과 — ${runs[m[1]] ? runs[m[1]].label : m[1]}`;
    return { 'review_round1.geojson': '직접 판정 전체 (맞음/오탐)', 'review_train.geojson': '판정 — 추가학습용', 'review_test.geojson': '판정 — 평가용' }[f] || f;
  };
  $('downloads').innerHTML = R.downloads.map(f => `<li><a href="report_data/downloads/${f}" download>${esc(dlName(f))}</a> <span class="muted">${f}</span></li>`).join('');
  $('foot').textContent = `자료 생성 ${R.built} · 정사영상 © 국토지리정보원`;
})();
