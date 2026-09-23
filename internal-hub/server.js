import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bus } from './src/bus.js';
import { getLog } from './src/connectors/http.js';
import * as hubspot from './src/connectors/hubspot.js';
import * as jira from './src/connectors/jira.js';
import * as intercom from './src/connectors/intercom.js';
import * as webhook from './src/connectors/webhook.js';
import { customers, DEAL_STAGES } from './src/store.js';
import * as svc from './src/services.js';

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

const json = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
};

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1e6) throw new svc.HttpError(413, 'Payload too large');
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new svc.HttpError(400, 'Invalid JSON'); }
}

// Prototype auth: the UI sends the selected user. Replace with SSO (Okta/Google) in production.
const actorOf = (req) => {
  try { return decodeURIComponent(req.headers['x-actor'] || '') || 'Unknown user'; } catch { return 'Unknown user'; }
};

const summary = (c) => ({
  id: c.id, name: c.name, domain: c.domain, plan: c.plan, mrr: c.mrr, health: c.health, owner: c.owner,
  seats: c.usage.seats, seatsLicensed: c.usage.seatsLicensed,
  dealStage: c.deal.stage, dealAmount: c.deal.amount,
  openTickets: c.tickets.filter((t) => t.status !== 'Done').length,
  openConversations: c.conversations.filter((x) => x.state === 'open').length,
});

const routes = [
  ['GET', /^\/api\/meta$/, () => ({
    stages: DEAL_STAGES,
    integrations: [
      { id: 'hubspot', name: 'HubSpot', role: 'CRM', live: hubspot.isLive() },
      { id: 'jira', name: 'Jira', role: 'Engineering tickets', live: jira.isLive() },
      { id: 'intercom', name: 'Intercom', role: 'Support chat', live: intercom.isLive() },
      { id: 'webhook', name: 'Webhook', role: 'Automations', live: webhook.isLive() },
    ],
  })],
  ['GET', /^\/api\/customers$/, () => customers.map(summary)],
  ['GET', /^\/api\/customers\/([\w-]+)$/, (req, [id]) => {
    const c = customers.find((x) => x.id === id);
    if (!c) throw new svc.HttpError(404, 'Customer not found');
    return c;
  }],
  ['GET', /^\/api\/inbox$/, () =>
    customers.flatMap((c) => c.conversations.map((conv) => ({ ...conv, customerId: c.id, customerName: c.name, plan: c.plan })))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))],
  ['GET', /^\/api\/log$/, () => getLog()],
  ['POST', /^\/api\/customers\/([\w-]+)\/deal-stage$/, async (req, [id], body) => svc.changeDealStage(id, body.stage, actorOf(req))],
  ['POST', /^\/api\/customers\/([\w-]+)\/tickets$/, async (req, [id], body) => svc.openTicket(id, body, actorOf(req))],
  ['POST', /^\/api\/customers\/([\w-]+)\/notes$/, async (req, [id], body) => svc.addNote(id, body.text, actorOf(req))],
  ['POST', /^\/api\/conversations\/([\w-]+)\/reply$/, async (req, [id], body) =>
    svc.replyToConversation(id, body.text, actorOf(req), { close: Boolean(body.close) })],
  // Inbound webhooks from external systems (point Intercom's "conversation.user.created" topic here)
  ['POST', /^\/webhooks\/([\w-]+)$/, async (req, [source], body) => svc.ingestInbound(source, body)],
];

function sse(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(': connected\n\n');
  const send = (type) => (data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  const onIntegration = send('integration');
  const onInbound = send('inbound');
  bus.on('integration', onIntegration);
  bus.on('inbound', onInbound);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    bus.off('integration', onIntegration);
    bus.off('inbound', onInbound);
  });
}

async function serveStatic(pathname, res) {
  const rel = normalize(pathname === '/' ? 'index.html' : pathname.slice(1));
  if (rel.startsWith('..')) return json(res, 403, { error: 'Forbidden' });
  try {
    const data = await readFile(join(PUBLIC_DIR, rel));
    res.writeHead(200, { 'Content-Type': MIME[extname(rel)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    json(res, 404, { error: 'Not found' });
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/api/events') return sse(req, res);

  for (const [method, pattern, handler] of routes) {
    const m = pathname.match(pattern);
    if (!m || req.method !== method) continue;
    try {
      const body = method === 'POST' ? await readBody(req) : undefined;
      return json(res, 200, await handler(req, m.slice(1), body));
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      return json(res, status, { error: err.message });
    }
  }

  if (req.method === 'GET' && !pathname.startsWith('/api/')) return serveStatic(pathname, res);
  json(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  const modes = [hubspot, jira, intercom, webhook].map((m) => (m.isLive() ? 'live' : 'mock'));
  console.log(`Internal Hub → http://localhost:${PORT}`);
  console.log(`HubSpot: ${modes[0]} · Jira: ${modes[1]} · Intercom: ${modes[2]} · Webhook: ${modes[3]}`);
});
