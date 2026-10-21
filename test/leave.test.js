/* 가짜 연차 표만 쓴다. 직원 이름과 숫자는 테스트용이다. */
const test = require('node:test');
const assert = require('node:assert/strict');

require('../ledger.js');
const J = globalThis.Jangbu;

test('blank computed hours follow the day and half-day rules', function () {
  assert.equal(J.LEAVE_DAY_HOURS, 7);
  assert.equal(J.leaveHoursFromType('연차', 0), 7);
  assert.equal(J.leaveHoursFromType('오전 반차', 7), 3);
  assert.equal(J.leaveHoursFromType('오후 반차', 0), 4);
  assert.equal(J.leaveHoursFromType('시간 연차', 2.5), 2.5);
  assert.equal(J.leaveHoursFromType('공가', 5), 0);
});

test('sheet headers drive entries, summary, and newest-first order', function () {
  const rows = [
    ['안내', '이 줄은 머리글이 아니다'],
    ['날짜', '직원', '종류', '직접 입력 시간', '사용 시간', '사용 일수', '비고', '', '직원', '부여 일수', '부여 시간', '사용 일수', '사용 시간', '잔여 일수', '잔여 시간'],
    ['2026-05-04', '직원나', '연차', '', '', '', '', '', '직원가', '15', '105', '1', '9', '14', '98'],
    ['2026-06-11', '직원가', '공가', '5', '0', '0', '예비', '', '직원나', '12', '84', '', '', '', ''],
    ['2026-10-02', '직원가', '연차', '7', '7', '1', '가족'],
    ['2026-10-02', '직원나', '오전 반차', '9', '', '', '오전'],
    ['2026-08-20', '직원다', '오후 반차', '', '', '', ''],
    ['2026-07-01', '직원나', '시간 연차', '2.5', '', '', ''],
    ['합계', '합계', '', '', '20'],
    ['', '직원가', '연차', '7', '7', '1', '날짜 없음']
  ];
  const parsed = J.parseLeaveRows(rows);
  assert.deepEqual(parsed.entries.map(function (e) { return [e.date, e.name, e.type, e.hours, e.days, e.note]; }), [
    ['2026-10-02', '직원나', '오전 반차', 3, 0.43, '오전'],
    ['2026-10-02', '직원가', '연차', 7, 1, '가족'],
    ['2026-08-20', '직원다', '오후 반차', 4, 0.57, ''],
    ['2026-07-01', '직원나', '시간 연차', 2.5, 0.36, ''],
    ['2026-06-11', '직원가', '공가', 0, 0, '예비'],
    ['2026-05-04', '직원나', '연차', 7, 1, '']
  ]);
  assert.deepEqual(parsed.staff.map(function (s) { return s.name; }), ['직원가', '직원나', '직원다']);
  const ga = parsed.staff[0];
  assert.equal(ga.fromSummary, true);
  assert.equal(ga.grantedDays, 15);
  assert.equal(ga.grantedHours, 105);
  assert.equal(ga.usedDays, 1);
  assert.equal(ga.usedHours, 9);
  assert.equal(ga.remainDays, 14);
  assert.equal(ga.remainHours, 98);
  const na = parsed.staff[1];
  assert.equal(na.grantedDays, 12);
  assert.equal(na.grantedHours, 84);
  assert.equal(na.usedHours, 12.5);
  assert.equal(na.usedDays, 1.79);
  assert.equal(na.remainHours, 71.5);
  assert.equal(na.remainDays, 10.21);
  const da = parsed.staff[2];
  assert.equal(da.fromSummary, false);
  assert.equal(da.usedHours, 4);
  assert.equal(da.usedDays, 0.57);
  assert.equal(da.grantedDays, null);
});

test('a short summary block still fills hours from days', function () {
  const rows = [
    ['날짜', '직원', '종류', '입력 시간', '계산 시간', '비고', '', '직원', '부여 일수', '사용 일수', '잔여 일수'],
    ['2026-03-02', '직원가', '연차', '', '2', '두 시간', '', '직원가', '10', '', '']
  ];
  const parsed = J.parseLeaveRows(rows);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].hours, 2);
  assert.equal(parsed.entries[0].days, 0.29);
  assert.equal(parsed.entries[0].note, '두 시간');
  const st = parsed.staff[0];
  assert.equal(st.grantedDays, 10);
  assert.equal(st.grantedHours, 70);
  assert.equal(st.usedHours, 2);
  assert.equal(st.usedDays, 0.29);
  assert.equal(st.remainDays, 9.71);
  assert.equal(st.remainHours, 68);
});

test('moved columns and a filled computed cell win over the type rule', function () {
  const rows = [
    ['비고', '종류', '직원', '날짜', '사용 시간'],
    ['메모', '오전 반차', '직원나', '2026년 4월 9일', '5']
  ];
  const parsed = J.parseLeaveRows(rows);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].date, '2026-04-09');
  assert.equal(parsed.entries[0].name, '직원나');
  assert.equal(parsed.entries[0].hours, 5);
  assert.equal(parsed.entries[0].note, '메모');
});

test('rows without a date and staff header are ignored', function () {
  const parsed = J.parseLeaveRows([['이름', '금액'], ['직원가', '100']]);
  assert.deepEqual(parsed, { entries: [], staff: [] });
});

test('연차관리 header grants days and counts use in hours', function () {
  const rows = [
    ['날짜', '직원', '종류', '직접 입력 시간', '사용 시간', '사용 일수', '비고', '', '직원', '부여 일수', '부여 시간', '사용 일수', '사용 시간', '잔여 일수', '잔여 시간'],
    ['2026-05-12', '직원가', '연차', '2.5', '2.5', '0.36', '', '', '직원가', '14', '98', '5', '35', '9', '63'],
    ['2026-06-04', '직원나', '공가', '0', '0', '0', '', '', '직원나', '10', '70', '7', '49', '3', '21'],
    ['2026-08-01', '직원가', '오전 반차', '', '', '', '오전'],
    ['2026-08-02', '직원나', '오후 반차', '', '', '', '오후']
  ];
  const parsed = J.parseLeaveRows(rows);
  assert.deepEqual(parsed.entries.map(function (e) { return [e.date, e.name, e.type, e.hours]; }), [
    ['2026-08-02', '직원나', '오후 반차', 4],
    ['2026-08-01', '직원가', '오전 반차', 3],
    ['2026-06-04', '직원나', '공가', 0],
    ['2026-05-12', '직원가', '연차', 2.5]
  ]);
  assert.equal(parsed.staff[0].grantedDays, 14);
  assert.equal(parsed.staff[0].grantedHours, 98);
  assert.equal(parsed.staff[0].usedHours, 35);
  assert.equal(parsed.staff[0].remainDays, 9);
  assert.equal(parsed.staff[1].grantedDays, 10);
  assert.equal(parsed.staff[1].usedHours, 49);
  assert.equal(parsed.staff[1].remainHours, 21);
});

test('the dashboard reads the 연차관리 tab, not a second leave tab', function () {
  const fs = require('node:fs');
  const src = fs.readFileSync(require('node:path').join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(src, /'연차관리': '759985960'/);
  assert.equal(src.indexOf('연차관리2'), -1);
});

test('demo leave uses the fake staff and the hour rules', function () {
  require('../demo.js');
  const src = globalThis.buildDemoSource();
  const parsed = J.parseLeaveRows(src.leave);
  assert.deepEqual(parsed.staff.map(function (s) { return s.name; }), ['직원가', '직원나']);
  assert.equal(parsed.entries[0].date, '2026-10-02');
  assert.equal(parsed.entries[parsed.entries.length - 1].date, '2026-05-04');
  const morning = parsed.entries.find(function (e) { return e.type === '오전 반차'; });
  const afternoon = parsed.entries.find(function (e) { return e.type === '오후 반차'; });
  const hourly = parsed.entries.find(function (e) { return e.type === '시간 연차'; });
  const official = parsed.entries.find(function (e) { return e.type === '공가'; });
  assert.equal(morning.hours, 3);
  assert.equal(afternoon.hours, 4);
  assert.equal(hourly.hours, 2);
  assert.equal(hourly.days, 0.29);
  assert.equal(official.hours, 0);
  assert.equal(parsed.staff[0].remainHours, 94);
  assert.equal(parsed.staff[1].usedDays, 1.71);
});
