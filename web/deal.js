/* 딜 데스크 - 딜 화면 (머리 요약 · 태핑 보드 · 딜 개요 · 활동) 과 딜 입력 (자료로 자동 채우기) */
'use strict';

const trList = d => (d && d.tranches || []).map(t => typeof t === 'string' ? { name: t, amount: '', rate: '', rank: '' } : t);

/* 딜 칸 정의: [key, 이름, 종류, 묶음, 안내]  종류 text·num·date·area·sel */
const DEAL_SECTIONS = [['basic', '기본'], ['fin', '금융 조건'], ['tr', '트랜치'], ['party', '참여자'], ['biz', '사업 개요'], ['sched', '일정 · 자료 · 메모']];
const DEAL_SPEC = [
  ['name', '딜 이름', 'text', 'basic', '예: 인천 구월동 PF 리파이낸싱'],
  ['kind', '유형', 'sel', 'basic', DEAL_KINDS],
  ['stage', '단계', 'sel', 'basic', DEAL_STAGES],
  ['target', '대출금액 (억원)', 'num', 'fin', '예: 1500'],
  ['rate', '금리', 'text', 'fin', '예: 고정 6.5% / CD+3.0%'],
  ['fee', '취급·주선 수수료', 'text', 'fin', '예: 2.0% 선취'],
  ['allin', 'All-in', 'text', 'fin', '예: 8.5%'],
  ['term', '대출기간', 'text', 'fin', '예: 최초인출일로부터 36개월'],
  ['ltv', 'LTV', 'text', 'fin', '예: 55% (감정가 기준)'],
  ['repay', '상환방법', 'text', 'fin', '예: 만기 일시상환'],
  ['purpose', '자금용도', 'area', 'fin', ''],
  ['security', '채권보전 · 신용보강', 'area', 'fin', '예: 1순위 우선수익권(원금의 130%), 시공사 책임준공·채무인수'],
  ['sponsor', '시행사 (차주)', 'text', 'party', ''],
  ['builder', '시공사', 'text', 'party', '예: 현대건설㈜ (AA-)'],
  ['trustee', '신탁사', 'text', 'party', ''],
  ['arranger', '주관 · 대리금융', 'text', 'party', ''],
  ['guarantor', '연대보증', 'text', 'party', ''],
  ['project', '사업명', 'text', 'biz', ''],
  ['location', '소재지', 'text', 'biz', ''],
  ['scale', '규모', 'text', 'biz', '예: 지하3층~지상32층, 공동주택 1,076세대'],
  ['landArea', '대지면적', 'text', 'biz', ''],
  ['gfa', '연면적', 'text', 'biz', ''],
  ['totalCost', '총사업비', 'text', 'biz', ''],
  ['drawdown', '인출 예정', 'text', 'sched', '예: 2026년 12월 중'],
  ['committeeDue', '대주 심의 목표일', 'date', 'sched', ''],
  ['due', '기표 목표일', 'date', 'sched', ''],
  ['terms', '기타 조건', 'area', 'sched', '조기상환·인출선행조건 등 메모'],
  ['memo', '메모', 'area', 'sched', ''],
];
const SPEC = Object.fromEntries(DEAL_SPEC.map(s => [s[0], s]));

/* ---------- 딜 입력 창 ---------- */
function dealForm(d, focus, file, opts = {}) {
  const isNew = !d;
  const pending = [];   // 이 창에서 읽은 파일 - 저장할 때 딜 자료로 올린다 (이미 올라간 파일은 빼고)
  d = d ? JSON.parse(JSON.stringify(d)) : { stage: '태핑', kind: '브릿지론', owners: [Store.mid], tranches: [], docs: [] };
  let trs = trList(d), docs = (d.docs || []).slice(), srcMap = { ...(d.src || {}) };
  const input = ([k, label, type, , ph]) => {
    const v = d[k] ?? '';
    const ctl = type === 'sel' ? `<select class="input" id="f-${k}">${ph.map(o => `<option ${v === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`
      : type === 'area' ? `<textarea class="input" id="f-${k}" style="min-height:64px" placeholder="${esc(ph)}">${esc(v)}</textarea>`
      : `<input class="input" id="f-${k}" ${type === 'num' ? 'inputmode="decimal"' : ''} ${type === 'date' ? 'type="date"' : ''} value="${esc(v)}" placeholder="${esc(ph || '')}">`;
    return `<div class="field ${type === 'area' ? 'span2' : ''}" data-k="${k}"><label>${label}<span class="auto-tag hide">자료</span></label>${ctl}<div class="sugg hide"></div></div>`;
  };
  const sec = (key, title, extra = '') => `<section class="fsec" id="fs-${key}"><h3>${title}</h3>${extra}<div class="fgrid">${DEAL_SPEC.filter(s => s[3] === key).map(input).join('')}</div></section>`;
  const trHtml = () => `<table class="t tr-edit"><thead><tr><th>트랜치</th><th>금액(억)</th><th>금리</th><th>순위</th><th></th></tr></thead><tbody>${trs.map((t, i) => `<tr><td><input class="cell" style="width:110px;text-align:left" data-tr="${i}" data-f="name" value="${esc(t.name)}" placeholder="Tr.A"></td><td><input class="cell" data-tr="${i}" data-f="amount" value="${esc(t.amount ?? '')}" inputmode="decimal"></td><td><input class="cell" style="width:120px;text-align:left" data-tr="${i}" data-f="rate" value="${esc(t.rate || '')}"></td><td><select class="cell" style="width:auto" data-tr="${i}" data-f="rank">${['', '선순위', '중순위', '후순위'].map(o => `<option ${t.rank === o ? 'selected' : ''}>${o}</option>`).join('')}</select></td><td><button class="btn sm ghost" data-trdel="${i}">빼기</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted small">트랜치가 하나면 비워 두세요</td></tr>'}</tbody></table><button class="btn sm" id="tr-add" style="margin-top:8px">+ 트랜치</button>`;

  modal({
    title: isNew ? '새 딜' : '딜 정보', wide: true,
    body: `<div class="drop" id="f-drop"><b>IM · 텀싯 · 사업개요 파일을 여기에 끌어다 놓으세요</b><div class="small muted">PDF · 워드 · 엑셀. 이 PC 브라우저 안에서만 읽고 어디에도 올리지 않습니다. 빈 칸만 채우고, 이미 적힌 칸은 '자료 값'을 옆에 보여 줍니다.</div><label class="btn sm" style="margin-top:8px">파일 고르기<input type="file" id="f-file" accept=".pdf,.docx,.xlsx,.xlsm,.txt" hidden></label><div class="small" id="f-status" style="margin-top:6px"></div></div>
      ${sec('basic', '기본', '')}
      <div class="fgrid"><div class="field span2"><label>담당</label><div class="chips">${members().filter(m => m.active !== false).map(m => `<label class="chip click"><input type="checkbox" class="f-owner" value="${m.id}" ${(d.owners || []).includes(m.id) ? 'checked' : ''}> ${esc(m.name)}</label>`).join('')}</div></div></div>
      ${sec('fin', '금융 조건')}
      <section class="fsec" id="fs-tr"><h3>트랜치</h3><div id="tr-box">${trHtml()}</div></section>
      ${sec('party', '참여자')}${sec('biz', '사업 개요')}${sec('sched', '일정 · 자료 · 메모')}
      <div class="field"><label>자료 링크 (한 줄에 하나: 이름 | 주소)</label><textarea class="input" id="f-docs" style="min-height:56px" placeholder="IM 대주용 | https://...">${esc(docs.filter(x => x.url).map(x => x.name + ' | ' + x.url).join('\n'))}</textarea></div>`,
    foot: `${isNew ? '' : '<button class="btn danger" data-del style="margin-right:auto">딜 삭제</button>'}<button class="btn" data-no>취소</button><button class="btn dark" data-ok>${isNew ? '만들기' : '저장'}</button>`,
    onMount: (el, close) => {
      const box = $('#tr-box', el);
      const readTr = () => { $$('[data-tr]', el).forEach(x => { const t = trs[+x.dataset.tr]; if (t) t[x.dataset.f] = x.dataset.f === 'amount' ? (x.value.trim() === '' ? '' : num(x.value)) : x.value.trim(); }); };
      const drawTr = () => { box.innerHTML = trHtml(); $('#tr-add', el).onclick = () => { readTr(); trs.push({ name: 'Tr.' + 'ABCDEFG'[trs.length], amount: '', rate: '', rank: '' }); drawTr(); }; $$('[data-trdel]', el).forEach(b => b.onclick = () => { readTr(); trs.splice(+b.dataset.trdel, 1); drawTr(); }); };
      drawTr();
      if (focus) setTimeout(() => { const s = $('#fs-' + focus, el); if (s) s.scrollIntoView({ block: 'start' }); }, 50);

      /* 자료 → 칸 채우기 */
      const fill = async f => {
        const st = $('#f-status', el);
        st.textContent = `${f.name} 읽는 중…`;
        try {
          const r = await fileLines(f, (p, n) => { st.textContent = `${f.name} 읽는 중… ${p}/${n}쪽`; });
          if (!r.lines.length) { st.innerHTML = '<span style="color:var(--red)">글자를 찾지 못했습니다. 그림으로 된(스캔·이미지) PDF 같습니다. 원본 워드나 글자 있는 PDF 를 넣어 주세요.</span>'; return; }
          const x = extractDeal(r.lines, f.name);
          const vals = { ...x.fields };
          if (x.target != null) vals.target = x.target;
          if (x.kind) vals.kind = x.kind;
          if (x.name) vals.name = x.name;
          // 짧은 값으로 다듬기: 금리·기간·LTV·All-in 은 숫자 부분, 시공사는 첫 마디
          for (const k of ['rate', 'term', 'ltv', 'allin']) if (vals[k] && vals[k].length > 40 && vals[k + 'Short']) vals[k] = vals[k + 'Short'];
          let filled = 0, sugg = 0;
          for (const [k] of DEAL_SPEC) {
            if (vals[k] == null || vals[k] === '') continue;
            const ctl = $('#f-' + k, el); if (!ctl) continue;
            const fld = ctl.closest('.field');
            const cur = ctl.value.trim(), nv = String(vals[k]);
            if (k === 'stage') continue;
            if (!cur || (k === 'kind' && isNew && !d._kindTouched)) {
              ctl.value = nv; fld.classList.add('filled'); fld.querySelector('.auto-tag').classList.remove('hide'); srcMap[k] = f.name; filled++;
            } else if (cur !== nv && normLabel(cur) !== normLabel(nv)) {
              const sg = fld.querySelector('.sugg'); sg.classList.remove('hide'); sugg++;
              sg.innerHTML = `자료: ${esc(nv.length > 120 ? nv.slice(0, 120) + '…' : nv)} <button class="btn sm ghost" type="button">이걸로 바꾸기</button>`;
              sg.querySelector('button').onclick = () => { ctl.value = nv; sg.classList.add('hide'); fld.classList.add('filled'); srcMap[k] = f.name; };
            }
          }
          if (x.tranches.length && (!trs.length || trs.every(t => !t.name))) { readTr(); trs = x.tranches.map(t => ({ name: t.name, amount: t.amount || '', rate: t.rate || '', rank: t.rank || '' })); drawTr(); filled++; }
          const already = (opts.stored && f === file) || (d.files || []).some(x => x.name === f.name && x.size === f.size);
          if (!already && !pending.some(p => p.name === f.name)) pending.push(f);
          st.innerHTML = `<b style="color:var(--green)">✓ ${filled}개 칸을 채웠습니다</b>${sugg ? ` · 이미 적힌 ${sugg}칸은 자료 값을 옆에 표시했습니다` : ''} <span class="muted">(${r.lines.length}줄 읽음 · 금빛 칸을 확인하고 저장하세요${pending.length ? ` · 저장하면 ${pending.map(p => p.name).join(', ')} 이(가) 딜 자료로 올라갑니다` : ''})</span>`;
        } catch (e) { console.error(e); st.innerHTML = `<span style="color:var(--red)">${esc(e.message || String(e))}</span>`; }
      };
      $('#f-kind', el).addEventListener('change', () => { d._kindTouched = true; });
      $('#f-file', el).onchange = e => { const f = e.target.files[0]; if (f) fill(f); };
      const drop = $('#f-drop', el);
      ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
      ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
      drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) fill(f); });
      el.addEventListener('dragover', e => e.preventDefault());
      el.addEventListener('drop', e => { e.preventDefault(); if (!drop.contains(e.target)) { const f = e.dataTransfer.files[0]; if (f) fill(f); } });
      if (file) fill(file);

      el.querySelector('[data-no]').onclick = close;
      const del = el.querySelector('[data-del]');
      if (del) del.onclick = async () => {
        const n = tapsOf(d.id).length;
        if (!confirm(`'${d.name}' 딜을 지울까요?\n태핑 보드의 대주 ${n}곳도 같이 지워집니다. (활동 기록은 남습니다)`)) return;
        await act(async () => { for (const t of tapsOf(d.id)) await Store.remove(t.id); await Store.remove(d.id); close(); location.hash = '#/deals'; }, '지웠습니다');
      };
      el.querySelector('[data-ok]').onclick = async () => {
        readTr();
        const v = {};
        for (const [k, , type] of DEAL_SPEC) { const x = val(el, 'f-' + k); v[k] = type === 'num' ? (x === '' ? '' : num(x)) : x; }
        if (!v.name) return toast('딜 이름을 적어 주세요', true);
        v.tranches = trs.filter(t => t.name);
        const links = val(el, 'f-docs').split('\n').map(l => l.split('|').map(s => s.trim())).filter(p => p[0]).map(p => ({ name: p[1] ? p[0] : p[0].slice(0, 40), url: p[1] || p[0] }));
        v.docs = [...docs.filter(x => !x.url), ...links];
        v.owners = $$('.f-owner', el).filter(c => c.checked).map(c => c.value);
        v.src = srcMap;
        // 읽은 파일을 딜 자료로 올린다 - 저장소가 아직 첨부를 모르면 딜은 저장하고 알려만 준다
        const storePending = async id => {
          if (!pending.length) return;
          try { await uploadDealFiles(id, pending, { offerFill: false }); }
          catch (e) { await Store.update(id, x => { x.docs = [...(x.docs || []), ...pending.filter(p => !(x.docs || []).some(dc => dc.name === p.name)).map(p => ({ name: p.name, url: '', at: today(), auto: true }))]; return x; }).catch(() => { }); toast('딜은 저장했지만 파일은 못 올렸습니다: ' + e.message, true); }
        };
        await act(async () => {
          if (isNew) {
            const nd = await Store.create('deal', { ...v, createdAt: new Date().toISOString(), createdBy: Store.mid });
            await addLog({ dealId: nd.id, type: 'system', text: `새 딜 등록 (${v.kind}${v.target ? ', ' + fmt(v.target) + '억' : ''})${Object.keys(srcMap).length ? ' · 자료 자동 입력: ' + [...new Set(Object.values(srcMap))].join(', ') : ''}` });
            close(); location.hash = '#/deal/' + encodeURIComponent(nd.id);
            await storePending(nd.id);
            return;
          } else {
            const before = Store.get(d.id) || {};
            await Store.update(d.id, x => ({ ...x, ...v }));
            const changed = DEAL_SPEC.filter(([k]) => String(before[k] ?? '') !== String(v[k] ?? '')).map(s => s[1]);
            if (before.stage !== v.stage) await addLog({ dealId: d.id, type: 'stage', text: `딜 단계 ${before.stage} → ${v.stage}` });
            else if (changed.length) await addLog({ dealId: d.id, type: 'system', text: `딜 정보 수정: ${changed.slice(0, 6).join(', ')}${changed.length > 6 ? ' 외' : ''}` });
            close();
            await storePending(d.id);
          }
        }, isNew ? '딜을 만들었습니다' : '저장했습니다');
      };
    }
  });
}

/* ---------- 딜 자료 파일 (팀 공용, 팀 키로 암호화해 드라이브에) ---------- */
const MAX_FILE = 40 * 1048576;
const fmtSize = n => n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB';
const canFill = f => /\.(pdf|docx|xlsx|xlsm)$/i.test(f.name || '');
async function uploadDealFiles(dealId, files, { offerFill = true } = {}) {
  files = Array.from(files).filter(f => { if (f.size > MAX_FILE) { toast(`${f.name}: 40MB 를 넘어 올릴 수 없습니다`, true); return false; } return true; });
  if (!files.length) return [];
  const metas = [];
  for (const f of files) metas.push(await Store.putFile(f, (i, n) => toast(`${f.name} 올리는 중… ${n > 1 ? Math.round(i / n * 100) + '%' : ''}`)));
  await Store.update(dealId, d => { d.files = [...(d.files || []), ...metas]; d.docs = (d.docs || []).filter(x => x.url || !metas.some(m => m.name === x.name)); return d; });
  await addLog({ dealId, type: 'system', text: `자료 올림: ${metas.map(m => m.name).join(', ')}` });
  toast(`${metas.length}개 파일을 올렸습니다 · 팀원 모두 내려받을 수 있습니다`);
  const ff = files.find(canFill);
  if (offerFill && ff && confirm(`'${ff.name}' 내용으로 딜 정보의 빈 칸을 채울까요?\n(채운 칸을 확인한 뒤 저장합니다)`)) dealForm(Store.get(dealId), null, ff, { stored: true });
  return metas;
}
function pickFiles(cb, multiple = true) { const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = multiple; inp.onchange = () => { if (inp.files.length) cb(inp.files); }; inp.click(); }
A['file-up'] = el => pickFiles(fs => act(() => uploadDealFiles(el.dataset.id, fs)));
A['file-get'] = el => {
  const d = Store.get(el.dataset.id), m = (d.files || []).find(x => x.fid === el.dataset.fid); if (!m) return;
  act(async () => { const bytes = await Store.getFile(m, (i, n) => n > 1 && toast(`${m.name} 받는 중… ${Math.round(i / n * 100)}%`)); download(new Blob([bytes], { type: m.type || 'application/octet-stream' }), m.name); });
};
A['file-del'] = el => {
  const d = Store.get(el.dataset.id), m = (d.files || []).find(x => x.fid === el.dataset.fid); if (!m) return;
  if (!confirm(`'${m.name}' 을(를) 지울까요? 팀원 모두에게서 사라집니다.`)) return;
  act(async () => { await Store.delFile(m.fid); await Store.update(d.id, x => { x.files = (x.files || []).filter(f => f.fid !== m.fid); return x; }); await addLog({ dealId: d.id, type: 'system', text: `자료 지움: ${m.name}` }); }, '지웠습니다');
};
A['file-fill'] = el => {
  const d = Store.get(el.dataset.id), m = (d.files || []).find(x => x.fid === el.dataset.fid); if (!m) return;
  act(async () => { const bytes = await Store.getFile(m); dealForm(d, null, new File([bytes], m.name, { type: m.type }), { stored: true }); });
};

/* 딜 화면에 파일을 떨어뜨리면 → 자료로 올리고(팀 공용) 그 파일로 빈 칸 채울지 묻는다.
 * 딜 목록·홈에 떨어뜨리면 → 새 딜 창에서 자동 채우기(저장할 때 자료로 올라감) */
document.addEventListener('dragover', e => { if (['deal', 'deals', 'home'].includes(route().name)) e.preventDefault(); });
document.addEventListener('drop', e => {
  if ($('.scrim')) return;
  const r = route(), fs = e.dataTransfer && e.dataTransfer.files;
  if (!fs || !fs.length) return;
  e.preventDefault();
  if (r.name === 'deal' && Store.get(r.arg)) act(() => uploadDealFiles(r.arg, fs));
  else if (r.name === 'deals' || r.name === 'home') dealForm(null, null, fs[0]);
});

/* ======================================================================
 * 딜 화면
 * ==================================================================== */
/* ---------- 이 딜의 대주 측 검토 담당자 ----------
 * tap.contactIds 에 지정한 사람. 지정이 없으면 그 대주 첫 담당자를 흐리게 (짐작) 보여 준다. */
function tapContacts(t) {
  const cs = ((Store.get(t.lenderId) || {}).contacts) || [], ids = t.contactIds || [];
  const sel = cs.filter(c => ids.includes(c.cid));
  return { all: cs, sel, shown: sel.length ? sel : cs.slice(0, 1), guess: !sel.length && cs.length > 0, more: sel.length ? 0 : Math.max(0, cs.length - 1) };
}
function contactChips(t, plain) {
  const x = tapContacts(t);
  if (!x.all.length) return plain ? '' : `<button class="btn sm ghost" data-act="tap-contacts" data-id="${t.id}">+ 담당자</button>`;
  if (plain) return x.shown.map(c => [c.name, c.title].filter(Boolean).join(' ')).join(', ') + (x.more ? ` 외 ${x.more}` : '');
  return x.shown.map(c => `<span class="pchip${x.guess ? ' guess' : ''}" data-act="contact-pop" data-tap="${t.id}" data-cid="${c.cid}" title="${x.guess ? '검토 담당자 미지정 - 대주 첫 담당자' : '이 딜 검토 담당자'}">${esc(c.name || c.email || '(이름 없음)')}${c.title ? ` <em>${esc(c.title)}</em>` : ''}</span>`).join('') + (x.more ? `<span class="pchip more" data-act="tap-contacts" data-id="${t.id}">+${x.more}</span>` : '');
}
// 담당자 상세
A['contact-pop'] = (el, e) => {
  if (e) e.stopPropagation();
  const t = Store.get(el.dataset.tap); if (!t) return;
  const L = Store.get(t.lenderId) || {}, c = (L.contacts || []).find(x => x.cid === el.dataset.cid); if (!c) return;
  const assigned = (t.contactIds || []).includes(c.cid);
  modal({
    title: `${c.name || ''} ${c.title || ''}`.trim() || '담당자',
    body: `<dl class="kv2"><dt>기관</dt><dd>${esc(L.name || '')}</dd>${c.dept ? `<dt>부서</dt><dd>${esc(c.dept)}</dd>` : ''}
      <dt>휴대폰</dt><dd>${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : '<span class="muted">-</span>'}</dd>
      <dt>이메일</dt><dd>${c.email ? esc(c.email) : '<span class="muted">-</span>'}</dd>${c.memo ? `<dt>메모</dt><dd>${esc(c.memo)}</dd>` : ''}
      <dt>이 딜</dt><dd>${assigned ? '<span class="chip gold">검토 담당자</span>' : '<span class="muted">검토 담당자로 지정되지 않음 (대주 첫 담당자라 표시)</span>'}</dd></dl>
      ${(L.contacts || []).length > 1 ? `<div class="small muted" style="margin-top:10px">${esc(L.name)} 담당자 ${(L.contacts || []).length}명 · '담당자 바꾸기'에서 이 딜 담당을 고르세요</div>` : ''}`,
    foot: `<button class="btn" data-edit style="margin-right:auto">정보 수정</button><button class="btn" data-pick>담당자 바꾸기</button>${c.email ? '<button class="btn dark" data-mail>메일 쓰기</button>' : ''}`,
    onMount: (m, close) => {
      m.querySelector('[data-edit]').onclick = () => { close(); contactForm(L.id, c); };
      m.querySelector('[data-pick]').onclick = () => { close(); A['tap-contacts']({ dataset: { id: t.id } }); };
      const ml = m.querySelector('[data-mail]'); if (ml) ml.onclick = () => { close(); closeDrawer(); goMail({ dealId: t.dealId, items: [{ lenderId: L.id, contactId: c.cid }], src: '대주' }); };
    }
  });
};
// 이 딜 검토 담당자 고르기 (여러 명 가능) + 새 담당자
A['tap-contacts'] = (el, e) => {
  if (e) e.stopPropagation();
  const t = Store.get(el.dataset.id); if (!t) return;
  const L = Store.get(t.lenderId) || {}, ids = new Set(t.contactIds || []);
  modal({
    title: `검토 담당자 · ${L.name || ''}`,
    body: `<p class="small muted" style="margin-top:0">${esc(dname(t.dealId))} 건을 이 대주에서 검토하는 사람을 고르세요. 여러 명 가능합니다. 태핑 보드에서 메일을 담을 때 이 사람들에게만 갑니다.</p>
      <div class="pick-list">${(L.contacts || []).map(c => `<label class="pick"><input type="checkbox" value="${c.cid}" ${ids.has(c.cid) ? 'checked' : ''}><div class="grow"><b>${esc(c.name || '(이름 없음)')}</b> <span class="muted small">${esc([c.title, c.dept].filter(Boolean).join(' · '))}</span></div><span class="small muted">${esc(c.phone || '')}${c.phone && c.email ? ' · ' : ''}${esc(c.email || '')}</span></label>`).join('') || '<div class="empty">등록된 담당자가 없습니다</div>'}</div>
      <button class="btn sm" data-new style="margin-top:10px">+ 새 담당자 등록</button>`,
    foot: `<button class="btn" data-no>취소</button><button class="btn dark" data-ok>저장</button>`,
    onMount: (m, close) => {
      m.querySelector('[data-no]').onclick = close;
      m.querySelector('[data-new]').onclick = () => { close(); contactForm(L.id, null, nc => act(() => Store.update(t.id, v => { v.contactIds = [...(v.contactIds || []), nc.cid]; return v; }), `${nc.name || '새 담당자'}님을 이 딜 검토 담당자로 지정했습니다`)); };
      m.querySelector('[data-ok]').onclick = () => {
        const sel = $$('input[type=checkbox]', m).filter(x => x.checked).map(x => x.value);
        act(async () => { await Store.update(t.id, v => { v.contactIds = sel; return v; }); close(); }, '저장했습니다');
      };
    }
  });
};

function stageSelect(t, cls = 'stage') {
  return `<select class="${cls}" data-chg="stage" data-id="${t.id}" style="background-color:${STAGE[t.stage].c}">${STAGES.map(s => `<option value="${s.k}" ${s.k === t.stage ? 'selected' : ''}>${s.t}</option>`).join('')}</select>`;
}
const short = (s, n = 26) => { s = String(s || ''); const m = s.match(/^[^·(/\n]+/); s = (m ? m[0] : s).trim(); return s.length > n ? s.slice(0, n) + '…' : s; };
const pctOf = (s, n = 30) => { const m = String(s || '').match(/(\d+(?:\.\d+)?)\s*%/); return m ? m[1] + '%' : short(s, n); };
const ymOf = s => { const m = String(s || '').match(/(20)?(\d{2})\s*[년.\-/]\s*(\d{1,2})/); return m ? `${m[2]}.${m[3].padStart(2, '0')}` : short(s, 10); };
const monthsOf = s => { const m = String(s || '').match(/(\d+)\s*개월/); return m ? m[1] + '개월' : short(s, 14); };
function bullets(s) {
  s = String(s || '').trim(); if (!s) return '';
  const parts = s.split(/\s·\s|\s\/\s|\n|(?:^|\s)(?=\d\.\s)|(?:^|\s)-\s/).map(x => x.trim()).filter(Boolean);
  return parts.length > 1 ? `<ul class="bl">${parts.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : `<div style="white-space:pre-wrap">${esc(s)}</div>`;
}

VIEWS.deal = id => {
  const d = Store.get(id);
  if (!d) return `<div class="card empty"><b>딜을 찾을 수 없습니다</b><a href="#/deals">딜 목록으로</a></div>`;
  const taps = tapsOf(id), s = sums(taps), tgt = num(d.target), t0 = today();
  const base = Math.max(tgt, s.approved + s.committee + s.review) || 1, w = v => (v / base * 100).toFixed(1) + '%';
  const tab = ui.dealTab || 'board';
  const dealLogs = logsFor(l => l.dealId === id);
  const fill = tgt ? Math.round(s.approved / tgt * 100) : null;
  const tile = (label, value, sub, cls = '') => `<div class="tile ${cls}"><div class="l">${label}</div><div class="v">${value || '<span class="muted">-</span>'}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
  const dueD = d.due ? daysBetween(t0, d.due) : null;
  const parties = [['시행', d.sponsor], ['시공', d.builder], ['신탁', d.trustee], ['소재', d.location]].filter(x => x[1]);

  const head = `<div class="page-head" style="margin-bottom:12px"><div><div class="small muted"><a href="#/deals">딜</a> ›</div><h1>${esc(d.name)}</h1>
      <div class="chips" style="margin-top:6px"><span class="chip">${esc(d.kind || '')}</span><span class="chip gold">${esc(d.stage || '')}</span>${(d.owners || []).map(o => `<span class="chip">${esc(mname(o))}</span>`).join('')}</div></div>
    <div class="actions"><button class="btn" data-act="kakao" data-id="${id}">카톡 보고</button><button class="btn" data-act="export" data-id="${id}">엑셀</button><button class="btn" data-act="mail-deal" data-id="${id}">메일 쓰기</button><button class="btn" data-act="cost-open" data-id="${id}">비용표${costsOf(id).length ? ` <span class="muted small">${pct(calcCost(costsOf(id)[0]).allin)}</span>` : ''}</button><button class="btn dark" data-act="tap-add" data-id="${id}">+ 대주 추가</button></div></div>
  <div class="card deal-sum">
    <div class="tiles">
      ${tile('대출금액', tgt ? fmt(tgt) + '<small>억</small>' : '', trList(d).length > 1 ? trList(d).map(t => `${esc(t.name)} ${fmt(num(t.amount)) || '-'}`).join(' · ') : '', 'dark')}
      ${tile('금리', esc(pctOf(d.rate)), d.allin ? 'All-in ' + esc(pctOf(d.allin)) : (d.fee ? '수수료 ' + esc(pctOf(d.fee)) : ''))}
      ${tile('대출기간', esc(monthsOf(d.term)), esc(short(d.repay, 18)))}
      ${tile('LTV', esc(pctOf(d.ltv)), '')}
      ${d.due || !d.drawdown ? tile('기표 목표', d.due ? shortDate(d.due) : '', dueD != null ? (dueD >= 0 ? 'D-' + dueD : `${-dueD}일 지남`) : '') : tile('인출 예정', esc(ymOf(d.drawdown)), esc(short(d.drawdown, 18)))}
      ${tile('모집', fill != null ? fill + '<small>%</small>' : (s.approved ? fmt(s.approved) + '<small>억</small>' : ''), `승인 ${fmt(s.approved) || 0} · 심의 ${fmt(s.committee) || 0} · 검토 ${fmt(s.review) || 0}`)}
    </div>
    <div class="bar" style="height:8px;margin-top:14px"><span style="width:${w(s.approved)};background:var(--green)"></span><span style="width:${w(s.committee)};background:#a052d6"></span><span style="width:${w(s.review)};background:var(--amber)"></span></div>
    <div class="parties">${parties.length ? parties.map(([k, v]) => `<span><em>${k}</em>${esc(short(v, 34))}</span>`).join('') : '<span class="muted small">시행·시공·신탁 정보가 없습니다 - 딜 개요에서 채우거나 IM 파일을 이 화면에 끌어다 놓으세요</span>'}</div>
  </div>
  <div class="tabs">${[['board', `태핑 보드 <b>${taps.length}</b>`], ['info', '딜 개요'], ['act', `대화 ${unreadOf(id).length ? unreadBadge(unreadOf(id).length) : `<b>${msgsOf(id).length}</b>`}`]].map(([k, t]) => `<button class="${tab === k ? 'on' : ''}" data-act="deal-tab" data-k="${k}">${t}</button>`).join('')}
    ${tab === 'board' && !isPhone() ? `<button class="dock-btn${ui.chatDock ? ' on' : ''}" data-act="chat-dock" title="보드 옆에 대화 열기">💬 옆에 대화${unreadOf(id).length ? ' ' + unreadBadge(unreadOf(id).length) : ''}</button>` : ''}</div>`;

  if (tab === 'info') return head + dealInfo(d, taps);
  if (tab === 'act') return head + `<div class="card chat-card">${chatHtml(id)}</div>`;
  if (ui.chatDock && !isPhone()) return head + `<div class="with-chat"><div style="min-width:0">${dealBoard(d, taps)}</div>${chatHtml(id, true)}</div>`;
  return head + dealBoard(d, taps);
};
A['deal-tab'] = el => { ui.dealTab = el.dataset.k; render(); };
A['deal-sec'] = el => dealForm(Store.get(el.dataset.id), el.dataset.sec);
A['deal-file'] = el => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.pdf,.docx,.xlsx,.xlsm,.txt'; inp.onchange = () => { if (inp.files[0]) dealForm(Store.get(el.dataset.id), null, inp.files[0]); }; inp.click(); };

function dealInfo(d, taps) {
  const kv = rows => { const r = rows.filter(x => x[1] !== '' && x[1] != null); return r.length ? `<dl class="kv2">${r.map(([k, v, raw]) => `<dt>${k}</dt><dd>${raw ? v : esc(v)}</dd>`).join('')}</dl>` : '<div class="muted small">아직 없습니다</div>'; };
  const card = (title, sec, body) => `<div class="card"><div class="card-h"><h2>${title}</h2><button class="btn sm ghost" data-act="deal-sec" data-id="${d.id}" data-sec="${sec}">수정</button></div>${body}</div>`;
  const tr = trList(d);
  const trRows = (tr.length ? tr : [{ name: '전체', amount: d.target }]).map(t => {
    const ts = tr.length ? taps.filter(x => x.tranche === t.name) : taps;
    const s = sums(ts), a = num(t.amount);
    return `<tr><td><b>${esc(t.name)}</b>${t.rank ? ` <span class="muted small">${esc(t.rank)}</span>` : ''}</td><td class="num" data-l="목표">${fmt(a)}</td><td data-l="금리">${esc(t.rate || '')}</td><td class="num" data-l="승인" style="color:var(--green)">${fmt(s.approved)}</td><td class="num" data-l="심의">${fmt(s.committee)}</td><td class="num" data-l="검토">${fmt(s.review)}</td><td class="num" data-l="남은"><b>${a ? fmt(Math.max(0, a - s.approved)) : ''}</b></td><td style="min-width:90px"><div class="bar"><span style="width:${a ? Math.min(100, s.approved / a * 100) : 0}%;background:var(--green)"></span><span style="width:${a ? Math.min(100, s.committee / a * 100) : 0}%;background:#a052d6"></span></div></td></tr>`;
  }).join('');
  const unassigned = tr.length ? taps.filter(x => !x.tranche && x.stage !== 'declined').length : 0;
  const docs = (d.docs || []);
  const t0 = today();
  const meets = taps.filter(t => t.meetDate && t.stage !== 'declined').sort((a, b) => a.meetDate.localeCompare(b.meetDate));
  // 자료: 팀 공용 파일(내려받기·지우기·이 파일로 채우기) + 링크 + 예전 '자동 입력에 쓴 파일' 이름 + 기타 조건·메모
  const files = (d.files || []).slice().sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const filesCard = `<div class="card files-card" style="grid-column:1/-1"><div class="card-h"><h2>자료 · 메모 <span class="muted small">대주 송부 자료 등 - 팀원 누구나 내려받기</span></h2><div style="display:flex;gap:6px"><button class="btn sm ghost" data-act="deal-sec" data-id="${d.id}" data-sec="sched">링크·메모 수정</button><button class="btn sm dark" data-act="file-up" data-id="${d.id}">+ 파일 올리기</button></div></div>
    ${files.length ? `<div class="flist">${files.map(m => `<div class="frow"><span class="ficon">${/\.pdf$/i.test(m.name) ? 'PDF' : /\.docx?$/i.test(m.name) ? 'DOC' : /\.xls/i.test(m.name) ? 'XLS' : /\.hwp/i.test(m.name) ? 'HWP' : /\.(png|jpe?g)$/i.test(m.name) ? 'IMG' : 'FILE'}</span><div class="grow"><a href="#" data-act="file-get" data-id="${d.id}" data-fid="${m.fid}"><b>${esc(m.name)}</b></a><div class="small muted">${fmtSize(m.size || 0)} · ${esc(when(m.at))} · ${esc(mname(m.by))}</div></div><div class="fbtn">${canFill(m) ? `<button class="btn sm ghost" data-act="file-fill" data-id="${d.id}" data-fid="${m.fid}" title="이 파일 내용으로 딜 정보 빈 칸 채우기">빈 칸 채우기</button>` : ''}<button class="btn sm" data-act="file-get" data-id="${d.id}" data-fid="${m.fid}">내려받기</button><button class="btn sm ghost danger" data-act="file-del" data-id="${d.id}" data-fid="${m.fid}">삭제</button></div></div>`).join('')}</div>`
      : `<div class="drop-hint">IM · 텀싯 · 감정평가서 등을 여기(또는 이 화면 아무 곳)에 끌어다 놓으세요. 팀 키로 암호화해 보관하고, PDF·워드·엑셀이면 내용으로 딜 정보 빈 칸을 채울 수 있습니다.</div>`}
    ${docs.length ? `<div class="docs" style="margin-top:10px">${docs.map(x => x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">🔗 ${esc(x.name)}</a>` : `<span class="muted small">📄 ${esc(x.name)} (예전 자동 입력에 쓴 파일 - 보관 안 됨, 다시 올려 주세요)</span>`).join('')}</div>` : ''}
    ${d.terms ? `<h3 style="margin-top:12px">기타 조건</h3>${bullets(d.terms)}` : ''}${d.memo ? `<h3 style="margin-top:12px">메모</h3><div style="white-space:pre-wrap">${esc(d.memo)}</div>` : ''}</div>`;
  return `<div class="grid g2 info-grid">
    ${filesCard}
    ${card('금융 조건', 'fin', kv([['대출금액', d.target ? fmt(num(d.target)) + '억원' : ''], ['금리', d.rate], ['수수료', d.fee], ['All-in', d.allin], ['대출기간', d.term], ['LTV', d.ltv], ['상환방법', d.repay], ['자금용도', d.purpose]]))}
    <div class="card"><div class="card-h"><h2>트랜치별 모집 현황</h2><button class="btn sm ghost" data-act="deal-sec" data-id="${d.id}" data-sec="tr">수정</button></div>
      <div class="tbl-wrap"><table class="t stack"><thead><tr><th>트랜치</th><th class="num">목표</th><th>금리</th><th class="num">승인</th><th class="num">심의</th><th class="num">검토</th><th class="num">남은 금액</th><th></th></tr></thead><tbody>${trRows}</tbody></table></div>
      ${unassigned ? `<div class="small muted" style="margin-top:8px">트랜치를 안 정한 대주 ${unassigned}곳 - 태핑 보드에서 정해 주세요</div>` : ''}<div class="small muted" style="margin-top:6px">단위 억원</div></div>
    ${card('채권보전 · 신용보강', 'fin', d.security ? bullets(d.security) : '<div class="muted small">아직 없습니다</div>')}
    ${card('참여자', 'party', kv([['시행사(차주)', d.sponsor], ['시공사', d.builder], ['신탁사', d.trustee], ['주관·대리', d.arranger], ['연대보증', d.guarantor]]))}
    ${card('사업 개요', 'biz', kv([['사업명', d.project], ['소재지', d.location], ['규모', d.scale], ['대지면적', d.landArea], ['연면적', d.gfa], ['총사업비', d.totalCost]]))}
    ${card('일정', 'sched', kv([['인출 예정', d.drawdown], ['대주 심의 목표', d.committeeDue ? `${d.committeeDue} (${dday(d.committeeDue)})` : ''], ['기표 목표', d.due ? `${d.due} (${daysBetween(t0, d.due) >= 0 ? dday(d.due) : '지남'})` : ''], ['대주 심의', meets.length ? meets.map(t => `${shortDate(t.meetDate)} ${esc(lname(t.lenderId))}`).join('<br>') : '', 1]]))}
  </div>`;
}

function dealBoard(d, taps) {
  const id = d.id, tr = trList(d), multiTr = tr.length > 1;
  const shown = taps.filter(t => !ui.boardFilter || (ui.boardFilter === 'follow' ? needsFollow(t) : t.stage === ui.boardFilter));
  const counts = Object.fromEntries(STAGES.map(x => [x.k, taps.filter(t => t.stage === x.k).length]));
  const sorted = shown.slice().sort((a, b) => typeIdx((Store.get(a.lenderId) || {}).type) - typeIdx((Store.get(b.lenderId) || {}).type) || stageIdx(b.stage === 'declined' ? 'todo' : b.stage) - stageIdx(a.stage === 'declined' ? 'todo' : a.stage) || lname(a.lenderId).localeCompare(lname(b.lenderId), 'ko'));
  const t0 = today();
  const upcoming = taps.filter(t => t.meetDate && t.meetDate >= t0 && t.stage !== 'declined').sort((a, b) => a.meetDate.localeCompare(b.meetDate));
  let board;
  if (!taps.length) board = `<div class="card empty"><b>아직 태핑한 대주가 없습니다</b>'+ 대주 추가'로 대주 DB·저장 리스트·추천에서 고르거나, 기존 태핑 리스트 엑셀을 가져오세요<div style="margin-top:12px;display:flex;gap:8px;justify-content:center"><button class="btn" data-act="tap-import" data-id="${id}">태핑 리스트 엑셀 가져오기</button><button class="btn dark" data-act="tap-add" data-id="${id}">+ 대주 추가</button></div></div>`;
  else if (isPhone() && ui.boardView !== 'kanban') {
    // 휴대폰: 대주마다 한 장 (위: 기관·단계, 아래: 금액·심의일·비고). 누르면 서랍에서 고친다
    let html = '', cur = null, grp = [];
    const tot = { a: 0, p: 0 };
    const flushG = () => {
      if (!grp.length) return;
      const a = grp.filter(t => t.stage !== 'declined').reduce((s, t) => s + num(t.amount), 0), p = grp.filter(t => t.stage === 'approved').reduce((s, t) => s + (num(t.approved) || num(t.amount)), 0);
      html += `<div class="mgrp"><span>${esc(cur)} · ${grp.length}곳</span><span>검토 ${fmt(a) || 0}${p ? ' · 승인 ' + fmt(p) : ''}</span></div>` + grp.map(t => {
        const sub = [num(t.amount) ? `<span class="k">검토</span> ${fmt(num(t.amount))}억` : '', t.stage === 'approved' ? `<span class="k">승인</span> ${fmt(num(t.approved) || num(t.amount))}억` : '', t.meetDate ? `<span class="k">심의</span> ${shortDate(t.meetDate)}` : '', t.tranche ? esc(t.tranche) : '', esc(t.stage === 'declined' ? t.reason || '' : t.note || '')].filter(Boolean).join(' · ');
        const pc = contactChips(t, true);
        return `<div class="mrow" data-act="tap" data-id="${t.id}"${t.stage === 'declined' ? ' style="opacity:.6"' : ''}><div class="mtop"><b>${esc(lname(t.lenderId))}</b>${pc ? `<span class="small muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(pc)}</span>` : ''}${needsFollow(t) ? '<span class="chip warn">팔로업</span>' : ''}<span class="r">${stageSelect(t)}</span></div>${sub ? `<div class="msub">${sub}</div>` : ''}</div>`;
      }).join('');
      tot.a += a; tot.p += p; grp = [];
    };
    for (const t of sorted) { const ty = (Store.get(t.lenderId) || {}).type || '기타'; if (ty !== cur) { flushG(); cur = ty; } grp.push(t); }
    flushG();
    board = `<div class="card" style="padding:0;overflow:hidden"><div class="mlist">${html}</div><div class="mtot">합계 ${shown.length}곳 · 검토 ${fmt(tot.a) || 0}억 · 승인 ${fmt(tot.p) || 0}억</div></div><div class="small muted" style="margin-top:6px">카드를 누르면 금액·심의일·메모를 수정할 수 있습니다</div>`;
  }
  else if (ui.boardView === 'kanban') {
    board = `<div class="kanban">${STAGES.map(st => { const col = sorted.filter(t => t.stage === st.k); return `<div class="kcol"><h4><span style="color:${st.c}">● ${st.t}</span><span class="muted">${col.length}</span></h4>${col.map(t => `<div class="kcard" data-act="tap" data-id="${t.id}"><b>${esc(lname(t.lenderId))}</b>${needsFollow(t) ? ' <span class="chip warn">팔로업</span>' : ''}<div class="a">${esc((Store.get(t.lenderId) || {}).type || '')}${num(t.amount) ? ' · ' + fmt(num(t.amount)) + '억' : ''}${t.meetDate ? ' · 심의 ' + shortDate(t.meetDate) : ''}</div></div>`).join('')}</div>`; }).join('')}</div>`;
  } else {
    const cols = multiTr ? 10 : 9;
    let rows = '', curType = null, sub = null;
    const flush = () => { if (sub && curType !== null) rows += `<tr class="sub"><td>소계</td><td></td><td></td>${multiTr ? '<td></td>' : ''}<td class="num">${fmt(sub.a)}</td><td class="num">${fmt(sub.p)}</td><td colspan="4"></td></tr>`; };
    const tot = { a: 0, p: 0 };
    for (const t of sorted) {
      const L = Store.get(t.lenderId) || {}, ty = L.type || '기타';
      if (ty !== curType) { flush(); curType = ty; sub = { a: 0, p: 0 }; rows += `<tr class="grp"><td colspan="${cols}">${esc(ty)}</td></tr>`; }
      if (t.stage !== 'declined') { sub.a += num(t.amount); tot.a += num(t.amount); }
      if (t.stage === 'approved') { const p = num(t.approved) || num(t.amount); sub.p += p; tot.p += p; }
      const dim = t.stage === 'declined' ? ' style="opacity:.55"' : '';
      rows += `<tr class="row"${dim}><td><span class="name" data-act="tap" data-id="${t.id}">${esc(L.name || '(삭제된 대주)')}</span>${needsFollow(t) ? ' <span class="chip warn">팔로업</span>' : ''}</td>
        <td class="pc-td">${contactChips(t)}</td>
        <td>${stageSelect(t)}</td>
        ${multiTr ? `<td><select class="cell" style="width:auto" data-chg="tapfield" data-f="tranche" data-id="${t.id}"><option value="">-</option>${tr.map(x => `<option ${t.tranche === x.name ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></td>` : ''}
        <td class="num"><input class="cell" inputmode="decimal" data-chg="tapfield" data-f="amount" data-id="${t.id}" value="${esc(t.amount === '' || t.amount == null ? '' : t.amount)}" placeholder="-"></td>
        <td class="num"><input class="cell" inputmode="decimal" data-chg="tapfield" data-f="approved" data-id="${t.id}" value="${esc(t.approved === '' || t.approved == null ? '' : t.approved)}" placeholder="-"></td>
        <td><input class="cell date" type="date" data-chg="tapfield" data-f="meetDate" data-id="${t.id}" value="${esc(t.meetDate || '')}"></td>
        <td class="note-td">${t.stage === 'declined'
          ? `<div class="note-cell" contenteditable="plaintext-only" spellcheck="false" data-edit="tapfield" data-f="reason" data-id="${t.id}" data-ph="불참 사유">${esc(t.reason || '')}</div>`
          : `<div class="note-cell" contenteditable="plaintext-only" spellcheck="false" data-edit="tapfield" data-f="note" data-id="${t.id}" data-ph="비고">${esc(t.note || '')}</div>`}</td>
        <td class="small muted">${t.lastTouch ? shortDate(t.lastTouch) : ''}</td>
        <td>${avatar(t.owner, 1)}</td></tr>`;
    }
    flush();
    rows += `<tr class="tot"><td>합계</td><td></td><td>${shown.length}곳</td>${multiTr ? '<td></td>' : ''}<td class="num">${fmt(tot.a)}</td><td class="num">${fmt(tot.p)}</td><td colspan="4"></td></tr>`;
    board = `<div class="card" style="padding:0"><div class="tbl-wrap"><table class="t"><thead><tr><th>기관</th><th>검토 담당자</th><th>단계</th>${multiTr ? '<th>트랜치</th>' : ''}<th class="num">검토(억)</th><th class="num">승인(억)</th><th>심의 예정일</th><th>비고 / 불참 사유</th><th>최근</th><th>우리 담당</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }
  return `${taps.length ? `<div class="card" style="margin-bottom:12px"><div class="quick">
    <select class="input" id="q-tap"><option value="">대주 선택</option>${taps.slice().sort((a, b) => lname(a.lenderId).localeCompare(lname(b.lenderId), 'ko')).map(t => `<option value="${t.id}">${esc(lname(t.lenderId))}</option>`).join('')}</select>
    <select class="input" id="q-type">${['call', 'mail', 'meet', 'note'].map(k => `<option value="${k}">${LOG_TYPES[k]}</option>`).join('')}</select>
    <input class="input q-text" id="q-text" placeholder="빠른 기록 - 예: 금리 6.5% 이상이면 검토 가능, 다음 주 심사역 배정">
    <select class="input" id="q-stage"><option value="">단계 그대로</option>${STAGES.map(x => `<option value="${x.k}">→ ${x.t}</option>`).join('')}</select>
    <button class="btn dark" data-act="qlog">기록</button></div></div>` : ''}
  ${upcoming.length ? `<div class="chips" style="margin-bottom:10px"><span class="small muted" style="align-self:center">다가오는 심의</span>${upcoming.slice(0, 8).map(t => `<span class="chip gold click" data-act="tap" data-id="${t.id}">${shortDate(t.meetDate)} ${esc(lname(t.lenderId))} ${dday(t.meetDate)}</span>`).join('')}</div>` : ''}
  <div class="toolbar"><div class="chips">
      <span class="chip click ${!ui.boardFilter ? 'on' : ''}" data-act="board-filter" data-k="">전체 ${taps.length}</span>
      ${STAGES.filter(x => counts[x.k]).map(x => `<span class="chip click dot ${ui.boardFilter === x.k ? 'on' : ''}" style="${ui.boardFilter === x.k ? '' : 'color:' + x.c}" data-act="board-filter" data-k="${x.k}">${x.t} ${counts[x.k]}</span>`).join('')}
      ${taps.some(needsFollow) ? `<span class="chip click warn ${ui.boardFilter === 'follow' ? 'on' : ''}" data-act="board-filter" data-k="follow">팔로업 ${taps.filter(needsFollow).length}</span>` : ''}
    </div><div style="margin-left:auto;display:flex;gap:8px;align-items:center">${taps.length ? `<button class="btn sm ghost" data-act="tap-import" data-id="${id}">엑셀 가져오기</button>` : ''}<div class="seg"><button class="${ui.boardView === 'table' ? 'on' : ''}" data-act="board-view" data-k="table">표</button><button class="${ui.boardView === 'kanban' ? 'on' : ''}" data-act="board-view" data-k="kanban">단계별</button></div></div></div>
  ${board}`;
}

/* ======================================================================
 * 기존 태핑 리스트 엑셀 → 보드 (구분 | 기관명 | 검토금액 | 비고 양식)
 * ==================================================================== */
function guessStage(text) {
  const t = String(text || '');
  if (/불가|어려움|미참여|불참|거절|drop|철회|참여\s*안/i.test(t)) return 'declined';
  if (/심의|위원회|부의/.test(t) && /예정|준비|진행|상정/.test(t) && !/기승인|승인\s*완료/.test(t)) return 'committee';
  if (/기승인|승인\s*(완료|됨|득)|^\s*승인\s*$|확정(?!\s*후)|LOC\s*(발급|수령)\s*(완료)?$/i.test(t)) return 'approved';
  if (/승인/.test(t) && !/예정|대기|전/.test(t)) return 'approved';
  if (/심의|위원회|부의|LOC/i.test(t)) return 'committee';
  if (/보류|대기|hold/i.test(t)) return 'hold';
  if (/검토|협의|미팅|접수|배정|피티|PT|필요|조건|가능\s*여부|결론|한도\s*확인/i.test(t)) return 'review';
  if (/송부|전달|자료/.test(t)) return 'sent';
  return 'tapped';
}
function guessDate(text) {
  const t = String(text || ''), y = new Date().getFullYear();
  let m = t.match(/(\d{2,4})[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})/);
  if (m) { const yy = m[1].length === 2 ? 2000 + +m[1] : +m[1]; return `${yy}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`; }
  m = t.match(/(\d{1,2})\s?[\/월]\s?(\d{1,2})/); if (m && +m[1] <= 12) return `${y}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  return '';
}
function parseTapRows(rows) {
  // rows: [[칸...]] - 머리글(기관·대주) 찾고 금액·비고·심의일 칸을 잡는다
  const hi = rows.findIndex(r => r.some(c => /^(기관|기관명|대주|금융기관)$/.test(String(c).replace(/\s/g, ''))));
  if (hi < 0) return [];
  const H = rows[hi].map(c => String(c).replace(/\s/g, ''));
  const f = re => H.findIndex(h => re.test(h));
  const ci = { type: f(/^(구분|대주유형|유형|업권)$/), org: f(/^(기관|기관명|대주|금융기관)$/), amt: f(/(검토|참여|예상|모집)?금액|규모/), note: f(/비고|현황|진행|상태|코멘트/), date: f(/심의|예정일|일정/), ok: f(/승인/) };
  const out = []; let lastType = '';
  for (const r of rows.slice(hi + 1)) {
    const g = i => (i >= 0 ? String(r[i] ?? '').trim() : '');
    // '※ 참조 · 기존 대주' 아래는 태핑이 아니라 참고 목록 - 거기서 멈춘다
    if (r.some(c => /^※\s*(참조|참고)|^기존\s*대주/.test(String(c).trim()))) break;
    let org = g(ci.org), ty = g(ci.type);
    if (ty && !/합계|소계|총계/.test(ty)) lastType = ty;
    if (!org || /^(소계|합계|총계|계)$/.test(org.replace(/\s/g, '')) || /^[▶※*]/.test(org)) continue;
    const note = [g(ci.note), g(ci.ok)].filter(Boolean).join(' ');
    const meetDate = guessDate(g(ci.date)) || (/심의/.test(note) ? guessDate(note) : '');
    let stage = guessStage(note);
    if (stage === 'tapped' && meetDate) stage = 'committee';
    // 유형은 기관 이름이 더 정확하다 (엑셀 '구분' 칸은 병합돼 저축은행이 은행 밑에 들어가곤 한다)
    const byName = guessType(org);
    out.push({ org, type: byName !== '기타' ? byName : (LENDER_TYPES.includes(lastType) ? lastType : '기타'), amount: num(g(ci.amt)) || '', note, stage, meetDate });
  }
  return out;
}
A['tap-import'] = el => {
  const deal = Store.get(el.dataset.id);
  let rows = [];
  modal({
    title: `태핑 리스트 가져오기 · ${deal.name}`, wide: true,
    body: `<p class="small muted" style="margin-top:0">지금까지 쓰던 '대주 Tapping List / 예상 대주 현황' 엑셀을 끌어다 놓거나, 표를 복사해 붙여넣으세요. <b>구분 · 기관명 · 검토(참여)금액 · 비고 · 심의 예정일</b> 칸을 찾아 읽고, 비고의 말(검토중·심의예정·승인·참여 불가…)로 단계를 짐작합니다. 없는 기관은 대주 DB 에 새로 넣습니다.</p>
      <div class="drop" id="ti-drop"><b>엑셀 파일을 여기에</b> <label class="btn sm">파일 고르기<input type="file" id="ti-file" accept=".xlsx,.xlsm" hidden></label></div>
      <textarea class="input" id="ti-text" style="min-height:90px;font-size:12px;margin-top:10px" placeholder="또는 표를 복사해 붙여넣기"></textarea>
      <div id="ti-prev" style="margin-top:12px"></div>`,
    foot: `<button class="btn" data-no>취소</button><button class="btn dark" data-ok>보드에 넣기</button>`,
    onMount: (m, close) => {
      const show = () => {
        $('#ti-prev', m).innerHTML = rows.length ? `<div class="small muted" style="margin-bottom:6px">${rows.length}곳 - 단계는 바꿀 수 있습니다</div><div class="tbl-wrap" style="max-height:300px;overflow:auto"><table class="t"><thead><tr><th>유형</th><th>기관</th><th class="num">금액</th><th>단계</th><th>심의일</th><th>비고</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${esc(r.type)}</td><td>${esc(r.org)}</td><td class="num">${fmt(r.amount)}</td><td><select class="cell" style="width:auto" data-ti="${i}">${STAGES.map(s => `<option value="${s.k}" ${r.stage === s.k ? 'selected' : ''}>${s.t}</option>`).join('')}</select></td><td>${esc(r.meetDate)}</td><td class="ell">${esc(r.note)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="small muted">머리글(기관·기관명·대주)이 있는 표를 찾지 못했습니다</div>';
        $$('[data-ti]', m).forEach(s => s.onchange = () => { rows[+s.dataset.ti].stage = s.value; });
      };
      const fromFile = async f => { try { const sh = await xlsxSheets(await f.arrayBuffer()); for (const s of sh) { const r = parseTapRows(s.rows); if (r.length) { rows = r; break; } } show(); } catch (e) { toast(e.message, true); } };
      $('#ti-file', m).onchange = e => e.target.files[0] && fromFile(e.target.files[0]);
      const drop = $('#ti-drop', m);
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) fromFile(f); });
      $('#ti-text', m).oninput = e => { rows = parseTapRows(e.target.value.replace(/\r/g, '').split('\n').map(l => l.split('\t'))); show(); };
      m.querySelector('[data-no]').onclick = close;
      m.querySelector('[data-ok]').onclick = async () => {
        if (!rows.length) return toast('가져올 줄이 없습니다', true);
        await act(async () => {
          const byName = new Map(lenders().map(L => [normName(L.name), L]));
          const newL = [];
          for (const r of rows) { let L = matchLender(byName, r.org); if (!L) { L = { id: 'lender:' + uid(), name: r.org, type: r.type, prefs: '', memo: '', contacts: [] }; byName.set(normName(r.org), L); newL.push(L); } r.lenderId = L.id; }
          if (newL.length) await Store.createMany('lender', newL);
          const have = new Map(tapsOf(deal.id).map(t => [t.lenderId, t]));
          const creates = [], updates = [];
          for (const r of rows) {
            const v = { stage: r.stage, amount: r.amount, note: r.stage === 'declined' ? '' : r.note, reason: r.stage === 'declined' ? r.note : '', meetDate: r.meetDate, lastTouch: today() };
            if (have.has(r.lenderId)) updates.push({ id: have.get(r.lenderId).id, v }); else creates.push({ dealId: deal.id, lenderId: r.lenderId, approved: r.stage === 'approved' ? r.amount : '', internal: '', owner: Store.mid, tranche: '', ...v });
          }
          if (creates.length) await Store.createMany('tap', creates);
          for (const u of updates) await Store.update(u.id, t => ({ ...t, ...u.v }));
          await addLog({ dealId: deal.id, type: 'system', text: `태핑 리스트 엑셀에서 ${rows.length}곳 가져옴 (새로 ${creates.length}, 갱신 ${updates.length}${newL.length ? `, 대주 DB 신규 ${newL.length}` : ''})`, lenderIds: rows.map(r => r.lenderId) });
          close();
        }, `${rows.length}곳을 보드에 넣었습니다`);
      };
    }
  });
};
