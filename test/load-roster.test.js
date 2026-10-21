/* 가짜 CSV만 쓴다. 이름·금액은 모두 만든 것이다. */
const test = require('node:test');
const assert = require('node:assert/strict');

require('../ledger.js');
require('../demo.js');
require('../charts.js');

const J = globalThis.Jangbu;

function toCsv(rows) {
  return rows.map(function (r) {
    return r.map(function (c) {
      const s = c == null ? '' : String(c);
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }).join(',');
  }).join('\n');
}

function rowsFrom(rows) {
  return J.parseCsv(toCsv(rows));
}

function blank(n) {
  return Array(n).fill('');
}

function miniBank(opts) {
  const o = opts || {};
  const monthIdx = o.monthIdx == null ? 19 : o.monthIdx;
  const yearIdx = o.yearIdx == null ? 20 : o.yearIdx;
  const head = blank(30);
  const row = blank(30);
  head[16] = '대상자';
  head[monthIdx] = '납부월';
  head[yearIdx] = ' 납부 년도 ';
  row[0] = '2026-09-05';
  row[5] = '학생01 교습비';
  row[8] = '2026-09';
  row[9] = '수입';
  row[10] = '교습비';
  row[11] = '교습비';
  row[12] = '320000';
  row[16] = '학생01';
  row[17] = '초등 4';
  row[monthIdx] = '9월';
  row[yearIdx] = '2026';
  if (o.decoy) {
    head[19] = '참고';
    head[20] = '기타';
    row[19] = '1월';
    row[20] = '1999';
  }
  return [head, row];
}

function stu(nd, name) {
  return (nd.students || []).find(function (s) { return s.name === name; });
}

test('demo ledger stays the same with header synonyms', function () {
  const src = globalThis.buildDemoSource();
  const nd = J.buildLedger(src.bank, src.roster);
  assert.equal(nd.students.length, 14);
  const a = stu(nd, '학생01');
  assert.equal(a.grade, '초등 4');
  assert.equal(a.grade1, '초등');
  assert.equal(a.grade2, 4);
  assert.equal(a.status, '재학');
  assert.equal(a.tuition, 320000);
  assert.equal(a.school, '가나다초');
  assert.equal(a.address, '엄궁동');
  assert.equal(stu(nd, '학생14').status, '휴원');
  assert.equal(stu(nd, '학생14').grade, '성인');
  assert.equal(stu(nd, '학생08').bucket, '퇴소');
  const oct = nd.tuition['2026-10'];
  assert.equal(oct.paidCount, 11);
  assert.equal(oct.paidTotal, 4030000);
  assert.equal(nd.billMonths.length, 13);
  assert.equal(nd.issues.length, 0);
});

test('moved columns, blank rows, and section or total rows', function () {
  const roster = rowsFrom([
    ['표지', '', '', '', '', '', ''],
    ['메모', '수강료', '비고', ' 상태 ', '학년 2', '학년 1', '성명'],
    ['참고', '320000', '', '재학', '4', '초등', '학생01'],
    ['', '', '', '', '', '', ''],
    ['대기 명단', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '퇴소 명단'],
    ['합계', '730000', '', '', '', '', '합계'],
    ['', '410000', '', '퇴소', '1', '고등', '학생09'],
    ['', '', '', '', '', '', '총계']
  ]);
  const nd = J.buildLedger(rowsFrom(miniBank()), roster);
  assert.deepEqual(nd.students.map(function (s) { return s.name; }), ['학생01', '학생09']);
  const a = stu(nd, '학생01');
  assert.equal(a.tuition, 320000);
  assert.equal(a.grade1, '초등');
  assert.equal(a.grade2, 4);
  assert.equal(a.grade, '초등 4');
  assert.equal(a.status, '재학');
  assert.equal(a.bucket, '재학');
  const b = stu(nd, '학생09');
  assert.equal(b.status, '퇴소');
  assert.equal(b.bucket, '퇴소');
  assert.equal(b.tuition, 410000);
  assert.equal(b.grade, '고등 1');
  assert.equal(nd.students.some(function (s) { return s.name === '320000' || s.name === '합계' || s.name === '대기 명단'; }), false);
});

test('inserted extra column still reads the same student', function () {
  const base = rowsFrom([
    ['번호', '이름', '학교', '주소', '학년1', '학년2', '', '상태', '교습비'],
    ['1', '학생01', '가나다초', '엄궁동', '초등', '4', '', '재학', '320000']
  ]);
  const shifted = rowsFrom([
    ['번호', '이름', '메모', '학교', '주소', '학년1', '학년2', '', '상태', '교습비'],
    ['1', '학생01', '여분', '가나다초', '엄궁동', '초등', '4', '', '재학', '320000'],
    ['', '', '', '', '', '', '', '', '', ''],
    ['대기 명단', '', '', '', '', '', '', '', '', '']
  ]);
  const bank = rowsFrom(miniBank());
  const a = stu(J.buildLedger(bank, base), '학생01');
  const b = stu(J.buildLedger(bank, shifted), '학생01');
  assert.equal(b.name, a.name);
  assert.equal(b.school, '가나다초');
  assert.equal(b.address, '엄궁동');
  assert.equal(b.grade, a.grade);
  assert.equal(b.status, a.status);
  assert.equal(b.tuition, a.tuition);
  assert.equal(b.tuition, 320000);
});

test('payment month follows moved T/U headers', function () {
  const bank = rowsFrom(miniBank({ monthIdx: 22, yearIdx: 24, decoy: true }));
  const roster = rowsFrom([
    ['번호', '이름', '학교', '주소', '학년1', '학년2', '', '상태', '교습비'],
    ['1', '학생01', '가나다초', '엄궁동', '초등', '4', '', '재학', '320000']
  ]);
  const nd = J.buildLedger(bank, roster);
  assert.ok(nd.tuition['2026-09']);
  assert.equal(nd.tuition['2026-09'].paidCount, 1);
  assert.equal(nd.tuition['2026-09'].paid[0].name, '학생01');
  assert.equal(nd.tuition['2026-09'].paid[0].amt, 320000);
  assert.equal(nd.tuition['1999-01'], undefined);
});

test('fixed positions still work when no header row is present', function () {
  const roster = rowsFrom([
    ['공부방', '', '', '', '', '', '', '', ''],
    ['1', '학생01', '', '', '초등', '4', '', '재학', '320000']
  ]);
  const nd = J.buildLedger(rowsFrom(miniBank()), roster);
  const a = stu(nd, '학생01');
  assert.equal(a.grade, '초등 4');
  assert.equal(a.status, '재학');
  assert.equal(a.tuition, 320000);
});

test('missing required header names the column and is not a network error', function () {
  const roster = rowsFrom([
    ['번호', '이름', '학교', '주소', '학년1', '학년2', '', '상태', '학교'],
    ['1', '학생01', '가나다초', '엄궁동', '초등', '4', '', '재학', '가나다초']
  ]);
  assert.throws(function () {
    J.buildLedger(rowsFrom(miniBank()), roster);
  }, function (err) {
    assert.equal(err.code, 'missing-header');
    assert.match(err.message, /학생 명단/);
    assert.match(err.message, /교습비/);
    assert.doesNotMatch(err.message, /인터넷/);
    const view = J.syncFailureView(err, {
      monthDetails: { '2026-01': [{ dir: '수입', amt: 1 }] },
      cachedHHmm: '14:32'
    });
    assert.equal(view.kind, 'schema');
    assert.equal(view.banner, err.message);
    assert.doesNotMatch(view.banner, /인터넷|기준 자료/);
    return true;
  });
});

test('failed fetch retries then falls back to cached data', async function () {
  let csvN = 0;
  let gvizN = 0;
  let sleeps = 0;
  const cache = {
    monthDetails: { '2026-01': [{ dir: '수입', amt: 1000 }] },
    months: [{ ym: '2026-01', income: 1000, expense: 0, fee: 0 }],
    cachedAt: '2026-10-08T05:32:00.000Z',
    cachedHHmm: '15:10',
    syncedAt: '10/8 09:01'
  };
  await assert.rejects(function () {
    return J.loadRowsRetry(function () {
      return J.tryCsvThenGviz(function () {
        csvN += 1;
        return Promise.reject(new Error('학생 명단 불러오기 실패'));
      }, function () {
        gvizN += 1;
        return Promise.reject(new Error('학생 명단 불러오기 실패'));
      });
    }, {
      tries: 3,
      backoffs: [0, 0],
      sleep: function () { sleeps += 1; return Promise.resolve(); }
    });
  }, /학생 명단 불러오기 실패/);
  assert.equal(csvN, 3);
  assert.equal(gvizN, 3);
  assert.equal(sleeps, 2);
  const view = J.syncFailureView(new Error('학생 명단 불러오기 실패'), cache);
  assert.equal(view.kind, 'stale');
  assert.equal(view.data, cache);
  assert.match(view.banner, /최신 자료를 불러오지 못했어요/);
  assert.match(view.banner, /학생 명단 불러오기 실패/);
  assert.match(view.banner, /10\/8 14:32/);
  assert.doesNotMatch(view.banner, /15:10/);
  assert.match(view.banner, /바꾸지 않았습니다/);

  let gvizSkipped = 0;
  const ok = await J.loadRowsRetry(function () {
    return J.tryCsvThenGviz(function () {
      return Promise.resolve([['학생01']]);
    }, function () {
      gvizSkipped += 1;
      return Promise.resolve([['nope']]);
    });
  }, { tries: 3, backoffs: [0, 0], sleep: function () { return Promise.resolve(); } });
  assert.equal(gvizSkipped, 0);
  assert.deepEqual(ok, [['학생01']]);
});

test('bank columns can move, and a new student name is kept', function () {
  const head = blank(30);
  const row = blank(30);
  head[0] = '번호';
  head[3] = '거래일자';
  head[4] = '적요';
  head[5] = '참고';
  head[6] = '거래월';
  head[7] = '구분';
  head[8] = '잔액';
  head[9] = '비고';
  head[10] = '기타';
  head[11] = '순번';
  head[12] = '잔고';
  head[14] = '중분류';
  head[15] = '소분류';
  head[16] = '메모';
  head[18] = '거래금액';
  head[19] = '참고';
  head[20] = '기타';
  head[21] = '학생명';
  head[22] = '학년';
  head[24] = '납부월';
  head[25] = '납부년도';
  row[0] = '99';
  row[3] = '2026-09-05';
  row[4] = '학생99 교습비';
  row[5] = '무시';
  row[6] = '2026-09';
  row[7] = '수입';
  row[8] = '1999-01';
  row[9] = '지출';
  row[12] = '1';
  row[14] = '교습비';
  row[15] = '교습비';
  row[16] = '학생01';
  row[18] = '320000';
  row[19] = '1월';
  row[20] = '1999';
  row[21] = '학생99';
  row[22] = '중등 2';
  row[24] = '9월';
  row[25] = '2026';
  const roster = rowsFrom([
    ['표지'],
    ['성함', '납부방식', '학년', '학년수', '재학상태', '수강료', '연락처', '학교'],
    ['학생99', '월납', '중등', '2', '재학', '320000', '010-0000-0000', '라마바중'],
    ['합계', '', '', '', '', '320000', '', '']
  ]);
  const nd = J.buildLedger(rowsFrom([head, row]), roster);
  assert.equal(nd.students.length, 1);
  const a = stu(nd, '학생99');
  assert.ok(a);
  assert.equal(a.grade, '중등 2');
  assert.equal(a.status, '재학');
  assert.equal(a.tuition, 320000);
  assert.equal(a.school, '라마바중');
  assert.equal(a.payType, '월납');
  assert.equal(JSON.stringify(a).indexOf('010-0000-0000'), -1);
  assert.equal(nd.tuition['2026-09'].paidCount, 1);
  assert.equal(nd.tuition['2026-09'].paid[0].name, '학생99');
  assert.equal(nd.tuition['2026-09'].paid[0].amt, 320000);
  assert.equal(nd.tuition['1999-01'], undefined);
  assert.ok(nd.monthDetails['2026-09']);
  assert.equal(nd.monthDetails['2026-09'][0].amt, 320000);
  assert.equal(nd.monthDetails['2026-09'][0].student, '학생99');
  assert.equal(nd.monthDetails['1999-01'], undefined);
});

test('missing amount header is named when the old column was reused', function () {
  const head = blank(30);
  const row = blank(30);
  head[12] = '잔고';
  head[16] = '대상자';
  head[19] = '납부월';
  head[20] = '납부년도';
  row[12] = '320000';
  row[16] = '학생01';
  row[19] = '9월';
  row[20] = '2026';
  assert.throws(function () {
    J.buildLedger(rowsFrom([head, row]), rowsFrom([
      ['이름', '학년1', '학년2', '상태', '교습비'],
      ['학생01', '초등', '4', '재학', '320000']
    ]));
  }, function (err) {
    assert.equal(err.code, 'missing-header');
    assert.match(err.message, /통장거래내역/);
    assert.match(err.message, /금액/);
    return true;
  });
});

test('session status comes from the sheet, so a new name is not hard-coded', function () {
  J.setNow(function () { return new Date('2026-10-11T03:00:00Z'); });
  try {
    function feeRow(ym, name, amt) {
      const head = blank(30);
      head[0] = ym + '-05';
      head[5] = name + ' 교습비';
      head[8] = ym;
      head[9] = '수입';
      head[10] = '교습비';
      head[11] = '교습비';
      head[12] = String(amt);
      head[16] = name;
      head[19] = ym + '-01';
      return head;
    }
    const bankHead = blank(30);
    bankHead[16] = '대상자';
    const months = ['2026-06', '2026-07', '2026-08', '2026-09'];
    const bank = [bankHead];
    months.forEach(function (ym) { bank.push(feeRow(ym, '학생01', 100000)); });
    bank.push(feeRow('2026-06', '학생15', 100000));
    bank.push(feeRow('2026-06', '학생16', 100000));
    const roster = rowsFrom([
      ['이름', '학년1', '학년2', '상태', '교습비', '납부방식'],
      ['학생01', '초등', '4', '재학', '100000', ''],
      ['학생15', '중등', '1', '재학', '100000', '횟수'],
      ['학생16', '고등', '1', '재학', '100000', '']
    ]);
    const nd = J.buildLedger(rowsFrom(bank), roster);
    assert.equal(J.isSessionStudent(stu(nd, '학생15')), true);
    assert.equal(J.isSessionStudent(stu(nd, '학생16')), false);
    const unpaid = J.unpaidVisible(nd, '2026-09', J.excludedMap(nd, {}));
    const names = unpaid.map(function (s) { return s.name; });
    assert.equal(names.indexOf('학생15'), -1);
    assert.ok(names.indexOf('학생16') >= 0);
    const flow = J.flowSeries(nd);
    const july = flow.find(function (x) { return x.ym === '2026-07'; });
    assert.ok(july.leftNames.indexOf('학생16') >= 0);
    assert.equal(july.leftNames.indexOf('학생15'), -1);
    const sep = flow.find(function (x) { return x.ym === '2026-09'; });
    assert.equal(sep.leftNames.indexOf('학생15'), -1);
    assert.ok(sep.enrolled >= 2);
  } finally {
    J.setNow(function () { return new Date(); });
  }
});

test('renamed sheet tabs are matched without knowing the new title in advance', function () {
  const html = [
    '<div class="docs-sheet-tab-caption">학생명단</div>',
    '<div class="docs-sheet-tab-caption">통장 거래내역</div>',
    '<div class="docs-sheet-tab-caption">휴원</div>',
    '<div class="docs-sheet-tab-caption">기록</div>'
  ].join('');
  const titles = J.parseSheetTitles(html);
  assert.deepEqual(titles, ['학생명단', '통장 거래내역', '휴원', '기록']);
  assert.equal(J.pickSheetTitle(titles, '학생 명단'), '학생명단');
  assert.equal(J.pickSheetTitle(titles, '통장거래내역'), '통장 거래내역');
  assert.equal(J.pickSheetTitle(titles, '휴원 기록'), '휴원');
  assert.equal(J.pickSheetTitle(titles, '학생 명단'), '학생명단');
  assert.equal(J.pickSheetTitle(['기타시트'], '학생 명단'), '');
  assert.ok(J.sheetTitleVariants('학생 명단').indexOf('학생명단') >= 0);
});

test('period compare and yearly rollup use whatever months the sheet has', function () {
  J.setNow(function () { return new Date('2026-10-11T03:00:00Z'); });
  try {
    const src = globalThis.buildDemoSource();
    const nd = J.buildLedger(src.bank, src.roster);
    const years = J.yearRollup(nd);
    assert.deepEqual(years.map(function (y) { return y.year; }), ['2025', '2026']);
    assert.equal(years[0].months, 3);
    assert.equal(years[1].months, 10);
    years.forEach(function (y) {
      assert.equal(y.net, y.income - y.expense);
      assert.equal(y.avgNet, Math.round(y.net / y.months));
    });
    const cmp = J.periodCompare(nd);
    assert.equal(cmp.current.ym, '2026-09');
    assert.equal(cmp.mom.ym, '2026-08');
    assert.equal(cmp.yoy, null);
    assert.equal(cmp.current.net, cmp.current.income - cmp.current.expense);
    const fee = J.feeChange(nd, J.excludedMap(nd, {}));
    assert.equal(fee.last.ym, '2026-09');
    assert.equal(fee.prev.ym, '2026-08');
    assert.equal(typeof fee.last.rate, 'number');
    assert.ok(fee.last.rate >= 0 && fee.last.rate <= 100);
    const flow = J.flowChange(nd);
    assert.equal(flow.last.ym, '2026-09');
    assert.equal(typeof flow.recentEntered, 'number');
    assert.equal(typeof flow.recentLeft, 'number');
  } finally {
    J.setNow(function () { return new Date(); });
  }
});

test('blank pay-year cells still count every named student that month', function () {
  J.setNow(function () { return new Date('2026-10-12T03:00:00Z'); });
  try {
    function blank(n) { return Array(n).fill(''); }
    const head = blank(24);
    head[0] = '날짜'; head[5] = '적요'; head[8] = '년월'; head[9] = '구분';
    head[10] = '중분류'; head[12] = '금액'; head[16] = '대상자'; head[19] = '납부월'; head[20] = '납부년도';
    const bank = [head];
    const names = ['학생01', '학생02', '학생03', '학생04', '학생05', '학생06', '학생07', '학생08'];
    ['2026-03', '2026-04', '2026-07'].forEach(function (ym) {
      names.forEach(function (name, i) {
        if (name === '학생07' && ym < '2026-04') return;
        if (name === '학생08' && ym > '2026-06') return;
        const r = blank(24);
        r[0] = ym + '-05';
        r[5] = name + ' 교습비';
        r[9] = '수입';
        r[10] = '교습비';
        r[12] = '300000';
        r[16] = (i % 3 === 2) ? '' : name;
        r[19] = String(Number(ym.slice(5))) + '월';
        r[20] = i === 0 ? ym.slice(0, 4) : '';
        bank.push(r);
      });
      bank.push(blank(24));
    });
    const rh = blank(12);
    rh[1] = '이름'; rh[4] = '학년'; rh[7] = '상태'; rh[8] = '교습비';
    const roster = [blank(12), rh];
    names.forEach(function (name, i) {
      const r = blank(12);
      r[1] = name;
      if (i % 2 === 0) { r[0] = ''; r[4] = ''; r[7] = ''; }
      else { r[0] = String(i); r[4] = '중등'; r[7] = name === '학생08' ? '퇴소' : '재학'; r[8] = '300000'; }
      roster.push(r);
    });
    const nd = J.buildLedger(rowsFrom(bank), rowsFrom(roster));
    assert.ok(stu(nd, '학생01'));
    assert.equal(stu(nd, '학생01').status, '미정');
    const flow = {};
    J.flowSeries(nd).forEach(function (p) { flow[p.ym] = p; });
    assert.equal(flow['2026-03'].enrolled, 5);
    assert.equal(flow['2026-04'].enrolled, 6);
    assert.equal(flow['2026-04'].entered, 1);
    assert.equal(flow['2026-05'].left, 1);
    assert.equal(flow['2026-07'].enrolled, 5);
    assert.equal(flow['2026-07'].left, 0);
    assert.equal(nd.tuition['2026-03'].paidCount, 5);
  } finally {
    J.setNow(function () { return new Date(); });
  }
});

test('a month with nobody paying does not pull the average line to zero', function () {
  J.setNow(function () { return new Date('2026-10-12T03:00:00Z'); });
  try {
    const src = globalThis.buildDemoSource();
    const nd = J.buildLedger(src.bank, src.roster);
    const july = J.arpuSeries(nd).find(function (p) { return p.ym === '2026-07'; });
    assert.equal(july.count, 0);
    const svg = globalThis.Charts.arpuChart(J.arpuSeries(nd)).svg;
    assert.equal((svg.match(/<polyline /g) || []).length, 4);
    assert.equal(svg.indexOf('>0.0<'), -1);
  } finally {
    J.setNow(function () { return new Date(); });
  }
});

test('blank date and month cells keep the parent transaction month', function () {
  J.setNow(function () { return new Date('2026-10-12T03:00:00Z'); });
  try {
    function blank(n) { return Array(n).fill(''); }
    const head = blank(24);
    head[0] = '날짜'; head[5] = '적요'; head[8] = '년월'; head[9] = '구분';
    head[10] = '중분류'; head[11] = '소분류'; head[12] = '금액'; head[16] = '대상자';
    head[19] = '납부월'; head[20] = '납부년도';
    const bank = [head];
    const names = ['학생01', '학생02', '학생03', '학생04'];
    ['2026-03', '2026-04', '2026-05'].forEach(function (ym) {
      [['급여', '인건비', 1800000], ['월세', '임대료', 700000], ['전기', '공과금', 90000]].forEach(function (e, i) {
        const r = blank(24);
        if (i === 0) { r[0] = ym + '-02'; r[8] = ym; r[9] = '지출'; }
        r[5] = e[0]; r[10] = e[1]; r[11] = e[0]; r[12] = String(e[2]);
        bank.push(r);
      });
      const total = blank(24);
      total[5] = '합계';
      total[12] = '2590000';
      bank.push(total);
      bank.push(blank(24));
      names.forEach(function (name, i) {
        if (name === '학생04' && ym < '2026-04') return;
        if (name === '학생03' && ym > '2026-04') return;
        const r = blank(24);
        if (i === 0) {
          r[0] = ym + '-05'; r[8] = ym; r[9] = '수입';
          r[19] = String(Number(ym.slice(5))) + '월'; r[20] = ym.slice(0, 4);
        }
        r[5] = name + ' 교습비'; r[10] = '교습비'; r[11] = '교습비'; r[12] = '300000'; r[16] = name;
        bank.push(r);
      });
      bank.push(blank(24));
    });
    const own = blank(24);
    own[0] = '2026-06-03'; own[8] = '2026-06'; own[9] = '수입'; own[10] = '기타'; own[12] = '50000';
    bank.push(own);
    const follow = blank(24);
    follow[10] = '기타'; follow[12] = '10000';
    bank.push(follow);
    const dated = blank(24);
    dated[8] = '2026-08'; dated[9] = '지출'; dated[10] = '소모품'; dated[12] = '40000';
    bank.push(dated);
    const rh = blank(12);
    rh[1] = '이름'; rh[7] = '상태'; rh[8] = '교습비';
    const roster = [rh];
    names.forEach(function (name) {
      const r = blank(12);
      r[1] = name; r[7] = name === '학생03' ? '퇴소' : '재학'; r[8] = '300000';
      roster.push(r);
    });
    const nd = J.buildLedger(rowsFrom(bank), rowsFrom(roster));
    const by = {};
    nd.months.forEach(function (m) { by[m.ym] = m; });
    assert.equal(by['2026-03'].income, 900000);
    assert.equal(by['2026-03'].expense, 2590000);
    assert.equal(by['2026-04'].income, 1200000);
    assert.equal(by['2026-04'].expense, 2590000);
    assert.equal(by['2026-05'].income, 900000);
    assert.equal(by['2026-05'].expense, 2590000);
    assert.equal(by['2026-06'].income, 60000);
    assert.equal(by['2026-06'].expense, 0);
    assert.equal(by['2026-08'].expense, 40000);
    assert.equal(by['2026-08'].income, 0);
    assert.equal(nd.tuition['2026-03'].paidCount, 3);
    assert.equal(nd.tuition['2026-04'].paidCount, 4);
    assert.equal(nd.tuition['2026-05'].paidCount, 3);
    assert.equal(nd.monthDetails['2026-03'].length, 6);
    const demo = J.buildLedger(globalThis.buildDemoSource().bank, globalThis.buildDemoSource().roster);
    const sep = demo.months.find(function (m) { return m.ym === '2026-09'; });
    assert.equal(sep.income, 3130000);
    assert.equal(sep.expense, 2800000);
    assert.equal(demo.tuition['2026-10'].paidCount, 11);
    assert.equal(demo.tuition['2026-10'].paidTotal, 4030000);
    const line = globalThis.Charts.monthsLine(nd.months, { summary: false }).svg;
    const ends = (line.match(/text-anchor="end"/g) || []).length;
    assert.equal(ends, 6);
    const cash = globalThis.Charts.cashBars(nd.months.map(function (m) {
      return { ym: m.ym, flow: m.income - m.expense };
    }), { summary: false }).svg;
    assert.equal((cash.match(/text-anchor="end"/g) || []).length, 6);
  } finally {
    J.setNow(function () { return new Date(); });
  }
});

test('a device exclusion list does not change unpaid counts', function () {
  J.setNow(function () { return new Date('2026-10-12T03:00:00Z'); });
  try {
    const src = globalThis.buildDemoSource();
    const nd = J.buildLedger(src.bank, src.roster);
    const plain = J.unpaidVisible(nd, '2026-09', J.excludedMap(nd)).map(function (s) { return s.name; });
    assert.ok(plain.length > 0);
    const name = plain[0];
    const saved = {};
    saved['2026-09|' + name] = { ym: '2026-09', name: name };
    const ignored = J.unpaidVisible(nd, '2026-09', J.excludedMap(nd, saved)).map(function (s) { return s.name; });
    assert.deepEqual(ignored, plain);
  } finally {
    J.setNow(function () { return new Date(); });
  }
});

test('status wording still lands in 재원, 휴원, or 퇴소', function () {
  assert.equal(J.statusBucket('재학'), '재학');
  assert.equal(J.statusBucket('재원'), '재학');
  assert.equal(J.statusBucket('재원중'), '재학');
  assert.equal(J.statusBucket(' 재적 '), '재학');
  assert.equal(J.statusBucket('휴원'), '휴원');
  assert.equal(J.statusBucket('휴원(장기)'), '휴원');
  assert.equal(J.statusBucket('휴학'), '휴원');
  assert.equal(J.statusBucket('퇴소함'), '퇴소');
  assert.equal(J.statusBucket('퇴원'), '퇴소');
  assert.equal(J.statusBucket('미정'), '기타');
  assert.equal(J.statusBucket(''), '기타');
});

test('monthly 휴원 and 퇴소 follow the sheet, not a fixed roster', function () {
  J.setNow(function () { return new Date('2026-10-12T03:00:00Z'); });
  try {
    function fee(ym, name) {
      const r = blank(24);
      r[0] = ym + '-05';
      r[5] = name + ' 교습비';
      r[8] = ym;
      r[9] = '수입';
      r[10] = '교습비';
      r[12] = '100000';
      r[16] = name;
      r[19] = ym + '-01';
      return r;
    }
    const head = blank(24);
    head[16] = '대상자';
    const bank = [head];
    ['2026-05', '2026-07', '2026-08'].forEach(function (ym) { bank.push(fee(ym, '가나')); });
    bank.push(fee('2026-05', '다라'));
    bank.push(fee('2026-03', '마바'));
    function roster(rows) {
      return rowsFrom([['이름', '상태', '교습비']].concat(rows));
    }
    const nd = J.buildLedger(rowsFrom(bank), roster([
      ['다라', '퇴소함', '100000'],
      ['가나', '재원', '100000'],
      ['마바', '휴원중', '100000']
    ]));
    assert.equal(stu(nd, '다라').bucket, '퇴소');
    assert.equal(stu(nd, '가나').bucket, '재학');
    assert.equal(stu(nd, '마바').bucket, '휴원');
    nd.restMonths = [{ name: '가나', ym: '2026-06' }, { name: '임시10', ym: '2026-07' }];
    const flow = {};
    J.flowSeries(nd).forEach(function (p) { flow[p.ym] = p; });
    assert.equal(flow['2026-05'].withdrawn, 0);
    assert.ok(flow['2026-05'].onLeaveNames.indexOf('마바') >= 0);
    assert.equal(flow['2026-06'].enrolled, 0);
    assert.deepEqual(flow['2026-06'].onLeaveNames, ['가나', '마바']);
    assert.deepEqual(flow['2026-06'].withdrawnNames, ['다라']);
    assert.ok(flow['2026-07'].onLeaveNames.indexOf('임시10') >= 0);
    assert.ok(flow['2026-07'].onLeaveNames.indexOf('마바') >= 0);
    assert.deepEqual(flow['2026-08'].withdrawnNames, ['다라']);
    assert.ok(flow['2026-08'].onLeaveNames.indexOf('다라') < 0);
    const dropped = J.buildLedger(rowsFrom(bank), roster([
      ['가나', '재원', '100000']
    ]));
    dropped.restMonths = [];
    const later = {};
    J.flowSeries(dropped).forEach(function (p) { later[p.ym] = p; });
    assert.equal(later['2026-08'].withdrawn, 0);
    assert.equal(later['2026-08'].onLeave, 0);
    assert.ok(later['2026-08'].enrolled >= 1);
  } finally {
    J.setNow(function () { return new Date(); });
  }
});

function svgTexts(svg) {
  const out = [];
  const re = /<text\b([^>]*)>([^<]*)<\/text>/g;
  let m;
  while ((m = re.exec(svg))) {
    const a = m[1];
    const x = /(?:^|\s)x="([^"]+)"/.exec(a);
    const y = /(?:^|\s)y="([^"]+)"/.exec(a);
    const fs = /font-size="([^"]+)"/.exec(a);
    const anc = /text-anchor="([^"]+)"/.exec(a);
    if (!x || !y) continue;
    out.push({
      x: Number(x[1]),
      y: Number(y[1]),
      fs: Number(fs ? fs[1] : 12),
      anchor: anc ? anc[1] : 'start',
      text: m[2],
      series: (/data-series="([^"]+)"/.exec(a) || [])[1] || '',
      role: (/data-role="([^"]+)"/.exec(a) || [])[1] || ''
    });
  }
  return out;
}

function textBoxes(list) {
  return list.map(function (t) {
    let w = 0;
    for (let i = 0; i < t.text.length; i++) {
      const c = t.text.charCodeAt(i);
      if (c > 255) w += t.fs * 0.95;
      else if (c === 45 || c === 43 || c === 46) w += t.fs * 0.4;
      else w += t.fs * 0.6;
    }
    w += t.fs * 0.15;
    const left = t.anchor === 'end' ? t.x - w : t.anchor === 'start' ? t.x : t.x - w / 2;
    return { left: left, top: t.y - t.fs * 0.8, right: left + w, bottom: t.y + t.fs * 0.2, text: t.text };
  });
}

function assertNoTextOverlap(svg, title) {
  const boxes = textBoxes(svgTexts(svg));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const hit = a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
      assert.equal(hit, false, title + ' ' + a.text + ' overlaps ' + b.text);
    }
  }
}

test('summary month chart fits the screen and detail labels every point', function () {
  J.setNow(function () { return new Date('2026-10-12T03:00:00Z'); });
  try {
    const src = globalThis.buildDemoSource();
    const nd = J.buildLedger(src.bank, src.roster);
    const home = nd.months.filter(function (m) { return m.ym <= '2026-09'; }).slice(-9);
    const svg = globalThis.Charts.monthsLine(home, { summary: true }).svg;
    assert.match(svg.slice(0, 120), /width="100%"/);
    assert.doesNotMatch(svg.slice(0, 120), /width="\d+"/);
    const texts = svgTexts(svg);
    const income = texts.filter(function (t) { return t.series === 'income'; });
    const expense = texts.filter(function (t) { return t.series === 'expense'; });
    assert.ok(income.length >= 1 && expense.length >= 1);
    assert.ok(income.length <= home.length && expense.length <= home.length);
    const circles = [];
    const re = /<circle cx="([^"]+)" cy="([^"]+)"/g;
    let m;
    while ((m = re.exec(svg))) circles.push({ x: Number(m[1]), y: Number(m[2]) });
    const incC = circles.slice(0, home.length);
    const expC = circles.slice(home.length, home.length * 2);
    income.forEach(function (t) {
      const c = incC.find(function (p) { return Math.abs(p.x - t.x) < 1; });
      assert.ok(c && t.y < c.y - 4, 'income label above its point');
    });
    expense.forEach(function (t) {
      const c = expC.find(function (p) { return Math.abs(p.x - t.x) < 1; });
      assert.ok(c && t.y > c.y + 4, 'expense label below its point');
    });
    assert.equal((svg.match(/<rect /g) || []).length, home.length);
    assertNoTextOverlap(svg, 'months');
    const detail = globalThis.Charts.monthsLine(nd.months, { summary: false }).svg;
    const dTexts = svgTexts(detail);
    assert.equal(dTexts.filter(function (t) { return t.series === 'income'; }).length, nd.months.length);
    assert.equal(dTexts.filter(function (t) { return t.series === 'expense'; }).length, nd.months.length);
    assert.match(detail, /width="\d+/);
    assertNoTextOverlap(detail, 'months detail');
    const crowded = [];
    for (let i = 0; i < 9; i++) {
      crowded.push({ ym: '2026-0' + (i + 1), income: 5000000 + i * 1000, expense: 4900000 + i * 1000 });
    }
    const tight = globalThis.Charts.monthsLine(crowded, { summary: true }).svg;
    assert.match(tight, /width="100%"/);
    assertNoTextOverlap(tight, 'months crowded');
    const tightDetail = globalThis.Charts.monthsLine(crowded, { summary: false }).svg;
    const td = svgTexts(tightDetail);
    assert.equal(td.filter(function (t) { return t.series === 'income'; }).length, 9);
    assert.equal(td.filter(function (t) { return t.series === 'expense'; }).length, 9);
    assertNoTextOverlap(tightDetail, 'months crowded detail');
  } finally {
    J.setNow(function () { return new Date(); });
  }
});

test('year bars separate the zero tick and label every series', function () {
  const svg = globalThis.Charts.yearBars([
    { year: '2024', income: 40000000, expense: 42000000, net: -1840000 },
    { year: '2025', income: 12000000, expense: 8000000, net: 4000000 }
  ]).svg;
  const texts = svgTexts(svg);
  const ticks = texts.filter(function (t) { return t.role === 'tick'; });
  const zero = ticks.find(function (t) { return t.text === '0'; });
  const neg = ticks.find(function (t) { return t.text.charAt(0) === '-'; });
  assert.ok(zero && neg);
  assert.ok(neg.y - zero.y >= 20, 'zero and negative tick are apart');
  ['income', 'expense', 'net'].forEach(function (key) {
    assert.equal(texts.filter(function (t) { return t.series === key; }).length, 2, key);
  });
  const net = texts.find(function (t) { return t.series === 'net' && t.text.charAt(0) === '-'; });
  assert.ok(net && net.y > zero.y + 8, 'negative net sits below zero');
  assertNoTextOverlap(svg, 'year');
});

test('student chart draws 재원 bars with nested 신규·퇴소 bars and labels do not collide', function () {
  J.setNow(function () { return new Date('2026-10-12T03:00:00Z'); });
  try {
    const src = globalThis.buildDemoSource();
    const nd = J.buildLedger(src.bank, src.roster);
    nd.restMonths = J.parseRestRows(src.rest);
    const pts = J.flowSeries(nd).slice(-9);
    const svg = globalThis.Charts.enrollBars(pts, { summary: true }).svg;
    assert.match(svg.slice(0, 120), /width="100%"/);
    assert.doesNotMatch(svg.slice(0, 120), /width="\d+"/);
    const texts = svgTexts(svg);
    ['enrolled', 'entered', 'withdrawn'].forEach(function (key) {
      assert.ok(texts.filter(function (t) { return t.series === key; }).length <= pts.length, key);
    });
    assert.equal((svg.match(/<polyline /g) || []).length, 0);
    assert.ok((svg.match(/<rect x=/g) || []).length >= pts.length);
    assertNoTextOverlap(svg, 'enroll');
    const detail = globalThis.Charts.enrollBars(J.flowSeries(nd), { summary: false }).svg;
    const dTexts = svgTexts(detail);
    const allPts = J.flowSeries(nd);
    ['enrolled', 'entered', 'withdrawn'].forEach(function (key) {
      assert.equal(dTexts.filter(function (t) { return t.series === key; }).length, allPts.length, key);
    });
    assert.match(detail, /width="\d+/);
    assertNoTextOverlap(detail, 'enroll detail');
    assertNoTextOverlap(globalThis.Charts.yearBars(J.yearRollup(nd)).svg, 'year demo');
    assertNoTextOverlap(globalThis.Charts.cashBars(J.cashSeries(nd).slice(-9), { summary: true }).svg, 'cash');
    assertNoTextOverlap(globalThis.Charts.salesBars(J.salesPoints(nd).slice(-9), { summary: true }).svg, 'sales');
    const homeSales = globalThis.Charts.salesBars(J.salesPoints(nd).slice(-9), { summary: true, compact: true }).svg;
    assert.match(homeSales, /viewBox="0 0 \d+ 228"/);
    assertNoTextOverlap(homeSales, 'sales home');
    const stack = globalThis.Charts.expenseStack(J.expenseStack(nd));
    if (stack) assertNoTextOverlap(stack.svg, 'expense');
    const col = globalThis.Charts.collectionBars(J.collectionSeries(nd, J.excludedMap(nd)));
    if (col) assertNoTextOverlap(col.svg, 'collection');
    const arpu = globalThis.Charts.arpuChart(J.arpuSeries(nd));
    if (arpu) assertNoTextOverlap(arpu.svg, 'arpu');
    const cum = globalThis.Charts.cumChart(J.cumSeries(nd), '2026-10');
    if (cum) assertNoTextOverlap(cum.svg, 'cum');
  } finally {
    J.setNow(function () { return new Date(); });
  }
});
