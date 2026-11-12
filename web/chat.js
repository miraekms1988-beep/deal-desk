/* 딜 데스크 - 딜별 대화
 * 기록: kind 'msg' { dealId, text, at, by, mentions:[member id], lenderIds:[lender id] } - 팀 키로 암호화돼 저장.
 * 한 타임라인에 팀원 메시지 + 자동 기록(단계·메일·자료)을 섞어 보여 준다.
 * 읽음: 내 팀원 기록의 seen[dealId] = 마지막으로 본 메시지 시각 (기기 사이 공유). */
'use strict';

LOG_TYPES.msg = '대화';
const msgs = () => Store.all('msg').sort((a, b) => (a.at || '').localeCompare(b.at || ''));
const msgsOf = dealId => msgs().filter(m => m.dealId === dealId);
const seenOf = dealId => ((me().seen || {})[dealId]) || '';
const unreadOf = dealId => { const s = seenOf(dealId); return msgsOf(dealId).filter(m => m.by !== Store.mid && (m.at || '') > s); };
const unreadAll = () => { const out = []; for (const d of deals()) out.push(...unreadOf(d.id)); return out.sort((a, b) => (b.at || '').localeCompare(a.at || '')); };
const mentionsMe = m => (m.mentions || []).includes(Store.mid);
const asLog = m => ({ ...m, type: 'msg', lenderId: (m.lenderIds || []).length === 1 ? m.lenderIds[0] : '' });
const unreadBadge = n => n ? `<span class="ubadge">${n > 99 ? '99+' : n}</span>` : '';

/* 읽음 표시 - 화면에 대화가 보이면 잠깐 뒤 내 seen 을 올린다 (자주 쓰지 않게 모아서) */
let seenT = null;
function markSeen(dealId) {
  const list = msgsOf(dealId); if (!list.length || document.hidden) return;
  const latest = list[list.length - 1].at || '';
  if (latest <= seenOf(dealId)) return;
  clearTimeout(seenT);
  seenT = setTimeout(() => { Store.update(Store.mid, m => { m.seen = { ...(m.seen || {}), [dealId]: latest }; return m; }).catch(() => { }); }, 1500);
}

/* ---------- 글 그리기: @이름·#대주 강조 ---------- */
function msgText(m) {
  let t = esc(m.text || '');
  const marks = [];
  for (const id of m.mentions || []) { const n = mname(id); if (n) marks.push({ s: '@' + n, h: `<span class="men${id === Store.mid ? ' me' : ''}">@${esc(n)}</span>` }); }
  for (const id of m.lenderIds || []) { const L = Store.get(id); if (L) marks.push({ s: '#' + L.name, h: `<a href="#" class="ltag" data-act="chat-lender" data-deal="${m.dealId}" data-lender="${id}">#${esc(L.name)}</a>` }); }
  marks.sort((a, b) => b.s.length - a.s.length);
  marks.forEach((k, i) => { t = t.split(esc(k.s)).join(`\u0000${i}\u0000`); });
  marks.forEach((k, i) => { t = t.split(`\u0000${i}\u0000`).join(k.h); });
  return t.replace(/\n/g, '<br>');
}
const dayLabel = iso => { const d = new Date(iso); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]})`; };
const hm = iso => new Date(iso).toTimeString().slice(0, 5);

function chatListHtml(dealId) {
  const items = [...logsFor(l => l.dealId === dealId).map(l => ({ ...l, sys: true })), ...msgsOf(dealId)].sort((a, b) => (a.at || '').localeCompare(b.at || ''));
  if (!items.length) return `<div class="chat-empty">아직 대화가 없습니다.<br>이 딜 얘기를 남겨 보세요 - <b>@이름</b>으로 부르고 <b>#대주</b>로 대주를 붙일 수 있습니다.</div>`;
  const mark = (ui.chatMark || {})[dealId] || '';
  const showLogs = ui.chatLogs === 'all', open = ui.chatOpenLogs || (ui.chatOpenLogs = new Set());
  let html = '', day = '', marked = false, prevBy = null, prevAt = '', group = [];
  const logLine = l => `<div class="clog"><span class="tag ${l.type}">${LOG_TYPES[l.type] || ''}</span>${esc(String(l.text || '').split('\n')[0].slice(0, 140))} <span class="muted">· ${esc(mname(l.by))} ${hm(l.at)}</span></div>`;
  // 자동 기록은 메시지 사이에 모아 두었다가 한 줄로 접는다 (펼치면 한 줄씩)
  const flush = () => {
    if (!group.length) return;
    const key = group[0].id;
    if (showLogs || open.has(key)) html += `<div class="clogs">${group.map(logLine).join('')}${!showLogs ? `<a href="#" class="clog-fold" data-act="chat-logs-x" data-k="${key}">접기</a>` : ''}</div>`;
    else html += `<a href="#" class="clog-sum" data-act="chat-logs-x" data-k="${key}">📋 기록 ${group.length}건 · ${esc(String(group[group.length - 1].text || '').split('\n')[0].slice(0, 50))}${group.length > 1 ? ' 외' : ''}</a>`;
    group = []; prevBy = null;
  };
  for (const it of items) {
    const dl = dayLabel(it.at);
    if (dl !== day) { flush(); html += `<div class="chat-day"><span>${dl}</span></div>`; day = dl; prevBy = null; }
    if (it.sys) { group.push(it); continue; }
    flush();
    if (!marked && mark && it.at > mark && it.by !== Store.mid) { html += `<div class="chat-new"><span>여기부터 새 메시지</span></div>`; marked = true; prevBy = null; }
    const mine = it.by === Store.mid, cont = prevBy === it.by && (Date.parse(it.at) - Date.parse(prevAt)) < 5 * 60000;
    const tk = typeof taskUnderMsg === 'function' ? taskUnderMsg(it) : '';
    html += `<div class="msg${mine ? ' mine' : ''}${cont ? ' cont' : ''}${mentionsMe(it) ? ' tome' : ''}" data-mid="${it.id}"><div class="ma">${cont ? `<span class="mt2">${hm(it.at)}</span>` : avatar(it.by, 1)}</div><div class="mb">${cont ? '' : `<div class="mh"><b>${esc(mname(it.by))}</b>${mine ? ' <span class="me-tag">나</span>' : ''}<span class="mt">${hm(it.at)}</span></div>`}<div class="txt">${msgText(it)}</div>${tk}</div><span class="mact">${tk ? '' : `<a href="#" class="mdel" data-act="task-from-msg" data-mid="${it.id}" title="이 메시지로 할 일 만들기">할 일로</a>`}${mine ? `<a href="#" class="mdel" data-act="chat-del" data-id="${it.id}" title="지우기">지우기</a>` : ''}</span></div>`;
    prevBy = it.by; prevAt = it.at;
  }
  flush();
  return html;
}

function chatHtml(dealId, dock) {
  const draft = ((ui.chatDraft || {})[dealId]) || '';
  const seg = `<div class="seg chat-seg"><button class="${ui.chatLogs !== 'all' ? 'on' : ''}" data-act="chat-logs" data-k="msg">대화만</button><button class="${ui.chatLogs === 'all' ? 'on' : ''}" data-act="chat-logs" data-k="all">기록 포함</button></div>`;
  return `<div class="chat${dock ? ' dock' : ''}" data-deal="${dealId}">
    <div class="chat-h">${dock ? `<b>대화</b><span class="muted small">${esc(dname(dealId))}</span>` : `<b>대화</b><span class="muted small">이 딜 얘기 · @이름 · #대주</span>`}${seg}${dock ? '<button class="x-btn" data-act="chat-dock" title="닫기">×</button>' : ''}</div>
    <div class="chat-list" data-deal="${dealId}">${chatListHtml(dealId)}</div>
    <div class="chat-comp"><div class="chat-ac hide"></div>
      <textarea class="input chat-input" data-deal="${dealId}" rows="2" placeholder="메시지 · @이름 부르기 · #대주 붙이기 · Enter 보내기, Shift+Enter 줄바꿈">${esc(draft)}</textarea>
      <button class="btn dark" data-act="chat-send" data-deal="${dealId}">보내기</button></div></div>`;
}

/* 대화 칸만 새로 (입력 중이어도 목록은 바뀐다 - 입력칸은 그대로) */
function refreshChats() {
  for (const box of $$('.chat-list')) {
    const id = box.dataset.deal, atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    const html = chatListHtml(id);
    if (box._html !== html) { box.innerHTML = html; box._html = html; if (atBottom) box.scrollTop = box.scrollHeight; }
    markSeen(id);
  }
}
// 처음 그릴 때는 맨 아래로, 새 메시지 표시선 위치를 잡아 둔다
function initChats(keep = {}) {
  for (const box of $$('.chat-list')) {
    const id = box.dataset.deal, k = keep[id + (box.closest('.dock') ? 'd' : 't')];
    ui.chatMark = ui.chatMark || {};
    if (ui.chatMark[id] === undefined) { ui.chatMark[id] = seenOf(id); box.innerHTML = chatListHtml(id); }
    box._html = box.innerHTML;
    const jump = ui.chatJump && box.querySelector(`.msg[data-mid="${ui.chatJump}"]`);
    if (jump) { box.scrollTop = Math.max(0, jump.offsetTop - 80); jump.classList.add('flash'); ui.chatJump = null; }   // 할 일에서 '대화에서'
    else if (k) box.scrollTop = k.bottom ? box.scrollHeight : k.top;   // 다시 그린 것: 보던 자리 그대로
    else { const nl = box.querySelector('.chat-new'); box.scrollTop = nl ? Math.max(0, nl.offsetTop - 60) : box.scrollHeight; }
    markSeen(id);
  }
}

/* ---------- 보내기 · @/# 자동완성 ---------- */
function parseRefs(text, dealId) {
  const mentions = members().filter(m => m.active !== false && m.name && text.includes('@' + m.name)).map(m => m.id);
  const onBoard = new Set(tapsOf(dealId).map(t => t.lenderId));
  const ls = lenders().filter(L => text.includes('#' + L.name)).sort((a, b) => (onBoard.has(b.id) - onBoard.has(a.id)) || b.name.length - a.name.length);
  // '#하나캐피탈' 안의 '#하나' 같은 짧은 이름 겹침은 긴 쪽만
  const lenderIds = ls.filter(L => !ls.some(o => o !== L && o.name.length > L.name.length && o.name.includes(L.name) && text.includes('#' + o.name))).map(L => L.id);
  return { mentions, lenderIds };
}
A['chat-send'] = el => sendChat(el.dataset.deal);
async function sendChat(dealId) {
  const ta = $(`.chat-input[data-deal="${dealId}"]`); if (!ta) return;
  const text = ta.value.trim(); if (!text) return;
  const refs = parseRefs(text, dealId);
  ta.value = ''; (ui.chatDraft = ui.chatDraft || {})[dealId] = '';
  hideAc(ta); growTa(ta);
  await act(async () => {
    await Store.create('msg', { dealId, text, at: new Date().toISOString(), by: Store.mid, ...refs });
    (ui.chatMark = ui.chatMark || {})[dealId] = new Date().toISOString();   // 내가 보낸 뒤로는 '새 메시지' 선 없음
    refreshChats();
    for (const b of $$(`.chat-list[data-deal="${dealId}"]`)) b.scrollTop = b.scrollHeight;
  });
  ta.focus();
}
A['chat-del'] = (el, e) => { if (e) e.preventDefault(); if (confirm('이 메시지를 지울까요?')) act(() => Store.remove(el.dataset.id)); };
A['chat-lender'] = (el, e) => {
  if (e) e.preventDefault();
  const t = Store.all('tap').find(x => x.dealId === el.dataset.deal && x.lenderId === el.dataset.lender);
  if (t) { drawerId = t.id; renderDrawer(); } else location.hash = '#/lender/' + encodeURIComponent(el.dataset.lender);
};
// 기록 보기: '대화만'(접힘, 기본) / '기록 포함'(모두 펼침) - 이 기기에 기억
A['chat-logs'] = el => { ui.chatLogs = el.dataset.k; try { localStorage.setItem('dd-chat-logs', ui.chatLogs); } catch (e) { } render(); };
A['chat-logs-x'] = (el, e) => { if (e) e.preventDefault(); const s = ui.chatOpenLogs || (ui.chatOpenLogs = new Set()); s.has(el.dataset.k) ? s.delete(el.dataset.k) : s.add(el.dataset.k); refreshChats(); };
try { ui.chatLogs = localStorage.getItem('dd-chat-logs') || 'msg'; } catch (e) { ui.chatLogs = 'msg'; }
A['chat-dock'] = () => { ui.chatDock = !ui.chatDock; try { localStorage.setItem('dd-chat-dock', ui.chatDock ? '1' : ''); } catch (e) { } render(); };
try { ui.chatDock = !!localStorage.getItem('dd-chat-dock'); } catch (e) { }

function acState(ta) {
  const pos = ta.selectionStart, before = ta.value.slice(0, pos), m = before.match(/(^|\s)([@#])([^\s@#]*)$/);
  return m ? { kind: m[2], q: m[3], start: pos - m[3].length - 1, end: pos } : null;
}
function hideAc(ta) { const ac = ta.parentElement.querySelector('.chat-ac'); ac.classList.add('hide'); ac.innerHTML = ''; ac._items = null; }
function showAc(ta) {
  const st = acState(ta), ac = ta.parentElement.querySelector('.chat-ac');
  if (!st) return hideAc(ta);
  const dealId = ta.dataset.deal, q = st.q.toLowerCase();
  let items;
  if (st.kind === '@') items = members().filter(m => m.active !== false && m.id !== Store.mid && (m.name || '').toLowerCase().includes(q)).map(m => ({ label: m.name, sub: m.title || '', ins: '@' + m.name }));
  else {
    const onBoard = new Set(tapsOf(dealId).map(t => t.lenderId));
    items = lenders().filter(L => L.name.toLowerCase().includes(q)).sort((a, b) => (onBoard.has(b.id) - onBoard.has(a.id)) || a.name.localeCompare(b.name, 'ko')).map(L => ({ label: L.name, sub: onBoard.has(L.id) ? '이 딜 보드' : L.type || '', ins: '#' + L.name }));
  }
  items = items.slice(0, 8);
  if (!items.length) return hideAc(ta);
  ac._items = items; ac._st = st; ac._i = 0;
  ac.innerHTML = items.map((x, i) => `<div class="aci${i === 0 ? ' on' : ''}" data-i="${i}"><b>${esc(x.label)}</b> <span class="muted small">${esc(x.sub)}</span></div>`).join('');
  ac.classList.remove('hide');
}
function pickAc(ta, i) {
  const ac = ta.parentElement.querySelector('.chat-ac'), x = ac._items && ac._items[i], st = ac._st; if (!x) return;
  ta.value = ta.value.slice(0, st.start) + x.ins + ' ' + ta.value.slice(st.end);
  const p = st.start + x.ins.length + 1; ta.setSelectionRange(p, p); ta.focus();
  (ui.chatDraft = ui.chatDraft || {})[ta.dataset.deal] = ta.value;
  hideAc(ta);
}
// 쓰는 만큼 입력칸이 늘어난다 (최대 140px)
const growTa = ta => { ta.style.height = '44px'; ta.style.height = Math.min(140, ta.scrollHeight + 2) + 'px'; };
document.addEventListener('input', e => { const ta = e.target; if (!ta.classList || !ta.classList.contains('chat-input')) return; (ui.chatDraft = ui.chatDraft || {})[ta.dataset.deal] = ta.value; growTa(ta); showAc(ta); });
document.addEventListener('mousedown', e => { const it = e.target.closest('.aci'); if (!it) return; e.preventDefault(); const ta = it.closest('.chat-comp').querySelector('.chat-input'); pickAc(ta, +it.dataset.i); });
document.addEventListener('keydown', e => {
  const ta = e.target; if (!ta.classList || !ta.classList.contains('chat-input') || e.isComposing) return;
  const ac = ta.parentElement.querySelector('.chat-ac'), open = ac && !ac.classList.contains('hide') && ac._items;
  if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); ac._i = (ac._i + (e.key === 'ArrowDown' ? 1 : -1) + ac._items.length) % ac._items.length; $$('.aci', ac).forEach((x, i) => x.classList.toggle('on', i === ac._i)); return; }
  if (open && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); pickAc(ta, ac._i); return; }
  if (open && e.key === 'Escape') { e.stopPropagation(); hideAc(ta); return; }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(ta.dataset.deal); }
}, true);

/* 홈 '새 대화' 카드 */
function homeChatCard() {
  const un = unreadAll(); if (!un.length) return '';
  const top = un.filter(mentionsMe).concat(un.filter(m => !mentionsMe(m))).slice(0, 6);
  return `<div class="card"><h2>새 대화 ${unreadBadge(un.length)}</h2>${top.map(m => `<div class="pick" data-act="chat-go" data-deal="${m.dealId}"><div class="grow"><div class="small"><b>${esc(dname(m.dealId))}</b> · ${esc(mname(m.by))} <span class="muted">${when(m.at)}</span>${mentionsMe(m) ? ' <span class="chip gold">@나</span>' : ''}</div><div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px">${esc(m.text)}</div></div></div>`).join('')}</div>`;
}
A['chat-go'] = el => { ui.dealTab = 'act'; location.hash = '#/deal/' + encodeURIComponent(el.dataset.deal); };
