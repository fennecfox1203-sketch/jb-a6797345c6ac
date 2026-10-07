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
    const src = String(text || '');
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

  function findHeaderCol(header, names) {
    const h = header || [];
    for (let i = 0; i < h.length; i++) {
      if (names.indexOf(_s(h[i])) >= 0) return i;
    }
    return -1;
  }

  function buildLedger(bankRows, rosRows) {
    const B = (bankRows || []).map(function (r) { return _pad(r || [], 30); });
    const hi = B.findIndex(function (r) { return r.some(function (c) { return _s(c) === '대상자'; }); });
    if (hi < 0) throw new Error('통장거래내역 머리글(대상자)을 못 찾았어요');
    const bank = B.slice(hi + 1).map(function (r) {
      const row = r.slice();
      row[19] = _target(row);
      return row;
    });
    const ros = (rosRows || []).map(function (r) { return _pad(r || [], 30); });
    const header = ros[0] || [];
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
    ros.slice(1).forEach(function (r) {
      const name = _s(r[1]);
      if (!name || ['이름', '합계', '대기 명단', '퇴소 명단'].indexOf(name) >= 0 || _s(r[7]) === '상태') return;
      if (!(_s(r[0]) !== '' || _s(r[4]) || _s(r[7]))) return;
      const status = _s(r[7]) || '미정';
      const g1 = _s(r[4]);
      const g2v = _s(r[5]) !== '' ? _num(r[5]) : null;
      const grade = (g1 + (g2v != null ? ' ' + g2v : '')).trim();
      const bucket = ['재학', '휴원', '퇴소'].indexOf(status) >= 0 ? status : '기타';
      const st = { name: name, grade1: g1, grade2: g2v, grade: grade, status: status, tuition: _num(r[8]), bucket: bucket };
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

  function excludedMap(data, saved) {
    const m = {};
    const src = saved && typeof saved === 'object' ? saved : {};
    Object.keys(src).forEach(function (k) {
      const v = src[k];
      if (!v || !v.ym || !v.name) return;
      m[v.ym + '|' + v.name] = {
        ym: v.ym, name: v.name, at: v.at || '', sheet: false, session: false
      };
    });
    ((data && data.restMonths) || []).forEach(function (x) {
      if (!x || !x.ym || !x.name || PER_SESSION.indexOf(x.name) >= 0) return;
      m[x.ym + '|' + x.name] = { ym: x.ym, name: x.name, sheet: true };
    });
    Object.keys((data && data.tuition) || {}).forEach(function (ym) {
      PER_SESSION.forEach(function (n) {
        m[ym + '|' + n] = { ym: ym, name: n, sheet: true, session: true };
      });
    });
    return m;
  }

  function unpaidVisible(data, ym, excluded) {
    if (!isFeeMonthOpen(ym)) return [];
    const block = (data.tuition || {})[ym] || { unpaid: [] };
    const ex = excluded || excludedMap(data, {});
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
    const session = new Set(PER_SESSION);
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
        if (next != null) {
          if (next - last - 1 < LEAVE_MONTHS) cache[m].add(n);
          return;
        }
        if (gone.has(n)) return;
        if (lastIdx >= 0 && lastIdx - last < LEAVE_MONTHS) cache[m].add(n);
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

  function flowSeries(data) {
    const roster = rosterMap(data);
    const yms = Object.keys(roster).sort();
    const prevCut = prevYmSeoul();
    return yms.filter(function (ym) { return ym <= prevCut; }).map(function (ym) {
      const i = yms.indexOf(ym);
      const prev = i > 0 ? yms[i - 1] : null;
      const entered = prev ? namesDelta(roster[prev], roster[ym], 'enter') : [];
      const left = prev ? namesDelta(roster[prev], roster[ym], 'leave') : [];
      return {
        ym: ym,
        enrolled: roster[ym].size,
        entered: entered.length,
        left: left.length,
        enteredNames: entered,
        leftNames: left
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
    const ex = excluded || excludedMap(data, {});
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
    const ex = excluded || excludedMap(data, {});
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
    const ex = excluded || excludedMap(data, {});
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

  function snapshot(data, savedExcluded) {
    const ex = excludedMap(data, savedExcluded || {});
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
    snapshot: snapshot
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
