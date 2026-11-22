// The diagnosis's delaying proxy, plus slow spells: while the file SLOW exists, each chunk is held
// 2.5 s more in each direction, as a server that answers late does (order kept).
import net from 'node:net';
import { existsSync } from 'node:fs';
const [listen, target, delay, flag] = [...process.argv.slice(2, 5).map(Number), process.argv[5]];
const pipe = (from, to) => {
  let chain = Promise.resolve();
  from.on('data', (buf) => {
    const due = Date.now() + delay + (existsSync(flag) ? 2500 : 0);
    chain = chain.then(() => new Promise((r) => setTimeout(() => { if (!to.destroyed) to.write(buf); r(); }, Math.max(0, due - Date.now()))));
  });
  from.on('end', () => { chain = chain.then(() => to.end()); });
  from.on('error', () => to.destroy());
};
net.createServer((c) => {
  const u = net.connect(target, '127.0.0.1');
  pipe(c, u); pipe(u, c);
  u.on('error', () => c.destroy());
  c.on('close', () => u.destroy());
  u.on('close', () => c.destroy());
}).listen(listen, '127.0.0.1', () => console.log(`slow proxy ${listen} -> ${target}, ${delay} ms, spells while ${flag}`));
