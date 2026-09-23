// Business actions. Each one is what a rep does in one click; behind it we fan out to the
// right external systems and keep our own view of the customer in sync.

import * as hubspot from './connectors/hubspot.js';
import * as jira from './connectors/jira.js';
import * as intercom from './connectors/intercom.js';
import * as webhook from './connectors/webhook.js';
import { bus } from './bus.js';
import { DEAL_STAGES, findCustomer, findConversation, findCustomerByEmail, customers } from './store.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const now = () => new Date().toISOString();
const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };

function getCustomer(id) {
  const c = findCustomer(id);
  need(c, 404, 'Customer not found');
  return c;
}

function failIfRejected(entry) {
  if (!entry.ok) throw new HttpError(502, `${entry.system} returned ${entry.status}`);
}

export async function changeDealStage(customerId, stage, actor) {
  const c = getCustomer(customerId);
  need(DEAL_STAGES.some((s) => s.id === stage), 400, 'Invalid stage');
  const calls = [await hubspot.updateDealStage(c.deal.id, stage)];
  failIfRejected(calls[0]);
  const from = c.deal.stage;
  c.deal.stage = stage;

  // Automation: a won deal kicks off onboarding without anyone leaving this screen.
  if (stage === 'closedwon' && from !== 'closedwon') {
    const issue = await jira.createIssue({
      summary: `Onboarding: ${c.name}`,
      description: `Deal closed by ${actor}. Amount: $${c.deal.amount.toLocaleString('en-US')}. Workspace: ${c.usage.workspaceId}. Contact: ${c.contact.name} (${c.contact.email})`,
      priority: 'High',
      labels: ['onboarding', 'auto'],
    });
    calls.push(issue);
    if (issue.ok) {
      c.tickets.unshift({ key: issue.response.key, summary: `Onboarding: ${c.name}`, status: 'To Do', priority: 'High', createdAt: now() });
    }
    calls.push(await webhook.emit('deal.won', { customer: c.name, dealId: c.deal.id, amount: c.deal.amount, owner: c.owner }));
  }
  return { customer: c, calls };
}

export async function openTicket(customerId, { summary, description, priority }, actor) {
  const c = getCustomer(customerId);
  need(summary?.trim(), 400, 'Ticket summary is required');
  const entry = await jira.createIssue({
    summary: `[${c.name}] ${summary.trim()}`,
    description: `${description || ''}\n\nOpened by ${actor} from Internal Hub. Customer: ${c.domain} (${c.usage.workspaceId})`,
    priority: priority || 'Medium',
    labels: ['customer-reported'],
  });
  failIfRejected(entry);
  c.tickets.unshift({ key: entry.response.key, summary: summary.trim(), status: 'To Do', priority: priority || 'Medium', createdAt: now() });
  return { customer: c, calls: [entry] };
}

export async function addNote(customerId, text, actor) {
  const c = getCustomer(customerId);
  need(text?.trim(), 400, 'Note is empty');
  const entry = await hubspot.createNote(c.hubspotCompanyId, `${text.trim()}\n— ${actor}`);
  failIfRejected(entry);
  c.notes.unshift({ text: text.trim(), author: actor, at: now() });
  return { customer: c, calls: [entry] };
}

export async function replyToConversation(conversationId, text, actor, { close = false } = {}) {
  const found = findConversation(conversationId);
  need(found, 404, 'Conversation not found');
  need(text?.trim(), 400, 'Message is empty');
  const calls = [await intercom.replyToConversation(conversationId, text.trim())];
  failIfRejected(calls[0]);
  found.conversation.messages.push({ from: 'agent', author: actor, text: text.trim(), at: now() });
  found.conversation.updatedAt = now();
  if (close) {
    calls.push(await intercom.closeConversation(conversationId));
    found.conversation.state = 'closed';
  }
  return { customer: found.customer, calls };
}

// Inbound: Intercom (or anything shaped like it) posts here when a customer writes in.
export function ingestInbound(source, payload) {
  const email = payload?.data?.item?.source?.author?.email || payload?.email;
  const text = payload?.data?.item?.source?.body || payload?.text;
  const convId = String(payload?.data?.item?.id || payload?.conversationId || Date.now());
  const c = (email && findCustomerByEmail(email)) || customers[Math.floor(Math.random() * customers.length)];
  const conversation = {
    id: convId,
    subject: payload?.subject || String(text || 'New conversation').slice(0, 40),
    state: 'open',
    updatedAt: now(),
    messages: [{ from: 'customer', author: c.contact.name, text: text || 'Hi, can you help?', at: now() }],
  };
  c.conversations.unshift(conversation);
  const event = { source, customerId: c.id, customerName: c.name, conversation };
  bus.emit('inbound', event);
  return event;
}
