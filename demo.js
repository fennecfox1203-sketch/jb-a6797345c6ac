/* 가짜 장부. 이름·금액은 모두 만든 것이다. 네트워크를 쓰지 않는다. */
(function (root) {
  'use strict';

  const GAP = '2026-07';

  const STUDENTS = [
    { name: '학생01', g1: '초등', g2: 4, tuition: 320000, status: '재학', school: '가나다초', address: '엄궁동', from: '2025-10' },
    { name: '학생02', g1: '초등', g2: 5, tuition: 330000, status: '재학', school: '가나다초', address: '학장동', from: '2025-10' },
    { name: '학생03', g1: '중등', g2: 1, tuition: 360000, status: '재학', school: '라마바중', address: '엄궁동', from: '2025-10' },
    { name: '학생04', g1: '중등', g2: 2, tuition: 380000, status: '재학', school: '라마바중', address: '학장동', from: '2025-10', skip: ['2026-09'] },
    { name: '학생05', g1: '고등', g2: 1, tuition: 420000, status: '재학', school: '사아자고', address: '엄궁동', from: '2025-10' },
    { name: '학생06', g1: '고등', g2: 2, tuition: 450000, status: '재학', school: '사아자고', address: '학장동', from: '2025-12' },
    { name: '학생07', g1: '초등', g2: 2, tuition: 300000, status: '재학', school: '가나다초', address: '하단동', from: '2026-03' },
    { name: '학생08', g1: '중등', g2: 3, tuition: 400000, status: '퇴소', school: '라마바중', address: '엄궁동', from: '2025-10', until: '2026-05' },
    { name: '학생09', g1: '고등', g2: 1, tuition: 410000, status: '퇴소', school: '사아자고', address: '학장동', from: '2026-01', until: '2026-04', allow: ['2026-01', '2026-03', '2026-04'] },
    { name: '학생10', g1: '초등', g2: 3, tuition: 310000, status: '재학', school: '가나다초', address: '엄궁동', from: '2025-10', skip: ['2026-06'] },
    { name: '학생11', g1: '중등', g2: 1, tuition: 370000, status: '재학', school: '라마바중', address: '하단동', from: '2025-10' },
    { name: '학생12', g1: '초등', g2: 6, tuition: 340000, status: '재학', school: '가나다초', address: '학장동', from: '2025-10' },
    { name: '학생13', g1: '고등', g2: 3, tuition: 450000, status: '재학', school: '사아자고', address: '하단동', from: '2026-04', skip: ['2026-09'] },
    { name: '학생14', g1: '성인', g2: null, tuition: 200000, status: '휴원', school: '일반', address: '하단동', from: '2025-10', until: '2026-08' }
  ];

  function shouldBill(st, ym) {
    if (st.from && ym < st.from) return false;
    if (st.until && ym > st.until) return false;
    if (st.allow && st.allow.indexOf(ym) < 0) return false;
    if (st.skip && st.skip.indexOf(ym) >= 0) return false;
    if (ym === GAP) return false;
    return true;
  }

  function payMeta(st, billYm) {
    if (!shouldBill(st, billYm)) return null;
    if (st.name === '학생05' && billYm === '2026-09') {
      return { day: '2026-10-03', bankYm: '2026-10', billYm: billYm, split: false };
    }
    return {
      day: billYm + '-05',
      bankYm: billYm,
      billYm: billYm,
      split: st.name === '학생01' && billYm === '2026-10'
    };
  }

  function blank() { return Array(30).fill(''); }

  function ymRange(a, b) {
    const out = [];
    let y = Number(a.slice(0, 4));
    let m = Number(a.slice(5));
    const ty = Number(b.slice(0, 4));
    const tm = Number(b.slice(5));
    while (y < ty || (y === ty && m <= tm)) {
      out.push(String(y) + '-' + String(m).padStart(2, '0'));
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return out;
  }

  function expensesFor(ym) {
    if (ym === '2026-04') {
      return [
        { cat2: '인건비', cat3: '급여', amt: 1000000, memo: '급여' },
        { cat2: '보증금', cat3: '환급', amt: -4000000, memo: '보증금 환급' }
      ];
    }
    if (ym === '2026-10') {
      return [
        { cat2: '인건비', cat3: '급여', amt: 1800000, memo: '급여' }
      ];
    }
    const m = Number(ym.slice(5));
    return [
      { cat2: '인건비', cat3: '급여', amt: 1800000, memo: '급여' },
      { cat2: '임대료', cat3: '월세', amt: 700000, memo: '월세' },
      { cat2: '운영비', cat3: '소모품', amt: 120000 + m * 10000, memo: '소모품' },
      { cat2: '공과금', cat3: '전기', amt: 90000, memo: '전기요금' }
    ];
  }

  function gradeLabel(st) {
    if (st.g1 === '성인') return '성인';
    return st.g1 + (st.g2 != null ? ' ' + st.g2 : '');
  }

  function buildDemoSource() {
    const months = ymRange('2025-10', '2026-10');
    const bank = [];
    const head = blank();
    head[16] = '대상자';
    bank.push(head);

    months.forEach(function (ym) {
      expensesFor(ym).forEach(function (ex, i) {
        const r = blank();
        r[0] = ym + '-02';
        r[5] = ex.memo;
        r[8] = ym;
        r[9] = '지출';
        r[10] = ex.cat2;
        r[11] = ex.cat3;
        r[12] = String(ex.amt);
        bank.push(r);
        void i;
      });
    });

    months.forEach(function (billYm) {
      STUDENTS.forEach(function (st) {
        const meta = payMeta(st, billYm);
        if (!meta) return;
        const r = blank();
        r[0] = meta.day;
        r[5] = st.name + ' 교습비';
        r[8] = meta.bankYm;
        r[9] = '수입';
        r[10] = '교습비';
        r[11] = '교습비';
        r[12] = String(st.tuition);
        r[16] = st.name;
        r[17] = gradeLabel(st);
        if (meta.split) {
          r[19] = String(Number(billYm.slice(5))) + '월';
          r[20] = billYm.slice(0, 4);
        } else {
          r[19] = billYm + '-01';
        }
        bank.push(r);
      });
    });

    const extra1 = blank();
    extra1[0] = '2026-09-18';
    extra1[5] = '보강비';
    extra1[8] = '2026-09';
    extra1[9] = '수입';
    extra1[10] = '기타';
    extra1[11] = '교습비';
    extra1[12] = '150000';
    bank.push(extra1);

    const extra2 = blank();
    extra2[0] = '2026-09-20';
    extra2[5] = '후원';
    extra2[8] = '2026-09';
    extra2[9] = '수입';
    extra2[10] = '후원';
    extra2[11] = '후원';
    extra2[12] = '200000';
    bank.push(extra2);

    const roster = [];
    const rh = blank();
    rh[1] = '이름';
    rh[2] = '학교';
    rh[3] = '주소';
    rh[4] = '학년';
    rh[5] = '학년수';
    rh[7] = '상태';
    rh[8] = '교습비';
    roster.push(rh);
    STUDENTS.forEach(function (st, i) {
      const r = blank();
      r[0] = String(i + 1);
      r[1] = st.name;
      r[2] = st.school;
      r[3] = st.address;
      r[4] = st.g1;
      r[5] = st.g2 == null ? '' : String(st.g2);
      r[7] = st.status;
      r[8] = String(st.tuition);
      roster.push(r);
    });

    const rest = [
      ['이름', '월'],
      ['학생10', '2026년 6월']
    ];

    return { bank: bank, roster: roster, rest: rest };
  }

  root.DEMO_STUDENTS = STUDENTS;
  root.DEMO_GAP = GAP;
  root.demoShouldBill = shouldBill;
  root.demoPayMeta = payMeta;
  root.buildDemoSource = buildDemoSource;
})(typeof globalThis !== 'undefined' ? globalThis : this);
