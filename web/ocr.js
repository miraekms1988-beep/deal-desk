/* 딜 데스크 - 명함·정보 캡처 → 담당자 자동 입력
 * 글자 인식(Tesseract, 한·영)은 브라우저 안에서 돈다. 이미지는 어디로도 올라가지 않는다.
 * 처음 한 번 인식 프로그램과 한글 학습 자료(약 15MB)를 내려받고, 그 뒤로는 브라우저가 기억한다. */
'use strict';

let tessP = null, workerP = null;
function loadTess() {
  if (!tessP) tessP = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.onload = () => res(window.Tesseract);
    s.onerror = () => { tessP = null; rej(new Error('글자 인식 도구를 불러오지 못했습니다. 인터넷(또는 회사망 차단)을 확인해 주세요.')); };
    document.head.appendChild(s);
  });
  return tessP;
}
let ocrProg = null;
function getWorker() {
  if (!workerP) workerP = loadTess().then(T => T.createWorker(['kor', 'eng'], 1, { logger: m => { if (ocrProg) ocrProg(m); } })).catch(e => { workerP = null; throw e; });
  return workerP;
}
// 인식이 잘 되게: 긴 변 1800px 로 맞추고 흑백 + 명암 늘이기
async function prepImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('이미지를 열 수 없습니다')); i.src = url; });
    const k = Math.min(3, 1800 / Math.max(img.width, img.height)), w = Math.round(img.width * k), h = Math.round(img.height * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h), p = d.data;
    let lo = 255, hi = 0; const gray = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < p.length; i += 4, j++) { const v = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; gray[j] = v; if (v < lo) lo = v; if (v > hi) hi = v; }
    // 어두운 바탕(흰 글씨) 명함이면 뒤집는다
    let sum = 0; for (let j = 0; j < gray.length; j += 7) sum += gray[j];
    const dark = sum / (gray.length / 7) < 110, span = Math.max(1, hi - lo);
    for (let i = 0, j = 0; i < p.length; i += 4, j++) { let v = (gray[j] - lo) * 255 / span; if (dark) v = 255 - v; p[i] = p[i + 1] = p[i + 2] = v; }
    g.putImageData(d, 0, 0);
    return c;
  } finally { URL.revokeObjectURL(url); }
}
async function ocrImage(file, onProgress) {
  ocrProg = m => { if (onProgress) onProgress(m.status === 'recognizing text' ? `글자 읽는 중… ${Math.round((m.progress || 0) * 100)}%` : m.status && /load|init/.test(m.status) ? '인식 도구 준비 중… (처음 한 번 약 15MB)' : ''); };
  const canvas = await prepImage(file);
  const w = await getWorker();
  const { data } = await w.recognize(canvas);
  ocrProg = null;
  return data.text || '';
}

/* ---------- 명함 글 → 담당자 칸 ---------- */
// 이름 검증: 흔한 성으로 시작하는 2~3자 (또는 남궁·황보 같은 두 글자 성 + 1~2자). 잘못 읽은 글을 이름 칸에 넣지 않게
const SURNAMES = '김이박최정강조윤장임한오서신권황안송류유전홍고문양손배백허남심노하곽성차주우구민진나지엄채원천방공현함변염여추소석선설마연위표명반왕금옥육인맹제모탁국봉어은편용예경봉사부황가복태목형피음';
const looksLikeName = s => /^(남궁|황보|제갈|선우|독고|사공|서문|동방)[가-힣]{1,2}$/.test(s) || (/^[가-힣]{2,3}$/.test(s) && SURNAMES.includes(s[0]));
const ORG_RE = /(은행|증권|캐피탈|커머셜|저축은행|보험|생명|화재|손해|카드|자산운용|운용|투자|신탁|금고|신협|농협|수협|공제회?|연금|펀드|리츠|파트너스|인베스트|㈜|\(주\)|주식회사|Bank|Securities|Capital|Asset|Investment)/i;
const DEPT_RE = /(본부|부문|센터|그룹|파트|사업부|금융부|투자부|심사부|영업부|[가-힣A-Za-z]+부\b|[가-힣A-Za-z0-9]+팀|[가-힣]+실\b|지점|Dept|Team|Division)/;
function parseCard(text) {
  const raw = String(text || '').replace(/[|｜]/g, ' ').split(/\r?\n/).map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s.length > 1);
  const all = raw.join('\n');
  const out = { org: '', name: '', title: '', dept: '', phone: '', tel: '', email: '', lines: raw };
  // 이메일 (OCR 이 @ 를 ® © 로 읽는 경우 보정)
  const em = all.replace(/[®©]/g, '@').replace(/\s*@\s*/g, '@').match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/);
  if (em) out.email = em[0].toLowerCase();
  // 전화: 줄 앞 표시(M·H.P·휴대폰 / T·Tel·직통·대표 / F·Fax)로 나누고, 표시가 없으면 010 은 휴대폰
  const phoneRe = /(\+?82[\s-]?)?0\d{1,2}[\s.)-]*\d{3,4}[\s.-]*\d{4}/g;
  for (const line of raw) {
    const nums = line.match(phoneRe); if (!nums) continue;
    // 한 줄에 'T. 02 … M. 010 … F. 0505 …' 처럼 여러 개면 표시 단어로 나눈다
    const parts = line.split(/(?=(?:\b[TMFE]\s?[.:]|Tel|TEL|Mobile|MOBILE|H\.?P|HP|Fax|FAX|휴대폰|핸드폰|직통|대표|전화|팩스))/);
    for (const part of parts) {
      const n = (part.match(phoneRe) || [])[0]; if (!n) continue;
      const num = n.replace(/^\+?82[\s-]?/, '0').replace(/[^\d]/g, '').replace(/^(01\d)(\d{3,4})(\d{4})$/, '$1-$2-$3').replace(/^(02)(\d{3,4})(\d{4})$/, '$1-$2-$3').replace(/^(0\d{2,3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
      if (/(F\s?[.:]|Fax|FAX|팩스)/.test(part)) continue;
      if (/(M\s?[.:]|Mobile|MOBILE|H\.?P|HP|휴대폰|핸드폰)/.test(part) || /^01\d/.test(num)) { if (!out.phone) out.phone = num; }
      else if (!out.tel) out.tel = num;
    }
  }
  // 기관: 기관 말이 든 짧은 줄 → 이미 있는 대주 이름과 맞춰 본다
  const known = typeof lenders === 'function' ? lenders() : [];
  for (const L of known) { if (all.replace(/\s/g, '').includes(L.name.replace(/\s/g, ''))) { out.org = L.name; out.lenderId = L.id; break; } }
  // 영문·숫자를 잘못 읽어도(KB → <8) 한글 부분(국민은행)이 맞으면 그 대주로 - 하나만 걸릴 때, 긴 이름 우선
  if (!out.lenderId) {
    const kor = all.replace(/[^가-힣]/g, '');
    const hits = known.map(L => ({ L, k: L.name.replace(/[^가-힣]/g, '') })).filter(x => x.k.length >= 3 && kor.includes(x.k)).sort((a, b) => b.k.length - a.k.length);
    if (hits.length && (hits.length === 1 || hits[0].k.length > hits[1].k.length)) { out.org = hits[0].L.name; out.lenderId = hits[0].L.id; }
  }
  if (!out.org) { const o = raw.find(l => ORG_RE.test(l) && l.length <= 30 && !/@|\d{3,}/.test(l)); if (o) out.org = o.replace(/^(주식회사|㈜|\(주\))\s*/, '').replace(/\s*(주식회사|㈜|\(주\))$/, '').trim(); }
  // 직함 · 이름: 직함 단어가 든 줄에서 이름을 같이 찾거나, 한글 2~4자만 있는 줄
  const T = typeof TITLES !== 'undefined' ? TITLES : ['부장', '차장', '과장', '대리', '팀장', '이사', '상무', '전무', '지점장', '본부장', '매니저', '심사역'];
  const titleRe = new RegExp('(' + T.slice().sort((a, b) => b.length - a.length).join('|') + '|대표이사|Manager|Director|VP)');
  for (const line of raw) {
    const tm = line.match(titleRe); if (!tm || out.title) continue;
    out.title = tm[0];
    const rest = line.replace(tm[0], ' ').replace(/[^가-힣\s]/g, ' ').trim();
    const nm = rest.split(/\s+/).find(w => looksLikeName(w) && !ORG_RE.test(w) && !DEPT_RE.test(w));
    if (nm) out.name = nm;
    else { const sp = rest.replace(/\s/g, ''); if (looksLikeName(sp) && !ORG_RE.test(sp)) out.name = sp; }
  }
  if (!out.name) {
    const cand = raw.map(l => l.replace(/\s/g, '')).find(l => looksLikeName(l) && !ORG_RE.test(l) && !DEPT_RE.test(l) && !titleRe.test(l));
    if (cand) out.name = cand;
  }
  // 부서: 부서 말이 든 줄 (기관 이름·직함·주소 빼고)
  const dl = raw.find(l => DEPT_RE.test(l) && !/@|\d{3,}|(시|구|동|로|길)\s?\d/.test(l) && l !== out.org && l.length <= 40);
  if (dl) out.dept = dl.replace(titleRe, '').replace(out.name, '').replace(out.org, '').replace(/[,/·]+$/, '').replace(/\s+/g, ' ').trim();
  return out;
}

/* ---------- 화면: 명함 고르기 → 인식 → 칸 채우기 ---------- */
// 파일 고르기 (휴대폰은 카메라 바로)
function pickImage(cb) { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.capture = 'environment'; i.onchange = () => { if (i.files[0]) cb(i.files[0]); }; i.click(); }
async function readCard(file, statusEl) {
  const say = s => { if (statusEl && s) statusEl.textContent = s; };
  say('이미지 준비 중…');
  const text = await ocrImage(file, say);
  const r = parseCard(text);
  say('');
  return r;
}
// 담당자 창 안 '명함으로 채우기' 버튼과 끌어다 놓기
function cardFillUi(el, fill) {
  const zone = el.querySelector('.card-drop'); if (!zone) return;
  const st = zone.querySelector('.card-st');
  const run = async f => {
    if (!/^image\//.test(f.type)) return toast('이미지(사진·캡처) 파일을 넣어 주세요', true);
    try {
      zone.classList.add('busy');
      const r = await readCard(f, st);
      const n = fill(r);
      // 인식한 줄을 단추로: 칸을 누른 뒤 줄을 누르면 그 칸에 들어간다 (못 읽은 이름 등 손으로 두 번 클릭)
      const lines = r.lines.filter(l => l.replace(/[^가-힣A-Za-z0-9@]/g, '').length >= 2).slice(0, 14);
      st.innerHTML = `${n ? `<b style="color:var(--green)">✓ ${n}개 칸을 채웠습니다</b> · 금빛 칸을 확인하세요` : '<span style="color:var(--red)">자동으로 채운 칸이 없습니다.</span>'}
        <div class="small muted" style="margin:6px 0 4px">빈 칸을 누른 뒤 아래 줄을 누르면 그 칸에 들어갑니다</div><div class="card-lines">${lines.map(l => `<button type="button" class="chip click">${esc(l)}</button>`).join('')}</div>`;
      $$('.card-lines button', st).forEach(b => b.onmousedown = e => {
        e.preventDefault();
        const t = el._lastInput; if (!t) return toast('먼저 넣을 칸(이름 등)을 눌러 주세요', true);
        t.value = b.textContent.trim().replace(/^(T|M|E|F|Tel|Mobile)\s?[.:]\s*/i, ''); const fld = t.closest('.field'); if (fld) fld.classList.add('filled'); t.dispatchEvent(new Event('input', { bubbles: true }));
      });
    } catch (e) { st.innerHTML = `<span style="color:var(--red)">${esc(e.message || String(e))}</span>`; }
    finally { zone.classList.remove('busy'); }
  };
  zone.querySelector('.card-pick').onclick = () => pickImage(run);
  el.addEventListener('focusin', e => { if (e.target.matches('input.input')) el._lastInput = e.target; });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) run(f); });
  // 캡처를 Ctrl+V 로 붙여넣기
  el.addEventListener('paste', e => { const it = [...(e.clipboardData || {}).items || []].find(x => x.type.startsWith('image/')); if (it) { e.preventDefault(); run(it.getAsFile()); } });
}
const cardDropHtml = () => `<div class="card-drop"><button class="btn sm dark card-pick" type="button">📷 명함·캡처로 채우기</button><span class="small muted">사진을 고르거나 끌어다 놓기 · 캡처는 Ctrl+V · 이미지는 이 기기 안에서만 읽습니다</span><div class="small card-st"></div></div>`;
// 칸에 값 넣기 (비어 있는 칸만, 채운 칸은 금빛)
function fillInputs(el, map) {
  let n = 0;
  for (const [sel, v] of Object.entries(map)) {
    const inp = el.querySelector(sel); if (!inp || !v) continue;
    if (!inp.value.trim()) { inp.value = v; n++; const f = inp.closest('.field'); if (f) f.classList.add('filled'); }
  }
  return n;
}

/* 대주 화면 '명함으로 등록': 기관을 알아보면 그 대주에 담당자 추가, 모르면 새 대주로 */
A['card-new'] = () => pickImage(async f => {
  toast('명함을 읽는 중입니다… (처음엔 인식 도구를 받느라 조금 걸립니다)');
  try {
    const r = await readCard(f, null);
    if (!r.name && !r.email && !r.phone) return toast('명함에서 정보를 찾지 못했습니다. 더 밝고 반듯하게 찍어 보세요.', true);
    const L = r.lenderId ? Store.get(r.lenderId) : null;
    if (L) contactForm(L.id, null, null, r);
    else lenderForm(null, nl => { location.hash = '#/lender/' + encodeURIComponent(nl.id); }, r);
  } catch (e) { toast(e.message || String(e), true); }
});
