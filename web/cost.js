/* 딜 데스크 - 비용표 (금리 제안용 All-in Cost)
 * 팀이 쓰던 '○○ 비용표.xlsb' 와 같은 계산:
 *   만기일 = EDATE(실행일, 개월)   대출일수 = 만기일 - 실행일
 *   수수료 연 비용율 = 금액 ÷ 총 대출금액 ÷ 대출일수 × 365   (연간 비용은 금액 ÷ 총 대출금액)
 *   All-in = 금액 가중 대출금리 + 수수료 연 비용율 합
 * 기록: kind 'cost' { dealId, name, start, months, loans:[{name, amount(억), rate(%), note}], fees:[{group, item, mode, value, vat, note}], note } */
'use strict';

const FEE_ITEMS = ['금융주선수수료', '취급수수료', '금융자문수수료', '대리금융기관수수료', '법무법인수수료', '신탁수수료', '감정평가수수료', '사업성평가수수료', '신용평가수수료', '자산관리수수료', '인지대', '기타 부대비용'];
const isoD = d => localDate(d);
function edate(start, months) {
  const d = new Date(start + 'T00:00:00'); if (isNaN(d)) return null;
  const day = d.getDate(); const t = new Date(d.getFullYear(), d.getMonth() + num(months), 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(day, last)); return t;
}
function calcCost(c) {
  const loans = (c.loans || []).map(l => ({ ...l, won: num(l.amount) * 1e8, r: num(l.rate) }));
  const total = loans.reduce((a, l) => a + l.won, 0);
  const endD = edate(c.start, c.months);
  const days = endD ? Math.round((endD - new Date(c.start + 'T00:00:00')) / 864e5) : Math.round(num(c.months) * 365 / 12);
  const wRate = total ? loans.reduce((a, l) => a + l.won * l.r, 0) / total : 0;
  const fees = (c.fees || []).map(f => {
    const base = f.mode === 'pct' ? num(f.value) / 100 * total : num(f.value);
    const amt = f.vat === '별도' ? base * 1.1 : base;
    const rate = !total ? 0 : f.group === '연간비용' ? amt / total * 100 : (days ? amt / total / days * 365 * 100 : 0);
    return { ...f, amt, rate };
  });
  const feeAmt = fees.reduce((a, f) => a + f.amt, 0), feeRate = fees.reduce((a, f) => a + f.rate, 0);
  return { loans, total, end: endD ? isoD(endD) : '', days, wRate, fees, feeAmt, feeRate, allin: wRate + feeRate };
}
const pct = (v, d = 2) => (isFinite(v) ? v : 0).toFixed(d) + '%';
const won = v => Math.round(v || 0).toLocaleString('ko-KR');
const eok = v => fmt(Math.round((v || 0) / 1e8 * 100) / 100);

function newCost(d) {
  const tr = trList(d).filter(t => num(t.amount));
  const m = String(d.term || '').match(/(\d+)\s*개월/);
  const r = String(d.rate || '').match(/(\d+(?:\.\d+)?)\s*%/);
  return {
    dealId: d.id, name: `${today().slice(5).replace('-', '/')} 제안`, start: today(), months: m ? +m[1] : 12,
    loans: tr.length ? tr.map(t => ({ name: t.name, amount: num(t.amount), rate: (String(t.rate || '').match(/(\d+(?:\.\d+)?)/) || [])[1] || (r ? r[1] : ''), note: '' }))
      : [{ name: 'Tr.A', amount: num(d.target) || '', rate: r ? r[1] : '', note: '' }],
    fees: [{ group: '초기비용', item: '금융주선수수료', mode: 'amt', value: '', vat: '포함', note: '' }, { group: '초기비용', item: '법무법인수수료', mode: 'amt', value: '', vat: '포함', note: '' }],
    note: '',
  };
}

/* ---------- 화면 ---------- */
// 편집 중인 비용표는 ui.cost (저장 전). 저장된 것은 Store kind 'cost'.
A['cost-open'] = el => { ui.cost = null; ui.costDeal = el.dataset.id; location.hash = '#/cost/' + encodeURIComponent(el.dataset.id); };
const costsOf = dealId => Store.all('cost').filter(c => c.dealId === dealId).sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));

VIEWS.cost = dealId => {
  const d = Store.get(dealId);
  if (!d) return `<div class="card empty"><b>딜을 찾을 수 없습니다</b></div>`;
  if (!ui.cost || ui.cost.dealId !== dealId) { const last = costsOf(dealId)[0]; ui.cost = last ? JSON.parse(JSON.stringify(last)) : newCost(d); ui.costDirty = false; }
  const c = ui.cost, saved = costsOf(dealId);
  return `<div class="page-head" style="margin-bottom:12px"><div><div class="small muted"><a href="#/deal/${encodeURIComponent(dealId)}">${esc(d.name)}</a> ›</div><h1>비용표</h1><div class="sub">금리 제안용 All-in Cost - 항목·기간을 바꾸면 바로 다시 계산합니다</div></div>
    <div class="actions"><button class="btn" data-act="cost-copy">제안 문구 복사</button><button class="btn" data-act="cost-xlsx">엑셀 내려받기</button><button class="btn" data-act="cost-apply">딜 정보에 반영</button><button class="btn dark" data-act="cost-save">저장</button></div></div>
  <div class="chips" style="margin-bottom:12px">${saved.map(s => `<span class="chip click ${c.id === s.id ? 'on' : ''}" data-act="cost-load" data-id="${s.id}">${esc(s.name)} · ${pct(calcCost(s).allin)}</span>`).join('')}<span class="chip click" data-act="cost-new">+ 새 비용표</span>${c.id ? '<span class="chip click" data-act="cost-dup">복사해서 새로</span>' : ''}${ui.costDirty ? '<span class="chip warn">저장 안 됨</span>' : ''}</div>

  <div class="card deal-sum" id="cost-sum"></div>

  <div class="card" style="margin-bottom:14px"><div class="card-h"><h2>■ 대출실행 개요</h2><div class="small muted">금액 억원 · 금리 연 %</div></div>
    <div class="row3" style="max-width:640px"><div class="field"><label>비용표 이름</label><input class="input" data-cf="name" value="${esc(c.name || '')}"></div>
      <div class="field"><label>대출실행일</label><input class="input" type="date" data-cf="start" value="${esc(c.start || '')}"></div>
      <div class="field"><label>대출기간 (개월)</label><input class="input" inputmode="numeric" data-cf="months" value="${esc(c.months ?? '')}"></div></div>
    <div class="tbl-wrap"><table class="t cost-t"><thead><tr><th>종목</th><th class="num">금액(억)</th><th>대출실행일</th><th>대출만기일</th><th class="num">대출기간</th><th class="num">대출이자(연 %)</th><th>비고</th><th></th></tr></thead><tbody>
      ${c.loans.map((l, i) => `<tr><td><input class="cell" style="width:110px;text-align:left" data-cl="${i}" data-f="name" value="${esc(l.name || '')}"></td><td class="num"><input class="cell" inputmode="decimal" data-cl="${i}" data-f="amount" value="${esc(l.amount ?? '')}"></td><td class="small" data-out="start"></td><td class="small" data-out="end"></td><td class="num small" data-out="days"></td><td class="num"><input class="cell" inputmode="decimal" data-cl="${i}" data-f="rate" value="${esc(l.rate ?? '')}"></td><td><input class="cell wide" data-cl="${i}" data-f="note" value="${esc(l.note || '')}"></td><td>${c.loans.length > 1 ? `<button class="btn sm ghost" data-act="cost-ldel" data-i="${i}">빼기</button>` : ''}</td></tr>`).join('')}
      <tr class="tot"><td>합계</td><td class="num" data-out="totalEok"></td><td colspan="3"></td><td class="num" data-out="wRate"></td><td colspan="2"></td></tr>
    </tbody></table></div><button class="btn sm" data-act="cost-ladd" style="margin-top:8px">+ 종목(트랜치)</button></div>

  <div class="card" style="margin-bottom:14px"><div class="card-h"><h2>■ 수수료</h2><div class="small muted">금액 원 · '대출금 대비 %'는 일시 수수료율</div></div>
    <div class="tbl-wrap"><table class="t cost-t"><thead><tr><th>구분</th><th>항목</th><th>입력</th><th class="num">값</th><th>부가세</th><th class="num">금액(원)</th><th class="num">비용율(연)</th><th>비고</th><th></th></tr></thead><tbody>
      ${c.fees.map((f, i) => `<tr><td><select class="cell" style="width:auto" data-cfe="${i}" data-f="group">${['초기비용', '연간비용'].map(o => `<option ${f.group === o ? 'selected' : ''}>${o}</option>`).join('')}</select></td>
        <td><input class="cell" style="width:150px;text-align:left" list="fee-items" data-cfe="${i}" data-f="item" value="${esc(f.item || '')}"></td>
        <td><select class="cell" style="width:auto" data-cfe="${i}" data-f="mode"><option value="amt" ${f.mode !== 'pct' ? 'selected' : ''}>금액(원)</option><option value="pct" ${f.mode === 'pct' ? 'selected' : ''}>대출금 대비 %</option></select></td>
        <td class="num"><input class="cell" style="width:130px" inputmode="decimal" data-cfe="${i}" data-f="value" value="${esc(f.mode === 'pct' ? (f.value ?? '') : (f.value === '' || f.value == null ? '' : won(num(f.value))))}" placeholder="${f.mode === 'pct' ? '예: 1.0' : '예: 265,000,000'}"></td>
        <td><select class="cell" style="width:auto" data-cfe="${i}" data-f="vat">${['포함', '별도', '해당 없음'].map(o => `<option ${f.vat === o ? 'selected' : ''}>${o}</option>`).join('')}</select></td>
        <td class="num" data-out="feeAmt${i}"></td><td class="num" data-out="feeRate${i}"></td>
        <td><input class="cell wide" data-cfe="${i}" data-f="note" value="${esc(f.note || '')}"></td><td><button class="btn sm ghost" data-act="cost-fdel" data-i="${i}">빼기</button></td></tr>`).join('')}
      <tr class="tot"><td colspan="5">수수료 계</td><td class="num" data-out="feeAmt"></td><td class="num" data-out="feeRate"></td><td colspan="2"></td></tr>
    </tbody></table></div><datalist id="fee-items">${FEE_ITEMS.map(x => `<option value="${x}">`).join('')}</datalist>
    <button class="btn sm" data-act="cost-fadd" style="margin-top:8px">+ 수수료 항목</button>
    <div class="small muted" style="margin-top:8px">초기비용 = 금액 ÷ 총 대출금액 ÷ 대출일수 × 365 · 연간비용 = 금액 ÷ 총 대출금액 · 부가세 '별도'면 금액에 10% 더해 계산</div></div>

  <div class="card"><div class="field" style="margin:0"><label>메모</label><textarea class="input" data-cf="note" style="min-height:60px" placeholder="제안 조건·협의 내용">${esc(c.note || '')}</textarea></div></div>`;
};

// 입력이 바뀌면 화면을 다시 그리지 않고 계산 칸만 바꾼다 (입력 중 커서 유지)
function costRefresh() {
  const c = ui.cost; if (!c || !$('#cost-sum')) return;
  const r = calcCost(c);
  const tile = (l, v, s, cls = '') => `<div class="tile ${cls}"><div class="l">${l}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
  $('#cost-sum').innerHTML = `<div class="tiles">${tile('All-in Cost', pct(r.allin), '연 환산', 'dark')}${tile('대출금리', pct(r.wRate), r.loans.length > 1 ? '금액 가중' : '연')}${tile('수수료 비용', pct(r.feeRate), won(r.feeAmt) + '원')}${tile('대출금액', eok(r.total) + '<small>억</small>', r.loans.map(l => esc(l.name)).join(' · '))}${tile('만기', (num(c.months) || 0) + '<small>개월</small>', r.end ? `${esc(c.start)} ~ ${r.end}` : '')}${tile('대출기간', r.days + '<small>일</small>', '')}</div>`;
  const set = (k, v) => $$(`[data-out="${k}"]`).forEach(e => { e.textContent = v; });
  set('start', c.start || ''); set('end', r.end); set('days', r.days + '일'); set('totalEok', eok(r.total)); set('wRate', pct(r.wRate));
  r.fees.forEach((f, i) => { set('feeAmt' + i, won(f.amt)); set('feeRate' + i, pct(f.rate, 3)); });
  set('feeAmt', won(r.feeAmt)); set('feeRate', pct(r.feeRate));
}
const costTouch = () => { if (!ui.costDirty) { ui.costDirty = true; const ch = $('.chips'); if (ch && !ch.querySelector('.warn')) ch.insertAdjacentHTML('beforeend', '<span class="chip warn">저장 안 됨</span>'); } costRefresh(); };
document.addEventListener('input', e => {
  const el = e.target; if (!ui.cost || route().name !== 'cost') return;
  if (el.dataset.cf) ui.cost[el.dataset.cf] = el.dataset.cf === 'months' ? (el.value === '' ? '' : num(el.value)) : el.value;
  else if (el.dataset.cl !== undefined) { const l = ui.cost.loans[+el.dataset.cl]; l[el.dataset.f] = ['amount', 'rate'].includes(el.dataset.f) ? (el.value.trim() === '' ? '' : num(el.value)) : el.value; }
  else if (el.dataset.cfe !== undefined) { const f = ui.cost.fees[+el.dataset.cfe]; f[el.dataset.f] = el.dataset.f === 'value' ? (el.value.trim() === '' ? '' : num(el.value)) : el.value; }
  else return;
  costTouch();
});
document.addEventListener('change', e => {
  const el = e.target; if (!ui.cost || route().name !== 'cost') return;
  if (el.dataset.cfe !== undefined && el.tagName === 'SELECT') { ui.cost.fees[+el.dataset.cfe][el.dataset.f] = el.value; costTouch(); if (el.dataset.f === 'mode') render(); }
  // 원 단위 금액은 칸을 벗어나면 쉼표를 찍어 보여 준다
  if (el.dataset.cfe !== undefined && el.dataset.f === 'value' && ui.cost.fees[+el.dataset.cfe].mode !== 'pct' && el.value.trim()) el.value = won(num(el.value));
});
// 화면을 다시 그린 뒤 계산 칸 채우기 (render 가 비용표 화면이면 costRefresh 를 부른다)
const costAfterRender = () => costRefresh();

A['cost-ladd'] = () => { ui.cost.loans.push({ name: 'Tr.' + 'ABCDEFG'[ui.cost.loans.length], amount: '', rate: ui.cost.loans[0] ? ui.cost.loans[0].rate : '', note: '' }); ui.costDirty = true; render(); costAfterRender(); };
A['cost-ldel'] = el => { ui.cost.loans.splice(+el.dataset.i, 1); ui.costDirty = true; render(); costAfterRender(); };
A['cost-fadd'] = () => { ui.cost.fees.push({ group: '초기비용', item: '', mode: 'amt', value: '', vat: '포함', note: '' }); ui.costDirty = true; render(); costAfterRender(); };
A['cost-fdel'] = el => { ui.cost.fees.splice(+el.dataset.i, 1); ui.costDirty = true; render(); costAfterRender(); };
A['cost-new'] = () => { if (ui.costDirty && !confirm('저장하지 않은 내용이 있습니다. 새로 시작할까요?')) return; ui.cost = newCost(Store.get(ui.cost.dealId)); ui.costDirty = false; render(); costAfterRender(); };
A['cost-dup'] = () => { const c = JSON.parse(JSON.stringify(ui.cost)); delete c.id; c.name = (c.name || '') + ' (복사)'; ui.cost = c; ui.costDirty = true; render(); costAfterRender(); };
A['cost-load'] = el => { if (ui.costDirty && !confirm('저장하지 않은 내용이 있습니다. 다른 비용표를 열까요?')) return; ui.cost = JSON.parse(JSON.stringify(Store.get(el.dataset.id))); ui.costDirty = false; render(); costAfterRender(); };
A['cost-save'] = () => act(async () => {
  const c = { ...ui.cost, savedAt: new Date().toISOString(), savedBy: Store.mid };
  const r = calcCost(c);
  if (c.id && Store.get(c.id)) await Store.update(c.id, () => c); else { const n = await Store.create('cost', c); ui.cost.id = n.id; }
  ui.costDirty = false;
  await addLog({ dealId: c.dealId, type: 'system', text: `비용표 저장: ${c.name} - All-in ${pct(r.allin)} (금리 ${pct(r.wRate)} + 수수료 ${pct(r.feeRate)}, ${num(c.months)}개월)` });
  render(); costAfterRender();
}, '저장했습니다');
A['cost-apply'] = () => {
  const c = ui.cost, r = calcCost(c), d = Store.get(c.dealId);
  if (!confirm(`딜 정보에 반영할까요?\n금리 ${pct(r.wRate)} · 수수료 연 ${pct(r.feeRate)} · All-in ${pct(r.allin)} · ${num(c.months)}개월${!num(d.target) ? ` · 대출금액 ${eok(r.total)}억` : ''}`)) return;
  act(() => Store.update(d.id, x => ({ ...x, rate: pct(r.wRate), fee: `연 ${pct(r.feeRate)} (${r.fees.filter(f => f.amt).map(f => f.item).join('·')})`, allin: pct(r.allin), term: `${num(c.months)}개월 (${c.start} ~ ${r.end}, ${r.days}일)`, target: num(x.target) || Math.round(r.total / 1e8 * 100) / 100 })), '딜 정보에 반영했습니다');
};
A['cost-copy'] = () => {
  const c = ui.cost, r = calcCost(c), d = Store.get(c.dealId);
  const t = `[${d.name}] 금리 제안 (All-in ${pct(r.allin)})
- 대출금액 ${eok(r.total)}억원${r.loans.length > 1 ? ` (${r.loans.map(l => `${l.name} ${eok(l.won)}억 ${pct(l.r)}`).join(', ')})` : ''}
- 대출기간 ${num(c.months)}개월 (${c.start} ~ ${r.end}, ${r.days}일)
- 대출금리 연 ${pct(r.wRate)}${r.loans.length > 1 ? ' (금액 가중)' : ''}
- 수수료 연 ${pct(r.feeRate)}${r.fees.filter(f => f.amt).length ? ': ' + r.fees.filter(f => f.amt).map(f => `${f.item} ${eok(f.amt)}억(${f.vat === '해당 없음' ? '' : '부가세 ' + f.vat + ', '}연 ${pct(f.rate, 3)})`).join(', ') : ''}
- All-in cost 연 ${pct(r.allin)}${c.note ? '\n※ ' + c.note : ''}`;
  copyText(t, '제안 문구를 복사했습니다');
};

/* ---------- 엑셀: 팀 비용표 양식 그대로, 수식 살아 있게 ---------- */
A['cost-xlsx'] = () => {
  const c = ui.cost, r = calcCost(c), d = Store.get(c.dealId);
  const serial = s => { const t = new Date(s + 'T00:00:00'); return Math.round((Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) - Date.UTC(1899, 11, 30)) / 864e5); };
  const n = r.loans.length, rows = [], E = (v = '', s = 0) => ({ v, s });
  const R = () => rows.length + 1;   // 다음 줄 번호
  rows.push([E()]);                                                         // 1
  rows.push([E(), E(`${d.name} 비용표`, XS.title)]);                         // 2
  rows.push([E()]); rows.push([E()]);                                       // 3,4
  rows.push([E(), E('■ All In Cost 요약', XS.sect)]);                       // 5
  rows.push([E(), E('대출금액', XS.head), E('만기', XS.head), E('대출이자율(년)', XS.head), E('비고', XS.head)]);   // 6
  const sumTop = 7;                                                         // 7.. 종목별
  r.loans.forEach((l, i) => rows.push([E(), { f: `${num(l.amount)}*10^8`, v: l.won, s: XS.won }, i ? E('', XS.text) : { v: num(c.months), s: XS.months }, { v: l.r / 100, s: XS.pct2 }, E(l.name + (l.note ? ' · ' + l.note : ''), XS.text)]));
  const lastLoan = sumTop + n - 1;
  rows.push([E()]);
  const feeTopRow = R(); rows.push([E(), E('수수료 비용 합', XS.text), E('', XS.text), null, E('', XS.text)]);   // 수수료 비용 합 (수식은 아래에서)
  const totRow = R();
  rows.push([E(), { f: `SUM(B${sumTop}:B${lastLoan})`, v: r.total, s: XS.totWon }, E('All in cost', XS.totText), null, E('', XS.totText)]);
  rows.push([E()]); rows.push([E()]);
  rows.push([E(), E('■ 대출실행 개요', XS.sect)]);
  rows.push([E(), ...['종목', '금액', '대출실행일', '대출만기일', '대출기간', '대출이자', '비고'].map(h => E(h, XS.head))]);
  const execTop = R();
  r.loans.forEach((l, i) => { const k = R(); rows.push([E(), E(l.name, XS.center), { f: `B${sumTop + i}`, v: l.won, s: XS.won }, { v: serial(c.start), s: XS.date }, { f: `EDATE(D${k},$C$${sumTop})`, v: serial(r.end), s: XS.date }, { f: `E${k}-D${k}`, v: r.days, s: XS.days }, { f: `D${sumTop + i}`, v: l.r / 100, s: XS.pct2 }, E(l.note || '', XS.text)]); });
  rows.push([E()]); rows.push([E()]);
  rows.push([E(), E('■ 수수료', XS.sect)]);
  rows.push([E(), ...['구분', '항목', '금액', '비용율_연', '부가세 여부', '', '비고'].map(h => E(h, XS.head))]);
  const feeSumRow = R(); rows.push(null);                                   // 자리만 (아래에서 채움)
  const feeFirst = R();
  r.fees.forEach((f, i) => {
    const k = R(), amtF = f.mode === 'pct' ? `$B$${totRow}*${num(f.value) / 100}${f.vat === '별도' ? '*1.1' : ''}` : `${Math.round(num(f.value))}${f.vat === '별도' ? '*1.1' : ''}`;
    const rateF = f.group === '연간비용' ? `D${k}/($B$${totRow})` : `D${k}/($B$${totRow})/$F$${execTop}*365`;
    rows.push([E(), E(i === 0 || r.fees[i - 1].group !== f.group ? f.group : '', XS.center), E(f.item, XS.text), { f: amtF, v: f.amt, s: XS.won }, { f: rateF, v: f.rate / 100, s: XS.pct3 }, E(f.vat === '해당 없음' ? '' : '부가세 ' + f.vat, XS.center), E('', XS.text), E(f.note || '', XS.text)]);
  });
  const feeLast = R() - 1, feeTotRow = R();
  rows.push([E(), E('', XS.totText), E('수수료 계', XS.totText), { f: r.fees.length ? `SUM(D${feeFirst}:D${feeLast})` : '0', v: r.feeAmt, s: XS.totWon }, { f: r.fees.length ? `SUM(E${feeFirst}:E${feeLast})` : '0', v: r.feeRate / 100, s: XS.totPct }, E('', XS.totText), E('', XS.totText), E('', XS.totText)]);
  rows[feeSumRow - 1] = [E(), E('수수료 비용 합', XS.subText), E('', XS.subText), { f: `D${feeTotRow}`, v: r.feeAmt, s: XS.totWon }, { f: `E${feeTotRow}`, v: r.feeRate / 100, s: XS.totPct }, E('', XS.subText), E('', XS.subText), E('', XS.subText)];
  rows[feeTopRow - 1][3] = { f: `E${feeTotRow}`, v: r.feeRate / 100, s: XS.pct2 };
  rows[totRow - 1][3] = { f: `SUMPRODUCT(B${sumTop}:B${lastLoan},D${sumTop}:D${lastLoan})/B${totRow}+D${feeTopRow}`, v: r.allin / 100, s: XS.totPct };
  if (c.note) { rows.push([E()]); rows.push([E(), E('※ ' + c.note, XS.note)]); }
  const safe = d.name.replace(/[\\/:*?"<>|]/g, ' ');
  download(makeXlsx({ sheet: '비용표', rows: rows.map(x => x || [E()]), cols: [2, 20, 18, 16, 14, 12, 12, 30] }), `${safe} 비용표 ${String(c.name || '').replace(/[\\/:*?"<>|]/g, ' ')}.xlsx`);
};
