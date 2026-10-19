/* 엄궁 코오롱 공부방 — 장부 계산
   브라우저와 테스트가 같이 쓰는 순수 함수. DOM 없음. */
(function (root) {
  'use strict';

  const PER_SESSION = ['손유록'];
  const LEAVE_MONTHS = 3;
  const SALES_GOAL_1 = 10000000;
  const SALES_GOAL_2 = 15000000;
  const SALES_DEADLINE = '2026-12-31';
  const SALES_AXIS_MAX = 15000000;
  const GRADE_LADDER = [
    ['초등', 1], ['초등', 2], ['초등', 3], ['초등', 4], ['초등', 5], ['초등', 6],
    ['중등', 1], ['중등', 2], ['중등', 3],
    ['고등', 1], ['고등', 2], ['고등', 3]
  ];

  let _now = function () { return new Date(); };
  function setNow(fn) { _now = fn || function () { return new Date(); }; }
  function nowDate() { return _now(); }

  function _s(v) { return v == null ? '' : String(v).trim(); }

  function _num(v) {
    let t = _s(v).replace(/[₩원,\s]/g, '');
    if (t === '') return 0;
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    const f = Number(t);
    if (!isFinite(f)) return 0;
    return neg ? -f : f;
  }

  /* 2026-09, 2026-09-01, 2026.9, 2026/9, 2026년 9월 */
  function _ym(v) {
    const t = _s(v);
    const m = /^(20\d\d)\s*[-.\/년]\s*(\d{1,2})/.exec(t);
    if (!m) return '';
    const month = Number(m[2]);
    if (month < 1 || month > 12) return '';
    return m[1] + '-' + String(month).padStart(2, '0');
  }

  function _cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function _pad(r, n) { const a = r.slice(); while (a.length < n) a.push(''); return a; }

  function _target(r) {
    const raw = _s(r[19]);
    const m = /^(\d{1,2})월/.exec(raw);
    const y = /^(\d{4})/.exec(_s(r[20]));
    if (m && y) {
      const month = Number(m[1]);
      if (month >= 1 && month <= 12) return y[1] + '-' + String(month).padStart(2, '0') + '-01';
    }
    return raw;
  }

  function parseCsv(text) {
    const rows = [];
    let row = [], f = '', q = false;
    const src = String(text || '').replace(/^\uFEFF/, '');
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (q) {
        if (c === '"') {
          if (src[i + 1] === '"') { f += '"'; i++; }
          else q = false;
        } else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
      else if (c !== '\r') f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows;
  }

  function parseRestRows(rows) {
    const out = [], seen = new Set();
    (rows || []).forEach(function (r) {
      const re = /^(20\d\d)\s*[-.\/년]\s*(\d{1,2})/;
      const c0 = String((r && r[0]) || '').trim();
      const c1 = String((r && r[1]) || '').trim();
      const sw = re.test(c0) && !re.test(c1);
      const name = sw ? c1 : c0;
      const mm = (sw ? c0 : c1).match(re);
      /* 맨 앞이 숫자이거나 한글이 없으면 버린다.
         예전에는 숫자만 있어도 버려서 학생10 같은 이름이 휴원에서 빠졌다.
         실제 한글 이름(숫자 없음)은 결과가 같다. */
      if (!name || !mm || name.length > 10) return;
      if (!/[가-힣]/.test(name) || /^\d/.test(name)) return;
      const ym = mm[1] + '-' + String(+mm[2]).padStart(2, '0');
      const k = ym + '|' + name;
      if (!seen.has(k)) { seen.add(k); out.push({ name: name, ym: ym }); }
    });
    return out;
  }

  function seoulYmd(date) {
    const d = date || nowDate();
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(d);
      const get = function (t) { return parts.find(function (p) { return p.type === t; }).value; };
      return get('year') + '-' + get('month') + '-' + get('day');
    } catch (e) {
      const x = new Date(d);
      return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    }
  }

  function currentYmSeoul() { return seoulYmd().slice(0, 7); }

  function prevYmSeoul() {
    const cur = currentYmSeoul();
    let y = Number(cur.slice(0, 4));
    let m = Number(cur.slice(5));
    m -= 1;
    if (m < 1) { m = 12; y -= 1; }
    return y + '-' + String(m).padStart(2, '0');
  }

  function daysUntil(ymd, fromYmd) {
    const a = String(ymd || '').split('-').map(Number);
    const base = fromYmd || seoulYmd();
    const b = base.split('-').map(Number);
    return Math.round((Date.UTC(a[0], a[1] - 1, a[2]) - Date.UTC(b[0], b[1] - 1, b[2])) / 86400000);
  }

  function ymListInclusive(fromYm, toYm) {
    const out = [];
    if (!fromYm || !toYm) return out;
    let y = Number(fromYm.slice(0, 4));
    let m = Number(fromYm.slice(5));
    const ty = Number(toYm.slice(0, 4));
    const tm = Number(toYm.slice(5));
    let guard = 0;
    while ((y < ty || (y === ty && m <= tm)) && guard < 240) {
      out.push(String(y) + '-' + String(m).padStart(2, '0'));
      m += 1;
      if (m > 12) { m = 1; y += 1; }
      guard++;
    }
    return out;
  }

  function fillYmGaps(list) {
    const s = (list || []).filter(Boolean).slice().sort();
    if (s.length < 2) return s;
    const all = ymListInclusive(s[0], s[s.length - 1]);
    if (!all.length || all.length > 120) return s;
    return all;
  }

  function filterYtdYms(sortedYms, endYm) {
    const list = (sortedYms || []).filter(Boolean).slice().sort();
    let end = endYm;
    if (!end) end = list.length ? list[list.length - 1] : '';
    if (!end) return [];
    return list.filter(function (ym) { return ym <= end; }).slice(-9);
  }

  function won(n) {
    const v = Math.round(Number(n) || 0);
    return v.toLocaleString('ko-KR') + '원';
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function shortYm(ym) {
    if (!ym || String(ym).indexOf('-') < 0) return ym || '';
    const p = String(ym).split('-');
    return p[0].slice(2) + '.' + Number(p[1]);
  }
  function koShortYm(ym) {
    if (!ym || String(ym).indexOf('-') < 0) return ym || '';
    const p = String(ym).split('-');
    return p[0].slice(2) + '년' + Number(p[1]) + '월';
  }
  function longYmLabel(ym) {
    if (!ym || String(ym).indexOf('-') < 0) return ym || '';
    const p = String(ym).split('-');
    return p[0] + '년 ' + Number(p[1]) + '월';
  }

  function axisLabel(v) {
    const n = Number(v) || 0;
    if (n === 0) return '0';
    if (n % 10000000 === 0) return (n / 10000000) + '천만';
    if (n % 10000 === 0) return (n / 10000) + '만';
    return won(n);
  }

  function isFeeMonthOpen(ym) {
    return !!ym && ym <= currentYmSeoul();
  }

  /* 머리글 비교. 앞뒤·사이 공백, 전각 공백, 장식 문자는 무시한다. */
  function headerKey(v) {
    return _s(v)
      .replace(/[\s\u3000]+/g, '')
      .replace(/[*＊:：;；.．·・()（）\[\]【】"'“”「」]/g, '')
      .toLowerCase();
  }

  /* 시트 상태칸. 재원/재학, 휴원/휴학, 퇴소/퇴원과 앞뒤 설명(휴원중, 퇴소함)을 같은 묶음으로 본다.
     예전에는 '재학','휴원','퇴소'와 글자가 완전히 같을 때만 묶어서, '재원'이나 '휴원중'은 기타가 됐다. */
  function statusBucket(raw) {
    const k = headerKey(raw);
    if (!k) return '기타';
    if (k.indexOf('퇴소') >= 0 || k.indexOf('퇴원') >= 0) return '퇴소';
    if (k.indexOf('휴원') >= 0 || k.indexOf('휴학') >= 0) return '휴원';
    if (k.indexOf('재원') >= 0 || k.indexOf('재학') >= 0 || k.indexOf('재적') >= 0) return '재학';
    return '기타';
  }

  function findHeaderCol(header, names) {
    const want = (names || []).map(headerKey);
    const h = header || [];
    for (let i = 0; i < h.length; i++) {
      const k = headerKey(h[i]);
      if (k && want.indexOf(k) >= 0) return i;
    }
    return -1;
  }

  /* 동의어 순서대로 찾는다. 대상자 열이 성명보다 앞에 없어도 대상자를 먼저 고른다. */
  function findHeaderColPreferred(header, names) {
    const h = header || [];
    const want = (names || []).map(headerKey);
    for (let n = 0; n < want.length; n++) {
      if (!want[n]) continue;
      for (let i = 0; i < h.length; i++) {
        if (headerKey(h[i]) === want[n]) return i;
      }
    }
    return -1;
  }

  function missingHeaderError(sheet, label) {
    const err = new Error(sheet + '에서 ‘' + label + '’ 열을 찾지 못했어요.');
    err.code = 'missing-header';
    err.sheet = sheet;
    err.header = label;
    return err;
  }

  const ROSTER_FIELDS = [
    { key: 'name', label: '이름', fallback: 1, synonyms: ['이름', '성명', '성함', '학생명', '학생이름'] },
    { key: 'grade1', label: '학년1', fallback: 4, synonyms: ['학년1', '학년', '학교급'] },
    { key: 'grade2', label: '학년2', fallback: 5, synonyms: ['학년2', '학년수', '상세학년'] },
    { key: 'status', label: '상태', fallback: 7, synonyms: ['상태', '재학상태', '재원상태'] },
    { key: 'tuition', label: '교습비', fallback: 8, synonyms: ['교습비', '수강료', '월교습비'] }
  ];
  const ROSTER_EXTRA_CONFLICTS = ['학교', '학교명', '주소', '거주지', '번호', '순번'];
  const PAY_MONTH_FIELD = {
    label: '납부월', fallback: 19, sheet: '통장거래내역',
    synonyms: ['납부월', '대상월', '청구월', '수업월', '적용월', '납부대상월']
  };
  const PAY_YEAR_FIELD = {
    label: '납부년도', fallback: 20, sheet: '통장거래내역',
    synonyms: ['납부년', '납부년도', '납부연도', '년도', '연도']
  };
  const BANK_FIELDS = [
    { key: 'day', label: '날짜', fallback: 0, sheet: '통장거래내역', synonyms: ['날짜', '거래일', '거래일자', '일자', '승인일', '승인일자'] },
    { key: 'memo', label: '적요', fallback: 5, sheet: '통장거래내역', synonyms: ['적요', '내용', '메모', '거래내용', '통장적요'] },
    { key: 'ym', label: '거래월', fallback: 8, sheet: '통장거래내역', synonyms: ['거래월', '년월', '기준월', '귀속월'] },
    { key: 'dir', label: '구분', fallback: 9, sheet: '통장거래내역', synonyms: ['구분', '수입지출', '입출', '유형'] },
    { key: 'cat2', label: '중분류', fallback: 10, sheet: '통장거래내역', synonyms: ['중분류', '분류'] },
    { key: 'cat3', label: '소분류', fallback: 11, sheet: '통장거래내역', synonyms: ['소분류', '세부분류', '상세분류'] },
    { key: 'amt', label: '금액', fallback: 12, sheet: '통장거래내역', synonyms: ['금액', '거래금액', '입출금액'] },
    { key: 'student', label: '대상자', fallback: 16, sheet: '통장거래내역', synonyms: ['대상자', '학생명', '학생이름', '성명', '학생'] },
    { key: 'grade', label: '학년', fallback: 17, sheet: '통장거래내역', synonyms: ['학년'] }
  ];
  const BANK_CANON = { day: 0, memo: 5, ym: 8, dir: 9, cat2: 10, cat3: 11, amt: 12, student: 16, grade: 17 };
  const BANK_DECOY = ['번호', '순번', '잔액', '잔고', '비고', '참고', '기타', '대분류'];
  const BANK_CONFLICTS = ['대상자', '금액', '적요', '내용', '날짜', '거래일', '거래일자', '구분', '수입지출', '대분류', '중분류', '소분류', '분류', '학년'];
  const SESSION_MARKS = ['횟수', '횟수제', '횟수등록', '회차', '회차등록', '세션'];
  const PAY_TYPE_HEADERS = ['납부방식', '결제방식', '수강형태', '등록형태'];

  function rosterConflicts(field) {
    const out = ROSTER_EXTRA_CONFLICTS.map(headerKey);
    ROSTER_FIELDS.forEach(function (other) {
      if (other.key === field.key) return;
      other.synonyms.forEach(function (s) { out.push(headerKey(s)); });
    });
    return out;
  }

  function bankConflicts(field) {
    const out = BANK_CONFLICTS.map(headerKey);
    const other = field === PAY_MONTH_FIELD ? PAY_YEAR_FIELD : PAY_MONTH_FIELD;
    other.synonyms.forEach(function (s) { out.push(headerKey(s)); });
    return out;
  }

  /* 머리글이 있으면 그 열을 쓰고, 없으면 예전 고정 위치를 쓴다.
     고정 위치에 다른 머리글이 있으면 잘못된 열을 읽지 않고 빠뜨린 머리글 이름을 알린다. */
  function pickColumn(header, field, conflicts) {
    const idx = findHeaderCol(header, field.synonyms);
    if (idx >= 0) return idx;
    const cell = header && field.fallback < header.length ? header[field.fallback] : '';
    const fbKey = headerKey(cell);
    if (fbKey && conflicts.indexOf(fbKey) >= 0) {
      throw missingHeaderError(field.sheet || '학생 명단', field.label);
    }
    return field.fallback;
  }

  function bankFieldConflicts(field) {
    const out = BANK_DECOY.map(headerKey);
    BANK_FIELDS.forEach(function (other) {
      if (other.key === field.key) return;
      other.synonyms.forEach(function (s) { out.push(headerKey(s)); });
    });
    PAY_MONTH_FIELD.synonyms.forEach(function (s) { out.push(headerKey(s)); });
    PAY_YEAR_FIELD.synonyms.forEach(function (s) { out.push(headerKey(s)); });
    return out;
  }

  function pickBankColumn(header, field, used) {
    const want = field.synonyms.map(headerKey);
    let idx = -1;
    for (let n = 0; n < want.length && idx < 0; n++) {
      if (!want[n]) continue;
      for (let i = 0; i < (header || []).length; i++) {
        if (used[i]) continue;
        if (headerKey(header[i]) === want[n]) { idx = i; break; }
      }
    }
    if (idx >= 0) return idx;
    if (used[field.fallback]) throw missingHeaderError('통장거래내역', field.label);
    const cell = header && field.fallback < header.length ? header[field.fallback] : '';
    const fbKey = headerKey(cell);
    if (fbKey && bankFieldConflicts(field).indexOf(fbKey) >= 0) {
      throw missingHeaderError('통장거래내역', field.label);
    }
    return field.fallback;
  }

  function bankHeaderScore(row) {
    const who = findHeaderColPreferred(row, (BANK_FIELDS.find(function (f) { return f.key === 'student'; }) || {}).synonyms || []);
    if (who < 0) return 0;
    let n = 1;
    BANK_FIELDS.forEach(function (f) {
      if (f.key === 'student') return;
      if (findHeaderColPreferred(row, f.synonyms) >= 0) n++;
    });
    if (findHeaderCol(row, PAY_MONTH_FIELD.synonyms) >= 0) n++;
    if (findHeaderCol(row, PAY_YEAR_FIELD.synonyms) >= 0) n++;
    return n;
  }

  function findBankHeaderIndex(rows) {
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < (rows || []).length; i++) {
      const sc = bankHeaderScore(rows[i] || []);
      if (sc > bestScore) { best = i; bestScore = sc; }
    }
    return best;
  }

  function isSessionMark(v) {
    const k = headerKey(v);
    return !!k && SESSION_MARKS.map(headerKey).indexOf(k) >= 0;
  }

  function isSessionStudent(st) {
    if (!st) return false;
    if (PER_SESSION.indexOf(st.name) >= 0) return true;
    return isSessionMark(st.status) || isSessionMark(st.payType);
  }

  function sessionNames(data) {
    const seen = {};
    const out = [];
    function add(n) {
      const name = _s(n);
      if (!name || seen[name]) return;
      seen[name] = 1;
      out.push(name);
    }
    PER_SESSION.forEach(add);
    ((data && data.students) || []).forEach(function (st) {
      if (isSessionStudent(st)) add(st.name);
    });
    return out;
  }

  function rosterHeaderScore(row) {
    let n = 0;
    let hasName = false;
    ROSTER_FIELDS.forEach(function (f) {
      if (findHeaderCol(row, f.synonyms) < 0) return;
      n++;
      if (f.key === 'name') hasName = true;
    });
    if (!hasName || n < 2) return 0;
    return n;
  }

  function resolveRoster(rows) {
    const list = rows || [];
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < list.length; i++) {
      const sc = rosterHeaderScore(list[i] || []);
      if (sc > bestScore) { best = i; bestScore = sc; }
    }
    if (best < 0) {
      const cols = {};
      ROSTER_FIELDS.forEach(function (f) { cols[f.key] = f.fallback; });
      cols.payType = -1;
      return { headerIndex: 0, cols: cols };
    }
    const header = list[best];
    const cols = {};
    ROSTER_FIELDS.forEach(function (f) {
      cols[f.key] = pickColumn(header, f, rosterConflicts(f));
    });
    cols.payType = findHeaderCol(header, PAY_TYPE_HEADERS);
    return { headerIndex: best, cols: cols };
  }

  function isRosterSkipName(name) {
    const t = _s(name);
    if (!t) return true;
    const k = headerKey(t);
    if (!k) return true;
    if (['이름', '성명', '학생명', '학생이름', '합계', '총계', '총합', '소계', '합계금액', '대기명단', '퇴소명단', '휴원명단', '재학명단'].indexOf(k) >= 0) return true;
    if (k.indexOf('명단') >= 0 && k.length <= 16) return true;
    if (k.indexOf('합계') >= 0 || k.indexOf('총계') >= 0 || k.indexOf('소계') >= 0) return true;
    return false;
  }

  function delayMs(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /* 한 번 = CSV 다음 gviz. 전체가 실패하면 tries만큼, 사이에는 짧은 대기를 둔다. */
  async function tryCsvThenGviz(csvFn, gvizFn) {
    try {
      const rows = await csvFn();
      if (rows && rows.length) return rows;
    } catch (e) { /* gviz로 넘어간다 */ }
    return gvizFn();
  }

  /* gviz는 큰 탭에서 뒤쪽 일부만 주거나 날짜 칸을 비우기도 한다. 그런 자료는 반영하지 않는다. */
  function partialDataError(msg) {
    const err = new Error(msg);
    err.code = 'partial-data';
    return err;
  }

  function checkBankRows(rows) {
    rows = rows || [];
    let hi = -1;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      if ((rows[i] || []).some(function (c) { return _s(c).trim() === '거래일자'; })) { hi = i; break; }
    }
    if (hi < 0) throw partialDataError('통장거래내역 일부만 받아져서(머리글 없음) 반영하지 않았어요');
    const header = rows[hi].map(function (c) { return _s(c).trim(); });
    const dateIdx = header.indexOf('거래일자');
    const outIdx = header.findIndex(function (h) { return h.indexOf('출금') === 0; });
    const inIdx = header.findIndex(function (h) { return h.indexOf('입금') === 0; });
    let total = 0, bad = 0;
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const hasMoney = (outIdx >= 0 && _s(r[outIdx]).trim()) || (inIdx >= 0 && _s(r[inIdx]).trim());
      if (!hasMoney) continue; /* 나눠 적은 줄(A~H 빈칸)과 빈 줄은 세지 않는다 */
      total++;
      if (!_s(r[dateIdx]).trim()) bad++;
    }
    if (total && bad / total > 0.05) {
      throw partialDataError('통장거래내역 날짜가 빠진 줄이 ' + bad + '개라 반영하지 않았어요');
    }
    return rows;
  }

  /* CSV를 tries만큼 먼저 다시 시도하고, 그래도 안 될 때만 gviz. 둘 다 validate를 통과해야 한다. */
  async function loadCsvThenGviz(csvFn, gvizFn, opts) {
    opts = opts || {};
    const validate = opts.validate || function () {};
    let csvErr = null;
    try {
      const rows = await loadRowsRetry(async function (i) {
        const r = await csvFn(i);
        if (!r || !r.length) throw new Error('빈 응답');
        return r;
      }, opts);
      validate(rows);
      return rows;
    } catch (e) { csvErr = e; /* gviz로 넘어간다 */ }
    let rows;
    try {
      rows = await gvizFn();
    } catch (e) {
      /* 둘 다 실패면 CSV 쪽 이유가 더 정확하다 (gviz는 탭 이름 변형별 실패만 남는다) */
      if (e && e.code === 'partial-data') throw e;
      throw csvErr || e;
    }
    if (!rows || !rows.length) throw csvErr || new Error('불러오기 실패');
    validate(rows);
    rows.viaFallback = true;
    return rows;
  }

  async function loadRowsRetry(loadOnce, opts) {
    const tries = (opts && opts.tries) || 3;
    const backoffs = (opts && opts.backoffs) || [400, 900];
    const sleep = (opts && opts.sleep) || delayMs;
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try {
        const rows = await loadOnce(i);
        if (!rows) throw new Error('불러오기 실패');
        return rows;
      } catch (e) {
        lastErr = e;
        if (i < tries - 1) {
          const wait = backoffs[i] != null ? backoffs[i] : backoffs[backoffs.length - 1];
          await sleep(wait || 0);
        }
      }
    }
    throw lastErr || new Error('불러오기 실패');
  }

  function hhmmFromCache(cache) {
    if (!cache) return '';
    if (cache.cachedHHmm && /^\d{1,2}:\d{2}$/.test(String(cache.cachedHHmm))) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(cache.cachedHHmm));
      return String(m[1]).padStart(2, '0') + ':' + m[2];
    }
    const sources = [cache.cachedAt, cache.syncedAt, cache.updated];
    for (let i = 0; i < sources.length; i++) {
      const s = _s(sources[i]);
      if (!s) continue;
      const m = /(\d{1,2}):(\d{2})/.exec(s);
      if (m) return String(m[1]).padStart(2, '0') + ':' + m[2];
    }
    return '';
  }

  function syncFailureView(err, cache) {
    const has = !!(cache && cache.monthDetails && Object.keys(cache.monthDetails).length);
    if (err && err.code === 'missing-header') {
      return { kind: 'schema', banner: err.message, data: has ? cache : null };
    }
    if (has) {
      const hhmm = hhmmFromCache(cache);
      const banner = hhmm
        ? ('최신 자료를 불러오지 못해 ' + hhmm + ' 기준 자료를 보여 줘요')
        : '최신 자료를 불러오지 못해 이전에 저장한 자료를 보여 줘요';
      return { kind: 'stale', banner: banner, data: cache };
    }
    const msg = (err && err.message) ? String(err.message) : '시트를 불러오지 못했어요';
    return { kind: 'empty', banner: msg, data: null };
  }

  function sheetWidth(rows, least) {
    let n = least || 30;
    (rows || []).forEach(function (r) { if (r && r.length > n) n = r.length; });
    return n;
  }

  function buildLedger(bankRows, rosRows) {
    const bankRaw = bankRows || [];
    const hi = findBankHeaderIndex(bankRaw);
    if (hi < 0) throw missingHeaderError('통장거래내역', '대상자');
    const bankHeader = bankRaw[hi] || [];
    const used = {};
    const bcols = {};
    BANK_FIELDS.forEach(function (f) {
      bcols[f.key] = pickBankColumn(bankHeader, f, used);
      used[bcols[f.key]] = f.key;
    });
    const monthIdx = pickColumn(bankHeader, PAY_MONTH_FIELD, bankConflicts(PAY_MONTH_FIELD));
    if (used[monthIdx]) throw missingHeaderError('통장거래내역', PAY_MONTH_FIELD.label);
    used[monthIdx] = 'month';
    const yearIdx = pickColumn(bankHeader, PAY_YEAR_FIELD, bankConflicts(PAY_YEAR_FIELD));
    if (used[yearIdx]) throw missingHeaderError('통장거래내역', PAY_YEAR_FIELD.label);
    const bankWidth = Math.max(
      sheetWidth(bankRaw, 30), monthIdx + 1, yearIdx + 1,
      bcols.day + 1, bcols.memo + 1, bcols.ym + 1, bcols.dir + 1, bcols.cat2 + 1,
      bcols.cat3 + 1, bcols.amt + 1, bcols.student + 1, bcols.grade + 1
    );
    const B = bankRaw.map(function (r) { return _pad(r || [], bankWidth); });
    let carryYear = '';
    let carry = null;
    const bank = B.slice(hi + 1).map(function (r) {
      const row = r.slice();
      function cell(idx) { return idx >= 0 && r[idx] != null ? r[idx] : ''; }
      function yearOf(v) { const m = /(20\d\d)/.exec(_s(v)); return m ? m[1] : ''; }
      row[BANK_CANON.day] = cell(bcols.day);
      row[BANK_CANON.memo] = cell(bcols.memo);
      row[BANK_CANON.ym] = cell(bcols.ym);
      row[BANK_CANON.dir] = cell(bcols.dir);
      row[BANK_CANON.cat2] = cell(bcols.cat2);
      row[BANK_CANON.cat3] = cell(bcols.cat3);
      row[BANK_CANON.amt] = cell(bcols.amt);
      row[BANK_CANON.student] = cell(bcols.student);
      row[BANK_CANON.grade] = cell(bcols.grade);
      row[19] = cell(monthIdx);
      row[20] = cell(yearIdx);
      /* 병합된 셀은 첫 줄에만 날짜·거래월·구분·연도가 있고 아래는 빈 칸이다. */
      const hadDay = !!_s(row[BANK_CANON.day]);
      const hadYm = !!_ym(row[BANK_CANON.ym]);
      const yPay = yearOf(row[20]);
      const yDay = yearOf(row[BANK_CANON.day]);
      if (yPay) carryYear = yPay;
      else if (yDay) carryYear = yDay;
      if (!_s(row[20]) && /^\d{1,2}월/.test(_s(row[19]))) {
        const y = yDay || carryYear;
        if (y) row[20] = y;
      }
      if (!hadYm && _ym(row[BANK_CANON.day])) row[BANK_CANON.ym] = _ym(row[BANK_CANON.day]);
      const totalish = [row[BANK_CANON.memo], row[BANK_CANON.cat2], row[BANK_CANON.cat3]].some(function (t) {
        const k = _s(t).replace(/\s/g, '');
        return k === '합계' || k === '총계' || k === '총합' || k === '소계' || k === '합계금액';
      });
      if (!hadDay && !hadYm && carry && _num(row[BANK_CANON.amt]) !== 0 && !totalish) {
        row[BANK_CANON.ym] = carry.ym;
        row[BANK_CANON.day] = carry.day;
        if (!_s(row[BANK_CANON.dir]) && carry.dir) row[BANK_CANON.dir] = carry.dir;
        if (!_s(row[BANK_CANON.cat2]) && carry.cat2) row[BANK_CANON.cat2] = carry.cat2;
        if (!_s(row[BANK_CANON.cat3]) && carry.cat3) row[BANK_CANON.cat3] = carry.cat3;
        if (!_s(row[19]) && carry.pay) row[19] = carry.pay;
        if (!_s(row[20]) && carry.year) row[20] = carry.year;
      }
      row[19] = _target(row);
      const ymNow = _ym(row[BANK_CANON.ym]);
      if ((hadDay || hadYm) && ymNow) {
        carry = {
          ym: ymNow,
          day: _s(row[BANK_CANON.day]),
          dir: _s(row[BANK_CANON.dir]),
          cat2: _s(row[BANK_CANON.cat2]),
          cat3: _s(row[BANK_CANON.cat3]),
          pay: _s(row[19]),
          year: yearOf(row[20]) || yearOf(row[19])
        };
        if (carry.year) carryYear = carry.year;
      }
      return row;
    });
    const layout = resolveRoster(rosRows || []);
    const cols = layout.cols;
    const rosWidth = Math.max(sheetWidth(rosRows, 30), cols.name + 1, cols.grade1 + 1, cols.grade2 + 1, cols.status + 1, cols.tuition + 1, cols.payType >= 0 ? cols.payType + 1 : 0);
    const ros = (rosRows || []).map(function (r) { return _pad(r || [], rosWidth); });
    const header = ros[layout.headerIndex] || [];
    const schoolIdx = findHeaderCol(header, ['학교', '학교명']);
    const addrIdx = findHeaderCol(header, ['주소', '거주지']);

    const issues = [];
    let parent = null;
    bank.forEach(function (r) {
      if (_s(r[0])) parent = r;
      if (_s(r[10]) !== '교습비' || _s(r[9]) !== '수입') return;
      const mRaw = _s(r[12]);
      const mNum = mRaw.replace(/[₩원,\s]/g, '');
      const miss = [];
      if (!_s(r[16])) miss.push('대상자');
      if (!_ym(r[19])) miss.push('납부월');
      if (mRaw === '' || !isFinite(Number(mNum))) miss.push('금액');
      if (!miss.length) return;
      const pr = parent || r;
      issues.push({
        day: _s(pr[0]),
        memo: _s(pr[5]),
        amt: (mRaw !== '' && isFinite(Number(mNum))) ? Number(mNum) : null,
        miss: miss
      });
    });

    const GORDER = { '초등': 0, '중등': 1, '고등': 2, '성인': 3 };
    const BORDER = { '재학': 0, '휴원': 1, '퇴소': 2, '기타': 3 };
    const students = [];
    ros.slice(layout.headerIndex + 1).forEach(function (r) {
      const name = _s(r[cols.name]);
      if (isRosterSkipName(name) || headerKey(r[cols.status]) === '상태') return;
      const status = _s(r[cols.status]) || '미정';
      const g1 = _s(r[cols.grade1]);
      const g2v = _s(r[cols.grade2]) !== '' ? _num(r[cols.grade2]) : null;
      const grade = (g1 + (g2v != null ? ' ' + g2v : '')).trim();
      const bucket = statusBucket(status);
      const st = { name: name, grade1: g1, grade2: g2v, grade: grade, status: status, tuition: _num(r[cols.tuition]), bucket: bucket };
      if (cols.payType >= 0 && _s(r[cols.payType])) st.payType = _s(r[cols.payType]);
      if (schoolIdx >= 0 && _s(r[schoolIdx])) st.school = _s(r[schoolIdx]);
      if (addrIdx >= 0 && _s(r[addrIdx])) st.address = _s(r[addrIdx]);
      students.push(st);
    });
    const gk = function (x) {
      return [BORDER[x.bucket], (x.grade1 in GORDER) ? GORDER[x.grade1] : 9, typeof x.grade2 === 'number' ? x.grade2 : 99, x.name];
    };
    students.sort(function (a, b) {
      const A = gk(a), Bk = gk(b);
      for (let i = 0; i < 4; i++) { const c = _cmp(A[i], Bk[i]); if (c) return c; }
      return 0;
    });

    const md = {};
    bank.forEach(function (r) {
      const ym = _ym(r[8]);
      if (!ym) return;
      const e = {
        dir: _s(r[9]), cat2: _s(r[10]), cat3: _s(r[11]), amt: _num(r[12]),
        day: _s(r[0]), memo: _s(r[5]), student: _s(r[16]), grade: _s(r[17])
      };
      if (e.amt === 0 || (e.dir !== '수입' && e.dir !== '지출')) return;
      (md[ym] = md[ym] || []).push(e);
    });
    const mdSorted = {};
    Object.keys(md).sort().forEach(function (k) { mdSorted[k] = md[k]; });

    const fee = bank.filter(function (r) {
      return _s(r[10]) === '교습비' && _s(r[9]) === '수입' && _s(r[16]) && _ym(r[19]);
    });
    const enroll = {};
    fee.forEach(function (r) {
      const n = _s(r[16]);
      const m = _ym(r[19]);
      if (_num(r[12]) > 0 && (!(n in enroll) || m < enroll[n])) enroll[n] = m;
    });
    const roster = {};
    students.forEach(function (st) { if (!(st.name in roster)) roster[st.name] = st; });
    const billRaw = [];
    const seenBill = new Set();
    fee.forEach(function (r) {
      const ym = _ym(r[19]);
      if (ym && !seenBill.has(ym)) { seenBill.add(ym); billRaw.push(ym); }
    });
    billRaw.sort();
    const bill = fillYmGaps(billRaw);
    const tuition = {};
    bill.forEach(function (ym) {
      const agg = new Map();
      fee.forEach(function (r) {
        if (_ym(r[19]) !== ym) return;
        const n = _s(r[16]);
        if (!agg.has(n)) agg.set(n, { name: n, amt: 0, grade: _s(r[17]), day: '' });
        const a = agg.get(n);
        a.amt += _num(r[12]);
        const dy = _s(r[0]);
        if (dy && _num(r[12]) > 0 && dy > a.day) a.day = dy;
      });
      const paid = [];
      agg.forEach(function (a) {
        if (a.amt <= 0) return;
        paid.push({
          name: a.name, amt: a.amt, expected: (roster[a.name] || {}).tuition || 0,
          grade: a.grade, day: a.day, status: 'paid'
        });
      });
      paid.sort(function (x, y) { return (y.amt - x.amt) || _cmp(x.name, y.name); });
      const pn = new Set(paid.map(function (p) { return p.name; }));
      const unpaid = [];
      students.forEach(function (st) {
        if (st.bucket !== '재학' || pn.has(st.name)) return;
        const en = enroll[st.name];
        if (!en || en > ym) return;
        unpaid.push({
          name: st.name, amt: 0, expected: st.tuition || 0, grade: st.grade,
          day: '', status: 'unpaid', enroll: en
        });
      });
      unpaid.sort(function (x, y) { return (y.expected - x.expected) || _cmp(x.name, y.name); });
      tuition[ym] = {
        paidTotal: paid.reduce(function (t, p) { return t + p.amt; }, 0),
        paidCount: paid.length,
        unpaidTotal: unpaid.reduce(function (t, u) { return t + u.expected; }, 0),
        unpaidCount: unpaid.length,
        paid: paid,
        unpaid: unpaid
      };
    });

    const months = [];
    const suji = {};
    const tot = { income: 0, expense: 0, fee: 0 };
    const byAbs = function (a, b) { return Math.abs(b[1]) - Math.abs(a[1]); };
    Object.keys(mdSorted).forEach(function (ym) {
      const v = mdSorted[ym];
      let inc = 0, exp = 0, fe = 0;
      const c = new Map();
      v.forEach(function (x) {
        if (x.dir === '수입') inc += x.amt;
        if (x.dir === '지출') exp += x.amt;
        if (x.dir === '수입' && (x.cat2 === '교습비' || x.cat3 === '교습비')) fe += x.amt;
        const k = x.dir + '/' + x.cat2;
        c.set(k, (c.get(k) || 0) + x.amt);
      });
      const top = [];
      c.forEach(function (val, k) { if (val !== 0) top.push({ k: k, v: val }); });
      top.sort(function (a, b) { return Math.abs(b.v) - Math.abs(a.v); });
      months.push({ ym: ym, income: inc, expense: exp, fee: fe, top: top });
      const tree = new Map();
      v.forEach(function (x) {
        if (!tree.has(x.dir)) tree.set(x.dir, new Map());
        const c2 = tree.get(x.dir);
        if (!c2.has(x.cat2)) c2.set(x.cat2, new Map());
        const c3 = c2.get(x.cat2);
        c3.set(x.cat3, (c3.get(x.cat3) || 0) + x.amt);
      });
      const sj = [];
      const dirs = ['수입', '지출'].filter(function (d) { return tree.has(d); });
      tree.forEach(function (_, dname) { if (dirs.indexOf(dname) < 0) dirs.push(dname); });
      dirs.forEach(function (dname) {
        const c2 = tree.get(dname);
        const kids = [];
        c2.forEach(function (c3, c2n) {
          const k3 = [];
          c3.forEach(function (amt, name) { k3.push({ name: name, amt: amt }); });
          k3.sort(function (a, b) { return Math.abs(b.amt) - Math.abs(a.amt); });
          kids.push({ name: c2n, amt: k3.reduce(function (t, k) { return t + k.amt; }, 0), kids: k3 });
        });
        kids.sort(function (a, b) { return Math.abs(b.amt) - Math.abs(a.amt); });
        sj.push({ name: dname, amt: kids.reduce(function (t, k) { return t + k.amt; }, 0), kids: kids });
      });
      suji[ym] = sj;
      tot.income += inc;
      tot.expense += exp;
      tot.fee += fe;
    });

    const latest = bill.length ? bill[bill.length - 1] : '';
    const first = months.length ? months[0].ym : latest;
    const fmt = function (ym) { return ym ? ym.slice(0, 4) + '.' + (+ym.slice(5)) : ''; };
    const now = nowDate();
    const p2 = function (n) { return String(n).padStart(2, '0'); };
    return {
      title: '엄궁 코오롱 공부방',
      scope: fmt(first) + ' ~ ' + fmt(latest),
      note: '교습비 입금 있는 달까지(' + latest + ') · 납부=순액>0 · 미납=재학·첫납부월 이후',
      updated: now.getFullYear() + '-' + p2(now.getMonth() + 1) + '-' + p2(now.getDate()),
      latestFeeMonth: latest,
      totals: tot,
      months: months,
      monthDetails: mdSorted,
      suji: suji,
      tuition: tuition,
      billMonths: bill,
      enroll: enroll,
      students: students,
      issues: issues
    };
  }

  function excludedMap(data) {
    const m = {};
    const sessions = {};
    sessionNames(data).forEach(function (n) { sessions[n] = 1; });
    ((data && data.restMonths) || []).forEach(function (x) {
      if (!x || !x.ym || !x.name || sessions[x.name]) return;
      m[x.ym + '|' + x.name] = { ym: x.ym, name: x.name, sheet: true };
    });
    Object.keys((data && data.tuition) || {}).forEach(function (ym) {
      Object.keys(sessions).forEach(function (n) {
        m[ym + '|' + n] = { ym: ym, name: n, sheet: true, session: true };
      });
    });
    return m;
  }

  function unpaidVisible(data, ym, excluded) {
    if (!isFeeMonthOpen(ym)) return [];
    const block = (data.tuition || {})[ym] || { unpaid: [] };
    const ex = excluded || excludedMap(data);
    return (block.unpaid || []).filter(function (s) { return !ex[ym + '|' + s.name]; });
  }

  function rosterMap(data) {
    const yms = Object.keys((data && data.tuition) || {}).filter(Boolean).sort();
    const cache = {};
    yms.forEach(function (m) { cache[m] = new Set(); });
    if (!yms.length) return cache;
    const rest = yms.map(function (ym) {
      return new Set(((data.restMonths || []).filter(function (x) { return x && x.ym === ym; })).map(function (x) { return x.name; }));
    });
    const paid = yms.map(function (ym) {
      return new Set((((data.tuition[ym] || {}).paid) || []).map(function (x) { return x && x.name; }).filter(Boolean));
    });
    const gone = new Set((data.students || []).filter(function (x) { return x && x.bucket === '퇴소'; }).map(function (x) { return x.name; }));
    const session = new Set(sessionNames(data));
    const pv = prevYmSeoul();
    let lastIdx = yms.length - 1;
    while (lastIdx > 0 && yms[lastIdx] > pv) lastIdx--;
    if (yms[lastIdx] > pv) lastIdx = -1;
    const names = new Set();
    paid.forEach(function (ss) { ss.forEach(function (n) { names.add(n); }); });
    names.forEach(function (n) {
      const pi = [];
      paid.forEach(function (ss, k) { if (ss.has(n)) pi.push(k); });
      yms.forEach(function (m, k) {
        if (paid[k].has(n)) { cache[m].add(n); return; }
        if (session.has(n)) {
          if (!gone.has(n) && pi.some(function (x) { return x < k; })) cache[m].add(n);
          return;
        }
        if (rest[k].has(n)) return;
        const prevPays = pi.filter(function (x) { return x < k; });
        if (!prevPays.length) return;
        const last = prevPays[prevPays.length - 1];
        const next = pi.find(function (x) { return x > k; });
        const gapOf = function (a, b) {
          let g = 0;
          for (let j = a + 1; j < b; j++) if (!rest[j].has(n)) g++;
          return g;
        };
        if (next != null) {
          if (gapOf(last, next) < LEAVE_MONTHS) cache[m].add(n);
          return;
        }
        if (gone.has(n)) return;
        if (lastIdx >= 0 && k <= lastIdx && gapOf(last, lastIdx + 1) < LEAVE_MONTHS) cache[m].add(n);
      });
    });
    return cache;
  }

  function namesDelta(beforeSet, afterSet, mode) {
    const out = [];
    if (mode === 'enter') {
      afterSet.forEach(function (n) { if (!beforeSet.has(n)) out.push(n); });
    } else {
      beforeSet.forEach(function (n) { if (!afterSet.has(n)) out.push(n); });
    }
    out.sort(function (a, b) { return a.localeCompare(b, 'ko'); });
    return out;
  }

  function sortNames(list) {
    return list.sort(function (a, b) { return String(a).localeCompare(String(b), 'ko'); });
  }

  /* 월별 휴원·퇴소 인원. 재원(roster)에 있는 달은 빼서 한 학생이 두 선에 동시에 들어가지 않는다.
     휴원 기록은 그달 명단이고, 상태만 휴원·퇴소인 학생은 마지막 재원 다음 달부터 센다.
     납부 이력이 없으면 과거를 만들지 않고 보이는 마지막 달에만 넣는다.
     이름은 시트에 있는 것을 쓰므로 명단이 바뀌어도 같은 규칙으로 센다. */
  function statusHeads(data, shown, roster) {
    const restBy = {};
    ((data && data.restMonths) || []).forEach(function (x) {
      if (!x || !x.ym || !x.name) return;
      (restBy[x.ym] = restBy[x.ym] || new Set()).add(x.name);
    });
    const kindOf = {};
    ((data && data.students) || []).forEach(function (st) {
      if (!st || !st.name || kindOf[st.name]) return;
      kindOf[st.name] = statusBucket(st.status || st.bucket || '');
    });
    const lastEnrolled = {};
    Object.keys(roster || {}).sort().forEach(function (ym) {
      (roster[ym] || new Set()).forEach(function (n) { lastEnrolled[n] = ym; });
    });
    const lastShown = shown.length ? shown[shown.length - 1] : '';
    return shown.map(function (ym) {
      const enr = (roster && roster[ym]) || new Set();
      const rest = restBy[ym] || new Set();
      const leave = new Set();
      const gone = new Set();
      const seen = {};
      function consider(n) {
        if (!n || seen[n] || enr.has(n)) return;
        seen[n] = 1;
        const kind = kindOf[n] || '';
        const last = lastEnrolled[n] || '';
        if (rest.has(n)) { leave.add(n); return; }
        const after = last ? ym > last : ym === lastShown;
        if (!after) return;
        if (kind === '휴원') leave.add(n);
        else if (kind === '퇴소') gone.add(n);
      }
      Object.keys(kindOf).forEach(consider);
      rest.forEach(consider);
      return {
        onLeave: leave.size,
        withdrawn: gone.size,
        onLeaveNames: sortNames(Array.from(leave)),
        withdrawnNames: sortNames(Array.from(gone))
      };
    });
  }

  function flowSeries(data) {
    const roster = rosterMap(data);
    const yms = Object.keys(roster).sort();
    const prevCut = prevYmSeoul();
    const shown = yms.filter(function (ym) { return ym <= prevCut; });
    const heads = statusHeads(data, shown, roster);
    return shown.map(function (ym, idx) {
      const i = yms.indexOf(ym);
      const prev = i > 0 ? yms[i - 1] : null;
      const entered = prev ? namesDelta(roster[prev], roster[ym], 'enter') : [];
      const left = prev ? namesDelta(roster[prev], roster[ym], 'leave') : [];
      const head = heads[idx] || { onLeave: 0, withdrawn: 0, onLeaveNames: [], withdrawnNames: [] };
      return {
        ym: ym,
        enrolled: roster[ym].size,
        entered: entered.length,
        left: left.length,
        enteredNames: entered,
        leftNames: left,
        onLeave: head.onLeave,
        /* 퇴소 선은 그달 재원에서 빠진 학생(3개월 미납 소급, 상태 퇴소, 휴원 기록 달). 2026-10-01 합의 규칙. */
        withdrawn: left.length,
        onLeaveNames: head.onLeaveNames,
        withdrawnNames: left
      };
    });
  }

  function monthParts(data, ym) {
    const tree = (data.suji && data.suji[ym]) || [];
    const inc = tree.find(function (x) { return x.name === '수입'; }) || { amt: 0, kids: [] };
    const exp = tree.find(function (x) { return x.name === '지출'; }) || { amt: 0, kids: [] };
    return { inc: inc, exp: exp };
  }

  function cashSeries(data) {
    return Object.keys(data.suji || {}).filter(Boolean).sort().map(function (ym) {
      const p = monthParts(data, ym);
      const income = Number(p.inc.amt) || 0;
      const expense = Number(p.exp.amt) || 0;
      return { ym: ym, income: income, expense: expense, flow: income - expense };
    });
  }

  function gradeAsOfYear(data) {
    const raw = (data.gradeAsOf != null && data.gradeAsOf !== '')
      ? String(data.gradeAsOf)
      : String(data.updated || currentYmSeoul());
    const y = parseInt(raw.slice(0, 4), 10);
    return Number.isFinite(y) ? y : parseInt(currentYmSeoul().slice(0, 4), 10);
  }

  function parseGrade(s) {
    const g1 = (s && s.grade1) ? String(s.grade1).trim() : '';
    const g2raw = s && s.grade2;
    let g2 = (g2raw != null && g2raw !== '') ? Number(g2raw) : NaN;
    if (!g1 && s && s.grade) {
      const m = String(s.grade).trim().match(/^(초등|중등|고등)\s*(\d+)/);
      if (m) return { g1: m[1], g2: Number(m[2]), label: m[1] + ' ' + m[2] };
      if (String(s.grade).indexOf('성인') >= 0) return { g1: '성인', g2: null, label: '성인' };
    }
    if (g1 === '성인') return { g1: '성인', g2: null, label: '성인' };
    if (g1 && Number.isFinite(g2)) return { g1: g1, g2: g2, label: g1 + ' ' + g2 };
    if (g1) return { g1: g1, g2: null, label: g1 };
    return { g1: '기타', g2: null, label: (s && s.grade) || '미분류' };
  }

  function promoteStepsForYear(data, year) {
    const y = parseInt(year, 10);
    if (!Number.isFinite(y)) return 0;
    return Math.max(0, y - gradeAsOfYear(data));
  }

  function effectiveGrade(s, ym, data) {
    const base = parseGrade(s);
    const year = ym ? String(ym).slice(0, 4) : currentYmSeoul().slice(0, 4);
    const steps = promoteStepsForYear(data || {}, year);
    if (!steps || ['초등', '중등', '고등'].indexOf(base.g1) < 0 || !Number.isFinite(base.g2)) {
      return { g1: base.g1, g2: base.g2, label: base.label, steps: 0, promoted: false };
    }
    const idx = GRADE_LADDER.findIndex(function (pair) { return pair[0] === base.g1 && pair[1] === base.g2; });
    if (idx < 0) return { g1: base.g1, g2: base.g2, label: base.label, steps: 0, promoted: false };
    const next = Math.min(idx + steps, GRADE_LADDER.length - 1);
    const g = GRADE_LADDER[next];
    return { g1: g[0], g2: g[1], label: g[0] + ' ' + g[1], steps: steps, promoted: next !== idx, baseLabel: base.label };
  }

  function gradeBandOf(label) {
    const g = String(label || '');
    if (g.indexOf('초') >= 0) return '초등';
    if (g.indexOf('중') >= 0) return '중등';
    if (g.indexOf('고') >= 0) return '고등';
    return '';
  }

  function incomeByGrade(data, ym) {
    const lines = ((data.monthDetails || {})[ym] || []).filter(function (x) { return x.dir === '수입'; });
    const byName = {};
    (data.students || []).forEach(function (s) { if (s && s.name) byName[s.name] = s; });
    const order = ['초등', '중등', '고등', '기타'];
    const buckets = {};
    order.forEach(function (g) { buckets[g] = { name: g, amt: 0, kids: {} }; });
    lines.forEach(function (l) {
      const amt = Number(l.amt) || 0;
      const isFee = l.cat2 === '교습비' || l.cat3 === '교습비';
      let grade = '기타';
      let kidLabel;
      if (isFee) {
        const st = byName[l.student];
        if (st) {
          const e = effectiveGrade(st, ym, data);
          grade = (e.g1 === '초등' || e.g1 === '중등' || e.g1 === '고등') ? e.g1 : '기타';
        } else {
          grade = gradeBandOf(l.grade) || '기타';
        }
        kidLabel = l.student || l.memo || '학생';
      } else {
        grade = '기타';
        kidLabel = l.cat2 || l.cat3 || l.memo || l.student || '기타 수입';
      }
      buckets[grade].amt += amt;
      buckets[grade].kids[kidLabel] = (buckets[grade].kids[kidLabel] || 0) + amt;
    });
    return order.map(function (g) {
      const b = buckets[g];
      const kids = Object.keys(b.kids).map(function (name) { return { name: name, amt: b.kids[name] }; });
      kids.sort(function (a, b2) { return Math.abs(b2.amt) - Math.abs(a.amt); });
      return { name: b.name, amt: b.amt, kids: kids };
    });
  }

  function gradeCounts(data, ym) {
    const roster = (rosterMap(data)[ym]) || new Set();
    const meta = {};
    (data.students || []).forEach(function (s) { if (s && s.name) meta[s.name] = s; });
    const cnt = { '초등': 0, '중등': 0, '고등': 0, '기타': 0 };
    roster.forEach(function (n) {
      const st = meta[n];
      let g = '기타';
      if (st) {
        const e = effectiveGrade(st, ym, data);
        if (cnt[e.g1] != null) g = e.g1;
      }
      cnt[g]++;
    });
    return cnt;
  }

  function percentShares(counts) {
    const keys = Object.keys(counts || {});
    const total = keys.reduce(function (s, k) { return s + (Number(counts[k]) || 0); }, 0);
    const out = {};
    if (!total) { keys.forEach(function (k) { out[k] = 0; }); return out; }
    const raw = keys.map(function (k) {
      const exact = (Number(counts[k]) || 0) / total * 100;
      return { k: k, floor: Math.floor(exact), frac: exact - Math.floor(exact) };
    });
    let left = 100 - raw.reduce(function (s, x) { return s + x.floor; }, 0);
    raw.slice().sort(function (a, b) { return b.frac - a.frac; }).forEach(function (x) {
      if (left > 0) { x.floor += 1; left -= 1; }
    });
    raw.forEach(function (x) { out[x.k] = x.floor; });
    return out;
  }

  function expenseStack(data) {
    const pv = prevYmSeoul();
    const yms = filterYtdYms(Object.keys(data.suji || {}).filter(function (ym) { return ym <= pv; }), pv);
    const tot = {};
    const per = yms.map(function (ym) {
      const exp = monthParts(data, ym).exp;
      const o = {};
      (exp.kids || []).forEach(function (k) {
        const v = Number(k.amt) || 0;
        o[k.name] = (o[k.name] || 0) + v;
        tot[k.name] = (tot[k.name] || 0) + v;
      });
      return { ym: ym, cats: o, total: Number(exp.amt) || 0 };
    });
    const main = Object.keys(tot).filter(function (c) { return c !== '기타' && tot[c] > 0; })
      .sort(function (a, b) { return tot[b] - tot[a]; }).slice(0, 5);
    const hasOther = Object.keys(tot).some(function (c) { return main.indexOf(c) < 0 && tot[c]; });
    const cats = hasOther ? main.concat(['기타']) : main;
    per.forEach(function (p) {
      const o = {};
      cats.forEach(function (c) { o[c] = 0; });
      Object.keys(p.cats).forEach(function (c) {
        const v = p.cats[c];
        if (main.indexOf(c) >= 0) o[c] += v;
        else o['기타'] = (o['기타'] || 0) + v;
      });
      p.cats = o;
    });
    return { yms: yms, cats: cats, points: per };
  }

  function collectionSeries(data, excluded) {
    const cur = currentYmSeoul();
    const ex = excluded || excludedMap(data);
    const yms = filterYtdYms((data.billMonths || []).filter(function (ym) { return ym <= cur; }), cur);
    return yms.map(function (ym) {
      const b = (data.tuition || {})[ym] || {};
      const un = unpaidVisible(data, ym, ex);
      const paid = b.paidTotal || 0;
      const unpaid = un.reduce(function (a, s) { return a + (s.expected || 0); }, 0);
      const denom = paid + unpaid;
      const rate = denom ? Math.round(paid / denom * 1000) / 10 : 0;
      return {
        ym: ym, paid: paid, paidCount: b.paidCount || 0,
        unpaid: unpaid, unpaidCount: un.length, rate: rate, cur: ym === cur
      };
    });
  }

  function arpuSeries(data) {
    const prev = prevYmSeoul();
    const yms = filterYtdYms(
      Object.keys(data.tuition || {}).filter(function (ym) { return ym && ym <= prev; }).sort(),
      prev
    );
    return yms.map(function (ym) {
      const b = (data.tuition || {})[ym] || {};
      const count = b.paidCount || 0;
      const total = b.paidTotal || 0;
      return { ym: ym, total: total, count: count, avg: count ? Math.round(total / count) : 0 };
    });
  }

  function breakeven(expense, avg) {
    if (!(expense > 0) || !(avg > 0)) return 0;
    return Math.ceil(expense / avg);
  }

  function cumSeries(data) {
    const prev = prevYmSeoul();
    const yr = prev.slice(0, 4);
    let acc = 0;
    return Object.keys(data.suji || {}).filter(Boolean).sort().filter(function (ym) {
      return ym.slice(0, 4) === yr || ym > prev;
    }).map(function (ym) {
      const p = monthParts(data, ym);
      const i = Number(p.inc.amt) || 0;
      const e = Number(p.exp.amt) || 0;
      acc += i - e;
      return { ym: ym, inc: i, exp: e, flow: i - e, cum: acc, margin: i ? Math.round((i - e) / i * 1000) / 10 : 0 };
    });
  }

  function feeSales(data, ym) {
    const t = (data.tuition || {})[ym];
    return t && typeof t.paidTotal === 'number' ? t.paidTotal : 0;
  }

  function salesPoints(data, excluded) {
    const cur = currentYmSeoul();
    const ex = excluded || excludedMap(data);
    const set = new Set((data.billMonths || []).filter(function (ym) { return ym <= cur; }));
    set.add(cur);
    return Array.from(set).sort().map(function (ym) {
      const has = !!(data.tuition || {})[ym];
      const unpaid = isFeeMonthOpen(ym) && unpaidVisible(data, ym, ex).length > 0;
      const v = has ? feeSales(data, ym) : null;
      return { ym: ym, value: v, unpaid: unpaid, over: v != null && v >= SALES_GOAL_1, cur: ym === cur };
    });
  }

  function studentHistory(data, name, excluded) {
    const ex = excluded || excludedMap(data);
    const out = [];
    (data.billMonths || []).forEach(function (ym) {
      const block = (data.tuition || {})[ym];
      if (!block) return;
      const paid = (block.paid || []).find(function (x) { return x.name === name; });
      const unpaid = (block.unpaid || []).find(function (x) { return x.name === name; });
      if (paid) out.push({ ym: ym, status: '납부', amt: paid.amt || 0, expected: paid.expected || 0, day: paid.day || '' });
      else if (unpaid) {
        const skipped = !!ex[ym + '|' + name];
        out.push({
          ym: ym,
          status: skipped ? '제외' : (isFeeMonthOpen(ym) ? '미납' : '시작 전'),
          amt: 0,
          expected: unpaid.expected || 0,
          day: ''
        });
      }
    });
    return out.reverse();
  }

  function shiftYm(ym, delta) {
    let y = Number(String(ym || '').slice(0, 4));
    let m = Number(String(ym || '').slice(5));
    if (!y || !m) return '';
    m += delta;
    while (m < 1) { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    return y + '-' + String(m).padStart(2, '0');
  }

  function monthNet(m) {
    if (!m) return null;
    const income = Number(m.income) || 0;
    const expense = Number(m.expense) || 0;
    return { ym: m.ym, income: income, expense: expense, net: income - expense, fee: Number(m.fee) || 0 };
  }

  function yearRollup(data) {
    const by = {};
    ((data && data.months) || []).forEach(function (m) {
      const y = String(m.ym || '').slice(0, 4);
      if (!/^\d{4}$/.test(y)) return;
      if (!by[y]) by[y] = { year: y, income: 0, expense: 0, fee: 0, months: 0 };
      by[y].income += Number(m.income) || 0;
      by[y].expense += Number(m.expense) || 0;
      by[y].fee += Number(m.fee) || 0;
      by[y].months += 1;
    });
    return Object.keys(by).sort().map(function (y) {
      const r = by[y];
      r.net = r.income - r.expense;
      r.avgNet = r.months ? Math.round(r.net / r.months) : 0;
      r.avgIncome = r.months ? Math.round(r.income / r.months) : 0;
      r.avgExpense = r.months ? Math.round(r.expense / r.months) : 0;
      return r;
    });
  }

  function periodCompare(data) {
    const prev = prevYmSeoul();
    const map = {};
    ((data && data.months) || []).forEach(function (m) { if (m && m.ym) map[m.ym] = m; });
    return {
      prev: prev,
      current: monthNet(map[prev]),
      mom: monthNet(map[shiftYm(prev, -1)]),
      yoy: monthNet(map[shiftYm(prev, -12)]),
      years: yearRollup(data)
    };
  }

  function feePoint(data, ym, excluded) {
    const b = ((data && data.tuition) || {})[ym] || {};
    const un = unpaidVisible(data || {}, ym, excluded || excludedMap(data || {}));
    const paid = b.paidTotal || 0;
    const unpaid = un.reduce(function (a, s) { return a + (s.expected || 0); }, 0);
    const denom = paid + unpaid;
    return {
      ym: ym,
      paid: paid,
      unpaid: unpaid,
      paidCount: b.paidCount || 0,
      unpaidCount: un.length,
      rate: denom ? Math.round(paid / denom * 1000) / 10 : 0,
      open: isFeeMonthOpen(ym)
    };
  }

  function feeChange(data, excluded) {
    const prev = prevYmSeoul();
    const before = shiftYm(prev, -1);
    const ex = excluded || excludedMap(data);
    const last = feePoint(data, prev, ex);
    const prior = feePoint(data, before, ex);
    return {
      last: last,
      prev: prior,
      rateDelta: Math.round((last.rate - prior.rate) * 10) / 10,
      countDelta: last.unpaidCount - prior.unpaidCount
    };
  }

  function flowChange(data) {
    const pts = flowSeries(data);
    if (!pts.length) return null;
    const last = pts[pts.length - 1];
    const prev = pts.length > 1 ? pts[pts.length - 2] : null;
    const recent = pts.slice(-3);
    return {
      last: last,
      prev: prev,
      enrolledDelta: prev ? last.enrolled - prev.enrolled : null,
      recentEntered: recent.reduce(function (a, p) { return a + p.entered; }, 0),
      recentLeft: recent.reduce(function (a, p) { return a + p.left; }, 0)
    };
  }

  function decodeBasicEntities(s) {
    return String(s || '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  function parseSheetTitles(html) {
    const out = [];
    const re = /docs-sheet-tab-caption">([^<]*)</g;
    const src = String(html || '');
    let m;
    while ((m = re.exec(src))) {
      const name = decodeBasicEntities(m[1]);
      if (name && out.indexOf(name) < 0) out.push(name);
    }
    return out;
  }

  function sheetTitleVariants(name) {
    const raw = _s(name);
    const compact = raw.replace(/\s+/g, '');
    const out = [];
    function add(s) { if (s && out.indexOf(s) < 0) out.push(s); }
    add(raw);
    add(compact);
    const spaced = {
      '학생명단': ['학생 명단'],
      '통장거래내역': ['통장 거래내역', '통장거래 내역'],
      '휴원기록': ['휴원 기록']
    };
    (spaced[compact] || []).forEach(add);
    return out;
  }

  function pickSheetTitle(titles, want) {
    const key = headerKey(want);
    if (!key) return '';
    let best = '';
    let bestScore = 0;
    (titles || []).forEach(function (raw) {
      const t = _s(raw);
      const k = headerKey(t);
      if (!k) return;
      let score = 0;
      if (k === key) score = 1000;
      else if (k.indexOf(key) === 0 || key.indexOf(k) === 0) {
        const shorter = Math.min(k.length, key.length);
        const longer = Math.max(k.length, key.length);
        if (shorter >= 2 && shorter / longer >= 0.5) score = shorter;
      }
      if (score > bestScore) { bestScore = score; best = t; }
    });
    return best;
  }

  function snapshot(data) {
    const ex = excludedMap(data);
    const cur = currentYmSeoul();
    const prev = prevYmSeoul();
    const month = (data.months || []).find(function (m) { return m.ym === prev; }) || { income: 0, expense: 0, fee: 0 };
    const dday = daysUntil(SALES_DEADLINE);
    return {
      currentYm: cur,
      prevYm: prev,
      dday: dday,
      ddayLabel: dday > 0 ? ('D-' + dday) : (dday === 0 ? 'D-DAY' : ('D+' + Math.abs(dday))),
      header: {
        income: month.income || 0,
        expense: month.expense || 0,
        feePaid: feeSales(data, prev),
        bankFee: month.fee || 0
      },
      goal: {
        currentPaid: feeSales(data, cur),
        gap: SALES_GOAL_1 - feeSales(data, cur),
        pct: Math.min(100, Math.round((feeSales(data, cur) || 0) / SALES_GOAL_1 * 100))
      },
      months: (data.months || []).map(function (m) {
        return { ym: m.ym, income: m.income, expense: m.expense, fee: m.fee };
      }),
      cash: cashSeries(data),
      flow: flowSeries(data),
      collection: collectionSeries(data, ex),
      arpu: arpuSeries(data),
      expense: expenseStack(data),
      cum: cumSeries(data),
      grades: gradeCounts(data, (flowSeries(data).slice(-1)[0] || {}).ym || prev),
      gradeYm: (flowSeries(data).slice(-1)[0] || {}).ym || prev,
      billMonths: (data.billMonths || []).slice(),
      july: data.tuition && data.tuition['2026-07'] ? {
        paid: data.tuition['2026-07'].paidTotal,
        unpaid: unpaidVisible(data, '2026-07', ex).length
      } : null
    };
  }

  root.Jangbu = {
    PER_SESSION: PER_SESSION,
    LEAVE_MONTHS: LEAVE_MONTHS,
    SALES_GOAL_1: SALES_GOAL_1,
    SALES_GOAL_2: SALES_GOAL_2,
    SALES_DEADLINE: SALES_DEADLINE,
    SALES_AXIS_MAX: SALES_AXIS_MAX,
    setNow: setNow,
    nowDate: nowDate,
    _s: _s,
    _num: _num,
    _ym: _ym,
    _target: _target,
    parseCsv: parseCsv,
    parseRestRows: parseRestRows,
    buildLedger: buildLedger,
    missingHeaderError: missingHeaderError,
    tryCsvThenGviz: tryCsvThenGviz,
    loadRowsRetry: loadRowsRetry,
    loadCsvThenGviz: loadCsvThenGviz,
    checkBankRows: checkBankRows,
    syncFailureView: syncFailureView,
    hhmmFromCache: hhmmFromCache,
    seoulYmd: seoulYmd,
    currentYmSeoul: currentYmSeoul,
    prevYmSeoul: prevYmSeoul,
    daysUntil: daysUntil,
    ymListInclusive: ymListInclusive,
    fillYmGaps: fillYmGaps,
    filterYtdYms: filterYtdYms,
    won: won,
    escHtml: escHtml,
    shortYm: shortYm,
    koShortYm: koShortYm,
    longYmLabel: longYmLabel,
    axisLabel: axisLabel,
    isFeeMonthOpen: isFeeMonthOpen,
    excludedMap: excludedMap,
    unpaidVisible: unpaidVisible,
    rosterMap: rosterMap,
    flowSeries: flowSeries,
    statusBucket: statusBucket,
    monthParts: monthParts,
    cashSeries: cashSeries,
    effectiveGrade: effectiveGrade,
    parseGrade: parseGrade,
    incomeByGrade: incomeByGrade,
    gradeCounts: gradeCounts,
    percentShares: percentShares,
    expenseStack: expenseStack,
    collectionSeries: collectionSeries,
    arpuSeries: arpuSeries,
    breakeven: breakeven,
    cumSeries: cumSeries,
    feeSales: feeSales,
    salesPoints: salesPoints,
    studentHistory: studentHistory,
    snapshot: snapshot,
    yearRollup: yearRollup,
    periodCompare: periodCompare,
    feeChange: feeChange,
    flowChange: flowChange,
    parseSheetTitles: parseSheetTitles,
    sheetTitleVariants: sheetTitleVariants,
    pickSheetTitle: pickSheetTitle,
    isSessionStudent: isSessionStudent
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
