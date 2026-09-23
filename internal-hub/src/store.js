// In-memory data for the prototype. In production this becomes a DB plus a sync job
// that pulls from HubSpot / Jira / Intercom and our own product DB; the IDs mirror each system's IDs.
//
// Framing: we are a B2B SaaS company (API platform). "Customers" are companies using our product.

const ago = (h) => new Date(Date.now() - h * 3600_000).toISOString();

export const DEAL_STAGES = [
  { id: 'appointmentscheduled', label: 'Discovery' },
  { id: 'qualifiedtobuy', label: 'Qualified' },
  { id: 'presentationscheduled', label: 'Demo' },
  { id: 'decisionmakerboughtin', label: 'Champion bought in' },
  { id: 'contractsent', label: 'Contract sent' },
  { id: 'closedwon', label: 'Closed won' },
  { id: 'closedlost', label: 'Closed lost' },
];

export const customers = [
  {
    id: 'c1', name: 'Tevel Logistics', domain: 'tevel.io', plan: 'Enterprise', mrr: 18500, health: 82,
    owner: 'Noa L.', hubspotCompanyId: '9120034411',
    usage: { workspaceId: 'ws_8f2a91', region: 'eu-west-1', seats: 142, seatsLicensed: 150, apiCalls30d: 48_200_000, lastActive: ago(0.2) },
    contact: { name: 'Aviv Cohen', role: 'VP Engineering', email: 'aviv@tevel.io', phone: '+972-52-555-0142' },
    deal: { id: '18840021', name: 'Tevel: expansion to 3 more teams', amount: 96000, stage: 'contractsent' },
    tickets: [
      { key: 'SUP-1031', summary: 'Webhook delivery retries stall above 10k events/min', status: 'In Progress', priority: 'High', createdAt: ago(30) },
    ],
    conversations: [
      { id: '215469113', subject: 'SSO for staging workspace', state: 'open', updatedAt: ago(2), messages: [
        { from: 'customer', author: 'Aviv Cohen', text: 'Hi, can we enable Okta SSO on our staging workspace too?', at: ago(3) },
      ] },
    ],
    notes: [{ text: 'Strategic account. Waiting on procurement sign-off before quarter end.', author: 'Noa L.', at: ago(50) }],
  },
  {
    id: 'c2', name: 'Shefa Health', domain: 'shefa.health', plan: 'Growth', mrr: 6200, health: 54,
    owner: 'Daniel R.', hubspotCompanyId: '9120034488',
    usage: { workspaceId: 'ws_31c7de', region: 'us-east-1', seats: 38, seatsLicensed: 50, apiCalls30d: 3_900_000, lastActive: ago(1) },
    contact: { name: 'Michal Avraham', role: 'CTO', email: 'michal@shefa.health', phone: '+972-54-555-0199' },
    deal: { id: '18840107', name: 'Shefa: annual renewal', amount: 74400, stage: 'decisionmakerboughtin' },
    tickets: [
      { key: 'SUP-1024', summary: 'CSV export truncates columns over 64 chars', status: 'To Do', priority: 'Medium', createdAt: ago(80) },
      { key: 'SUP-1019', summary: 'Dashboard p95 latency > 8s for large workspaces', status: 'In Progress', priority: 'High', createdAt: ago(120) },
    ],
    conversations: [
      { id: '215469240', subject: 'Dashboard is very slow today', state: 'open', updatedAt: ago(1), messages: [
        { from: 'customer', author: 'Michal Avraham', text: 'The dashboard takes almost 20 seconds to load. It is blocking the whole team.', at: ago(1.2) },
        { from: 'agent', author: 'Ron (Support)', text: 'Thanks Michal, we are on it. Engineering has an open ticket for this.', at: ago(1) },
      ] },
    ],
    notes: [{ text: 'Health dropped after the performance issues. Hold off on upsell until resolved.', author: 'Daniel R.', at: ago(26) }],
  },
  {
    id: 'c3', name: 'Orbit Fintech', domain: 'orbitfin.com', plan: 'Trial', mrr: 0, health: 71,
    owner: 'Noa L.', hubspotCompanyId: '9120034502',
    usage: { workspaceId: 'ws_a04b55', region: 'us-east-1', seats: 9, seatsLicensed: 10, apiCalls30d: 410_000, lastActive: ago(5) },
    contact: { name: 'Yonatan Levi', role: 'Head of Platform', email: 'yonatan@orbitfin.com', phone: '+972-50-555-0110' },
    deal: { id: '18840230', name: 'Orbit: trial → Growth', amount: 38000, stage: 'presentationscheduled' },
    tickets: [],
    conversations: [
      { id: '215469301', subject: 'Salesforce integration', state: 'open', updatedAt: ago(6), messages: [
        { from: 'customer', author: 'Yonatan Levi', text: 'Do you have a native Salesforce connector or do we need to go through the API?', at: ago(6) },
      ] },
    ],
    notes: [],
  },
  {
    id: 'c4', name: 'Kalanit Retail', domain: 'kalanit.co', plan: 'Starter', mrr: 1400, health: 90,
    owner: 'Daniel R.', hubspotCompanyId: '9120034577',
    usage: { workspaceId: 'ws_77e019', region: 'eu-central-1', seats: 12, seatsLicensed: 12, apiCalls30d: 1_250_000, lastActive: ago(0.5) },
    contact: { name: 'Shira Golan', role: 'Engineering Manager', email: 'shira@kalanit.co', phone: '+972-53-555-0177' },
    deal: { id: '18840311', name: 'Kalanit: upgrade to Growth', amount: 22000, stage: 'qualifiedtobuy' },
    tickets: [],
    conversations: [],
    notes: [{ text: 'At seat limit and heavy on reporting. Good upgrade candidate.', author: 'Daniel R.', at: ago(200) }],
  },
  {
    id: 'c5', name: 'Nahar Energy', domain: 'nahar.energy', plan: 'Enterprise', mrr: 24000, health: 38,
    owner: 'Omer S.', hubspotCompanyId: '9120034610',
    usage: { workspaceId: 'ws_c9d310', region: 'eu-west-1', seats: 61, seatsLicensed: 200, apiCalls30d: 22_700_000, lastActive: ago(0.3) },
    contact: { name: 'Gilad Mizrahi', role: 'Director of IT', email: 'gilad@nahar.energy', phone: '+972-52-555-0133' },
    deal: { id: '18840402', name: 'Nahar: renewal + premium SLA', amount: 288000, stage: 'appointmentscheduled' },
    tickets: [
      { key: 'SUP-1008', summary: 'Intermittent 502s from /v2/ingest', status: 'In Progress', priority: 'Highest', createdAt: ago(170) },
    ],
    conversations: [
      { id: '215469377', subject: 'Escalation: API errors', state: 'open', updatedAt: ago(0.5), messages: [
        { from: 'customer', author: 'Gilad Mizrahi', text: 'Third time this week. We need a call with someone senior.', at: ago(0.5) },
      ] },
    ],
    notes: [{ text: 'High churn risk. Renewal in 45 days, only 30% of seats in use.', author: 'Omer S.', at: ago(10) }],
  },
];

export const findCustomer = (id) => customers.find((c) => c.id === id);

export function findConversation(conversationId) {
  for (const c of customers) {
    const conv = c.conversations.find((x) => x.id === conversationId);
    if (conv) return { customer: c, conversation: conv };
  }
  return null;
}

export const findCustomerByEmail = (email) =>
  customers.find((c) => c.contact.email.toLowerCase() === String(email).toLowerCase());
