/* 딜 데스크 - 바탕 (도구·암호·저장소·엑셀·메일 파일)
 * 화면 코드는 app.js. 여기는 화면을 모른다. */
'use strict';

/* ---------- 작은 도구 ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 7);
const num = v => { const n = parseFloat(String(v ?? '').replace(/[^\d.\-]/g, '')); return isFinite(n) ? n : 0; };
const fmt = n => (n || n === 0) && n !== '' ? Number(n).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) : '';
const localDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const today = () => localDate();
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const shortDate = s => s ? s.slice(5, 10).replace('-', '/') : '';
const when = iso => {
  if (!iso) return '';
  const d = new Date(iso), now = new Date(), m = Math.round((now - d) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return m + '분 전';
  if (m < 60 * 24 && d.getDate() === now.getDate()) return m < 120 ? '1시간 전' : Math.floor(m / 60) + '시간 전';
  const ld = localDate(d), lt = localDate(now);
  if (daysBetween(ld, lt) === 1) return '어제 ' + d.toTimeString().slice(0, 5);
  return (d.getFullYear() === now.getFullYear() ? '' : d.getFullYear() + '/') + shortDate(ld) + ' ' + d.toTimeString().slice(0, 5);
};

/* ---------- 업무 용어 ---------- */
const LENDER_TYPES = ['은행', '증권', '보험', '캐피탈', '카드', '저축은행', '상호금융', '자산운용', '연기금·공제회', '기타'];
const STAGES = [
  { k: 'todo', t: '미접촉', c: '#8e8e93' },
  { k: 'tapped', t: '태핑', c: '#6e6af0' },
  { k: 'sent', t: '자료송부', c: '#2f80ed' },
  { k: 'review', t: '검토중', c: '#e8930c' },
  { k: 'committee', t: '심의예정', c: '#a052d6' },
  { k: 'approved', t: '승인', c: '#1f9d55' },
  { k: 'hold', t: '보류', c: '#9a7b56' },
  { k: 'declined', t: '불참', c: '#d64545' },
];
const STAGE = Object.fromEntries(STAGES.map(s => [s.k, s]));
const DEAL_STAGES = ['소싱', '태핑', '대주모집', '심의', '약정', '기표완료', '드랍'];
const DEAL_KINDS = ['브릿지론', '본PF', 'PF 리파이낸싱', '토지담보대출', '미분양담보대출', '중도금대출', '이주비대출', '기타'];
const LOG_TYPES = { call: '통화', mail: '메일', meet: '미팅', note: '메모', stage: '단계', system: '기록' };
const FOLLOW_DAYS = 5;   // 태핑·자료송부 뒤 이만큼 소식 없으면 팔로업

/* ---------- 암호 ---------- */
const enc = new TextEncoder(), dec = new TextDecoder();
function b64e(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function b64d(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
async function sha256hex(str) { const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(str))); return Array.from(h, x => x.toString(16).padStart(2, '0')).join(''); }
const PBKDF_ITER = 200000;
async function passKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: PBKDF_ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function gcmKey(raw) { return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }
async function seal(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))));
  const all = new Uint8Array(12 + ct.length); all.set(iv); all.set(ct, 12);
  // 앞에 '~' 를 붙인다: base64 가 '+' 로 시작하면 구글 시트가 수식으로 읽어 값이 깨진다 (#ERROR!)
  return '~' + b64e(all);
}
async function open_(key, b64) {
  const all = b64d(String(b64).replace(/^~/, ''));
  return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, key, all.slice(12))));
}
const kidOf = email => sha256hex('dealdesk-kid:' + String(email).trim().toLowerCase());
const tokOf = kB64 => sha256hex('dealdesk-token:' + kB64);
// 비밀번호로 팀 키를 감싼 꾸러미
async function wrapTeamKey(pass, payload) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const k = await passKey(pass, salt);
  return JSON.stringify({ v: 1, salt: b64e(salt), box: await seal(k, payload) });
}
async function unwrapTeamKey(pass, blob) {
  const j = JSON.parse(blob);
  return open_(await passKey(pass, b64d(j.salt)), j.box);
}

/* ---------- 저장소 연결 ---------- */
class RemoteApi {
  constructor(url) { this.url = url; }
  async call(body) {
    let res;
    try {
      res = await fetch(this.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
    } catch (e) { throw new Error('저장소에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.'); }
    const j = await res.json();
    return j;
  }
}
// 저장소 주소가 없을 때: 이 브라우저 안에서만 도는 시험용 저장소 (Apps Script 와 같은 약속)
class MockApi {
  constructor(key) { this.key = key || 'dealdesk-mock-store'; }
  load() { try { return JSON.parse(localStorage.getItem(this.key)) || { tok: null, keys: {}, data: {} }; } catch (e) { return { tok: null, keys: {}, data: {} }; } }
  saveDb(db) { localStorage.setItem(this.key, JSON.stringify(db)); }
  async call(d) {
    await new Promise(r => setTimeout(r, 60));
    const db = this.load(), iso = () => new Date().toISOString();
    if (d.op === 'keyget') return { ok: true, ready: !!db.tok, blob: db.keys[d.kid] || null };
    if (d.op === 'init') { if (db.tok) return { ok: false, error: 'already initialized' }; db.tok = d.tok; db.keys[d.kid] = d.blob; this.saveDb(db); return { ok: true }; }
    if (!db.tok || d.tok !== db.tok) return { ok: false, error: 'forbidden' };
    if (d.op === 'list') {
      const since = d.since ? Date.parse(d.since) : 0;
      const items = Object.entries(db.data).filter(([, r]) => !since || Date.parse(r.at) > since).map(([id, r]) => ({ id, kind: r.kind, ct: r.del ? '' : r.ct, at: r.at, by: r.by, del: !!r.del }));
      return { ok: true, items, now: iso() };
    }
    if (d.op === 'put' || d.op === 'del') {
      const cur = db.data[d.id];
      if (cur && d.base !== undefined && d.base !== cur.at) return { ok: false, error: 'conflict', item: { id: d.id, ...cur, ct: cur.del ? '' : cur.ct } };
      // 같은 밀리초에 두 번 쓰면 충돌 확인이 헷갈리므로 1ms 씩 민다
      let at = iso(); if (cur && at <= cur.at) at = new Date(Date.parse(cur.at) + 1).toISOString();
      db.data[d.id] = d.op === 'put' ? { kind: d.kind, ct: d.ct, at, by: d.by, del: false } : { kind: cur ? cur.kind : d.kind, ct: '', at, by: d.by, del: true };
      this.saveDb(db);
      return { ok: true, at };
    }
    if (d.op === 'putmany') {
      const at = iso(), results = [];
      for (const it of d.items || []) {
        const cur = db.data[it.id];
        if (cur && it.base !== undefined && it.base !== cur.at) { results.push({ id: it.id, ok: false, error: 'conflict' }); continue; }
        db.data[it.id] = { kind: it.kind, ct: it.ct, at, by: d.by, del: false };
        results.push({ id: it.id, ok: true, at });
      }
      this.saveDb(db);
      return { ok: true, results };
    }
    if (d.op === 'keyset') { db.keys[d.kid] = d.blob; this.saveDb(db); return { ok: true }; }
    if (d.op === 'keydel') { delete db.keys[d.kid]; this.saveDb(db); return { ok: true }; }
    return { ok: false, error: 'unknown op' };
  }
}

/* ---------- 레코드 저장소 (메모리 + 동기화) ---------- */
const Store = {
  api: null, key: null, tok: null, mid: null, kid: null,
  recs: new Map(),   // id -> { id, kind, at, by, v }
  since: '',
  listeners: [],
  onChange(fn) { this.listeners.push(fn); },
  emit() { this.listeners.forEach(f => f()); },

  all(kind) { const out = []; for (const r of this.recs.values()) if (r.kind === kind) out.push(r.v); return out; },
  get(id) { const r = this.recs.get(id); return r ? r.v : null; },
  meta(id) { return this.recs.get(id) || null; },

  async req(body) {
    const j = await this.api.call({ ...body, tok: this.tok });
    if (!j.ok && j.error === 'forbidden') throw new Error('저장소가 이 팀 키를 받지 않습니다. 다시 로그인해 주세요.');
    return j;
  },

  async sync() {
    const j = await this.req({ op: 'list', since: this.since });
    if (!j.ok) throw new Error(j.error || '불러오기 실패');
    let changed = false;
    for (const it of j.items) {
      if (it.del) { if (this.recs.delete(it.id)) changed = true; continue; }
      const cur = this.recs.get(it.id);
      if (cur && cur.at === it.at) continue;
      try { this.recs.set(it.id, { id: it.id, kind: it.kind, at: it.at, by: it.by, v: await open_(this.key, it.ct) }); changed = true; }
      catch (e) { console.warn('열 수 없는 레코드', it.id); }
    }
    // 시계가 다른 서버라 since 는 서버 시각을 쓴다. 같은 밀리초 누락을 막으려 1초 당긴다
    if (j.now) this.since = new Date(Date.parse(j.now) - 1000).toISOString();
    if (changed) this.emit();
    return changed;
  },

  // 새로 만들기 (id 는 kind:무작위)
  async create(kind, obj) {
    const v = { ...obj, id: obj.id || kind + ':' + uid() };
    const j = await this.req({ op: 'put', id: v.id, kind, ct: await seal(this.key, v), by: this.mid });
    if (!j.ok) throw new Error(j.error === 'too large' ? '내용이 너무 깁니다.' : (j.error || '저장 실패'));
    this.recs.set(v.id, { id: v.id, kind, at: j.at, by: this.mid, v });
    this.emit();
    return v;
  },

  // 고치기: fn 이 사본을 받아 고친 값을 돌려준다. 남이 먼저 고쳤으면 최신본에 다시 적용한다.
  async update(id, fn) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = this.recs.get(id);
      if (!cur) throw new Error('이미 지워진 항목입니다.');
      const next = fn(JSON.parse(JSON.stringify(cur.v)));
      if (!next) return cur.v;
      const j = await this.req({ op: 'put', id, kind: cur.kind, base: cur.at, ct: await seal(this.key, next), by: this.mid });
      if (j.ok) { this.recs.set(id, { ...cur, at: j.at, by: this.mid, v: next }); this.emit(); return next; }
      if (j.error === 'conflict' && j.item) {
        if (j.item.del) { this.recs.delete(id); this.emit(); throw new Error('다른 분이 지운 항목입니다.'); }
        this.recs.set(id, { id, kind: j.item.kind, at: j.item.at, by: j.item.by, v: await open_(this.key, j.item.ct) });
        continue;
      }
      throw new Error(j.error === 'too large' ? '내용이 너무 깁니다.' : (j.error || '저장 실패'));
    }
    throw new Error('다른 분과 동시에 고치고 있습니다. 잠시 뒤 다시 해 주세요.');
  },

  // 여러 건 한 번에. ops: [{ kind, v, base? }] (v.id 없으면 새로 만든다)
  async putMany(ops) {
    if (!ops.length) return [];
    const out = [];
    for (let i = 0; i < ops.length; i += 150) {
      const chunk = ops.slice(i, i + 150).map(o => ({ ...o, v: { ...o.v, id: o.v.id || o.kind + ':' + uid() } }));
      const items = [];
      for (const o of chunk) items.push({ id: o.v.id, kind: o.kind, ct: await seal(this.key, o.v), base: o.base });
      const j = await this.req({ op: 'putmany', items, by: this.mid });
      if (!j.ok) throw new Error(j.error || '저장 실패');
      j.results.forEach((r, k) => {
        const o = chunk[k];
        if (r.ok) { this.recs.set(o.v.id, { id: o.v.id, kind: o.kind, at: r.at, by: this.mid, v: o.v }); out.push(o.v); }
      });
      if (j.results.some(r => !r.ok)) { await this.sync(); throw new Error('일부 항목을 다른 분이 먼저 고쳐 저장하지 못했습니다. 다시 해 주세요.'); }
    }
    this.emit();
    return out;
  },
  createMany(kind, objs) { return this.putMany(objs.map(v => ({ kind, v }))); },
  updateMany(ids, fn) {
    const ops = [];
    for (const id of ids) {
      const cur = this.recs.get(id); if (!cur) continue;
      const next = fn(JSON.parse(JSON.stringify(cur.v)));
      if (next) ops.push({ kind: cur.kind, v: next, base: cur.at });
    }
    return this.putMany(ops);
  },

  async remove(id) {
    const cur = this.recs.get(id);
    const j = await this.req({ op: 'del', id, kind: cur ? cur.kind : '', by: this.mid });
    if (!j.ok) throw new Error(j.error || '삭제 실패');
    this.recs.delete(id); this.emit();
  },
};

/* ---------- ZIP (압축 없이 담기) + XLSX ---------- */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(files) { // files: [{name, data(string|Uint8Array)}]
  const parts = [], central = []; let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), name);
    off += 30 + name.length + data.length;
  }
  const csize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

/* 엑셀 한 장. rows: [[{v, s}]] (s = 아래 STYLE 번호), cols: 너비 배열, merges: ['A1:F1'] */
const XS = { plain: 0, title: 1, head: 2, text: 3, num: 4, subText: 5, subNum: 6, totText: 7, totNum: 8, note: 9, center: 10, sectText: 11 };
function makeXlsx({ sheet = 'Sheet1', rows, cols, merges = [] }) {
  const x = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const colName = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const sd = rows.map((r, ri) => `<row r="${ri + 1}"${r.h ? ` ht="${r.h}" customHeight="1"` : ''}>` + (r.cells || r).map((c, ci) => {
    if (c == null) return '';
    const ref = colName(ci) + (ri + 1), s = c.s || 0;
    if (c.v === '' || c.v == null) return `<c r="${ref}" s="${s}"/>`;
    if (typeof c.v === 'number') return `<c r="${ref}" s="${s}"><v>${c.v}</v></c>`;
    return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${x(c.v)}</t></is></c>`;
  }).join('') + '</row>').join('');
  const ws = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><cols>${cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${sd}</sheetData>${merges.length ? `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  const font = '맑은 고딕';
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0;-#,##0;&quot;-&quot;"/></numFmts>
<fonts count="5"><font><sz val="10"/><name val="${font}"/></font><font><b/><sz val="14"/><name val="${font}"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="${font}"/></font><font><b/><sz val="10"/><name val="${font}"/></font><font><sz val="9"/><color rgb="FF707070"/><name val="${font}"/></font></fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2B2B2E"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F1F3"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE4DCCB"/></patternFill></fill></fills>
<borders count="2"><border/><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom></border></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="12">
<xf fontId="0"/>
<xf fontId="1" applyFont="1"/>
<xf fontId="2" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf fontId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf fontId="0" borderId="1" numFmtId="164" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf fontId="3" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf fontId="3" fillId="3" borderId="1" numFmtId="164" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"/>
<xf fontId="3" fillId="4" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf fontId="3" fillId="4" borderId="1" numFmtId="164" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"/>
<xf fontId="4" applyFont="1"/>
<xf fontId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf fontId="3" borderId="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
</cellXfs></styleSheet>`;
  return makeZip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${x(sheet.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/styles.xml', data: styles },
    { name: 'xl/worksheets/sheet1.xml', data: ws },
  ]);
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- 메일 ---------- */
// 받는 사람 한 명에게 맞춘 제목·본문 ({기관} 같은 칸 채우기)
function mergeFields(text, f) {
  return String(text || '').replace(/\{(기관|담당자|직함|호칭|딜명|보내는사람|내직함|내부서|내연락처|내이메일|날짜)\}/g, (_, k) => f[k] ?? '');
}
function textToHtml(t) {
  return `<div style="font-family:'맑은 고딕','Malgun Gothic',sans-serif;font-size:10pt;line-height:1.6">${esc(t).replace(/\r?\n/g, '<br>')}</div>`;
}
const b64utf8 = s => b64e(enc.encode(s));
const mimeWord = s => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64utf8(s)}?=`;
const wrap76 = s => s.replace(/.{1,76}/g, '$&\r\n');
// Outlook 에서 '보내지 않은 새 메일'로 열리는 .eml (받는 사람 한 명)
function makeEml({ to, toName, subject, html, attachments = [] }) {
  const bnd = 'dd-' + uid();
  const head = ['X-Unsent: 1', `To: ${toName ? `"${mimeWord(toName)}" ` : ''}<${to}>`, `Subject: ${mimeWord(subject)}`, 'MIME-Version: 1.0'];
  let body;
  if (!attachments.length) {
    head.push('Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64');
    body = wrap76(b64utf8(html));
  } else {
    head.push(`Content-Type: multipart/mixed; boundary="${bnd}"`);
    body = `--${bnd}\r\nContent-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(b64utf8(html))}`;
    for (const a of attachments) {
      const n = mimeWord(a.name);
      body += `--${bnd}\r\nContent-Type: application/octet-stream; name="${n}"\r\nContent-Disposition: attachment; filename="${n}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(a.b64)}`;
    }
    body += `--${bnd}--\r\n`;
  }
  return new Blob([head.join('\r\n') + '\r\n\r\n' + body], { type: 'message/rfc822' });
}
function composeUrl(mode, { to, subject, text }) {
  const q = encodeURIComponent;
  if (mode === 'gmail') return `https://mail.google.com/mail/?view=cm&fs=1&to=${q(to)}&su=${q(subject)}&body=${q(text)}`;
  if (mode === 'owa') return `https://outlook.office.com/mail/deeplink/compose?to=${q(to)}&subject=${q(subject)}&body=${q(text)}`;
  return `mailto:${q(to)}?subject=${q(subject)}&body=${q(text)}`;
}
const fileToB64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(f); });
