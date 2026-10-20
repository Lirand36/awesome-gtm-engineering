# Renewal Brief for Salesforce

A Lightning Web Component for the Opportunity record page. It shows what the Renewal Agent knows about one renewal:
- the state in one paragraph
- the plan, for the AE and CSM to approve or dismiss
- what changed, with evidence
- the agent's forecast next to the AE's own call
- the buying committee
- the playbook milestones

The component reads everything through `RenewalBriefController`:
- **Sharing:** the class runs `with sharing`.
- **Permissions:** every query and update runs in user mode (`WITH USER_MODE`, `AccessLevel.USER_MODE`), so object and field permissions are enforced as well.
- **Inherited access:** the three agent objects are master-detail children of the Opportunity. Anyone who can't see the renewal can't see its brief.

## What's in the project

| Path | What it is |
|---|---|
| `objects/Renewal_Brief__c` | The brief. One per renewal; versions are kept. |
| `objects/Renewal_Signal__c` | Each thing the agent noticed, with source, quote and link. |
| `objects/Renewal_Action__c` | Each step in the plan, and each playbook milestone. Status goes Proposed → Approved → Done, or Dismissed with a reason. |
| `objects/Renewal_Action_Approved__e` | Platform event published on approval. The agent service subscribes to it and carries out the step. |
| `objects/Opportunity/fields` | Agent Forecast, Agent Likelihood, Agent Expected ARR, Renewal Tier, Renewal Date, CSM. The AE keeps the standard Forecast Category. |
| `objects/Contact/fields` | Stakeholder Status, Left Company, Stakeholder Note. |
| `classes/RenewalBriefController` | Apex behind the component, plus its tests. |
| `lwc/renewalBrief` | The component you place on the page. |
| `lwc/renewalActionModal` | The review window: edit the draft and approve, or dismiss with a reason. |
| `permissionsets/Renewal_Agent_User` | Access to the objects, fields and Apex class. |
| `scripts/apex/seed-atlas.apex` | Creates the Atlas Group example. |

## Set it up in your practice org

You need:
- The Salesforce CLI: `npm install -g @salesforce/cli`
- A Developer Edition org or a Trailhead Playground, in Lightning Experience

**1. Log in to the org**

From this folder:

```bash
sf org login web --alias practice --set-default
```

**2. Deploy the metadata**

```bash
sf project deploy start --source-dir force-app
```

**3. Run the tests**

```bash
sf apex run test --class-names RenewalBriefControllerTest --result-format human --code-coverage --wait 10
```

**4. Give yourself access**

```bash
sf org assign permset --name Renewal_Agent_User
```

Do this before step 5: the seed script runs as you and needs the field permissions.

**5. Create the example renewal**

```bash
sf apex run --file scripts/apex/seed-atlas.apex
```

The log ends with the link to the new opportunity, "Atlas Group · Renewal 2027".

**6. Place the component with Lightning App Builder**
1. Open the Atlas Group opportunity.
2. Click the gear, then **Edit Page**.
3. Find **Renewal Brief** under Custom components and drag it to the top of the main column.
4. Click **Save**, then **Activate** and pick **Assign as Org Default**.
5. Choose Desktop (or Desktop and phone), then **Save**.

**7. Try it**
- Click **Review the draft** on the first step. Edit the email and click **Approve**. The step shows who approved it and when, and a `Renewal_Action_Approved__e` event is published.
- Open another step, click **Dismiss**, and give a reason.
- Under **Forecast**, change your call to Best Case and save. The page's Forecast Category updates. The agent's forecast stays as it is.

## Showing it only on renewal opportunities

The steps above put the component on every opportunity, which is fine for practice. To limit it to renewals:
1. In Setup, create a Sales Process (for example "Renewal Process") and an Opportunity record type named **Renewal** that uses it.
2. Set the Atlas opportunity to that record type.
3. In Lightning App Builder, save a separate page for renewals (for example "Renewal Opportunity Page") with the component on it.
4. Under **Activation → App, Record Type, and Profile**, assign that page to the Renewal record type.

## Check that sharing works

The component should only show what the viewer is allowed to see.
1. Create a second user with the Standard User profile, and assign them `Renewal_Agent_User`.
2. With the org-wide default for Opportunity set to Private, log in as that user (Setup → Users → Login).
3. Open the Atlas opportunity link. They can't open the record, so the component shows nothing.
4. Share the opportunity with them using the Sharing button. Now they see the brief, the signals and the plan.

## Where the agent fits later

The agent service runs outside Salesforce and talks to it as an integration user (Connected App with OAuth JWT and a minimal permission set):
- **Writes:** `Renewal_Brief__c`, `Renewal_Signal__c`, `Renewal_Action__c` and the three Agent fields on Opportunity, through the REST or Composite API.
- **Listens:** to `Renewal_Action_Approved__e` through the Pub/Sub API, then carries out the approved step (a Gmail draft, a ChurnZero task, a Slack message).

Until that service exists, the seed script stands in for it.
