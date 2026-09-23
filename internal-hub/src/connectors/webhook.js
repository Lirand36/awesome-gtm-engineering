// Generic outbound webhook — lets any internal event fan out to Slack, Zapier, n8n, a data warehouse, etc.
import { send } from './http.js';

export const isLive = () => Boolean(process.env.OUTBOUND_WEBHOOK_URL);

export function emit(event, data) {
  return send({
    system: 'webhook',
    action: `Event ${event}`,
    method: 'POST',
    url: process.env.OUTBOUND_WEBHOOK_URL || 'https://hooks.example.com/internal-hub',
    body: { event, occurredAt: new Date().toISOString(), source: 'internal-hub', data },
    live: isLive(),
    mockResponse: { received: true },
  });
}
