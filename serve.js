// 딜 데스크 - 로컬 시험용 정적 서버 (의존성 없음): node serve.js [포트]
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, 'web'), port = +process.argv[2] || 8130;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.bcmap': 'application/octet-stream','.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.cmd': 'application/octet-stream' };
http.createServer((req, res) => {
  // 시험용: 브라우저에서 만든 파일(엑셀·eml)을 .tmp 에 받아 실제 프로그램으로 열어 본다. 이 서버는 로컬 시험 전용.
  if (req.method === 'POST' && req.url.startsWith('/__save?name=')) {
    const name = path.basename(decodeURIComponent(req.url.split('=')[1] || 'out.bin'));
    const dir = path.join(__dirname, '.tmp'); fs.mkdirSync(dir, { recursive: true });
    const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => { fs.writeFileSync(path.join(dir, name), Buffer.concat(chunks)); res.end('ok'); });
    return;
  }
  if (req.method === 'GET' && req.url.startsWith('/__tmp/')) {
    const f = path.join(__dirname, '.tmp', path.normalize(decodeURIComponent(req.url.slice(7).split('?')[0])).replace(/^([\\/]\.\.)+/, ''));
    return fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data); });
  }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, path.normalize(p).replace(/^([\\/]\.\.)+/, ''));
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, () => console.log(`deal-desk on http://localhost:${port}`));
