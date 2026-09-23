# Internal Hub (prototype)

An internal workspace for the Sales and Support teams at a B2B SaaS company. Reps work in one UI built for how the company works. Behind it, the system talks to the tools the company already uses, so reps don't have to open them: **HubSpot** (CRM), **Jira** (engineering tickets), **Intercom** (support chat) and outbound **webhooks** (Slack, Zapier, data warehouse, ...).

## Run it

```bash
cd internal-hub
npm start            # Node 22+, no dependencies
# → http://localhost:3000
```

With no `.env`, every connector runs in **MOCK** mode. Each request is built exactly as it would be for real (URL, headers, body), then logged and answered with a fake response. To go live, copy `.env.example` to `.env` and fill in credentials. Each system switches to LIVE on its own as soon as it has credentials.

## What the demo shows

| Screen | Rep action | What happens behind the scenes |
|---|---|---|
| **Customers** | Account overview: MRR, seats, health, deal stage, open work | Data joined from CRM, product DB, Jira and Intercom |
| **Account page** | Click a deal stage | `PATCH` to the HubSpot Deals API |
| | Move deal to *Closed won* | **Automation**: HubSpot updated, Jira onboarding ticket created, `deal.won` webhook fired |
| | New ticket | `POST` to the Jira Issues API |
| | Add note | `POST` to HubSpot Notes, associated to the company |
| **Inbox** | Reply, or reply and close | `POST` to the Intercom Conversations API |
| | Simulate inbound | Inbound webhook on `/webhooks/intercom`, pushed live to every open browser |
| **Integration log** | Audit of every outbound call | Full request and response, status, latency (secrets redacted) |
| **Connections** | LIVE/MOCK status per system | |

## Architecture

```
Browser (vanilla JS UI)
   │  REST + Server-Sent Events
   ▼
server.js ── services.js   ← business actions & automations ("what happens when a deal closes")
                │
                ▼
        connectors/*.js    ← one adapter per system: hubspot / jira / intercom / webhook
                │
                ▼
        connectors/http.js ← single outbound gateway: logging, timing, secret redaction, mock/live
```

To add a system (Salesforce, Zendesk, Slack, Stripe, ...), add one file in `connectors/` and call it from `services.js`.

## Gaps before production

- **Live reads**: account data comes from a local seed (`src/store.js`); only writes go out to external systems. The next step is a sync layer: an initial import plus inbound webhooks from HubSpot, Jira and Intercom into a database such as Postgres.
- **Auth and permissions**: SSO (Google or Okta) and role-based access for Sales, Support and Admin. Today the user is picked from a dropdown.
- **Reliability**: a queue with retries for outbound calls, idempotency keys, and signature checks on inbound webhooks.
- **Secrets**: store credentials in a secret manager instead of `.env`.
