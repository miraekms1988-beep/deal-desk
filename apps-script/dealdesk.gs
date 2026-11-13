/**
 * 딜 데스크 - 팀 공용 저장소 (구글 Apps Script 웹 앱)
 *
 * 페이지(GitHub Pages)는 정적이라 팀이 함께 쓰는 기록을 둘 곳이 없다. 이 스크립트가 그 저장소다.
 * 모든 내용은 브라우저에서 팀 키 K 로 AES-GCM 암호화한 뒤 오므로, 시트에는 암호문만 쌓인다.
 * 평문으로 남는 것: 레코드 번호(id)·종류(kind)·고친 시각·고친 사람 번호.
 *
 * 설치 (한 번만):
 *   1. 구글 스프레드시트를 새로 만든다 (이름 예: 딜 데스크 저장소)
 *   2. 확장 프로그램 > Apps Script 에 이 파일 내용을 통째로 붙여넣고 저장
 *   3. 배포 > 새 배포 > 유형: 웹 앱 / 실행 계정: 나 / 액세스 권한: 모든 사용자 > 배포
 *   4. 나온 웹 앱 주소(…/exec)를 web/config.js 의 API_URL 에 넣는다
 *   5. 페이지를 열면 '팀 만들기' 화면이 나온다 - 첫 사람이 관리자가 된다
 *
 * 첨부 파일은 내 드라이브 'DealDesk 첨부 (암호문)' 폴더에 암호문 조각으로 쌓인다 (fput/fget/fdel).
 * 코드를 고치면: 배포 > 배포 관리 > 연필 > 버전 '새 버전' > 배포 (주소 유지). 드라이브 권한이 새로 필요하면
 * 편집기에서 authorizeDrive 를 한 번 실행해 승인한다.
 *
 * 요청 허락 표(tok)는 팀 키에서 뽑은 값이다. 팀 만들기 때 한 번 저장되고 그 뒤 모든 요청이 확인한다.
 * 비밀번호 꾸러미(keys)는 tok 없이 읽을 수 있다 - 비밀번호로 감싼 암호문이라 그 자체로는 쓸모가 없다.
 */

var DATA = 'data';   // id | kind | ct | at(밀리초 숫자 - 시트 날짜는 밀리초가 흐려져 충돌 확인이 틀린다) | by | del
var KEYS = 'keys';   // kid | blob | at
var LOG  = 'log';    // 고칠 때마다 한 줄 (되돌리기용)
var MAX_CT = 45000;  // 시트 칸 하나 상한(50,000자) 안쪽

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    var tok = props.getProperty('TOK');

    // 비밀번호 꾸러미 읽기 - 로그인 전이라 tok 없이
    if (d.op === 'keyget') {
      var ks = sheet(KEYS, ['kid', 'blob', 'at']);
      var r = find(ks, String(d.kid || ''));
      return json({ ok: true, ready: !!tok, blob: r ? String(ks.getRange(r, 2).getValue()) : null });
    }

    // 팀 만들기 - 아직 아무도 없을 때 한 번만
    if (d.op === 'init') {
      if (tok) { return json({ ok: false, error: 'already initialized' }); }
      if (!d.tok || !d.kid || !d.blob) { return json({ ok: false, error: 'bad request' }); }
      props.setProperty('TOK', String(d.tok));
      sheet(KEYS, ['kid', 'blob', 'at']).appendRow([String(d.kid), String(d.blob), new Date()]);
      return json({ ok: true });
    }

    if (!tok || d.tok !== tok) { return json({ ok: false, error: 'forbidden' }); }

    if (d.op === 'list') {
      // since 보다 뒤에 고친 줄만 (처음엔 since 없이 전부)
      var sh = sheet(DATA, ['id', 'kind', 'ct', 'at', 'by', 'del']);
      var last = sh.getLastRow(), out = [], since = d.since ? new Date(d.since).getTime() : 0;
      if (last > 1) {
        var rows = sh.getRange(2, 1, last - 1, 6).getValues();
        for (var i = 0; i < rows.length; i++) {
          if (!rows[i][0]) { continue; }
          var at = rows[i][3] ? new Date(rows[i][3]).getTime() : 0;
          if (since && at <= since) { continue; }
          out.push({ id: String(rows[i][0]), kind: String(rows[i][1]), ct: rows[i][5] ? '' : String(rows[i][2]), at: iso(rows[i][3]), by: String(rows[i][4] || ''), del: !!rows[i][5] });
        }
      }
      return json({ ok: true, items: out, now: iso(new Date()) });
    }

    if (d.op === 'put' || d.op === 'del') {
      var id = String(d.id || '').slice(0, 80), kind = String(d.kind || '').slice(0, 20), ct = String(d.ct || ''), by = String(d.by || '').slice(0, 40);
      if (!id || (d.op === 'put' && (!ct || ct.length > MAX_CT))) { return json({ ok: false, error: ct.length > MAX_CT ? 'too large' : 'bad request' }); }
      var lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        var sh2 = sheet(DATA, ['id', 'kind', 'ct', 'at', 'by', 'del']);
        var row = find(sh2, id);
        // 남이 먼저 고쳤으면 되돌려 보낸다 (base = 내가 읽었던 시각)
        if (row && d.base !== undefined) {
          var cur = iso(sh2.getRange(row, 4).getValue());
          if (d.base !== cur) {
            var v = sh2.getRange(row, 1, 1, 6).getValues()[0];
            return json({ ok: false, error: 'conflict', item: { id: String(v[0]), kind: String(v[1]), ct: v[5] ? '' : String(v[2]), at: iso(v[3]), by: String(v[4] || ''), del: !!v[5] } });
          }
        }
        var now = new Date();
        if (d.op === 'put') {
          if (row) { sh2.getRange(row, 2, 1, 5).setValues([[kind, ct, now.getTime(), by, '']]); }
          else { sh2.appendRow([id, kind, ct, now.getTime(), by, '']); }
        } else if (row) {
          sh2.getRange(row, 3, 1, 4).setValues([['', now.getTime(), by, 1]]);
        }
        sheet(LOG, ['at', 'op', 'id', 'kind', 'by', 'ct']).appendRow([now, d.op, id, kind, by, d.op === 'put' ? ct : '']);
      } finally {
        lock.releaseLock();
      }
      return json({ ok: true, at: iso(now) });
    }

    // 여러 건 한 번에 (메일 발송 기록·붙여넣기 가져오기) - 건마다 결과를 돌려준다
    if (d.op === 'putmany') {
      var items = d.items || [], res = [];
      var lock2 = LockService.getScriptLock();
      lock2.waitLock(30000);
      try {
        var sh3 = sheet(DATA, ['id', 'kind', 'ct', 'at', 'by', 'del']);
        var last3 = sh3.getLastRow(), idx = {};
        if (last3 > 1) {
          var all3 = sh3.getRange(2, 1, last3 - 1, 4).getValues();
          for (var a = 0; a < all3.length; a++) { idx[String(all3[a][0])] = { row: a + 2, at: iso(all3[a][3]) }; }
        }
        var now3 = new Date(), at3 = iso(now3), by3 = String(d.by || '').slice(0, 40), adds = [], logs = [];
        for (var b = 0; b < items.length; b++) {
          var it = items[b], iid = String(it.id || '').slice(0, 80), ict = String(it.ct || '');
          if (!iid || !ict || ict.length > MAX_CT) { res.push({ id: iid, ok: false, error: 'bad request' }); continue; }
          var ex = idx[iid];
          if (ex && it.base !== undefined && it.base !== ex.at) { res.push({ id: iid, ok: false, error: 'conflict' }); continue; }
          if (ex) { sh3.getRange(ex.row, 2, 1, 5).setValues([[String(it.kind || ''), ict, now3.getTime(), by3, '']]); }
          else { adds.push([iid, String(it.kind || ''), ict, now3.getTime(), by3, '']); }
          logs.push([now3, 'put', iid, String(it.kind || ''), by3, ict]);
          res.push({ id: iid, ok: true, at: at3 });
        }
        if (adds.length) { sh3.getRange(sh3.getLastRow() + 1, 1, adds.length, 6).setValues(adds); }
        if (logs.length) { var lg = sheet(LOG, ['at', 'op', 'id', 'kind', 'by', 'ct']); lg.getRange(lg.getLastRow() + 1, 1, logs.length, 6).setValues(logs); }
      } finally {
        lock2.releaseLock();
      }
      return json({ ok: true, results: res });
    }

    // 첨부 파일: 브라우저가 팀 키로 암호화한 뒤 조각(최대 약 4MB 글자)으로 보낸다. 드라이브 폴더에 조각마다 파일 하나.
    if (d.op === 'fput') {
      var fid = safeId(d.fid), idx = Number(d.idx) || 0, data = String(d.data || '');
      if (!fid || !data) { return json({ ok: false, error: 'bad request' }); }
      var folder = fileFolder(), name = fid + '.' + idx;
      var old = folder.getFilesByName(name); while (old.hasNext()) { old.next().setTrashed(true); }
      folder.createFile(name, data, MimeType.PLAIN_TEXT);
      return json({ ok: true });
    }
    if (d.op === 'fget') {
      var it2 = fileFolder().getFilesByName(safeId(d.fid) + '.' + (Number(d.idx) || 0));
      if (!it2.hasNext()) { return json({ ok: false, error: 'not found' }); }
      return json({ ok: true, data: it2.next().getBlob().getDataAsString() });
    }
    if (d.op === 'fdel') {
      var fid2 = safeId(d.fid); if (!fid2) { return json({ ok: false, error: 'bad request' }); }
      var all = fileFolder().searchFiles("title contains '" + fid2 + ".'");
      while (all.hasNext()) { var f = all.next(); if (f.getName().indexOf(fid2 + '.') === 0) { f.setTrashed(true); } }
      return json({ ok: true });
    }

    // 앱 알림 전달: 브라우저가 암호화·서명까지 끝낸 요청을 푸시 서비스로 그대로 보낸다 (브라우저는 CORS 로 직접 못 보냄)
    if (d.op === 'push') {
      var allowed = /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]*\.push\.apple\.com|[a-z0-9.-]*\.notify\.windows\.com)\//;
      var reqs = [], meta = [];
      (d.items || []).slice(0, 50).forEach(function (it) {
        if (!allowed.test(String(it.endpoint || ''))) { meta.push({ endpoint: it.endpoint, code: 0 }); return; }
        var h = it.headers || {};
        reqs.push({ url: it.endpoint, method: 'post', contentType: 'application/octet-stream', payload: Utilities.base64Decode(String(it.body || '')), muteHttpExceptions: true,
          headers: { 'Authorization': String(h.Authorization || ''), 'Content-Encoding': 'aes128gcm', 'TTL': String(h.TTL || '86400'), 'Urgency': String(h.Urgency || 'normal') } });
        meta.push({ endpoint: it.endpoint, code: -1 });
      });
      var resps = reqs.length ? UrlFetchApp.fetchAll(reqs) : [], k = 0;
      meta.forEach(function (m) { if (m.code === -1) { m.code = resps[k++].getResponseCode(); } });
      return json({ ok: true, results: meta });
    }

    // 팀원 꾸러미 넣기·빼기 (관리자 화면에서)
    if (d.op === 'keyset' || d.op === 'keydel') {
      var ks2 = sheet(KEYS, ['kid', 'blob', 'at']);
      var kid = String(d.kid || '');
      if (!kid) { return json({ ok: false, error: 'bad request' }); }
      var kr = find(ks2, kid);
      if (d.op === 'keyset') {
        if (kr) { ks2.getRange(kr, 2, 1, 2).setValues([[String(d.blob), new Date()]]); }
        else { ks2.appendRow([kid, String(d.blob), new Date()]); }
      } else if (kr) {
        ks2.deleteRow(kr);
      }
      return json({ ok: true });
    }

    return json({ ok: false, error: 'unknown op' });
  } catch (err) {
    return json({ ok: false, error: 'server error' });
  }
}

function doGet() { return json({ ok: false, error: 'use POST' }); }

// 첨부 파일 폴더 (내 드라이브 > 'DealDesk 첨부 (암호문)') - 처음 부를 때 만든다
function fileFolder() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('FOLDER');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { } }
  var f = DriveApp.createFolder('DealDesk 첨부 (암호문)');
  props.setProperty('FOLDER', f.getId());
  return f;
}
function safeId(s) { return String(s || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40); }
// 편집기에서 한 번 실행하면 드라이브 권한 승인 창이 뜬다
function authorizeDrive() { fileFolder(); }
// 편집기에서 한 번 실행하면 '외부 서비스 연결'(앱 알림 전달) 권한 승인 창이 뜬다
function authorizePush() { UrlFetchApp.fetch('https://fcm.googleapis.com/', { muteHttpExceptions: true }); }

function sheet(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) { sh.appendRow(headers); sh.setFrozenRows(1); }
  return sh;
}
function find(sh, id) {
  var last = sh.getLastRow();
  if (last < 2) { return 0; }
  var col = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) { if (String(col[i][0]) === id) { return i + 2; } }
  return 0;
}
// 밀리초까지 - 충돌 확인용 비교 값이라 정밀해야 한다
function iso(v) { return v ? new Date(typeof v === 'number' ? v : (isNaN(Number(v)) ? v : Number(v))).toISOString() : ''; }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
