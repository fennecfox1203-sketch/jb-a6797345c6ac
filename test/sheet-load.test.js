/* 가짜 CSV만 쓴다. 이름과 금액은 테스트용이다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

require('../ledger.js');
const J = globalThis.Jangbu;

const FAKE_CSV = [
  '거래일자,시각,적요,출금(원),입금(원),내용,잔액(원),거래점,년월,구분',
  '2026-10-02,10:00,가짜학생,,1000,메모,1000,지점,2026-10,수입',
  '2026-10-03,11:00,가짜학생,,2000,메모,3000,지점,2026-10,수입'
].join('\n');

const SORRY = '<!DOCTYPE html><html><head><title>Sorry</title></head><body>Sorry, unable to open the file at this time.</body></html>';

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', function () {
      const port = server.address().port;
      resolve({ server: server, port: port, base: 'http://127.0.0.1:' + port });
    });
  });
}

function close(server) {
  return new Promise(function (resolve) { server.close(function () { resolve(); }); });
}

test('export url always carries a fresh cache buster', function () {
  const a = J.sheetExportUrl('sheet-test-id', '9', '111');
  const b = J.sheetExportUrl('sheet-test-id', '9', '222');
  assert.match(a, /^https:\/\/docs\.google\.com\/spreadsheets\/d\/sheet-test-id\/export\?/);
  assert.match(a, /format=csv/);
  assert.match(a, /gid=9/);
  assert.match(a, /(?:^|&)t=111(?:&|$)/);
  assert.notEqual(a, b);
});

test('html, sorry, and login pages are not treated as csv', function () {
  const sorry = J.classifySheetText(SORRY, 'text/html; charset=utf-8', 200);
  assert.equal(sorry.ok, false);
  assert.equal(sorry.code, 'sorry');
  assert.match(sorry.message, /Sorry/);
  assert.match(sorry.message, /반영하지 않았/);

  const login = J.classifySheetText('<html><a href="https://accounts.google.com/ServiceLogin">sign in</a></html>', 'text/html', 200);
  assert.equal(login.ok, false);
  assert.equal(login.code, 'login');
  assert.match(login.message, /로그인|권한/);

  const csv = J.classifySheetText(FAKE_CSV, 'text/csv; charset=utf-8', 200);
  assert.equal(csv.ok, true);
  assert.equal(csv.text, FAKE_CSV);
});

test('a sorry page is retried, then a fake csv is accepted and cache-busted', async function () {
  const seen = [];
  const opts = [];
  let n = 0;
  const live = await listen(function (req, res) {
    const u = new URL(req.url, 'http://127.0.0.1');
    seen.push(u.searchParams.get('t'));
    n += 1;
    if (n === 1) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(SORRY);
      return;
    }
    res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8' });
    res.end(FAKE_CSV);
  });
  try {
    const rows = await J.loadFreshCsv({
      id: 'fake-sheet',
      gid: '1',
      name: '통장거래내역',
      marker: '거래일자',
      validate: J.checkBankRows,
      urlBase: live.base + '/export',
      tries: 3,
      backoffs: [0, 0],
      sleep: function () { return Promise.resolve(); },
      now: function (i) { return 'nonce-' + i; },
      timeoutMs: 3000,
      fetch: function (url, init) {
        opts.push(init);
        return fetch(url, init);
      }
    });
    assert.equal(rows.length, 3);
    assert.equal(rows[1][0], '2026-10-02');
    assert.deepEqual(seen, ['nonce-0', 'nonce-1']);
    assert.equal(opts[0].cache, 'no-store');
    assert.equal(opts[0].credentials, 'omit');
    assert.equal(opts[0].redirect, 'follow');
    assert.ok(String(opts[0].signal));
  } finally {
    await close(live.server);
  }
});

test('a redirect to csv still loads, and html-only fails in Korean without rows', async function () {
  const live = await listen(function (req, res) {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.pathname === '/go') {
      res.writeHead(302, { location: '/data.csv' });
      res.end();
      return;
    }
    if (u.pathname === '/data.csv') {
      res.writeHead(200, { 'content-type': 'text/csv' });
      res.end(FAKE_CSV);
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(SORRY);
  });
  try {
    const rows = await J.loadFreshCsv({
      id: 'fake-sheet',
      gid: '3',
      name: '통장거래내역',
      marker: '거래일자',
      urlBase: live.base + '/go',
      tries: 1,
      timeoutMs: 3000,
      fetch: fetch
    });
    assert.equal(rows[0][0], '거래일자');
    await assert.rejects(function () {
      return J.loadFreshCsv({
        id: 'fake-sheet',
        gid: '3',
        name: '통장거래내역',
        urlBase: live.base + '/sorry',
        tries: 2,
        backoffs: [0],
        sleep: function () { return Promise.resolve(); },
        now: function (i) { return 'h-' + i; },
        timeoutMs: 3000,
        fetch: fetch
      });
    }, function (err) {
      assert.equal(err.code, 'sorry');
      assert.match(err.message, /통장거래내역/);
      assert.match(err.message, /안내 페이지|Sorry/);
      assert.equal(err.rows, undefined);
      return true;
    });
  } finally {
    await close(live.server);
  }
});

test('truncated sheet without a date header is refused', function () {
  const partial = [
    ['2026-10-01', '', '가짜학생', '', '1000'],
    ['', '', '가짜학생', '', '2000']
  ];
  assert.throws(function () { J.checkBankRows(partial); }, function (err) {
    assert.equal(err.code, 'partial-data');
    assert.match(err.message, /머리글/);
    return true;
  });
});

test('a much shorter ledger does not replace the saved one', function () {
  const prev = { monthDetails: { '2026-01': new Array(40).fill({ dir: '수입', amt: 1 }) } };
  const next = { monthDetails: { '2026-01': [{ dir: '수입', amt: 1 }] } };
  assert.throws(function () { J.refuseShorterLedger(prev, next); }, function (err) {
    assert.equal(err.code, 'partial-data');
    assert.match(err.message, /잘린 응답/);
    assert.match(err.message, /40/);
    return true;
  });
  const grown = { monthDetails: { '2026-01': new Array(50).fill({ dir: '수입', amt: 1 }) } };
  assert.equal(J.refuseShorterLedger(prev, grown), grown);
});

test('failure view names the reason and the last success, and does not call it current', function () {
  const view = J.syncFailureView(new Error('통장거래내역: 구글이 ‘Sorry’ 안내 페이지를 보냈어요.'), {
    monthDetails: { '2026-01': [{ dir: '수입', amt: 1 }] },
    cachedHHmm: '14:32'
  });
  assert.equal(view.kind, 'stale');
  assert.equal(view.data.cachedHHmm, '14:32');
  assert.match(view.banner, /Sorry|안내 페이지/);
  assert.match(view.banner, /14:32/);
  assert.match(view.banner, /바꾸지 않았습니다/);
  assert.doesNotMatch(view.banner, /시트 최신|대체 경로/);
});

test('sheet id comes from the hash, and from storage only when the hash has none', function () {
  const fromHash = J.resolveSheetId('#k=abcDEF1234567890_-zzzz', 'storedstoredstoredstored');
  assert.equal(fromHash.id, 'abcDEF1234567890_-zzzz');
  assert.equal(fromHash.source, 'hash');
  const fromStore = J.resolveSheetId('', 'storedstoredstoredstored');
  assert.equal(fromStore.source, 'storage');
  assert.equal(fromStore.id, 'storedstoredstoredstored');
  assert.deepEqual(J.resolveSheetId('#k=short', ''), { id: '', source: '' });
});

test('a network failure is a Korean error, not an empty success', async function () {
  await assert.rejects(function () {
    return J.loadFreshCsv({
      id: 'fake-sheet',
      gid: '1',
      name: '학생 명단',
      tries: 1,
      timeoutMs: 1000,
      fetch: function () { return Promise.reject(new TypeError('Failed to fetch')); }
    });
  }, function (err) {
    assert.equal(err.code, 'network');
    assert.match(err.message, /학생 명단/);
    assert.match(err.message, /연결이 끊겼거나 브라우저가 구글 응답을 막았어요/);
    return true;
  });
});
