// Jira Cloud REST v3. Docs: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/
import { send } from './http.js';

const cfg = () => ({
  base: process.env.JIRA_BASE_URL?.replace(/\/$/, ''),
  email: process.env.JIRA_EMAIL,
  token: process.env.JIRA_API_TOKEN,
  project: process.env.JIRA_PROJECT_KEY || 'SUP',
});
export const isLive = () => {
  const c = cfg();
  return Boolean(c.base && c.email && c.token);
};

let mockSeq = 1042;

export function createIssue({ summary, description, priority = 'Medium', labels = [] }) {
  const c = cfg();
  return send({
    system: 'jira',
    action: 'Create issue',
    method: 'POST',
    url: `${c.base || 'https://your-company.atlassian.net'}/rest/api/3/issue`,
    headers: { Authorization: `Basic ${Buffer.from(`${c.email}:${c.token}`).toString('base64')}` },
    body: {
      fields: {
        project: { key: c.project },
        issuetype: { name: 'Task' },
        summary,
        priority: { name: priority },
        labels,
        // Jira v3 requires Atlassian Document Format for rich text
        description: {
          type: 'doc',
          version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: description || summary }] }],
        },
      },
    },
    live: isLive(),
    mockResponse: () => {
      const n = ++mockSeq;
      return { id: String(10000 + n), key: `${c.project}-${n}`, self: `mock://jira/issue/${n}` };
    },
  });
}
