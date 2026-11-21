// Delaying TCP proxy: 127.0.0.1:LISTEN -> 127.0.0.1:TARGET, each chunk held DELAY ms in each
// direction (order kept), so a round trip gains 2*DELAY. Stands in for netem, which this kernel lacks.
import net from 'node:net';
const [listen, target, delay] = process.argv.slice(2).map(Number);
const pipe = (from, to) => {
  let chain = Promise.resolve();
  from.on('data', (buf) => {
    const due = Date.now() + delay;
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
}).listen(listen, '127.0.0.1', () => console.log(`delay proxy ${listen} -> ${target}, ${delay} ms each way`));
