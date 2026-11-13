/* 딜 데스크 - 휴대폰·PC 앱 알림 (Web Push)
 * 보내는 사람 브라우저가 받는 기기마다 알림을 암호화(RFC 8291 aes128gcm)하고 VAPID(RFC 8292)로 서명한 뒤,
 * Apps Script 가 그대로 푸시 서비스(FCM·Apple·Mozilla)에 전달한다 (브라우저는 CORS 로 직접 못 보냄).
 * 기록: 'pushkey:vapid' { pub, jwk } - 팀 공용 VAPID 키 (팀 키로 암호화돼 저장)
 *       'pushsub:<해시>' { member, endpoint, p256dh, auth, device, at } - 기기마다 하나
 *       member.notify = { msgs, mention, task } - 종류별 끄기 (없으면 켜짐) */
'use strict';

const b64u = u8 => b64e(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uD = s => b64d(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4));
const cat = (...as) => { const n = as.reduce((a, x) => a + x.length, 0), o = new Uint8Array(n); let p = 0; for (const x of as) { o.set(x, p); p += x.length; } return o; };
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}
// RFC 8291: 알림 내용 암호화. 시험용으로 서버 임시 키·salt 를 넣을 수 있다
async function encryptPush(payload, p256dhB64, authB64, fixed) {
  const uaPub = b64uD(p256dhB64), auth = b64uD(authB64);
  const as = fixed ? fixed.as : await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(auth, shared, cat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = fixed ? fixed.salt : crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(enc.encode(payload), new Uint8Array([2]))));
  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096);
  return cat(salt, rs, new Uint8Array([65]), asPub, ct);
}
// RFC 8292: VAPID 서명 (ES256 - WebCrypto 가 r||s 64바이트를 그대로 준다)
async function vapidAuth(endpoint, vapid) {
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://mirae-dealdesk.github.io' })));
  const key = await crypto.subtle.importKey('jwk', vapid.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body)));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${vapid.pub}`;
}

/* ---------- 팀 VAPID 키 (처음 필요할 때 한 번 만든다) ---------- */
async function vapidKey() {
  const cur = Store.get('pushkey:vapid'); if (cur) return cur;
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const v = { id: 'pushkey:vapid', pub: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))), jwk: await crypto.subtle.exportKey('jwk', kp.privateKey) };
  try { return await Store.create('pushkey', v); } catch (e) { await Store.sync(); return Store.get('pushkey:vapid') || v; }
}

/* ---------- 이 기기 구독 ---------- */
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && location.protocol === 'https:';
const subsOf = mid => Store.all('pushsub').filter(s => s.member === mid);
const deviceName = () => { const u = navigator.userAgent; return /iPhone|iPad/.test(u) ? '아이폰' : /Android/.test(u) ? (/SM-|Samsung/i.test(u) ? '갤럭시' : '안드로이드') : /Windows/.test(u) ? 'Windows PC' : /Mac/.test(u) ? 'Mac' : '이 기기'; };
async function mySub() { if (!pushSupported()) return null; const reg = await navigator.serviceWorker.getRegistration(); return reg ? reg.pushManager.getSubscription() : null; }
async function enablePush() {
  if (!pushSupported()) throw new Error(/iPhone|iPad/.test(navigator.userAgent) ? '아이폰은 사파리 → 공유 → 홈 화면에 추가로 앱을 설치한 뒤, 설치한 앱에서 켜야 합니다 (iOS 16.4 이상).' : '이 브라우저는 앱 알림을 지원하지 않습니다.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('알림 권한이 꺼져 있습니다. 브라우저(또는 휴대폰) 설정에서 이 사이트 알림을 허용해 주세요.');
  const v = await vapidKey();
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub && sub.options && sub.options.applicationServerKey && b64u(new Uint8Array(sub.options.applicationServerKey)) !== v.pub) { await sub.unsubscribe(); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uD(v.pub) });
  const j = sub.toJSON(), id = 'pushsub:' + (await sha256hex(j.endpoint)).slice(0, 24);
  const rec = { id, member: Store.mid, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, device: deviceName(), at: new Date().toISOString() };
  if (Store.get(id)) await Store.update(id, () => rec); else await Store.create('pushsub', rec);
}
async function disablePush() {
  const sub = await mySub();
  if (sub) { const id = 'pushsub:' + (await sha256hex(sub.endpoint)).slice(0, 24); await sub.unsubscribe().catch(() => { }); if (Store.get(id)) await Store.remove(id); }
}

/* ---------- 보내기 ---------- */
const notifyPref = (m, k) => !(m && m.notify && m.notify[k] === false);
// targets: [{ mid, kind: 'msgs'|'mention'|'task' }] - 같은 사람은 한 번만
async function sendPush(targets, note) {
  try {
    const seen = new Set(), subs = [];
    for (const t of targets) {
      if (!t.mid || t.mid === Store.mid || seen.has(t.mid)) continue;
      const m = Store.get(t.mid); if (!m || m.active === false || !notifyPref(m, t.kind)) continue;
      seen.add(t.mid); subs.push(...subsOf(t.mid));
    }
    if (!subs.length) return 0;
    const v = Store.get('pushkey:vapid'); if (!v) return 0;
    const payload = JSON.stringify(note);
    const items = [];
    for (const s of subs) {
      items.push({ id: s.id, endpoint: s.endpoint, body: b64e(await encryptPush(payload, s.p256dh, s.auth)), headers: { Authorization: await vapidAuth(s.endpoint, v), 'Content-Encoding': 'aes128gcm', TTL: '86400', Urgency: 'high' } });
    }
    const j = await Store.req({ op: 'push', items });
    // 없어진 기기(410·404)는 지운다
    if (j && j.ok) for (const r of j.results || []) if (r.code === 404 || r.code === 410) { const it = items.find(x => x.endpoint === r.endpoint); if (it && Store.get(it.id)) Store.remove(it.id).catch(() => { }); }
    return subs.length;
  } catch (e) { console.warn('알림 보내기 실패', e); return 0; }
}
const appUrl = (dealId, tab) => `${location.origin}${location.pathname}?t=${tab || 'act'}#/deal/${encodeURIComponent(dealId)}`;
// 업무 대화: 그 딜 담당자 전원 + @불린 사람
function pushForMsg(m) {
  const d = Store.get(m.dealId) || {};
  const targets = [...(d.owners || []).map(mid => ({ mid, kind: 'msgs' })), ...(m.mentions || []).map(mid => ({ mid, kind: 'mention' }))];
  // @불린 사람은 '불림' 설정을 먼저 본다 (담당이기도 하면 둘 중 하나만 켜져 있어도 받는다)
  const t2 = []; const byMid = {};
  for (const t of targets) (byMid[t.mid] = byMid[t.mid] || []).push(t.kind);
  for (const [mid, kinds] of Object.entries(byMid)) { const mm = Store.get(mid); const k = kinds.find(k => notifyPref(mm, k)); if (k) t2.push({ mid, kind: k }); }
  const who = mname(m.by), body = String(m.text || '').slice(0, 300);
  return sendPush(t2, { title: `${d.name || '딜 데스크'} · ${who}`, body, url: appUrl(m.dealId, 'act'), tag: 'deal-' + m.dealId });
}
function pushForTask(t) {
  if (!t.assignee) return;
  const d = Store.get(t.dealId) || {};
  return sendPush([{ mid: t.assignee, kind: 'task' }], { title: `할 일 · ${d.name || ''}`, body: `${t.title}${t.due ? ' (' + dueLabel(t) + ')' : ''} - ${mname(Store.mid)}`, url: appUrl(t.dealId, 'tasks'), tag: 'task-' + t.id });
}

/* ---------- 설정 화면 카드 ---------- */
async function pushCardHtml() {
  const m = me(), sub = await mySub().catch(() => null);
  const mine = subsOf(Store.mid), here = sub && mine.some(s => s.endpoint === sub.endpoint);
  const sw = (k, label) => `<label class="check"><input type="checkbox" data-chg="notify-pref" data-k="${k}" ${notifyPref(m, k) ? 'checked' : ''}> ${label}</label>`;
  return `<h2>앱 알림 <span class="muted small">휴대폰·PC</span></h2>
    ${!pushSupported() ? `<div class="notice small">${/iPhone|iPad/.test(navigator.userAgent) ? '아이폰은 사파리 → 공유 → <b>홈 화면에 추가</b>로 설치한 앱에서 켤 수 있습니다 (iOS 16.4 이상).' : '이 브라우저는 앱 알림을 지원하지 않습니다. 크롬·엣지·사파리(홈 화면 앱)에서 켜 주세요.'}</div>`
      : here ? `<div class="notice small" style="background:#e8f6ee;color:#177a42">✓ 이 기기(${esc(deviceName())})에서 알림을 받고 있습니다</div><div style="display:flex;gap:6px;margin-top:8px"><button class="btn sm" data-act="push-test">시험 알림 보내기</button><button class="btn sm ghost" data-act="push-off">이 기기 알림 끄기</button></div>`
      : `<div class="small muted" style="margin-bottom:8px">켜면 담당 딜의 새 업무 대화·나를 부른 메시지·내 할 일이 이 기기에 바로 알림으로 옵니다.</div><button class="btn dark" data-act="push-on">이 기기에서 알림 켜기</button>`}
    <div style="margin-top:12px">${sw('msgs', '내가 담당인 딜의 새 업무 대화')}${sw('mention', '나를 @로 불렀을 때')}${sw('task', '나에게 할 일이 지정됐을 때')}</div>
    ${mine.length ? `<div class="small muted">알림 받는 기기: ${mine.map(s => esc(s.device || '기기')).join(', ')}</div>` : ''}`;
}
A['push-on'] = el => { el.disabled = true; act(async () => { await enablePush(); render(); }, '이 기기에서 알림을 켰습니다'); };
A['push-off'] = () => act(async () => { await disablePush(); render(); }, '이 기기 알림을 껐습니다');
A['push-test'] = () => act(async () => {
  const v = Store.get('pushkey:vapid') || await vapidKey(); const subs = subsOf(Store.mid); if (!subs.length) throw new Error('알림 받는 기기가 없습니다');
  const items = [];
  for (const s of subs) items.push({ id: s.id, endpoint: s.endpoint, body: b64e(await encryptPush(JSON.stringify({ title: '딜 데스크 시험 알림', body: `${me().name}님, 알림이 잘 옵니다 ✓`, url: location.origin + location.pathname + '#/home', tag: 'test' }), s.p256dh, s.auth)), headers: { Authorization: await vapidAuth(s.endpoint, v), 'Content-Encoding': 'aes128gcm', TTL: '600', Urgency: 'high' } });
  const j = await Store.req({ op: 'push', items });
  if (!j.ok) throw new Error(j.error === 'unknown op' ? '저장소(Apps Script)가 알림 전달을 아직 모릅니다. 새 코드로 다시 배포해 주세요.' : '보내기 실패: ' + (j.error || ''));
  const bad = (j.results || []).filter(r => r.code >= 300);
  if (bad.length) throw new Error('일부 기기로 못 보냈습니다 (' + bad.map(r => r.code).join(', ') + ')');
}, '시험 알림을 보냈습니다');
C['notify-pref'] = el => act(() => Store.update(Store.mid, m => ({ ...m, notify: { ...(m.notify || {}), [el.dataset.k]: el.checked } })), '저장했습니다');

// 알림을 눌러 열었을 때 ?t=act → 그 탭으로
(() => { const t = new URLSearchParams(location.search).get('t'); if (t && ['act', 'tasks', 'board', 'info'].includes(t)) ui.dealTab = t; })();
