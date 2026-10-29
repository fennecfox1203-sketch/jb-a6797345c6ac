(function () {
  var VIDEOS = [
    { id: 'OJ2TnebrERo', title: '2026년 10월 9일', duration: '22:11', note: '가장 최근 · 한국시간 10월 9일 오후 12:55' },
    { id: 'wy1IJbtFrOc', title: '2026년 10월 9일', duration: '17:17', note: '같은 날' },
    { id: 'OKdsct_qRKM', title: '2026년 10월 9일', duration: '13:06', note: '같은 날' },
    { id: 'CdRAUEfm-Hk', title: '2026년 10월 9일', duration: '12:14', note: '같은 날' },
    { id: '0dkgoP1dsE8', title: '2026년 10월 9일', duration: '13:09', note: '같은 날' }
  ];
  var STORE = 'rally-editor:v1';

  var video = document.getElementById('video');
  var seek = document.getElementById('seek');
  var match = RallyRules.fresh();
  var draft = blankDraft();
  var videoUrl = '';
  var scrubbing = false;
  var previewToken = 0;
  var clipGen = 0;
  var previewing = false;
  var currentClip = null;
  var toastTimer = 0;

  function blankDraft() {
    return { serveStart: null, rallyStart: null, endStart: null, endOut: null };
  }

  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function toast(message) {
    var el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 3400);
  }

  function knownVideo(id) {
    for (var i = 0; i < VIDEOS.length; i++) if (VIDEOS[i].id === id) return VIDEOS[i];
    return null;
  }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ match: match, draft: draft })); }
    catch (err) { /* private mode */ }
  }

  function loadStored() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (!raw) return;
      var normalized = RallyRules.normalize(raw.match || raw);
      if (!normalized.ok) return;
      match = normalized.match;
      if (raw.draft) {
        draft = {
          serveStart: numberOrNull(raw.draft.serveStart),
          rallyStart: numberOrNull(raw.draft.rallyStart),
          endStart: numberOrNull(raw.draft.endStart),
          endOut: numberOrNull(raw.draft.endOut)
        };
      }
    } catch (err) { /* ignore broken storage */ }
  }

  function numberOrNull(value) {
    if (value == null || value === '') return null;
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function hasVideo() {
    return Number.isFinite(video.duration) && video.duration > 0;
  }

  function stopPreview() {
    previewToken += 1;
    clipGen += 1;
    previewing = false;
    currentClip = null;
  }

  function fillVideoSelect() {
    var select = $('whichVideo');
    var html = VIDEOS.map(function (item) {
      var label = item.duration + (item.note ? ' · ' + item.note : '');
      return '<option value="' + item.id + '">' + esc(label) + '</option>';
    }).join('');
    if (!knownVideo(match.videoId)) {
      html += '<option value="' + esc(match.videoId) + '">' + esc(match.title) + '</option>';
    }
    select.innerHTML = html;
    select.value = match.videoId;
  }

  function sourceCopy() {
    var item = knownVideo(match.videoId);
    if (item) return item.title + ' · ' + item.duration + (item.note ? ' · ' + item.note : '');
    return match.title;
  }

  function draftProblem() {
    var order = [
      ['서브 시작', draft.serveStart],
      ['랠리 시작', draft.rallyStart],
      ['랠리종료 시작', draft.endStart],
      ['랠리종료 끝', draft.endOut]
    ];
    var last = null;
    for (var i = 0; i < order.length; i++) {
      if (order[i][1] == null) continue;
      if (last != null && !(order[i][1] > last[1])) return order[i][0] + '은 앞 지점보다 뒤여야 합니다.';
      last = order[i];
    }
    return '';
  }

  function nextMark() {
    if (draft.serveStart == null) return 'serve';
    if (draft.rallyStart == null) return 'rally';
    if (draft.endStart == null) return 'end';
    if (draft.endOut == null) return 'out';
    return 'winner';
  }

  function setTimeInput(id, value) {
    var el = $(id);
    if (document.activeElement === el) return;
    el.value = value == null ? '' : String(Math.round(value * 1000) / 1000);
  }

  function renderCourt(serve) {
    var boxes = [
      { id: 'far-left', x: 24, y: 44, w: 86, h: 90 },
      { id: 'far-right', x: 110, y: 44, w: 86, h: 90 },
      { id: 'near-left', x: 24, y: 156, w: 86, h: 90 },
      { id: 'near-right', x: 110, y: 156, w: 86, h: 90 }
    ];
    var active = serve ? serve.team + '-' + serve.camera : '';
    var rects = boxes.map(function (box) {
      return '<rect class="service-box' + (box.id === active ? ' on' : '') + '" x="' + box.x + '" y="' + box.y + '" width="' + box.w + '" height="' + box.h + '" rx="6"></rect>';
    }).join('');
    var marker = '';
    boxes.forEach(function (box) {
      if (box.id !== active) return;
      marker = '<circle cx="' + (box.x + box.w / 2) + '" cy="' + (box.y + box.h / 2) + '" r="8" fill="#172000"></circle>';
    });
    $('court').innerHTML =
      '<svg viewBox="0 0 220 300" role="img" aria-label="서비스코트">' +
      '<text x="24" y="14">화면 왼쪽</text><text x="128" y="14">화면 오른쪽</text>' +
      '<text x="110" y="36" text-anchor="middle">' + esc(match.names.far) + '</text>' +
      rects +
      '<rect x="20" y="140" width="180" height="10" fill="#f3f6ef" opacity="0.9"></rect>' +
      marker +
      '<text x="110" y="292" text-anchor="middle">' + esc(match.names.near) + '</text>' +
      '</svg>';
  }

  function renderTable(view) {
    var rows = $('rows');
    if (!view.annotated.length) {
      rows.innerHTML = '';
      $('emptyRows').hidden = false;
      return;
    }
    $('emptyRows').hidden = true;
    rows.innerHTML = view.annotated.map(function (point) {
      var before = point.scoreBefore.near + '-' + point.scoreBefore.far;
      var side = point.side === 'right' ? '오른쪽' : '왼쪽';
      var camera = point.camera === 'left' ? '화면 왼쪽' : '화면 오른쪽';
      return '<tr class="seek" data-index="' + point.index + '">' +
        '<td>' + (point.index + 1) + '</td>' +
        '<td>' + before + '</td>' +
        '<td>' + esc(match.names[point.server]) + '</td>' +
        '<td>' + side + '</td>' +
        '<td>' + camera + '</td>' +
        timeCell(point.index, 'serveStart', point.serveStart) +
        timeCell(point.index, 'rallyStart', point.rallyStart) +
        timeCell(point.index, 'endStart', point.endStart) +
        timeCell(point.index, 'endOut', point.endOut) +
        '<td><select data-index="' + point.index + '" data-field="winner" aria-label="' + (point.index + 1) + '번 득점 팀">' +
          '<option value="near"' + (point.winner === 'near' ? ' selected' : '') + '>' + esc(match.names.near) + '</option>' +
          '<option value="far"' + (point.winner === 'far' ? ' selected' : '') + '>' + esc(match.names.far) + '</option>' +
        '</select></td></tr>';
    }).join('');
  }

  function timeCell(index, field, value) {
    var shown = value == null ? '' : String(Math.round(value * 1000) / 1000);
    return '<td><input data-index="' + index + '" data-field="' + field + '" type="number" min="0" step="0.01" value="' + shown + '" aria-label="' + (index + 1) + '번 ' + field + '"></td>';
  }

  function render() {
    var view = RallyRules.project(match);
    $('rule').textContent = RallyRules.ruleText(match);
    $('cameraNote').textContent = RallyRules.cameraText(match);
    $('nearNameLabel').textContent = match.names.near;
    $('farNameLabel').textContent = match.names.far;
    $('winNearText').textContent = match.names.near + ' 득점';
    $('winFarText').textContent = match.names.far + ' 득점';
    $('sourceLine').textContent = sourceCopy();
    $('sourceLink').href = match.url;
    $('sourceLink').textContent = '유튜브에서 보기';

    if (previewing && currentClip) {
      var shown = currentClip.phase === 'end' ? currentClip.scoreAfter : currentClip.scoreBefore;
      $('nearScore').textContent = String(shown.near);
      $('farScore').textContent = String(shown.far);
      $('callout').textContent = currentClip.label;
      $('calloutSub').textContent = currentClip.phase === 'serve'
        ? (currentClip.camera === 'left' ? '화면 왼쪽에서 서브' : '화면 오른쪽에서 서브')
        : (currentClip.phase === 'end' ? match.names[currentClip.winner] + ' 득점' : '랠리 진행');
      renderCourt({ team: currentClip.server, camera: currentClip.camera });
    } else {
      $('nearScore').textContent = String(view.score.near);
      $('farScore').textContent = String(view.score.far);
      if (view.complete) {
        $('callout').textContent = RallyRules.describeResult(view, match.names);
        $('calloutSub').textContent = '경기 종료';
      } else {
        var described = RallyRules.describeServe(view.serve, match.names);
        $('callout').textContent = described.headline;
        $('calloutSub').textContent = described.detail;
      }
      renderCourt(view.serve);
    }

    var step = nextMark();
    ['Serve', 'Rally', 'End', 'Out'].forEach(function (name) {
      $('step' + name).classList.toggle('now', step === name.toLowerCase() && !view.complete);
    });
    $('chipServe').className = draft.serveStart != null ? 'done' : (step === 'serve' ? 'now' : '');
    $('chipRally').className = draft.rallyStart != null ? 'done' : (step === 'rally' ? 'now' : '');
    $('chipEnd').className = draft.endStart != null ? 'done' : (step === 'end' || step === 'out' ? 'now' : '');

    setTimeInput('serveTime', draft.serveStart);
    setTimeInput('rallyTime', draft.rallyStart);
    setTimeInput('endTime', draft.endStart);
    setTimeInput('outTime', draft.endOut);
    var problem = draftProblem();
    $('draftError').hidden = !problem;
    $('draftError').textContent = problem;

    var locked = view.complete;
    $('winNear').disabled = locked;
    $('winFar').disabled = locked;
    $('undoBtn').disabled = match.points.length === 0;
    $('firstServer').disabled = match.points.length > 0;
    $('firstServer').value = match.firstServer;
    if (document.activeElement !== $('target')) $('target').value = String(match.target);
    if (document.activeElement !== $('cap')) $('cap').value = String(match.cap);
    $('winByTwo').checked = !!match.winByTwo;
    $('cameraBehind').checked = match.cameraBehindNear !== false;
    if (document.activeElement !== $('nearName')) $('nearName').value = match.names.near;
    if (document.activeElement !== $('farName')) $('farName').value = match.names.far;
    if (document.activeElement !== $('whichVideo')) $('whichVideo').value = match.videoId;

    renderTable(view);
    var built = RallyRules.buildClips(view.annotated);
    if (built.ok && built.clips.length) {
      var warn = RallyRules.timelineWarning(built.clips);
      $('warning').hidden = !warn;
      $('warning').textContent = warn || '';
      $('summary').textContent = '편집 길이 ' + RallyRules.formatTime(RallyRules.cutDuration(built.clips)) +
        ' · 포인트 ' + view.annotated.length +
        (hasVideo() ? ' · 원본 ' + RallyRules.formatTime(video.duration) : '');
    } else {
      var scoreOnly = match.points.length > 0 && match.points.every(function (point) {
        return point.serveStart == null && point.rallyStart == null && point.endStart == null && point.endOut == null;
      });
      $('warning').hidden = scoreOnly || !view.annotated.length;
      $('warning').textContent = !scoreOnly && view.annotated.length ? built.reason : '';
      $('summary').textContent = scoreOnly
        ? '점수 연습 중입니다. 영상을 열고 시간을 찍으면 서브, 랠리, 랠리종료 순서로 출력됩니다.'
        : (view.annotated.length
          ? '시간을 모두 채우면 서브, 랠리, 랠리종료 순서로 미리보기와 출력이 됩니다.'
          : '미리보기와 출력은 포인트마다 서브, 랠리, 랠리종료만 이어 붙입니다.');
    }
    $('fileNote').textContent = hasVideo()
      ? (match.videoName || '영상') + ' · ' + RallyRules.formatTime(video.duration)
      : (match.videoName ? match.videoName + ' 을 다시 여세요. 점수 기록은 남아 있습니다.' : '영상 없이는 점수와 서브 위치만 연습할 수 있습니다.');
    $('empty').hidden = hasVideo();
    renderOverlay();
    $('play').textContent = video.paused ? '재생' : '일시정지';
    paintTime();
  }

  function paintTime() {
    var duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (duration > 0) seek.max = String(duration);
    if (!scrubbing) seek.value = String(Math.min(video.currentTime || 0, duration || 0));
    $('time').textContent = RallyRules.formatTime(video.currentTime || 0) + ' / ' + RallyRules.formatTime(duration);
  }

  function renderOverlay() {
    var overlay = $('overlay');
    if (!hasVideo()) { overlay.hidden = true; return; }
    overlay.hidden = false;
    var view = RallyRules.project(match);
    if (previewing && currentClip) {
      var score = currentClip.phase === 'end' ? currentClip.scoreAfter : currentClip.scoreBefore;
      $('overlayScore').textContent = match.names.near + ' ' + score.near + ' - ' + score.far + ' ' + match.names.far;
      $('overlayPhase').textContent = currentClip.label;
      $('overlayHint').textContent = currentClip.label;
      return;
    }
    $('overlayScore').textContent = match.names.near + ' ' + view.score.near + ' - ' + view.score.far + ' ' + match.names.far;
    if (view.complete) {
      $('overlayPhase').textContent = '경기 종료';
      $('overlayHint').textContent = RallyRules.describeResult(view, match.names);
      return;
    }
    $('overlayPhase').textContent = '다음 서브';
    $('overlayHint').textContent = RallyRules.describeServe(view.serve, match.names).headline;
  }

  function stamp(field) {
    stopPreview();
    if (!hasVideo()) { toast('영상을 먼저 여세요. 점수만 연습하려면 득점 버튼을 누르세요.'); return; }
    draft[field] = video.currentTime;
    save();
    render();
  }

  function award(team) {
    stopPreview();
    var result;
    if (!hasVideo()) {
      result = RallyRules.addPoint(match, { winner: team, scoreOnly: true });
    } else {
      var endOut = draft.endOut == null ? video.currentTime : draft.endOut;
      result = RallyRules.addPoint(match, {
        winner: team,
        serveStart: draft.serveStart,
        rallyStart: draft.rallyStart,
        endStart: draft.endStart,
        endOut: endOut
      });
    }
    if (!result.ok) { toast(result.reason); return; }
    match = result.match;
    draft = blankDraft();
    save();
    render();
    var view = RallyRules.project(match);
    if (view.complete) toast(RallyRules.describeResult(view, match.names));
    else toast('다음 ' + RallyRules.describeServe(view.serve, match.names).headline);
  }

  function undoLast() {
    stopPreview();
    var result = RallyRules.undo(match);
    if (!result.ok) { toast(result.reason); return; }
    match = result.match;
    save();
    render();
  }

  function clearDraft() {
    stopPreview();
    draft = blankDraft();
    save();
    render();
    toast('이번 서브를 다시 찍으세요. 점수는 그대로입니다.');
  }

  function togglePlay() {
    if (!hasVideo()) { toast('영상을 먼저 여세요.'); return; }
    if (previewing) { stopPreview(); video.pause(); render(); return; }
    if (video.paused) video.play();
    else video.pause();
  }

  function jump(seconds) {
    if (!hasVideo()) return;
    stopPreview();
    var next = video.currentTime + seconds;
    video.currentTime = Math.min(video.duration, Math.max(0, next));
  }

  function stepFrame(direction) {
    if (!hasVideo()) return;
    stopPreview();
    video.pause();
    var next = video.currentTime + direction / 30;
    video.currentTime = Math.min(video.duration, Math.max(0, next));
  }

  function seekTo(time, done) {
    var target = Math.max(0, time);
    if (Math.abs(video.currentTime - target) < 0.03) { done(); return; }
    var onSeeked = function () {
      video.removeEventListener('seeked', onSeeked);
      done();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = target;
  }

  function startPreview() {
    var view = RallyRules.project(match);
    var built = RallyRules.buildClips(view.annotated);
    if (!built.ok || !built.clips.length) { toast(built.reason || '시간을 채운 포인트가 없습니다.'); return; }
    if (!hasVideo()) { toast('영상을 먼저 여세요.'); return; }
    var warn = RallyRules.timelineWarning(built.clips);
    if (warn) toast(warn);
    stopPreview();
    var token = ++previewToken;
    var clips = built.clips;
    var index = 0;
    previewing = true;

    function playClip() {
      if (token !== previewToken) return;
      if (index >= clips.length) {
        previewing = false;
        currentClip = null;
        video.pause();
        render();
        toast('미리보기가 끝났습니다.');
        return;
      }
      var mine = ++clipGen;
      currentClip = clips[index];
      render();
      seekTo(currentClip.start, function () {
        if (token !== previewToken || mine !== clipGen) return;
        if (video.currentTime >= currentClip.end - 0.02) {
          index += 1;
          playClip();
          return;
        }
        var played = video.play();
        if (played && played.catch) played.catch(function () { toast('재생을 시작하지 못했습니다.'); });
        var watch = function () {
          if (token !== previewToken || mine !== clipGen) return;
          if (video.currentTime >= currentClip.end - 0.02) {
            index += 1;
            playClip();
            return;
          }
          if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(watch);
        };
        if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(watch);
        else video.addEventListener('timeupdate', function onTime() {
          if (token !== previewToken || mine !== clipGen) { video.removeEventListener('timeupdate', onTime); return; }
          if (video.currentTime >= currentClip.end - 0.02) {
            video.removeEventListener('timeupdate', onTime);
            index += 1;
            playClip();
          }
        });
      });
    }
    playClip();
  }

  function openFilePicker() { $('file').click(); }

  function useFile(file) {
    if (!file) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(file);
    match.videoName = file.name;
    video.src = videoUrl;
    save();
  }

  function recordSample() {
    return new Promise(function (resolve, reject) {
      var canvas = document.createElement('canvas');
      canvas.width = 960;
      canvas.height = 540;
      var ctx = canvas.getContext('2d');
      if (!canvas.captureStream || !window.MediaRecorder) { reject(new Error('이 브라우저는 샘플 녹화를 지원하지 않습니다.')); return; }
      var stream = canvas.captureStream(30);
      var mime = 'video/webm';
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) mime = 'video/webm;codecs=vp8';
      var recorder;
      try { recorder = new MediaRecorder(stream, { mimeType: mime }); }
      catch (err) { reject(err); return; }
      var chunks = [];
      recorder.ondataavailable = function (event) { if (event.data && event.data.size) chunks.push(event.data); };
      recorder.onerror = function () { reject(new Error('샘플 녹화에 실패했습니다.')); };
      recorder.onstop = function () { resolve(new Blob(chunks, { type: mime })); };
      var frame = 0;
      var frames = 30 * 8;
      recorder.start(200);
      (function draw() {
        var t = frame / 30;
        ctx.fillStyle = '#143024';
        ctx.fillRect(0, 0, 960, 540);
        ctx.fillStyle = 'rgba(214,255,74,0.2)';
        ctx.fillRect(40, 36, 430, 400);
        ctx.fillStyle = 'rgba(255,154,112,0.18)';
        ctx.fillRect(490, 36, 430, 400);
        ctx.strokeStyle = '#f3f6ef';
        ctx.lineWidth = 4;
        ctx.strokeRect(40, 36, 880, 400);
        ctx.beginPath();
        ctx.moveTo(480, 36);
        ctx.lineTo(480, 436);
        ctx.stroke();
        ctx.fillStyle = '#f3f6ef';
        ctx.font = '700 64px sans-serif';
        ctx.fillText('LEFT', 150, 230);
        ctx.fillText('RIGHT', 600, 230);
        ctx.font = '600 32px sans-serif';
        ctx.fillText(t.toFixed(2) + 's', 420, 500);
        frame += 1;
        if (frame < frames) setTimeout(draw, 1000 / 30);
        else setTimeout(function () { recorder.stop(); }, 250);
      })();
    });
  }

  function downloadProject() {
    var blob = new Blob([JSON.stringify(match, null, 2)], { type: 'application/json' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = (match.videoId || 'rally') + '-rally.json';
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }

  function commandText() {
    var name = match.videoName || '영상.mp4';
    return 'python3 export_edit.py ' + (match.videoId || 'rally') + '-rally.json "' + name + '" -o 편집.mp4';
  }

  function readSettingsFromControls() {
    match.target = clampControl($('target').value, 1, 99, match.target);
    match.cap = Math.max(match.target, clampControl($('cap').value, 1, 99, match.cap));
    match.winByTwo = $('winByTwo').checked;
    match.cameraBehindNear = $('cameraBehind').checked;
    if (match.points.length === 0) match.firstServer = $('firstServer').value === 'far' ? 'far' : 'near';
    match.names = RallyRules.cleanNames({ near: $('nearName').value, far: $('farName').value });
  }

  function clampControl(value, min, max, fallback) {
    var n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function chooseVideo(id) {
    var item = knownVideo(id);
    match.videoId = id;
    if (item) {
      match.title = item.title;
      match.url = 'https://www.youtube.com/watch?v=' + item.id;
    }
    save();
    render();
  }

  function onKey(event) {
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (event.metaKey || event.ctrlKey || event.altKey) {
      if (event.code === 'KeyZ' && !event.shiftKey) { event.preventDefault(); undoLast(); }
      return;
    }
    if (event.repeat && event.code !== 'ArrowLeft' && event.code !== 'ArrowRight' && event.code !== 'Comma' && event.code !== 'Period') return;
    if (previewing) {
      if (event.code === 'Escape' || event.code === 'Space') {
        event.preventDefault();
        stopPreview();
        video.pause();
        render();
      }
      return;
    }
    if (event.code === 'Space') { event.preventDefault(); togglePlay(); return; }
    if (event.code === 'KeyS') { event.preventDefault(); stamp('serveStart'); }
    else if (event.code === 'KeyR') { event.preventDefault(); stamp('rallyStart'); }
    else if (event.code === 'KeyE') { event.preventDefault(); stamp('endStart'); }
    else if (event.code === 'KeyN') { event.preventDefault(); award('near'); }
    else if (event.code === 'KeyF') { event.preventDefault(); award('far'); }
    else if (event.code === 'KeyL' || event.code === 'Escape') { event.preventDefault(); clearDraft(); }
    else if (event.code === 'ArrowLeft') { event.preventDefault(); jump(event.shiftKey ? -5 : -1); }
    else if (event.code === 'ArrowRight') { event.preventDefault(); jump(event.shiftKey ? 5 : 1); }
    else if (event.code === 'Comma') { event.preventDefault(); stepFrame(-1); }
    else if (event.code === 'Period') { event.preventDefault(); stepFrame(1); }
    else if (event.code === 'Home') { event.preventDefault(); if (hasVideo()) { stopPreview(); video.currentTime = 0; } }
    else if (event.code === 'End') { event.preventDefault(); if (hasVideo()) { stopPreview(); video.currentTime = video.duration; } }
  }

  function bindDraftInput(id, field) {
    $(id).addEventListener('change', function () {
      draft[field] = numberOrNull($(id).value);
      if (draft[field] != null && hasVideo()) video.currentTime = Math.min(video.duration, draft[field]);
      save();
      render();
    });
  }

  $('openFile').addEventListener('click', openFilePicker);
  $('emptyOpen').addEventListener('click', openFilePicker);
  $('file').addEventListener('change', function () { useFile($('file').files[0]); });
  $('sampleBtn').addEventListener('click', function () {
    stopPreview();
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = '';
    match.videoName = 'sample.mp4';
    video.onerror = function () {
      video.onerror = null;
      toast('샘플 파일을 찾지 못해 브라우저에서 만듭니다.');
      $('sampleBtn').disabled = true;
      recordSample().then(function (blob) {
        videoUrl = URL.createObjectURL(blob);
        match.videoName = '샘플.webm';
        video.src = videoUrl;
        save();
      }).catch(function (err) {
        toast(err.message || '샘플을 만들지 못했습니다.');
      }).then(function () { $('sampleBtn').disabled = false; });
    };
    video.src = 'sample.mp4';
    save();
  });
  $('play').addEventListener('click', togglePlay);
  video.addEventListener('click', function () { if (!previewing) togglePlay(); });
  video.addEventListener('play', render);
  video.addEventListener('pause', render);
  video.addEventListener('loadedmetadata', function () {
    video.onerror = null;
    match.duration = video.duration;
    seek.max = String(video.duration);
    save();
    render();
  });
  video.addEventListener('timeupdate', paintTime);
  seek.addEventListener('pointerdown', function () { scrubbing = true; stopPreview(); });
  seek.addEventListener('input', function () {
    if (hasVideo()) video.currentTime = Number(seek.value);
  });
  seek.addEventListener('pointerup', function () { scrubbing = false; });
  seek.addEventListener('change', function () { scrubbing = false; });
  $('rate').addEventListener('change', function () { video.playbackRate = Number($('rate').value); });

  $('markServe').addEventListener('click', function () { stamp('serveStart'); });
  $('markRally').addEventListener('click', function () { stamp('rallyStart'); });
  $('markEnd').addEventListener('click', function () { stamp('endStart'); });
  $('markOut').addEventListener('click', function () { stamp('endOut'); });
  bindDraftInput('serveTime', 'serveStart');
  bindDraftInput('rallyTime', 'rallyStart');
  bindDraftInput('endTime', 'endStart');
  bindDraftInput('outTime', 'endOut');
  $('winNear').addEventListener('click', function () { award('near'); });
  $('winFar').addEventListener('click', function () { award('far'); });
  $('letBtn').addEventListener('click', clearDraft);
  $('undoBtn').addEventListener('click', undoLast);
  $('previewBtn').addEventListener('click', startPreview);
  $('saveBtn').addEventListener('click', downloadProject);
  $('loadBtn').addEventListener('click', function () { $('projectFile').click(); });
  $('projectFile').addEventListener('change', function () {
    var file = $('projectFile').files[0];
    if (!file) return;
    file.text().then(function (text) {
      var normalized = RallyRules.normalize(JSON.parse(text));
      if (!normalized.ok) { toast(normalized.reason); return; }
      match = normalized.match;
      draft = blankDraft();
      fillVideoSelect();
      save();
      render();
      toast('프로젝트를 불러왔습니다.');
    }).catch(function () { toast('프로젝트 파일을 읽지 못했습니다.'); });
  });
  $('copyBtn').addEventListener('click', function () {
    var text = commandText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('자르기 명령을 복사했습니다.'); }, function () { toast(text); });
    } else toast(text);
  });
  $('resetBtn').addEventListener('click', function () {
    if (match.points.length && !window.confirm('이 경기의 포인트를 모두 지울까요?')) return;
    var kept = {
      videoId: match.videoId,
      title: match.title,
      url: match.url,
      videoName: match.videoName,
      duration: match.duration,
      cameraBehindNear: match.cameraBehindNear,
      target: match.target,
      winByTwo: match.winByTwo,
      cap: match.cap,
      firstServer: match.firstServer,
      names: match.names
    };
    match = RallyRules.fresh(kept);
    match.duration = kept.duration;
    match.videoName = kept.videoName;
    draft = blankDraft();
    save();
    render();
  });

  $('whichVideo').addEventListener('change', function () { chooseVideo($('whichVideo').value); });
  ['target', 'cap', 'winByTwo', 'cameraBehind', 'firstServer', 'nearName', 'farName'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      readSettingsFromControls();
      save();
      render();
    });
  });

  $('rows').addEventListener('change', function (event) {
    var el = event.target;
    if (!el.dataset || el.dataset.index == null) return;
    var index = Number(el.dataset.index);
    var patch = {};
    patch[el.dataset.field] = el.dataset.field === 'winner' ? el.value : numberOrNull(el.value);
    var result = RallyRules.updatePoint(match, index, patch);
    if (!result.ok) { toast(result.reason); render(); return; }
    match = result.match;
    save();
    render();
  });
  $('rows').addEventListener('click', function (event) {
    if (event.target.closest('input, select')) return;
    var row = event.target.closest('tr');
    if (!row || !hasVideo()) return;
    var point = RallyRules.project(match).annotated[Number(row.dataset.index)];
    if (point && point.serveStart != null) {
      stopPreview();
      video.currentTime = point.serveStart;
    }
  });

  document.addEventListener('keydown', onKey);
  Array.prototype.forEach.call(document.querySelectorAll('input[type="number"]'), function (el) {
    el.addEventListener('wheel', function () { el.blur(); }, { passive: true });
  });

  loadStored();
  fillVideoSelect();
  render();
})();
