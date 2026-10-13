/* 차트는 숫자만 그린다. 계산은 ledger.js 에 있다. */
(function (root) {
  'use strict';

  const FONT = 'font-family="-apple-system,BlinkMacSystemFont,Apple SD Gothic Neo,Noto Sans KR,sans-serif"';
  const EXP_NAME = {
    '인건비': '#ff6b7a', '대출': '#ffb020', '운영비': '#c084fc',
    '임대료': '#22d3ee', '공과금': '#a3e635', '보증금': '#fb923c', '기타': '#94a3b8'
  };
  const EXP_FALLBACK = ['#22d3ee', '#f472b6', '#a3e635', '#fb923c', '#38bdf8', '#94a3b8'];
  const DONUT_COLORS = [
    '#6aa8ff', '#ff6b7a', '#3dd68c', '#ffb020', '#c084fc', '#22d3ee',
    '#f472b6', '#a3e635', '#fb923c', '#818cf8', '#34d399', '#e879f9',
    '#94a3b8', '#facc15', '#38bdf8'
  ];

  function expColor(cat, i) { return EXP_NAME[cat] || EXP_FALLBACK[(i || 0) % EXP_FALLBACK.length]; }
  function n(v) { return Number(v) || 0; }
  function man(v) { return String(Math.round(n(v) / 10000)); }
  function mon(ym) { return String(Number(String(ym || '').slice(5)) || ''); }
  function pointYm(p) {
    if (p == null) return '';
    if (typeof p === 'string') return p;
    return p.ym || '';
  }
  /* 같은 해만 있으면 월 숫자. 해가 바뀌는 첫 달은 25.10처럼 해를 붙인다. */
  function tickText(pts, i) {
    const ym = pointYm(pts[i]);
    if (!ym || ym.indexOf('-') < 0) return mon(ym);
    const y = ym.slice(0, 4);
    const m = mon(ym);
    const prev = i > 0 ? pointYm(pts[i - 1]).slice(0, 4) : '';
    if (i === 0 || (prev && y !== prev)) return y.slice(2) + '.' + m;
    return m;
  }

  function halo(x, y, fill, text, fs, series) {
    const ds = series ? ' data-series="' + series + '"' : '';
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="middle" fill="' + fill + '" font-size="' + fs + '" font-weight="700" stroke="#0e141b" stroke-width="4" paint-order="stroke" style="paint-order:stroke fill"' + ds + '>' + text + '</text>';
  }
  function label(x, y, text, fs, fill, anchor, role, weight) {
    const ds = role ? ' data-role="' + role + '"' : '';
    const fw = weight ? ' font-weight="' + weight + '"' : '';
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="' + (anchor || 'middle') + '" fill="' + (fill || '#9aa8ba') + '" font-size="' + fs + '"' + fw + ds + '>' + text + '</text>';
  }
  /* 숫자 너비. 겹침을 피하려고 실제 글자보다 조금 넓게 잡는다. */
  function estimateWidth(text, fs) {
    const s = String(text);
    let w = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c > 255) w += fs * 0.95;
      else if (c === 45 || c === 43 || c === 46 || c === 44) w += fs * 0.42;
      else w += fs * 0.64;
    }
    return w + fs * 0.42;
  }
  function labelBox(it) {
    const fs = it.fs || 14;
    const w = estimateWidth(it.text, fs);
    const left = it.anchor === 'end' ? it.x - w : it.anchor === 'start' ? it.x : it.x - w / 2;
    return { left: left, top: it.y - fs * 0.82, right: left + w, bottom: it.y + fs * 0.26 };
  }
  function overlapDepth(a, b) {
    const A = labelBox(a), B = labelBox(b);
    const h = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
    const w = Math.min(A.right, B.right) - Math.max(A.left, B.left);
    if (h <= 1 || w <= 1) return 0;
    return h;
  }
  function separateLabels(items, minY, maxY) {
    function allowed(it, y) {
      if (it.mode === 'pin') return false;
      if (y < minY - 0.1 || y > maxY + 0.1) return false;
      if (it.mode === 'up' && it.anchorMax != null && y > it.anchorMax + 0.1) return false;
      if (it.mode === 'down' && it.anchorMin != null && y < it.anchorMin - 0.1) return false;
      return true;
    }
    for (let pass = 0; pass < 64; pass++) {
      let pair = null;
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          if (items[i].mode === 'pin' && items[j].mode === 'pin') continue;
          const d = overlapDepth(items[i], items[j]);
          if (d > 0 && (!pair || d > pair.d)) pair = { i: i, j: j, d: d };
        }
      }
      if (!pair) return true;
      const a = items[pair.i], b = items[pair.j];
      let upper = a.y <= b.y ? a : b;
      let lower = upper === a ? b : a;
      if (Math.abs(a.y - b.y) < 0.5) {
        upper = a.x <= b.x ? a : b;
        lower = upper === a ? b : a;
      }
      const push = pair.d + 3;
      const canUp = allowed(upper, upper.y - push);
      const canDown = allowed(lower, lower.y + push);
      if (canUp && canDown) {
        upper.y -= push * 0.55;
        lower.y += push * 0.55;
      } else if (canUp) upper.y -= push;
      else if (canDown) lower.y += push;
      else return false;
    }
    return false;
  }
  /* 0과 음수 눈금이 붙지 않게 아래 범위를 벌린다. 눈금 글자는 그 눈금 높이에 둔다. */
  function ensureAxisGap(top, bot, plotH, minPx) {
    if (!(bot < 0) || !(top > 0) || !(plotH > minPx + 4)) return bot;
    const gap = plotH * (-bot) / (top - bot);
    if (gap >= minPx) return bot;
    return minPx * top / (minPx - plotH);
  }
  function paintItem(it) {
    if (it.kind === 'halo') return halo(it.x, it.y, it.fill, it.text, it.fs, it.series);
    return label(it.x, it.y, it.text, it.fs, it.fill, it.anchor, it.role, it.weight);
  }
  function cloneItem(it) { return Object.assign({}, it); }
  function anyOverlap(items) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (overlapDepth(items[i], items[j]) > 0) return true;
      }
    }
    return false;
  }
  /* 요약 화면은 칸이 좁으면 우선순위가 낮은 숫자부터 뺀다. 눈금은 남긴다. */
  function pruneLabels(items, minY, maxY) {
    let cur = items.map(cloneItem);
    for (let guard = 0; guard < 120; guard++) {
      const moved = cur.map(cloneItem);
      separateLabels(moved, minY, maxY);
      let pair = null;
      for (let i = 0; i < moved.length; i++) {
        for (let j = i + 1; j < moved.length; j++) {
          const d = overlapDepth(moved[i], moved[j]);
          if (d > 0 && (!pair || d > pair.d)) pair = { i: i, j: j, d: d };
        }
      }
      if (!pair) return moved;
      const a = cur[pair.i], b = cur[pair.j];
      let dropIdx = -1;
      if (a.droppable && !b.droppable) dropIdx = pair.i;
      else if (b.droppable && !a.droppable) dropIdx = pair.j;
      else if (a.droppable && b.droppable) {
        const pa = a.priority || 0, pb = b.priority || 0;
        if (pa !== pb) dropIdx = pa < pb ? pair.i : pair.j;
        else dropIdx = a.x <= b.x ? pair.i : pair.j;
      } else return moved;
      cur.splice(dropIdx, 1);
    }
    return cur.map(cloneItem);
  }
  function placeLabels(build, prefer, floor, minY, maxY, drop) {
    let separated = null;
    for (let fs = prefer; fs >= floor; fs -= 1) {
      const trial = build(fs).map(cloneItem);
      if (separateLabels(trial, minY(fs), maxY(fs))) {
        if (!anyOverlap(trial)) return trial;
        separated = trial;
      }
    }
    if (!drop) return separated || build(floor).map(cloneItem);
    return pruneLabels(build(floor).map(cloneItem), minY(floor), maxY(floor));
  }
  function wrap(w, h, body, name, scroll) {
    const size = scroll
      ? 'viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '"'
      : 'viewBox="0 0 ' + w + ' ' + h + '" width="100%" preserveAspectRatio="xMidYMid meet"';
    return '<svg ' + size + ' role="img" aria-label="' + name + '" ' + FONT + '>' + body + '</svg>';
  }
  function frame(nPoints, summary, tall) {
    const count = Math.max(nPoints, 1);
    const H = summary ? (tall ? 460 : 440) : 330;
    const padL = summary ? 74 : 54;
    const padR = summary ? 16 : 16;
    const padT = summary ? 64 : 40;
    const padB = summary ? 52 : 44;
    const slot = summary ? 0 : 76;
    const W = summary ? 640 : padL + count * slot + padR;
    const plotW = summary ? (W - padL - padR) : count * slot;
    const slotW = summary ? plotW / count : slot;
    return { W: W, H: H, padL: padL, padR: padR, padT: padT, padB: padB, plotH: H - padT - padB, slotW: slotW, summary: summary };
  }

  function monthsLine(points, opts) {
    const summary = !!(opts && opts.summary);
    const pts = points || [];
    const f = frame(pts.length, summary, true);
    if (!summary) {
      f.padR = 48;
      f.W = f.padL + Math.max(pts.length, 1) * f.slotW + f.padR;
    }
    /* 점 아래 숫자와 월 글자가 겹치지 않게 아래 여백을 더한다. */
    f.H += summary ? 28 : 16;
    f.padB += summary ? 28 : 16;
    const vals = [];
    pts.forEach(function (p) { vals.push(n(p.income), n(p.expense)); });
    const minV = vals.length ? Math.min(0, Math.min.apply(null, vals)) : 0;
    const maxV = vals.length ? Math.max(1, Math.max.apply(null, vals)) : 1;
    const top = Math.max(maxV * 1.18, 1000000);
    let bot = minV < 0 ? minV * 1.25 : 0;
    bot = ensureAxisGap(top, bot, f.plotH, summary ? 26 : 20);
    const span = (top - bot) || 1;
    const yAt = function (v) { return f.padT + f.plotH * (1 - (v - bot) / span); };
    const xAt = function (i) { return f.padL + f.slotW * i + f.slotW / 2; };
    const y0 = yAt(0);
    const ticks = bot < 0 ? [bot, 0, top] : [0, top / 2, top];
    let s = '';
    const pins = [];
    ticks.forEach(function (v) {
      const y = yAt(v);
      const grid = Math.abs(v) < 1 || v === 0;
      s += '<line x1="' + f.padL + '" x2="' + (f.W - f.padR) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + (grid && bot < 0 ? '#3a4660' : '#2c3a4d') + '" stroke-width="' + (Math.abs(v) < 1 ? 1.4 : 1) + '"/>';
      const tfs = summary ? 18 : 13;
      pins.push({ x: f.padL - 8, y: y + 4, text: man(v), fs: tfs, fill: '#9aa8ba', anchor: 'end', mode: 'pin', role: 'tick' });
      if (!summary) pins.push({ x: f.W - 6, y: y + 4, text: man(v), fs: 13, fill: '#9aa8ba', anchor: 'end', mode: 'pin', role: 'tick' });
    });
    if (bot < 0) {
      s += '<line x1="' + f.padL + '" x2="' + (f.W - f.padR) + '" y1="' + y0.toFixed(1) + '" y2="' + y0.toFixed(1) + '" stroke="#3a4660" stroke-width="1.4" stroke-dasharray="4 3"/>';
    }
    function poly(key, color) {
      const d = pts.map(function (p, i) { return xAt(i).toFixed(1) + ',' + yAt(n(p[key])).toFixed(1); }).join(' ');
      const sw = summary ? 3.6 : 2.6;
      let marks = '<polyline points="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '" stroke-linejoin="round" stroke-linecap="round"/>';
      pts.forEach(function (p, i) {
        const y = yAt(n(p[key]));
        marks += '<circle cx="' + xAt(i).toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (summary ? 5.5 : 4) + '" fill="' + color + '" stroke="#0e141b" stroke-width="1.4"/>';
      });
      return marks;
    }
    s += poly('income', 'var(--inc)');
    s += poly('expense', 'var(--exp)');
    const monthFs = summary ? 15 : 14;
    pts.forEach(function (p, i) {
      pins.push({
        x: xAt(i), y: f.H - 16, text: tickText(pts, i), fs: monthFs, fill: '#9aa8ba', anchor: 'middle', mode: 'pin',
        droppable: summary, priority: 5000 + i
      });
    });
    const labels = placeLabels(function (fs) {
      const items = pins.map(function (p) { return Object.assign({}, p); });
      pts.forEach(function (p, i) {
        const yI = yAt(n(p.income));
        const yE = yAt(n(p.expense));
        const gap = Math.max(12, fs * 0.85);
        items.push({
          x: xAt(i), y: yI - gap, text: man(p.income), fs: fs, fill: 'var(--inc)', anchor: 'middle',
          mode: 'up', anchorMax: yI - 8, kind: 'halo', series: 'income',
          droppable: summary, priority: i * 2 + 1
        });
        items.push({
          x: xAt(i), y: yE + gap + 2, text: man(p.expense), fs: fs, fill: 'var(--exp)', anchor: 'middle',
          mode: 'down', anchorMin: yE + 10, kind: 'halo', series: 'expense',
          droppable: summary, priority: i * 2
        });
      });
      return items;
    }, summary ? 16 : 14, summary ? 13 : 12, function (fs) { return fs; }, function () { return f.H - 4; }, summary);
    labels.forEach(function (it) { s += paintItem(it); });
    pts.forEach(function (p, i) {
      const x = f.padL + i * f.slotW;
      s += '<rect class="months-hit" data-ym="' + p.ym + '" x="' + x.toFixed(1) + '" y="' + f.padT + '" width="' + f.slotW.toFixed(1) + '" height="' + f.plotH + '" fill="transparent"/>';
    });
    return { svg: wrap(f.W, f.H, s, '월별 수입·지출', !summary), scrollLeft: 99999 };
  }

  function cashBars(points, opts) {
    const summary = !!(opts && opts.summary);
    const pts = points || [];
    const f = frame(pts.length, summary, true);
    if (!summary) {
      f.padR = 48;
      f.W = f.padL + Math.max(pts.length, 1) * f.slotW + f.padR;
    }
    const vals = pts.map(function (p) { return n(p.flow); });
    const maxAbs = Math.max(1, Math.max.apply(null, vals.map(function (v) { return Math.abs(v); }).concat([1])));
    const axis = Math.max(maxAbs * 1.18, 1000000);
    const yAt = function (v) { return f.padT + f.plotH * (1 - (v + axis) / (axis * 2)); };
    const y0 = yAt(0);
    const xAt = function (i) { return f.padL + f.slotW * (i + 0.5); };
    const barW = Math.max(summary ? 22 : 18, Math.min(summary ? 48 : 28, f.slotW * 0.62));
    let s = '<line x1="' + f.padL + '" x2="' + (f.W - f.padR) + '" y1="' + y0.toFixed(1) + '" y2="' + y0.toFixed(1) + '" stroke="#3a4660" stroke-width="1.5" stroke-dasharray="4 3"/>';
    const pins = [];
    function pinTick(x, v, fs) {
      pins.push({ x: x, y: yAt(v) + 5, text: v === 0 ? '0' : man(v), fs: fs, fill: '#9aa8ba', anchor: 'end', mode: 'pin', role: 'tick' });
    }
    const tickFs = summary ? 16 : 13;
    pinTick(f.padL - 8, axis, tickFs);
    pinTick(f.padL - 8, 0, tickFs);
    pinTick(f.padL - 8, -axis, tickFs);
    if (!summary) {
      pinTick(f.W - 6, axis, 13);
      pinTick(f.W - 6, 0, 13);
      pinTick(f.W - 6, -axis, 13);
    }
    const sel = opts && opts.selectedYm;
    const bars = [];
    pts.forEach(function (p, i) {
      const v = n(p.flow);
      const y = yAt(v);
      const top = Math.min(y, y0);
      const h = Math.max(3, Math.abs(y0 - y));
      const fill = v > 0 ? 'var(--inc)' : (v < 0 ? 'var(--exp)' : '#9aa8ba');
      const cx = xAt(i);
      const selected = sel && p.ym === sel;
      bars.push({ v: v, top: top, h: h, fill: fill, cx: cx, i: i, selected: selected, ym: p.ym });
      s += '<rect x="' + (cx - barW / 2).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="5" fill="' + fill + '"' + (selected ? ' stroke="#f2f6fb" stroke-width="2"' : '') + '/>';
      pins.push({
        x: cx, y: f.H - 16, text: tickText(pts, i), fs: summary ? 15 : 14,
        fill: selected ? '#f2f6fb' : '#9aa8ba', anchor: 'middle', mode: 'pin',
        droppable: summary, priority: 5000 + i
      });
    });
    const labels = placeLabels(function (fs) {
      const items = pins.map(function (p) { return Object.assign({}, p); });
      bars.forEach(function (b) {
        const above = b.v >= 0;
        const gap = Math.max(12, fs * 0.85);
        items.push({
          x: b.cx,
          y: above ? b.top - gap : b.top + b.h + gap,
          text: man(b.v),
          fs: fs,
          fill: b.fill,
          anchor: 'middle',
          mode: above ? 'up' : 'down',
          anchorMax: above ? b.top - 8 : null,
          anchorMin: above ? null : b.top + b.h + 8,
          kind: 'halo',
          series: 'flow',
          droppable: summary,
          priority: b.i + 1
        });
      });
      return items;
    }, summary ? 16 : 14, summary ? 12 : 12, function (fs) { return fs; }, function () { return f.H - 4; }, summary);
    labels.forEach(function (it) { s += paintItem(it); });
    bars.forEach(function (b) {
      s += '<rect class="suji-hit" data-ym="' + b.ym + '" x="' + (f.padL + b.i * f.slotW).toFixed(1) + '" y="' + f.padT + '" width="' + f.slotW.toFixed(1) + '" height="' + f.plotH + '" fill="transparent"/>';
    });
    return { svg: wrap(f.W, f.H, s, '월별 현금흐름', !summary), scrollLeft: 99999 };
  }

  function salesBars(points, opts) {
    const summary = !!(opts && opts.summary);
    const pts = points || [];
    const f = frame(pts.length, summary, true);
    const maxV = 15000000;
    const yAt = function (v) { return f.padT + f.plotH * (1 - Math.min(Math.max(v, 0), maxV) / maxV); };
    const y0 = yAt(0);
    const goals = [{ v: 10000000, label: '1,000만', color: 'var(--warn)' }, { v: 15000000, label: '1,500만', color: 'var(--inc)' }];
    const goalFs = summary ? 13 : 12;
    f.padR = Math.max(f.padR, Math.ceil(estimateWidth('1,500만', goalFs)) + 8);
    if (summary) f.slotW = (f.W - f.padL - f.padR) / Math.max(pts.length, 1);
    else f.W = f.padL + Math.max(pts.length, 1) * f.slotW + f.padR;
    const xAt = function (i) { return f.padL + f.slotW * i + f.slotW / 2; };
    const barW = Math.max(summary ? 18 : 16, Math.min(summary ? 40 : 28, f.slotW * 0.55));
    let s = '';
    const pins = [];
    [0, 7500000, 15000000].forEach(function (v, idx) {
      const y = yAt(v);
      if (idx === 1) s += '<line x1="' + f.padL + '" x2="' + (f.W - f.padR) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="#2c3a4d"/>';
      pins.push({ x: f.padL - 8, y: y + 4, text: man(v), fs: summary ? 16 : 13, fill: '#9aa8ba', anchor: 'end', mode: 'pin', role: 'tick' });
    });
    goals.forEach(function (g) {
      const y = yAt(g.v);
      s += '<line x1="' + f.padL + '" x2="' + (f.W - f.padR) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + g.color + '" stroke-width="1.5" stroke-dasharray="5 4"/>';
      pins.push({ x: f.W - 4, y: Math.max(goalFs, y - 4), text: g.label, fs: goalFs, fill: g.color, anchor: 'end', mode: 'pin' });
    });
    pts.forEach(function (p, i) {
      const cx = xAt(i);
      if (p.value == null) {
        pins.push({
          x: cx, y: f.H - 16, text: tickText(pts, i), fs: summary ? 15 : 14, fill: '#5c6b80', anchor: 'middle', mode: 'pin',
          droppable: summary, priority: 5000 + i
        });
        return;
      }
      const v = n(p.value);
      const y = yAt(v);
      const h = Math.max(v === 0 ? 3 : 4, y0 - y);
      const fill = p.unpaid ? 'var(--exp)' : (p.over ? 'var(--inc)' : (p.cur ? 'var(--fee)' : '#6aa8ff'));
      s += '<rect class="sales-bar" data-fee-ym="' + p.ym + '" x="' + (cx - barW / 2).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="5" fill="' + fill + '"/>';
      pins.push({
        x: cx, y: f.H - 16, text: tickText(pts, i), fs: summary ? 15 : 14, fill: p.cur ? '#f2f6fb' : '#9aa8ba', anchor: 'middle', mode: 'pin',
        droppable: summary, priority: 5000 + i
      });
    });
    const labels = placeLabels(function (fs) {
      const items = pins.map(function (p) { return Object.assign({}, p); });
      pts.forEach(function (p, i) {
        if (p.value == null) return;
        const y = yAt(n(p.value));
        items.push({
          x: xAt(i), y: y - Math.max(12, fs * 0.8), text: man(p.value), fs: fs, fill: '#f2f6fb',
          anchor: 'middle', mode: 'up', anchorMax: y - 8, kind: 'halo', series: 'sales',
          droppable: summary, priority: i + 1
        });
      });
      return items;
    }, summary ? 16 : 14, summary ? 12 : 12, function (fs) { return fs; }, function () { return f.H - 30; }, summary);
    labels.forEach(function (it) { s += paintItem(it); });
    return { svg: wrap(f.W, f.H, s, '월별 교습비', !summary), scrollLeft: 99999 };
  }

  function enrollBars(points, opts) {
    const summary = !!(opts && opts.summary);
    const pts = points || [];
    const f = frame(pts.length, summary, true);
    if (!summary) {
      f.padR = 42;
      f.W = f.padL + Math.max(pts.length, 1) * f.slotW + f.padR;
    }
    /* 큰 막대는 그달 재원(정원), 안쪽 작은 막대는 신규·퇴소. 퇴소 수는 2026-10-01 합의 규칙(ledger.flowSeries). */
    const maxEn = Math.max(1, Math.max.apply(null, pts.map(function (p) {
      return Math.max(n(p.enrolled), n(p.entered), n(p.withdrawn));
    }).concat([1])));
    const top = maxEn * 1.28;
    const yAt = function (v) { return f.padT + f.plotH * (1 - Math.min(Math.max(v, 0), top) / top); };
    const xAt = function (i) { return f.padL + f.slotW * i + f.slotW / 2; };
    const y0 = yAt(0);
    const bigW = Math.max(summary ? 22 : 24, Math.min(summary ? 56 : 46, f.slotW * 0.8));
    const gap = 3;
    const smallW = (bigW - gap * 3) / 2;
    const axisFs = summary ? 16 : 13;
    let s = '<line x1="' + f.padL + '" x2="' + (f.W - f.padR) + '" y1="' + y0.toFixed(1) + '" y2="' + y0.toFixed(1) + '" stroke="#2c3a4d"/>';
    s += '<line x1="' + f.padL + '" x2="' + (f.W - f.padR) + '" y1="' + yAt(top / 2).toFixed(1) + '" y2="' + yAt(top / 2).toFixed(1) + '" stroke="#1f2a38"/>';
    [0, top / 2, top].forEach(function (v) {
      s += label(f.padL - 8, yAt(v) + 5, String(Math.round(v)), axisFs, '#9aa8ba', 'end');
      if (!summary) s += label(f.W - 6, yAt(v) + 5, String(Math.round(v)), 13, '#9aa8ba', 'end');
    });
    const numFs = summary ? (pts.length > 9 ? 14 : 16) : 13;
    const subFs = summary ? (pts.length > 9 ? 11 : 13) : 11;
    pts.forEach(function (p, i) {
      const cx = xAt(i);
      const en = n(p.enrolled), ne = n(p.entered), wd = n(p.withdrawn);
      const ye = yAt(en);
      s += '<rect x="' + (cx - bigW / 2).toFixed(1) + '" y="' + ye.toFixed(1) + '" width="' + bigW.toFixed(1) + '" height="' + Math.max(2, y0 - ye).toFixed(1) + '" rx="4" fill="var(--fee)" opacity="0.45"/>';
      s += halo(cx, ye - 8, 'var(--fee)', String(en), numFs, 'enrolled');
      [[ne, 'var(--inc)', -1, 'entered'], [wd, 'var(--exp)', 1, 'withdrawn']].forEach(function (b) {
        const x = b[2] < 0 ? cx - bigW / 2 + gap : cx + gap / 2;
        const y = yAt(b[0]);
        if (b[0]) s += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + smallW.toFixed(1) + '" height="' + Math.max(2, y0 - y).toFixed(1) + '" rx="2" fill="' + b[1] + '"/>';
        s += halo(x + smallW / 2, Math.min(y0 - 4, y - 4), b[1], String(b[0]), subFs, b[3]);
      });
      s += label(cx, f.H - (summary ? 16 : 14), tickText(pts, i), summary ? 14 : 13, '#9aa8ba');
      s += '<rect class="stu-flow-hit" data-ym="' + p.ym + '" x="' + (f.padL + i * f.slotW).toFixed(1) + '" y="' + f.padT + '" width="' + f.slotW.toFixed(1) + '" height="' + f.plotH + '" fill="transparent"/>';
    });
    return { svg: wrap(f.W, f.H, s, '재원 막대 안에 신규·퇴소 막대', !summary), scrollLeft: 99999 };
  }

  function expenseStack(model) {
    if (!model || !model.points || !model.points.length) return null;
    const pts = model.points;
    const cats = model.cats || [];
    const summary = true;
    const f = frame(pts.length, summary, true);
    const totals = pts.map(function (p) { return n(p.total); });
    const pos = pts.map(function (p) {
      return cats.reduce(function (s, c) { return s + Math.max(0, n(p.cats[c])); }, 0);
    });
    const maxV = Math.max(1, Math.max.apply(null, pos.concat(totals.map(function (v) { return Math.max(0, v); }))));
    const minV = Math.min(0, Math.min.apply(null, totals));
    const top = Math.max(maxV * 1.22, 1000000);
    const bot = ensureAxisGap(top, minV < 0 ? minV * 1.3 : 0, f.plotH, 26);
    const span = (top - bot) || 1;
    const yAt = function (v) { return f.padT + f.plotH * (1 - (v - bot) / span); };
    const y0 = yAt(0);
    const barW = Math.max(22, Math.min(46, f.slotW * 0.62));
    let s = '';
    s += '<line x1="' + f.padL + '" x2="' + (f.W - f.padR) + '" y1="' + y0.toFixed(1) + '" y2="' + y0.toFixed(1) + '" stroke="#3a4660"/>';
    const pins = [];
    const bits = [];
    pins.push({ x: f.padL - 8, y: yAt(top) + 5, text: man(top), fs: 16, fill: '#9aa8ba', anchor: 'end', mode: 'pin', role: 'tick' });
    pins.push({ x: f.padL - 8, y: y0 + 5, text: '0', fs: 16, fill: '#9aa8ba', anchor: 'end', mode: 'pin', role: 'tick' });
    if (bot < 0) pins.push({ x: f.padL - 8, y: yAt(bot) + 5, text: man(bot), fs: 16, fill: '#9aa8ba', anchor: 'end', mode: 'pin', role: 'tick' });
    pts.forEach(function (p, i) {
      const cx = f.padL + f.slotW * (i + 0.5);
      const x = cx - barW / 2;
      if (n(p.total) < 0) {
        const y = yAt(n(p.total));
        const h = Math.max(3, Math.abs(y0 - y));
        const topY = Math.min(y, y0);
        s += '<rect x="' + x.toFixed(1) + '" y="' + topY.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="4" fill="var(--exp)"/>';
        bits.push({
          x: cx, y: topY + h + 16, text: man(p.total), fill: 'var(--exp)', anchor: 'middle',
          mode: 'down', anchorMin: topY + h + 8, kind: 'halo', series: 'total', droppable: true, priority: i + 1
        });
      } else {
        let acc = 0;
        cats.forEach(function (c, ci) {
          const v = Math.max(0, n(p.cats[c]));
          if (!v) return;
          const y1 = yAt(acc);
          const y2 = yAt(acc + v);
          s += '<rect x="' + x.toFixed(1) + '" y="' + y2.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + Math.max(1, y1 - y2).toFixed(1) + '" fill="' + expColor(c, ci) + '" stroke="#1a2330" stroke-width="1"/>';
          if (y1 - y2 >= 26) {
            bits.push({
              x: cx, y: (y1 + y2) / 2 + 5, text: man(v), fs: 13, fill: '#0e141b', anchor: 'middle',
              mode: 'pin', droppable: true, priority: i
            });
          }
          acc += v;
        });
        const yTop = yAt(Math.max(0, n(p.total)));
        bits.push({
          x: cx, y: yTop - 14, text: man(p.total), fill: '#f2f6fb', anchor: 'middle',
          mode: 'up', anchorMax: yTop - 8, kind: 'halo', series: 'total', droppable: true, priority: (i + 1) * 10
        });
      }
      pins.push({
        x: cx, y: f.H - 16, text: tickText(pts, i), fs: 15, fill: '#9aa8ba', anchor: 'middle', mode: 'pin',
        droppable: true, priority: 5000 + i
      });
      s += '<rect class="nx-exp-hit" data-ym="' + p.ym + '" x="' + (f.padL + i * f.slotW).toFixed(1) + '" y="' + f.padT + '" width="' + f.slotW.toFixed(1) + '" height="' + f.plotH + '" fill="transparent"/>';
    });
    placeLabels(function (fs) {
      const items = pins.map(function (p) { return Object.assign({}, p); });
      bits.forEach(function (b) {
        const it = Object.assign({}, b);
        if (it.kind === 'halo') it.fs = fs;
        items.push(it);
      });
      return items;
    }, 16, 12, function (fs) { return fs; }, function () { return f.H - 4; }, true).forEach(function (it) { s += paintItem(it); });
    return { svg: wrap(f.W, f.H, s, '지출 항목 추이', false) };
  }

  function collectionBars(points) {
    const pts = points || [];
    if (!pts.length) return null;
    const f = frame(pts.length, true, true);
    const maxV = Math.max(1, Math.max.apply(null, pts.map(function (p) { return n(p.paid) + n(p.unpaid); })));
    const top = Math.max(maxV * 1.22, 1000000);
    const yAt = function (v) { return f.padT + f.plotH * (1 - v / top); };
    const y0 = yAt(0);
    const barW = Math.max(22, Math.min(46, f.slotW * 0.62));
    let s = '<line x1="' + f.padL + '" x2="' + (f.W - f.padR) + '" y1="' + yAt(top / 2).toFixed(1) + '" y2="' + yAt(top / 2).toFixed(1) + '" stroke="#2c3a4d"/>';
    const pins = [];
    pins.push({ x: f.padL - 8, y: y0 + 5, text: '0', fs: 16, fill: '#9aa8ba', anchor: 'end', mode: 'pin', role: 'tick' });
    pins.push({ x: f.padL - 8, y: yAt(top / 2) + 5, text: man(top / 2), fs: 16, fill: '#9aa8ba', anchor: 'end', mode: 'pin', role: 'tick' });
    pins.push({ x: f.padL - 8, y: yAt(top) + 5, text: man(top), fs: 16, fill: '#9aa8ba', anchor: 'end', mode: 'pin', role: 'tick' });
    const rates = [];
    pts.forEach(function (p, i) {
      const cx = f.padL + f.slotW * (i + 0.5);
      const x = cx - barW / 2;
      const op = p.cur ? 0.55 : 1;
      const yp = yAt(n(p.paid));
      const yu = yAt(n(p.paid) + n(p.unpaid));
      if (n(p.paid)) s += '<rect x="' + x.toFixed(1) + '" y="' + yp.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + Math.max(2, y0 - yp).toFixed(1) + '" rx="4" fill="var(--fee)" opacity="' + op + '"/>';
      if (n(p.unpaid)) s += '<rect x="' + x.toFixed(1) + '" y="' + yu.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + Math.max(2, (n(p.paid) ? yp : y0) - yu).toFixed(1) + '" rx="4" fill="var(--warn)" opacity="' + op + '"/>';
      const yLab = (n(p.unpaid) || n(p.paid) ? yu : y0);
      const rateColor = p.rate >= 95 ? 'var(--inc)' : (p.rate >= 85 ? '#f2f6fb' : 'var(--warn)');
      rates.push({ x: cx, y: yLab, text: p.rate + '%', fill: rateColor, i: i });
      pins.push({
        x: cx, y: f.H - 16, text: tickText(pts, i), fs: 15, fill: p.cur ? '#f2f6fb' : '#9aa8ba', anchor: 'middle', mode: 'pin',
        droppable: true, priority: 5000 + i
      });
      s += '<rect class="nx-col-hit" data-ym="' + p.ym + '" x="' + (f.padL + i * f.slotW).toFixed(1) + '" y="' + f.padT + '" width="' + f.slotW.toFixed(1) + '" height="' + f.plotH + '" fill="transparent"/>';
    });
    placeLabels(function (fs) {
      const items = pins.map(function (p) { return Object.assign({}, p); });
      rates.forEach(function (r) {
        const gap = Math.max(12, fs * 0.8);
        items.push({
          x: r.x, y: r.y - gap, text: r.text, fs: fs, fill: r.fill, anchor: 'middle',
          mode: 'up', anchorMax: r.y - 8, kind: 'halo', series: 'rate', droppable: true, priority: r.i + 1
        });
      });
      return items;
    }, 16, 12, function (fs) { return fs; }, function () { return f.H - 4; }, true).forEach(function (it) { s += paintItem(it); });
    return { svg: wrap(f.W, f.H, s, '교습비 수납률', false) };
  }

  function arpuChart(points) {
    const pts = points || [];
    if (!pts.length) return null;
    const f = frame(pts.length, true, false);
    const avgs = pts.filter(function (p) { return n(p.count); }).map(function (p) { return n(p.avg); });
    const maxV = Math.max(1, avgs.length ? Math.max.apply(null, avgs) : 1);
    const top = Math.max(Math.ceil(maxV * 1.28 / 20000) * 20000, 100000);
    const yAt = function (v) { return f.padT + f.plotH * (1 - v / top); };
    const xAt = function (i) { return f.padL + f.slotW * (i + 0.5); };
    const maxC = Math.max(1, Math.max.apply(null, pts.map(function (p) { return n(p.count); })));
    const barW = Math.max(18, Math.min(40, f.slotW * 0.46));
    let s = '<line x1="' + f.padL + '" x2="' + (f.W - f.padR) + '" y1="' + yAt(top / 2).toFixed(1) + '" y2="' + yAt(top / 2).toFixed(1) + '" stroke="#2c3a4d"/>';
    const pins = [];
    pins.push({ x: f.padL - 8, y: yAt(0) + 5, text: '0', fs: 16, fill: '#9aa8ba', anchor: 'end', mode: 'pin', role: 'tick' });
    pins.push({ x: f.padL - 8, y: yAt(top / 2) + 5, text: man(top / 2), fs: 16, fill: '#9aa8ba', anchor: 'end', mode: 'pin', role: 'tick' });
    pins.push({ x: f.padL - 8, y: yAt(top) + 5, text: man(top), fs: 16, fill: '#9aa8ba', anchor: 'end', mode: 'pin', role: 'tick' });
    const heads = [];
    pts.forEach(function (p, i) {
      if (!n(p.count)) return;
      const h = f.plotH * 0.42 * (n(p.count) / maxC);
      const y = yAt(0) - h;
      s += '<rect x="' + (xAt(i) - barW / 2).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + Math.max(2, h).toFixed(1) + '" rx="4" fill="var(--fee)" opacity="0.22"/>';
      heads.push({ x: xAt(i), y: y, text: n(p.count) + '명', i: i });
    });
    function poly(indices) {
      if (!indices.length) return;
      const line = indices.map(function (i) { return xAt(i).toFixed(1) + ',' + yAt(n(pts[i].avg)).toFixed(1); }).join(' ');
      s += '<polyline points="' + line + '" fill="none" stroke="#0e141b" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>';
      s += '<polyline points="' + line + '" fill="none" stroke="#8ec5ff" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/>';
    }
    let seg = [];
    pts.forEach(function (p, i) {
      if (!n(p.count)) {
        poly(seg);
        seg = [];
        return;
      }
      seg.push(i);
    });
    poly(seg);
    pts.forEach(function (p, i) {
      if (!n(p.count)) return;
      s += '<circle cx="' + xAt(i).toFixed(1) + '" cy="' + yAt(n(p.avg)).toFixed(1) + '" r="5.5" fill="#8ec5ff" stroke="#0e141b" stroke-width="1.5"/>';
    });
    pts.forEach(function (p, i) {
      pins.push({
        x: xAt(i), y: f.H - 16, text: tickText(pts, i), fs: 15,
        fill: n(p.count) ? '#9aa8ba' : '#5c6b80', anchor: 'middle', mode: 'pin',
        droppable: true, priority: 5000 + i
      });
    });
    placeLabels(function (fs) {
      const items = pins.map(function (p) { return Object.assign({}, p); });
      heads.forEach(function (h) {
        items.push({
          x: h.x, y: h.y - 10, text: h.text, fs: 13, fill: '#9aa8ba', anchor: 'middle',
          mode: 'up', anchorMax: h.y - 6, droppable: true, priority: h.i
        });
      });
      pts.forEach(function (p, i) {
        if (!n(p.count)) return;
        const y = yAt(n(p.avg));
        const gap = Math.max(12, fs * 0.8);
        items.push({
          x: xAt(i), y: y - gap, text: (n(p.avg) / 10000).toFixed(1), fs: fs, fill: '#f2f6fb', anchor: 'middle',
          mode: 'up', anchorMax: y - 8, kind: 'halo', series: 'avg', droppable: true, priority: (i + 1) * 10
        });
      });
      return items;
    }, 16, 12, function (fs) { return fs; }, function () { return f.H - 4; }, true).forEach(function (it) { s += paintItem(it); });
    return { svg: wrap(f.W, f.H, s, '1인당 평균 교습비', false) };
  }

  function cumChart(points, curYm) {
    const all = points || [];
    const pts = all.slice(-12);
    if (!pts.length) return null;
    const f = frame(pts.length, true, true);
    const vals = [];
    pts.forEach(function (p) { vals.push(n(p.cum), n(p.flow)); });
    const hi = Math.max(0, Math.max.apply(null, vals));
    const lo = Math.min(0, Math.min.apply(null, vals));
    const span0 = Math.max(hi - lo, 1000000);
    const top = hi + span0 * 0.18;
    const bot = lo - span0 * 0.12;
    const yAt = function (v) { return f.padT + f.plotH * (top - v) / (top - bot); };
    const y0 = yAt(0);
    const xAt = function (i) { return f.padL + f.slotW * (i + 0.5); };
    const barW = Math.max(14, Math.min(28, f.slotW * 0.34));
    let s = '<line x1="' + f.padL + '" x2="' + (f.W - f.padR) + '" y1="' + y0.toFixed(1) + '" y2="' + y0.toFixed(1) + '" stroke="#3a4660" stroke-width="1.5" stroke-dasharray="4 3"/>';
    const pins = [];
    pins.push({ x: f.padL - 8, y: y0 + 5, text: '0', fs: 16, fill: '#9aa8ba', anchor: 'end', mode: 'pin', role: 'tick' });
    pts.forEach(function (p, i) {
      const y = yAt(n(p.flow));
      const t = Math.min(y, y0);
      const h = Math.max(2, Math.abs(y0 - y));
      s += '<rect x="' + (xAt(i) - barW / 2).toFixed(1) + '" y="' + t.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="4" fill="' + (n(p.flow) >= 0 ? 'var(--inc)' : 'var(--exp)') + '" opacity="0.28"/>';
    });
    const line = pts.map(function (p, i) { return xAt(i).toFixed(1) + ',' + yAt(n(p.cum)).toFixed(1); }).join(' ');
    s += '<polyline points="' + line + '" fill="none" stroke="#0e141b" stroke-width="7" stroke-linejoin="round"/>';
    s += '<polyline points="' + line + '" fill="none" stroke="#f2f6fb" stroke-width="3.2" stroke-linejoin="round"/>';
    const cums = [];
    pts.forEach(function (p, i) {
      const col = n(p.cum) >= 0 ? 'var(--inc)' : 'var(--exp)';
      const y = yAt(n(p.cum));
      s += '<circle cx="' + xAt(i).toFixed(1) + '" cy="' + y.toFixed(1) + '" r="6" fill="' + col + '" stroke="#0e141b" stroke-width="1.5"/>';
      const below = n(p.cum) < n(p.flow);
      cums.push({ x: xAt(i), y: y, below: below, text: man(p.cum), fill: col, i: i });
      pins.push({
        x: xAt(i), y: f.H - 16, text: tickText(pts, i), fs: 14,
        fill: p.ym === curYm ? '#f2f6fb' : '#9aa8ba', anchor: 'middle', mode: 'pin',
        droppable: true, priority: 5000 + i
      });
      s += '<rect class="nx-cum-hit" data-ym="' + p.ym + '" x="' + (f.padL + i * f.slotW).toFixed(1) + '" y="' + f.padT + '" width="' + f.slotW.toFixed(1) + '" height="' + f.plotH + '" fill="transparent"/>';
    });
    placeLabels(function (fs) {
      const items = pins.map(function (p) { return Object.assign({}, p); });
      cums.forEach(function (c) {
        const gap = Math.max(12, fs * 0.85);
        items.push({
          x: c.x,
          y: c.below ? c.y + gap : c.y - gap,
          text: c.text,
          fs: fs,
          fill: c.fill,
          anchor: 'middle',
          mode: c.below ? 'down' : 'up',
          anchorMax: c.below ? null : c.y - 8,
          anchorMin: c.below ? c.y + 8 : null,
          kind: 'halo',
          series: 'cum',
          droppable: true,
          priority: c.i + 1
        });
      });
      return items;
    }, 15, 12, function (fs) { return fs; }, function () { return f.H - 4; }, true).forEach(function (it) { s += paintItem(it); });
    return { svg: wrap(f.W, f.H, s, '누적 현금흐름', false), shown: pts };
  }

  function yearBars(years) {
    const pts = years || [];
    if (!pts.length) return null;
    const f = frame(pts.length, true, true);
    const vals = [];
    pts.forEach(function (y) { vals.push(n(y.income), n(y.expense), n(y.net)); });
    const minV = Math.min(0, Math.min.apply(null, vals));
    const maxV = Math.max(1, Math.max.apply(null, vals));
    const top = Math.max(maxV * 1.22, 1000000);
    let bot = minV < 0 ? minV * 1.28 : 0;
    if (minV < 0) {
      f.H += 20;
      f.padB += 20;
    }
    bot = ensureAxisGap(top, bot, f.plotH, 28);
    const span = (top - bot) || 1;
    const yAt = function (v) { return f.padT + f.plotH * (1 - (v - bot) / span); };
    const y0 = yAt(0);
    const series = [
      { key: 'income', color: 'var(--inc)' },
      { key: 'expense', color: 'var(--exp)' },
      { key: 'net', color: 'var(--net)' }
    ];
    const barW = Math.max(16, Math.min(44, (f.slotW - 28) / 3));
    const gap = 10;
    let s = '<line x1="' + f.padL + '" x2="' + (f.W - f.padR) + '" y1="' + y0.toFixed(1) + '" y2="' + y0.toFixed(1) + '" stroke="#3a4660" stroke-width="1.4"/>';
    const pins = [];
    const tickFs = 16;
    function pinTick(v) {
      pins.push({ x: f.padL - 8, y: yAt(v) + 4, text: v === 0 ? '0' : man(v), fs: tickFs, fill: '#9aa8ba', anchor: 'end', mode: 'pin', role: 'tick' });
    }
    pinTick(top);
    pinTick(0);
    if (bot < 0) pinTick(bot);
    pts.forEach(function (p, i) {
      const cx = f.padL + f.slotW * (i + 0.5);
      const totalW = series.length * barW + (series.length - 1) * gap;
      series.forEach(function (ser, si) {
        const v = n(p[ser.key]);
        const x = cx - totalW / 2 + si * (barW + gap);
        const y = yAt(v);
        const topY = Math.min(y, y0);
        const h = Math.max(2, Math.abs(y0 - y));
        s += '<rect x="' + x.toFixed(1) + '" y="' + topY.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="5" fill="' + ser.color + '"/>';
      });
      pins.push({
        x: cx, y: f.H - 16, text: String(p.year || '').slice(2) + '년', fs: 16, fill: '#f2f6fb', anchor: 'middle', mode: 'pin',
        droppable: true, priority: 5000 + i
      });
    });
    const labels = placeLabels(function (fs) {
      const items = pins.map(function (p) { return Object.assign({}, p); });
      pts.forEach(function (p, i) {
        const cx = f.padL + f.slotW * (i + 0.5);
        const totalW = series.length * barW + (series.length - 1) * gap;
        series.forEach(function (ser, si) {
          const v = n(p[ser.key]);
          const x = cx - totalW / 2 + si * (barW + gap) + barW / 2;
          const y = yAt(v);
          const topY = Math.min(y, y0);
          const botY = Math.max(y, y0);
          const above = v >= 0;
          const gapY = Math.max(12, fs * 0.85);
          items.push({
            x: x,
            y: above ? topY - gapY : botY + gapY,
            text: man(v),
            fs: fs,
            fill: ser.color,
            anchor: 'middle',
            mode: above ? 'up' : 'down',
            anchorMax: above ? topY - 8 : null,
            anchorMin: above ? null : botY + 8,
            kind: 'halo',
            series: ser.key,
            droppable: true,
            priority: (i + 1) * 10 + si
          });
        });
      });
      return items;
    }, 16, 12, function (fs) { return fs; }, function () { return f.H - 36; }, true);
    labels.forEach(function (it) { s += paintItem(it); });
    return { svg: wrap(f.W, f.H, s, '연도별 수입 지출 순이익', false) };
  }

  function gradeLines(yms, series) {
    if (!yms || !yms.length) return '';
    const W = 640, H = 280, L = 64, R = 16, T = 28, B = 40;
    const vals = [];
    (series || []).forEach(function (s) { (s.values || []).forEach(function (v) { vals.push(n(v)); }); });
    const max = Math.max(1, Math.max.apply(null, vals.concat([1])));
    const iw = W - L - R, ih = H - T - B;
    const x = function (i) { return L + (yms.length === 1 ? iw / 2 : i * iw / (yms.length - 1)); };
    const y = function (v) { return T + ih - (v / max) * ih; };
    let s = '';
    const pins = [];
    [0, 0.5, 1].forEach(function (t) {
      const yy = T + ih - t * ih;
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="#2c3a4d"/>';
      pins.push({ x: L - 8, y: yy + 4, text: man(max * t), fs: 15, fill: '#9aa8ba', anchor: 'end', mode: 'pin', role: 'tick' });
    });
    yms.forEach(function (ym, i) {
      pins.push({
        x: x(i), y: H - 14, text: tickText(yms, i), fs: 14, fill: '#9aa8ba', anchor: 'middle', mode: 'pin',
        droppable: true, priority: 5000 + i
      });
    });
    placeLabels(function () { return pins.map(function (p) { return Object.assign({}, p); }); }, 14, 14, function () { return 12; }, function () { return H - 2; }, true).forEach(function (it) { s += paintItem(it); });
    (series || []).forEach(function (ser) {
      const pts = (ser.values || []).map(function (v, i) { return x(i).toFixed(1) + ',' + y(n(v)).toFixed(1); }).join(' ');
      s += '<polyline points="' + pts + '" fill="none" stroke="' + ser.color + '" stroke-width="3" stroke-linejoin="round"/>';
      (ser.values || []).forEach(function (v, i) {
        s += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(n(v)).toFixed(1) + '" r="4" fill="' + ser.color + '"/>';
      });
    });
    return wrap(W, H, s, '학년별 교습비', false);
  }

  function donutSVG(parts, colors) {
    const size = 156, cx = 78, cy = 78, R = 54, sw = 22;
    const list = parts || [];
    const total = list.reduce(function (s, p) { return s + (Number(p.abs) || 0); }, 0);
    if (!total || !list.length) {
      return '<svg class="donut-svg" viewBox="0 0 ' + size + ' ' + size + '"><circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="none" stroke="#2c3a4d" stroke-width="' + sw + '"/><text x="' + cx + '" y="' + (cy + 5) + '" text-anchor="middle" fill="#9aa8ba" font-size="15">없음</text></svg>';
    }
    const cols = colors && colors.length ? colors : DONUT_COLORS;
    if (list.length === 1) {
      return '<svg class="donut-svg" viewBox="0 0 ' + size + ' ' + size + '" role="img"><circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="none" stroke="' + cols[0] + '" stroke-width="' + sw + '"/></svg>';
    }
    const C = 2 * Math.PI * R;
    let off = 0;
    const arcs = list.map(function (p, i) {
      const len = (Number(p.abs) || 0) / total * C;
      const piece = '<circle r="' + R + '" cx="' + cx + '" cy="' + cy + '" fill="none" stroke="' + cols[i % cols.length] + '" stroke-width="' + sw + '" stroke-dasharray="' + len + ' ' + (C - len) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>';
      off += len;
      return piece;
    }).join('');
    return '<svg class="donut-svg" viewBox="0 0 ' + size + ' ' + size + '" role="img">' + arcs + '</svg>';
  }

  root.Charts = {
    DONUT_COLORS: DONUT_COLORS,
    expColor: expColor,
    monthsLine: monthsLine,
    cashBars: cashBars,
    salesBars: salesBars,
    enrollBars: enrollBars,
    yearBars: yearBars,
    expenseStack: expenseStack,
    collectionBars: collectionBars,
    arpuChart: arpuChart,
    cumChart: cumChart,
    gradeLines: gradeLines,
    donutSVG: donutSVG,
    man: man
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
