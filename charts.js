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

  function halo(x, y, fill, text, fs) {
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="middle" fill="' + fill + '" font-size="' + fs + '" font-weight="700" stroke="#0e141b" stroke-width="5" paint-order="stroke" style="paint-order:stroke fill">' + text + '</text>';
  }
  function label(x, y, text, fs, fill, anchor) {
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="' + (anchor || 'middle') + '" fill="' + (fill || '#9aa8ba') + '" font-size="' + fs + '">' + text + '</text>';
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
    const vals = [];
    pts.forEach(function (p) { vals.push(n(p.income), n(p.expense)); });
    const minV = vals.length ? Math.min(0, Math.min.apply(null, vals)) : 0;
    const maxV = vals.length ? Math.max(1, Math.max.apply(null, vals)) : 1;
    const top = Math.max(maxV * 1.18, 1000000);
    const bot = minV < 0 ? minV * 1.25 : 0;
    const span = (top - bot) || 1;
    const yAt = function (v) { return f.padT + f.plotH * (1 - (v - bot) / span); };
    const xAt = function (i) { return f.padL + f.slotW * i + f.slotW / 2; };
    const y0 = yAt(0);
    const ticks = bot < 0 ? [bot, 0, top] : [0, top / 2, top];
    let s = '';
    ticks.forEach(function (v) {
      const y = yAt(v);
      const grid = Math.abs(v) < 1 || v === 0;
      s += '<line x1="' + f.padL + '" x2="' + (f.W - f.padR) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + (grid && bot < 0 ? '#3a4660' : '#2c3a4d') + '" stroke-width="' + (Math.abs(v) < 1 ? 1.4 : 1) + '"/>';
      s += label(f.padL - 8, y + 5, man(v), summary ? 20 : 13, '#9aa8ba', 'end');
    });
    if (bot < 0) {
      s += '<line x1="' + f.padL + '" x2="' + (f.W - f.padR) + '" y1="' + y0.toFixed(1) + '" y2="' + y0.toFixed(1) + '" stroke="#3a4660" stroke-width="1.4" stroke-dasharray="4 3"/>';
    }
    function poly(key, color) {
      const d = pts.map(function (p, i) { return xAt(i).toFixed(1) + ',' + yAt(n(p[key])).toFixed(1); }).join(' ');
      let marks = '';
      pts.forEach(function (p, i) {
        const y = yAt(n(p[key]));
        const other = yAt(n(p[key === 'income' ? 'expense' : 'income']));
        let ly = n(p[key]) >= n(p[key === 'income' ? 'expense' : 'income']) ? y - 18 : y + 24;
        if (Math.abs(y - other) < (summary ? 40 : 26)) {
          ly = n(p[key]) >= n(p[key === 'income' ? 'expense' : 'income']) ? y - 30 : y + 32;
        }
        ly = Math.max(18, Math.min(f.H - 18, ly));
        const fs = summary ? 22 : 14;
        marks += '<circle cx="' + xAt(i).toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (summary ? 5.5 : 4) + '" fill="' + color + '" stroke="#0e141b" stroke-width="1.4"/>';
        marks += halo(xAt(i), ly, color, man(p[key]), fs);
        if (key === 'expense') marks += label(xAt(i), f.H - 16, mon(p.ym), summary ? 22 : 14, '#9aa8ba');
      });
      const sw = summary ? 3.6 : 2.6;
      return '<polyline points="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '" stroke-linejoin="round" stroke-linecap="round"/>' + marks;
    }
    s += poly('income', 'var(--inc)');
    s += poly('expense', 'var(--exp)');
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
    const vals = pts.map(function (p) { return n(p.flow); });
    const maxAbs = Math.max(1, Math.max.apply(null, vals.map(function (v) { return Math.abs(v); }).concat([1])));
    const axis = Math.max(maxAbs * 1.18, 1000000);
    const yAt = function (v) { return f.padT + f.plotH * (1 - (v + axis) / (axis * 2)); };
    const y0 = yAt(0);
    const xAt = function (i) { return f.padL + f.slotW * (i + 0.5); };
    const barW = Math.max(summary ? 22 : 18, Math.min(summary ? 48 : 28, f.slotW * 0.62));
    let s = '<line x1="' + f.padL + '" x2="' + (f.W - f.padR) + '" y1="' + y0.toFixed(1) + '" y2="' + y0.toFixed(1) + '" stroke="#3a4660" stroke-width="1.5" stroke-dasharray="4 3"/>';
    s += label(f.padL - 8, yAt(axis) + 5, man(axis), summary ? 20 : 13, '#9aa8ba', 'end');
    s += label(f.padL - 8, y0 + 5, '0', summary ? 20 : 13, '#9aa8ba', 'end');
    s += label(f.padL - 8, yAt(-axis) + 5, man(-axis), summary ? 20 : 13, '#9aa8ba', 'end');
    const sel = opts && opts.selectedYm;
    pts.forEach(function (p, i) {
      const v = n(p.flow);
      const y = yAt(v);
      const top = Math.min(y, y0);
      const h = Math.max(3, Math.abs(y0 - y));
      const fill = v > 0 ? 'var(--inc)' : (v < 0 ? 'var(--exp)' : '#9aa8ba');
      const cx = xAt(i);
      const selected = sel && p.ym === sel;
      s += '<rect x="' + (cx - barW / 2).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="5" fill="' + fill + '"' + (selected ? ' stroke="#f2f6fb" stroke-width="2"' : '') + '/>';
      const valY = v >= 0 ? top - 12 : top + h + 22;
      s += halo(cx, valY, fill, man(v), summary ? 22 : 14);
      s += label(cx, f.H - 16, mon(p.ym), summary ? 22 : 14, selected ? '#f2f6fb' : '#9aa8ba');
      s += '<rect class="suji-hit" data-ym="' + p.ym + '" x="' + (f.padL + i * f.slotW).toFixed(1) + '" y="' + f.padT + '" width="' + f.slotW.toFixed(1) + '" height="' + f.plotH + '" fill="transparent"/>';
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
    const xAt = function (i) { return f.padL + f.slotW * i + f.slotW / 2; };
    const barW = Math.max(summary ? 22 : 18, Math.min(summary ? 48 : 28, f.slotW * 0.62));
    const goals = [{ v: 10000000, label: '1차 1000만', color: 'var(--warn)' }, { v: 15000000, label: '최종 1500만', color: 'var(--inc)' }];
    let s = '';
    [0, 7500000, 15000000].forEach(function (v, idx) {
      const y = yAt(v);
      if (idx === 1) s += '<line x1="' + f.padL + '" x2="' + (f.W - f.padR) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="#2c3a4d"/>';
      s += label(f.padL - 8, y + 5, man(v), summary ? 20 : 13, '#9aa8ba', 'end');
    });
    goals.forEach(function (g) {
      const y = yAt(g.v);
      s += '<line x1="' + f.padL + '" x2="' + (f.W - f.padR) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + g.color + '" stroke-width="1.5" stroke-dasharray="5 4"/>';
      s += label(f.W - f.padR, y - 8, g.label, summary ? 16 : 12, g.color, 'end');
    });
    pts.forEach(function (p, i) {
      const cx = xAt(i);
      if (p.value == null) {
        s += label(cx, f.H - 16, mon(p.ym), summary ? 22 : 14, '#5c6b80');
        return;
      }
      const v = n(p.value);
      const y = yAt(v);
      const h = Math.max(v === 0 ? 3 : 4, y0 - y);
      const fill = p.unpaid ? 'var(--exp)' : (p.over ? 'var(--inc)' : (p.cur ? 'var(--fee)' : '#6aa8ff'));
      s += '<rect class="sales-bar" data-fee-ym="' + p.ym + '" x="' + (cx - barW / 2).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="5" fill="' + fill + '"/>';
      s += halo(cx, y - 12, '#f2f6fb', man(v), summary ? 22 : 14);
      s += label(cx, f.H - 16, mon(p.ym), summary ? 22 : 14, p.cur ? '#f2f6fb' : '#9aa8ba');
    });
    return { svg: wrap(f.W, f.H, s, '월별 교습비', !summary), scrollLeft: 99999 };
  }

  function enrollBars(points, opts) {
    const summary = !!(opts && opts.summary);
    const pts = points || [];
    const f = frame(pts.length, summary, true);
    const maxEn = Math.max(1, Math.max.apply(null, pts.map(function (p) { return n(p.enrolled); }).concat([1])));
    const maxFlow = Math.max(1, Math.max.apply(null, pts.map(function (p) { return Math.max(n(p.left), n(p.entered)); }).concat([1])));
    const axis = Math.max(maxEn, maxFlow) * 1.28;
    const yAt = function (v) { return f.padT + f.plotH * (1 - Math.min(v, axis) / axis); };
    const y0 = yAt(0);
    const xAt = function (i) { return f.padL + f.slotW * i + f.slotW / 2; };
    const pairW = Math.max(summary ? 26 : 22, Math.min(summary ? 52 : 32, f.slotW * 0.78));
    let s = '<line x1="' + f.padL + '" x2="' + (f.W - f.padR) + '" y1="' + yAt(axis / 2).toFixed(1) + '" y2="' + yAt(axis / 2).toFixed(1) + '" stroke="#2c3a4d"/>';
    s += label(f.padL - 8, yAt(0) + 5, '0', summary ? 20 : 13, '#9aa8ba', 'end');
    s += label(f.padL - 8, yAt(axis / 2) + 5, String(Math.round(axis / 2)), summary ? 20 : 13, '#9aa8ba', 'end');
    s += label(f.padL - 8, yAt(axis) + 5, String(Math.round(axis)), summary ? 20 : 13, '#9aa8ba', 'end');
    pts.forEach(function (p, i) {
      const cx = xAt(i);
      const ye = yAt(n(p.enrolled));
      const he = Math.max(3, y0 - ye);
      s += '<rect class="stu-flow-hit" data-ym="' + p.ym + '" x="' + (cx - pairW / 2).toFixed(1) + '" y="' + ye.toFixed(1) + '" width="' + pairW.toFixed(1) + '" height="' + he.toFixed(1) + '" rx="5" fill="var(--fee)" opacity="0.55"/>';
      s += halo(cx, ye - 12, 'var(--fee)', String(n(p.enrolled)), summary ? 22 : 14);
      const gap = 3;
      const bw = (pairW - gap) / 2;
      if (n(p.entered)) {
        const y = yAt(n(p.entered));
        const h = Math.max(3, y0 - y);
        const x = cx - pairW / 2;
        s += '<rect class="stu-flow-hit" data-ym="' + p.ym + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3" fill="var(--inc)"/>';
        s += halo(x + bw / 2, y - 8, 'var(--inc)', String(n(p.entered)), summary ? 16 : 12);
      }
      if (n(p.left)) {
        const y = yAt(n(p.left));
        const h = Math.max(3, y0 - y);
        const x = cx - pairW / 2 + bw + gap;
        s += '<rect class="stu-flow-hit" data-ym="' + p.ym + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3" fill="var(--exp)"/>';
        s += halo(x + bw / 2, y - 8, 'var(--exp)', String(n(p.left)), summary ? 16 : 12);
      }
      s += label(cx, f.H - 16, mon(p.ym), summary ? 22 : 14, '#9aa8ba');
      s += '<rect class="stu-flow-hit" data-ym="' + p.ym + '" x="' + (f.padL + i * f.slotW).toFixed(1) + '" y="' + f.padT + '" width="' + f.slotW.toFixed(1) + '" height="' + f.plotH + '" fill="transparent"/>';
    });
    return { svg: wrap(f.W, f.H, s, '재원·신규·퇴소', !summary), scrollLeft: 99999 };
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
    const bot = minV < 0 ? minV * 1.3 : 0;
    const span = (top - bot) || 1;
    const yAt = function (v) { return f.padT + f.plotH * (1 - (v - bot) / span); };
    const y0 = yAt(0);
    const barW = Math.max(22, Math.min(46, f.slotW * 0.62));
    let s = '';
    s += '<line x1="' + f.padL + '" x2="' + (f.W - f.padR) + '" y1="' + y0.toFixed(1) + '" y2="' + y0.toFixed(1) + '" stroke="#3a4660"/>';
    s += label(f.padL - 8, yAt(top) + 5, man(top), 20, '#9aa8ba', 'end');
    s += label(f.padL - 8, y0 + 5, '0', 20, '#9aa8ba', 'end');
    if (bot < 0) s += label(f.padL - 8, yAt(bot) + 5, man(bot), 20, '#9aa8ba', 'end');
    pts.forEach(function (p, i) {
      const cx = f.padL + f.slotW * (i + 0.5);
      const x = cx - barW / 2;
      if (n(p.total) < 0) {
        const y = yAt(n(p.total));
        const h = Math.max(3, Math.abs(y0 - y));
        const topY = Math.min(y, y0);
        s += '<rect x="' + x.toFixed(1) + '" y="' + topY.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="4" fill="var(--exp)"/>';
      } else {
        let acc = 0;
        cats.forEach(function (c, ci) {
          const v = Math.max(0, n(p.cats[c]));
          if (!v) return;
          const y1 = yAt(acc);
          const y2 = yAt(acc + v);
          s += '<rect x="' + x.toFixed(1) + '" y="' + y2.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + Math.max(1, y1 - y2).toFixed(1) + '" fill="' + expColor(c, ci) + '" stroke="#1a2330" stroke-width="1"/>';
          if (y1 - y2 >= 26) s += label(cx, (y1 + y2) / 2 + 5, man(v), 14, '#0e141b');
          acc += v;
        });
      }
      const yLabel = n(p.total) >= 0 ? yAt(Math.max(0, n(p.total))) - 12 : yAt(n(p.total)) + 20;
      s += halo(cx, yLabel, n(p.total) >= 0 ? '#f2f6fb' : 'var(--exp)', man(p.total), 20);
      s += label(cx, f.H - 16, mon(p.ym), 22, '#9aa8ba');
      s += '<rect class="nx-exp-hit" data-ym="' + p.ym + '" x="' + (f.padL + i * f.slotW).toFixed(1) + '" y="' + f.padT + '" width="' + f.slotW.toFixed(1) + '" height="' + f.plotH + '" fill="transparent"/>';
    });
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
    s += label(f.padL - 8, y0 + 5, '0', 20, '#9aa8ba', 'end');
    s += label(f.padL - 8, yAt(top / 2) + 5, man(top / 2), 20, '#9aa8ba', 'end');
    s += label(f.padL - 8, yAt(top) + 5, man(top), 20, '#9aa8ba', 'end');
    pts.forEach(function (p, i) {
      const cx = f.padL + f.slotW * (i + 0.5);
      const x = cx - barW / 2;
      const op = p.cur ? 0.55 : 1;
      const yp = yAt(n(p.paid));
      const yu = yAt(n(p.paid) + n(p.unpaid));
      if (n(p.paid)) s += '<rect x="' + x.toFixed(1) + '" y="' + yp.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + Math.max(2, y0 - yp).toFixed(1) + '" rx="4" fill="var(--fee)" opacity="' + op + '"/>';
      if (n(p.unpaid)) s += '<rect x="' + x.toFixed(1) + '" y="' + yu.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + Math.max(2, (n(p.paid) ? yp : y0) - yu).toFixed(1) + '" rx="4" fill="var(--warn)" opacity="' + op + '"/>';
      const rateColor = p.rate >= 95 ? 'var(--inc)' : (p.rate >= 85 ? '#f2f6fb' : 'var(--warn)');
      s += halo(cx, (n(p.unpaid) || n(p.paid) ? yu : y0) - 14, rateColor, p.rate + '%', 20);
      s += label(cx, f.H - 16, mon(p.ym), 20, p.cur ? '#f2f6fb' : '#9aa8ba');
      s += '<rect class="nx-col-hit" data-ym="' + p.ym + '" x="' + (f.padL + i * f.slotW).toFixed(1) + '" y="' + f.padT + '" width="' + f.slotW.toFixed(1) + '" height="' + f.plotH + '" fill="transparent"/>';
    });
    return { svg: wrap(f.W, f.H, s, '교습비 수납률', false) };
  }

  function arpuChart(points) {
    const pts = points || [];
    if (!pts.length) return null;
    const f = frame(pts.length, true, false);
    const maxV = Math.max(1, Math.max.apply(null, pts.map(function (p) { return n(p.avg); })));
    const top = Math.max(Math.ceil(maxV * 1.28 / 20000) * 20000, 100000);
    const yAt = function (v) { return f.padT + f.plotH * (1 - v / top); };
    const xAt = function (i) { return f.padL + f.slotW * (i + 0.5); };
    const maxC = Math.max(1, Math.max.apply(null, pts.map(function (p) { return n(p.count); })));
    const barW = Math.max(18, Math.min(40, f.slotW * 0.46));
    let s = '<line x1="' + f.padL + '" x2="' + (f.W - f.padR) + '" y1="' + yAt(top / 2).toFixed(1) + '" y2="' + yAt(top / 2).toFixed(1) + '" stroke="#2c3a4d"/>';
    s += label(f.padL - 8, yAt(0) + 5, '0', 20, '#9aa8ba', 'end');
    s += label(f.padL - 8, yAt(top / 2) + 5, man(top / 2), 20, '#9aa8ba', 'end');
    s += label(f.padL - 8, yAt(top) + 5, man(top), 20, '#9aa8ba', 'end');
    pts.forEach(function (p, i) {
      const h = f.plotH * 0.42 * (n(p.count) / maxC);
      const y = yAt(0) - h;
      s += '<rect x="' + (xAt(i) - barW / 2).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + Math.max(2, h).toFixed(1) + '" rx="4" fill="var(--fee)" opacity="0.22"/>';
      s += label(xAt(i), yAt(0) - 8, n(p.count) + '명', 14, '#9aa8ba');
    });
    const line = pts.map(function (p, i) { return xAt(i).toFixed(1) + ',' + yAt(n(p.avg)).toFixed(1); }).join(' ');
    s += '<polyline points="' + line + '" fill="none" stroke="#0e141b" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>';
    s += '<polyline points="' + line + '" fill="none" stroke="#8ec5ff" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/>';
    pts.forEach(function (p, i) {
      s += '<circle cx="' + xAt(i).toFixed(1) + '" cy="' + yAt(n(p.avg)).toFixed(1) + '" r="5.5" fill="#8ec5ff" stroke="#0e141b" stroke-width="1.5"/>';
      s += halo(xAt(i), yAt(n(p.avg)) - 16, '#f2f6fb', (n(p.avg) / 10000).toFixed(1), 20);
      s += label(xAt(i), f.H - 16, mon(p.ym), 22, '#9aa8ba');
    });
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
    s += label(f.padL - 8, y0 + 5, '0', 20, '#9aa8ba', 'end');
    pts.forEach(function (p, i) {
      const y = yAt(n(p.flow));
      const t = Math.min(y, y0);
      const h = Math.max(2, Math.abs(y0 - y));
      s += '<rect x="' + (xAt(i) - barW / 2).toFixed(1) + '" y="' + t.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="4" fill="' + (n(p.flow) >= 0 ? 'var(--inc)' : 'var(--exp)') + '" opacity="0.28"/>';
    });
    const line = pts.map(function (p, i) { return xAt(i).toFixed(1) + ',' + yAt(n(p.cum)).toFixed(1); }).join(' ');
    s += '<polyline points="' + line + '" fill="none" stroke="#0e141b" stroke-width="7" stroke-linejoin="round"/>';
    s += '<polyline points="' + line + '" fill="none" stroke="#f2f6fb" stroke-width="3.2" stroke-linejoin="round"/>';
    pts.forEach(function (p, i) {
      const col = n(p.cum) >= 0 ? 'var(--inc)' : 'var(--exp)';
      s += '<circle cx="' + xAt(i).toFixed(1) + '" cy="' + yAt(n(p.cum)).toFixed(1) + '" r="6" fill="' + col + '" stroke="#0e141b" stroke-width="1.5"/>';
      const below = n(p.cum) < n(p.flow);
      s += halo(xAt(i), yAt(n(p.cum)) + (below ? 24 : -14), col, man(p.cum), 20);
      s += label(xAt(i), f.H - 16, mon(p.ym), 20, p.ym === curYm ? '#f2f6fb' : '#9aa8ba');
      s += '<rect class="nx-cum-hit" data-ym="' + p.ym + '" x="' + (f.padL + i * f.slotW).toFixed(1) + '" y="' + f.padT + '" width="' + f.slotW.toFixed(1) + '" height="' + f.plotH + '" fill="transparent"/>';
    });
    return { svg: wrap(f.W, f.H, s, '누적 현금흐름', false), shown: pts };
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
    [0, 0.5, 1].forEach(function (t) {
      const yy = T + ih - t * ih;
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="#2c3a4d"/>';
      s += label(L - 8, yy + 4, man(max * t), 16, '#9aa8ba', 'end');
    });
    yms.forEach(function (ym, i) { s += label(x(i), H - 14, mon(ym), 18, '#9aa8ba'); });
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
    expenseStack: expenseStack,
    collectionBars: collectionBars,
    arpuChart: arpuChart,
    cumChart: cumChart,
    gradeLines: gradeLines,
    donutSVG: donutSVG,
    man: man
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
