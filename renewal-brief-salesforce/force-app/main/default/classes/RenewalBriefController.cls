/**
 * Serves the Renewal Brief component on the Opportunity record page.
 *
 * Runs "with sharing", and every query and update runs in user mode, so a person
 * only sees and changes what their own sharing rules, object and field permissions allow.
 */
public with sharing class RenewalBriefController {

    public class Brief {
        @AuraEnabled public Opportunity opportunity;
        @AuraEnabled public Renewal_Brief__c brief;
        @AuraEnabled public List<Renewal_Signal__c> signals = new List<Renewal_Signal__c>();
        @AuraEnabled public List<Renewal_Action__c> plan = new List<Renewal_Action__c>();
        @AuraEnabled public List<Renewal_Action__c> milestones = new List<Renewal_Action__c>();
        @AuraEnabled public List<OpportunityContactRole> committee = new List<OpportunityContactRole>();
    }

    @AuraEnabled(cacheable=true)
    public static Brief getBrief(Id opportunityId) {
        Brief result = new Brief();
        List<Opportunity> opps = [
            SELECT Id, Name, Amount, StageName, CloseDate, ForecastCategoryName,
                   Account.Name, Owner.Name, CSM__r.Name,
                   Renewal_Date__c, Renewal_Tier__c,
                   Agent_Forecast_Category__c, Agent_Likelihood__c, Agent_Expected_ARR__c
            FROM Opportunity
            WHERE Id = :opportunityId
            WITH USER_MODE
            LIMIT 1
        ];
        if (opps.isEmpty()) {
            return result;
        }
        result.opportunity = opps[0];

        List<Renewal_Brief__c> briefs = [
            SELECT Id, Summary__c, Risk_Level__c, Value_Summary__c, Value_Annual__c,
                   Generated_At__c, Version__c, Sources_Note__c
            FROM Renewal_Brief__c
            WHERE Opportunity__c = :opportunityId
            WITH USER_MODE
            ORDER BY Version__c DESC NULLS LAST, CreatedDate DESC
            LIMIT 1
        ];
        result.brief = briefs.isEmpty() ? null : briefs[0];

        result.signals = [
            SELECT Id, Headline__c, Detail__c, Type__c, Severity__c, Detected_On__c,
                   Quote__c, Quote_By__c, Source__c, Source_Ref__c, Source_Url__c
            FROM Renewal_Signal__c
            WHERE Opportunity__c = :opportunityId
            WITH USER_MODE
            ORDER BY Detected_On__c DESC NULLS LAST
            LIMIT 10
        ];

        for (Renewal_Action__c a : [
            SELECT Id, Title__c, Reason__c, Prepared__c, Draft__c, Kind__c, Owner_Role__c,
                   Assigned_To__r.Name, Due_Date__c, Priority__c, Status__c,
                   Milestone_Offset__c, Approved_By__r.Name, Approved_At__c
            FROM Renewal_Action__c
            WHERE Opportunity__c = :opportunityId AND Status__c != 'Dismissed'
            WITH USER_MODE
            ORDER BY Milestone_Offset__c DESC NULLS LAST, Due_Date__c ASC NULLS LAST
        ]) {
            if (a.Kind__c == 'Milestone') {
                result.milestones.add(a);
            } else {
                result.plan.add(a);
            }
        }
        result.plan = sortPlan(result.plan);

        result.committee = [
            SELECT Id, Role, IsPrimary, Contact.Name, Contact.Title,
                   Contact.Stakeholder_Status__c, Contact.Left_Company__c, Contact.Stakeholder_Note__c
            FROM OpportunityContactRole
            WHERE OpportunityId = :opportunityId
            WITH USER_MODE
            ORDER BY Contact.Left_Company__c DESC, IsPrimary DESC
        ];
        return result;
    }

    /** A person approves a proposed step. Saves their edits to the draft and tells the agent service. */
    @AuraEnabled
    public static void approveAction(Id actionId, String draft) {
        Renewal_Action__c action = loadAction(actionId);
        if (action.Status__c != 'Proposed') {
            throw newError('This step was already ' + action.Status__c.toLowerCase() + '. Refresh the page to see the latest.');
        }
        action.Status__c = 'Approved';
        action.Approved_By__c = UserInfo.getUserId();
        action.Approved_At__c = System.now();
        if (draft != null) {
            action.Draft__c = draft;
        }
        Database.update(action, AccessLevel.USER_MODE);
        EventBus.publish(new Renewal_Action_Approved__e(
            Action_Id__c = action.Id,
            Opportunity_Id__c = action.Opportunity__c,
            Approved_By_Id__c = UserInfo.getUserId()
        ));
    }

    /** A person turns a proposal down, with a reason the agent learns from. */
    @AuraEnabled
    public static void dismissAction(Id actionId, String reason) {
        if (String.isBlank(reason)) {
            throw newError('Add a short reason, so the agent can learn from it.');
        }
        Renewal_Action__c action = loadAction(actionId);
        action.Status__c = 'Dismissed';
        action.Dismiss_Reason__c = reason.left(255);
        Database.update(action, AccessLevel.USER_MODE);
    }

    /** The AE changes their own call. The agent's forecast is never overwritten here. */
    @AuraEnabled
    public static void updateForecastCategory(Id opportunityId, String category) {
        Set<String> allowed = new Set<String>{ 'Pipeline', 'Best Case', 'Commit', 'Omitted' };
        if (!allowed.contains(category)) {
            throw newError('Pick Pipeline, Best Case, Commit or Omitted.');
        }
        Database.update(new Opportunity(Id = opportunityId, ForecastCategoryName = category), AccessLevel.USER_MODE);
    }

    private static Renewal_Action__c loadAction(Id actionId) {
        List<Renewal_Action__c> rows = [
            SELECT Id, Status__c, Opportunity__c FROM Renewal_Action__c WHERE Id = :actionId WITH USER_MODE LIMIT 1
        ];
        if (rows.isEmpty()) {
            throw newError('This step no longer exists, or you do not have access to it.');
        }
        return rows[0];
    }

    // Open steps first, then by priority and due date.
    private static List<Renewal_Action__c> sortPlan(List<Renewal_Action__c> plan) {
        Map<String, Integer> statusRank = new Map<String, Integer>{ 'Proposed' => 0, 'Approved' => 1, 'Done' => 2 };
        Map<String, Integer> priorityRank = new Map<String, Integer>{ 'High' => 0, 'Medium' => 1, 'Low' => 2 };
        List<PlanItem> items = new List<PlanItem>();
        for (Renewal_Action__c a : plan) {
            items.add(new PlanItem(a, statusRank, priorityRank));
        }
        items.sort();
        List<Renewal_Action__c> sorted = new List<Renewal_Action__c>();
        for (PlanItem i : items) {
            sorted.add(i.action);
        }
        return sorted;
    }

    private class PlanItem implements Comparable {
        Renewal_Action__c action;
        Long key;
        PlanItem(Renewal_Action__c a, Map<String, Integer> statusRank, Map<String, Integer> priorityRank) {
            action = a;
            Integer s = statusRank.containsKey(a.Status__c) ? statusRank.get(a.Status__c) : 3;
            Integer p = priorityRank.containsKey(a.Priority__c) ? priorityRank.get(a.Priority__c) : 3;
            Long due = 99999L;
            if (a.Due_Date__c != null) {
                due = Date.newInstance(2000, 1, 1).daysBetween(a.Due_Date__c);
            }
            key = s * 1000000000L + p * 100000000L + due;
        }
        public Integer compareTo(Object other) {
            Long o = ((PlanItem) other).key;
            return key == o ? 0 : (key < o ? -1 : 1);
        }
    }

    private static AuraHandledException newError(String message) {
        AuraHandledException e = new AuraHandledException(message);
        e.setMessage(message);
        return e;
    }
}
