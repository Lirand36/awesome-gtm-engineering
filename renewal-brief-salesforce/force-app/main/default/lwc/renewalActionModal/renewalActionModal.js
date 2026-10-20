import { api } from 'lwc';
import LightningModal from 'lightning/modal';

// Review one proposed step: edit the draft and approve it, or dismiss it with a reason.
export default class RenewalActionModal extends LightningModal {
    @api action;

    dismissing = false;
    draft;
    reason = '';

    connectedCallback() {
        this.draft = this.action?.Draft__c;
    }

    get hasDraft() {
        return this.action?.Draft__c != null;
    }
    get owner() {
        return [this.action?.Owner_Role__c, this.action?.Assigned_To__r?.Name].filter(Boolean).join(' · ');
    }
    get reasonMissing() {
        return !this.reason.trim();
    }

    handleDraft(event) {
        this.draft = event.target.value;
    }
    handleReason(event) {
        this.reason = event.target.value;
    }
    showDismiss() {
        this.dismissing = true;
    }
    showApprove() {
        this.dismissing = false;
    }
    handleCancel() {
        this.close(null);
    }
    handleApprove() {
        this.close({ decision: 'approve', draft: this.hasDraft ? this.draft : null });
    }
    handleDismiss() {
        this.close({ decision: 'dismiss', reason: this.reason.trim() });
    }
}
