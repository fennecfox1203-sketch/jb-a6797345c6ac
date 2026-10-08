/* 가짜 CSV만 쓴다. 이름·금액은 모두 만든 것이다. */
const test = require('node:test');
const assert = require('node:assert/strict');

require('../ledger.js');
require('../demo.js');

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
    cachedHHmm: '14:32',
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
  assert.equal(view.banner, '최신 자료를 불러오지 못해 14:32 기준 자료를 보여 줘요');

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
