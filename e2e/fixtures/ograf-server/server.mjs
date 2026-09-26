// A FAKE OGraf server: the EBU OGraf Server API's routes, in memory, recording every request.
//
// The routes and bodies follow the pinned OpenAPI (ebu/ograf at
// c821671195a077be13bbb96989d4220eea157b99, v1/specification/open-api/server-api.yaml): the
// graphics and renderer reads, the render target read with its JSON-stringified identifier,
// and the graphic instance lifecycle (clear, load, updateAction, playAction, stopAction). A
// body missing a field the standard REQUIRES is answered 400, so the fake refuses what a
// conforming server may refuse. There is no upload route, because the standard has none.
//
// It is shared by the Bridge's own tests (cli/test/ograf.test.mjs) and the Playwright spec
// (e2e/bridge-ograf.spec.ts), which is why it is plain JavaScript with no dependencies. It
// stands in for a real server; the real round against SuperFly.tv's ograf-server is a separate,
// owner-run acceptance step (docs/backlog/bridge-ograf-adapter.md).

import { createServer } from 'node:http';

/** A render target identifier's identity, whatever order its keys arrived in. */
const key = (renderTarget) =>
  JSON.stringify(Object.keys(renderTarget ?? {}).sort().map((k) => [k, renderTarget[k]]));

const isRecord = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * Start the fake on a free loopback port.
 *
 * `fault(route, reply)` makes the next calls to one route misbehave: `route` is `load`,
 * `playAction`, `graphics`, ... (the last path segment, or `target` / `renderer` / `server`), and
 * `reply` is `{ status, body }` to answer with, `{ delayMs }` to answer as usual but late,
 * `'hang'` to never answer, or `'drop'` to close the connection without a word. `clearFaults()`
 * puts it right.
 */
export async function startFakeOgrafServer(options = {}) {
  const prefix = options.prefix ?? '/ograf/v1';
  const graphics = options.graphics ?? [
    { id: 'hairline-l3', name: 'Hairline lower third', description: 'A NoaCG export' },
    { id: 'house-strap', name: 'House strap' },
  ];
  const renderers = options.renderers ?? [
    {
      id: 'renderer-0',
      name: 'Studio A',
      description: 'A layered renderer',
      renderTargetSchema: {
        type: 'object',
        properties: { layerId: { type: 'string', enum: ['1', '2', '3', '4', '5'] } },
        required: ['layerId'],
      },
      targets: ['1', '2', '3', '4', '5'].map((layerId) => ({ renderTarget: { layerId }, name: `Layer ${layerId}` })),
    },
  ];
  /** Loaded graphic instances: `{ graphicInstanceId, rendererId, renderTarget, graphicId, data, step }`. */
  const instances = [];
  /** Every request, in order: `{ method, path, renderTarget?, body?, contentType? }`, `path` below the prefix. */
  const requests = [];
  const faults = new Map();
  let nextInstance = 1;

  const problem = (status, title, detail) => ({ status, body: { type: 'about:blank', title, status, detail } });
  const rendererOf = (id) => renderers.find((r) => r.id === id);
  const targetOf = (renderer, renderTarget) => renderer.targets.find((t) => key(t.renderTarget) === key(renderTarget));
  const loadedOn = (rendererId, renderTarget) =>
    instances.filter((i) => i.rendererId === rendererId && key(i.renderTarget) === key(renderTarget));
  const targetInfo = (rendererId, t) => ({
    renderTarget: t.renderTarget,
    name: t.name,
    graphicInstances: loadedOn(rendererId, t.renderTarget).map((i) => ({
      graphicInstanceId: i.graphicInstanceId,
      graphic: { id: i.graphicId, name: graphics.find((g) => g.id === i.graphicId)?.name ?? i.graphicId },
    })),
  });

  /** The standard's instance calls all need these three. */
  function instanceCall(renderer, body) {
    if (!isRecord(body) || !isRecord(body.renderTarget) || typeof body.graphicInstanceId !== 'string' || !isRecord(body.params)) {
      return { error: problem(400, 'Bad Request', 'renderTarget, graphicInstanceId and params are required') };
    }
    const instance = instances.find(
      (i) => i.graphicInstanceId === body.graphicInstanceId && i.rendererId === renderer.id && key(i.renderTarget) === key(body.renderTarget),
    );
    if (!instance) return { error: problem(404, 'Not Found', `No GraphicInstance ${body.graphicInstanceId} on that RenderTarget`) };
    return { instance };
  }

  function answer(method, parts, query, body) {
    if (parts.length === 0 && method === 'GET') return { status: 200, body: { name: 'Fake OGraf Server', version: '1.0.0' } };
    if (parts[0] === 'graphics' && parts.length === 1 && method === 'GET') {
      return { status: 200, body: { graphics: graphics.map(({ id, name, description }) => ({ id, name, ...(description ? { description } : {}) })) } };
    }
    if (parts[0] !== 'renderers') return problem(404, 'Not Found', 'No such route');
    if (parts.length === 1 && method === 'GET') {
      return { status: 200, body: { renderers: renderers.map(({ id, name, description }) => ({ id, name, ...(description ? { description } : {}) })) } };
    }
    const renderer = rendererOf(parts[1]);
    if (!renderer) return problem(404, 'Not Found', `No Renderer ${parts[1]}`);
    if (parts.length === 2 && method === 'GET') {
      return {
        status: 200,
        body: {
          renderer: {
            id: renderer.id,
            name: renderer.name,
            description: renderer.description,
            status: { status: 'OK' },
            renderTargetSchema: renderer.renderTargetSchema,
            renderTargets: renderer.targets.map((t) => targetInfo(renderer.id, t)),
          },
        },
      };
    }
    if (parts.length === 3 && parts[2] === 'target' && method === 'GET') {
      let renderTarget;
      try {
        renderTarget = JSON.parse(query.get('renderTarget') ?? '');
      } catch {
        return problem(400, 'Bad Request', 'renderTarget must be a JSON-stringified RenderTargetIdentifier');
      }
      const t = isRecord(renderTarget) ? targetOf(renderer, renderTarget) : undefined;
      if (!t) return problem(404, 'Not Found', 'No RenderTarget found');
      return { status: 200, body: targetInfo(renderer.id, t) };
    }
    if (parts[2] !== 'target' || parts[3] !== 'graphicInstance' || parts.length !== 5) return problem(404, 'Not Found', 'No such route');
    const route = parts[4];

    if (route === 'clear' && method === 'PUT') {
      if (!isRecord(body) || !Array.isArray(body.filters)) return problem(400, 'Bad Request', 'filters is required');
      const matches = (i, f) =>
        (!f.renderTarget || key(f.renderTarget) === key(i.renderTarget)) &&
        (!f.graphicId || f.graphicId === i.graphicId) &&
        (!f.graphicInstanceId || f.graphicInstanceId === i.graphicInstanceId);
      const cleared = instances.filter((i) => i.rendererId === renderer.id && (body.filters.length === 0 || body.filters.some((f) => matches(i, f))));
      for (const c of cleared) instances.splice(instances.indexOf(c), 1);
      return { status: 200, body: { graphicInstances: cleared.map((c) => ({ renderTarget: c.renderTarget, graphicInstanceId: c.graphicInstanceId })) } };
    }
    if (route === 'load' && method === 'POST') {
      if (!isRecord(body) || !isRecord(body.renderTarget) || typeof body.graphicId !== 'string' || !isRecord(body.params) || !('data' in body.params)) {
        return problem(400, 'Bad Request', 'renderTarget, graphicId and params.data are required');
      }
      if (!targetOf(renderer, body.renderTarget)) return problem(404, 'Not Found', 'No RenderTarget found');
      if (!graphics.some((g) => g.id === body.graphicId)) return problem(404, 'Not Found', `No Graphic ${body.graphicId}`);
      const graphicInstanceId = `gi-${nextInstance++}`;
      instances.push({ graphicInstanceId, rendererId: renderer.id, renderTarget: body.renderTarget, graphicId: body.graphicId, data: body.params.data, step: -1 });
      return { status: 200, body: { graphicInstanceId, statusCode: 200, statusMessage: 'Loaded OK' } };
    }
    if ((route === 'updateAction' || route === 'playAction' || route === 'stopAction') && method === 'POST') {
      const { instance, error } = instanceCall(renderer, body);
      if (error) return error;
      if (route === 'updateAction') {
        if (!('data' in body.params)) return problem(400, 'Bad Request', 'params.data is required');
        instance.data = body.params.data;
        return { status: 200, body: { graphicInstanceId: instance.graphicInstanceId, statusCode: 200, statusMessage: 'Updated' } };
      }
      if (route === 'playAction') {
        instance.step = typeof body.params.goto === 'number' ? body.params.goto : instance.step + (body.params.delta ?? 1);
        return { status: 200, body: { graphicInstanceId: instance.graphicInstanceId, statusCode: 200, statusMessage: 'Playing', currentStep: instance.step } };
      }
      instance.step = -1;
      return { status: 200, body: { graphicInstanceId: instance.graphicInstanceId, statusCode: 200, statusMessage: 'Stopped' } };
    }
    return problem(404, 'Not Found', 'No such route');
  }

  /** The name `fault()` knows a request by. */
  function routeName(parts) {
    if (parts.length === 0) return 'server';
    if (parts.length === 2 && parts[0] === 'renderers') return 'renderer';
    return parts[parts.length - 1];
  }

  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://fake');
      if (!url.pathname.startsWith(prefix)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ title: 'Not Found', status: 404, detail: `Everything is under ${prefix}` }));
        return;
      }
      const path = url.pathname.slice(prefix.length) || '/';
      const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
      let body;
      try {
        body = raw ? JSON.parse(raw) : undefined;
      } catch {
        body = raw;
      }
      const entry = { method: req.method, path: `${path}${url.search}` };
      if (url.searchParams.has('renderTarget')) entry.renderTarget = JSON.parse(url.searchParams.get('renderTarget'));
      if (body !== undefined) entry.body = body;
      if (req.headers['content-type']) entry.contentType = req.headers['content-type'];
      requests.push(entry);

      const fault = faults.get(routeName(parts));
      if (fault === 'hang') return;
      if (fault === 'drop') {
        req.socket.destroy();
        return;
      }
      const respond = () => {
        const reply = fault && !fault.delayMs ? fault : answer(req.method, parts, url.searchParams, body);
        res.writeHead(reply.status, reply.headers ?? { 'Content-Type': 'application/json' });
        res.end(reply.body === undefined ? '' : JSON.stringify(reply.body));
      };
      if (fault?.delayMs) setTimeout(respond, fault.delayMs);
      else respond();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    /** The server's origin, without the API prefix: what an operator types. */
    url: `http://127.0.0.1:${port}`,
    prefix,
    requests,
    instances,
    fault: (route, reply) => faults.set(route, reply),
    clearFaults: () => faults.clear(),
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
