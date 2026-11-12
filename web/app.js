/* 딜 데스크 - 화면 1: 로그인·틀·홈·딜·태핑 보드
 * 화면 2(대주·리스트·메일·활동·설정)는 app-more.js */
'use strict';
const CFG = window.DD_CONFIG || {};
const MOCK = !CFG.API_URL;
Store.api = MOCK ? new MockApi() : new RemoteApi(CFG.API_URL);
const app = $('#app');
const ui = { boardView: 'table', boardFilter: '', lenderType: '', lenderQ: '', feedDeal: '', feedWho: '', feedType: '', dealsFilter: 'active' };
const A = {}, C = {}, I = {};   // 누르기 · 바꾸기 · 입력 처리기 (data-act / data-chg / data-inp)

/* ---------- 알림 ---------- */
let toastT;
function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.className = 'on' + (bad ? ' bad' : '');
  clearTimeout(toastT); toastT = setTimeout(() => { t.className = ''; }, bad ? 4200 : 2400);
}
async function act(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
  catch (e) { console.error(e); toast(e.message || String(e), true); render(); return undefined; }
}

/* ---------- 로그인 유지 ---------- */
const SESS = 'dealdesk-session';
function saveSession(s, remember) { try { sessionStorage.setItem(SESS, JSON.stringify(s)); if (remember) localStorage.setItem(SESS, JSON.stringify(s)); } catch (e) { } }
function loadSession() { try { return JSON.parse(sessionStorage.getItem(SESS) || localStorage.getItem(SESS) || 'null'); } catch (e) { return null; } }
function clearSession() { try { sessionStorage.removeItem(SESS); localStorage.removeItem(SESS); } catch (e) { } }
async function unlock(s) {
  Store.key = await gcmKey(b64d(s.k)); Store.kB64 = s.k; Store.tok = await tokOf(s.k);
  Store.mid = s.mid; Store.kid = s.kid; Store.email = s.email;
  Store.recs.clear(); Store.since = '';
  await Store.sync();
}

/* ---------- 자주 쓰는 값 ---------- */
// 권한: 팀장·관리자는 팀원 관리까지, 팀원은 딜·대주·메일만
const ROLES = [['lead', '팀장'], ['admin', '관리자'], ['member', '팀원']];
const roleName = r => (ROLES.find(x => x[0] === r) || ROLES[2])[1];
const canManage = m => !!m && (m.role === 'lead' || m.role === 'admin');
const me = () => Store.get(Store.mid) || { id: Store.mid, name: '나', email: Store.email || '' };
const members = () => Store.all('member').sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
const mname = id => (Store.get(id) || {}).name || '';
const initials = n => { n = String(n || '?').trim(); return /[가-힣]/.test(n) ? n.slice(-2) : n.slice(0, 2).toUpperCase(); };
const avatar = (id, sm) => id ? `<span class="avatar${sm ? ' sm' : ''}" title="${esc(mname(id))}">${esc(initials(mname(id)))}</span>` : '';
const lenders = () => Store.all('lender').sort((a, b) => typeIdx(a.type) - typeIdx(b.type) || a.name.localeCompare(b.name, 'ko'));
const deals = () => Store.all('deal').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
const isActive = d => d && !['기표완료', '드랍'].includes(d.stage);
const tapsOf = dealId => Store.all('tap').filter(t => t.dealId === dealId);
const logs = () => Store.all('log').sort((a, b) => (b.at || '').localeCompare(a.at || ''));
const lname = id => (Store.get(id) || {}).name || '(삭제된 대주)';
const dname = id => (Store.get(id) || {}).name || '';
function typeIdx(t) { const i = LENDER_TYPES.indexOf(t); return i < 0 ? 99 : i; }
function stageIdx(k) { const i = STAGES.findIndex(s => s.k === k); return i < 0 ? 99 : i; }
function needsFollow(t) {
  if (!t.lastTouch) return false;
  const d = daysBetween(t.lastTouch, today());
  return (['tapped', 'sent'].includes(t.stage) && d >= FOLLOW_DAYS) || (t.stage === 'review' && d >= FOLLOW_DAYS * 2);
}
function sums(taps) {
  const s = { approved: 0, committee: 0, review: 0, active: 0, declined: 0, total: taps.length, responded: 0 };
  for (const t of taps) {
    if (t.stage === 'approved') s.approved += num(t.approved) || num(t.amount);
    if (t.stage === 'committee') s.committee += num(t.amount);
    if (t.stage === 'review') s.review += num(t.amount);
    if (['review', 'committee', 'approved', 'declined', 'hold'].includes(t.stage)) s.responded++;
    if (t.stage === 'declined') s.declined++;
  }
  return s;
}
function addLog(o) { return Store.create('log', { at: new Date().toISOString(), by: Store.mid, ...o }); }
const logsFor = (filter) => logs().filter(filter);
const logHitsLender = (l, lid) => l.lenderId === lid || (l.lenderIds || []).includes(lid);

/* ---------- 그리기 (입력 중이면 미뤘다가) ---------- */
let pending = false;
function typing() { const a = document.activeElement; return a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && !['checkbox', 'file', 'radio', 'button'].includes(a.type); }
function scheduleRender() {
  if (typing()) { if (!pending) { pending = true; document.activeElement.addEventListener('blur', () => setTimeout(() => { if (pending) render(); }, 50), { once: true }); } return; }
  render();
}
function route() { const h = location.hash.replace(/^#\/?/, ''); const [name, ...rest] = h.split('/'); return { name: name || 'home', arg: rest.length ? decodeURIComponent(rest.join('/')) : '' }; }
const NAV = [['home', '홈'], ['deals', '딜'], ['lenders', '대주'], ['lists', '대주 리스트'], ['mail', '메일'], ['feed', '활동'], ['settings', '설정']];
function render() {
  pending = false;
  const r = route(), m = me();
  const navOn = { deal: 'deals', lender: 'lenders' }[r.name] || r.name;
  const view = VIEWS[r.name] || VIEWS.home;
  const sy = window.scrollY;
  app.innerHTML = `${MOCK ? '<div class="mock-bar">시험 모드 - 이 브라우저 안에만 저장됩니다 (config.js 에 저장소 주소를 넣으면 팀 공유)</div>' : ''}
  <header class="top"><div class="top-in">
    <div class="logo" data-act="go" data-to="#/home"><i></i>DEAL <b>DESK</b></div>
    <nav class="nav">${NAV.map(([k, t]) => `<a href="#/${k}" class="${navOn === k ? 'on' : ''}">${t}</a>`).join('')}</nav>
    <div class="me" data-act="go" data-to="#/settings">${avatar(m.id)}<span>${esc(m.name)}</span></div>
  </div></header>
  <main id="main">${view(r.arg)}</main>`;
  if (r.name === ui._lastRoute) window.scrollTo(0, sy);
  ui._lastRoute = r.name;
  if (drawerId) renderDrawer();
}
const VIEWS = {};

/* ---------- 이벤트 (한 곳에서) ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || !A[el.dataset.act]) return;
  if (el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();
  A[el.dataset.act](el, e);
});
document.addEventListener('change', e => { const el = e.target.closest('[data-chg]'); if (el && C[el.dataset.chg]) C[el.dataset.chg](el, e); });
document.addEventListener('input', e => { const el = e.target.closest('[data-inp]'); if (el && I[el.dataset.inp]) I[el.dataset.inp](el, e); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { const s = $$('.scrim').pop(); if (s) s.remove(); else if (drawerId) closeDrawer(); }
  if (e.key === 'Enter' && e.target.matches('input.cell')) e.target.blur();
});
A.go = el => { location.hash = el.dataset.to; };

/* ---------- 창 ---------- */
function modal({ title, body, foot = '', wide = false, onMount }) {
  const el = document.createElement('div'); el.className = 'scrim';
  el.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog"><div class="modal-h"><h2>${esc(title)}</h2><button class="x-btn" data-x aria-label="닫기">×</button></div><div class="modal-b">${body}</div>${foot ? `<div class="modal-f">${foot}</div>` : ''}</div>`;
  const close = () => el.remove();
  el.addEventListener('mousedown', e => { if (e.target === el) close(); });
  el.querySelector('[data-x]').onclick = close;
  document.body.appendChild(el);
  if (onMount) onMount(el, close);
  const f = el.querySelector('input:not([type=checkbox]):not([type=file]), textarea'); if (f) setTimeout(() => f.focus(), 30);
  return { el, close };
}
function askText(title, placeholder = '', value = '') {
  return new Promise(res => {
    let done = false;
    const m = modal({
      title, body: `<input class="input" id="ask" placeholder="${esc(placeholder)}" value="${esc(value)}">`,
      foot: `<button class="btn" data-no>취소</button><button class="btn dark" data-ok>확인</button>`,
      onMount: (el, close) => {
        const ok = () => { done = true; res($('#ask', el).value.trim()); close(); };
        el.querySelector('[data-ok]').onclick = ok;
        el.querySelector('[data-no]').onclick = () => { done = true; res(null); close(); };
        $('#ask', el).onkeydown = e => { if (e.key === 'Enter') ok(); };
      }
    });
    new MutationObserver((_, o) => { if (!document.body.contains(m.el)) { o.disconnect(); if (!done) res(null); } }).observe(document.body, { childList: true });
  });
}
const val = (el, id) => { const x = $('#' + id, el); return x ? x.value.trim() : ''; };
async function copyText(t, msg = '복사했습니다') {
  try { await navigator.clipboard.writeText(t); toast(msg); }
  catch (e) { modal({ title: '아래 글을 복사해 주세요', body: `<textarea class="input" style="min-height:300px">${esc(t)}</textarea>` }); }
}

/* ======================================================================
 * 로그인 · 팀 만들기
 * ==================================================================== */
async function showGate() {
  app.innerHTML = `<div class="gate"><div class="gate-box"><div class="gate-logo">DEAL <b>DESK</b></div><div class="gate-sub">불러오는 중…</div></div></div>`;
  let ready = true;
  try { const j = await Store.api.call({ op: 'keyget', kid: '-' }); ready = !!j.ready; }
  catch (e) { $('.gate-sub').textContent = e.message; return; }
  ready ? gateLogin() : gateSetup();
}
function gateLogin() {
  app.innerHTML = `<div class="gate"><form class="gate-box" id="gf" autocomplete="on">
    <div class="gate-logo">DEAL <b>DESK</b></div>
    <div class="gate-sub">${esc([CFG.COMPANY, CFG.TEAM].filter(Boolean).join(' '))} 딜·대주 관리</div>
    <div class="field"><label>이메일</label><input class="input" id="g-email" type="email" autocomplete="username" required></div>
    <div class="field"><label>비밀번호</label><input class="input" id="g-pass" type="password" autocomplete="current-password" required></div>
    <label class="check"><input type="checkbox" id="g-keep"> 이 기기에서 로그인 유지 (개인 휴대폰·PC 에서만)</label>
    <div class="err" id="g-err"></div>
    <button class="btn dark" style="width:100%;justify-content:center;padding:11px">로그인</button>
    <p class="small muted" style="margin:14px 0 0;text-align:center">계정은 팀장·관리자가 등록합니다. 처음이면 받은 임시 비밀번호로 들어온 뒤 설정에서 바꿔 주세요.</p>
  </form></div>`;
  $('#gf').onsubmit = async e => {
    e.preventDefault();
    const err = m => { $('#g-err').textContent = m; btn.disabled = false; btn.textContent = '로그인'; };
    const btn = $('#gf button'); btn.disabled = true; btn.textContent = '확인 중…';
    const email = $('#g-email').value.trim().toLowerCase(), pass = $('#g-pass').value;
    try {
      const kid = await kidOf(email);
      const j = await Store.api.call({ op: 'keyget', kid });
      if (!j.blob) return err('등록되지 않은 이메일입니다. 팀장·관리자에게 등록을 요청해 주세요.');
      let p; try { p = await unwrapTeamKey(pass, j.blob); } catch (x) { return err('비밀번호가 맞지 않습니다.'); }
      const s = { k: p.k, mid: p.mid, kid, email };
      await unlock(s);
      const m = Store.get(p.mid);
      if (m && m.active === false) return err('사용이 중지된 계정입니다.');
      saveSession(s, $('#g-keep').checked);
      startApp();
    } catch (x) { err(x.message || String(x)); }
  };
}
function gateSetup() {
  app.innerHTML = `<div class="gate"><form class="gate-box" id="gf">
    <div class="gate-logo">DEAL <b>DESK</b></div>
    <div class="gate-sub">처음 한 번 - 팀 만들기 (만든 분이 관리자가 됩니다)</div>
    <div class="row2"><div class="field"><label>이름</label><input class="input" id="s-name" required></div>
    <div class="field"><label>직함</label><input class="input" id="s-title" placeholder="수석매니저"></div></div>
    <div class="field"><label>회사 이메일 (로그인 아이디 · 보내는 메일)</label><input class="input" id="s-email" type="email" required></div>
    <div class="field"><label>휴대폰</label><input class="input" id="s-phone" placeholder="010-0000-0000"></div>
    <div class="row2"><div class="field"><label>비밀번호 (10자 이상)</label><input class="input" id="s-pass" type="password" minlength="10" autocomplete="new-password" required></div>
    <div class="field"><label>한 번 더</label><input class="input" id="s-pass2" type="password" autocomplete="new-password" required></div></div>
    <div class="notice small" style="margin-bottom:12px">모든 딜·대주 정보는 이 비밀번호로 연 팀 키로 암호화돼 저장됩니다. 저장소(구글 시트)에는 알아볼 수 없는 글자만 남습니다.</div>
    <div class="err" id="g-err"></div>
    <button class="btn dark" style="width:100%;justify-content:center;padding:11px">팀 만들기</button>
  </form></div>`;
  $('#gf').onsubmit = async e => {
    e.preventDefault();
    const err = m => { $('#g-err').textContent = m; };
    const pass = $('#s-pass').value;
    if (pass.length < 10) return err('비밀번호는 10자 이상으로 해 주세요.');
    if (pass !== $('#s-pass2').value) return err('비밀번호가 서로 다릅니다.');
    const email = $('#s-email').value.trim().toLowerCase();
    try {
      const kB64 = b64e(crypto.getRandomValues(new Uint8Array(32)));
      const mid = 'member:' + uid(), kid = await kidOf(email);
      const blob = await wrapTeamKey(pass, { k: kB64, mid });
      const j = await Store.api.call({ op: 'init', tok: await tokOf(kB64), kid, blob });
      if (!j.ok) return err(j.error === 'already initialized' ? '이미 팀이 있습니다. 새로고침 후 로그인해 주세요.' : (j.error || '실패'));
      const s = { k: kB64, mid, kid, email };
      await unlock(s);
      await Store.create('member', { id: mid, name: $('#s-name').value.trim(), title: $('#s-title').value.trim(), dept: CFG.TEAM || '', phone: $('#s-phone').value.trim(), tel: '', email, role: 'admin', active: true, mailMode: 'outlook-pc', sig: DEFAULT_SIG });
      await Store.createMany('tpl', DEFAULT_TPLS);
      saveSession(s, false);
      startApp();
      toast('팀을 만들었습니다. 설정에서 팀원을 등록해 주세요.');
    } catch (x) { err(x.message || String(x)); }
  };
}
const DEFAULT_SIG = `{보내는사람} {내직함}\n${CFG.COMPANY || ''} {내부서}\nM. {내연락처}\nE. {내이메일}`;
const DEFAULT_TPLS = [
  { name: 'IM 송부 · 참여 검토 요청', subject: `[${CFG.COMPANY || ''}] {딜명} 대주 참여 검토 요청`, body: `{호칭}, 안녕하십니까.\n${CFG.COMPANY || ''} {내부서} {보내는사람}입니다.\n\n{딜명} 관련하여 대주 참여 검토를 요청드리고자 연락드립니다.\n첨부드린 IM 확인 부탁드리며, 검토 가능 여부와 예상 참여 규모를 회신 주시면 감사하겠습니다.\n\n궁금하신 사항은 언제든 편하게 연락 주십시오.\n감사합니다.` },
  { name: '추가 자료 송부', subject: `[${CFG.COMPANY || ''}] {딜명} 추가 자료 송부`, body: `{호칭}, 안녕하십니까.\n${CFG.COMPANY || ''} {보내는사람}입니다.\n\n{딜명} 관련 요청하신 자료 첨부와 같이 송부드립니다.\n검토에 참고 부탁드립니다.\n\n감사합니다.` },
  { name: '진행 현황 확인 (팔로업)', subject: `[${CFG.COMPANY || ''}] {딜명} 검토 진행 현황 문의`, body: `{호칭}, 안녕하십니까.\n${CFG.COMPANY || ''} {보내는사람}입니다.\n\n지난번 송부드린 {딜명} 건 검토 진행 상황 여쭙고자 연락드립니다.\n추가로 필요하신 자료나 문의 사항이 있으시면 말씀 부탁드립니다.\n\n감사합니다.` },
];

let started = false;
function startApp() {
  if (!started) {
    started = true;
    Store.onChange(scheduleRender);
    window.addEventListener('hashchange', () => { closeDrawer(); render(); window.scrollTo(0, 0); });
    setInterval(() => { if (!document.hidden) Store.sync().catch(() => { }); }, 40000);
    window.addEventListener('focus', () => Store.sync().catch(() => { }));
  }
  render();
}
A.logout = () => { clearSession(); location.hash = ''; location.reload(); };

/* ======================================================================
 * 홈
 * ==================================================================== */
VIEWS.home = () => {
  const m = me(), t0 = today();
  const act = deals().filter(isActive);
  const actIds = new Set(act.map(d => d.id));
  const taps = Store.all('tap').filter(t => actIds.has(t.dealId));
  const follow = taps.filter(needsFollow).sort((a, b) => (a.lastTouch || '').localeCompare(b.lastTouch || ''));
  const upcoming = taps.filter(t => t.meetDate && t.meetDate >= t0 && t.stage !== 'declined').sort((a, b) => a.meetDate.localeCompare(b.meetDate));
  const wk = localDate(new Date(Date.now() + 7 * 864e5));
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const recent = logs();
  const d = new Date();
  return `<div class="page-head"><div><h1>안녕하세요, ${esc(m.name)}님</h1><div class="sub">${d.getMonth() + 1}월 ${d.getDate()}일 ${'일월화수목금토'[d.getDay()]}요일 · ${esc([CFG.COMPANY, CFG.TEAM].filter(Boolean).join(' '))}</div></div>
    <div class="actions"><button class="btn" data-act="mail-new">메일 쓰기</button><button class="btn dark" data-act="deal-new">+ 새 딜</button></div></div>
  <div class="grid g4" style="margin-bottom:16px">
    <div class="card kpi black"><div class="l">진행 중인 딜</div><div class="v">${act.length}<small>건</small></div></div>
    <div class="card kpi"><div class="l">7일 안 심의</div><div class="v">${upcoming.filter(t => t.meetDate <= wk).length}<small>건</small></div></div>
    <div class="card kpi"><div class="l">팔로업 필요</div><div class="v" style="color:${follow.length ? 'var(--amber)' : 'inherit'}">${follow.length}<small>곳</small></div></div>
    <div class="card kpi"><div class="l">이번 주 팀 활동</div><div class="v">${recent.filter(l => l.at >= weekAgo).length}<small>건</small></div></div>
  </div>
  <div class="split">
    <div>${act.length ? `<div class="grid g2">${act.map(dealCard).join('')}</div>` : `<div class="card empty"><b>진행 중인 딜이 없습니다</b>오른쪽 위 '+ 새 딜'로 시작하세요</div>`}</div>
    <div class="grid">
      <div class="card"><h2>팔로업 필요</h2>${follow.length ? follow.slice(0, 10).map(t => `<div class="pick" data-act="tap" data-id="${t.id}"><div class="grow"><b>${esc(lname(t.lenderId))}</b> <span class="muted small">${esc(dname(t.dealId))}</span><div class="small muted">${STAGE[t.stage].t} · 마지막 접촉 ${daysBetween(t.lastTouch, t0)}일 전</div></div>${avatar(t.owner, 1)}</div>`).join('') : '<div class="muted small">밀린 대주가 없습니다 👍</div>'}</div>
      <div class="card"><h2>다가오는 심의</h2>${upcoming.length ? upcoming.slice(0, 10).map(t => `<div class="pick" data-act="tap" data-id="${t.id}"><div class="grow"><b>${esc(lname(t.lenderId))}</b> <span class="muted small">${esc(dname(t.dealId))}</span><div class="small muted">${fmt(num(t.amount)) ? fmt(num(t.amount)) + '억 · ' : ''}${STAGE[t.stage].t}</div></div><span class="chip ${t.meetDate <= wk ? 'gold' : ''}">${shortDate(t.meetDate)} ${dday(t.meetDate)}</span></div>`).join('') : '<div class="muted small">잡힌 심의 일정이 없습니다</div>'}</div>
      <div class="card"><h2>최근 활동</h2>${feedHtml(recent.slice(0, 12), true)}<div style="margin-top:8px"><a href="#/feed">전체 보기 →</a></div></div>
    </div>
  </div>`;
};
function dday(d) { const n = daysBetween(today(), d); return n === 0 ? 'D-day' : 'D-' + n; }
function dealCard(d) {
  const taps = tapsOf(d.id), s = sums(taps), tgt = num(d.target);
  const base = Math.max(tgt, s.approved + s.committee + s.review) || 1;
  const w = v => (v / base * 100).toFixed(1) + '%';
  const follow = taps.filter(needsFollow).length;
  return `<div class="card deal-card" data-act="go" data-to="#/deal/${encodeURIComponent(d.id)}">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><div class="t">${esc(d.name)}</div><div class="meta">${esc([d.sponsor, d.builder].filter(Boolean).join(' · ') || d.location || '')}</div></div><div style="display:flex;gap:-4px">${(d.owners || []).slice(0, 3).map(o => avatar(o, 1)).join('')}</div></div>
    <div class="chips"><span class="chip">${esc(d.kind || '')}</span><span class="chip gold">${esc(d.stage || '')}</span>${d.rate ? `<span class="chip">${esc(pctOf(d.rate, 12))}</span>` : ''}${d.term ? `<span class="chip">${esc(monthsOf(d.term))}</span>` : ''}${d.due ? `<span class="chip">기표 ${shortDate(d.due)}</span>` : ''}${follow ? `<span class="chip warn">팔로업 ${follow}</span>` : ''}</div>
    <div class="bar"><span style="width:${w(s.approved)};background:var(--green)"></span><span style="width:${w(s.committee)};background:#a052d6"></span><span style="width:${w(s.review)};background:var(--amber)"></span></div>
    <div class="bar-legend"><span>목표 <b>${tgt ? fmt(tgt) + '억' : '-'}</b></span><span class="lg" style="--c:var(--green)">승인 <b>${fmt(s.approved) || 0}</b></span><span class="lg" style="--c:#a052d6">심의 <b>${fmt(s.committee) || 0}</b></span><span class="lg" style="--c:var(--amber)">검토 <b>${fmt(s.review) || 0}</b></span></div>
    <div class="small muted">대주 ${s.total}곳 태핑 · 회신 ${s.responded}곳${s.declined ? ` · 불참 ${s.declined}` : ''}</div>
  </div>`;
}
function feedHtml(list, compact) {
  if (!list.length) return '<div class="muted small">아직 기록이 없습니다</div>';
  return `<div class="feed">${list.map(l => {
    const who = l.lenderIds && l.lenderIds.length > 1 ? `${esc(lname(l.lenderIds[0]))} 외 ${l.lenderIds.length - 1}곳` : esc(l.lenderId ? lname(l.lenderId) : '');
    return `<div class="fi">${avatar(l.by, 1)}<div><div class="h"><b>${esc(mname(l.by))}</b> · ${when(l.at)}${l.dealId ? ` · <a href="#/deal/${encodeURIComponent(l.dealId)}">${esc(dname(l.dealId))}</a>` : ''}</div>
      <div class="x${compact ? ' small' : ''}"><span class="tag ${l.type}">${LOG_TYPES[l.type] || ''}</span>${who ? `<b>${who}</b> ` : ''}${esc(compact && l.text.length > 90 ? l.text.slice(0, 90) + '…' : l.text)}</div></div></div>`;
  }).join('')}</div>`;
}

/* ======================================================================
 * 딜 목록
 * ==================================================================== */
VIEWS.deals = () => {
  const f = ui.dealsFilter;
  const list = deals().filter(d => f === 'all' ? true : f === 'active' ? isActive(d) : !isActive(d));
  return `<div class="page-head"><div><h1>딜</h1><div class="sub">진행 중 ${deals().filter(isActive).length}건 · 전체 ${deals().length}건</div></div>
    <div class="actions"><div class="seg">${[['active', '진행 중'], ['done', '종결·드랍'], ['all', '전체']].map(([k, t]) => `<button class="${f === k ? 'on' : ''}" data-act="deals-filter" data-k="${k}">${t}</button>`).join('')}</div><button class="btn dark" data-act="deal-new">+ 새 딜</button></div></div>
  <div class="card" style="padding:0"><div class="tbl-wrap"><table class="t"><thead><tr><th>딜</th><th>유형</th><th>단계</th><th class="num">목표(억)</th><th class="num">승인</th><th class="num">심의·검토</th><th class="num">대주</th><th>담당</th><th>기표 목표</th></tr></thead><tbody>
  ${list.map(d => { const s = sums(tapsOf(d.id)); return `<tr class="row" data-act="go" data-to="#/deal/${encodeURIComponent(d.id)}" style="cursor:pointer"><td><b>${esc(d.name)}</b><div class="small muted">${esc([d.sponsor, d.builder].filter(Boolean).join(' · '))}</div></td><td>${esc(d.kind || '')}</td><td><span class="chip gold">${esc(d.stage || '')}</span></td><td class="num">${fmt(num(d.target))}</td><td class="num">${fmt(s.approved)}</td><td class="num">${fmt(s.committee + s.review)}</td><td class="num">${s.total}</td><td>${(d.owners || []).map(o => avatar(o, 1)).join(' ')}</td><td>${esc(d.due || '')}</td></tr>`; }).join('') || '<tr><td colspan="9" class="empty">해당하는 딜이 없습니다</td></tr>'}
  </tbody></table></div></div>`;
};
A['deals-filter'] = el => { ui.dealsFilter = el.dataset.k; render(); };
A['deal-new'] = () => dealForm();
A['deal-edit'] = el => dealForm(Store.get(el.dataset.id));

/* 딜 입력 창(dealForm)·딜 화면(VIEWS.deal)·stageSelect 는 deal.js */
A['board-filter'] = el => { ui.boardFilter = el.dataset.k; render(); };
A['board-view'] = el => { ui.boardView = el.dataset.k; render(); };

/* 단계 바꾸기 (불참이면 사유를 묻는다) */
async function setStage(tapId, k) {
  const t = Store.get(tapId); if (!t || t.stage === k) return;
  let reason = '';
  if (k === 'declined') { reason = await askText('불참 사유', '예: 서울 권역 외 참여 어려움', t.reason || ''); if (reason === null) { render(); return; } }
  const from = t.stage;
  await Store.update(tapId, v => { v.stage = k; v.lastTouch = today(); if (k === 'declined') v.reason = reason; return v; });
  await addLog({ dealId: t.dealId, tapId, lenderId: t.lenderId, type: 'stage', text: `${STAGE[from].t} → ${STAGE[k].t}${reason ? ' · ' + reason : ''}` });
}
C.stage = el => act(() => setStage(el.dataset.id, el.value));
C.tapfield = el => {
  const id = el.dataset.id, f = el.dataset.f;
  let v = el.value.trim();
  if (f === 'amount' || f === 'approved') v = v === '' ? '' : num(v);
  act(async () => {
    const t = Store.get(id); if (!t) return;
    if ((t[f] ?? '') === v) return;
    await Store.update(id, x => { x[f] = v; return x; });
    if (f === 'meetDate' && v) await addLog({ dealId: t.dealId, tapId: id, lenderId: t.lenderId, type: 'note', text: `심의 예정일 ${v}` });
  });
};
async function doLog(tapId, type, text, stage) {
  const t = Store.get(tapId);
  if (!t) return toast('대주를 골라 주세요', true);
  text = (text || '').trim();
  if (!text && !stage) return toast('내용을 적어 주세요', true);
  await act(async () => {
    if (stage && stage !== t.stage) await setStage(tapId, stage);
    if (text) {
      await addLog({ dealId: t.dealId, tapId, lenderId: t.lenderId, type, text });
      await Store.update(tapId, v => { v.lastTouch = today(); if (v.stage === 'todo' && type !== 'note') v.stage = 'tapped'; return v; });
    }
  }, '기록했습니다');
}
A.qlog = async () => {
  const tapId = $('#q-tap').value, type = $('#q-type').value, text = $('#q-text').value, stage = $('#q-stage').value;
  $('#q-text').blur();
  await doLog(tapId, type, text, stage);
  if ($('#q-text')) { $('#q-text').value = ''; $('#q-stage').value = ''; }
};
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'q-text' && !e.isComposing) { e.preventDefault(); A.qlog(); } });

/* ---------- 대주 추가 (DB·리스트·추천에서) ---------- */
function recommend(deal) {
  const on = new Set(tapsOf(deal.id).map(t => t.lenderId));
  const score = {}, why = {};
  for (const t of Store.all('tap')) {
    if (t.dealId === deal.id || on.has(t.lenderId)) continue;
    const od = Store.get(t.dealId); if (!od) continue;
    const same = od.kind === deal.kind;
    let s = 0;
    if (t.stage === 'approved') s = same ? 5 : 3;
    else if (['committee', 'review'].includes(t.stage)) s = same ? 2 : 1;
    else if (t.stage === 'declined') s = same ? -2 : -0.5;
    score[t.lenderId] = (score[t.lenderId] || 0) + s;
    if (s > 0) (why[t.lenderId] = why[t.lenderId] || []).push(`${od.name} ${STAGE[t.stage].t}`);
  }
  return Object.keys(score).filter(k => score[k] > 0 && Store.get(k)).sort((a, b) => score[b] - score[a]).slice(0, 12).map(k => ({ id: k, why: why[k].slice(0, 2).join(' · ') }));
}
A['tap-add'] = el => {
  const deal = Store.get(el.dataset.id); if (!deal) return;
  const on = new Set(tapsOf(deal.id).map(t => t.lenderId));
  const rec = recommend(deal);
  const lists = Store.all('list');
  const sel = new Set();
  let q = '', ty = '';
  modal({
    title: `대주 추가 · ${deal.name}`, wide: true,
    body: `<div class="toolbar"><div class="search"><input class="input" id="pa-q" placeholder="기관 이름 검색"></div>
      <select class="input" id="pa-ty" style="width:auto"><option value="">유형 전체</option>${LENDER_TYPES.map(t => `<option>${t}</option>`).join('')}</select>
      ${lists.length ? `<select class="input" id="pa-list" style="width:auto"><option value="">저장 리스트로 고르기</option>${lists.map(l => `<option value="${l.id}">${esc(l.name)} (${(l.items || []).length})</option>`).join('')}</select>` : ''}
      <button class="btn" id="pa-new">+ 새 대주 등록</button></div>
      ${rec.length ? `<h3>추천 <span class="muted small">- 다른 딜에서 긍정적이었던 대주</span></h3><div class="pick-list" style="max-height:180px;margin-bottom:14px" id="pa-rec"></div>` : ''}
      <h3>대주 DB <span class="muted small" id="pa-n"></span></h3><div class="pick-list" id="pa-list-box"></div>`,
    foot: `<span class="muted small" id="pa-sel" style="margin-right:auto"></span><button class="btn" data-no>취소</button><button class="btn dark" data-ok>보드에 추가</button>`,
    onMount: (el, close) => {
      const row = (L, why) => `<label class="pick"><input type="checkbox" value="${L.id}" ${sel.has(L.id) ? 'checked' : ''}><div class="grow"><b>${esc(L.name)}</b> <span class="muted small">${esc(L.type || '')}</span>${why ? `<div class="why">${esc(why)}</div>` : ''}</div><span class="small muted">${esc(((L.contacts || [])[0] || {}).name || '')}</span></label>`;
      const draw = () => {
        const list = lenders().filter(L => !on.has(L.id) && (!ty || L.type === ty) && (!q || L.name.toLowerCase().includes(q.toLowerCase())));
        $('#pa-list-box', el).innerHTML = list.map(L => row(L)).join('') || '<div class="empty">없습니다. 위에서 새 대주를 등록하세요</div>';
        $('#pa-n', el).textContent = `${list.length}곳`;
        if ($('#pa-rec', el)) $('#pa-rec', el).innerHTML = rec.filter(r => !on.has(r.id)).map(r => row(Store.get(r.id), r.why)).join('');
        $('#pa-sel', el).textContent = sel.size ? `${sel.size}곳 선택` : '';
      };
      el.addEventListener('change', e => {
        if (e.target.type === 'checkbox') { e.target.checked ? sel.add(e.target.value) : sel.delete(e.target.value); $$(`input[value="${e.target.value}"]`, el).forEach(c => c.checked = e.target.checked); $('#pa-sel', el).textContent = sel.size ? `${sel.size}곳 선택` : ''; }
        if (e.target.id === 'pa-ty') { ty = e.target.value; draw(); }
        if (e.target.id === 'pa-list') { const L = Store.get(e.target.value); (L ? L.items : []).forEach(it => { if (!on.has(it.lenderId) && Store.get(it.lenderId)) sel.add(it.lenderId); }); e.target.value = ''; draw(); }
      });
      $('#pa-q', el).oninput = e => { q = e.target.value.trim(); draw(); };
      $('#pa-new', el).onclick = () => lenderForm(null, L => { sel.add(L.id); draw(); });
      el.querySelector('[data-no]').onclick = close;
      el.querySelector('[data-ok]').onclick = async () => {
        if (!sel.size) return toast('대주를 골라 주세요', true);
        await act(async () => {
          const objs = [...sel].map(lid => ({ dealId: deal.id, lenderId: lid, stage: 'todo', amount: '', approved: '', meetDate: '', note: '', internal: '', reason: '', owner: Store.mid, lastTouch: '', tranche: '' }));
          await Store.createMany('tap', objs);
          await addLog({ dealId: deal.id, type: 'system', text: `태핑 대상 ${objs.length}곳 추가: ${objs.slice(0, 6).map(o => lname(o.lenderId)).join(', ')}${objs.length > 6 ? ' 외' : ''}`, lenderIds: objs.map(o => o.lenderId) });
          close();
        }, `${sel.size}곳을 보드에 올렸습니다`);
      };
      draw();
    }
  });
};

/* ---------- 대주 상세 서랍 ---------- */
let drawerId = null;
A.tap = el => { drawerId = el.dataset.id; renderDrawer(); };
function closeDrawer() { drawerId = null; const d = $('#drawer'); if (d) d.remove(); const s = $('#drawer-scrim'); if (s) s.remove(); }
A['drawer-close'] = closeDrawer;
function renderDrawer() {
  const t = Store.get(drawerId); if (!t) return closeDrawer();
  let dr = $('#drawer');
  if (dr && dr.contains(document.activeElement) && typing()) return;   // 쓰는 중엔 그대로
  if (!dr) {
    const s = document.createElement('div'); s.id = 'drawer-scrim'; s.className = 'drawer-scrim'; s.onclick = closeDrawer; document.body.appendChild(s);
    dr = document.createElement('aside'); dr.id = 'drawer'; dr.className = 'drawer'; document.body.appendChild(dr);
  }
  const L = Store.get(t.lenderId) || { name: '(삭제된 대주)', contacts: [] }, d = Store.get(t.dealId) || {};
  const hist = logsFor(l => l.dealId === t.dealId && (l.tapId === t.id || logHitsLender(l, t.lenderId)));
  const others = Store.all('tap').filter(x => x.lenderId === t.lenderId && x.dealId !== t.dealId);
  dr.innerHTML = `<div class="drawer-h"><div><div class="small muted">${esc(d.name || '')}</div><h2 style="margin:2px 0 6px"><a href="#/lender/${encodeURIComponent(t.lenderId)}">${esc(L.name)}</a></h2><div class="chips"><span class="chip">${esc(L.type || '')}</span>${stageSelect(t)}${needsFollow(t) ? '<span class="chip warn">팔로업 필요</span>' : ''}</div></div><button class="x-btn" data-act="drawer-close">×</button></div>
  <div class="drawer-b">
    <div class="row3"><div class="field"><label>검토금액(억)</label><input class="input" inputmode="decimal" data-chg="tapfield" data-f="amount" data-id="${t.id}" value="${esc(t.amount ?? '')}"></div>
      <div class="field"><label>승인금액(억)</label><input class="input" inputmode="decimal" data-chg="tapfield" data-f="approved" data-id="${t.id}" value="${esc(t.approved ?? '')}"></div>
      <div class="field"><label>심의 예정일</label><input class="input" type="date" data-chg="tapfield" data-f="meetDate" data-id="${t.id}" value="${esc(t.meetDate || '')}"></div></div>
    <div class="row2">${trList(d).length ? `<div class="field"><label>트랜치</label><select class="input" data-chg="tapfield" data-f="tranche" data-id="${t.id}"><option value="">-</option>${trList(d).map(x => `<option ${t.tranche === x.name ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>` : ''}
      <div class="field"><label>우리 담당</label><select class="input" data-chg="tapfield" data-f="owner" data-id="${t.id}">${members().filter(m => m.active !== false).map(m => `<option value="${m.id}" ${t.owner === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div></div>
    <div class="field"><label>비고 (엑셀 송부용에 나가는 말)</label><input class="input" data-chg="tapfield" data-f="note" data-id="${t.id}" value="${esc(t.note || '')}" placeholder="예: 5/12 1차 심의 예정"></div>
    ${t.stage === 'declined' ? `<div class="field"><label>불참 사유</label><input class="input" data-chg="tapfield" data-f="reason" data-id="${t.id}" value="${esc(t.reason || '')}"></div>` : ''}
    <div class="field"><label>내부 메모 (팀 안에서만)</label><textarea class="input" style="min-height:60px" data-chg="tapfield" data-f="internal" data-id="${t.id}">${esc(t.internal || '')}</textarea></div>

    <h3 style="margin-top:6px">담당자</h3>
    ${(L.contacts || []).map(c => `<div class="contact"><div><div class="n">${esc(c.name)} <span class="muted small">${esc([c.title, c.dept].filter(Boolean).join(' · '))}</span></div><div class="small">${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ''}${c.phone && c.email ? ' · ' : ''}${c.email ? esc(c.email) : ''}</div>${c.memo ? `<div class="small muted">${esc(c.memo)}</div>` : ''}</div>${c.email ? `<button class="btn sm" data-act="mail-one" data-lender="${L.id}" data-contact="${c.cid}" data-deal="${t.dealId}">메일</button>` : ''}</div>`).join('') || '<div class="muted small" style="margin-bottom:8px">등록된 담당자가 없습니다</div>'}
    <button class="btn sm" data-act="contact-add" data-id="${t.lenderId}">+ 담당자</button>
    ${L.prefs ? `<div class="notice small" style="margin-top:10px"><b>성향·조건</b> ${esc(L.prefs)}</div>` : ''}
    ${others.length ? `<div class="small muted" style="margin-top:10px">다른 딜: ${others.map(o => `${esc(dname(o.dealId))} <b>${STAGE[o.stage].t}</b>${o.reason ? ' (' + esc(o.reason) + ')' : ''}`).join(' · ')}</div>` : ''}

    <h3 style="margin-top:18px">기록 남기기</h3>
    <div class="seg" id="d-type" style="margin-bottom:8px">${['call', 'mail', 'meet', 'note'].map((k, i) => `<button class="${i === 0 ? 'on' : ''}" data-k="${k}" data-act="dtype">${LOG_TYPES[k]}</button>`).join('')}</div>
    <textarea class="input" id="d-text" style="min-height:70px" placeholder="통화·미팅 내용, 상대 요구 조건 등"></textarea>
    <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn dark" data-act="dlog" data-id="${t.id}">기록</button></div>

    <h3 style="margin-top:18px">이력</h3>${feedHtml(hist)}
    <div style="margin-top:24px;border-top:1px solid var(--line2);padding-top:12px"><button class="btn sm danger" data-act="tap-remove" data-id="${t.id}">보드에서 빼기</button></div>
  </div>`;
}
A.dtype = el => { $$('#d-type button').forEach(b => b.classList.toggle('on', b === el)); };
A.dlog = async el => {
  const type = ($('#d-type button.on') || {}).dataset?.k || 'note', text = $('#d-text').value;
  $('#d-text').blur();
  await doLog(el.dataset.id, type, text, '');
  renderDrawer();
};
A['tap-remove'] = async el => {
  const t = Store.get(el.dataset.id); if (!t) return;
  if (!confirm(`${lname(t.lenderId)}을(를) 이 딜의 태핑 보드에서 뺄까요? (기록은 남습니다)`)) return;
  await act(async () => { await Store.remove(t.id); closeDrawer(); }, '뺐습니다');
};

/* ---------- 카톡 보고 · 엑셀 ---------- */
A.kakao = el => {
  const d = Store.get(el.dataset.id), taps = tapsOf(d.id), s = sums(taps), t0 = new Date();
  const line = t => `- ${lname(t.lenderId)}${num(t.amount) || num(t.approved) ? ' ' + fmt(t.stage === 'approved' ? (num(t.approved) || num(t.amount)) : num(t.amount)) : ''}${t.meetDate && t.stage !== 'approved' ? ` (${shortDate(t.meetDate)} 심의)` : ''}${t.note ? ' · ' + t.note : ''}`;
  const grp = (k, label, showSum) => { const g = taps.filter(t => t.stage === k); if (!g.length) return ''; const sum = g.reduce((a, t) => a + (k === 'approved' ? (num(t.approved) || num(t.amount)) : num(t.amount)), 0); return `\n■ ${label} ${g.length}곳${showSum && sum ? `, ${fmt(sum)}억` : ''}\n${g.map(line).join('\n')}`; };
  const light = taps.filter(t => ['tapped', 'sent'].includes(t.stage));
  const dec = taps.filter(t => t.stage === 'declined');
  const txt = `[${d.name}] 대주 태핑 현황 (${t0.getMonth() + 1}/${t0.getDate()})
${num(d.target) ? `목표 ${fmt(num(d.target))}억 / ` : ''}승인 ${fmt(s.approved) || 0}억 · 심의 ${fmt(s.committee) || 0}억 · 검토 ${fmt(s.review) || 0}억 (단위: 억원)
${grp('approved', '승인', 1)}${grp('committee', '심의예정', 1)}${grp('review', '검토중', 1)}${grp('hold', '보류', 0)}${light.length ? `\n■ 자료송부·태핑 ${light.length}곳\n- ${light.map(t => lname(t.lenderId)).join(', ')}` : ''}${dec.length ? `\n■ 불참 ${dec.length}곳\n${dec.map(t => `- ${lname(t.lenderId)}${t.reason ? ': ' + t.reason : ''}`).join('\n')}` : ''}`;
  copyText(txt.trim(), '카톡에 붙여넣을 현황을 복사했습니다');
};
A.export = el => {
  const d = Store.get(el.dataset.id);
  modal({
    title: '엑셀 내보내기',
    body: `<div class="field"><label>양식</label><div class="seg" id="x-mode"><button class="on" data-k="int">본부·심사 보고용</button><button data-k="ext">외부 송부용</button></div></div>
      <p class="small muted" id="x-desc">단계·검토/승인 금액·심의일·비고·내부 메모·담당까지 모두 담습니다.</p>
      <label class="check"><input type="checkbox" id="x-dec" checked> 불참 대주도 넣기 (아래 '참여 불가' 칸, 사유 포함)</label>
      <label class="check"><input type="checkbox" id="x-todo"> 아직 연락 안 한(미접촉) 대주도 넣기</label>`,
    foot: `<button class="btn" data-no>취소</button><button class="btn dark" data-ok>내려받기</button>`,
    onMount: (m, close) => {
      let mode = 'int';
      $$('#x-mode button', m).forEach(b => b.onclick = () => { mode = b.dataset.k; $$('#x-mode button', m).forEach(x => x.classList.toggle('on', x === b)); $('#x-desc', m).textContent = mode === 'int' ? '단계·검토/승인 금액·심의일·비고·내부 메모·담당까지 모두 담습니다.' : '구분·기관·검토금액·진행 현황·비고만 담습니다. 내부 메모·담당자는 빠집니다.'; $('#x-dec', m).checked = mode === 'int'; });
      m.querySelector('[data-no]').onclick = close;
      m.querySelector('[data-ok]').onclick = () => { exportXlsx(d, mode, $('#x-dec', m).checked, $('#x-todo', m).checked); close(); };
    }
  });
};
function exportXlsx(d, mode, withDec, withTodo) {
  const taps = tapsOf(d.id).filter(t => (withTodo || t.stage !== 'todo'));
  const live = taps.filter(t => t.stage !== 'declined'), dec = withDec ? taps.filter(t => t.stage === 'declined') : [];
  const s = sums(taps), dt = new Date(), ymd = `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`;
  const ext = mode === 'ext';
  const head = ext ? ['구분', '기관명', '검토금액(억원)', '진행 현황', '비고'] : ['구분', '기관명', '진행 단계', '검토금액(억원)', '승인금액(억원)', '심의 예정일', '비고', '내부 메모', '담당', '최근 접촉'];
  const cols = ext ? [12, 22, 15, 16, 46] : [12, 22, 11, 14, 14, 13, 36, 36, 9, 11];
  const N = head.length, rows = [], merges = [];
  const blank = s => Array.from({ length: N }, () => ({ v: '', s }));
  const prog = t => t.stage === 'approved' ? '승인 완료' : t.stage === 'committee' ? `심의 예정${t.meetDate ? ' (' + shortDate(t.meetDate) + ')' : ''}` : STAGE[t.stage].t;
  rows.push([{ v: `▶ ${d.name} 대주 Tapping List`, s: XS.title }, ...blank(0).slice(1)]); merges.push(`A1:${String.fromCharCode(64 + N)}1`);
  rows.push([{ v: `기준일 ${ymd}${num(d.target) ? ` · 목표 ${fmt(num(d.target))}억원` : ''} · 승인 ${fmt(s.approved) || 0}억원 · 심의 ${fmt(s.committee) || 0}억원 · 검토 ${fmt(s.review) || 0}억원`, s: XS.note }, ...blank(0).slice(1)]);
  rows.push(blank(0));
  rows.push(head.map(h => ({ v: h, s: XS.head })));
  const byType = {};
  for (const t of live) { const ty = (Store.get(t.lenderId) || {}).type || '기타'; (byType[ty] = byType[ty] || []).push(t); }
  const types = Object.keys(byType).sort((a, b) => typeIdx(a) - typeIdx(b));
  const amtCol = ext ? 2 : 3, aprCol = ext ? -1 : 4;
  let gA = 0, gP = 0;
  for (const ty of types) {
    const g = byType[ty].sort((a, b) => stageIdx(b.stage) - stageIdx(a.stage) || lname(a.lenderId).localeCompare(lname(b.lenderId), 'ko'));
    const start = rows.length + 1;
    let sa = 0, sp = 0;
    g.forEach((t, i) => {
      const a = num(t.amount), p = t.stage === 'approved' ? (num(t.approved) || a) : 0; sa += a; sp += p;
      const name = lname(t.lenderId);
      rows.push(ext
        ? [{ v: i ? '' : ty, s: XS.sectText }, { v: name, s: XS.text }, { v: a || '', s: XS.num }, { v: prog(t), s: XS.center }, { v: t.note || '', s: XS.text }]
        : [{ v: i ? '' : ty, s: XS.sectText }, { v: name, s: XS.text }, { v: STAGE[t.stage].t, s: XS.center }, { v: a || '', s: XS.num }, { v: p || '', s: XS.num }, { v: t.meetDate || '', s: XS.center }, { v: t.note || '', s: XS.text }, { v: t.internal || '', s: XS.text }, { v: mname(t.owner), s: XS.center }, { v: t.lastTouch || '', s: XS.center }]);
    });
    if (g.length > 1) merges.push(`A${start}:A${start + g.length - 1}`);
    const sub = blank(XS.subText); sub[1] = { v: '소계', s: XS.subText }; sub[amtCol] = { v: sa, s: XS.subNum }; if (aprCol > 0) sub[aprCol] = { v: sp, s: XS.subNum };
    rows.push(sub); gA += sa; gP += sp;
  }
  const tot = blank(XS.totText); tot[0] = { v: '합계', s: XS.totText }; tot[1] = { v: `${live.length}곳`, s: XS.totText }; tot[amtCol] = { v: gA, s: XS.totNum }; if (aprCol > 0) tot[aprCol] = { v: gP, s: XS.totNum };
  rows.push(tot);
  if (dec.length) {
    rows.push(blank(0));
    rows.push([{ v: '참여 불가', s: XS.title }, ...blank(0).slice(1)]);
    rows.push(head.map(h => ({ v: h, s: XS.head })));
    const start = rows.length + 1;
    dec.forEach((t, i) => {
      const L = Store.get(t.lenderId) || {};
      const r = blank(XS.text); r[0] = { v: i ? '' : '불참', s: XS.sectText }; r[1] = { v: `${L.name || ''}${L.type ? ` (${L.type})` : ''}`, s: XS.text };
      r[amtCol] = { v: num(t.amount) || '', s: XS.num }; r[ext ? 3 : 2] = { v: '참여 불가', s: XS.center }; r[ext ? 4 : 6] = { v: t.reason || t.note || '', s: XS.text };
      rows.push(r);
    });
    if (dec.length > 1) merges.push(`A${start}:A${start + dec.length - 1}`);
  }
  const yymmdd = String(dt.getFullYear()).slice(2) + String(dt.getMonth() + 1).padStart(2, '0') + String(dt.getDate()).padStart(2, '0');
  download(makeXlsx({ sheet: 'Tapping List', rows, cols, merges }), `(${CFG.COMPANY || ''}) ${d.name.replace(/[\\/:*?"<>|]/g, ' ')} 대주 Tapping List ${yymmdd}${ext ? '_송부' : '_보고'}.xlsx`);
  addLog({ dealId: d.id, type: 'system', text: `태핑 리스트 엑셀 내려받음 (${ext ? '외부 송부용' : '보고용'})` }).catch(() => { });
}
