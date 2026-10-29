const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../rules.js');

test('even score serves from the right, odd score from the left', function () {
  assert.equal(rules.serveSide(0), 'right');
  assert.equal(rules.serveSide(2), 'right');
  assert.equal(rules.serveSide(24), 'right');
  assert.equal(rules.serveSide(1), 'left');
  assert.equal(rules.serveSide(3), 'left');
  assert.equal(rules.serveSide(25), 'left');
});

test('the latest camera sits behind the near baseline', function () {
  assert.equal(rules.cameraSide('near', 'right', true), 'left');
  assert.equal(rules.cameraSide('near', 'left', true), 'right');
  assert.equal(rules.cameraSide('far', 'right', true), 'right');
  assert.equal(rules.cameraSide('far', 'left', true), 'left');
  assert.equal(rules.cameraSide('near', 'right', false), 'right');
});

test('the winning team serves next from the side their new score requires', function () {
  let match = rules.fresh();
  let serve = rules.project(match).serve;
  assert.equal(serve.team, 'near');
  assert.equal(serve.side, 'right');
  assert.equal(serve.camera, 'left');
  assert.equal(rules.describeServe(serve, match.names).headline, '화면 왼쪽에서 서브');
  assert.equal(rules.describeServe(serve, match.names).detail, '근거리 0점 · 짝수 · 오른쪽에서 서브');

  match = rules.addPoint(match, { winner: 'near', scoreOnly: true }).match;
  serve = rules.project(match).serve;
  assert.deepEqual(serve.score, { near: 1, far: 0 });
  assert.equal(serve.team, 'near');
  assert.equal(serve.side, 'left');
  assert.equal(serve.camera, 'right');
  assert.equal(rules.describeServe(serve, match.names).detail, '근거리 1점 · 홀수 · 왼쪽에서 서브');

  match = rules.addPoint(match, { winner: 'far', scoreOnly: true }).match;
  serve = rules.project(match).serve;
  assert.deepEqual(serve.score, { near: 1, far: 1 });
  assert.equal(serve.team, 'far');
  assert.equal(serve.side, 'left');
  assert.equal(serve.camera, 'left');
  assert.equal(rules.describeServe(serve, match.names).headline, '화면 왼쪽에서 서브');
  assert.equal(rules.describeServe(serve, match.names).detail, '원거리 1점 · 홀수 · 왼쪽에서 서브');
});

test('a run of points by one team alternates service courts', function () {
  let match = rules.fresh({ firstServer: 'far' });
  const cameras = [];
  for (let i = 0; i < 4; i++) {
    const serve = rules.project(match).serve;
    cameras.push(serve.team + ':' + serve.side + ':' + serve.camera);
    match = rules.addPoint(match, { winner: 'far', scoreOnly: true }).match;
  }
  assert.deepEqual(cameras, [
    'far:right:right',
    'far:left:left',
    'far:right:right',
    'far:left:left'
  ]);
});

test('clips stay in serve, rally, rally-end order and drop the gaps', function () {
  let match = rules.fresh();
  match = rules.addPoint(match, {
    winner: 'near', serveStart: 1, rallyStart: 2, endStart: 5, endOut: 6.5
  }).match;
  match = rules.addPoint(match, {
    winner: 'far', serveStart: 10, rallyStart: 11, endStart: 14, endOut: 15
  }).match;
  const view = rules.project(match);
  const built = rules.buildClips(view.annotated);
  assert.equal(built.ok, true);
  assert.deepEqual(built.clips.map(function (clip) { return clip.label; }), [
    '서브', '랠리', '랠리종료', '서브', '랠리', '랠리종료'
  ]);
  assert.deepEqual(built.clips.map(function (clip) { return [clip.start, clip.end]; }), [
    [1, 2], [2, 5], [5, 6.5], [10, 11], [11, 14], [14, 15]
  ]);
  assert.equal(built.clips[0].camera, 'left');
  assert.equal(built.clips[3].camera, 'right');
  assert.equal(built.clips[3].scoreBefore.near, 1);
  assert.equal(rules.cutDuration(built.clips), 10.5);
  assert.equal(rules.timelineWarning(built.clips), null);
});

test('overlapping points are reported without changing the phase order', function () {
  let match = rules.fresh();
  match = rules.addPoint(match, {
    winner: 'near', serveStart: 1, rallyStart: 2, endStart: 4, endOut: 8
  }).match;
  match = rules.addPoint(match, {
    winner: 'near', serveStart: 7, rallyStart: 7.4, endStart: 8, endOut: 9
  }).match;
  const built = rules.buildClips(rules.project(match).annotated);
  assert.equal(built.clips[3].label, '서브');
  assert.equal(rules.timelineWarning(built.clips), '2번 포인트가 앞 구간과 겹칩니다.');
});

test('marks have to move forward through the three phases', function () {
  const match = rules.fresh({ duration: 30 });
  const reversed = rules.addPoint(match, {
    winner: 'near', serveStart: 4, rallyStart: 3, endStart: 5, endOut: 6
  });
  assert.equal(reversed.ok, false);
  const pastEnd = rules.addPoint(match, {
    winner: 'far', serveStart: 1, rallyStart: 2, endStart: 3, endOut: 40
  });
  assert.equal(pastEnd.ok, false);
});

test('first team to 25 wins, and a 26th point is refused', function () {
  let match = rules.fresh();
  for (let i = 0; i < 24; i++) {
    match = rules.addPoint(match, { winner: i % 2 === 0 ? 'near' : 'far', scoreOnly: true }).match;
  }
  assert.equal(rules.project(match).complete, false);
  assert.deepEqual(rules.project(match).score, { near: 12, far: 12 });
  for (let i = 0; i < 13; i++) {
    match = rules.addPoint(match, { winner: 'near', scoreOnly: true }).match;
  }
  const view = rules.project(match);
  assert.equal(view.complete, true);
  assert.deepEqual(view.score, { near: 25, far: 12 });
  assert.equal(view.winner, 'near');
  assert.equal(rules.describeResult(view, match.names), '근거리 승리 · 근거리 25 : 12 원거리');
  assert.equal(rules.addPoint(match, { winner: 'far', scoreOnly: true }).ok, false);
});

test('win by two continues a 25-24 game until the cap', function () {
  let match = rules.fresh({ winByTwo: true, cap: 30 });
  for (let i = 0; i < 24; i++) match = rules.addPoint(match, { winner: 'near', scoreOnly: true }).match;
  for (let i = 0; i < 24; i++) match = rules.addPoint(match, { winner: 'far', scoreOnly: true }).match;
  assert.equal(rules.project(match).complete, false);
  match = rules.addPoint(match, { winner: 'near', scoreOnly: true }).match;
  assert.deepEqual(rules.project(match).score, { near: 25, far: 24 });
  assert.equal(rules.project(match).complete, false);
  match = rules.addPoint(match, { winner: 'near', scoreOnly: true }).match;
  assert.equal(rules.project(match).complete, true);
  assert.equal(rules.project(match).winner, 'near');

  let capped = rules.fresh({ winByTwo: true, cap: 30 });
  for (let i = 0; i < 24; i++) {
    capped = rules.addPoint(capped, { winner: 'near', scoreOnly: true }).match;
    capped = rules.addPoint(capped, { winner: 'far', scoreOnly: true }).match;
  }
  for (let i = 0; i < 5; i++) {
    capped = rules.addPoint(capped, { winner: 'near', scoreOnly: true }).match;
    capped = rules.addPoint(capped, { winner: 'far', scoreOnly: true }).match;
    assert.equal(rules.project(capped).complete, false);
  }
  assert.deepEqual(rules.project(capped).score, { near: 29, far: 29 });
  capped = rules.addPoint(capped, { winner: 'far', scoreOnly: true }).match;
  assert.equal(rules.project(capped).complete, true);
  assert.equal(rules.project(capped).score.far, 30);
});

test('changing an earlier winner recomputes the later serve', function () {
  let match = rules.fresh();
  match = rules.addPoint(match, { winner: 'near', scoreOnly: true }).match;
  match = rules.addPoint(match, { winner: 'near', scoreOnly: true }).match;
  assert.equal(rules.project(match).annotated[1].server, 'near');
  assert.equal(rules.project(match).annotated[1].side, 'left');
  const changed = rules.updatePoint(match, 0, { winner: 'far' });
  assert.equal(changed.ok, true);
  const second = rules.project(changed.match).annotated[1];
  assert.equal(second.server, 'far');
  assert.equal(second.scoreBefore.far, 1);
  assert.equal(second.side, 'left');
  assert.equal(second.camera, 'left');
});

test('undo restores the previous server and score', function () {
  let match = rules.fresh();
  match = rules.addPoint(match, { winner: 'far', scoreOnly: true }).match;
  const undone = rules.undo(match);
  assert.equal(undone.ok, true);
  assert.equal(undone.match.points.length, 0);
  assert.equal(rules.project(undone.match).serve.team, 'near');
  assert.deepEqual(rules.project(undone.match).score, { near: 0, far: 0 });
});

test('a saved project round-trips and keeps the 25-point rule text', function () {
  let match = rules.fresh({ names: { near: '흰팀', far: '검정팀' } });
  match = rules.addPoint(match, {
    winner: 'far', serveStart: 0.5, rallyStart: 1.2, endStart: 4, endOut: 5
  }).match;
  const loaded = rules.normalize(JSON.parse(JSON.stringify(match)));
  assert.equal(loaded.ok, true);
  assert.equal(loaded.match.target, 25);
  assert.equal(loaded.match.names.near, '흰팀');
  assert.equal(rules.project(loaded.match).score.far, 1);
  assert.equal(rules.ruleText(loaded.match), '25점 게임. 이긴 팀이 다음 점을 서브하고, 그 팀 점수가 짝수면 오른쪽, 홀수면 왼쪽에서 서브합니다.');
  assert.equal(rules.cameraText(loaded.match), '카메라는 근거리 뒤에 있습니다. 근거리의 오른쪽은 화면 왼쪽입니다.');
  assert.equal(rules.normalize({ points: [{ winner: 'nobody' }] }).ok, false);
});
