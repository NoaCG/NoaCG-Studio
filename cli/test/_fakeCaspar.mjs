// A fake AMCP listener for the Bridge tests: answers one command however the test says.

import { createServer } from 'node:net';

/** A CasparCG that answers exactly one command, however the test asks it to. */
export async function fakeCaspar(reply) {
  const seen = [];
  const server = createServer((socket) => {
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let i;
      while ((i = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        seen.push(line);
        const answer = typeof reply === 'function' ? reply(line, socket) : reply;
        if (typeof answer === 'string') socket.write(answer, 'utf8');
      }
    });
    socket.on('error', () => {});
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { port: server.address().port, seen, close: () => new Promise((r) => server.close(r)) };
}

