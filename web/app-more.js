/* 딜 데스크 - 화면 2: 대주 DB · 대주 리스트 · 메일 · 활동 · 설정 */
'use strict';

// 담당자 이름을 모두 (많으면 셋까지 + 외 N명)
const cnames = L => { const cs = (L.contacts || []).filter(c => c.name); return esc(cs.slice(0, 3).map(c => [c.name, c.title].filter(Boolean).join(' ')).join(', ')) + (cs.length > 3 ? ` <span class="muted small">외 ${cs.length - 3}명</span>` : ''); };
/* ======================================================================
 * 대주 DB
 * ==================================================================== */
VIEWS.lenders = () => {
  const q = ui.lenderQ.toLowerCase(), ty = ui.lenderType;
  const all = lenders();
  const list = all.filter(L => (!ty || L.type === ty) && (!q || L.name.toLowerCase().includes(q) || (L.contacts || []).some(c => (c.name + ' ' + (c.email || '')).toLowerCase().includes(q))));
  const taps = Store.all('tap');
  const stat = lid => { const ts = taps.filter(t => t.lenderId === lid); return { live: ts.filter(t => isActive(Store.get(t.dealId)) && t.stage !== 'declined').length, ok: ts.filter(t => t.stage === 'approved').length, no: ts.filter(t => t.stage === 'declined').length }; };
  const counts = Object.fromEntries(LENDER_TYPES.map(t => [t, all.filter(L => L.type === t).length]));
  return `<div class="page-head"><div><h1>대주</h1><div class="sub">${all.length}곳 · 담당자 ${all.reduce((a, L) => a + (L.contacts || []).length, 0)}명</div></div>
    <div class="actions"><button class="btn" data-act="lender-paste">엑셀에서 붙여넣기</button><button class="btn dark" data-act="lender-new">+ 대주 등록</button></div></div>
  <div class="toolbar"><div class="search"><input class="input" id="lq" data-inp="lq" placeholder="기관·담당자·이메일 검색" value="${esc(ui.lenderQ)}"></div></div>
  <div class="chips" style="margin-bottom:12px"><span class="chip click ${!ty ? 'on' : ''}" data-act="lty" data-k="">전체 ${all.length}</span>${LENDER_TYPES.filter(t => counts[t]).map(t => `<span class="chip click ${ty === t ? 'on' : ''}" data-act="lty" data-k="${t}">${t} ${counts[t]}</span>`).join('')}</div>
  <div id="lres">${all.length && isPhone() ? `<div class="card" style="padding:0;overflow:hidden"><div class="mlist">${list.map(L => { const c = (L.contacts || [])[0] || {}, s = stat(L.id); return `<div class="mrow" data-act="go" data-to="#/lender/${encodeURIComponent(L.id)}"><div class="mtop"><b>${esc(L.name)}</b><span class="chip">${esc(L.type || '')}</span><span class="r small muted">${[s.live ? '진행 ' + s.live : '', s.ok ? '승인 ' + s.ok : '', s.no ? '불참 ' + s.no : ''].filter(Boolean).join(' · ')}</span></div>${c.name || c.phone ? `<div class="msub">${cnames(L)}${c.phone ? ` · <a href="tel:${esc(c.phone)}" onclick="event.stopPropagation()">${esc(c.phone)}</a>` : ''}</div>` : ''}</div>`; }).join('') || '<div class="empty">검색 결과가 없습니다</div>'}</div></div>`
  : all.length ? `<div class="card" style="padding:0"><div class="tbl-wrap"><table class="t"><thead><tr><th>기관</th><th>유형</th><th>담당자</th><th>휴대폰</th><th>이메일</th><th class="num">진행 딜</th><th class="num">승인</th><th class="num">불참</th><th>성향·조건</th></tr></thead><tbody>
    ${list.map(L => { const c = (L.contacts || [])[0] || {}, s = stat(L.id); return `<tr class="row" data-act="go" data-to="#/lender/${encodeURIComponent(L.id)}" style="cursor:pointer"><td><b>${esc(L.name)}</b></td><td>${esc(L.type || '')}</td><td class="wrap" style="min-width:140px">${cnames(L)}</td><td>${esc(c.phone || '')}</td><td>${esc(c.email || '')}</td><td class="num">${s.live || ''}</td><td class="num">${s.ok || ''}</td><td class="num">${s.no || ''}</td><td class="ell small muted">${esc(L.prefs || '')}</td></tr>`; }).join('') || '<tr><td colspan="9" class="empty">검색 결과가 없습니다</td></tr>'}
  </tbody></table></div></div>` : `<div class="card empty"><b>대주가 아직 없습니다</b>설정 › '기본 대주 목록 불러오기'로 은행·캐피탈·저축은행 등 180여 곳을 한 번에 넣거나,<br>기존 연락처 엑셀을 '엑셀에서 붙여넣기'로 가져오세요.</div>`}</div>`;
};
// 검색: 검색칸은 그대로 두고 아래 결과만 바꾼다. 화면 전체를 다시 그리면
// 한글 조합 중인 글자가 끊겨 자모가 따로 찍힌다 (예: 'ㅎㅏㄴㅏ').
I.lq = el => {
  ui.lenderQ = el.value;
  const box = $('#lres'); if (!box) return;
  const tmp = document.createElement('div'); tmp.innerHTML = VIEWS.lenders();
  box.innerHTML = $('#lres', tmp).innerHTML;
};
A.lty = el => { ui.lenderType = el.dataset.k; render(); };
A['lender-new'] = () => lenderForm(null, L => { location.hash = '#/lender/' + encodeURIComponent(L.id); });
A['lender-edit'] = el => lenderForm(Store.get(el.dataset.id));

function lenderForm(L, after) {
  const isNew = !L; L = L || { type: '캐피탈', contacts: [] };
  modal({
    title: isNew ? '대주 등록' : '대주 정보 고치기',
    body: `<div class="row2"><div class="field"><label>기관 이름</label><input class="input" id="l-name" value="${esc(L.name || '')}"></div>
      <div class="field"><label>유형</label><select class="input" id="l-type">${LENDER_TYPES.map(t => `<option ${L.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
      <div class="field"><label>성향·조건 (다음 딜 고를 때 참고)</label><textarea class="input" id="l-prefs" style="min-height:70px" placeholder="예: 수도권만, 1군 시공사 책준 필수, 건당 200억 한도, 선순위만">${esc(L.prefs || '')}</textarea></div>
      <div class="field"><label>메모</label><textarea class="input" id="l-memo" style="min-height:50px">${esc(L.memo || '')}</textarea></div>
      ${isNew ? `<h3>담당자 <span class="muted small">- 여러 명 넣을 수 있습니다</span></h3><div id="c-rows"></div><button class="btn sm" id="c-more" type="button">+ 담당자 더</button>` : ''}`,
    foot: `${isNew ? '' : '<button class="btn danger" data-del style="margin-right:auto">삭제</button>'}<button class="btn" data-no>취소</button><button class="btn dark" data-ok>${isNew ? '등록' : '저장'}</button>`,
    onMount: (el, close) => {
      el.querySelector('[data-no]').onclick = close;
      const crow = () => `<div class="c-row contact" style="display:block"><div class="row3"><div class="field"><label>이름</label><input class="input" data-c="name"></div><div class="field"><label>직함</label><input class="input" data-c="title"></div><div class="field"><label>부서</label><input class="input" data-c="dept"></div></div><div class="row2"><div class="field"><label>휴대폰</label><input class="input" data-c="phone"></div><div class="field"><label>이메일</label><input class="input" data-c="email" type="email"></div></div></div>`;
      if (isNew) { $('#c-rows', el).innerHTML = crow(); $('#c-more', el).onclick = () => { $('#c-rows', el).insertAdjacentHTML('beforeend', crow()); $$('.c-row', el).pop().querySelector('input').focus(); }; }
      const del = el.querySelector('[data-del]');
      if (del) del.onclick = async () => {
        const n = Store.all('tap').filter(t => t.lenderId === L.id).length;
        if (n) return toast(`딜 ${n}건의 태핑 보드에 올라 있어 지울 수 없습니다. 보드에서 먼저 빼 주세요.`, true);
        if (!confirm(`${L.name}을(를) 지울까요?`)) return;
        await act(async () => { await Store.remove(L.id); close(); location.hash = '#/lenders'; }, '지웠습니다');
      };
      el.querySelector('[data-ok]').onclick = async () => {
        const name = val(el, 'l-name'); if (!name) return toast('기관 이름을 적어 주세요', true);
        if (isNew && lenders().some(x => normName(x.name) === normName(name))) return toast('같은 이름의 대주가 이미 있습니다', true);
        const v = { name, type: val(el, 'l-type'), prefs: val(el, 'l-prefs'), memo: val(el, 'l-memo') };
        await act(async () => {
          let out;
          if (isNew) {
            const cs = $$('.c-row', el).map(r => { const g = k => r.querySelector(`[data-c="${k}"]`).value.trim(); return { cid: uid(), name: g('name'), title: g('title'), dept: g('dept'), phone: g('phone'), email: g('email'), memo: '' }; }).filter(c => c.name || c.email || c.phone);
            out = await Store.create('lender', { ...v, contacts: cs });
          } else out = await Store.update(L.id, x => ({ ...x, ...v }));
          close(); if (after) after(out);
        }, isNew ? '등록했습니다' : '저장했습니다');
      };
    }
  });
}
const normName = s => String(s || '').replace(/\s|\(주\)|㈜|주식회사/g, '').toLowerCase().replace(/^오케이/, 'ok').replace(/^아이엠/, 'im').replace(/^엔에이치/, 'nh').replace(/^케이비/, 'kb');
// 이름이 딱 같지 않아도 한쪽이 다른 쪽을 품으면(경남은행 ↔ BNK경남은행) 같은 곳으로 본다 - 하나만 걸릴 때만
function matchLender(map, name) {
  const k = normName(name);
  if (map.has(k)) return map.get(k);
  if (k.length < 4) return null;
  const hits = [...map.entries()].filter(([n]) => n.length >= 4 && (n.endsWith(k) || k.endsWith(n)));
  return hits.length === 1 ? hits[0][1] : null;
}

function contactForm(lid, c) {
  const isNew = !c; c = c || {};
  modal({
    title: (isNew ? '담당자 추가 · ' : '담당자 고치기 · ') + lname(lid),
    body: `<div class="row3"><div class="field"><label>이름</label><input class="input" id="c-name" value="${esc(c.name || '')}"></div><div class="field"><label>직함</label><input class="input" id="c-title" value="${esc(c.title || '')}"></div><div class="field"><label>부서</label><input class="input" id="c-dept" value="${esc(c.dept || '')}"></div></div>
      <div class="row2"><div class="field"><label>휴대폰</label><input class="input" id="c-phone" value="${esc(c.phone || '')}"></div><div class="field"><label>이메일</label><input class="input" id="c-email" type="email" value="${esc(c.email || '')}"></div></div>
      <div class="field"><label>메모</label><input class="input" id="c-memo" value="${esc(c.memo || '')}" placeholder="예: 심사역, 오전 통화 선호"></div>`,
    foot: `${isNew ? '' : '<button class="btn danger" data-del style="margin-right:auto">삭제</button>'}<button class="btn" data-no>취소</button><button class="btn dark" data-ok>저장</button>`,
    onMount: (el, close) => {
      el.querySelector('[data-no]').onclick = close;
      const del = el.querySelector('[data-del]');
      if (del) del.onclick = () => act(async () => { await Store.update(lid, L => { L.contacts = (L.contacts || []).filter(x => x.cid !== c.cid); return L; }); close(); }, '지웠습니다');
      el.querySelector('[data-ok]').onclick = async () => {
        const v = { cid: c.cid || uid(), name: val(el, 'c-name'), title: val(el, 'c-title'), dept: val(el, 'c-dept'), phone: val(el, 'c-phone'), email: val(el, 'c-email'), memo: val(el, 'c-memo') };
        if (!v.name && !v.email) return toast('이름이나 이메일을 적어 주세요', true);
        await act(async () => { await Store.update(lid, L => { L.contacts = L.contacts || []; const i = L.contacts.findIndex(x => x.cid === v.cid); if (i >= 0) L.contacts[i] = v; else L.contacts.push(v); return L; }); close(); }, '저장했습니다');
      };
    }
  });
}
A['contact-add'] = el => contactForm(el.dataset.id);
A['contact-edit'] = el => contactForm(el.dataset.id, (Store.get(el.dataset.id).contacts || []).find(c => c.cid === el.dataset.cid));

VIEWS.lender = id => {
  const L = Store.get(id);
  if (!L) return `<div class="card empty"><b>대주를 찾을 수 없습니다</b><a href="#/lenders">대주 목록으로</a></div>`;
  const taps = Store.all('tap').filter(t => t.lenderId === id).sort((a, b) => (b.lastTouch || '').localeCompare(a.lastTouch || ''));
  const ls = Store.all('list').filter(l => (l.items || []).some(i => i.lenderId === id));
  return `<div class="page-head"><div><div class="small muted"><a href="#/lenders">대주</a> ›</div><h1>${esc(L.name)}</h1><div class="chips" style="margin-top:6px"><span class="chip">${esc(L.type || '')}</span>${ls.map(l => `<span class="chip gold">${esc(l.name)}</span>`).join('')}</div></div>
    <div class="actions"><button class="btn" data-act="lender-edit" data-id="${id}">고치기</button><button class="btn dark" data-act="mail-lender" data-id="${id}">메일 쓰기</button></div></div>
  <div class="split"><div class="grid">
    <div class="card"><h2>딜 이력</h2>${taps.length ? `<div class="tbl-wrap"><table class="t stack"><thead><tr><th>딜</th><th>유형</th><th>단계</th><th class="num">검토(억)</th><th class="num">승인(억)</th><th>사유·비고</th><th>최근</th></tr></thead><tbody>${taps.map(t => { const d = Store.get(t.dealId) || {}; return `<tr class="row"><td><a href="#/deal/${encodeURIComponent(t.dealId)}"><b>${esc(d.name || '')}</b></a></td><td>${esc(d.kind || '')}</td><td><span class="chip dot" style="color:${STAGE[t.stage].c}">${STAGE[t.stage].t}</span></td><td class="num" data-l="검토">${fmt(num(t.amount))}</td><td class="num" data-l="승인">${fmt(num(t.approved))}</td><td class="ell">${esc(t.reason || t.note || '')}</td><td class="small muted">${shortDate(t.lastTouch)}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="muted small">아직 함께한 딜이 없습니다</div>'}</div>
    <div class="card"><h2>활동</h2>${feedHtml(logsFor(l => logHitsLender(l, id)).slice(0, 50))}</div>
  </div><div class="grid">
    <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h2 style="margin:0">담당자</h2><button class="btn sm" data-act="contact-add" data-id="${id}">+ 추가</button></div>
      ${(L.contacts || []).map(c => `<div class="contact"><div><div class="n">${esc(c.name)} <span class="muted small">${esc([c.title, c.dept].filter(Boolean).join(' · '))}</span></div><div class="small">${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ''}</div><div class="small">${esc(c.email || '')}</div>${c.memo ? `<div class="small muted">${esc(c.memo)}</div>` : ''}</div><button class="btn sm ghost" data-act="contact-edit" data-id="${id}" data-cid="${c.cid}">고치기</button></div>`).join('') || '<div class="muted small">등록된 담당자가 없습니다</div>'}</div>
    <div class="card"><h2>성향·조건</h2><div style="white-space:pre-wrap">${esc(L.prefs || '') || '<span class="muted small">아직 없습니다. 고치기에서 적어 두면 다음 딜 대주 고를 때 보입니다.</span>'}</div>${L.memo ? `<h3 style="margin-top:12px">메모</h3><div style="white-space:pre-wrap">${esc(L.memo)}</div>` : ''}</div>
  </div></div>`;
};

/* ---------- 엑셀에서 붙여넣기 ---------- */
const TITLES = ['지점장', '본부장', '센터장', '부부장', '부장', '차장', '과장', '대리', '계장', '주임', '사원', '팀장', '실장', '이사', '상무', '전무', '대표', '수석', '책임', '선임', '매니저', '심사역', '위원', '부행장', '소장'];
function splitNameTitle(s) {
  s = String(s || '').trim(); if (!s) return { name: '', title: '' };
  const parts = s.split(/\s+/);
  if (parts.length > 1 && TITLES.some(t => parts[parts.length - 1].endsWith(t))) return { name: parts.slice(0, -1).join(' '), title: parts[parts.length - 1] };
  for (const t of TITLES) if (s.length > t.length + 1 && s.endsWith(t)) return { name: s.slice(0, -t.length), title: t };
  return { name: s, title: '' };
}
// 한 칸에 여러 사람: '채형주 부장 서형진 팀장 윤형로 계장' / '홍길동, 김철수' / 줄바꿈
function splitPeople(s) {
  s = String(s || '').trim(); if (!s) return [];
  const isTitle = w => TITLES.some(t => w === t || (w.endsWith(t) && w.length <= t.length + 1 && !/[가-힣]{3}/.test(w.slice(0, -t.length))));
  const toks = s.split(/[\s,，/·;\n]+/).filter(Boolean);
  const out = [];
  for (const w of toks) {
    if (isTitle(w) && out.length && !out[out.length - 1].title) out[out.length - 1].title = w;
    else { const nt = splitNameTitle(w); out.push({ name: nt.name, title: nt.title }); }
  }
  // 성·이름이 띄어 쓰인 경우('홍 길동')처럼 한 글자 토막은 앞사람에 붙인다
  return out.reduce((a, p) => { if (a.length && p.name.length === 1 && !a[a.length - 1].title) a[a.length - 1].name += p.name; else a.push(p); return a; }, []);
}
const PHONE_RE = /(?:\+82[-\s]?)?0\d{1,2}[-\s.)]?\d{3,4}[-\s.]?\d{4}/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
function guessType(name) {
  for (const [ty, arr] of Object.entries(SEED_LENDERS)) if (arr.some(n => normName(n) === normName(name))) return ty;
  const rules = [['저축은행', '저축은행'], ['캐피탈', '캐피탈'], ['커머셜', '캐피탈'], ['카드', '카드'], ['증권', '증권'], ['투자증권', '증권'], ['생명', '보험'], ['화재', '보험'], ['손해보험', '보험'], ['보험', '보험'], ['새마을', '상호금융'], ['신협', '상호금융'], ['농협', '상호금융'], ['수협', '상호금융'], ['자산운용', '자산운용'], ['운용', '자산운용'], ['펀드', '자산운용'], ['리츠', '자산운용'], ['공제', '연기금·공제회'], ['연금', '연기금·공제회'], ['은행', '은행']];
  for (const [k, t] of rules) if (name.includes(k)) return t;
  return '기타';
}
function parsePaste(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (!lines.length) return [];
  const cells = lines.map(l => l.split('\t').map(c => c.trim()));
  const H = { org: /^(기관|기관명|대주|금융기관|회사|회사명)$/, type: /^(유형|구분|대주유형|업권)$/, person: /^(담당자|성명|이름|담당)$/, title: /^(직함|직급|직위|직책)$/, dept: /^(부서|부서명|팀)$/, phone: /(휴대폰|핸드폰|연락처|전화|휴대전화|H\.?P|mobile)/i, email: /(이메일|메일|e-?mail)/i };
  let hi = cells.findIndex(r => r.some(c => H.org.test(c)));
  // '구분 | 금액 | 담당자 | 연락처' 처럼 기관 칸 이름이 '구분'인 표 (선릉 대주 리스트 등)
  if (hi < 0) hi = cells.findIndex(r => r.some(c => H.person.test(c)) && r.some(c => H.phone.test(c) || H.email.test(c)));
  let map;
  if (hi >= 0) {
    map = {}; cells[hi].forEach((c, i) => { for (const k in H) if (map[k] === undefined && H[k].test(c)) map[k] = i; });
    if (map.org === undefined && map.type !== undefined) { map.org = map.type; delete map.type; }
  }
  else { hi = -1; map = { org: 0, type: 1, person: 2, title: 3, phone: 4, email: 5 }; }
  const out = []; let lastType = '';
  for (const r of cells.slice(hi + 1)) {
    const g = k => map[k] === undefined ? '' : (r[map[k]] || '').trim();
    let org = g('org'); if (!org || /^(합계|소계|총계)/.test(org)) continue;
    let type = g('type'); if (type && LENDER_TYPES.includes(type)) lastType = type; else if (type && /은행|캐피탈|저축|증권|보험|상호|운용|공제|카드/.test(type)) { lastType = guessType(type); } type = (type && LENDER_TYPES.includes(type)) ? type : (lastType && !/기타/.test(lastType) ? lastType : guessType(org));
    const people = splitPeople(g('person'));
    const phones = g('phone').match(PHONE_RE) || (g('phone') ? [g('phone')] : []);
    const emails = (g('email') || (r.find(c => /@/.test(c)) || '')).match(EMAIL_RE) || [];
    const ty = guessType(org) !== '기타' ? guessType(org) : type;
    // 사람이 여럿이면 전화·이메일도 순서대로 짝지어 한 사람씩 (짝이 모자라면 빈칸)
    const n = Math.max(people.length, 1);
    for (let i = 0; i < n; i++) {
      const p = people[i] || { name: '', title: '' };
      out.push({ org, type: ty, name: p.name, title: (n === 1 && g('title')) || p.title, dept: g('dept'), phone: (phones[i] || (n === 1 ? phones[0] : '') || '').trim(), email: emails[i] || (n === 1 ? emails[0] || '' : '') });
    }
  }
  return out;
}
A['lender-paste'] = () => {
  const lists = Store.all('list');
  modal({
    title: '엑셀에서 대주 붙여넣기', wide: true,
    body: `<p class="small muted" style="margin-top:0">엑셀에서 표를 통째로 복사해 붙여넣으세요. 머리글(기관·담당자·연락처·이메일 등)이 있으면 칸을 알아서 찾고, 없으면 <b>기관 | 유형 | 담당자 | 직함 | 휴대폰 | 이메일</b> 순서로 읽습니다. '곽OO 지점장'처럼 이름·직함이 한 칸이어도 나눕니다. 이미 있는 기관은 담당자만 더합니다.</p>
      <div class="drop" id="p-drop" style="padding:10px"><b>연락처 엑셀 파일을 끌어다 놓거나</b> <label class="btn sm">파일 고르기<input type="file" id="p-file" accept=".xlsx,.xlsm" hidden></label> <span class="small muted">· 아래에 표를 붙여넣기</span></div>
      <textarea class="input" id="p-text" style="min-height:140px;font-size:12px" placeholder="여기에 붙여넣기 (Ctrl+V)"></textarea>
      <div id="p-prev" style="margin-top:12px"></div>
      <div class="row2" style="margin-top:12px"><div class="field"><label>가져온 대주를 리스트에도 담기 (선택)</label><select class="input" id="p-list"><option value="">담지 않음</option><option value="__new">+ 새 리스트 만들기</option>${lists.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select></div>
      <div class="field"><label>새 리스트 이름</label><input class="input" id="p-listname" placeholder="예: 중도금 대주"></div></div>`,
    foot: `<button class="btn" data-no>취소</button><button class="btn dark" data-ok>가져오기</button>`,
    onMount: (el, close) => {
      let rows = [];
      $('#p-text', el).oninput = () => {
        rows = parsePaste($('#p-text', el).value);
        $('#p-prev', el).innerHTML = rows.length ? `<div class="small muted" style="margin-bottom:6px">${rows.length}줄 읽음 - 확인해 주세요</div><div class="tbl-wrap" style="max-height:240px;overflow:auto"><table class="t"><thead><tr><th>기관</th><th>유형</th><th>담당자</th><th>직함</th><th>휴대폰</th><th>이메일</th><th></th></tr></thead><tbody>${rows.map(r => { const ex = matchLender(new Map(lenders().map(x => [normName(x.name), x])), r.org); return `<tr><td>${esc(r.org)}</td><td>${esc(r.type)}</td><td>${esc(r.name)}</td><td>${esc(r.title)}</td><td>${esc(r.phone)}</td><td>${esc(r.email)}</td><td class="small muted">${ex ? (normName(ex.name) === normName(r.org) ? '있는 기관' : `있는 기관 (${esc(ex.name)})`) : '새 기관'}</td></tr>`; }).join('')}</tbody></table></div>` : '';
      };
      // 엑셀 파일 → 시트마다 표를 탭 글로 바꿔 같은 읽기에 넣는다 (기관 머리글이 있는 첫 시트)
      const fromFile = async f => {
        try {
          const sh = await xlsxSheets(await f.arrayBuffer());
          const pick = sh.find(s => parsePaste(s.rows.map(r => r.join('\t')).join('\n')).length) || sh[0];
          $('#p-text', el).value = pick.rows.map(r => r.join('\t')).join('\n');
          $('#p-text', el).dispatchEvent(new Event('input'));
        } catch (e) { toast(e.message, true); }
      };
      $('#p-file', el).onchange = e => e.target.files[0] && fromFile(e.target.files[0]);
      const pd = $('#p-drop', el);
      pd.addEventListener('dragover', e => { e.preventDefault(); pd.classList.add('over'); });
      pd.addEventListener('dragleave', () => pd.classList.remove('over'));
      pd.addEventListener('drop', e => { e.preventDefault(); pd.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) fromFile(f); });
      el.querySelector('[data-no]').onclick = close;
      el.querySelector('[data-ok]').onclick = async () => {
        if (!rows.length) return toast('붙여넣은 내용을 읽지 못했습니다', true);
        const listSel = $('#p-list', el).value, listName = $('#p-listname', el).value.trim();
        if (listSel === '__new' && !listName) return toast('새 리스트 이름을 적어 주세요', true);
        await act(async () => {
          const byName = new Map(lenders().map(L => [normName(L.name), JSON.parse(JSON.stringify(L))]));
          const touched = new Map(), picks = [];
          for (const r of rows) {
            const k = normName(r.org);
            let L = matchLender(byName, r.org);
            if (!L) { L = { id: 'lender:' + uid(), name: r.org, type: r.type, prefs: '', memo: '', contacts: [], _new: true }; byName.set(k, L); }
            let c = null;
            if (r.name || r.email) {
              c = (L.contacts || []).find(x => (r.email && x.email && x.email.toLowerCase() === r.email.toLowerCase()) || (r.name && x.name === r.name));
              if (c) { for (const f of ['title', 'dept', 'phone', 'email']) if (r[f] && !c[f]) c[f] = r[f]; }
              else { c = { cid: uid(), name: r.name, title: r.title, dept: r.dept, phone: r.phone, email: r.email, memo: '' }; L.contacts = L.contacts || []; L.contacts.push(c); }
            }
            touched.set(L.id, L);
            picks.push({ lenderId: L.id, contactId: c ? c.cid : '' });
          }
          const ops = [...touched.values()].map(L => { const isNew = L._new; delete L._new; return { kind: 'lender', v: L, base: isNew ? undefined : (Store.meta(L.id) || {}).at }; });
          await Store.putMany(ops);
          if (listSel) {
            const uniq = []; const seen = new Set(); for (const p of picks) { const key = p.lenderId + '|' + p.contactId; if (!seen.has(key)) { seen.add(key); uniq.push(p); } }
            if (listSel === '__new') await Store.create('list', { name: listName, desc: '엑셀 붙여넣기로 만든 리스트', items: uniq, createdAt: new Date().toISOString() });
            else await Store.update(listSel, l => { const have = new Set((l.items || []).map(i => i.lenderId + '|' + i.contactId)); l.items = [...(l.items || []), ...uniq.filter(p => !have.has(p.lenderId + '|' + p.contactId))]; return l; });
          }
          close();
        }, `${rows.length}줄을 가져왔습니다`);
      };
    }
  });
};

/* ======================================================================
 * 대주 리스트 (자주 보내는 수신자 묶음)
 * ==================================================================== */
const recipKey = (lid, cid) => lid + '|' + (cid || '');
function itemInfo(it) {
  const L = Store.get(it.lenderId); if (!L) return null;
  const c = (L.contacts || []).find(x => x.cid === it.contactId) || null;
  return { lenderId: L.id, contactId: c ? c.cid : '', org: L.name, type: L.type, name: c ? c.name : '', title: c ? c.title : '', email: c ? (c.email || '') : '' };
}
VIEWS.lists = () => {
  const ls = Store.all('list').sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return `<div class="page-head"><div><h1>대주 리스트</h1><div class="sub">자주 같은 메일을 보내는 대주 묶음 - 메일 쓸 때 리스트째 고릅니다</div></div>
    <div class="actions"><button class="btn dark" data-act="list-new">+ 새 리스트</button></div></div>
  ${ls.length ? `<div class="grid g3">${ls.map(l => { const items = (l.items || []).map(itemInfo).filter(Boolean); const noMail = items.filter(i => !i.email).length; const types = [...new Set(items.map(i => i.type))]; return `<div class="card deal-card" data-act="list-edit" data-id="${l.id}">
      <div class="t">${esc(l.name)}</div>${l.desc ? `<div class="meta">${esc(l.desc)}</div>` : ''}
      <div class="chips"><span class="chip gold">${items.length}명</span>${types.slice(0, 4).map(t => `<span class="chip">${esc(t)}</span>`).join('')}${noMail ? `<span class="chip warn">이메일 없음 ${noMail}</span>` : ''}</div>
      <div class="small muted">${items.slice(0, 5).map(i => esc(i.org)).join(', ')}${items.length > 5 ? ' 외' : ''}</div>
      <div><button class="btn sm dark" data-act="mail-list" data-id="${l.id}">이 리스트로 메일 쓰기</button></div></div>`; }).join('')}</div>`
    : `<div class="card empty"><b>아직 리스트가 없습니다</b>예: '중도금 대주', '저축은행 PF', '캐피탈 브릿지' 처럼 자주 같이 보내는 대주를 묶어 두세요.<div style="margin-top:12px"><button class="btn dark" data-act="list-new">+ 새 리스트</button></div></div>`}`;
};
A['list-new'] = () => listForm();
A['list-edit'] = (el, e) => { if (e.target.closest('[data-act="mail-list"]')) return; listForm(Store.get(el.dataset.id)); };

/* 담당자 고르기 (리스트 편집·메일 받는 사람 공용) */
function contactPicker(el, sel, { onlyEmail = true } = {}) {
  let q = '', ty = '', mailOnly = onlyEmail;
  const box = $('#cp-box', el);
  const draw = () => {
    let html = '';
    for (const L of lenders()) {
      if (ty && L.type !== ty) continue;
      const cs = (L.contacts || []).filter(c => (!mailOnly || c.email));
      const hit = s => !q || String(s || '').toLowerCase().includes(q);
      const visible = cs.filter(c => hit(L.name) || hit(c.name) || hit(c.email));
      if (!visible.length) continue;
      html += `<div class="pick" style="background:var(--line2);cursor:default;padding:5px 12px"><b class="small">${esc(L.name)}</b> <span class="small muted">${esc(L.type || '')}</span></div>` + visible.map(c => { const k = recipKey(L.id, c.cid); return `<label class="pick"><input type="checkbox" value="${esc(k)}" ${sel.has(k) ? 'checked' : ''}><div class="grow">${esc(c.name || '(이름 없음)')} <span class="muted small">${esc(c.title || '')}</span></div><span class="small ${c.email ? '' : 'muted'}">${esc(c.email || '이메일 없음')}</span></label>`; }).join('');
    }
    box.innerHTML = html || '<div class="empty">조건에 맞는 담당자가 없습니다. 대주 화면에서 담당자·이메일을 먼저 등록하세요.</div>';
    $('#cp-n', el).textContent = `${sel.size}명 선택`;
  };
  $('#cp-q', el).oninput = e => { q = e.target.value.trim().toLowerCase(); draw(); };
  $('#cp-ty', el).onchange = e => { ty = e.target.value; draw(); };
  const mo = $('#cp-mail', el); if (mo) mo.onchange = e => { mailOnly = e.target.checked; draw(); };
  $('#cp-all', el).onclick = () => { $$('input[type=checkbox]', box).forEach(c => { c.checked = true; sel.add(c.value); }); $('#cp-n', el).textContent = `${sel.size}명 선택`; };
  box.addEventListener('change', e => { if (e.target.type === 'checkbox') { e.target.checked ? sel.add(e.target.value) : sel.delete(e.target.value); $('#cp-n', el).textContent = `${sel.size}명 선택`; } });
  draw();
}
const pickerHtml = (withMailToggle) => `<div class="toolbar"><div class="search"><input class="input" id="cp-q" placeholder="기관·담당자·이메일 검색"></div><select class="input" id="cp-ty" style="width:auto"><option value="">유형 전체</option>${LENDER_TYPES.map(t => `<option>${t}</option>`).join('')}</select><button class="btn sm" id="cp-all">보이는 것 모두 선택</button></div>
  ${withMailToggle ? '<label class="check"><input type="checkbox" id="cp-mail" checked> 이메일 있는 담당자만</label>' : ''}
  <div class="pick-list" id="cp-box" style="max-height:380px"></div><div class="small muted" style="margin-top:6px" id="cp-n"></div>`;

function listForm(l) {
  const isNew = !l; l = l || { items: [] };
  const sel = new Set((l.items || []).map(i => recipKey(i.lenderId, i.contactId)));
  modal({
    title: isNew ? '새 대주 리스트' : '리스트 고치기', wide: true,
    body: `<div class="row2"><div class="field"><label>리스트 이름</label><input class="input" id="li-name" value="${esc(l.name || '')}" placeholder="예: 중도금 대주"></div><div class="field"><label>설명</label><input class="input" id="li-desc" value="${esc(l.desc || '')}" placeholder="예: 중도금 대출 주선 때 매번 보내는 곳"></div></div>
      <h3>담당자 고르기</h3>${pickerHtml(true)}`,
    foot: `${isNew ? '' : '<button class="btn danger" data-del style="margin-right:auto">리스트 삭제</button>'}<button class="btn" data-no>취소</button><button class="btn dark" data-ok>저장</button>`,
    onMount: (el, close) => {
      contactPicker(el, sel, { onlyEmail: true });
      el.querySelector('[data-no]').onclick = close;
      const del = el.querySelector('[data-del]');
      if (del) del.onclick = () => { if (confirm(`'${l.name}' 리스트를 지울까요? (대주·담당자는 그대로 남습니다)`)) act(async () => { await Store.remove(l.id); close(); }, '지웠습니다'); };
      el.querySelector('[data-ok]').onclick = async () => {
        const name = val(el, 'li-name'); if (!name) return toast('리스트 이름을 적어 주세요', true);
        const items = [...sel].map(k => { const [lenderId, contactId] = k.split('|'); return { lenderId, contactId }; });
        await act(async () => {
          if (isNew) await Store.create('list', { name, desc: val(el, 'li-desc'), items, createdAt: new Date().toISOString() });
          else await Store.update(l.id, x => ({ ...x, name, desc: val(el, 'li-desc'), items }));
          close();
        }, '저장했습니다');
      };
    }
  });
}

/* ======================================================================
 * 메일 - 받는 사람마다 단독 메일 (단체·숨은참조 없음)
 * ==================================================================== */
let mail = freshMail();
function freshMail() { return { step: 1, dealId: '', recips: [], tplId: '', subject: '', body: '', sig: true, files: [], method: '', sent: {}, pi: 0, logged: false, toBoard: true, addMissing: true }; }
function addRecips(items, src) {
  const have = new Set(mail.recips.map(r => r.email ? r.email.toLowerCase() : recipKey(r.lenderId, r.contactId)));
  let n = 0;
  for (const it of items) {
    const info = it.org ? it : itemInfo(it); if (!info) continue;
    const key = info.email ? info.email.toLowerCase() : recipKey(info.lenderId, info.contactId);
    if (have.has(key)) continue;
    have.add(key); mail.recips.push({ ...info, src }); n++;
  }
  return n;
}
function lenderContacts(lid) {
  const L = Store.get(lid); if (!L) return [];
  const cs = (L.contacts || []).filter(c => c.email);
  return cs.length ? cs.map(c => ({ lenderId: lid, contactId: c.cid })) : [{ lenderId: lid, contactId: ((L.contacts || [])[0] || {}).cid || '' }];
}
function goMail(o = {}) {
  mail = freshMail();
  mail.dealId = o.dealId || '';
  if (o.items) addRecips(o.items, o.src || '');
  location.hash = '#/mail';
  if (route().name === 'mail') render();
}
A['mail-new'] = () => goMail();
A['mail-deal'] = el => goMail({ dealId: el.dataset.id });
A['mail-list'] = el => { const l = Store.get(el.dataset.id); goMail({ items: l.items || [], src: l.name }); };
A['mail-lender'] = el => goMail({ items: lenderContacts(el.dataset.id), src: '대주' });
A['mail-one'] = el => { closeDrawer(); goMail({ dealId: el.dataset.deal, items: [{ lenderId: el.dataset.lender, contactId: el.dataset.contact }], src: '대주' }); };

function myFields() { return { ...sigFields(me()), 날짜: today() }; }
function fieldsFor(r) {
  const d = Store.get(mail.dealId) || {};
  return { ...myFields(), 기관: r.org || '', 담당자: r.name || '', 직함: r.title || '', 호칭: r.name ? `${r.name} ${r.title || ''}`.trim() + '님' : `${r.org || ''} 담당자님`, 딜명: d.name || '' };
}
function renderMail(r) {
  const f = fieldsFor(r);
  const sig = mail.sig ? sigFor(me()) : '';
  const text = mergeFields(mail.body, f) + (sig ? '\n\n' + sig : '');
  return { to: r.email, toName: r.name ? `${r.name} ${r.title || ''}`.trim() : r.org, subject: mergeFields(mail.subject, f), text, html: textToHtml(text) };
}
const validRecips = () => mail.recips.filter(r => /@/.test(r.email || ''));

VIEWS.mail = () => {
  const tpls = Store.all('tpl');
  if (!mail.subject && !mail.body && tpls.length && !mail.tplId) { mail.tplId = tpls[0].id; mail.subject = tpls[0].subject; mail.body = tpls[0].body; }
  if (!mail.method) mail.method = me().mailMode || 'outlook-pc';
  const steps = ['받는 사람', '내용', '보내기'];
  const head = `<div class="page-head"><div><h1>메일</h1><div class="sub">받는 사람마다 그 사람만 받는 단독 메일로 나갑니다 · 단체·숨은참조 없음</div></div><div class="actions"><button class="btn ghost" data-act="mail-reset">새로 쓰기</button></div></div>
    <div class="steps">${steps.map((s, i) => `<span class="${mail.step === i + 1 ? 'on' : mail.step > i + 1 ? 'done' : ''}" ${mail.step > i + 1 ? `data-act="mail-step" data-k="${i + 1}" style="cursor:pointer"` : ''}>${i + 1}. ${s}</span>`).join('')}</div>`;
  if (mail.step === 1) return head + mailStep1();
  if (mail.step === 2) return head + mailStep2(tpls);
  return head + mailStep3();
};
A['mail-reset'] = () => { mail = freshMail(); render(); };
A['mail-step'] = el => { mail.step = +el.dataset.k; render(); };

function mailStep1() {
  const ds = deals().filter(isActive), ls = Store.all('list').sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const d = Store.get(mail.dealId);
  const v = validRecips().length, bad = mail.recips.length - v;
  return `<div class="split"><div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h2 style="margin:0">받는 사람 ${mail.recips.length}명</h2>${mail.recips.length ? '<button class="btn sm ghost" data-act="mr-clear">모두 빼기</button>' : ''}</div>
      ${mail.recips.length ? `<div class="tbl-wrap"><table class="t stack"><thead><tr><th>기관</th><th>담당자</th><th>이메일</th><th>어디서</th><th></th></tr></thead><tbody>${mail.recips.map((r, i) => `<tr class="row"><td><b>${esc(r.org)}</b></td><td>${esc([r.name, r.title].filter(Boolean).join(' '))}</td><td>${r.email ? esc(r.email) : `<input class="cell wide" style="text-align:left;border-color:var(--red)" placeholder="이메일 넣기" data-chg="mr-email" data-i="${i}">`}</td><td class="small muted">${esc(r.src || '')}</td><td><button class="btn sm ghost" data-act="mr-del" data-i="${i}">빼기</button></td></tr>`).join('')}</tbody></table></div>
        ${bad ? `<div class="notice small" style="margin-top:10px">이메일이 없는 ${bad}명은 보내지 않습니다. 칸에 넣으면 대주 DB 담당자에도 저장됩니다.</div>` : ''}`
      : `<div class="empty"><b>받는 사람을 고르세요</b>오른쪽에서 저장 리스트·태핑 보드·검색으로 더합니다</div>`}
      <div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn dark" data-act="mail-next" ${v ? '' : 'disabled'}>다음: 내용 쓰기 (${v}통) →</button></div>
    </div>
    <div class="grid">
      <div class="card"><h3>딜</h3><select class="input" data-chg="m-deal"><option value="">딜 없이 보내기</option>${ds.map(x => `<option value="${x.id}" ${x.id === mail.dealId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select><div class="small muted" style="margin-top:6px">{딜명} 칸 채우기와 태핑 보드 기록에 쓰입니다</div></div>
      <div class="card"><h3>저장 리스트에서</h3>${ls.length ? ls.map(l => `<div class="pick" data-act="mr-list" data-id="${l.id}"><div class="grow"><b>${esc(l.name)}</b> <span class="muted small">${(l.items || []).length}명</span></div><span class="btn sm">+ 담기</span></div>`).join('') : '<div class="small muted">리스트가 없습니다. <a href="#/lists">대주 리스트</a>에서 만들어 두세요.</div>'}</div>
      ${d ? `<div class="card"><h3>${esc(d.name)} 태핑 보드에서</h3><div class="chips" id="mr-stages">${STAGES.filter(s => tapsOf(d.id).some(t => t.stage === s.k)).map(s => `<label class="chip click"><input type="checkbox" value="${s.k}" ${['todo', 'tapped', 'sent', 'review'].includes(s.k) ? 'checked' : ''}> ${s.t} ${tapsOf(d.id).filter(t => t.stage === s.k).length}</label>`).join('') || '<span class="small muted">보드에 대주가 없습니다</span>'}</div><button class="btn sm" style="margin-top:10px" data-act="mr-board">고른 단계의 대주 담기</button></div>` : ''}
      <div class="card"><h3>직접 고르기</h3><button class="btn" data-act="mr-pick">대주 DB 에서 담당자 검색…</button></div>
    </div></div>`;
}
C['m-deal'] = el => { mail.dealId = el.value; render(); };
A['mr-list'] = el => { const l = Store.get(el.dataset.id); const n = addRecips(l.items || [], l.name); toast(n ? `${n}명 담았습니다` : '이미 다 담겨 있습니다'); render(); };
A['mr-board'] = () => {
  const ks = $$('#mr-stages input').filter(c => c.checked).map(c => c.value);
  const taps = tapsOf(mail.dealId).filter(t => ks.includes(t.stage));
  const items = taps.flatMap(t => lenderContacts(t.lenderId));
  const n = addRecips(items, '태핑 보드'); toast(n ? `${n}명 담았습니다` : '더할 사람이 없습니다'); render();
};
A['mr-pick'] = () => {
  const sel = new Set();
  modal({
    title: '받는 사람 고르기', wide: true, body: pickerHtml(false),
    foot: `<button class="btn" data-no>취소</button><button class="btn dark" data-ok>담기</button>`,
    onMount: (el, close) => {
      contactPicker(el, sel, { onlyEmail: true });
      el.querySelector('[data-no]').onclick = close;
      el.querySelector('[data-ok]').onclick = () => { const n = addRecips([...sel].map(k => { const [lenderId, contactId] = k.split('|'); return { lenderId, contactId }; }), '검색'); close(); toast(`${n}명 담았습니다`); render(); };
    }
  });
};
A['mr-del'] = el => { mail.recips.splice(+el.dataset.i, 1); render(); };
A['mr-clear'] = () => { mail.recips = []; render(); };
C['mr-email'] = el => {
  const r = mail.recips[+el.dataset.i], email = el.value.trim();
  if (!/@/.test(email)) return toast('이메일 형식이 아닙니다', true);
  r.email = email;
  act(async () => {
    if (r.lenderId) await Store.update(r.lenderId, L => { L.contacts = L.contacts || []; let c = L.contacts.find(x => x.cid === r.contactId); if (!c) { c = { cid: uid(), name: r.name || '', title: r.title || '', dept: '', phone: '', email: '', memo: '' }; L.contacts.push(c); r.contactId = c.cid; } c.email = email; return L; });
  }, '담당자 이메일을 저장했습니다');
};
A['mail-next'] = () => { mail.step = 2; render(); };

function mailStep2(tpls) {
  const v = validRecips(); if (mail.pi >= v.length) mail.pi = 0;
  const r = v[mail.pi], p = r ? renderMail(r) : null;
  const total = mail.files.reduce((a, f) => a + f.size, 0);
  return `<div class="split"><div class="card">
      <div class="row2"><div class="field"><label>템플릿</label><select class="input" data-chg="m-tpl"><option value="">직접 쓰기</option>${tpls.map(t => `<option value="${t.id}" ${t.id === mail.tplId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
      <div class="field"><label>&nbsp;</label><div style="display:flex;gap:6px"><button class="btn" data-act="tpl-save">이 내용으로 템플릿 저장</button>${mail.tplId ? '<button class="btn ghost" data-act="tpl-update">템플릿 덮어쓰기</button>' : ''}</div></div></div>
      <div class="field"><label>제목</label><input class="input" id="m-subj" data-inp="m-subj" value="${esc(mail.subject)}"></div>
      <div class="field"><label>본문</label><div class="merge-chips">${['호칭', '기관', '담당자', '직함', '딜명', '보내는사람', '내직함', '내연락처'].map(k => `<button data-act="m-ins" data-k="${k}" type="button">{${k}}</button>`).join('')}<span class="small muted">누르면 커서 자리에 들어갑니다 · 받는 사람마다 바뀝니다</span></div>
        <textarea class="input" id="m-body" data-inp="m-body" style="min-height:280px">${esc(mail.body)}</textarea></div>
      <label class="check"><input type="checkbox" data-chg="m-sig" ${mail.sig ? 'checked' : ''}> 내 서명 붙이기 <a href="#/settings" class="small">(서명 고치기)</a></label>
      <div class="field"><label>첨부 (IM 등) - 이 PC 안에서만 쓰이고 저장소로 올라가지 않습니다</label><input type="file" multiple data-chg="m-files">
        ${mail.files.length ? `<div class="small" style="margin-top:6px">${mail.files.map((f, i) => `📎 ${esc(f.name)} <span class="muted">${(f.size / 1048576).toFixed(1)}MB</span> <a href="#" data-act="m-unfile" data-i="${i}">빼기</a>`).join('<br>')}</div>` : ''}
        ${total > 15 * 1048576 ? '<div class="notice small" style="margin-top:6px">첨부가 15MB 를 넘습니다. 회사 메일 용량 제한에 걸릴 수 있어요.</div>' : ''}</div>
      <div style="display:flex;justify-content:space-between;margin-top:6px"><button class="btn" data-act="mail-step" data-k="1">← 받는 사람</button><button class="btn dark" data-act="mail-next3" ${mail.subject.trim() && mail.body.trim() ? '' : 'disabled'}>다음: 보내기 →</button></div>
    </div>
    <div class="card" style="position:sticky;top:70px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h3 style="margin:0">미리보기</h3><div style="display:flex;gap:4px;align-items:center"><button class="btn sm" data-act="m-prev">‹</button><span class="small muted">${v.length ? mail.pi + 1 : 0} / ${v.length}</span><button class="btn sm" data-act="m-nextp">›</button></div></div>
      ${p ? `<div class="small muted" style="margin-bottom:6px">받는 사람: ${esc(p.toName)} &lt;${esc(p.to)}&gt; (이 사람 한 명만)</div><div class="preview"><div class="subj">${esc(p.subject)}</div><div class="body">${esc(p.text)}</div>${mail.files.length ? `<div class="small muted" style="margin-top:10px">📎 ${mail.files.map(f => esc(f.name)).join(', ')}</div>` : ''}</div>` : '<div class="muted">받는 사람이 없습니다</div>'}
    </div></div>`;
}
let previewT;
const refreshPreview = () => { clearTimeout(previewT); previewT = setTimeout(() => { const v = validRecips(), r = v[mail.pi]; if (!r) return; const p = renderMail(r); const box = $('.preview'); if (box) { $('.subj', box).textContent = p.subject; $('.body', box).textContent = p.text; } const nb = $('[data-act="mail-next3"]'); if (nb) nb.disabled = !(mail.subject.trim() && mail.body.trim()); }, 120); };
I['m-subj'] = el => { mail.subject = el.value; refreshPreview(); };
I['m-body'] = el => { mail.body = el.value; refreshPreview(); };
C['m-sig'] = el => { mail.sig = el.checked; render(); };
C['m-tpl'] = el => { const t = Store.get(el.value); mail.tplId = el.value; if (t) { mail.subject = t.subject; mail.body = t.body; } render(); };
A['m-ins'] = el => {
  const ta = $('#m-body'), tok = `{${el.dataset.k}}`, s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? s;
  ta.value = ta.value.slice(0, s) + tok + ta.value.slice(e); mail.body = ta.value; ta.focus(); ta.setSelectionRange(s + tok.length, s + tok.length); refreshPreview();
};
A['m-prev'] = () => { const n = validRecips().length; if (n) { mail.pi = (mail.pi - 1 + n) % n; render(); } };
A['m-nextp'] = () => { const n = validRecips().length; if (n) { mail.pi = (mail.pi + 1) % n; render(); } };
C['m-files'] = async el => {
  for (const f of el.files) { try { mail.files.push({ name: f.name, size: f.size, b64: await fileToB64(f) }); } catch (e) { toast(`${f.name} 을(를) 읽지 못했습니다`, true); } }
  render();
};
A['m-unfile'] = el => { mail.files.splice(+el.dataset.i, 1); render(); };
A['tpl-save'] = async () => {
  const name = await askText('템플릿 이름', '예: 중도금 대출 태핑'); if (!name) return;
  await act(async () => { const t = await Store.create('tpl', { name, subject: mail.subject, body: mail.body }); mail.tplId = t.id; }, '템플릿을 저장했습니다');
};
A['tpl-update'] = () => { const t = Store.get(mail.tplId); if (t && confirm(`'${t.name}' 템플릿을 지금 내용으로 바꿀까요?`)) act(() => Store.update(t.id, x => ({ ...x, subject: mail.subject, body: mail.body })), '템플릿을 고쳤습니다'); };
A['mail-next3'] = () => { mail.step = 3; mail.sent = {}; mail.logged = false; render(); };

const METHODS = [
  ['outlook-pc', 'Outlook 으로 한 번에 (PC)', '받는 사람마다 한 통씩 Outlook 에서 자동으로 만들어 보냅니다. 첨부 가능'],
  ['eml', '하나씩 · Outlook 창', '한 통씩 Outlook 새 메일 창으로 엽니다. 확인 후 보내기. 첨부 가능'],
  ['owa', '하나씩 · Outlook 웹', 'outlook.office.com 새 메일로 엽니다. 첨부는 직접'],
  ['gmail', '하나씩 · Gmail', 'Gmail 새 메일로 엽니다. 첨부는 직접'],
  ['mailto', '하나씩 · 기본 메일 앱', '휴대폰·PC 기본 메일 앱으로 엽니다. 첨부는 직접'],
];
function mailStep3() {
  const v = validRecips(), m = mail.method, done = Object.keys(mail.sent).length;
  const d = Store.get(mail.dealId);
  const desc = (METHODS.find(x => x[0] === m) || [])[2] || '';
  let body;
  if (m === 'outlook-pc') {
    body = `<ol style="margin:0;padding-left:20px;line-height:2">
      <li><button class="btn dark" data-act="pkg">발송 묶음 내려받기 (${v.length}통)</button> <span class="small muted">.ddmail.json 파일 - 메일 ${v.length}통${mail.files.length ? ' + 첨부' : ''}이 들어 있습니다</span></li>
      <li>처음 한 번만: <a href="tools/Outlook발송.cmd" download="Outlook발송.cmd">Outlook발송.cmd 내려받기</a> → 바탕화면 등에 두세요</li>
      <li><b>Outlook발송.cmd</b> 를 더블클릭 → 내려받기 폴더의 가장 새 묶음을 읽어 보여 줍니다 → <b>S</b> 를 누르면 ${v.length}명에게 한 통씩 보내고, <b>D</b> 면 임시보관함에만 넣습니다</li>
      <li>다 보냈으면 아래 '발송 기록 남기기'</li></ol>
      <div class="small muted" style="margin-top:8px">PC 에 Outlook(데스크톱)이 회사 메일로 로그인돼 있어야 합니다. 보내는 계정은 설정의 내 이메일(${esc(me().email)})과 같은 Outlook 계정을 씁니다.</div>`;
  } else {
    const noAtt = mail.files.length && m !== 'eml';
    body = `${noAtt ? '<div class="notice small" style="margin-bottom:10px">이 방식은 첨부를 자동으로 넣지 못합니다. 열린 메일 창에서 직접 붙이거나, \'하나씩 · Outlook 창\' 을 고르세요.</div>' : ''}
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><button class="btn dark" data-act="send-next" ${done >= v.length ? 'disabled' : ''}>다음 메일 열기 (${Math.min(done + 1, v.length)}/${v.length})</button><span class="small muted">${done}통 열었음</span></div>
      ${v.map((r, i) => { const k = r.email.toLowerCase(); return `<div class="send-row ${mail.sent[k] ? 'done' : ''}"><span class="small muted" style="width:24px">${i + 1}</span><div style="flex:1;min-width:0"><b>${esc(r.org)}</b> ${esc([r.name, r.title].filter(Boolean).join(' '))} <span class="small muted">${esc(r.email)}</span></div>${mail.sent[k] ? '<span class="chip gold">열었음</span>' : ''}<button class="btn sm" data-act="send-one" data-i="${i}">열기</button></div>`; }).join('')}`;
  }
  return `<div class="split"><div class="grid">
    <div class="notice blue">받는 사람 <b>${v.length}명</b>에게 <b>한 명씩 따로</b> 갑니다. 각 메일의 받는 사람 칸에는 그 사람 한 명만 들어가고, 다른 대주 주소는 보이지 않습니다.</div>
    <div class="card"><h3>보내는 방법</h3><div class="chips" style="margin-bottom:8px">${METHODS.map(([k, t]) => `<span class="chip click ${m === k ? 'on' : ''}" data-act="m-method" data-k="${k}">${t}</span>`).join('')}</div><div class="small muted" style="margin-bottom:14px">${esc(desc)}</div>${body}</div>
  </div><div class="grid">
    <div class="card"><h3>발송 기록 남기기</h3>
      ${mail.logged ? `<div class="notice">기록했습니다 ✓ ${d ? `<a href="#/deal/${encodeURIComponent(d.id)}">태핑 보드 보기</a>` : ''}</div><button class="btn" style="margin-top:10px" data-act="mail-reset">새 메일 쓰기</button>` : `
      <div class="small muted" style="margin-bottom:10px">팀 활동에 '메일 발송' 이 남고, 대주별 이력에 보입니다.</div>
      ${d ? `<label class="check"><input type="checkbox" data-chg="m-toboard" ${mail.toBoard ? 'checked' : ''}> ${esc(d.name)} 보드에서 미접촉·태핑 → '자료송부'로</label>
      <label class="check"><input type="checkbox" data-chg="m-addmissing" ${mail.addMissing ? 'checked' : ''}> 보드에 없는 대주는 '자료송부'로 올리기</label>` : '<div class="small muted" style="margin-bottom:10px">딜을 고르지 않아 보드는 건드리지 않습니다.</div>'}
      <button class="btn gold" data-act="mail-log">발송 기록 남기기</button>`}
    </div>
    <div class="card"><h3>보낼 내용</h3><div class="small"><b>${esc(renderMail(v[0] || {}).subject)}</b></div><div class="small muted">${mail.files.length ? '📎 ' + mail.files.map(f => esc(f.name)).join(', ') : '첨부 없음'}</div><button class="btn sm" style="margin-top:8px" data-act="mail-step" data-k="2">← 내용 고치기</button></div>
  </div></div>`;
}
A['m-method'] = el => { mail.method = el.dataset.k; render(); };
C['m-toboard'] = el => { mail.toBoard = el.checked; };
C['m-addmissing'] = el => { mail.addMissing = el.checked; };
A.pkg = () => {
  const v = validRecips(), d = Store.get(mail.dealId), m = me();
  const pkg = { v: 1, app: 'dealdesk', created: new Date().toISOString(), from: m.email, deal: d ? d.name : '', items: v.map(r => { const p = renderMail(r); return { to: p.to, name: p.toName, org: r.org, subject: p.subject, html: p.html }; }), attachments: mail.files.map(f => ({ name: f.name, b64: f.b64 })) };
  const dt = new Date(), stamp = `${String(dt.getFullYear()).slice(2)}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}-${String(dt.getHours()).padStart(2, '0')}${String(dt.getMinutes()).padStart(2, '0')}`;
  download(new Blob([JSON.stringify(pkg)], { type: 'application/json' }), `발송묶음_${(d ? d.name : '메일').replace(/[\\/:*?"<>|\s]+/g, '_')}_${stamp}.ddmail.json`);
  v.forEach(r => mail.sent[r.email.toLowerCase()] = true);
  toast('내려받았습니다. Outlook발송.cmd 를 실행하세요');
};
function openOne(i) {
  const v = validRecips(), r = v[i]; if (!r) return;
  const p = renderMail(r);
  if (mail.method === 'eml') {
    download(makeEml({ to: p.to, toName: p.toName, subject: p.subject, html: p.html, attachments: mail.files }), `${String(i + 1).padStart(2, '0')}_${r.org.replace(/[\\/:*?"<>|]/g, '')}.eml`);
  } else {
    const url = composeUrl(mail.method, { to: p.to, subject: p.subject, text: p.text });
    if (mail.method === 'mailto') { if (url.length > 1900) toast('본문이 길어 일부 메일 앱에서 잘릴 수 있습니다', true); location.href = url; }
    else window.open(url, '_blank', 'noopener');
  }
  mail.sent[r.email.toLowerCase()] = true;
  render();
}
A['send-one'] = el => openOne(+el.dataset.i);
A['send-next'] = () => { const v = validRecips(); const i = v.findIndex(r => !mail.sent[r.email.toLowerCase()]); if (i >= 0) openOne(i); };
A['mail-log'] = async () => {
  const v = validRecips(), d = Store.get(mail.dealId);
  const sentRecips = mail.method === 'outlook-pc' ? v : v.filter(r => mail.sent[r.email.toLowerCase()]);
  if (!sentRecips.length) return toast('아직 연 메일이 없습니다', true);
  if (sentRecips.length < v.length && !confirm(`${v.length}통 가운데 연 ${sentRecips.length}통만 기록할까요?`)) return;
  const subj = renderMail(sentRecips[0]).subject;
  const lids = [...new Set(sentRecips.map(r => r.lenderId).filter(Boolean))];
  await act(async () => {
    if (d) {
      const taps = tapsOf(d.id), byL = new Map(taps.map(t => [t.lenderId, t]));
      if (mail.toBoard) {
        const ids = lids.map(l => byL.get(l)).filter(t => t).map(t => t.id);
        if (ids.length) await Store.updateMany(ids, t => { t.lastTouch = today(); if (['todo', 'tapped'].includes(t.stage)) t.stage = 'sent'; return t; });
      }
      if (mail.addMissing) {
        const miss = lids.filter(l => !byL.has(l));
        if (miss.length) await Store.createMany('tap', miss.map(l => ({ dealId: d.id, lenderId: l, stage: 'sent', amount: '', approved: '', meetDate: '', note: '', internal: '', reason: '', owner: Store.mid, lastTouch: today(), tranche: '' })));
      }
    }
    await Store.create('log', { at: new Date().toISOString(), by: Store.mid, dealId: d ? d.id : '', type: 'mail', lenderIds: lids, lenderId: lids.length === 1 ? lids[0] : '', text: `메일 ${sentRecips.length}통 (개별 발송): ${subj}${mail.files.length ? ' · 첨부 ' + mail.files.map(f => f.name).join(', ') : ''}\n받는 사람: ${sentRecips.map(r => `${r.org}${r.name ? ' ' + r.name : ''}`).join(', ')}` });
    mail.logged = true;
  }, '발송 기록을 남겼습니다');
  render();
};

/* ======================================================================
 * 활동
 * ==================================================================== */
VIEWS.feed = () => {
  const list = logs().filter(l => (!ui.feedDeal || l.dealId === ui.feedDeal) && (!ui.feedWho || l.by === ui.feedWho) && (!ui.feedType || l.type === ui.feedType));
  return `<div class="page-head"><div><h1>활동</h1><div class="sub">팀 전체 기록 ${logs().length}건</div></div></div>
  <div class="toolbar"><select class="input" style="width:auto" data-chg="f-deal"><option value="">모든 딜</option>${deals().map(d => `<option value="${d.id}" ${ui.feedDeal === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
    <select class="input" style="width:auto" data-chg="f-who"><option value="">모든 사람</option>${members().map(m => `<option value="${m.id}" ${ui.feedWho === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
    <select class="input" style="width:auto" data-chg="f-type"><option value="">모든 종류</option>${Object.entries(LOG_TYPES).map(([k, t]) => `<option value="${k}" ${ui.feedType === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
  <div class="card">${feedHtml(list.slice(0, 300))}</div>`;
};
C['f-deal'] = el => { ui.feedDeal = el.value; render(); };
C['f-who'] = el => { ui.feedWho = el.value; render(); };
C['f-type'] = el => { ui.feedType = el.value; render(); };

/* ======================================================================
 * 설정
 * ==================================================================== */
VIEWS.settings = () => {
  const m = me(), admin = canManage(m);
  const tpls = Store.all('tpl');
  return `<div class="page-head"><div><h1>설정</h1><div class="sub">${esc(m.email)} · ${roleName(m.role)}</div></div><div class="actions"><button class="btn" data-act="logout">로그아웃</button></div></div>
  <div class="grid g2">
    <div class="card"><h2>내 정보 · 서명</h2>
      <div class="row2"><div class="field"><label>이름</label><input class="input" id="p-name" value="${esc(m.name || '')}"></div><div class="field"><label>직함</label><input class="input" id="p-title" value="${esc(m.title || '')}"></div></div>
      <div class="row2"><div class="field"><label>부서</label><input class="input" id="p-dept" value="${esc(m.dept || '')}" placeholder="${esc(CFG.TEAM || '')}" data-inp="sigprev"></div><div class="field"><label>휴대폰 (M)</label><input class="input" id="p-phone" value="${esc(m.phone || '')}" placeholder="010-0000-0000" data-inp="sigprev"></div></div>
      <div class="row2"><div class="field"><label>회사 전화 (T)</label><input class="input" id="p-tel" value="${esc(m.tel || '')}" placeholder="02-3774-0000" data-inp="sigprev"></div><div class="field"><label>팩스 (F) <span class="muted">- 비우면 ${esc(CFG.FAX_PREFIX || '')} + 회사 전화 끝 네 자리</span></label><input class="input" id="p-fax" value="${esc(m.fax || '')}" placeholder="자동" data-inp="sigprev"></div></div>
      <div class="field"><label>메일 보내는 방법 (기본)</label><select class="input" id="p-mode">${METHODS.map(([k, t]) => `<option value="${k}" ${(m.mailMode || 'outlook-pc') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label>메일 서명 <span class="muted">- 팀 공통 양식에 위 정보가 자동으로 들어갑니다</span></label><div class="preview" id="sig-prev" style="white-space:pre-wrap;font-size:13px;line-height:1.6">${esc(sigFor(m))}</div>
        <details style="margin-top:6px"><summary class="small muted" style="cursor:pointer">서명을 직접 고치기 (비우면 팀 양식)</summary><textarea class="input" id="p-sig" data-inp="sigprev" style="min-height:120px;margin-top:6px" placeholder="{이름띄움} {내부서} {내직함} {회사} {주소} {회사전화} {내연락처} {팩스} {내이메일} 사용 가능">${esc(m.sigCustom || '')}</textarea></details></div>
      <button class="btn dark" data-act="profile-save">저장</button></div>
    <div class="grid">
      <div class="card"><h2>비밀번호 바꾸기</h2>
        <div class="row2"><div class="field"><label>새 비밀번호 (10자 이상)</label><input class="input" type="password" id="pw1" autocomplete="new-password"></div><div class="field"><label>한 번 더</label><input class="input" type="password" id="pw2" autocomplete="new-password"></div></div>
        <button class="btn" data-act="pw-save">바꾸기</button></div>
      <div class="card"><h2>메일 템플릿</h2>${tpls.map(t => `<div class="pick" style="cursor:default"><div class="grow"><b>${esc(t.name)}</b><div class="small muted">${esc(t.subject)}</div></div><button class="btn sm ghost danger" data-act="tpl-del" data-id="${t.id}">삭제</button></div>`).join('') || '<div class="muted small">없습니다. 메일 쓰기에서 저장하세요.</div>'}</div>
      <div class="card"><h2>대주 기본 목록</h2><div class="small muted" style="margin-bottom:10px">은행·증권·보험·캐피탈·저축은행·상호금융·운용사·공제회 ${Object.values(SEED_LENDERS).flat().length}곳 이름과 유형만 넣습니다. 이미 있는 이름은 건너뜁니다.</div><button class="btn" data-act="seed">기본 대주 목록 불러오기</button></div>
    </div>
  </div>
  ${!MOCK && mockRaw() ? `<div class="card" style="margin-top:16px;border:2px solid var(--gold)"><h2>시험 모드 데이터 가져오기</h2><div class="small muted" style="margin-bottom:10px">이 브라우저에 시험 모드로 넣어 둔 기록(딜 ${mockRaw().deals}건 등)이 남아 있습니다. 시험 때 쓴 이메일·비밀번호로 열어 지금 팀으로 옮깁니다.</div><button class="btn gold" data-act="mock-import">가져오기…</button></div>` : ''}
  ${admin ? `<div class="card" style="margin-top:16px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h2 style="margin:0">팀원 관리</h2><button class="btn dark" data-act="member-add">+ 팀원 등록</button></div>
    <div class="tbl-wrap"><table class="t stack"><thead><tr><th>이름</th><th>직함</th><th>이메일</th><th>권한</th><th>상태</th><th></th></tr></thead><tbody>${members().map(x => `<tr class="row"><td>${avatar(x.id, 1)} <b>${esc(x.name)}</b></td><td>${esc(x.title || '')}</td><td>${esc(x.email)}</td><td>${x.id === Store.mid || x.active === false ? roleName(x.role) : `<select class="cell" style="width:auto;text-align:left" data-chg="member-role" data-id="${x.id}">${ROLES.map(([k, t]) => `<option value="${k}" ${x.role === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`}</td><td>${x.active === false ? '<span class="chip warn">중지</span>' : '<span class="chip gold">사용</span>'}</td><td>${x.id !== Store.mid ? `${x.active === false ? '' : `<button class="btn sm" data-act="member-reset" data-id="${x.id}">비밀번호 재발급</button> <button class="btn sm danger" data-act="member-stop" data-id="${x.id}">사용 중지</button>`}` : ''}</td></tr>`).join('')}</tbody></table></div>
    <div class="small muted" style="margin-top:10px">사용 중지하면 그 사람 비밀번호 꾸러미를 지워 다시 로그인할 수 없습니다.</div></div>
  <div class="card" style="margin-top:16px"><h2>백업</h2><div class="small muted" style="margin-bottom:10px">팀 키를 잃으면(모든 사람이 비밀번호를 잊으면) 데이터를 열 수 없습니다. 팀 키를 안전한 곳에 한 번 보관해 두세요.</div>
    <button class="btn" data-act="show-key">팀 키 보기</button> <button class="btn" data-act="backup">전체 내용 JSON 내려받기</button></div>` : ''}`;
};
const profileForm = () => ({ name: $('#p-name').value.trim(), title: $('#p-title').value.trim(), dept: $('#p-dept').value.trim(), phone: $('#p-phone').value.trim(), tel: $('#p-tel').value.trim(), fax: $('#p-fax').value.trim(), mailMode: $('#p-mode').value, sigCustom: $('#p-sig').value });
I.sigprev = () => { const p = $('#sig-prev'); if (p) p.textContent = sigFor({ ...me(), ...profileForm() }); };
A['profile-save'] = () => act(() => Store.update(Store.mid, m => ({ ...m, ...profileForm() })), '저장했습니다 · 메일 서명에 바로 쓰입니다');
A['pw-save'] = async () => {
  const a = $('#pw1').value, b = $('#pw2').value;
  if (a.length < 10) return toast('10자 이상으로 해 주세요', true);
  if (a !== b) return toast('두 비밀번호가 다릅니다', true);
  await act(async () => { const blob = await wrapTeamKey(a, { k: Store.kB64, mid: Store.mid }); const j = await Store.req({ op: 'keyset', kid: Store.kid, blob }); if (!j.ok) throw new Error(j.error); $('#pw1').value = $('#pw2').value = ''; }, '비밀번호를 바꿨습니다');
};
A['tpl-del'] = el => { if (confirm('템플릿을 지울까요?')) act(() => Store.remove(el.dataset.id), '지웠습니다'); };
A.seed = async () => {
  const have = new Set(lenders().map(L => normName(L.name)));
  const objs = [];
  for (const [type, arr] of Object.entries(SEED_LENDERS)) for (const name of arr) if (!have.has(normName(name))) { have.add(normName(name)); objs.push({ name, type, prefs: '', memo: '', contacts: [] }); }
  if (!objs.length) return toast('이미 다 들어 있습니다');
  await act(() => Store.createMany('lender', objs), `${objs.length}곳을 넣었습니다`);
};
const randPass = () => { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from(crypto.getRandomValues(new Uint8Array(12)), x => a[x % a.length]).join(''); };
async function issueKey(member) {
  const pass = randPass();
  const blob = await wrapTeamKey(pass, { k: Store.kB64, mid: member.id });
  const j = await Store.req({ op: 'keyset', kid: await kidOf(member.email), blob });
  if (!j.ok) throw new Error(j.error);
  modal({ title: '임시 비밀번호', body: `<p><b>${esc(member.name)}</b>님에게 아래 정보를 따로(카톡 등) 전해 주세요. 이 창을 닫으면 다시 볼 수 없습니다.</p><div class="preview" style="font-family:monospace;font-size:14px">주소: ${esc(location.origin + location.pathname)}\n이메일: ${esc(member.email)}\n임시 비밀번호: ${esc(pass)}</div><p class="small muted">첫 로그인 뒤 설정 › 비밀번호 바꾸기를 안내해 주세요.</p>`, foot: `<button class="btn dark" data-copy>복사</button>`, onMount: (el) => { el.querySelector('[data-copy]').onclick = () => copyText(`[딜 데스크]\n주소: ${location.origin + location.pathname}\n이메일: ${member.email}\n임시 비밀번호: ${pass}\n첫 로그인 후 설정에서 비밀번호를 바꿔 주세요.`); } });
}
A['member-add'] = () => {
  modal({
    title: '팀원 등록',
    body: `<div class="row2"><div class="field"><label>이름</label><input class="input" id="n-name"></div><div class="field"><label>직함</label><input class="input" id="n-title"></div></div>
      <div class="field"><label>회사 이메일 (로그인 아이디)</label><input class="input" id="n-email" type="email"></div>
      <div class="row2"><div class="field"><label>휴대폰</label><input class="input" id="n-phone" placeholder="010-0000-0000"></div><div class="field"><label>회사 전화</label><input class="input" id="n-tel" placeholder="02-3774-0000"></div></div>
      <div class="row2"><div class="field"><label>권한</label><select class="input" id="n-role">${ROLES.map(([k, t]) => `<option value="${k}" ${k === 'member' ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
      <div class="small muted">팀장·관리자는 팀원 등록·권한 변경·사용 중지·팀 키 백업을 할 수 있습니다.</div>`,
    foot: `<button class="btn" data-no>취소</button><button class="btn dark" data-ok>등록하고 임시 비밀번호 만들기</button>`,
    onMount: (el, close) => {
      el.querySelector('[data-no]').onclick = close;
      el.querySelector('[data-ok]').onclick = async () => {
        const email = val(el, 'n-email').toLowerCase(), name = val(el, 'n-name');
        if (!name || !/@/.test(email)) return toast('이름과 이메일을 넣어 주세요', true);
        if (members().some(x => x.email === email && x.active !== false)) return toast('이미 등록된 이메일입니다', true);
        await act(async () => {
          const mem = await Store.create('member', { name, title: val(el, 'n-title'), dept: me().dept || CFG.TEAM || '', phone: val(el, 'n-phone'), tel: val(el, 'n-tel'), fax: '', email, role: val(el, 'n-role'), active: true, mailMode: 'outlook-pc', sig: DEFAULT_SIG });
          close(); await issueKey(mem);
        });
      };
    }
  });
};
C['member-role'] = el => { const x = Store.get(el.dataset.id); act(async () => { await Store.update(x.id, v => ({ ...v, role: el.value })); await addLog({ type: 'system', text: `${x.name} 권한 → ${roleName(el.value)}` }); }, `${x.name}님 권한을 ${roleName(el.value)}(으)로 바꿨습니다`); };
A['member-reset'] = el => { const x = Store.get(el.dataset.id); if (confirm(`${x.name}님의 비밀번호를 새로 만들까요? 지금 비밀번호는 더 이상 안 됩니다.`)) act(() => issueKey(x)); };
A['member-stop'] = el => {
  const x = Store.get(el.dataset.id);
  if (!confirm(`${x.name}님을 사용 중지할까요? 다시 로그인할 수 없게 됩니다.`)) return;
  act(async () => { await Store.req({ op: 'keydel', kid: await kidOf(x.email) }); await Store.update(x.id, v => ({ ...v, active: false })); }, '사용 중지했습니다');
};
A['show-key'] = () => modal({ title: '팀 키', body: `<p class="small">이 글자열이 모든 데이터를 여는 열쇠입니다. 비밀번호 관리 앱 등 안전한 곳에만 보관하세요. 채팅·메일로 보내지 마세요.</p><div class="preview" style="font-family:monospace;word-break:break-all">${esc(Store.kB64)}</div>`, foot: `<button class="btn" data-copy>복사</button>`, onMount: el => { el.querySelector('[data-copy]').onclick = () => copyText(Store.kB64, '팀 키를 복사했습니다'); } });
A.backup = () => {
  if (!confirm('복호화된 전체 내용(대주 연락처 포함)을 파일로 내려받습니다. 안전한 곳에 보관해 주세요.')) return;
  const out = {}; for (const r of Store.recs.values()) (out[r.kind] = out[r.kind] || []).push(r.v);
  download(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }), `dealdesk-backup-${today()}.json`);
};

/* ---------- 시험 모드 → 실제 팀으로 옮기기 ----------
 * 시험 모드 기록은 그 브라우저(주소별) localStorage 에 시험 팀 키로 잠겨 있다.
 * 시험 때 이메일·비밀번호로 그 키를 열어 풀고, 지금 팀 키로 다시 잠가 올린다. */
function mockRaw() {
  try {
    if (localStorage.getItem('dealdesk-mock-imported')) return null;
    const db = JSON.parse(localStorage.getItem('dealdesk-mock-store') || 'null');
    if (!db || !db.data) return null;
    const live = Object.values(db.data).filter(r => !r.del);
    if (!live.length) return null;
    return { db, deals: live.filter(r => r.kind === 'deal').length };
  } catch (e) { return null; }
}
A['mock-import'] = () => {
  const raw = mockRaw(); if (!raw) return;
  modal({
    title: '시험 모드 데이터 가져오기',
    body: `<div class="row2"><div class="field"><label>시험 때 이메일</label><input class="input" id="mk-email" type="email"></div><div class="field"><label>시험 때 비밀번호</label><input class="input" id="mk-pass" type="password"></div></div><button class="btn" id="mk-open">열기</button><div id="mk-box" style="margin-top:14px"></div>`,
    foot: `<button class="btn" data-no>취소</button><button class="btn dark" data-ok disabled>선택한 것 옮기기</button>`,
    onMount: (el, close) => {
      let recs = null;
      el.querySelector('[data-no]').onclick = close;
      $('#mk-open', el).onclick = async () => {
        try {
          const blob = raw.db.keys[await kidOf(val(el, 'mk-email').toLowerCase())];
          if (!blob) return toast('시험 모드에 그 이메일 계정이 없습니다', true);
          let p; try { p = await unwrapTeamKey($('#mk-pass', el).value, blob); } catch (e) { return toast('비밀번호가 맞지 않습니다', true); }
          const key = await gcmKey(b64d(p.k));
          recs = {};
          for (const [id, r] of Object.entries(raw.db.data)) { if (r.del) continue; try { (recs[r.kind] = recs[r.kind] || []).push({ ...(await open_(key, r.ct)), id }); } catch (e) { } }
          const ds = recs.deal || [], ls = recs.list || [], have = new Set(deals().map(d => normName(d.name)));
          $('#mk-box', el).innerHTML = `<h3>딜</h3>${ds.map(d => `<label class="pick"><input type="checkbox" class="mk-d" value="${d.id}" ${have.has(normName(d.name)) ? '' : 'checked'}><div class="grow"><b>${esc(d.name)}</b> <span class="small muted">${esc(d.kind || '')} · 대주 ${(recs.tap || []).filter(t => t.dealId === d.id).length}곳${have.has(normName(d.name)) ? ' · 같은 이름 딜이 이미 있음' : ''}</span></div></label>`).join('') || '<div class="small muted">없음</div>'}
            ${ls.length ? `<h3 style="margin-top:12px">대주 리스트</h3>${ls.map(l => `<label class="pick"><input type="checkbox" class="mk-l" value="${l.id}" checked><div class="grow"><b>${esc(l.name)}</b> <span class="small muted">${(l.items || []).length}명</span></div></label>`).join('')}` : ''}
            <div class="small muted" style="margin-top:10px">대주·담당자는 같은 이름 기관에 합쳐 넣고, 활동 기록도 함께 옮깁니다. 작성자는 모두 나로 바뀝니다.</div>`;
          el.querySelector('[data-ok]').disabled = false;
        } catch (e) { toast(e.message || String(e), true); }
      };
      el.querySelector('[data-ok]').onclick = async () => {
        const dSel = new Set($$('.mk-d', el).filter(c => c.checked).map(c => c.value));
        const lSel = new Set($$('.mk-l', el).filter(c => c.checked).map(c => c.value));
        await act(async () => {
          const me_ = Store.mid, ops = [];
          const taps = (recs.tap || []).filter(t => dSel.has(t.dealId));
          const lists = (recs.list || []).filter(l => lSel.has(l.id));
          // 대주: 쓰이는 것 + 담당자가 있는 것만, 같은 이름은 합친다
          const used = new Set([...taps.map(t => t.lenderId), ...lists.flatMap(l => (l.items || []).map(i => i.lenderId))]);
          const byName = new Map(lenders().map(L => [normName(L.name), JSON.parse(JSON.stringify(L))]));
          const lmap = {};
          for (const L of recs.lender || []) {
            if (!used.has(L.id) && !(L.contacts || []).length) continue;
            const ex = matchLender(byName, L.name);
            if (ex) {
              lmap[L.id] = ex.id;
              let changed = false;
              for (const c of L.contacts || []) if (!(ex.contacts || []).some(x => (c.email && x.email === c.email) || (c.name && x.name === c.name))) { (ex.contacts = ex.contacts || []).push(c); changed = true; }
              if (!ex.prefs && L.prefs) { ex.prefs = L.prefs; changed = true; }
              if (changed) ops.push({ kind: 'lender', v: ex, base: (Store.meta(ex.id) || {}).at });
            } else { lmap[L.id] = L.id; byName.set(normName(L.name), L); ops.push({ kind: 'lender', v: L }); }
          }
          const lid = x => lmap[x] || x;
          for (const d of (recs.deal || []).filter(d => dSel.has(d.id))) ops.push({ kind: 'deal', v: { ...d, owners: [me_], createdBy: me_ } });
          for (const t of taps) ops.push({ kind: 'tap', v: { ...t, lenderId: lid(t.lenderId), owner: me_ } });
          for (const l of lists) ops.push({ kind: 'list', v: { ...l, items: (l.items || []).map(i => ({ ...i, lenderId: lid(i.lenderId) })) } });
          const tapIds = new Set(taps.map(t => t.id));
          for (const g of (recs.log || []).filter(g => (g.dealId && dSel.has(g.dealId)) || (g.tapId && tapIds.has(g.tapId))))
            ops.push({ kind: 'log', v: { ...g, by: me_, lenderId: g.lenderId ? lid(g.lenderId) : '', lenderIds: (g.lenderIds || []).map(lid) } });
          for (const t of recs.tpl || []) if (!Store.all('tpl').some(x => x.name === t.name)) ops.push({ kind: 'tpl', v: t });
          await Store.putMany(ops);
          try { localStorage.setItem('dealdesk-mock-imported', new Date().toISOString()); } catch (e) { }
          close(); render();
        }, '시험 모드 데이터를 옮겼습니다');
      };
    }
  });
};

/* ---------- 시작 ---------- */
showGate = (orig => async () => {
  const s = loadSession();
  if (s) { try { await unlock(s); const m = Store.get(s.mid); if (!m || m.active !== false) return startApp(); } catch (e) { console.warn(e); } clearSession(); }
  orig();
})(showGate);
showGate();
