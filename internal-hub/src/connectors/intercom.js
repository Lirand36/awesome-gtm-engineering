// Intercom REST API. Docs: https://developers.intercom.com/docs/references/rest-api/api.intercom.io/conversations/replyconversation
import { send } from './http.js';

const BASE = 'https://api.intercom.io';
export const isLive = () => Boolean(process.env.INTERCOM_TOKEN && process.env.INTERCOM_ADMIN_ID);

export function replyToConversation(conversationId, text) {
  return send({
    system: 'intercom',
    action: 'Reply to conversation',
    method: 'POST',
    url: `${BASE}/conversations/${conversationId}/reply`,
    headers: { Authorization: `Bearer ${process.env.INTERCOM_TOKEN}`, 'Intercom-Version': '2.11' },
    body: { message_type: 'comment', type: 'admin', admin_id: process.env.INTERCOM_ADMIN_ID || 'ADMIN_ID', body: text },
    live: isLive(),
    mockResponse: { type: 'conversation', id: conversationId, state: 'open' },
  });
}

export function closeConversation(conversationId) {
  return send({
    system: 'intercom',
    action: 'Close conversation',
    method: 'POST',
    url: `${BASE}/conversations/${conversationId}/parts`,
    headers: { Authorization: `Bearer ${process.env.INTERCOM_TOKEN}`, 'Intercom-Version': '2.11' },
    body: { message_type: 'close', type: 'admin', admin_id: process.env.INTERCOM_ADMIN_ID || 'ADMIN_ID' },
    live: isLive(),
    mockResponse: { type: 'conversation', id: conversationId, state: 'closed' },
  });
}
