/* 화면. 숫자는 ledger.js, 그림은 charts.js. */
(function () {
  'use strict';

  const J = window.Jangbu;
  const C = window.Charts;
  const esc = J.escHtml;
  const DEMO = new URLSearchParams(location.search).get('demo') === '1';

  const SHEET_ID = (function () {
    const m = /[#&]k=([A-Za-z0-9_-]{20,})/.exec(location.hash || '');
    if (m) { try { localStorage.setItem('jangbuSheet', m[1]); } catch (e) {} return m[1]; }
    try { return localStorage.getItem('jangbuSheet') || ''; } catch (e) { return ''; }
  })();

  const SHEET_GIDS = { '학생 명단': '0', '통장거래내역': '1723542002', '휴원 기록': '739493373' };
  const BANK_UPLOAD_API = window.LEDGER_BANK_UPLOAD_API || 'http://127.0.0.1:8787/api/upload-bank';
  const CAT_QUEUE_API = window.LEDGER_CAT_QUEUE_API || 'http://127.0.0.1:8787/api/queue-cat-overrides';
  const CAT_PENDING_API = window.LEDGER_CAT_PENDING_API || 'http://127.0.0.1:8787/api/pending-cat-overrides';
  const EX_KEY = 'jangbu_unpaid_excluded_v1';

  function emptyData() {
    return {
      title: '엄궁 코오롱 공부방', scope: '', note: '', updated: '', latestFeeMonth: '',
      totals: { income: 0, expense: 0, fee: 0 }, months: [], monthDetails: {}, suji: {},
      tuition: {}, billMonths: [], enroll: {}, students: [], issues: [], restMonths: []
    };
  }

  let DATA = emptyData();
  if (!DEMO) {
    try {
      const c = JSON.parse(localStorage.getItem('jangbuCache') || 'null');
      if (c && c.monthDetails) DATA = c;
    } catch (e) {}
  }

  let demoSaved = {};
  let booting = !DEMO && !(DATA.monthDetails && Object.keys(DATA.monthDetails).length);
  let state = {
    tab: 'sales', month: null, view: 'list', salesView: 'list', sujiView: 'list',
    feeMonth: null, bankMonth: null, dirFilt: 'all', feeFilt: 'unpaid',
    stuFlowYm: null, stuView: 'list', q: '', confirm: null, showExcluded: false, peek: null
  };
  let focusMem = null;

  const $ = function (id) { return document.getElementById(id); };

  function hasData() { return DATA.months && DATA.months.length; }

  function loadSaved() {
    if (DEMO) return demoSaved;
    try { return JSON.parse(localStorage.getItem(EX_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function saveSaved(map) {
    const only = {};
    Object.keys(map || {}).forEach(function (k) {
      const v = map[k];
      if (v && v.ym && v.name && !v.sheet && !v.session) only[v.ym + '|' + v.name] = { ym: v.ym, name: v.name, at: v.at || '' };
    });
    if (DEMO) { demoSaved = only; return; }
    try { localStorage.setItem(EX_KEY, JSON.stringify(only)); } catch (e) {}
  }
  function currentExcluded() { return J.excludedMap(DATA, loadSaved()); }
  function excludePair(ym, name) {
    const m = loadSaved();
    m[ym + '|' + name] = { ym: ym, name: name, at: new Date().toISOString() };
    saveSaved(m);
  }
  function restorePair(ym, name) {
    const m = loadSaved();
    delete m[ym + '|' + name];
    saveSaved(m);
  }

  function setSyncStatus(msg) { const s = $('syncStatus'); if (s) s.textContent = msg || ''; }

  function showBanner(text, kind) {
    const box = $('staleBanner');
    if (!box) return;
    if (!text) {
      box.hidden = true;
      box.textContent = '';
      box.className = 'stale-banner';
      return;
    }
    box.hidden = false;
    box.className = 'stale-banner' + (kind && kind !== 'warn' ? ' ' + kind : '');
    box.textContent = text;
  }

  function setUploadStatus(msg, kind) {
    window.__bankUploadStatus = msg ? { msg: msg, kind: kind || '' } : null;
    const box = $('uploadStatus');
    if (!box) return;
    box.hidden = !msg;
    box.className = 'upload-status' + (kind ? ' ' + kind : '');
    box.innerHTML = msg || '';
  }
  function restoreUploadStatus() {
    const st = window.__bankUploadStatus;
    const box = $('uploadStatus');
    if (!box || !st) return;
    box.hidden = !st.msg;
    box.className = 'upload-status' + (st.kind ? ' ' + st.kind : '');
    box.innerHTML = st.msg || '';
  }

  async function queueCatOverrideItem(item) {
    try {
      const res = await fetch(CAT_QUEUE_API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [item] })
      });
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true, data: await res.json().catch(function () { return null; }) };
    } catch (err) {
      return { ok: false, error: String(err && err.message || err) };
    }
  }
  void queueCatOverrideItem;

  async function checkPendingCatOverrides() {
    if (DEMO) { setUploadStatus('데모 모드라 분류 대기 서버는 호출하지 않습니다.', ''); return; }
    try {
      const res = await fetch(CAT_PENDING_API);
      if (!res.ok) { setUploadStatus('분류 시트 대기 확인 실패 · HTTP ' + res.status, 'err'); return; }
      const data = await res.json();
      const n = (data && data.items && data.items.length) || 0;
      const st = (data && data.status) || 'pending';
      setUploadStatus('분류 수정 시트 대기 <b>' + n + '</b>건 · 상태 ' + esc(st) + '. Master에게 «분류 시트 반영»이라고 하면 구글 시트에 씁니다. (아직 시트에 쓰지 않았습니다.)', n ? 'ok' : '');
    } catch (err) {
      setUploadStatus('분류 시트 대기 확인 실패 · 서버에 연결할 수 없어요.', 'err');
    }
  }

  function bindBankUpload() {
    const btn = $('bankUploadBtn');
    const input = $('bankUploadInput');
    const catBtn = $('catPendingCheckBtn');
    if (btn && input) btn.onclick = function () { input.click(); };
    if (catBtn) catBtn.onclick = function () { checkPendingCatOverrides(); };
    restoreUploadStatus();
    if (!input || input.dataset.bound === '1') return;
    input.dataset.bound = '1';
    input.onchange = async function () {
      const files = input.files ? Array.from(input.files) : [];
      input.value = '';
      if (!files.length) return;
      if (DEMO) { setUploadStatus('데모 모드라 파일은 서버로 보내지 않습니다.', ''); return; }
      const isBank = function (f) { return /\.(csv|xlsx|xls)$/i.test(f.name); };
      const isJson = function (f) { return /\.json$/i.test(f.name); };
      const isImg = function (f) { return /\.(jpg|jpeg|png|webp|bmp|tif|tiff|pdf)$/i.test(f.name) || (f.type || '').startsWith('image/') || f.type === 'application/pdf'; };
      const isDongName = function (f) { return /동백|dong/i.test(f.name); };
      const banks = files.filter(isBank);
      const jsons = files.filter(isJson);
      const imgs = files.filter(function (f) { return !isBank(f) && !isJson(f) && isImg(f); });
      const other = files.filter(function (f) { return !isBank(f) && !isJson(f) && !isImg(f); });
      if (banks.length !== 1) {
        setUploadStatus('통장 파일은 CSV 또는 엑셀(.xlsx) <b>한 개</b>를 꼭 골라 주세요.' + (banks.length ? ' (지금 ' + banks.length + '개)' : ''), 'err');
        return;
      }
      const bank = banks[0];
      if (/\.xls$/i.test(bank.name) && !/\.xlsx$/i.test(bank.name)) {
        setUploadStatus('<b>' + esc(bank.name) + '</b> · 구형 .xls는 안 됩니다. .xlsx 또는 CSV로 저장해 주세요.', 'err');
        return;
      }
      let card = null, dong = null;
      jsons.forEach(function (f) {
        if (isDongName(f) && !dong) dong = f;
        else if (!card) card = f;
        else if (!dong) dong = f;
      });
      if (!dong && jsons.length >= 2) { card = jsons[0]; dong = jsons[1]; }
      const names = [bank.name].concat(card ? [card.name] : []).concat(dong ? [dong.name] : []).concat(imgs.map(function (f) { return f.name; }));
      setUploadStatus('<b>' + esc(names.join(' · ')) + '</b> 올리는 중…' + (imgs.length ? '<br/>이미지 ' + imgs.length + '장 서버 OCR 중(첫 장은 조금 걸릴 수 있어요)' : ''));
      try {
        const body = new FormData();
        body.append('bank', bank, bank.name);
        if (card) body.append('card', card, card.name);
        if (dong) body.append('dong', dong, dong.name);
        imgs.forEach(function (f) { body.append('evidence', f, f.name); });
        const res = await fetch(BANK_UPLOAD_API, { method: 'POST', body: body });
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch (_) {}
        if (!res.ok) {
          const detail = (data && (data.detail || data.message)) || text.slice(0, 160) || res.statusText;
          setUploadStatus('<b>' + esc(bank.name) + '</b> 업로드 실패 · ' + esc(detail), 'err');
          return;
        }
        const incN = (data && data.income_expense && data.income_expense.rows && data.income_expense.rows.length) || 0;
        const feeN = (data && data.tuition && data.tuition.rows && data.tuition.rows.length) || 0;
        const qn = (data && data.question_pending) || 0;
        const inn = (data && data.inputs) || {};
        const sa = (data && data.sheet_apply) || {};
        const saLine = (sa.status && sa.status !== 'error')
          ? ('<br/>시트 반영 계획 준비됨 · 업데이트 ' + (sa.updates || 0) + '건 · 추가 ' + (sa.appends || 0) + '건' + (sa.skipped_questions ? ' · 질문 스킵 ' + sa.skipped_questions + '건' : '') + '. 마스터에게 «시트 반영»이라고 말해 주세요. (아직 시트에 쓰지 않았습니다.)')
          : (sa.status === 'error' ? ('<br/>시트 반영 계획 생성 실패 · ' + esc(sa.error || '오류') + ' · 분석 결과는 유지됩니다.') : '<br/>시트 반영은 마스터에게 «시트 반영»을 요청해 주세요. (아직 시트에 쓰지 않았습니다.)');
        setUploadStatus(
          '<b>' + esc(bank.name) + '</b> 분석 완료 · 수입지출 ' + incN + '건 · 교습비 ' + feeN + '건'
          + (qn ? ' · 확인 질문 ' + qn + '개' : '')
          + (inn.card_rows ? ' · 카드힌트 ' + inn.card_rows + '건' : '')
          + (inn.dong_rows ? ' · 동백힌트 ' + inn.dong_rows + '건' : '')
          + (inn.ocr_card_rows || inn.ocr_dong_rows ? ' · OCR 카드 ' + (inn.ocr_card_rows || 0) + '/동백 ' + (inn.ocr_dong_rows || 0) : (imgs.length ? ' · 이미지 ' + imgs.length + '장' : ''))
          + (other.length ? ' · 기타 ' + other.length + '개 제외' : '')
          + '.' + saLine,
          'ok'
        );
      } catch (err) {
        setUploadStatus('<b>' + esc(bank.name) + '</b> 선택됨 · 분석 서버에 연결하지 못했습니다. 채팅에 같은 파일을 보내 주시면 이어서 반영할 수 있습니다.', 'err');
      }
    };
  }

  function captureFocus() {
    const a = document.activeElement;
    if (a && a.id && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) {
      focusMem = { id: a.id, s: a.selectionStart, e: a.selectionEnd };
    } else focusMem = null;
  }
  function restoreFocus() {
    if (!focusMem) return;
    const n = $(focusMem.id);
    if (!n) return;
    n.focus();
    try { n.setSelectionRange(focusMem.s, focusMem.e); } catch (e) {}
  }

  function applyTabUI() {
    document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === state.tab); });
    document.querySelectorAll('.panel').forEach(function (p) { p.classList.toggle('on', p.id === 'panel-' + state.tab); });
  }
  function setTab(name) {
    state.tab = name;
    state.view = 'list';
    state.month = null;
    state.salesView = 'list';
    state.sujiView = 'list';
    state.stuFlowYm = null;
    state.stuView = 'list';
    state.peek = null;
    state.confirm = null;
    if (name === 'fee') { state.feeFilt = 'unpaid'; state.feeMonth = '__all_unpaid__'; state.q = ''; state.showExcluded = false; }
    if (name === 'months') { state.dirFilt = 'all'; state.q = ''; }
    if (name === 'bank') {
      const keys = Object.keys(DATA.monthDetails || {}).sort();
      if (!state.bankMonth || keys.indexOf(state.bankMonth) < 0) state.bankMonth = keys.length ? keys[keys.length - 1] : null;
      state.dirFilt = 'all'; state.q = '';
    }
    applyTabUI();
    render();
  }

  function goMonthDetail(ym, dir, fromChart) {
    state.tab = 'months';
    state.view = 'detail';
    state.month = ym;
    state.dirFilt = dir || 'all';
    state.q = '';
    state._monthsFromChart = !!fromChart;
    applyTabUI();
    render();
  }
  function goFeeMonth(ym) {
    state.tab = 'fee';
    state.feeMonth = ym;
    state.feeFilt = J.isFeeMonthOpen(ym) ? 'unpaid' : 'paid';
    state.q = '';
    state.showExcluded = false;
    state.confirm = null;
    applyTabUI();
    render();
  }
  function goSalesChartDetail() { state.tab = 'sales'; state.salesView = 'detail'; applyTabUI(); render(); }
  function goMonthsChartDetail() { state.tab = 'months'; state.view = 'chartDetail'; state.month = null; applyTabUI(); render(); }
  function goSujiChartDetail() { state.tab = 'suji'; state.sujiView = 'chartDetail'; applyTabUI(); render(); }
  function goStudentChartDetail() { state.tab = 'students'; state.stuView = 'chartDetail'; state.stuFlowYm = null; applyTabUI(); render(); }
  function openPeek(name) { if (!name) return; state.peek = name; render(); }

  function pinRight(node) {
    if (!node) return;
    const go = function () { node.scrollLeft = node.scrollWidth; };
    go();
    requestAnimationFrame(function () { requestAnimationFrame(go); });
  }
  function bindChartHDrag(sc) {
    if (!sc || sc.dataset.dragBound === '1') return;
    sc.dataset.dragBound = '1';
    let down = false, startX = 0, startLeft = 0, moved = false;
    sc.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      down = true; moved = false; startX = e.clientX; startLeft = sc.scrollLeft;
      try { sc.setPointerCapture(e.pointerId); } catch (_) {}
    });
    sc.addEventListener('pointermove', function (e) {
      if (!down) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) moved = true;
      sc.scrollLeft = startLeft - dx;
    });
    const end = function () {
      if (!down) return;
      down = false;
      if (moved) {
        const sink = function (ev) { ev.stopPropagation(); ev.preventDefault(); sc.removeEventListener('click', sink, true); };
        sc.addEventListener('click', sink, true);
      }
    };
    sc.addEventListener('pointerup', end);
    sc.addEventListener('pointercancel', end);
  }
  function bindSearch(id) {
    const qi = $(id);
    if (!qi) return;
    qi.oninput = function () {
      state.q = qi.value;
      clearTimeout(window._qt);
      window._qt = setTimeout(render, 180);
    };
  }
  function legend(items) {
    return '<div class="legend">' + items.map(function (it) {
      return '<span><i style="background:' + it.color + '"></i>' + esc(it.label) + '</span>';
    }).join('') + '</div>';
  }
  function chartCard(opts) {
    return '<div class="chart-card ' + (opts.summary ? 'summary' : 'detail') + '" id="' + opts.id + '">'
      + (opts.hint ? '<div class="chart-hint">' + opts.hint + '</div>' : '')
      + '<div class="chart-scroll" id="' + opts.scrollId + '">' + opts.svg + '</div>'
      + legend(opts.legend || [])
      + '</div>';
  }

  function donutParts(kids) {
    return (kids || []).map(function (k) {
      return { name: k.name || '기타', amt: Number(k.amt) || 0, abs: Math.abs(Number(k.amt) || 0), kids: k.kids || [] };
    }).filter(function (k) { return k.abs > 0; }).sort(function (a, b) { return b.abs - a.abs; });
  }
  function pctText(p) { return (p >= 10 || p === 0) ? p.toFixed(0) : p.toFixed(1); }
  function donutBlock(title, kids, offset) {
    const parts = donutParts(kids);
    const total = parts.reduce(function (s, p) { return s + p.abs; }, 0);
    const colors = C.DONUT_COLORS.map(function (_, i) { return C.DONUT_COLORS[(i + (offset || 0)) % C.DONUT_COLORS.length]; });
    const legendHtml = parts.length ? parts.map(function (p, i) {
      const pct = total ? p.abs / total * 100 : 0;
      const subs = (p.kids || []).filter(function (k) { return Math.abs(Number(k.amt) || 0) > 0; })
        .sort(function (a, b) { return Math.abs(b.amt) - Math.abs(a.amt); })
        .map(function (k) {
          const kp = total ? Math.abs(Number(k.amt) || 0) / total * 100 : 0;
          return '<div class="subrow"><span>' + esc(k.name) + '</span><span>' + J.won(k.amt) + ' · ' + pctText(kp) + '%</span></div>';
        }).join('');
      const btn = (p.kids || []).length ? '<button type="button" class="detail-btn">상세</button>' : '<span></span>';
      return '<div class="item foldable" data-fold="' + i + '"><span class="sw" style="background:' + colors[i % colors.length] + '"></span><div><div>' + esc(p.name) + '</div><div class="m">' + J.won(p.amt) + '</div></div><div class="pct">' + pctText(pct) + '%</div>' + btn + (subs ? '<div class="sub">' + subs + '</div>' : '') + '</div>';
    }).join('') : '<div class="empty">항목 없음</div>';
    return '<div class="card donut-block"><h2>' + esc(title) + (total ? ' · ' + J.won(total) : '') + '</h2><div class="donut-grid">' + C.donutSVG(parts, colors) + '<div class="donut-legend">' + legendHtml + '</div></div></div>';
  }
  function bindFolds(root) {
    (root || document).querySelectorAll('.donut-legend').forEach(function (legendEl) {
      legendEl.querySelectorAll('.item.foldable').forEach(function (item) {
        item.addEventListener('click', function (e) {
          e.stopPropagation();
          const was = item.classList.contains('open');
          legendEl.querySelectorAll('.item.foldable.open').forEach(function (x) { x.classList.remove('open'); });
          legendEl.querySelectorAll('.detail-btn').forEach(function (b) { b.textContent = '상세'; });
          if (!was) {
            item.classList.add('open');
            const b = item.querySelector('.detail-btn');
            if (b) b.textContent = '접기';
          }
        });
      });
    });
  }
  function bindDetail(toggleId, panelId) {
    const btn = $(toggleId), panel = $(panelId);
    if (!btn || !panel) return;
    btn.onclick = function (e) {
      e.stopPropagation();
      if (panel.hasAttribute('hidden')) { panel.removeAttribute('hidden'); btn.textContent = '접기'; }
      else { panel.setAttribute('hidden', ''); btn.textContent = '상세보기'; }
    };
  }

  function monthBar(m) {
    const inc = Math.max(0, Number(m.income) || 0);
    const exp = Math.max(0, Number(m.expense) || 0);
    const s = inc + exp || 1;
    return '<div class="bar"><i class="i" style="width:' + (inc / s * 100) + '%"></i><i class="e" style="width:' + (exp / s * 100) + '%"></i></div>';
  }
  function emptyBox(msg) { return '<div class="empty">' + esc(msg) + '</div>'; }
function plusWon(n) {
  const v = Math.round(Number(n) || 0);
  return (v > 0 ? '+' : '') + J.won(v);
}
function minusWon(n) {
  const v = Math.round(Number(n) || 0);
  return v > 0 ? ('−' + J.won(v)) : J.won(v);
}
  function backBtn(id, label) { return '<button type="button" class="back" id="' + id + '">' + label + '</button>'; }

  function sliceYm(points, end) {
    const yms = J.filterYtdYms(points.map(function (p) { return p.ym; }), end);
    const set = {};
    yms.forEach(function (ym) { set[ym] = 1; });
    return points.filter(function (p) { return set[p.ym]; });
  }

  function peekHtml() {
    if (!state.peek) return '';
    const name = state.peek;
    const s = (DATA.students || []).find(function (x) { return x && x.name === name; });
    const eg = s ? J.effectiveGrade(s, J.prevYmSeoul(), DATA) : null;
    const hist = J.studentHistory(DATA, name, currentExcluded());
    const rows = hist.length ? hist.map(function (h) {
      const col = h.status === '납부' ? 'var(--fee)' : (h.status === '미납' ? 'var(--warn)' : 'var(--muted)');
      const amt = h.status === '납부' ? J.won(h.amt) : (h.expected ? J.won(h.expected) : '');
      return '<div class="line"><div><div>' + esc(J.longYmLabel(h.ym)) + '</div><div class="m">' + esc(h.day ? h.day.slice(5) : h.status) + '</div></div><div class="a" style="color:' + col + '">' + esc(h.status) + (amt ? ' · ' + amt : '') + '</div></div>';
    }).join('') : emptyBox('납부 기록이 없습니다');
    return '<div class="modal-bg" id="peekBg"><div class="modal"><h3>' + esc(name) + '</h3><p>' + esc(s ? ((eg && eg.label) || s.grade || '') + ' · ' + (s.status || '') + (s.school ? ' · ' + s.school : '') : '명단 밖 · 납부 기록만 있습니다') + '</p><div class="history">' + rows + '</div><div class="acts" style="margin-top:12px"><button type="button" class="cancel" id="peekClose">닫기</button></div></div></div>';
  }
  function bindPeek() {
    const bg = $('peekBg');
    if (!bg) return;
    $('peekClose').onclick = function () { state.peek = null; render(); };
    bg.onclick = function (e) { if (e.target.id === 'peekBg') { state.peek = null; render(); } };
  }

  function renderIssues() {
    const box = $('feeIssues');
    if (!box) return;
    const L = DATA.issues || [];
    if (!L.length) { box.innerHTML = ''; return; }
    const open = !!window.__issuesOpen;
    box.innerHTML = '<div class="issues"><div class="head" id="issuesToggle"><span>시트에서 채워야 할 교습비 행 ' + L.length + '건</span><span>' + (open ? '접기' : '보기') + '</span></div>'
      + (open ? L.map(function (x) {
        return '<div class="issue-row"><span>' + esc((x.day || '').slice(5)) + ' · ' + esc(x.memo || '') + '<br><span class="hint">빈칸: ' + esc((x.miss || []).join('·')) + '</span></span><span>' + (x.amt != null ? J.won(x.amt) : '금액 오류') + '</span></div>';
      }).join('') : '') + '</div>';
    const t = $('issuesToggle');
    if (t) t.onclick = function () { window.__issuesOpen = !open; renderIssues(); };
  }

  function renderTotals() {
    const ym = J.prevYmSeoul();
    const m = (DATA.months || []).find(function (x) { return x.ym === ym; }) || { income: 0, expense: 0, fee: 0 };
    const feePaid = J.feeSales(DATA, ym);
    const head = $('totalsHead');
    if (head) head.textContent = hasData() ? J.longYmLabel(ym) : '';
    const note = $('totalsNote');
    if (note) note.textContent = hasData() ? '통장 수입·지출 · 교습비는 납부대상월' : '';
    $('totals').innerHTML = hasData() ? (
      '<button type="button" class="tot inc" data-nav="inc"><div class="l">수입</div><div class="v" data-value="' + (m.income || 0) + '">' + J.won(m.income || 0) + '</div></button>'
      + '<button type="button" class="tot exp" data-nav="exp"><div class="l">지출</div><div class="v" data-value="' + (m.expense || 0) + '">' + J.won(m.expense || 0) + '</div></button>'
      + '<button type="button" class="tot fee" data-nav="fee"><div class="l">교습비</div><div class="v" data-value="' + feePaid + '">' + J.won(feePaid) + '</div></button>'
    ) : '';
    $('totals').onclick = function (e) {
      const t = e.target.closest('.tot');
      if (!t) return;
      const nav = t.dataset.nav;
      state.tab = 'sales';
      state.salesView = nav === 'inc' ? 'incReport' : nav === 'exp' ? 'expReport' : 'feePayReport';
      state.month = ym;
      state.feeMonth = ym;
      applyTabUI();
      render();
    };
  }

  function renderFoot() {
    const bits = [];
    if (DATA.scope || DATA.note) bits.push(esc(DATA.scope || '') + (DATA.note ? ' · ' + esc(DATA.note) : ''));
    bits.push('업데이트 ' + esc(DATA.updated || '—') + ' · 미납=재학 명단−해당월 입금 · 시트 읽기 전용');
    if (DEMO) bits.push('데모 데이터입니다. 네트워크로 시트를 읽지 않습니다.');
    $('foot').innerHTML = bits.map(function (b) { return '<div>' + b + '</div>'; }).join('');
  }

  function goalRows() {
    return (DATA.billMonths || []).slice().reverse().map(function (ym) {
      const v = J.feeSales(DATA, ym);
      const g = J.SALES_GOAL_1 - v;
      const cls = g <= 0 ? 'ok' : 'warn';
      const gtxt = g <= 0 ? '+' + J.won(-g) : '−' + J.won(g);
      const unpaid = J.isFeeMonthOpen(ym) && J.unpaidVisible(DATA, ym, currentExcluded()).length > 0;
      return '<div class="month-row go" data-fee-ym="' + ym + '"><span>' + esc(J.shortYm(ym)) + (unpaid ? ' · 미납' : '') + '</span><span style="color:var(--fee);font-weight:800">' + J.won(v) + '</span><span class="gap ' + cls + '">' + gtxt + '</span></div>';
    }).join('');
  }

  function calendarHtml(ym, today, deadline) {
    const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5));
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const start = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const cells = [];
    for (let i = 0; i < start; i++) cells.push('<div class="cal-cell blank"></div>');
    for (let d = 1; d <= days; d++) {
      const ymd = ym + '-' + String(d).padStart(2, '0');
      if (ymd > deadline) { cells.push('<div class="cal-cell blank"></div>'); continue; }
      let cls = 'cal-cell';
      let inner = String(d);
      if (ymd === deadline) cls += ' goal';
      else if (ymd < today) cls += ' past';
      else cls += ' remain';
      if (ymd === today) cls += ' today';
      cells.push('<div class="' + cls + '">' + inner + '</div>');
    }
    return '<div class="cal-month"><h3>' + y + '년 ' + m + '월</h3><div class="cal-dow"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div><div class="cal-grid">' + cells.join('') + '</div></div>';
  }

  function renderSales() {
    const p = $('panel-sales');
    const cur = J.currentYmSeoul();
    const curSales = J.feeSales(DATA, cur);
    const dday = J.daysUntil(J.SALES_DEADLINE);
    const ddayLabel = dday > 0 ? 'D-' + dday : (dday === 0 ? 'D-DAY' : 'D+' + Math.abs(dday));
    const pct = Math.min(100, Math.round((curSales || 0) / J.SALES_GOAL_1 * 100));
    const gap = J.SALES_GOAL_1 - curSales;

    if (!hasData()) { p.innerHTML = emptyBox('보여줄 장부가 아직 없습니다.'); return; }

    if (state.salesView === 'ddayCal') {
      const today = J.seoulYmd();
      const from = today.slice(0, 7);
      const to = J.SALES_DEADLINE.slice(0, 7);
      const months = from <= to ? J.ymListInclusive(from, to) : [];
      let gone = 0;
      const start = from + '-01';
      let c = start;
      while (c < today && c <= J.SALES_DEADLINE) {
        gone++;
        const a = c.split('-').map(Number);
        const next = new Date(Date.UTC(a[0], a[1] - 1, a[2] + 1));
        c = next.toISOString().slice(0, 10);
      }
      p.innerHTML = backBtn('backSales', '← 목표')
        + '<div class="card"><div class="cal-head"><div><h2>1차 목표 디데이</h2><div class="hint">기한 2026.12.31 · 월 교습비 1,000만</div></div><div class="dday">' + ddayLabel + '</div></div><div class="metric"><span class="n">지난 날</span><span class="a warn">' + gone + '일</span></div><div class="metric"><span class="n">남은 날</span><span class="a">' + Math.max(0, dday) + '일</span></div></div>'
        + '<div class="card">' + (months.map(function (ym) { return calendarHtml(ym, today, J.SALES_DEADLINE); }).join('') || emptyBox('기한이 지났습니다'))
        + '<div class="cal-legend"><span>지난 날</span><span>남은 날</span><span>목표일</span></div></div>';
      $('backSales').onclick = function () { state.salesView = 'list'; render(); };
      return;
    }

    if (state.salesView === 'incReport') {
      const ym = state.month || J.prevYmSeoul();
      const m = (DATA.months || []).find(function (x) { return x.ym === ym; }) || { income: 0 };
      const lines = ((DATA.monthDetails || {})[ym] || []).filter(function (x) { return x.dir === '수입'; }).slice().sort(function (a, b) { return Math.abs(b.amt) - Math.abs(a.amt); });
      p.innerHTML = backBtn('backSales', '← 목표')
        + '<div class="card"><h2>' + esc(J.longYmLabel(ym)) + ' 수입</h2><div class="metric"><span class="n">수입 합계</span><span class="a inc">' + J.won(m.income || 0) + '</span></div><div class="hint">학년 비중은 통장 입금월 기준</div></div>'
        + donutBlock('수입 학년 비중', J.incomeByGrade(DATA, ym), 0)
        + '<div class="card"><button type="button" class="detail-toggle" id="incDetailToggle">상세보기</button><div class="detail-panel" id="incDetailPanel" hidden>'
        + (lines.length ? lines.map(function (l) {
          const label = l.student || l.cat2 || l.memo || l.dir;
          const sub = [(l.day || '').slice(5), l.cat2 || '', l.cat3 && l.cat3 !== '-' && l.cat3 !== l.cat2 ? l.cat3 : '', l.memo ? l.memo.slice(0, 28) : ''].filter(Boolean).join(' · ');
          return '<div class="line"><div><div>' + esc(label) + '</div><div class="m">' + esc(sub) + '</div></div><div class="a" style="color:var(--inc)">' + J.won(l.amt) + '</div></div>';
        }).join('') : emptyBox('해당 없음')) + '</div></div>'
        + '<button type="button" class="back block" id="toMonthInc">수입지출 탭에서 이 달 보기</button>';
      $('backSales').onclick = function () { state.salesView = 'list'; render(); };
      $('toMonthInc').onclick = function () { goMonthDetail(ym, 'inc', false); };
      bindFolds(p); bindDetail('incDetailToggle', 'incDetailPanel');
      return;
    }

    if (state.salesView === 'expReport') {
      const ym = state.month || J.prevYmSeoul();
      const m = (DATA.months || []).find(function (x) { return x.ym === ym; }) || { expense: 0 };
      const exp = J.monthParts(DATA, ym).exp;
      const lines = ((DATA.monthDetails || {})[ym] || []).filter(function (x) { return x.dir === '지출'; }).slice().sort(function (a, b) { return Math.abs(b.amt) - Math.abs(a.amt); });
      p.innerHTML = backBtn('backSales', '← 목표')
        + '<div class="card"><h2>' + esc(J.longYmLabel(ym)) + ' 지출</h2><div class="metric"><span class="n">지출 합계</span><span class="a exp">' + J.won(m.expense || 0) + '</span></div></div>'
        + donutBlock('지출 비중', exp.kids || [], 1)
        + '<div class="card"><button type="button" class="detail-toggle" id="expDetailToggle">상세보기</button><div class="detail-panel" id="expDetailPanel" hidden>'
        + (lines.length ? lines.map(function (l) {
          const label = [l.cat2, l.cat3 && l.cat3 !== '-' ? l.cat3 : ''].filter(Boolean).join(' · ') || l.dir;
          const sub = [(l.day || '').slice(5), l.memo ? l.memo.slice(0, 28) : '', l.student || ''].filter(Boolean).join(' · ');
          return '<div class="line"><div><div>' + esc(label) + '</div><div class="m">' + esc(sub) + '</div></div><div class="a" style="color:var(--exp)">' + J.won(l.amt) + '</div></div>';
        }).join('') : emptyBox('해당 없음')) + '</div></div>'
        + '<button type="button" class="back block" id="toMonthExp">수입지출 탭에서 이 달 보기</button>';
      $('backSales').onclick = function () { state.salesView = 'list'; render(); };
      $('toMonthExp').onclick = function () { goMonthDetail(ym, 'exp', false); };
      bindFolds(p); bindDetail('expDetailToggle', 'expDetailPanel');
      return;
    }

    if (state.salesView === 'feePayReport') {
      const ym = state.feeMonth || J.prevYmSeoul();
      const block = (DATA.tuition || {})[ym] || { paid: [], paidTotal: 0, paidCount: 0 };
      const paid = (block.paid || []).slice().sort(function (a, b) { return (b.amt || 0) - (a.amt || 0); });
      const unpaid = J.unpaidVisible(DATA, ym, currentExcluded()).slice().sort(function (a, b) { return (b.expected || 0) - (a.expected || 0); });
      const unpaidAmt = unpaid.reduce(function (a, s) { return a + (s.expected || 0); }, 0);
      const kids = [
        { name: '미납', amt: unpaidAmt, kids: unpaid.map(function (s) { return { name: s.name + (s.grade ? ' · ' + s.grade : ''), amt: s.expected || 0 }; }) },
        { name: '납부', amt: block.paidTotal || 0, kids: paid.map(function (s) { return { name: s.name + (s.grade ? ' · ' + s.grade : ''), amt: s.amt || 0 }; }) }
      ];
      p.innerHTML = backBtn('backSales', '← 목표')
        + '<div class="card"><h2>' + esc(J.longYmLabel(ym)) + ' 교습비</h2><div class="metric"><span class="n">미납</span><span class="a warn">' + unpaid.length + '명 · ' + J.won(unpaidAmt) + '</span></div><div class="metric"><span class="n">납부</span><span class="a fee">' + (block.paidCount || paid.length) + '명 · ' + J.won(block.paidTotal || 0) + '</span></div><div class="hint">납부대상월 기준</div></div>'
        + donutBlock('납부 대 미납', kids, 0)
        + '<div class="card"><button type="button" class="detail-toggle" id="feePayDetailToggle">상세보기</button><div class="detail-panel" id="feePayDetailPanel" hidden>'
        + '<h2>미납</h2>' + (unpaid.length ? unpaid.map(function (s) { return '<div class="line"><div><div>' + esc(s.name) + '</div><div class="m">' + esc(s.grade || '') + '</div></div><div class="a" style="color:var(--warn)">' + J.won(s.expected || 0) + '</div></div>'; }).join('') : emptyBox('미납 없음'))
        + '<h2>납부</h2>' + (paid.length ? paid.map(function (s) { return '<div class="line"><div><div>' + esc(s.name) + '</div><div class="m">' + esc(s.grade || '') + '</div></div><div class="a" style="color:var(--fee)">' + J.won(s.amt || 0) + '</div></div>'; }).join('') : emptyBox('납부 없음'))
        + '</div></div><button type="button" class="back block" id="toFeeTabPay">교습비 탭에서 보기</button>';
      $('backSales').onclick = function () { state.salesView = 'list'; render(); };
      $('toFeeTabPay').onclick = function () { goFeeMonth(ym); };
      bindFolds(p); bindDetail('feePayDetailToggle', 'feePayDetailPanel');
      return;
    }

    if (state.salesView === 'feeDonut') {
      const ym = state.feeMonth || cur;
      const block = (DATA.tuition || {})[ym] || { paid: [], paidTotal: 0, paidCount: 0 };
      const byName = {};
      (DATA.students || []).forEach(function (s) { if (s && s.name) byName[s.name] = s; });
      const enriched = (block.paid || []).map(function (s) {
        const meta = byName[s.name] || {};
        const grade = s.grade || meta.grade || meta.grade1 || '기타';
        return { name: s.name || '학생', amt: s.amt || 0, grade: grade, school: meta.school || '학교 미기입', address: meta.address || '주소 미기입' };
      }).filter(function (s) { return s.amt > 0; });
      function group(rows, keyFn) {
        const bag = {};
        rows.forEach(function (s) {
          const key = keyFn(s) || '기타';
          if (!bag[key]) bag[key] = { name: key, amt: 0, kids: {} };
          bag[key].amt += s.amt;
          bag[key].kids[s.name] = (bag[key].kids[s.name] || 0) + s.amt;
        });
        return Object.keys(bag).map(function (k) {
          const g = bag[k];
          return { name: g.name, amt: g.amt, kids: Object.keys(g.kids).map(function (n) { return { name: n, amt: g.kids[n] }; }).sort(function (a, b) { return b.amt - a.amt; }) };
        });
      }
      const band = function (s) {
        const g = String(s.grade || '');
        if (g.indexOf('초') >= 0) return '초등';
        if (g.indexOf('중') >= 0) return '중등';
        if (g.indexOf('고') >= 0) return '고등';
        const meta = byName[s.name];
        const e = meta ? J.effectiveGrade(meta, ym, DATA) : null;
        if (e && (e.g1 === '초등' || e.g1 === '중등' || e.g1 === '고등')) return e.g1;
        return '기타';
      };
      p.innerHTML = backBtn('backSales', '← 목표')
        + '<div class="card"><h2>' + esc(J.koShortYm(ym)) + ' 교습비 매출</h2><div class="metric"><span class="n">납부</span><span class="a fee">' + (block.paidCount || 0) + '명 · ' + J.won(block.paidTotal || 0) + '</span></div><div class="hint">학년·학교·주소. 학교와 주소는 명단 머리글에 그 열이 있을 때만 나뉩니다.</div></div>'
        + donutBlock('학년별 납부', group(enriched, band), 0)
        + donutBlock('학교별 납부', group(enriched, function (s) { return s.school; }), 2)
        + donutBlock('주소별 납부', group(enriched, function (s) { return s.address; }), 3)
        + '<button type="button" class="back block" id="toFeeTab">교습비 탭에서 보기</button>';
      $('backSales').onclick = function () { state.salesView = 'list'; render(); };
      $('toFeeTab').onclick = function () { goFeeMonth(ym); };
      bindFolds(p);
      return;
    }

    const summary = state.salesView !== 'detail';
    let pts = J.salesPoints(DATA, currentExcluded());
    if (summary) pts = sliceYm(pts, cur);
    const chart = C.salesBars(pts, { summary: summary });
    const rows = goalRows();
    if (!summary) {
      p.innerHTML = backBtn('backSales', '← 목표')
        + '<div class="card"><h2>교습비 매출</h2><div class="hint">전체 월 · 좌우로 밀어서 보기 · 숫자 단위 만 원 · 막대를 누르면 그 달</div></div>'
        + chartCard({ id: 'salesChart', scrollId: 'salesScroll', summary: false, hint: '좌우 스크롤', svg: chart.svg, legend: [
          { color: 'var(--fee)', label: '이번 달' }, { color: '#6aa8ff', label: '납부 월' }, { color: 'var(--exp)', label: '미납 있는 달' }, { color: 'var(--inc)', label: '1차 목표 달성' }
        ] })
        + '<div class="card"><h2>월별 · 1차 목표 대비</h2><div class="month-row head"><span>월</span><span>교습비</span><span>1차와 차이</span></div>' + (rows || emptyBox('데이터 없음')) + '</div>';
      $('backSales').onclick = function () { state.salesView = 'list'; render(); };
      p.querySelectorAll('[data-fee-ym]').forEach(function (r) { r.onclick = function () { goFeeMonth(r.dataset.feeYm); }; });
      const sc = $('salesScroll');
      pinRight(sc); bindChartHDrag(sc);
      return;
    }

    p.innerHTML = '<div class="goal-grid"><button type="button" class="card go" id="curFeeCard"><div class="hint">이번 달 교습비 · ' + esc(J.koShortYm(cur)) + '</div><div class="hero" style="color:var(--fee)">' + J.won(curSales) + '</div><div class="hint">1차 목표 ' + J.won(J.SALES_GOAL_1) + ' · ' + pct + '%</div><div class="prog"><span style="width:' + pct + '%"></span></div><div class="hint" style="margin-top:8px">' + (gap > 0 ? '1차 목표까지 ' + J.won(gap) : '1차 목표 초과 ' + J.won(-gap)) + '</div><div class="hint">도넛 상세</div></button><button type="button" class="card go" id="ddayCard"><div class="hint">1차 목표 1,000만</div><div class="dday">' + ddayLabel + '</div><div class="hint">2026.12.31까지</div><div class="hint" style="margin-top:10px">기준은 교습비 납부 합계</div><div class="hint">디데이 달력</div></button></div>'
      + chartCard({ id: 'salesChart', scrollId: 'salesHomeScroll', summary: true, hint: '최근 9개월 · 누르면 전체', svg: chart.svg, legend: [
        { color: 'var(--fee)', label: '이번 달' }, { color: 'var(--exp)', label: '미납 있는 달' }
      ] })
      + '<div class="card"><h2>월별 · 1차 목표 대비</h2><div class="month-row head"><span>월</span><span>교습비</span><span>1차와 차이</span></div>' + (rows || emptyBox('데이터 없음')) + '</div>';
    $('salesChart').onclick = function (e) { if (e.target.closest('.month-row')) return; goSalesChartDetail(); };
    $('curFeeCard').onclick = function () { state.salesView = 'feeDonut'; state.feeMonth = cur; render(); };
    $('ddayCard').onclick = function () { state.salesView = 'ddayCal'; render(); };
    p.querySelectorAll('.month-row[data-fee-ym]').forEach(function (r) {
      r.onclick = function (e) { e.stopPropagation(); goFeeMonth(r.dataset.feeYm); };
    });
  }

  function lineItems(lines) {
    if (!lines.length) return emptyBox('해당 없음');
    return lines.map(function (l) {
      const fee = l.cat2 === '교습비' || l.cat3 === '교습비';
      const color = l.dir === '지출' ? 'var(--exp)' : (fee ? 'var(--fee)' : 'var(--inc)');
      const title = l.student || l.cat2 || l.dir;
      const extra = l.cat3 && l.cat3 !== '-' ? ' · ' + l.cat3 : '';
      return '<div class="line"><div><div>' + esc(title) + esc(extra) + '</div><div class="m">' + esc((l.day || '').slice(5)) + ' · ' + esc(l.dir) + (l.memo ? ' · ' + esc(l.memo.slice(0, 28)) : '') + '</div></div><div class="a" style="color:' + color + '">' + J.won(l.amt) + '</div></div>';
    }).join('');
  }

  function renderMonths() {
    const p = $('panel-months');
    if (!hasData()) { p.innerHTML = emptyBox('보여줄 장부가 아직 없습니다.'); return; }
    const all = (DATA.months || []).map(function (m) { return { ym: m.ym, income: m.income, expense: m.expense }; });

    if (state.view === 'chartDetail') {
      const chart = C.monthsLine(all, { summary: false });
      p.innerHTML = backBtn('backMChart', '← 월 목록')
        + '<div class="card"><h2>수입·지출 그래프</h2><div class="hint">전체 월 · 좌우 스크롤 · 달을 누르면 상세 · 숫자 단위 만 원</div></div>'
        + chartCard({ id: 'monthsDetailChart', scrollId: 'monthsDetailScroll', summary: false, hint: '좌우 스크롤', svg: chart.svg, legend: [
          { color: 'var(--inc)', label: '수입' }, { color: 'var(--exp)', label: '지출' }
        ] });
      $('backMChart').onclick = function () { state.view = 'list'; state.month = null; render(); };
      const sc = $('monthsDetailScroll');
      pinRight(sc); bindChartHDrag(sc);
      sc.querySelectorAll('.months-hit').forEach(function (h) {
        h.addEventListener('click', function (e) {
          e.stopPropagation();
          const ym = h.getAttribute('data-ym');
          if (ym) goMonthDetail(ym, 'all', true);
        });
      });
      return;
    }

    if (state.view === 'detail' && state.month) {
      const m = (DATA.months || []).find(function (x) { return x.ym === state.month; });
      if (!m) { state.view = 'list'; render(); return; }
      let lines = ((DATA.monthDetails || {})[state.month] || []).slice();
      if (state.dirFilt === 'inc') lines = lines.filter(function (x) { return x.dir === '수입'; });
      if (state.dirFilt === 'exp') lines = lines.filter(function (x) { return x.dir === '지출'; });
      if (state.dirFilt === 'fee') lines = lines.filter(function (x) { return x.cat2 === '교습비' || x.cat3 === '교습비'; });
      if (state.q) {
        const q = state.q.toLowerCase();
        lines = lines.filter(function (x) { return (x.student + x.memo + x.cat2 + x.cat3).toLowerCase().indexOf(q) >= 0; });
      }
      const parts = J.monthParts(DATA, state.month);
      const filt = function (key, label) { return '<button type="button" data-f="' + key + '" class="' + (state.dirFilt === key ? 'on' : '') + '">' + label + '</button>'; };
      p.innerHTML = backBtn('backM', '← 월 목록')
        + '<div class="card"><h2>' + esc(J.longYmLabel(m.ym)) + '</h2><div class="metric"><span class="n">수입</span><span class="a inc">' + J.won(m.income) + '</span></div><div class="metric"><span class="n">지출</span><span class="a ' + ((m.expense || 0) < 0 ? 'inc' : 'exp') + '">' + J.won(m.expense) + '</span></div><div class="metric"><span class="n">교습비 · 통장</span><span class="a fee">' + J.won(m.fee) + '</span></div><div class="hint">교습비는 중분류 또는 세부분류가 교습비인 수입입니다.</div></div>'
        + donutBlock('지출 비중', parts.exp.kids || [], 1)
        + donutBlock('수입 비중', parts.inc.kids || [], 0)
        + '<div class="filt">' + filt('all', '전체') + filt('inc', '수입') + filt('exp', '지출') + filt('fee', '교습비') + '</div>'
        + '<input class="search" id="q" placeholder="학생·메모 검색" value="' + esc(state.q) + '"/>'
        + '<div class="card"><button type="button" class="detail-toggle" id="monthDetailToggle">상세보기</button><div class="detail-panel" id="monthDetailPanel" hidden>' + lineItems(lines) + '</div></div>';
      $('backM').onclick = function () {
        if (state._monthsFromChart) { state._monthsFromChart = false; state.view = 'chartDetail'; state.month = null; state.q = ''; }
        else { state.view = 'list'; state.month = null; state.q = ''; }
        render();
      };
      p.querySelectorAll('.filt button').forEach(function (b) { b.onclick = function () { state.dirFilt = b.dataset.f; render(); }; });
      bindSearch('q'); bindFolds(p); bindDetail('monthDetailToggle', 'monthDetailPanel');
      return;
    }

    const homePts = sliceYm(all);
    const chart = C.monthsLine(homePts, { summary: true });
    const stack = C.expenseStack(J.expenseStack(DATA));
    const months = (DATA.months || []).slice().reverse();
    p.innerHTML = chartCard({ id: 'monthsChart', scrollId: 'monthsHomeScroll', summary: true, hint: '최근 9개월 · 누르면 전체 · 만 원', svg: chart.svg, legend: [
      { color: 'var(--inc)', label: '수입' }, { color: 'var(--exp)', label: '지출' }
    ] })
      + expenseCard(stack)
      + '<div class="card"><div class="hint">월을 누르면 상세. 그래프를 누르면 전체 기간.</div></div>'
      + months.map(function (m) {
        const exp = Math.round(Number(m.expense) || 0);
        const expHtml = exp < 0
          ? '<div style="color:var(--inc)">순유입 ' + J.won(-exp) + '</div>'
          : '<div style="color:var(--exp)">' + minusWon(exp) + '</div>';
        return '<button type="button" class="row" data-ym="' + m.ym + '"><div><div class="ym">' + esc(J.shortYm(m.ym)) + '</div>' + monthBar(m) + '</div><div class="right"><div style="color:var(--inc)">' + plusWon(m.income) + '</div>' + expHtml + '</div></button>';
      }).join('');
    $('monthsChart').onclick = function () { goMonthsChartDetail(); };
    p.querySelectorAll('.nx-exp-hit').forEach(function (h) {
      h.addEventListener('click', function (e) { e.stopPropagation(); goMonthDetail(h.getAttribute('data-ym'), 'exp', false); });
    });
    p.querySelectorAll('.row').forEach(function (r) {
      r.onclick = function () { state._monthsFromChart = false; state.month = r.dataset.ym; state.view = 'detail'; state.dirFilt = 'all'; state.q = ''; render(); };
    });
  }

  function expenseCard(stack) {
    if (!stack) return '';
    const model = J.expenseStack(DATA);
    const last = model.points[model.points.length - 1];
    const prev = model.points.length > 1 ? model.points[model.points.length - 2] : null;
    const rows = model.cats.map(function (cat, i) {
      const v = last.cats[cat] || 0;
      const share = last.total ? Math.round(v / last.total * 1000) / 10 : 0;
      let delta = '';
      if (prev) {
        const d = v - (prev.cats[cat] || 0);
        delta = d ? '<span class="delta">전월 ' + (d > 0 ? '▲ ' : '▼ ') + J.won(Math.abs(d)) + '</span>' : '<span class="delta">전월과 같음</span>';
      }
      return '<div class="metric"><span class="n"><i class="swatch" style="background:' + C.expColor(cat, i) + '"></i>' + esc(cat) + ' ' + share + '%</span><span class="a">' + J.won(v) + delta + '</span></div>';
    }).join('');
    return '<div class="card nx-card"><h2>지출 항목별 추이</h2><div class="hint">통장 기준 · 끝난 달까지 · 만 원 · 막대를 누르면 그 달 지출. 합계가 음수인 달은 아래로 그립니다.</div><div class="nx-chart">' + stack.svg + '</div>'
      + legend(model.cats.map(function (cat, i) { return { color: C.expColor(cat, i), label: cat }; }))
      + '<div class="hint">' + esc(J.longYmLabel(last.ym)) + ' 지출 ' + J.won(last.total) + '</div>' + rows + '</div>';
  }

  function renderSuji() {
    const p = $('panel-suji');
    if (!hasData()) { p.innerHTML = emptyBox('보여줄 장부가 아직 없습니다.'); return; }
    const cash = J.cashSeries(DATA);
    if (state.sujiView === 'chartDetail') {
      const chart = C.cashBars(cash, { summary: false, selectedYm: state.month });
      p.innerHTML = backBtn('backSujiChart', '← 현금흐름')
        + '<div class="card"><h2>현금흐름 그래프</h2><div class="hint">수입−지출 · 전체 월 · 좌우 스크롤 · 만 원</div></div>'
        + chartCard({ id: 'sujiDetailChart', scrollId: 'sujiDetailScroll', summary: false, hint: '좌우 스크롤', svg: chart.svg, legend: [
          { color: 'var(--inc)', label: '플러스' }, { color: 'var(--exp)', label: '마이너스' }
        ] });
      $('backSujiChart').onclick = function () { state.sujiView = 'list'; render(); };
      const sc = $('sujiDetailScroll');
      pinRight(sc); bindChartHDrag(sc);
      sc.querySelectorAll('.suji-hit').forEach(function (h) {
        h.addEventListener('click', function (e) {
          e.stopPropagation();
          state.month = h.getAttribute('data-ym');
          state.sujiView = 'list';
          render();
        });
      });
      return;
    }
    const months = (DATA.months || []).map(function (m) { return m.ym; }).reverse();
    if (!state.month) state.month = months[0];
    const tree = (DATA.suji || {})[state.month] || [];
    const incAmt = (tree.find(function (n) { return n.name === '수입'; }) || {}).amt || 0;
    const expAmt = (tree.find(function (n) { return n.name === '지출'; }) || {}).amt || 0;
    const flow = incAmt - expAmt;
    const home = sliceYm(cash);
    const chart = C.cashBars(home, { summary: true, selectedYm: state.month });
    const cumAll = J.cumSeries(DATA);
    const cum = C.cumChart(cumAll, J.currentYmSeoul());
    p.innerHTML = chartCard({ id: 'sujiChart', scrollId: 'sujiHomeScroll', summary: true, hint: '최근 9개월 · 누르면 전체 · 만 원', svg: chart.svg, legend: [
      { color: 'var(--inc)', label: '플러스' }, { color: 'var(--exp)', label: '마이너스' }
    ] })
      + cumCard(cum, cumAll)
      + '<div class="seg" id="segS">' + months.map(function (ym) { return '<button type="button" data-ym="' + ym + '" class="' + (ym === state.month ? 'on' : '') + '">' + esc(J.shortYm(ym)) + '</button>'; }).join('') + '</div>'
      + '<div class="card">' + (tree.map(function (n1, i1) {
        const col = n1.name === '수입' ? 'var(--inc)' : n1.name === '지출' ? 'var(--exp)' : 'var(--muted)';
        return '<div class="tree-item" data-l="1" data-i="' + i1 + '"><div class="head"><span>' + esc(n1.name) + '</span><span class="amt" style="color:' + col + '">' + J.won(n1.amt) + '</span></div><div class="tree-kids open" id="k1-' + i1 + '">'
          + (n1.kids || []).map(function (n2, i2) {
            return '<div class="tree-item" data-l="2" data-i="' + i1 + '-' + i2 + '"><div class="head"><span>' + esc(n2.name) + '</span><span class="amt">' + J.won(n2.amt) + '</span></div><div class="tree-kids" id="k2-' + i1 + '-' + i2 + '">'
              + (n2.kids || []).map(function (n3) { return '<div class="tree-item"><div class="head"><span style="font-weight:600;color:var(--muted)">' + esc(n3.name) + '</span><span class="amt">' + J.won(n3.amt) + '</span></div></div>'; }).join('')
              + '</div></div>';
          }).join('') + '</div></div>';
      }).join('') || emptyBox('데이터 없음'))
      + '<div class="tree-item"><div class="head"><span>현금흐름</span><span class="amt" style="color:' + (flow > 0 ? 'var(--inc)' : flow < 0 ? 'var(--exp)' : 'var(--muted)') + '">' + J.won(flow) + '</span></div></div></div>';
    $('sujiChart').onclick = function (e) { if (e.target.closest('.suji-hit')) return; goSujiChartDetail(); };
    p.querySelectorAll('#sujiChart .suji-hit').forEach(function (h) {
      h.addEventListener('click', function (e) { e.stopPropagation(); goSujiChartDetail(); });
    });
    p.querySelectorAll('.nx-cum-hit').forEach(function (h) {
      h.addEventListener('click', function (e) { e.stopPropagation(); state.month = h.getAttribute('data-ym'); render(); });
    });
    $('segS').querySelectorAll('button').forEach(function (b) { b.onclick = function () { state.month = b.dataset.ym; render(); }; });
    const on = $('segS').querySelector('button.on');
    if (on && on.scrollIntoView) { try { on.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (_) {} }
    p.querySelectorAll('.tree-item[data-l]').forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        const id = item.dataset.l === '1' ? 'k1-' + item.dataset.i : 'k2-' + item.dataset.i;
        const kids = document.getElementById(id);
        if (kids) kids.classList.toggle('open');
      });
    });
  }

  function cumCard(chart, all) {
    if (!chart || !all.length) return '';
    const prev = J.prevYmSeoul();
    const done = all.filter(function (p) { return p.ym <= prev; });
    const last = done[done.length - 1] || all[all.length - 1];
    const sumInc = done.reduce(function (a, p) { return a + p.inc; }, 0);
    const sumFlow = done.reduce(function (a, p) { return a + p.flow; }, 0);
    const avg = sumInc ? Math.round(sumFlow / sumInc * 1000) / 10 : 0;
    return '<div class="card nx-card"><h2>올해 누적 현금흐름</h2><div class="hint">선은 ' + esc(J.shortYm(all[0].ym)) + '월부터 쌓인 순현금(수입−지출). 옅은 막대는 그 달. 만 원.</div><div class="nx-chart">' + chart.svg + '</div>'
      + legend([{ color: '#f2f6fb', label: '누적' }, { color: 'var(--inc)', label: '월 플러스' }, { color: 'var(--exp)', label: '월 마이너스' }])
      + '<div class="metric"><span class="n">올해 ' + esc(J.shortYm(last.ym)) + '월까지</span><span class="a" style="color:' + (last.cum >= 0 ? 'var(--inc)' : 'var(--exp)') + '">' + J.won(last.cum) + '</span></div>'
      + '<div class="metric"><span class="n">' + esc(J.shortYm(last.ym)) + '월 이익률</span><span class="a">' + last.margin + '%</span></div>'
      + '<div class="metric"><span class="n">올해 평균 이익률</span><span class="a">' + avg + '%</span></div></div>';
  }

  function renderFee() {
    const p = $('panel-fee');
    if (!hasData()) { p.innerHTML = emptyBox('보여줄 장부가 아직 없습니다.'); return; }
    const months = (DATA.billMonths || []).slice().reverse();
    const ALL = '__all_unpaid__';
    if (!state.feeMonth) state.feeMonth = ALL;
    const ex = currentExcluded();
    const isAll = state.feeMonth === ALL;
    let modal = '';
    if (state.confirm) {
      const c = state.confirm;
      modal = '<div class="modal-bg" id="modalBg"><div class="modal"><h3>미납에서 제외할까요?</h3><p><b style="color:var(--text)">' + esc(c.name) + '</b> · 납부대상 ' + esc(J.shortYm(c.ym)) + '<br>제외하면 이 달 미납에서 빠집니다. 이 기기에만 저장됩니다.<br>휴원이면 시트 «휴원 기록»에 이름과 월을 적으면 모든 기기에서 빠집니다.</p><div class="acts"><button type="button" class="cancel" id="cfmNo">아니요</button><button type="button" class="ok" id="cfmYes">제외할래요</button></div></div></div>';
    }
    const groups = [];
    (DATA.billMonths || []).forEach(function (ym) {
      let list = J.unpaidVisible(DATA, ym, ex);
      if (state.q) {
        const q = state.q.toLowerCase();
        list = list.filter(function (s) { return (s.name + (s.grade || '')).toLowerCase().indexOf(q) >= 0; });
      }
      if (list.length) groups.push({ ym: ym, list: list, total: list.reduce(function (a, s) { return a + (s.expected || 0); }, 0) });
    });
    const allCount = groups.reduce(function (a, g) { return a + g.list.length; }, 0);
    const allTotal = groups.reduce(function (a, g) { return a + g.total; }, 0);
    const seg = '<div class="seg" id="segF"><button type="button" data-ym="' + ALL + '" class="' + (isAll ? 'on warn' : '') + '">미납' + (allCount ? ' ' + allCount : '') + '</button>'
      + months.map(function (ym) { return '<button type="button" data-ym="' + ym + '" class="' + (!isAll && ym === state.feeMonth ? 'on' : '') + '">' + esc(J.shortYm(ym)) + '</button>'; }).join('') + '</div>';

    function unpaidRow(s, ym) {
      return '<div class="line"><button type="button" class="peek" data-name="' + esc(s.name) + '" style="flex:1;text-align:left;border:0;background:transparent;min-height:44px"><div>' + esc(s.name) + '</div><div class="m">' + esc(s.grade || '') + ' · 예정 ' + J.won(s.expected) + '</div></button><div class="a" style="color:var(--warn);margin-right:8px">미납</div><button type="button" class="xbtn warn" data-exclude="' + esc(s.name) + '" data-ym="' + ym + '">제외</button></div>';
    }

    if (isAll) {
      const col = C.collectionBars(J.collectionSeries(DATA, ex));
      const body = groups.length ? groups.map(function (g) {
        return '<div class="card"><h2>' + esc(J.shortYm(g.ym)) + ' 미납 · ' + g.list.length + '명 · ' + J.won(g.total) + '</h2>' + g.list.map(function (s) { return unpaidRow(s, g.ym); }).join('') + '</div>';
      }).join('') : '<div class="card">' + emptyBox('미납 없음') + '</div>';
      p.innerHTML = seg + '<div class="card"><h2>전체 미납</h2><div class="metric"><span class="n">미납</span><span class="a warn">' + allCount + '명 · ' + J.won(allTotal) + '</span></div><div class="metric"><span class="n">기간</span><span class="a">' + (groups.length ? esc(J.shortYm(groups[0].ym)) + ' ~ ' + esc(J.shortYm(groups[groups.length - 1].ym)) : '—') + '</span></div></div>'
        + collectionCard(col) + '<input class="search" id="qFee" placeholder="학생·학년 검색" value="' + esc(state.q || '') + '"/>' + body + modal + peekHtml();
    } else {
      const block = (DATA.tuition || {})[state.feeMonth] || { paidTotal: 0, paidCount: 0, paid: [], unpaid: [] };
      const exList = Object.keys(ex).map(function (k) { return ex[k]; }).filter(function (x) { return x.ym === state.feeMonth && !x.session; });
      let list = state.feeFilt === 'paid' ? (block.paid || []).slice() : J.unpaidVisible(DATA, state.feeMonth, ex);
      if (state.q) {
        const q = state.q.toLowerCase();
        list = list.filter(function (s) { return (s.name + (s.grade || '')).toLowerCase().indexOf(q) >= 0; });
      }
      const unpaid = J.unpaidVisible(DATA, state.feeMonth, ex);
      const unpaidAmt = unpaid.reduce(function (a, s) { return a + (s.expected || 0); }, 0);
      const open = J.isFeeMonthOpen(state.feeMonth);
      p.innerHTML = seg + '<div class="card"><h2>납부대상 ' + esc(J.shortYm(state.feeMonth)) + '</h2><div class="metric"><span class="n">미납</span><span class="a warn">' + (open ? unpaid.length + '명 · ' + J.won(unpaidAmt) : '아직 시작 전') + '</span></div><div class="metric"><span class="n">납부</span><span class="a fee">' + (block.paidCount || 0) + '명 · ' + J.won(block.paidTotal || 0) + '</span></div></div>'
        + '<div class="filt"><button type="button" data-ff="unpaid" class="' + (state.feeFilt === 'unpaid' ? 'on warn' : '') + '">미납 ' + unpaid.length + '</button><button type="button" data-ff="paid" class="' + (state.feeFilt === 'paid' ? 'on ok' : '') + '">납부 ' + (block.paidCount || 0) + '</button></div>'
        + (exList.length ? '<div class="excluded-bar"><span>이 달 제외 ' + exList.length + '명</span><button type="button" id="toggleEx">' + (state.showExcluded ? '숨기기' : '목록 보기') + '</button></div>' : '')
        + (state.showExcluded && exList.length ? '<div class="card">' + exList.map(function (x) {
          const note = x.session ? '횟수 등록 · 미납 계산 제외' : x.sheet ? '시트 휴원 기록 · 모든 기기에서 제외' : '이 기기에서 제외';
          const btn = (!x.sheet && !x.session) ? '<button type="button" class="xbtn" data-restore="' + esc(x.name) + '">되돌리기</button>' : '';
          return '<div class="line"><div><div>' + esc(x.name) + '</div><div class="m">' + note + '</div></div>' + btn + '</div>';
        }).join('') + '</div>' : '')
        + '<input class="search" id="qFee" placeholder="학생·학년 검색" value="' + esc(state.q || '') + '"/>'
        + '<div class="card">' + (list.length ? list.map(function (s) {
          if (state.feeFilt === 'unpaid') return unpaidRow(s, state.feeMonth);
          return '<div class="line"><div><div>' + esc(s.name) + '</div><div class="m">' + esc(s.grade || '') + (s.day ? ' · ' + esc(s.day.slice(5)) : '') + (s.expected ? ' · 명단 ' + J.won(s.expected) : '') + '</div></div><div class="a" style="color:var(--fee)">' + J.won(s.amt) + '</div></div>';
        }).join('') : emptyBox('해당 없음')) + '</div>' + modal + peekHtml();
    }

    $('segF').querySelectorAll('button').forEach(function (b) {
      b.onclick = function () { state.feeMonth = b.dataset.ym; state.q = ''; state.feeFilt = 'unpaid'; state.showExcluded = false; state.confirm = null; render(); };
    });
    p.querySelectorAll('.filt button').forEach(function (b) { b.onclick = function () { state.feeFilt = b.dataset.ff; state.confirm = null; render(); }; });
    const tog = $('toggleEx');
    if (tog) tog.onclick = function () { state.showExcluded = !state.showExcluded; render(); };
    p.querySelectorAll('.peek').forEach(function (b) { b.onclick = function () { openPeek(b.dataset.name); }; });
    p.querySelectorAll('[data-exclude]').forEach(function (b) {
      b.onclick = function (e) { e.stopPropagation(); state.confirm = { ym: b.dataset.ym || state.feeMonth, name: b.dataset.exclude }; render(); };
    });
    p.querySelectorAll('[data-restore]').forEach(function (b) {
      b.onclick = function (e) { e.stopPropagation(); restorePair(state.feeMonth, b.dataset.restore); render(); };
    });
    if (state.confirm) {
      $('cfmNo').onclick = function () { state.confirm = null; render(); };
      $('cfmYes').onclick = function () { excludePair(state.confirm.ym, state.confirm.name); state.confirm = null; render(); };
      $('modalBg').onclick = function (e) { if (e.target.id === 'modalBg') { state.confirm = null; render(); } };
    }
    p.querySelectorAll('.nx-col-hit').forEach(function (h) {
      h.addEventListener('click', function (e) { e.stopPropagation(); goFeeMonth(h.getAttribute('data-ym')); });
    });
    bindSearch('qFee');
    bindPeek();
  }

  function collectionCard(chart) {
    if (!chart) return '';
    const pts = J.collectionSeries(DATA, currentExcluded());
    const done = pts.filter(function (p) { return !p.cur; });
    const last = done[done.length - 1];
    const prev = done.length > 1 ? done[done.length - 2] : null;
    const cur = pts.find(function (p) { return p.cur; });
    let delta = '';
    if (last && prev) {
      const d = Math.round((last.rate - prev.rate) * 10) / 10;
      delta = d ? '<span class="delta">전월 ' + (d > 0 ? '▲ ' : '▼ ') + Math.abs(d) + '%p</span>' : '<span class="delta">전월과 같음</span>';
    }
    return '<div class="card nx-card"><h2>교습비 수납률</h2><div class="hint">납부 ÷ (납부+미납 예정액). 막대를 누르면 그 달. 이번 달은 흐리게.</div><div class="nx-chart">' + chart.svg + '</div>'
      + legend([{ color: 'var(--fee)', label: '납부' }, { color: 'var(--warn)', label: '미납 예정' }])
      + (last ? '<div class="metric"><span class="n">' + esc(J.shortYm(last.ym)) + ' 수납률</span><span class="a">' + last.rate + '%' + delta + '</span></div><div class="metric"><span class="n">' + esc(J.shortYm(last.ym)) + ' 미납</span><span class="a warn">' + last.unpaidCount + '명 · ' + J.won(last.unpaid) + '</span></div>' : '')
      + (cur ? '<div class="metric"><span class="n">' + esc(J.shortYm(cur.ym)) + ' 진행 중</span><span class="a fee">' + cur.paidCount + '명 납부 · ' + cur.rate + '%</span></div>' : '')
      + '</div>';
  }

  function renderStudents() {
    const p = $('panel-students');
    if (!hasData()) { p.innerHTML = emptyBox('보여줄 장부가 아직 없습니다.'); return; }
    if (state.stuFlowYm) { renderStudentFlow(); return; }
    const all = J.flowSeries(DATA);
    const summary = state.stuView !== 'chartDetail';
    const pts = summary ? sliceYm(all, J.prevYmSeoul()) : all;
    const chart = C.enrollBars(pts, { summary: summary });
    if (!summary) {
      const last = pts.length ? pts[pts.length - 1] : null;
      const totE = pts.reduce(function (a, x) { return a + x.entered; }, 0);
      const totL = pts.reduce(function (a, x) { return a + x.left; }, 0);
      const rows = pts.slice().reverse().map(function (x) {
        return '<button type="button" class="line stu-flow-row" data-ym="' + x.ym + '"><div><div>' + esc(J.shortYm(x.ym)) + '</div><div class="m">재원 ' + x.enrolled + ' · 신규 ' + x.entered + ' · 퇴소 ' + x.left + '</div></div><div class="a"><span style="color:var(--inc)">+' + x.entered + '</span> <span style="color:var(--exp)">−' + x.left + '</span></div></button>';
      }).join('');
      p.innerHTML = backBtn('backStuChart', '← 학생')
        + '<div class="card"><h2>재원·신규·퇴소</h2><div class="hint">전월까지. 신규는 이번 달 재원에 있고 전달 재원에는 없는 학생. 퇴소는 전달 재원에는 있고 이번 달 재원에는 없는 학생. 재원은 그달 납부, 또는 납부 공백이 3개월 미만인 유예입니다. 시트에 퇴소로 적힌 학생은 마지막 납부 다음 달부터 유예가 없습니다.</div>'
        + '<div class="metric"><span class="n">최근 재원</span><span class="a fee">' + (last ? last.enrolled + '명' : '—') + '</span></div>'
        + '<div class="metric"><span class="n">기간 신규</span><span class="a inc">' + totE + '명</span></div>'
        + '<div class="metric"><span class="n">기간 퇴소</span><span class="a exp">' + totL + '명</span></div></div>'
        + chartCard({ id: 'stuEnrollDetailChart', scrollId: 'stuEnrollScroll', summary: false, hint: '좌우 스크롤 · 누르면 명단', svg: chart.svg, legend: [
          { color: 'var(--fee)', label: '재원' }, { color: 'var(--inc)', label: '신규' }, { color: 'var(--exp)', label: '퇴소' }
        ] })
        + '<div class="card"><h2>월별</h2>' + (rows || emptyBox('데이터 없음')) + '</div>' + peekHtml();
      $('backStuChart').onclick = function () { state.stuView = 'list'; render(); };
      const sc = $('stuEnrollScroll');
      pinRight(sc); bindChartHDrag(sc);
      const open = function (ym) { state.stuFlowYm = ym; render(); };
      p.querySelectorAll('.stu-flow-hit').forEach(function (h) { h.addEventListener('click', function (e) { e.stopPropagation(); open(h.getAttribute('data-ym')); }); });
      p.querySelectorAll('.stu-flow-row').forEach(function (r) { r.onclick = function () { open(r.dataset.ym); }; });
      bindPeek();
      return;
    }
    const last = pts.length ? pts[pts.length - 1] : null;
    p.innerHTML = chartCard({ id: 'stuEnrollChart', scrollId: 'stuHomeScroll', summary: true, hint: '최근 9개월 · 누르면 전체', svg: chart.svg, legend: [
      { color: 'var(--fee)', label: '재원' }, { color: 'var(--inc)', label: '신규' }, { color: 'var(--exp)', label: '퇴소' }
    ] })
      + '<div class="card"><div class="metric"><span class="n">' + (last ? esc(J.shortYm(last.ym)) + ' 재원' : '재원') + '</span><span class="a fee">' + (last ? last.enrolled + '명' : '—') + '</span></div>'
      + '<div class="metric"><span class="n">신규</span><span class="a inc">' + (last ? last.entered + '명' : '—') + '</span></div>'
      + '<div class="metric"><span class="n">퇴소</span><span class="a exp">' + (last ? last.left + '명' : '—') + '</span></div>'
      + '<div class="hint">납부한 달과, 공백이 3개월 미만인 달은 재원입니다. 휴원 기록 달은 재원에서 뺍니다. 첫 달은 이전 명단을 알 수 없어 신규로 세지 않습니다.</div></div>'
      + (last ? gradeCard(last.ym) : '')
      + gradeSalesCard(pts.map(function (x) { return x.ym; }))
      + arpuCard();
    $('stuEnrollChart').onclick = function () { goStudentChartDetail(); };
  }

  function gradeCard(ym) {
    const counts = J.gradeCounts(DATA, ym);
    const shares = J.percentShares(counts);
    const order = ['초등', '중등', '고등', '기타'];
    const colors = { '초등': '#4ade80', '중등': '#60a5fa', '고등': '#f472b6', '기타': '#9ca3af' };
    const parts = order.filter(function (k) { return counts[k]; }).map(function (k) { return { name: k, abs: counts[k], amt: counts[k] }; });
    const total = order.reduce(function (a, k) { return a + counts[k]; }, 0);
    if (!total) return '';
    const legendHtml = order.filter(function (k) { return counts[k]; }).map(function (k) {
      return '<div class="metric"><span class="n"><i class="swatch" style="background:' + colors[k] + '"></i>' + k + '</span><span class="a">' + counts[k] + '명 · ' + (shares[k] || 0) + '%</span></div>';
    }).join('');
    return '<div class="card"><h2>' + esc(J.shortYm(ym)) + ' 재원 학년</h2><div class="donut-grid">' + C.donutSVG(parts, order.map(function (k) { return colors[k]; })) + '<div style="width:100%">' + legendHtml + '</div></div><div class="hint">합계 ' + total + '명. 비율은 반올림해도 100이 되게 맞춥니다.</div></div>';
  }

  function gradeSalesCard(yms) {
    if (!yms || !yms.length) return '';
    const keys = ['초등', '중등', '고등', '기타'];
    const colors = { '초등': '#4ade80', '중등': '#60a5fa', '고등': '#f472b6', '기타': '#9ca3af' };
    const series = keys.map(function (k) {
      return { name: k, color: colors[k], values: yms.map(function (ym) {
        const b = J.incomeByGrade(DATA, ym).find(function (x) { return x.name === k; });
        return b ? b.amt : 0;
      }) };
    }).filter(function (s) { return s.values.some(function (v) { return v; }); });
    const lastI = yms.length - 1;
    const legendHtml = series.map(function (s) {
      return '<div class="metric"><span class="n"><i class="swatch" style="background:' + s.color + '"></i>' + s.name + '</span><span class="a">' + J.won(s.values[lastI]) + '</span></div>';
    }).join('');
    return '<div class="card"><h2>학년별 교습비</h2><div class="hint">통장에 들어온 달 기준 · 만 원 · 아래 금액은 ' + esc(J.shortYm(yms[lastI])) + '</div>' + C.gradeLines(yms, series) + legendHtml + '</div>';
  }

  function arpuCard() {
    const pts = J.arpuSeries(DATA);
    const chart = C.arpuChart(pts);
    if (!chart || !pts.length) return '';
    const last = pts[pts.length - 1];
    const prev = pts.length > 1 ? pts[pts.length - 2] : null;
    const exp = ((DATA.months || []).find(function (m) { return m.ym === last.ym; }) || {}).expense || 0;
    const be = J.breakeven(exp, last.avg);
    let delta = '';
    if (prev) {
      const d = last.avg - prev.avg;
      delta = d ? '<span class="delta">전월 ' + (d > 0 ? '▲ ' : '▼ ') + J.won(Math.abs(d)) + '</span>' : '<span class="delta">전월과 같음</span>';
    }
    return '<div class="card nx-card"><h2>학생 1인당 평균 교습비</h2><div class="hint">납부 합계 ÷ 납부 인원. 옅은 막대는 납부 인원. 끝난 달까지.</div><div class="nx-chart">' + chart.svg + '</div>'
      + '<div class="metric"><span class="n">' + esc(J.shortYm(last.ym)) + ' 1인 평균</span><span class="a fee">' + J.won(last.avg) + delta + '</span></div>'
      + '<div class="metric"><span class="n">' + esc(J.shortYm(last.ym)) + ' 납부</span><span class="a">' + last.count + '명 · ' + J.won(last.total) + '</span></div>'
      + (be ? '<div class="metric"><span class="n">손익분기 인원</span><span class="a ' + (be > last.count ? 'warn' : 'inc') + '">약 ' + be + '명</span></div><div class="hint">' + esc(J.shortYm(last.ym)) + ' 통장 지출 ' + J.won(exp) + ' ÷ 1인 평균. 이만큼 납부하면 그 달 지출과 같습니다.</div>' : '')
      + '</div>';
  }

  function renderStudentFlow() {
    const p = $('panel-students');
    const all = J.flowSeries(DATA);
    const yms = all.map(function (x) { return x.ym; });
    if (!yms.length) { p.innerHTML = backBtn('backStuFlow', '← 학생') + emptyBox('교습비 월 데이터가 없습니다'); $('backStuFlow').onclick = function () { state.stuFlowYm = null; render(); }; return; }
    if (yms.indexOf(state.stuFlowYm) < 0) state.stuFlowYm = yms[yms.length - 1];
    const row = all.find(function (x) { return x.ym === state.stuFlowYm; });
    function person(name, kind) {
      const s = (DATA.students || []).find(function (x) { return x && x.name === name; });
      const eg = s ? J.effectiveGrade(s, state.stuFlowYm, DATA) : null;
      const meta = s ? ((eg && eg.label) || s.grade || '') + ' · ' + (s.status || '') : '명단에 없음';
      const tag = kind === 'leave' ? '퇴소' : '신규';
      const cls = kind === 'leave' ? 'off' : 'on';
      return '<button type="button" class="stu-card" data-name="' + esc(name) + '"><div class="top"><span class="name">' + esc(name) + '</span><span class="badge ' + cls + '">' + tag + '</span></div><div class="meta">' + esc(meta) + '</div></button>';
    }
    p.innerHTML = backBtn('backStuFlow', state.stuView === 'chartDetail' ? '← 그래프' : '← 학생')
      + '<div class="card"><h2>' + esc(J.shortYm(state.stuFlowYm)) + ' 신규·퇴소</h2><div class="metric"><span class="n">신규</span><span class="a inc">' + row.entered + '명</span></div><div class="metric"><span class="n">퇴소</span><span class="a exp">' + row.left + '명</span></div></div>'
      + '<div class="seg" id="segStuFlow">' + yms.slice().reverse().map(function (ym) { return '<button type="button" data-ym="' + ym + '" class="' + (ym === state.stuFlowYm ? 'on' : '') + '">' + esc(J.shortYm(ym)) + '</button>'; }).join('') + '</div>'
      + '<h2 class="sec-title" style="color:var(--inc)">신규 ' + row.entered + '</h2>'
      + (row.enteredNames.length ? row.enteredNames.map(function (n) { return person(n, 'enter'); }).join('') : emptyBox('이달 신규 없음'))
      + '<h2 class="sec-title" style="color:var(--exp)">퇴소 ' + row.left + '</h2>'
      + (row.leftNames.length ? row.leftNames.map(function (n) { return person(n, 'leave'); }).join('') : emptyBox('이달 퇴소 없음'))
      + '<div class="hint" style="margin-top:8px">휴원 기록에 적힌 달은 재원에서 빠져, 그 달에 퇴소로 보이고 다음 납부 달에 신규로 다시 잡힐 수 있습니다.</div>'
      + peekHtml();
    $('backStuFlow').onclick = function () { state.stuFlowYm = null; render(); };
    $('segStuFlow').querySelectorAll('button').forEach(function (b) { b.onclick = function () { state.stuFlowYm = b.dataset.ym; render(); }; });
    p.querySelectorAll('.stu-card').forEach(function (c) { c.onclick = function () { openPeek(c.dataset.name); }; });
    bindPeek();
  }

  function uploadCard() {
    return '<div class="card bank-upload"><div><div class="t">통장 올리기</div><div class="s">CSV 또는 xlsx 한 개. 카드·동백 JSON과 이미지는 함께 고를 수 있습니다.</div></div><button type="button" class="btn primary" id="bankUploadBtn">파일 선택</button></div><div id="uploadStatus" class="upload-status" hidden></div><button type="button" class="btn ghost" id="catPendingCheckBtn">분류 대기 확인</button>';
  }

  function renderBank() {
    const p = $('panel-bank');
    const months = Object.keys(DATA.monthDetails || {}).sort().reverse();
    if (!months.length) {
      p.innerHTML = uploadCard() + emptyBox('거래내역이 아직 없습니다');
      bindBankUpload();
      return;
    }
    if (!state.bankMonth || months.indexOf(state.bankMonth) < 0) state.bankMonth = months[0];
    let lines = ((DATA.monthDetails || {})[state.bankMonth] || []).slice();
    lines.sort(function (a, b) {
      if ((a.day || '') !== (b.day || '')) return (b.day || '').localeCompare(a.day || '');
      return (Number(b.amt) || 0) - (Number(a.amt) || 0);
    });
    let sumLines = lines.slice();
    if (state.dirFilt === 'inc') { lines = lines.filter(function (x) { return x.dir === '수입'; }); sumLines = sumLines.filter(function (x) { return x.dir === '수입'; }); }
    if (state.dirFilt === 'exp') { lines = lines.filter(function (x) { return x.dir === '지출'; }); sumLines = sumLines.filter(function (x) { return x.dir === '지출'; }); }
    if (state.q) {
      const q = state.q.toLowerCase();
      lines = lines.filter(function (x) { return (x.student + ' ' + x.memo + ' ' + x.cat2 + ' ' + x.cat3 + ' ' + x.dir).toLowerCase().indexOf(q) >= 0; });
    }
    const sumInc = sumLines.filter(function (x) { return x.dir === '수입'; }).reduce(function (s, x) { return s + (Number(x.amt) || 0); }, 0);
    const sumExp = sumLines.filter(function (x) { return x.dir === '지출'; }).reduce(function (s, x) { return s + (Number(x.amt) || 0); }, 0);
    const filt = function (key, label) { return '<button type="button" data-f="' + key + '" class="' + (state.dirFilt === key ? 'on' : '') + '">' + label + '</button>'; };
    p.innerHTML = uploadCard()
      + '<div class="hint" style="margin-bottom:10px">구글 시트에 있는 거래입니다. 분류 수정은 시트에서 합니다.</div>'
      + '<div class="seg" id="segBank">' + months.map(function (ym) { return '<button type="button" data-ym="' + ym + '" class="' + (ym === state.bankMonth ? 'on' : '') + '">' + esc(J.shortYm(ym)) + '</button>'; }).join('') + '</div>'
      + '<div class="card"><h2>' + esc(J.shortYm(state.bankMonth)) + ' 합계</h2><div class="metric"><span class="n">수입 · ' + sumLines.filter(function (x) { return x.dir === '수입'; }).length + '건</span><span class="a inc">' + J.won(sumInc) + '</span></div><div class="metric"><span class="n">지출 · ' + sumLines.filter(function (x) { return x.dir === '지출'; }).length + '건</span><span class="a exp">' + J.won(sumExp) + '</span></div><div class="metric"><span class="n">전체 · ' + sumLines.length + '건</span><span class="a">' + J.won(sumInc + sumExp) + '</span></div></div>'
      + '<div class="filt">' + filt('all', '전체') + filt('inc', '수입') + filt('exp', '지출') + '</div>'
      + '<input class="search" id="bankQ" placeholder="학생·메모·분류 검색" value="' + esc(state.q) + '"/>'
      + '<div class="card"><div class="hint">거래 ' + lines.length + '건</div>' + (lines.length ? lines.map(function (l) {
        const parts = [l.dir, l.cat2, l.cat3].filter(function (x, i, arr) { return x && x !== '-' && arr[i - 1] !== x; });
        const title = l.student || l.memo || parts[parts.length - 1] || l.dir || '거래';
        const color = l.dir === '지출' ? 'var(--exp)' : ((l.cat2 === '교습비' || l.cat3 === '교습비') ? 'var(--fee)' : 'var(--inc)');
        return '<div class="line"><div><div>' + esc(title) + '</div><div class="m">' + parts.map(function (x, i) { return i === parts.length - 1 ? '<b>' + esc(x) + '</b>' : esc(x); }).join(' › ') + '</div><div class="m">' + esc((l.day || '').slice(5) || '날짜없음') + (l.memo && l.memo !== l.student ? ' · ' + esc(l.memo.slice(0, 32)) : '') + '</div></div><div class="a" style="color:' + color + '">' + J.won(l.amt) + '</div></div>';
      }).join('') : emptyBox('해당 없음')) + '</div>';
    $('segBank').querySelectorAll('button').forEach(function (b) { b.onclick = function () { state.bankMonth = b.dataset.ym; state.q = ''; render(); }; });
    p.querySelectorAll('.filt button').forEach(function (b) { b.onclick = function () { state.dirFilt = b.dataset.f; render(); }; });
    const bq = $('bankQ');
    if (bq) {
      bq.oninput = function () { state.q = bq.value; };
      bq.onchange = function () { state.q = bq.value; render(); };
      bq.onkeydown = function (e) { if (e.key === 'Enter') { state.q = bq.value; render(); } };
    }
    bindBankUpload();
  }

  function renderBoot() {
    const box = $('boot');
    if (!box) return;
    if (booting && !hasData()) {
      box.hidden = false;
      box.innerHTML = '<div class="spin"></div><div>시트를 불러오는 중</div>';
    } else box.hidden = true;
  }

  function render() {
    captureFocus();
    renderBoot();
    renderIssues();
    renderTotals();
    renderFoot();
    if (booting && !hasData()) {
      document.querySelectorAll('.panel').forEach(function (p) { p.innerHTML = ''; });
      return;
    }
    if (state.tab === 'sales') renderSales();
    else if (state.tab === 'months') renderMonths();
    else if (state.tab === 'suji') renderSuji();
    else if (state.tab === 'fee') renderFee();
    else if (state.tab === 'students') renderStudents();
    else if (state.tab === 'bank') renderBank();
    if (DEMO) window.__metrics = J.snapshot(DATA, loadSaved());
    window.__ready = true;
    restoreFocus();
  }

  function applyNewData(nd) {
    if (!nd || !nd.monthDetails) return false;
    DATA = nd;
    renderIssues();
    render();
    return true;
  }

  function _stamp() {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function _gvizRows(resp) {
    const t = resp.table, nc = t.cols.length;
    return (t.rows || []).map(function (r) {
      const out = [];
      for (let i = 0; i < nc; i++) {
        const c = (r.c || [])[i];
        out.push(c == null ? '' : (c.f != null ? String(c.f) : (c.v == null ? '' : String(c.v))));
      }
      return out;
    });
  }
  const FETCH_TRIES = 3;
  const FETCH_TIMEOUT_MS = 8000;
  const FETCH_BACKOFF_MS = [400, 900];
  let _gvizSeq = 0;
  async function fetchCsvOnce(name) {
    const gid = SHEET_GIDS[name];
    if (gid == null || !SHEET_ID) throw new Error(name + ' 불러오기 실패');
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tm = setTimeout(function () { if (ctrl) ctrl.abort(); }, FETCH_TIMEOUT_MS);
    try {
      const r = await fetch('https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/export?format=csv&gid=' + gid + '&t=' + Date.now(), {
        cache: 'no-store',
        signal: ctrl ? ctrl.signal : undefined
      });
      if (!r.ok) throw new Error(name + ' 불러오기 실패');
      const t = await r.text();
      if (!t || /^\s*<(!doctype|html)/i.test(t)) throw new Error(name + ' 불러오기 실패');
      return J.parseCsv(t);
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error(name + ' 응답 없음');
      throw e;
    } finally {
      clearTimeout(tm);
    }
  }
  function fetchSheetRowsGviz(name) {
    return new Promise(function (resolve, reject) {
      const cb = '__jangbuCb' + (++_gvizSeq) + '_' + Date.now();
      const sc = document.createElement('script');
      let settled = false;
      const finish = function (fn) {
        if (settled) return;
        settled = true;
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        sc.remove();
        clearTimeout(tm);
        fn();
      };
      const tm = setTimeout(function () { finish(function () { reject(new Error(name + ' 응답 없음')); }); }, FETCH_TIMEOUT_MS);
      window[cb] = function (resp) {
        finish(function () {
          if (!resp || resp.status === 'error' || !resp.table) reject(new Error(name + ' 읽기 실패 (시트 공개 설정을 확인해 주세요)'));
          else resolve(_gvizRows(resp));
        });
      };
      sc.onerror = function () { finish(function () { reject(new Error(name + ' 불러오기 실패')); }); };
      sc.src = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:json;responseHandler:' + cb + '&headers=0&sheet=' + encodeURIComponent(name) + '&t=' + Date.now();
      document.head.appendChild(sc);
    });
  }
  function fetchSheetRows(name) {
    return J.loadRowsRetry(function () {
      return J.tryCsvThenGviz(function () { return fetchCsvOnce(name); }, function () { return fetchSheetRowsGviz(name); });
    }, { tries: FETCH_TRIES, backoffs: FETCH_BACKOFF_MS });
  }

  function cachedLedger() {
    return (DATA && DATA.monthDetails && Object.keys(DATA.monthDetails).length) ? DATA : null;
  }

  function showSyncFailure(err) {
    const view = J.syncFailureView(err, cachedLedger());
    if (view.kind === 'stale') {
      setSyncStatus('이전 자료 ' + (J.hhmmFromCache(DATA) || ''));
      showBanner(view.banner, 'warn');
      return;
    }
    if (view.kind === 'schema') {
      setSyncStatus('머리글 확인');
      showBanner(view.banner, 'err');
      return;
    }
    setSyncStatus('시트를 불러오지 못했어요');
    showBanner(view.banner || '시트를 불러오지 못했어요', 'err');
  }

  async function syncFromSheet(_silent) {
    const btn = $('syncBtn');
    if (btn) { btn.disabled = true; btn.textContent = '동기화 중'; }
    showBanner('');
    setSyncStatus('구글 시트에서 불러오는 중');
    try {
      if (!SHEET_ID) throw new Error('장부 주소가 올바르지 않아요. 받은 주소 전체(# 뒤까지)로 다시 열어 주세요.');
      const pack = await Promise.all([
        fetchSheetRows('통장거래내역'),
        fetchSheetRows('학생 명단'),
        fetchSheetRows('휴원 기록').catch(function () { return []; })
      ]);
      const nd = J.buildLedger(pack[0], pack[1]);
      nd.restMonths = J.parseRestRows(pack[2]);
      nd.syncedAt = _stamp();
      const now = new Date();
      const p2 = function (n) { return String(n).padStart(2, '0'); };
      nd.cachedAt = now.toISOString();
      nd.cachedHHmm = p2(now.getHours()) + ':' + p2(now.getMinutes());
      applyNewData(nd);
      try { localStorage.setItem('jangbuCache', JSON.stringify(nd)); } catch (e) {}
      showBanner('');
      setSyncStatus('시트 최신 ' + nd.syncedAt);
    } catch (e) {
      showSyncFailure(e);
    } finally {
      booting = false;
      if (btn) { btn.disabled = false; btn.textContent = '새로고침'; }
      render();
    }
  }

  function bootDemo() {
    const src = window.buildDemoSource();
    const nd = J.buildLedger(src.bank, src.roster);
    nd.restMonths = J.parseRestRows(src.rest);
    nd.syncedAt = '데모';
    nd.demo = true;
    booting = false;
    applyNewData(nd);
    setSyncStatus('데모');
    const btn = $('syncBtn');
    if (btn) btn.textContent = '새로고침';
  }

  document.querySelectorAll('.tab').forEach(function (b) {
    b.addEventListener('click', function () { setTab(b.dataset.tab); });
  });
  $('syncBtn').onclick = function () {
    if (DEMO) bootDemo();
    else syncFromSheet(false);
  };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && (state.confirm || state.peek)) { state.confirm = null; state.peek = null; render(); }
  });

  render();
  if (DEMO) bootDemo();
  else {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') syncFromSheet(true);
    });
    syncFromSheet(true);
  }
})();
