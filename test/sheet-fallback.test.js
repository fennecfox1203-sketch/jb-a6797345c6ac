/* 가짜 행만 쓴다. 이름·금액은 모두 만든 것이다. */
const test = require('node:test');
const assert = require('node:assert/strict');

require('../ledger.js');
const J = globalThis.Jangbu;

const HEAD = [
  ['  ', '', '', '카드 수수료', '신용카드', '1.50%'],
  ['계좌번호', '000-000-000000', '', '', '', ''],
  ['거래일자', '0:00:00', '적요', '출금(원)', '입금(원)', '내용', '잔액(원)', '거래점', '년월', '구분']
];
function row(day, inAmt) { return [day, '10:00:00', '학생A', '', inAmt, '메모', '1,000,000', '지점', day.slice(0, 7), '수입']; }
const SPLIT = ['', '', '', '', '', '', '', '', '2026-10', '수입'];
const FULL = HEAD.concat([row('2026-10-15', '100,000'), [], row('2026-10-19', '200,000'), SPLIT, row('2026-10-19', '50,000')]);
const PARTIAL = [row('2026-10-01', '100,000'), ['', '', '학생B', '', '200,000', '', '', '', '2026-10', '수입'], ['', '', '학생C', '', '50,000', '', '', '', '2026-10', '수입']];
const opts = (extra) => Object.assign({ tries: 3, backoffs: [0, 0], sleep: () => Promise.resolve(), validate: J.checkBankRows }, extra || {});

test('CSV 성공이면 gviz를 부르지 않는다', async () => {
  let g = 0;
  const rows = await J.loadCsvThenGviz(async () => FULL, async () => { g++; return FULL; }, opts());
  assert.equal(g, 0); assert.equal(rows.viaFallback, undefined);
});

test('CSV가 한 번 실패해도 다시 시도해서 CSV로 받는다', async () => {
  let c = 0, g = 0;
  const rows = await J.loadCsvThenGviz(async () => { if (c++ === 0) throw new Error('net'); return FULL; }, async () => { g++; return PARTIAL; }, opts());
  assert.equal(g, 0); assert.equal(c, 2); assert.equal(rows, FULL);
});

test('CSV가 다 실패하고 gviz가 일부만 주면 partial-data로 거절한다', async () => {
  await assert.rejects(J.loadCsvThenGviz(async () => { throw new Error('net'); }, async () => PARTIAL, opts()), (e) => e.code === 'partial-data');
});

test('gviz가 머리글은 있지만 날짜가 빠진 줄이 많으면 거절한다', () => {
  const noDates = HEAD.concat([row('2026-10-01', '1'), ['', '', '학생B', '', '2', '', '', '', '2026-10', '수입']]);
  assert.throws(() => J.checkBankRows(noDates), (e) => e.code === 'partial-data');
});

test('CSV가 다 실패하고 gviz가 온전하면 받아들이고 대체 경로로 표시한다', async () => {
  const rows = await J.loadCsvThenGviz(async () => { throw new Error('net'); }, async () => FULL.slice(), opts());
  assert.equal(rows.viaFallback, true);
});

test('나눠 적은 줄(A~H 빈칸)과 빈 줄은 날짜 누락으로 세지 않는다', () => {
  assert.doesNotThrow(() => J.checkBankRows(FULL));
});
