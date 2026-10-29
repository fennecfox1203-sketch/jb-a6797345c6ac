/* 25점 배드민턴 랠리 편집 규칙.
   이긴 팀이 다음 점을 서브한다.
   그 팀 점수가 짝수면 오른쪽, 홀수면 왼쪽 서비스코트다.
   최신 영상은 근거리 베이스라인 뒤에서 찍어서, 근거리의 오른쪽은 화면 왼쪽이다. */
(function (global) {
  var PHASES = [
    { id: 'serve', label: '서브' },
    { id: 'rally', label: '랠리' },
    { id: 'end', label: '랠리종료' }
  ];

  function clampInt(value, min, max, fallback) {
    var n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function fresh(opts) {
    opts = opts || {};
    var target = clampInt(opts.target == null ? 25 : opts.target, 1, 99, 25);
    var cap = clampInt(opts.cap == null ? 30 : opts.cap, 1, 99, 30);
    return {
      version: 1,
      videoId: opts.videoId || 'OJ2TnebrERo',
      title: opts.title || '2026년 10월 9일',
      url: opts.url || 'https://www.youtube.com/watch?v=OJ2TnebrERo',
      firstServer: opts.firstServer === 'far' ? 'far' : 'near',
      target: target,
      winByTwo: !!opts.winByTwo,
      cap: Math.max(cap, target),
      cameraBehindNear: opts.cameraBehindNear !== false,
      duration: Number.isFinite(opts.duration) ? opts.duration : null,
      videoName: typeof opts.videoName === 'string' ? opts.videoName : '',
      names: cleanNames(opts.names),
      points: []
    };
  }

  function cleanNames(names) {
    names = names || {};
    return {
      near: cleanName(names.near, '근거리'),
      far: cleanName(names.far, '원거리')
    };
  }

  function cleanName(value, fallback) {
    var text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    if (!text) return fallback;
    return text.slice(0, 20);
  }

  function serveSide(score) {
    if (!Number.isInteger(score) || score < 0) throw new Error('score');
    return score % 2 === 0 ? 'right' : 'left';
  }

  function cameraSide(team, side, cameraBehindNear) {
    if (side !== 'right' && side !== 'left') throw new Error('side');
    var camera;
    if (team === 'near') camera = side === 'right' ? 'left' : 'right';
    else if (team === 'far') camera = side === 'right' ? 'right' : 'left';
    else throw new Error('team');
    if (cameraBehindNear === false) camera = camera === 'left' ? 'right' : 'left';
    return camera;
  }

  function effectiveCap(match) {
    return Math.max(match.cap, match.target);
  }

  function gameOver(score, match) {
    var hi = Math.max(score.near, score.far);
    var lo = Math.min(score.near, score.far);
    if (hi < match.target) return false;
    if (!match.winByTwo) return true;
    if (hi >= effectiveCap(match)) return true;
    return hi - lo >= 2;
  }

  function annotate(match) {
    var score = { near: 0, far: 0 };
    var server = match.firstServer === 'far' ? 'far' : 'near';
    var behind = match.cameraBehindNear !== false;
    return match.points.map(function (point, index) {
      var side = serveSide(score[server]);
      var before = { near: score.near, far: score.far };
      var after = { near: score.near, far: score.far };
      after[point.winner] += 1;
      var row = {
        index: index,
        winner: point.winner,
        server: server,
        side: side,
        camera: cameraSide(server, side, behind),
        scoreBefore: before,
        scoreAfter: after,
        serveStart: point.serveStart,
        rallyStart: point.rallyStart,
        endStart: point.endStart,
        endOut: point.endOut
      };
      score = after;
      server = point.winner;
      return row;
    });
  }

  function project(match) {
    var annotated = annotate(match);
    var last = annotated[annotated.length - 1];
    var score = last ? { near: last.scoreAfter.near, far: last.scoreAfter.far } : { near: 0, far: 0 };
    var server = last ? last.winner : (match.firstServer === 'far' ? 'far' : 'near');
    var complete = gameOver(score, match);
    var serve = null;
    if (!complete) {
      var side = serveSide(score[server]);
      serve = {
        team: server,
        side: side,
        camera: cameraSide(server, side, match.cameraBehindNear !== false),
        score: { near: score.near, far: score.far }
      };
    }
    var winner = null;
    if (complete) {
      if (score.near > score.far) winner = 'near';
      else if (score.far > score.near) winner = 'far';
    }
    return {
      annotated: annotated,
      score: score,
      server: server,
      complete: complete,
      winner: winner,
      serve: serve
    };
  }

  function markReason(marks) {
    var fields = [marks.serveStart, marks.rallyStart, marks.endStart, marks.endOut];
    for (var i = 0; i < fields.length; i++) {
      if (typeof fields[i] !== 'number' || !Number.isFinite(fields[i]) || fields[i] < 0) {
        return '시간은 0 이상의 숫자여야 합니다.';
      }
    }
    if (!(marks.serveStart < marks.rallyStart && marks.rallyStart < marks.endStart && marks.endStart < marks.endOut)) {
      return '서브, 랠리, 랠리종료 순서로 시간이 이어져야 합니다.';
    }
    return null;
  }

  function addPoint(match, input) {
    var view = project(match);
    if (view.complete) return { ok: false, reason: '경기가 이미 끝났습니다.' };
    if (!input || (input.winner !== 'near' && input.winner !== 'far')) {
      return { ok: false, reason: '득점 팀이 없습니다.' };
    }
    var point = {
      winner: input.winner,
      serveStart: null,
      rallyStart: null,
      endStart: null,
      endOut: null
    };
    if (!input.scoreOnly) {
      point.serveStart = input.serveStart;
      point.rallyStart = input.rallyStart;
      point.endStart = input.endStart;
      point.endOut = input.endOut;
      var reason = markReason(point);
      if (reason) return { ok: false, reason: reason };
      if (match.duration != null && point.endOut > match.duration + 0.05) {
        return { ok: false, reason: '영상 길이를 넘었습니다.' };
      }
    }
    return {
      ok: true,
      match: Object.assign({}, match, { points: match.points.concat([point]) })
    };
  }

  function updatePoint(match, index, patch) {
    if (index < 0 || index >= match.points.length) return { ok: false, reason: '포인트가 없습니다.' };
    var current = match.points[index];
    var next = {
      winner: patch.winner == null ? current.winner : patch.winner,
      serveStart: patch.serveStart !== undefined ? patch.serveStart : current.serveStart,
      rallyStart: patch.rallyStart !== undefined ? patch.rallyStart : current.rallyStart,
      endStart: patch.endStart !== undefined ? patch.endStart : current.endStart,
      endOut: patch.endOut !== undefined ? patch.endOut : current.endOut
    };
    if (next.winner !== 'near' && next.winner !== 'far') return { ok: false, reason: '득점 팀이 없습니다.' };
    var timed = next.serveStart != null || next.rallyStart != null || next.endStart != null || next.endOut != null;
    if (timed) {
      var reason = markReason(next);
      if (reason) return { ok: false, reason: reason };
      if (match.duration != null && next.endOut > match.duration + 0.05) {
        return { ok: false, reason: '영상 길이를 넘었습니다.' };
      }
    }
    var points = match.points.slice();
    points[index] = next;
    return { ok: true, match: Object.assign({}, match, { points: points }) };
  }

  function undo(match) {
    if (!match.points.length) return { ok: false, reason: '취소할 포인트가 없습니다.', match: match };
    return { ok: true, match: Object.assign({}, match, { points: match.points.slice(0, -1) }) };
  }

  function buildClips(annotated) {
    var clips = [];
    for (var i = 0; i < annotated.length; i++) {
      var point = annotated[i];
      if (point.serveStart == null && point.rallyStart == null && point.endStart == null && point.endOut == null) {
        return { ok: false, reason: (i + 1) + '번 포인트에 서브, 랠리, 랠리종료 시간이 없습니다.', clips: [] };
      }
      var reason = markReason(point);
      if (reason) return { ok: false, reason: (i + 1) + '번 포인트: ' + reason, clips: [] };
      var phases = [
        ['serve', '서브', point.serveStart, point.rallyStart],
        ['rally', '랠리', point.rallyStart, point.endStart],
        ['end', '랠리종료', point.endStart, point.endOut]
      ];
      for (var k = 0; k < phases.length; k++) {
        clips.push({
          point: i + 1,
          phase: phases[k][0],
          label: phases[k][1],
          start: phases[k][2],
          end: phases[k][3],
          server: point.server,
          side: point.side,
          camera: point.camera,
          winner: point.winner,
          scoreBefore: point.scoreBefore,
          scoreAfter: point.scoreAfter
        });
      }
    }
    return { ok: true, clips: clips };
  }

  function timelineWarning(clips) {
    for (var i = 1; i < clips.length; i++) {
      if (clips[i].start < clips[i - 1].end - 0.02) {
        return clips[i].point + '번 포인트가 앞 구간과 겹칩니다.';
      }
    }
    return null;
  }

  function cutDuration(clips) {
    var total = 0;
    for (var i = 0; i < clips.length; i++) total += clips[i].end - clips[i].start;
    return total;
  }

  function describeServe(serve, names) {
    names = cleanNames(names);
    var score = serve.score[serve.team];
    var parity = score % 2 === 0 ? '짝수' : '홀수';
    var sideLabel = serve.side === 'right' ? '오른쪽' : '왼쪽';
    var cameraLabel = serve.camera === 'left' ? '화면 왼쪽' : '화면 오른쪽';
    return {
      headline: cameraLabel + '에서 서브',
      detail: names[serve.team] + ' ' + score + '점 · ' + parity + ' · ' + sideLabel + '에서 서브',
      parity: parity,
      sideLabel: sideLabel,
      cameraLabel: cameraLabel
    };
  }

  function ruleText(match) {
    var text = match.target + '점 게임. ';
    if (match.winByTwo) text += '2점 차, ' + effectiveCap(match) + '점 상한. ';
    text += '이긴 팀이 다음 점을 서브하고, 그 팀 점수가 짝수면 오른쪽, 홀수면 왼쪽에서 서브합니다.';
    return text;
  }

  function cameraText(match) {
    if (match.cameraBehindNear !== false) {
      return '카메라는 근거리 뒤에 있습니다. 근거리의 오른쪽은 화면 왼쪽입니다.';
    }
    return '카메라는 원거리 뒤에 있습니다. 화면의 좌우를 바꿔 표시합니다.';
  }

  function describeResult(view, names) {
    names = cleanNames(names);
    var line = names.near + ' ' + view.score.near + ' : ' + view.score.far + ' ' + names.far;
    if (!view.complete) return line;
    if (!view.winner) return line + ' 무승부';
    return names[view.winner] + ' 승리 · ' + line;
  }

  function formatTime(seconds) {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '–';
    var sign = seconds < 0 ? '-' : '';
    var t = Math.abs(seconds);
    var m = Math.floor(t / 60);
    var s = t - m * 60;
    return sign + String(m) + ':' + s.toFixed(2).padStart(5, '0');
  }

  function numOrNull(value) {
    if (value == null || value === '') return null;
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, reason: '프로젝트 형식이 아닙니다.' };
    }
    var base = fresh(raw);
    if (!Array.isArray(raw.points)) return { ok: true, match: base };
    var points = [];
    for (var i = 0; i < raw.points.length; i++) {
      var point = raw.points[i];
      if (!point || (point.winner !== 'near' && point.winner !== 'far')) {
        return { ok: false, reason: (i + 1) + '번 포인트의 득점 팀이 잘못되었습니다.' };
      }
      var next = {
        winner: point.winner,
        serveStart: numOrNull(point.serveStart),
        rallyStart: numOrNull(point.rallyStart),
        endStart: numOrNull(point.endStart),
        endOut: numOrNull(point.endOut)
      };
      var timed = next.serveStart != null || next.rallyStart != null || next.endStart != null || next.endOut != null;
      if (timed) {
        var reason = markReason(next);
        if (reason) return { ok: false, reason: (i + 1) + '번 포인트: ' + reason };
      }
      points.push(next);
    }
    base.points = points;
    return { ok: true, match: base };
  }

  var api = {
    PHASES: PHASES,
    fresh: fresh,
    normalize: normalize,
    serveSide: serveSide,
    cameraSide: cameraSide,
    project: project,
    addPoint: addPoint,
    updatePoint: updatePoint,
    undo: undo,
    markReason: markReason,
    buildClips: buildClips,
    timelineWarning: timelineWarning,
    cutDuration: cutDuration,
    describeServe: describeServe,
    describeResult: describeResult,
    ruleText: ruleText,
    cameraText: cameraText,
    formatTime: formatTime,
    cleanNames: cleanNames
  };

  global.RallyRules = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
