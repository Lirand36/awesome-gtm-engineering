import { LightningElement, api, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { notifyRecordUpdateAvailable } from 'lightning/uiRecordApi';
import getBrief from '@salesforce/apex/RenewalBriefController.getBrief';
import approveAction from '@salesforce/apex/RenewalBriefController.approveAction';
import dismissAction from '@salesforce/apex/RenewalBriefController.dismissAction';
import updateForecastCategory from '@salesforce/apex/RenewalBriefController.updateForecastCategory';
import ActionModal from 'c/renewalActionModal';

const DAY = 86400000;
const money = (n) =>
    n == null ? '–' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(n);
// Dates from Apex arrive as "YYYY-MM-DD"; read them as local dates so they never shift a day.
const asDate = (d) => {
    if (!d) return null;
    const [y, m, day] = String(d).slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, day);
};
const fmtDate = (d) => (d ? asDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
const relTime = (iso) => {
    if (!iso) return '';
    const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600000);
    if (h < 1) return 'just now';
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
};
const AGENT_TONE = { Commit: 'good', 'Best Case': 'warn', 'At Risk': 'bad', Downsell: 'warn', 'Churn Risk': 'bad' };
const RISK_TONE = { 'On Track': 'good', Watch: 'warn', 'At Risk': 'bad' };
const STATUS_TONE = { Engaged: 'good', 'Not met': 'warn', Quiet: 'neutral', Left: 'bad' };

export default class RenewalBrief extends LightningElement {
    @api recordId;

    wired;
    data;
    error;
    busy = false;
    myCall;

    @wire(getBrief, { opportunityId: '$recordId' })
    wiredBrief(result) {
        this.wired = result;
        if (result.data) {
            this.data = result.data;
            this.error = undefined;
            this.myCall = result.data.opportunity?.ForecastCategoryName;
        } else if (result.error) {
            this.error = result.error?.body?.message ?? 'The brief could not be loaded.';
        }
    }

    // ---------- what the template shows ----------
    get loaded() {
        return Boolean(this.data?.opportunity);
    }
    get hasBrief() {
        return Boolean(this.data?.brief);
    }
    get opp() {
        return this.data.opportunity;
    }

    get headline() {
        const o = this.opp;
        const renewal = asDate(o.Renewal_Date__c);
        const days = renewal ? Math.round((renewal.getTime() - Date.now()) / DAY) : null;
        return {
            account: o.Account?.Name ?? o.Name,
            arr: money(o.Amount),
            renewal: renewal ? `renews ${fmtDate(o.Renewal_Date__c)}` : 'no renewal date',
            days: days == null ? '' : days >= 0 ? `in ${days} days` : `${-days} days ago`,
            tier: o.Renewal_Tier__c,
            stage: o.StageName,
            ae: o.Owner?.Name,
            csm: o.CSM__r?.Name ?? 'No CSM set',
            risk: this.data.brief?.Risk_Level__c,
            riskClass: `badge badge_${RISK_TONE[this.data.brief?.Risk_Level__c] ?? 'neutral'}`,
            updated: this.data.brief ? `Updated ${relTime(this.data.brief.Generated_At__c)}${this.data.brief.Sources_Note__c ? ` from ${this.data.brief.Sources_Note__c}` : ''}` : ''
        };
    }

    get summary() {
        return this.data.brief?.Summary__c;
    }

    get plan() {
        const firstOpen = this.data.plan.find((a) => a.Status__c === 'Proposed');
        return this.data.plan.map((a) => {
            const open = a.Status__c === 'Proposed';
            return {
                id: a.Id,
                title: a.Title__c,
                reason: a.Reason__c,
                prepared: a.Prepared__c,
                owner: [a.Owner_Role__c, a.Assigned_To__r?.Name].filter(Boolean).join(' · '),
                due: a.Due_Date__c ? `by ${fmtDate(a.Due_Date__c)}` : '',
                open,
                doneLabel: a.Status__c === 'Approved'
                    ? `Approved${a.Approved_By__r?.Name ? ` by ${a.Approved_By__r.Name}` : ''}${a.Approved_At__c ? ` · ${relTime(a.Approved_At__c)}` : ''}`
                    : a.Status__c,
                buttonLabel: a.Draft__c ? 'Review the draft' : 'Review',
                // One loud button: only the most important open step is brand-colored.
                variant: firstOpen && a.Id === firstOpen.Id ? 'brand' : 'neutral',
                rowClass: `plan-row plan-row_${a.Priority__c === 'High' ? 'bad' : a.Priority__c === 'Medium' ? 'warn' : 'calm'}${open ? '' : ' plan-row_done'}`
            };
        });
    }
    get planCount() {
        const open = this.data.plan.filter((a) => a.Status__c === 'Proposed').length;
        return open ? `${open} to approve` : 'Nothing waiting for you';
    }
    get hasPlan() {
        return this.data.plan.length > 0;
    }

    get signals() {
        return this.data.signals.map((s) => ({
            id: s.Id,
            when: fmtDate(s.Detected_On__c),
            headline: s.Headline__c,
            detail: s.Detail__c,
            quote: s.Quote__c,
            quoteBy: s.Quote_By__c,
            source: [s.Source__c, s.Source_Ref__c].filter(Boolean).join(' · '),
            url: s.Source_Url__c,
            sourceClass: `source source_${(s.Source__c ?? 'other').toLowerCase()}`,
            rowClass: `signal signal_${(s.Severity__c ?? 'low').toLowerCase()}`
        }));
    }
    get hasSignals() {
        return this.data.signals.length > 0;
    }

    get value() {
        const b = this.data.brief;
        return b && (b.Value_Summary__c || b.Value_Annual__c != null)
            ? { annual: money(b.Value_Annual__c), text: b.Value_Summary__c }
            : null;
    }

    get forecast() {
        const o = this.opp;
        const agent = o.Agent_Forecast_Category__c;
        const mine = o.ForecastCategoryName;
        return {
            agent: agent ?? 'Not yet',
            agentClass: `big tone_${AGENT_TONE[agent] ?? 'neutral'}`,
            likelihood: o.Agent_Likelihood__c != null ? `${Math.round(o.Agent_Likelihood__c)}% likely` : '',
            expected: o.Agent_Expected_ARR__c != null ? `${money(o.Agent_Expected_ARR__c)} expected` : '',
            mine: mine ?? '–',
            disagree: Boolean(agent && mine && agent !== mine)
        };
    }
    get callOptions() {
        return ['Pipeline', 'Best Case', 'Commit', 'Omitted'].map((v) => ({ label: v, value: v }));
    }
    get callUnchanged() {
        return this.busy || this.myCall === this.opp.ForecastCategoryName;
    }

    get committee() {
        return this.data.committee.map((r) => {
            const status = r.Contact?.Left_Company__c ? 'Left' : r.Contact?.Stakeholder_Status__c;
            return {
                id: r.Id,
                name: r.Contact?.Name,
                initials: (r.Contact?.Name ?? '?').split(' ').map((p) => p[0]).join('').slice(0, 2),
                line: [r.Contact?.Title, r.Role].filter(Boolean).join(' · '),
                note: r.Contact?.Stakeholder_Note__c,
                status,
                badgeClass: `badge badge_${STATUS_TONE[status] ?? 'neutral'}`,
                nameClass: status === 'Left' ? 'person-name person-name_gone' : 'person-name'
            };
        });
    }
    get hasCommittee() {
        return this.data.committee.length > 0;
    }
    get singleThreaded() {
        const active = this.data.committee.filter((r) => !r.Contact?.Left_Company__c && r.Contact?.Stakeholder_Status__c === 'Engaged');
        return this.data.committee.length > 1 && active.length === 1 ? `Single-threaded: only ${active[0].Contact.Name} is engaged.` : '';
    }

    get milestones() {
        const renewal = asDate(this.opp.Renewal_Date__c);
        return this.data.milestones.map((m) => {
            const due = renewal && m.Milestone_Offset__c != null ? new Date(renewal.getTime() - m.Milestone_Offset__c * DAY) : null;
            const done = m.Status__c === 'Done' || m.Status__c === 'Approved';
            return {
                id: m.Id,
                when: m.Milestone_Offset__c != null ? `T-${m.Milestone_Offset__c}` : '',
                title: m.Title__c,
                due: due ? due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
                done
            };
        });
    }
    get hasMilestones() {
        return this.data.milestones.length > 0;
    }

    // ---------- actions ----------
    async handleReview(event) {
        const id = event.currentTarget.dataset.id;
        const action = this.data.plan.find((a) => a.Id === id);
        const result = await ActionModal.open({ size: 'medium', label: action.Title__c, action });
        if (!result) return;
        await this.run(async () => {
            if (result.decision === 'approve') {
                await approveAction({ actionId: id, draft: result.draft });
                this.toast('Approved', 'The agent will carry it out and log it on this renewal.', 'success');
            } else if (result.decision === 'dismiss') {
                await dismissAction({ actionId: id, reason: result.reason });
                this.toast('Dismissed', 'The step is off the plan. Your reason helps the agent.', 'info');
            }
        });
    }

    handleCallChange(event) {
        this.myCall = event.detail.value;
    }

    async handleCallSave() {
        await this.run(async () => {
            await updateForecastCategory({ opportunityId: this.recordId, category: this.myCall });
            await notifyRecordUpdateAvailable([{ recordId: this.recordId }]);
            this.toast('Forecast updated', `Your call is now ${this.myCall}.`, 'success');
        });
    }

    async run(fn) {
        this.busy = true;
        try {
            await fn();
            await refreshApex(this.wired);
        } catch (e) {
            this.toast('That did not work', e?.body?.message ?? e?.message ?? 'Try again in a moment.', 'error');
        } finally {
            this.busy = false;
        }
    }

    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
