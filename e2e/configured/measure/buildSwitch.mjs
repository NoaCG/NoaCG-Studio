// ONE ORIGIN, TWO BUILDS (docs/work-specs/live-publishing/spec.md, phase 3; owner decision on run
// issue #2361: AC-1's 50 ms p95 is judged on a production build). The harness builds its fixture
// through the development server's modules (`import('/src/...')`), which a bundled build does not
// serve, and a page's saved productions belong to its origin. So this proxy stands on the
// harness's port and forwards each request to the development server or to `vite preview` of a
// production build, as told; a reload after a switch runs the same storage under the other build.
// WebSocket upgrades always go to the development server, so its module reloader never notices.
//
//   node e2e/configured/measure/buildSwitch.mjs --port 5215 --dev 5216 --prod 5217
//   GET /__measure/build?to=prod|dev   switch; answers the build now in use
//
// Measurement tooling only: the configured suite and the product never run it.
import http from 'node:http';
import net from 'node:net';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const port = arg('port', 5215);
const ports = { dev: arg('dev', 5216), prod: arg('prod', 5217) };
let mode = 'dev';

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/__measure/build') {
    const to = url.searchParams.get('to');
    if (to === 'dev' || to === 'prod') mode = to;
    res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
    res.end(mode);
    return;
  }
  const upstream = http.request(
    { host: '127.0.0.1', port: ports[mode], method: req.method, path: req.url, headers: req.headers },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    },
  );
  upstream.on('error', (e) => {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(String(e));
  });
  req.pipe(upstream);
});

server.on('upgrade', (req, socket, head) => {
  const upstream = net.connect(ports.dev, '127.0.0.1', () => {
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head?.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

server.listen(port, '127.0.0.1', () => console.log(`build switch on ${port}: dev ${ports.dev}, prod ${ports.prod}`));
