/* 딜 데스크 - 자료 읽기 (PDF·워드·엑셀 → 줄) 와 딜 정보 뽑기
 * 모든 처리는 브라우저 안에서 한다. 파일은 어디로도 올라가지 않는다 (IM 은 대외비). */
'use strict';

/* ---------- ZIP 읽기 (docx·xlsx) ---------- */
async function inflateRaw(u8) {
  const ds = new DecompressionStream('deflate-raw');
  const out = await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(out);
}
async function unzip(buf, want = () => true) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('ZIP 형식이 아닙니다 (암호화된 파일이면 복호화본을 넣어 주세요)');
  const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const files = new Map();
  for (let k = 0; k < n; k++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (!want(name)) continue;
    const ds = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    const raw = u8.subarray(ds, ds + csize);
    files.set(name, method === 0 ? raw : await inflateRaw(raw));
  }
  return files;
}
const xmlDoc = u8 => new DOMParser().parseFromString(new TextDecoder().decode(u8), 'application/xml');

/* ---------- 워드: 문단은 한 줄, 표는 행마다 '칸 | 칸' ---------- */
async function docxLines(buf) {
  const files = await unzip(buf, n => n === 'word/document.xml');
  const doc = xmlDoc(files.get('word/document.xml'));
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const txt = el => { let s = ''; for (const t of el.getElementsByTagNameNS(W, '*')) { if (t.localName === 't') s += t.textContent; else if (t.localName === 'tab') s += ' '; else if (t.localName === 'br') s += ' '; } return s.replace(/\s+/g, ' ').trim(); };
  const lines = [];
  // 칸 안의 글: 문단은 ' · ' 로, 칸 안에 표가 또 있으면 행마다 ' / ' 로 (금융조건 칸 안 표가 한 덩어리로 붙지 않게)
  const cellText = tc => {
    const parts = [];
    for (const c of tc.children) {
      if (c.localName === 'p') { const t = txt(c); if (t) parts.push(t); }
      else if (c.localName === 'tbl') {
        const rows = [];
        // 칸 안 표의 칸은 ' ¦ ' 로 - 빈칸도 남겨야 머리글과 줄이 맞는다 (금융조건 표 읽기)
        for (const tr of c.children) if (tr.localName === 'tr') { const cs = []; for (const x of tr.children) if (x.localName === 'tc') cs.push(cellText(x)); if (cs.some(Boolean)) rows.push(cs.join(' ¦ ')); }
        if (rows.length) parts.push(rows.join(' / '));
      } else if (c.localName === 'sdt') { const t = txt(c); if (t) parts.push(t); }
    }
    return parts.join(' · ').replace(/(·\s*){2,}/g, '· ').replace(/^·\s*/, '').trim();
  };
  const walk = el => {
    for (const c of el.children) {
      if (c.localName === 'p') { const t = txt(c); if (t) lines.push(t); }
      else if (c.localName === 'tbl') {
        for (const tr of c.children) {
          if (tr.localName !== 'tr') continue;
          const cells = [];
          for (const tc of tr.children) if (tc.localName === 'tc') { const t = cellText(tc); if (t) cells.push(t); }
          if (cells.length) lines.push(cells.join(' | '));
        }
      } else if (c.localName === 'sdt' || c.localName === 'sdtContent' || c.localName === 'body') walk(c);
    }
  };
  walk(doc.documentElement.getElementsByTagNameNS(W, 'body')[0]);
  return lines;
}

/* ---------- 엑셀: 첫 시트 (또는 모든 시트) 행 배열 ---------- */
async function xlsxSheets(buf) {
  const files = await unzip(buf, n => n === 'xl/sharedStrings.xml' || n === 'xl/workbook.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n) || n === 'xl/_rels/workbook.xml.rels');
  const ss = [];
  if (files.has('xl/sharedStrings.xml')) for (const si of xmlDoc(files.get('xl/sharedStrings.xml')).getElementsByTagName('si')) { let s = ''; for (const t of si.getElementsByTagName('t')) s += t.textContent; ss.push(s); }
  const wb = xmlDoc(files.get('xl/workbook.xml'));
  const rels = files.has('xl/_rels/workbook.xml.rels') ? xmlDoc(files.get('xl/_rels/workbook.xml.rels')) : null;
  const relMap = {}; if (rels) for (const r of rels.getElementsByTagName('Relationship')) relMap[r.getAttribute('Id')] = r.getAttribute('Target');
  const out = [];
  for (const sh of wb.getElementsByTagName('sheet')) {
    const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const target = 'xl/' + String(relMap[rid] || '').replace(/^\/?xl\//, '');
    const x = files.get(target); if (!x) continue;
    const rows = [];
    for (const row of xmlDoc(x).getElementsByTagName('row')) {
      const r = [];
      for (const c of row.getElementsByTagName('c')) {
        const ref = c.getAttribute('r') || ''; const col = ref.replace(/\d/g, '').split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0];
        let val = '';
        if (t === 's' && v) val = ss[+v.textContent] ?? '';
        else if (t === 'inlineStr') val = Array.from(c.getElementsByTagName('t')).map(e => e.textContent).join('');
        else if (v) val = v.textContent;
        r[col] = String(val).replace(/\s+/g, ' ').trim();
      }
      for (let i = 0; i < r.length; i++) if (r[i] === undefined) r[i] = '';
      rows.push(r);
    }
    out.push({ name: sh.getAttribute('name'), rows });
  }
  return out;
}

/* ---------- PDF: 같은 높이 글자를 한 줄로, 칸 사이가 넓으면 ' | ' ---------- */
let pdfjsP = null;
function loadPdfjs() {
  if (!pdfjsP) pdfjsP = import('./vendor/pdfjs/pdf.min.mjs').then(m => { m.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', location.href).href; return m; });
  return pdfjsP;
}
async function pdfLines(buf, maxPages = 40, onPage) {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf), cMapUrl: new URL('./vendor/pdfjs/cmaps/', location.href).href, cMapPacked: true, isEvalSupported: false }).promise;
  const lines = [];
  const N = Math.min(pdf.numPages, maxPages);
  for (let p = 1; p <= N; p++) {
    if (onPage) onPage(p, N);
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const rows = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || it.height || 8;
      let row = rows.find(r => Math.abs(r.y - y) <= Math.max(2, h * 0.35));
      if (!row) { row = { y, h, items: [] }; rows.push(row); }
      row.items.push({ x, w: it.width, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      let s = '', end = null;
      for (const it of r.items) {
        if (end !== null) { const gap = it.x - end; s += gap > r.h * 1.6 ? ' | ' : gap > r.h * 0.15 ? ' ' : ''; }
        s += it.s; end = it.x + it.w;
      }
      s = s.replace(/\s+/g, ' ').trim();
      if (s) lines.push(s);
    }
    page.cleanup();
  }
  return lines;
}

/* 파일 하나 → 줄 (종류는 이름·첫 바이트로) */
async function fileLines(file, onPage) {
  const buf = await file.arrayBuffer();
  const head = new TextDecoder().decode(new Uint8Array(buf.slice(0, 8)));
  if (head.startsWith('DRMONE')) throw new Error('회사 DRM 으로 잠긴 파일입니다. 복호화한 파일을 넣어 주세요.');
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (head.startsWith('%PDF') || ext === 'pdf') return { kind: 'pdf', lines: await pdfLines(buf, 40, onPage) };
  if (ext === 'docx') return { kind: 'docx', lines: await docxLines(buf) };
  if (ext === 'xlsx' || ext === 'xlsm') { const sh = await xlsxSheets(buf); return { kind: 'xlsx', sheets: sh, lines: sh.flatMap(s => s.rows.map(r => r.filter(Boolean).join(' | ')).filter(Boolean)) }; }
  if (ext === 'txt' || ext === 'csv') return { kind: 'txt', lines: new TextDecoder().decode(buf).split(/\r?\n/).map(s => s.trim()).filter(Boolean) };
  if (ext === 'hwp' || ext === 'hwpx') throw new Error('한글(hwp) 파일은 아직 못 읽습니다. PDF 로 저장해서 넣어 주세요.');
  throw new Error('PDF·워드(docx)·엑셀(xlsx) 파일을 넣어 주세요.');
}

/* ======================================================================
 * 딜 정보 뽑기 - IM·텀싯의 '라벨 | 값' 줄에서
 * ==================================================================== */
const DEAL_FIELDS = [
  // key, 화면 이름, 라벨 (공백·기호·괄호 내용을 뺀 칸 전체와 맞춘다)
  ['project', '사업명', /^(사업명|프로젝트명|사업의명칭|사업명칭)$/],
  ['location', '소재지', /^(소재지|사업지|대지위치|사업위치|사업부지|위치|사업장소재지)$/],
  ['sponsor', '시행사(차주)', /^(차주시행사|시행사차주|시행사|차주겸위탁자\d?|차주|시행자|사업주체|시행)$/],
  ['builder', '시공사', /^(시공사|시공자|시공|시공사겸신용보강자)$/],
  ['trustee', '신탁사', /^(신탁사|수탁자|신탁|신탁구조)$/],
  ['arranger', '주관·대리금융', /^(금융주관사?|주관사|대리금융기관|공동주선|주선기관|금융자문사)$/],
  ['guarantor', '연대보증', /^(연대보증인?|보증인)$/],
  ['target', '대출금액', /^(대출금액|대출한도|총대출금액|대출규모|조달금액|대출약정금액?|인수금액|총한도|대출금)$/],
  ['rate', '금리', /^(대출금리|적용금리|대출이자율|이자율|금리|대출이자)$/],
  ['fee', '수수료', /^(취급수수료|취급자문수수료|주선수수료|수수료|금융자문수수료)$/],
  ['allin', 'All-in', /^(all-?in(cost)?|올인|allin금리)$/i],
  ['term', '대출기간', /^(대출만기|대출기간|만기|대출기한)$/],
  ['ltv', 'LTV', /^ltv$/i],
  ['repay', '상환방법', /^(상환방법|상환방식|원금상환방법?)$/],
  ['purpose', '자금용도', /^(자금용도|대출용도|자금사용용도|대출금용도)$/],
  ['security', '채권보전·신용보강', /^(주요채권보전|채권보전|신용보강|담보및보증|주요담보|채권보전방안)$/],
  ['drawdown', '인출 예정', /^(인출일정|인출예정일?|인출시기|대출실행예정일?|인출일)$/],
  ['scale', '규모', /^(건축용도규모|건축규모|사업규모|규모|공급규모|세대수|건축개요)$/],
  ['landArea', '대지면적', /^대지면적$/],
  ['gfa', '연면적', /^연면적$/],
  ['totalCost', '총사업비', /^총사업비$/],
];
const FIELD_LABEL = Object.fromEntries(DEAL_FIELDS.map(f => [f[0], f[1]]));
// 숫자·% 가 있어야 하는 칸 - 표 머리글이나 다른 칸 글이 잘못 들어오는 걸 막는다
const FIELD_OK = { rate: /\d|t\.?b\.?d|변동|고정|cd|cp|기준금리|협의/i, fee: /\d|t\.?b\.?d|협의|없음/i, allin: /\d/, ltv: /\d|t\.?b\.?d/i, term: /\d|개월|년|t\.?b\.?d/i, target: /\d|t\.?b\.?d/i, landArea: /\d/, gfa: /\d/, totalCost: /\d/ };
const normLabel = s => String(s || '').replace(/\([^)]*\)|\[[^\]]*\]|（[^）]*）/g, '').replace(/[\s·•\-\/:：*※]/g, '').replace(/^\d+[.)]/, '').replace(/주\d$/, '').toLowerCase();
const isFieldLabel = s => { const l = normLabel(s); return !!l && DEAL_FIELDS.some(f => f[2].test(l)); };
const cleanVal = s => String(s || '').replace(/\s*¦\s*/g, ' ').replace(/\[\s*([^\]]*?)\s*\]/g, '$1').replace(/^[\s·•:\-|]+/, '').replace(/\s+/g, ' ').trim();

// 금융조건 칸 안의 작은 표: 머리글(구분·금액·만기·금리·수수료·All-in·LTV) 아래 줄마다 트랜치
function parseFinTable(v) {
  if (!/¦/.test(v)) return [];
  const rows = v.split(' / ').map(r => r.split('¦').map(s => cleanVal(s)));
  const hi = rows.findIndex(r => r.length > 2 && r.filter(c => /금리|금액|만기|수수료|한도|all.?in|ltv/i.test(c)).length >= 2);
  if (hi < 0) return [];
  const H = rows[hi].map(normLabel), col = re => H.findIndex(h => re.test(h));
  const ci = { name: col(/^(구분|트랜치|tranche|대주)$/), amt: col(/금액|한도|규모/), term: col(/만기|기간/), rate: col(/금리|이자율/), fee: col(/수수료/), allin: col(/allin/), ltv: col(/^ltv/) };
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    if (r.filter(Boolean).length < 2) continue;
    const g = i => (i >= 0 && i < r.length ? r[i] : '');
    const name = g(ci.name >= 0 ? ci.name : 0);
    if (/^(합계|소계|계|total)$/i.test(name.replace(/\s/g, '')) || /^주\d/.test(name)) continue;
    out.push({ name, amount: parseEok(g(ci.amt)), term: g(ci.term), rate: g(ci.rate), fee: g(ci.fee), allin: g(ci.allin), ltv: g(ci.ltv) });
  }
  return out;
}

// '[2,100]억원', '1조 2,000억', '105,000백만원', '80,000,000,000원' → 억
function parseEok(s) {
  s = String(s || '').replace(/[\[\]]/g, '');
  let m = s.match(/([\d,]+(?:\.\d+)?)\s*조\s*(?:([\d,]+(?:\.\d+)?)\s*억)?/);
  if (m) return +m[1].replace(/,/g, '') * 10000 + (m[2] ? +m[2].replace(/,/g, '') : 0);
  m = s.match(/([\d,]+(?:\.\d+)?)\s*억/); if (m) return +m[1].replace(/,/g, '');
  m = s.match(/([\d,]+(?:\.\d+)?)\s*백만/); if (m) return Math.round(+m[1].replace(/,/g, '') / 100 * 10) / 10;
  m = s.match(/([\d,]{11,})\s*원/); if (m) return Math.round(+m[1].replace(/,/g, '') / 1e8 * 10) / 10;
  return null;
}
function guessKind(text) {
  const t = String(text || '');
  if (/중도금/.test(t)) return '중도금대출';
  if (/미분양\s*(주택\s*)?담보|미분양담보/.test(t)) return '미분양담보대출';
  if (/이주비/.test(t)) return '이주비대출';
  if (/리파이낸싱|refinanc|refi\b|PF\s*리파/i.test(t)) return 'PF 리파이낸싱';
  if (/B\/L|브릿지|bridge|\bBL\b/i.test(t)) return '브릿지론';
  if (/토지\s*담보/.test(t)) return '토지담보대출';
  if (/본\s*PF|PF\s*대출|PF대출/.test(t)) return '본PF';
  return '';
}
function nameFromFile(fn) {
  return String(fn || '').replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/^\d+[.)]\s*/, '')
    .replace(/\[[^\]]*\]|\([^)]*(증권|은행|캐피탈|운용|IBKS|송부|전달|최종|외부|대주용|내부|\d)[^)]*\)/g, ' ')
    .replace(/(^|\s)(IM|Teaser|ref|TS|YUC|NDA|KOR|대주용|내부용|내부심의용|외부용|송부본|최종|원본틀|복호화|수정|v?\d+(\.\d+)+|ver\s?\d+(\.\d+)*|V\d+|\d{6,8}|\d{1,2})(?=\s|$)/gi, ' ')
    .replace(/^\d+[.)]\s*/, '').replace(/\s+/g, ' ').trim();
}

function extractDeal(lines, fileName) {
  const out = {}, src = {};
  let finRaw = '';
  const set = (k, v, line) => { v = cleanVal(v); if (!v || out[k]) return; if (FIELD_OK[k] && !FIELD_OK[k].test(v)) return; if (/^(t\.?b\.?d\.?|미정|-|협의중?)$/i.test(v)) { out[k] = v.toUpperCase().startsWith('T') ? 'T.B.D' : v; src[k] = line; return; } out[k] = v.length > 400 ? v.slice(0, 400) + '…' : v; src[k] = line; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cells = line.split(' | ');
    for (let c = 0; c < cells.length - 1; c++) {
      const lab = normLabel(cells[c]);
      if (!lab || lab.length > 16) continue;
      if (isFieldLabel(cells[c + 1])) continue;   // '취급수수료 | All in' 같은 표 머리글 줄
      for (const [k, , re] of DEAL_FIELDS) if (re.test(lab)) { set(k, cells.slice(c + 1).join(' · '), line); break; }
      if (/^금융조건$|^대출조건$|^금융구조$/.test(lab) && !finRaw) finRaw = cells.slice(c + 1).join(' / ');
    }
    // '시공사 겸 신용보강자 현대건설㈜' 처럼 칸 나눔이 없는 줄
    if (cells.length === 1) {
      const m = line.match(/^(시공사|신탁사|시행사|차주)(?:\s*겸\s*[가-힣]+\d?)?\s+(.+㈜.*|.*\(주\).*|.*주식회사.*)$/);
      if (m) set({ 시공사: 'builder', 신탁사: 'trustee', 시행사: 'sponsor', 차주: 'sponsor' }[m[1]], m[2], line);
    }
  }
  const all = lines.join('\n');
  // 요약 문장에서 보충: 소재지 · 규모
  if (!out.location) { const m = all.match(/((?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|충청|전라|경상)[가-힣]*\s[가-힣]+[시군구](?:\s[가-힣]+[시군구])?\s[가-힣0-9]+(?:[읍면동가리])?\s?[\d\-]+(?:번지)?\s?(?:일원|일대)?)/); if (m) { out.location = m[1].trim(); src.location = '본문'; } }
  if (!out.scale) { const m = all.match(/((?:공동주택|아파트|오피스텔|지식산업센터|물류센터|생활숙박시설)\s?[\d,]+\s?(?:세대|실|호))/); if (m) { out.scale = m[1]; src.scale = '본문'; } }
  // 금액: 대출금액 칸 → 금융조건 칸 → 제목
  let target = out.target ? parseEok(out.target) : null;
  if (target == null) { const fin = lines.find(l => /^금융\s?조건\s?\|/.test(l)); if (fin) target = parseEok(fin.split(' | ').slice(1).join(' ')); }
  if (target == null) target = parseEok(lines.slice(0, 3).join(' ') + ' ' + fileName);
  // 금융조건 표 → 트랜치·금리·수수료·LTV 보충
  const fin = parseFinTable(finRaw);
  const ok = FIELD_OK;
  const pick = k => (fin.find(t => t[k] && (!ok[k] || ok[k].test(t[k]))) || {})[k] || '';
  if (fin.length) {
    if (!out.rate && pick('rate')) { out.rate = pick('rate'); src.rate = '금융조건 표'; }
    if (!out.fee && pick('fee')) { out.fee = pick('fee'); src.fee = '금융조건 표'; }
    if (!out.allin && pick('allin')) { out.allin = pick('allin'); src.allin = '금융조건 표'; }
    if (!out.ltv && pick('ltv')) { out.ltv = pick('ltv'); src.ltv = '금융조건 표'; }
    if (!out.term && pick('term')) { out.term = pick('term'); src.term = '금융조건 표'; }
    if (target == null) { const s = fin.reduce((a, t) => a + (t.amount || 0), 0); if (s) target = s; }
  }
  // 트랜치: 표에서 (이름이 Tr./선·중·후순위일 때) → 없으면 본문에서
  const tr = [], seen = new Set();
  const isTrName = n => /^(Tr\.?\s?[A-Z]|트랜치|선순위|중순위|후순위|Tranche)/i.test(n);
  for (const t of fin) if (isTrName(t.name) && !seen.has(t.name.replace(/\s/g, ''))) { seen.add(t.name.replace(/\s/g, '')); tr.push({ name: t.name.replace(/\s/g, ''), amount: t.amount || '', rate: t.rate || '', rank: /후순위/.test(t.name) ? '후순위' : /중순위/.test(t.name) ? '중순위' : '' }); }
  const reTr = /(Tr\.?\s?[A-Z](?:-\d)?|트랜치\s?[A-Z]|선순위|중순위|후순위)[^\d\[\n|]{0,20}\[?\s*([\d,]+(?:\.\d+)?)\s*\]?\s*억/g;
  for (const l of lines) { let m; while ((m = reTr.exec(l))) { const name = m[1].replace(/\s/g, '').replace(/^Tr(?!\.)/, 'Tr.'); if (seen.has(name)) continue; seen.add(name); tr.push({ name, amount: +m[2].replace(/,/g, ''), rate: '', rank: /후순위/.test(name) ? '후순위' : /중순위/.test(name) ? '중순위' : /선순위/.test(name) ? '선순위' : '' }); } }
  // 금리·기간 숫자만 깔끔하게
  if (out.term) { const m = out.term.match(/(\d+)\s*개월/); if (m) out.termShort = m[1] + '개월'; }
  if (out.rate) { const m = out.rate.match(/(\d+(?:\.\d+)?)\s*%/); if (m) out.rateShort = m[1] + '%'; }
  if (out.ltv) { const m = out.ltv.match(/(\d+(?:\.\d+)?)\s*%/); if (m) out.ltvShort = m[1] + '%'; }
  if (out.allin) { const m = out.allin.match(/(\d+(?:\.\d+)?)\s*%/); if (m) out.allinShort = m[1] + '%'; }
  // 이름: 사업명 → 첫 줄 제목 → 파일 이름
  let title = lines.slice(0, 2).join(' ').split(/Information\s*Memorandum|투자설명서/i)[0].trim();
  if (title.length > 80 || title.length < 6) title = '';
  const name = cleanVal(nameFromFile(fileName) || title || out.project || '');
  return { fields: out, src, target, tranches: tr, kind: guessKind(fileName + ' ' + lines.slice(0, 5).join(' ')) || guessKind(all.slice(0, 4000)), name, lineCount: lines.length };
}
