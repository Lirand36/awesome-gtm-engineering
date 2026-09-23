// Internal Hub — front end. Plain JS, no build step: hash routing + template strings.

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');

const SYSTEMS = {
  hubspot: { name: 'HubSpot', color: 'var(--hubspot)', letter: 'H' },
  jira: { name: 'Jira', color: 'var(--jira)', letter: 'J' },
  intercom: { name: 'Intercom', color: 'var(--intercom)', letter: 'I' },
  webhook: { name: 'Webhook', color: 'var(--webhook)', letter: 'W' },
};

const state = { meta: null, log: [], inboxSelected: null, flashId: null };

// ---------- helpers ----------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Number(n || 0).toLocaleString('en-US');
const compact = (n) => Intl.NumberFormat('en-US', { notation: 'compact' }).format(n);
const rel = (iso) => {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
const stageLabel = (id) => state.meta?.stages.find((s) => s.id === id)?.label ?? id;
const healthColor = (h) => (h >= 75 ? 'var(--good)' : h >= 50 ? 'var(--warn)' : 'var(--bad)');
const healthBar = (h) => `<div class="health"><div class="health-bar"><span style="width:${h}%;background:${healthColor(h)}"></span></div><span class="small">${h}</span></div>`;
const src = (sys, text) => `<span class="src ${sys}">${esc(text ?? SYSTEMS[sys].name)}</span>`;
const priorityChip = (p) => `<span class="chip ${/High/.test(p) ? 'bad' : p === 'Medium' ? 'warn' : ''}">${esc(p)}</span>`;
const statusChip = (s) => `<span class="chip ${s === 'Done' ? 'good' : s === 'In Progress' ? 'accent' : ''}">${esc(s)}</span>`;

const actor = () => $('#actor').value;

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Actor': encodeURIComponent(actor()) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function toast(html, { system, error, ms = 4500 } = {}) {
  const el = document.createElement('div');
  el.className = 'toast' + (error ? ' error' : '');
  if (system) el.style.setProperty('--dot', SYSTEMS[system]?.color);
  el.innerHTML = html;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), ms);
}

// Runs an action, disabling the clicked button meanwhile and surfacing errors.
async function run(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); }
  catch (err) { toast(`<strong>Error:</strong> ${esc(err.message)}`, { error: true }); }
  finally { if (btn) btn.disabled = false; }
}

// ---------- live stream from the server ----------
function connectEvents() {
  const es = new EventSource('/api/events');
  es.addEventListener('integration', (e) => {
    const entry = JSON.parse(e.data);
    state.log.unshift(entry);
    const sys = SYSTEMS[entry.system];
    toast(
      `<div class="t-line"><strong>${esc(sys?.name)}</strong><span class="${entry.ok ? 'status-ok' : 'status-bad'} mono">${entry.status} · ${entry.durationMs}ms</span></div>
       <div>${esc(entry.action)} <span class="chip">${entry.mode === 'live' ? 'LIVE' : 'MOCK'}</span></div>
       <div class="mono muted">${esc(entry.request.method)} ${esc(new URL(entry.request.url).pathname)}</div>`,
      { system: entry.system }
    );
    if (location.hash.startsWith('#/activity')) renderActivity();
  });
  es.addEventListener('inbound', (e) => {
    const ev = JSON.parse(e.data);
    state.flashId = ev.conversation.id;
    toast(`<strong>New conversation</strong> from ${esc(ev.customerName)}<div class="muted">${esc(ev.conversation.messages[0].text)}</div>`, { system: 'intercom', ms: 6000 });
    refreshBadge();
    const hash = location.hash;
    if (hash.startsWith('#/inbox') || hash === `#/customers/${ev.customerId}`) route();
  });
}

async function refreshBadge() {
  const inbox = await api('/api/inbox');
  const open = inbox.filter((c) => c.state === 'open').length;
  const b = $('#inbox-badge');
  b.hidden = !open;
  b.textContent = open;
}

// ---------- views ----------
async function renderCustomers() {
  const list = await api('/api/customers');
  const totalMrr = list.reduce((s, c) => s + c.mrr, 0);
  const pipeline = list.filter((c) => !['closedwon', 'closedlost'].includes(c.dealStage)).reduce((s, c) => s + c.dealAmount, 0);
  const atRisk = list.filter((c) => c.health < 50).length;
  const openConv = list.reduce((s, c) => s + c.openConversations, 0);

  view.innerHTML = `
    <div class="page-head">
      <div><h1>Customers</h1><p class="muted">One view per account: CRM, product usage, tickets and conversations. No tab-hopping.</p></div>
      <div class="toolbar"><input class="input" id="q" placeholder="Search account, domain or owner…" /></div>
    </div>
    <div class="kpis">
      <div class="card kpi"><div class="muted small">Total MRR</div><div class="v">${money(totalMrr)}</div></div>
      <div class="card kpi"><div class="muted small">Open pipeline</div><div class="v">${money(pipeline)}</div></div>
      <div class="card kpi"><div class="muted small">At-risk accounts</div><div class="v" style="color:var(--bad)">${atRisk}</div></div>
      <div class="card kpi"><div class="muted small">Open conversations</div><div class="v">${openConv}</div></div>
    </div>
    <div class="card table-wrap">
      <table class="table">
        <thead><tr>
          <th>Account</th><th class="hide-sm">Plan</th><th class="hide-sm">MRR</th><th class="hide-sm">Seats</th><th>Health</th><th>Deal stage</th><th class="hide-sm">Open</th><th class="hide-sm">Owner</th>
        </tr></thead>
        <tbody>
          ${list.map((c) => `
            <tr data-id="${c.id}" data-search="${esc(`${c.name} ${c.domain} ${c.owner}`.toLowerCase())}">
              <td><div class="cust-name">${esc(c.name)}</div><div class="muted small mono">${esc(c.domain)}</div></td>
              <td class="hide-sm"><span class="chip">${esc(c.plan)}</span></td>
              <td class="hide-sm">${money(c.mrr)}</td>
              <td class="hide-sm small">${c.seats}/${c.seatsLicensed}</td>
              <td>${healthBar(c.health)}</td>
              <td><span class="chip accent">${esc(stageLabel(c.dealStage))}</span></td>
              <td class="hide-sm small">${c.openTickets} tickets · ${c.openConversations} convos</td>
              <td class="hide-sm small">${esc(c.owner)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  view.querySelectorAll('tbody tr').forEach((tr) => tr.addEventListener('click', () => (location.hash = `#/customers/${tr.dataset.id}`)));
  $('#q').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    view.querySelectorAll('tbody tr').forEach((tr) => (tr.hidden = q && !tr.dataset.search.includes(q)));
  });
}

function conversationBlock(conv, { compact = false } = {}) {
  return `
    <div class="thread">
      ${conv.messages.map((m) => `<div class="msg ${m.from}"><div class="who">${esc(m.author)} · ${rel(m.at)}</div>${esc(m.text)}</div>`).join('')}
    </div>
    ${conv.state === 'open' ? `
      <form class="reply" data-conv="${esc(conv.id)}">
        <textarea class="input" name="text" rows="${compact ? 1 : 2}" placeholder="Reply to customer (sent via Intercom)…" required></textarea>
        <div style="display:flex;flex-direction:column;gap:6px">
          <button class="btn primary sm" name="send">Send</button>
          <button class="btn sm" name="close" value="1">Send &amp; close</button>
        </div>
      </form>` : `<div class="empty">Conversation closed.</div>`}`;
}

function bindReplies(root, onDone) {
  root.querySelectorAll('form.reply').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = e.submitter;
      const text = form.text.value;
      run(btn, async () => {
        await api(`/api/conversations/${form.dataset.conv}/reply`, { method: 'POST', body: { text, close: btn?.name === 'close' } });
        onDone();
      });
    });
  });
}

async function renderCustomer(id) {
  const c = await api(`/api/customers/${id}`);
  const stages = state.meta.stages;
  const idx = stages.findIndex((s) => s.id === c.deal.stage);

  view.innerHTML = `
    <a class="back" href="#/customers">← Back to customers</a>
    <div class="page-head">
      <div>
        <h1>${esc(c.name)}</h1>
        <div class="meta-row">
          <span class="chip">${esc(c.plan)}</span>
          <span class="chip">${money(c.mrr)} / mo</span>
          <span class="chip ${c.health >= 75 ? 'good' : c.health >= 50 ? 'warn' : 'bad'}">Health ${c.health}</span>
          <span class="chip">Owner: ${esc(c.owner)}</span>
        </div>
      </div>
      <div class="toolbar">
        <button class="btn" id="add-note">＋ Note</button>
        <button class="btn primary" id="new-ticket">＋ New ticket</button>
      </div>
    </div>

    <div class="detail-grid">
      <div class="stack">
        <section class="card">
          <div class="card-head">
            <div><h2>${esc(c.deal.name)}</h2><div class="muted small">${money(c.deal.amount)} · Click a stage to update HubSpot</div></div>
            ${src('hubspot', `HubSpot · Deal ${c.deal.id}`)}
          </div>
          <div class="pipeline">
            ${stages.map((s, i) => `
              <button class="stage ${s.id === 'closedwon' ? 'won' : ''} ${s.id === 'closedlost' ? 'lost' : ''} ${i === idx ? 'current' : i < idx && c.deal.stage !== 'closedlost' ? 'done' : ''}"
                data-stage="${s.id}">${esc(s.label)}</button>`).join('')}
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Conversations</h2>${src('intercom')}</div>
          ${c.conversations.length ? c.conversations.map((conv) => `
            <div class="${conv.id === state.flashId ? 'new-flash' : ''}" style="border-bottom:1px solid var(--border)">
              <div class="list-item" style="border:0;padding-bottom:0">
                <div class="grow"><strong>${esc(conv.subject)}</strong></div>
                <span class="chip ${conv.state === 'open' ? 'warn' : 'good'}">${conv.state === 'open' ? 'Open' : 'Closed'}</span>
              </div>
              ${conversationBlock(conv, { compact: true })}
            </div>`).join('') : '<div class="empty">No conversations.</div>'}
        </section>

        <section class="card">
          <div class="card-head"><h2>Engineering tickets</h2>${src('jira')}</div>
          ${c.tickets.length ? c.tickets.map((t) => `
            <div class="list-item">
              <span class="mono muted">${esc(t.key)}</span>
              <div class="grow">${esc(t.summary)}<div class="muted small">${rel(t.createdAt)}</div></div>
              ${priorityChip(t.priority)} ${statusChip(t.status)}
            </div>`).join('') : '<div class="empty">No open tickets.</div>'}
        </section>
      </div>

      <div class="stack">
        <section class="card card-pad">
          <h2 style="margin-bottom:12px">Primary contact</h2>
          <dl class="kv">
            <dt>Name</dt><dd>${esc(c.contact.name)}</dd>
            <dt>Role</dt><dd>${esc(c.contact.role)}</dd>
            <dt>Email</dt><dd class="mono">${esc(c.contact.email)}</dd>
            <dt>Phone</dt><dd class="mono">${esc(c.contact.phone)}</dd>
            <dt>Domain</dt><dd class="mono">${esc(c.domain)}</dd>
          </dl>
        </section>
        <section class="card card-pad">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h2>Product usage</h2><span class="src">Product DB</span></div>
          <div class="usage">
            <div><div class="muted small">Seats</div><div class="v">${c.usage.seats} / ${c.usage.seatsLicensed}</div>
              <div class="meter"><span style="width:${Math.round((c.usage.seats / c.usage.seatsLicensed) * 100)}%"></span></div></div>
            <div><div class="muted small">API calls (30d)</div><div class="v">${compact(c.usage.apiCalls30d)}</div></div>
            <div><div class="muted small">Workspace</div><div class="mono">${esc(c.usage.workspaceId)}</div></div>
            <div><div class="muted small">Region</div><div class="mono">${esc(c.usage.region)}</div></div>
          </div>
          <div class="muted small" style="margin-top:12px">Last active ${rel(c.usage.lastActive)}</div>
        </section>
        <section class="card">
          <div class="card-head"><h2>Notes</h2>${src('hubspot')}</div>
          ${c.notes.length ? c.notes.map((n) => `<div class="note">${esc(n.text)}<div class="muted small">${esc(n.author)} · ${rel(n.at)}</div></div>`).join('') : '<div class="empty">No notes yet.</div>'}
        </section>
      </div>
    </div>`;
  state.flashId = null;

  const reload = () => renderCustomer(id);

  view.querySelectorAll('.stage').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.stage === c.deal.stage) return;
    run(b, async () => {
      const { calls } = await api(`/api/customers/${id}/deal-stage`, { method: 'POST', body: { stage: b.dataset.stage } });
      if (calls.length > 1) toast('<strong>Automation ran:</strong> onboarding ticket opened in Jira and <span class="mono">deal.won</span> webhook sent', { system: 'webhook', ms: 6000 });
      reload();
    });
  }));
  bindReplies(view, reload);

  $('#new-ticket').addEventListener('click', () => openModal(`
    <h2>New ticket for ${esc(c.name)}</h2>
    <div class="field"><label>Summary</label><input class="input" name="summary" required autofocus /></div>
    <div class="field"><label>Description</label><textarea class="input" name="description"></textarea></div>
    <div class="field"><label>Priority</label>
      <select class="input" name="priority"><option>Low</option><option selected>Medium</option><option>High</option><option>Highest</option></select></div>
    <p class="muted small">Created in Jira with the <span class="mono">customer-reported</span> label.</p>`,
    (data) => api(`/api/customers/${id}/tickets`, { method: 'POST', body: data }).then(reload)));

  $('#add-note').addEventListener('click', () => openModal(`
    <h2>Note on ${esc(c.name)}</h2>
    <div class="field"><textarea class="input" name="text" rows="4" required autofocus placeholder="What should the team know?"></textarea></div>
    <p class="muted small">Saved as a Note on the company in HubSpot.</p>`,
    (data) => api(`/api/customers/${id}/notes`, { method: 'POST', body: data }).then(reload)));
}

async function renderInbox() {
  const items = await api('/api/inbox');
  if (!items.find((i) => i.id === state.inboxSelected)) state.inboxSelected = items[0]?.id;
  const sel = items.find((i) => i.id === state.inboxSelected);

  view.innerHTML = `
    <div class="page-head">
      <div><h1>Inbox</h1><p class="muted">Every Intercom conversation, with account context next to it.</p></div>
      <button class="btn" id="simulate">⚡ Simulate inbound (webhook)</button>
    </div>
    <div class="card inbox">
      <div class="inbox-list">
        ${items.map((i) => `
          <button class="inbox-item ${i.id === state.inboxSelected ? 'active' : ''} ${i.id === state.flashId ? 'new-flash' : ''}" data-id="${esc(i.id)}">
            <div class="top"><strong>${esc(i.customerName)}</strong><span class="muted small">${rel(i.updatedAt)}</span></div>
            <div class="small">${esc(i.subject)}</div>
            <div class="preview">${esc(i.messages.at(-1)?.text)}</div>
            <div style="margin-top:4px;display:flex;gap:6px">
              <span class="chip ${i.state === 'open' ? 'warn' : 'good'}">${i.state === 'open' ? 'Open' : 'Closed'}</span>
              <span class="chip">${esc(i.plan)}</span>
            </div>
          </button>`).join('') || '<div class="empty">No conversations.</div>'}
      </div>
      <div class="inbox-thread">
        ${sel ? `
          <div class="card-head">
            <div><h2>${esc(sel.subject)}</h2><a class="muted small" href="#/customers/${sel.customerId}">${esc(sel.customerName)} · Open account →</a></div>
            ${src('intercom', `Conversation ${sel.id}`)}
          </div>
          ${conversationBlock(sel)}` : '<div class="empty">Select a conversation.</div>'}
      </div>
    </div>`;
  state.flashId = null;

  view.querySelectorAll('.inbox-item').forEach((b) => b.addEventListener('click', () => { state.inboxSelected = b.dataset.id; renderInbox(); }));
  bindReplies(view, () => { renderInbox(); refreshBadge(); });

  $('#simulate').addEventListener('click', (e) => run(e.currentTarget, () => {
    const samples = [
      { email: 'michal@shefa.health', text: 'Our scheduled export did not run this morning. Can you check?' },
      { email: 'yonatan@orbitfin.com', text: 'What would Growth cost for 25 seats?' },
      { email: 'shira@kalanit.co', text: 'We hit our seat limit. How do we add more users?' },
      { email: 'gilad@nahar.energy', text: 'Seeing 502s on /v2/ingest again. ETA on a fix?' },
    ];
    const s = samples[Math.floor(Math.random() * samples.length)];
    // Shaped like Intercom's conversation.user.created webhook payload
    return fetch('/webhooks/intercom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: 'conversation.user.created', data: { item: { id: String(215470000 + Math.floor(Math.random() * 9999)), source: { body: s.text, author: { email: s.email } } } } }),
    });
  }));
}

function renderActivity() {
  const rows = state.log;
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Integration log</h1><p class="muted">Every call this system made to external tools: what was sent, what came back, how long it took.</p></div>
    </div>
    <div class="card">
      ${rows.length ? rows.map((r) => `
        <details class="log-row">
          <summary>
            <span class="small hide-sm">${new Date(r.ts).toLocaleTimeString('en-US')}</span>
            ${src(r.system)}
            <span class="small"><strong>${esc(r.action)}</strong> <span class="mono muted url">${esc(r.request.method)} ${esc(r.request.url)}</span></span>
            <span class="chip hide-sm">${r.mode === 'live' ? 'LIVE' : 'MOCK'}</span>
            <span class="mono ${r.ok ? 'status-ok' : 'status-bad'}">${r.status}</span>
            <span class="mono muted hide-sm">${r.durationMs}ms</span>
          </summary>
          <div class="log-body">
            <div><div class="muted small">Request</div><pre class="code">${esc(`${r.request.method} ${r.request.url}\n${JSON.stringify(r.request.headers, null, 2)}\n\n${JSON.stringify(r.request.body ?? null, null, 2)}`)}</pre></div>
            <div><div class="muted small">Response</div><pre class="code">${esc(JSON.stringify(r.response, null, 2))}</pre></div>
          </div>
        </details>`).join('') : '<div class="empty">No calls yet. Try moving a deal stage or replying to a conversation.</div>'}
    </div>`;
}

function renderConnections() {
  const env = {
    hubspot: ['HUBSPOT_TOKEN'],
    jira: ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'JIRA_PROJECT_KEY'],
    intercom: ['INTERCOM_TOKEN', 'INTERCOM_ADMIN_ID'],
    webhook: ['OUTBOUND_WEBHOOK_URL'],
  };
  const origin = location.origin;
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Connections</h1><p class="muted">A system without credentials runs in MOCK mode: the request is built exactly as it would be, but never leaves the server.</p></div>
    </div>
    <div class="conn-grid">
      ${state.meta.integrations.map((i) => `
        <div class="card conn">
          <div class="conn-top">
            <span class="logo" style="background:${SYSTEMS[i.id].color}">${SYSTEMS[i.id].letter}</span>
            <div style="flex:1"><strong>${esc(i.name)}</strong><div class="muted small">${esc(i.role)}</div></div>
            <span class="chip ${i.live ? 'good' : 'warn'}">${i.live ? 'Live' : 'Mock'}</span>
          </div>
          <div class="muted small">Environment variables:</div>
          <div class="mono muted">${env[i.id].join('<br>')}</div>
        </div>`).join('')}
    </div>
    <div class="card card-pad" style="margin-top:16px">
      <h2 style="margin-bottom:8px">Inbound webhooks</h2>
      <p class="muted small" style="margin-top:0">Point Intercom (topic <span class="mono">conversation.user.created</span>) at this URL so new conversations appear here in real time:</p>
      <pre class="code">POST ${esc(origin)}/webhooks/intercom</pre>
    </div>`;
}

// ---------- modal ----------
function openModal(fieldsHtml, onSubmit) {
  const dlg = $('#modal');
  dlg.innerHTML = `<form method="dialog">${fieldsHtml}
    <div class="dialog-actions"><button class="btn primary" value="ok">Save</button><button class="btn" value="cancel" formnovalidate>Cancel</button></div></form>`;
  const form = dlg.querySelector('form');
  form.addEventListener('submit', (e) => {
    if (e.submitter?.value !== 'ok') return;
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    run(e.submitter, async () => { await onSubmit(data); dlg.close(); });
  });
  dlg.showModal();
}

// ---------- router ----------
async function route() {
  const hash = location.hash || '#/customers';
  const [, section, id] = hash.split('/');
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === section));
  try {
    if (section === 'customers' && id) await renderCustomer(id);
    else if (section === 'inbox') await renderInbox();
    else if (section === 'activity') renderActivity();
    else if (section === 'connections') renderConnections();
    else await renderCustomers();
  } catch (err) {
    view.innerHTML = `<div class="card empty">Failed to load: ${esc(err.message)}</div>`;
  }
}

async function init() {
  try { $('#actor').value = localStorage.getItem('actor') || $('#actor').value; } catch {}
  $('#actor').addEventListener('change', (e) => { try { localStorage.setItem('actor', e.target.value); } catch {} });
  [state.meta, state.log] = await Promise.all([api('/api/meta'), api('/api/log')]);
  window.addEventListener('hashchange', route);
  connectEvents();
  refreshBadge();
  route();
}

init();
