/* 딜 데스크 - 할 일 (대화에서 업무 지시를 찾아 제안 → 한 번 눌러 확정)
 * 기록: kind 'task' { dealId, title, assignee(member id), due('yyyy-mm-dd'|''), done, doneAt, doneBy, msgId, createdBy, createdAt }
 * 감지는 브라우저 안 규칙으로만 한다 (대화는 대외비 - 외부 AI 로 보내지 않음). */
'use strict';

LOG_TYPES.task = '할 일';
const tasks = () => Store.all('task');
const tasksOf = dealId => tasks().filter(t => t.dealId === dealId);
const taskOfMsg = msgId => tasks().find(t => t.msgId === msgId);
const myOpenTasks = () => tasks().filter(t => !t.done && t.assignee === Store.mid && Store.get(t.dealId));
const dueSort = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (a.createdAt || '').localeCompare(b.createdAt || '');
const dueState = t => { if (!t.due || t.done) return ''; const n = daysBetween(today(), t.due); return n < 0 ? 'over' : n === 0 ? 'today' : n <= 3 ? 'soon' : ''; };
const dueLabel = t => { if (!t.due) return '기한 없음'; const n = daysBetween(today(), t.due), w = '일월화수목금토'[new Date(t.due + 'T00:00:00').getDay()]; return `${shortDate(t.due)}(${w})` + (t.done ? '' : n < 0 ? ` · ${-n}일 지남` : n === 0 ? ' · 오늘' : n === 1 ? ' · 내일' : ` · D-${n}`); };

/* ---------- 업무 지시 찾기 ---------- */
const DIRECTIVE = /(해\s?주세요|해\s?주시|해\s?줘|부탁(드립니다|드려요|드릴게요|해요|합니다|드립|해)|주세요|주시면|주시기|바랍니다|요망|하세요|해\s?놓|챙겨|준비\s?(해|부탁|바|좀)|보내\s?(주|줘)|올려\s?(주|줘)|공유\s?(해|부탁|바|좀)|확인\s?(해|부탁|바|좀)|검토\s?(해|부탁|바|좀)|작성\s?(해|부탁|바|좀)|정리\s?(해|부탁|바|좀)|진행\s?(해|부탁|바|좀)|까지\s*(주|부탁|완료|제출|송부|공유|전달|회신))/;
const NOT_TASK = /(할까요|될까요|괜찮을까요|어떨까요|인가요|있나요|없나요|맞나요)\s*\??\s*$/;
const WD = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
function parseDue(text, baseIso) {
  const base = new Date((baseIso || new Date().toISOString())); base.setHours(0, 0, 0, 0);
  const add = n => { const d = new Date(base); d.setDate(d.getDate() + n); return localDate(d); };
  const t = String(text || '');
  // '내일 오전 중' 은 내일 - 날짜 말을 먼저 보고 '오전 중' 같은 시간 말은 그다음
  if (/(내일|명일)/.test(t)) return { due: add(1), hit: t.match(/(내일|명일)/)[0] };
  if (/모레/.test(t)) return { due: add(2), hit: '모레' };
  if (/(오늘|금일|오전\s?중|오후\s?중|퇴근\s?전|EOD|asap|ASAP|바로|즉시)/.test(t)) return { due: add(0), hit: (t.match(/(오늘|금일|오전\s?중|오후\s?중|퇴근\s?전|EOD|asap|ASAP)/) || [''])[0] };
  let m = t.match(/(다음\s?주|담주|차주)\s*(월|화|수|목|금|토|일)요일?/);
  if (m) { const cur = base.getDay(), target = WD[m[2]], toNextMon = ((8 - cur) % 7) || 7; return { due: add(toNextMon + ((target + 6) % 7)), hit: m[0] }; }
  m = t.match(/(이번\s?주\s*)?(월|화|수|목|금|토|일)요일/);
  if (m) { const diff = (WD[m[2]] - base.getDay() + 7) % 7; return { due: add(diff), hit: m[0] }; }
  if (/(다음\s?주|담주|차주)\s*(중|내|까지)/.test(t)) { const toFri = ((5 - base.getDay() + 7) % 7) + 7; return { due: add(toFri), hit: t.match(/(다음\s?주|담주|차주)\s*(중|내|까지)/)[0] }; }
  if (/(이번\s?주|금주|주중)\s*(중|내|까지)?/.test(t)) { const toFri = (5 - base.getDay() + 7) % 7; return { due: add(toFri), hit: t.match(/(이번\s?주|금주|주중)\s*(중|내|까지)?/)[0] }; }
  m = t.match(/(\d{1,2})\s*[\/.월]\s*(\d{1,2})\s*일?/);
  if (m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31) {
    let y = base.getFullYear(); const cand = new Date(y, +m[1] - 1, +m[2]);
    if (cand < base && (base - cand) > 60 * 864e5) y++;
    return { due: `${y}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`, hit: m[0] };
  }
  return { due: '', hit: '' };
}
function detectTask(m) {
  const text = String(m.text || '').trim();
  if (!text || text.length < 4 || NOT_TASK.test(text) || !DIRECTIVE.test(text)) return null;
  const assignee = (m.mentions || []).find(id => id !== m.by) || (m.by !== Store.mid ? Store.mid : '');
  const d = parseDue(text, m.at);
  let title = text;
  for (const id of m.mentions || []) title = title.split('@' + mname(id)).join('');
  // 날짜·시간 말과 그 뒤 조사(까지·으로·중에…)를 통째로 뺀다
  const P = '\\s*(까지|중으로|중에|으로|로|내로|안에|에|중)?';
  if (d.hit) title = title.replace(new RegExp(d.hit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + P), ' ');
  title = title.replace(new RegExp('(오늘|금일|내일|명일|모레)' + P, 'g'), ' ').replace(new RegExp('(오전|오후)\\s?중' + P, 'g'), ' ').replace(new RegExp('(이번\\s?주|금주|주중|다음\\s?주|담주|차주)\\s*(중|내)' + P, 'g'), ' ');
  title = title.replace(/^\s*(좋아요|좋습니다|네|넵|넹|예|오케이|ok|알겠습니다|감사합니다|그럼|그러면)[.!,~\s]+/i, '')
    .replace(/(팀장|수석|책임|선임|매니저|차장|과장|대리)님[,\s]*/g, '')
    .replace(/\s*(까지)?\s*(좀\s*)?(해\s?주세요|해\s?주시면.*|해\s?줘|부탁\s?(드립니다|드려요|드릴게요|해요|합니다)?|주세요|주시면.*|주시기\s*바랍니다|바랍니다|요망)[.!~ ]*$/, '')
    .replace(/\s*까지\s*$/, '').replace(/^[\s,.\-·]+|[\s,.\-·]+$/g, '').replace(/\s+/g, ' ');
  if (title.length < 2) title = text.slice(0, 80);
  return { title: title.slice(0, 100), assignee, due: d.due };
}

/* ---------- 만들기 · 완료 ---------- */
async function createTask(o) {
  const t = await Store.create('task', { dealId: o.dealId, title: o.title, assignee: o.assignee || '', due: o.due || '', done: false, msgId: o.msgId || '', createdBy: Store.mid, createdAt: new Date().toISOString() });
  await addLog({ dealId: o.dealId, type: 'task', text: `할 일 추가: ${o.title}${o.assignee ? ' → ' + mname(o.assignee) : ''}${o.due ? ' · ' + dueLabel({ due: o.due }) : ''}` });
  if (typeof pushForTask === 'function') pushForTask(t);   // 담당자 앱 알림
  return t;
}
async function toggleTask(id) {
  const t = Store.get(id); if (!t) return;
  const done = !t.done;
  await Store.update(id, x => ({ ...x, done, doneAt: done ? new Date().toISOString() : '', doneBy: done ? Store.mid : '' }));
  await addLog({ dealId: t.dealId, type: 'task', text: `${done ? '✓ 할 일 완료' : '↺ 할 일 다시 열기'}: ${t.title}${t.assignee ? ' (' + mname(t.assignee) + ')' : ''}` });
}
A['task-toggle'] = (el, e) => { if (e) { e.preventDefault(); e.stopPropagation(); } act(() => toggleTask(el.dataset.id)); };
A['task-del'] = (el, e) => { if (e) e.preventDefault(); const t = Store.get(el.dataset.id); if (t && confirm(`'${t.title}' 할 일을 지울까요?`)) act(() => Store.remove(t.id), '지웠습니다'); };

// 할 일 창 (새로 / 수정 / 메시지에서)
function taskForm({ dealId, title = '', assignee = '', due = '', msgId = '', id = '' }) {
  const t = id ? Store.get(id) : null;
  if (t) ({ dealId, title, assignee, due, msgId } = t);
  modal({
    title: t ? '할 일 수정' : '할 일 추가',
    body: `<div class="field"><label>할 일</label><input class="input" id="tk-title" value="${esc(title)}"></div>
      <div class="row2"><div class="field"><label>담당</label><select class="input" id="tk-as"><option value="">담당 미정</option>${members().filter(m => m.active !== false).map(m => `<option value="${m.id}" ${m.id === assignee ? 'selected' : ''}>${esc(m.name)}${m.id === Store.mid ? ' (나)' : ''}</option>`).join('')}</select></div>
      <div class="field"><label>기한</label><input class="input" type="date" id="tk-due" value="${esc(due)}"></div></div>
      <div class="small muted">${esc(dname(dealId))}${msgId ? ' · 대화에서 만든 할 일' : ''}</div>`,
    foot: `${t ? '<button class="btn danger" data-del style="margin-right:auto">삭제</button>' : ''}<button class="btn" data-no>취소</button><button class="btn dark" data-ok>${t ? '저장' : '추가'}</button>`,
    onMount: (el, close) => {
      el.querySelector('[data-no]').onclick = close;
      const del = el.querySelector('[data-del]'); if (del) del.onclick = () => { close(); A['task-del']({ dataset: { id } }); };
      el.querySelector('[data-ok]').onclick = () => {
        const v = { title: val(el, 'tk-title'), assignee: val(el, 'tk-as'), due: val(el, 'tk-due') };
        if (!v.title) return toast('할 일을 적어 주세요', true);
        act(async () => { if (t) await Store.update(id, x => ({ ...x, ...v })); else await createTask({ dealId, msgId, ...v }); close(); }, t ? '저장했습니다' : '할 일을 추가했습니다');
      };
    }
  });
}
A['task-edit'] = (el, e) => { if (e) e.preventDefault(); taskForm({ id: el.dataset.id }); };
A['task-new'] = el => taskForm({ dealId: el.dataset.deal, assignee: Store.mid });

/* ---------- 대화 안: 제안 줄 · 할 일 표시 ---------- */
let dismissed = new Set(); try { dismissed = new Set(JSON.parse(localStorage.getItem('dd-task-dismiss') || '[]')); } catch (e) { }
function taskUnderMsg(m) {
  const t = taskOfMsg(m.id);
  if (t) return `<div class="tchip${t.done ? ' done' : ''}${dueState(t) ? ' ' + dueState(t) : ''}"><a href="#" class="tbox" data-act="task-toggle" data-id="${t.id}">${t.done ? '☑' : '☐'}</a><a href="#" data-act="task-edit" data-id="${t.id}"><b>할 일</b> ${esc(t.title)}</a><span>${t.assignee ? esc(mname(t.assignee)) : '담당 미정'} · ${dueLabel(t)}</span></div>`;
  if (dismissed.has(m.id) || Date.now() - Date.parse(m.at || 0) > 14 * 864e5) return '';   // 2주 지난 메시지엔 제안 안 함
  const s = detectTask(m); if (!s) return '';
  return `<div class="tsug"><span>☐ 할 일로 추가</span><b>${esc(s.title)}</b><span class="muted">${s.assignee ? esc(mname(s.assignee)) : '담당 미정'} · ${s.due ? dueLabel({ due: s.due }) : '기한 없음'}</span>
    <button class="btn sm dark" data-act="task-sug-ok" data-mid="${m.id}">추가</button><button class="btn sm ghost" data-act="task-sug-edit" data-mid="${m.id}">수정 후 추가</button><a href="#" class="muted" data-act="task-sug-no" data-mid="${m.id}" title="제안 숨기기">✕</a></div>`;
}
A['task-sug-ok'] = el => { const m = Store.get(el.dataset.mid), s = m && detectTask(m); if (s) act(() => createTask({ dealId: m.dealId, msgId: m.id, ...s }), '할 일을 추가했습니다'); };
A['task-sug-edit'] = el => { const m = Store.get(el.dataset.mid), s = m && (detectTask(m) || { title: m.text.slice(0, 80), assignee: '', due: '' }); if (s) taskForm({ dealId: m.dealId, msgId: m.id, ...s }); };
A['task-sug-no'] = (el, e) => { if (e) e.preventDefault(); dismissed.add(el.dataset.mid); try { localStorage.setItem('dd-task-dismiss', JSON.stringify([...dismissed].slice(-500))); } catch (x) { } refreshChats(); };
A['task-from-msg'] = (el, e) => { if (e) e.preventDefault(); const m = Store.get(el.dataset.mid); if (!m) return; const s = detectTask(m) || { title: String(m.text).replace(/@\S+\s?/g, '').slice(0, 80), assignee: (m.mentions || [])[0] || '', due: parseDue(m.text, m.at).due }; taskForm({ dealId: m.dealId, msgId: m.id, ...s }); };
// 할 일 목록에서 '대화에서' → 그 메시지로
A['task-goto'] = (el, e) => {
  if (e) e.preventDefault();
  const t = Store.get(el.dataset.id); if (!t) return;
  ui.dealTab = 'act'; ui.chatJump = t.msgId;
  if (location.hash !== '#/deal/' + encodeURIComponent(t.dealId)) location.hash = '#/deal/' + encodeURIComponent(t.dealId); else render();
};

/* ---------- 딜 '할 일' 탭 ---------- */
function taskRow(t, showDeal) {
  const st = dueState(t);
  return `<div class="trow${t.done ? ' done' : ''}${st ? ' ' + st : ''}"><a href="#" class="tbox" data-act="task-toggle" data-id="${t.id}">${t.done ? '☑' : '☐'}</a>
    <div class="grow"><a href="#" class="tt" data-act="task-edit" data-id="${t.id}">${esc(t.title)}</a>
      <div class="small muted">${showDeal ? `<a href="#/deal/${encodeURIComponent(t.dealId)}">${esc(dname(t.dealId))}</a> · ` : ''}${t.assignee ? esc(mname(t.assignee)) : '담당 미정'}${t.msgId && Store.get(t.msgId) ? ` · <a href="#" data-act="task-goto" data-id="${t.id}">대화에서</a>` : ''}${t.done && t.doneAt ? ` · ${when(t.doneAt)} 완료` : ''}</div></div>
    <span class="tdue">${dueLabel(t)}</span></div>`;
}
function dealTasksHtml(dealId) {
  const all = tasksOf(dealId), open = all.filter(t => !t.done).sort(dueSort), done = all.filter(t => t.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  return `<div class="card"><div class="card-h"><h2>할 일 <span class="muted small">${open.length}건 진행 · ${done.length}건 완료</span></h2></div>
    <div class="tquick"><input class="input" id="tq-title" placeholder="할 일 추가 - 예: PT 자료 분양률 최신 반영 (Enter)"><select class="input" id="tq-as">${members().filter(m => m.active !== false).map(m => `<option value="${m.id}" ${m.id === Store.mid ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}<option value="">담당 미정</option></select><input class="input" type="date" id="tq-due"><button class="btn dark" data-act="tq-add" data-deal="${dealId}">추가</button></div>
    ${open.length ? `<div class="tlist">${open.map(t => taskRow(t)).join('')}</div>` : '<div class="muted small" style="padding:10px 2px">진행 중인 할 일이 없습니다. 대화에서 업무 지시가 나오면 메시지 밑에 "할 일로 추가" 제안이 뜹니다.</div>'}
    ${done.length ? `<details style="margin-top:12px"><summary class="small muted" style="cursor:pointer">완료 ${done.length}건</summary><div class="tlist" style="margin-top:6px">${done.map(t => taskRow(t)).join('')}</div></details>` : ''}</div>`;
}
A['tq-add'] = el => {
  const title = $('#tq-title').value.trim(); if (!title) return toast('할 일을 적어 주세요', true);
  const due = $('#tq-due').value || parseDue(title).due;
  act(() => createTask({ dealId: el.dataset.deal, title, assignee: $('#tq-as').value, due }), '할 일을 추가했습니다');
};
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'tq-title' && !e.isComposing) { e.preventDefault(); A['tq-add']($('[data-act="tq-add"]')); } });

/* ---------- 홈 '내 할 일' ---------- */
function homeTaskCard() {
  const list = myOpenTasks().sort(dueSort);
  if (!list.length) return '';
  const urgent = list.filter(t => ['over', 'today'].includes(dueState(t))).length;
  return `<div class="card"><h2>내 할 일 ${urgent ? unreadBadge(urgent) : `<span class="muted small">${list.length}</span>`}</h2><div class="tlist">${list.slice(0, 8).map(t => taskRow(t, true)).join('')}</div>${list.length > 8 ? `<div class="small muted" style="margin-top:6px">외 ${list.length - 8}건</div>` : ''}</div>`;
}
