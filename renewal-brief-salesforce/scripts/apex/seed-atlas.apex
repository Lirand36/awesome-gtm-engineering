// Creates the Atlas Group renewal example: an account, 4 contacts, a renewal opportunity,
// the agent's brief, 4 signals, a 3-step plan and 5 playbook milestones.
// Run it again any time: it removes the previous example first.
// Run: sf apex run --file scripts/apex/seed-atlas.apex

final String TAG = 'Renewal Brief example';
delete [SELECT Id FROM Account WHERE Description = :TAG];

Id me = UserInfo.getUserId();
Date today = Date.today();
Date renewal = today.addDays(177);

// An open stage that exists in this org, a few steps into the sales process
List<OpportunityStage> stages = [SELECT ApiName FROM OpportunityStage WHERE IsActive = true AND IsClosed = false ORDER BY SortOrder];
String stage = stages.size() > 2 ? stages[2].ApiName : stages[0].ApiName;

Account acct = new Account(Name = 'Atlas Group', Description = TAG, Industry = 'Transportation');
insert acct;

Contact david = new Contact(FirstName = 'David', LastName = 'Ross', Title = 'VP Operations', AccountId = acct.Id,
    Stakeholder_Status__c = 'Left', Left_Company__c = true, Stakeholder_Note__c = 'Former champion. Left on Oct 2.');
Contact rachel = new Contact(FirstName = 'Rachel', LastName = 'Stern', Title = 'VP Finance', AccountId = acct.Id,
    Stakeholder_Status__c = 'Not met', Stakeholder_Note__c = 'Joined Sep 8. Reviewing every vendor before Q2.');
Contact mark = new Contact(FirstName = 'Mark', LastName = 'Ellis', Title = 'Controller', AccountId = acct.Id,
    Stakeholder_Status__c = 'Engaged', Stakeholder_Note__c = 'On 4 of the last 6 calls.');
Contact tom = new Contact(FirstName = 'Tom', LastName = 'Reyes', Title = 'IT Lead', AccountId = acct.Id,
    Stakeholder_Status__c = 'Quiet', Stakeholder_Note__c = 'Owns the security review.');
insert new List<Contact>{ david, rachel, mark, tom };

Opportunity opp = new Opportunity(
    Name = 'Atlas Group · Renewal 2027',
    AccountId = acct.Id,
    StageName = stage,
    CloseDate = renewal.addDays(-30),
    Amount = 320000,
    ForecastCategoryName = 'Commit',
    Renewal_Date__c = renewal,
    Renewal_Tier__c = 'Tier 1',
    Agent_Forecast_Category__c = 'At Risk',
    Agent_Likelihood__c = 58,
    Agent_Expected_ARR__c = 270000,
    CSM__c = me
);
insert opp;

insert new List<OpportunityContactRole>{
    new OpportunityContactRole(OpportunityId = opp.Id, ContactId = david.Id, Role = 'Executive Sponsor'),
    new OpportunityContactRole(OpportunityId = opp.Id, ContactId = rachel.Id, Role = 'Economic Buyer', IsPrimary = true),
    new OpportunityContactRole(OpportunityId = opp.Id, ContactId = mark.Id, Role = 'Influencer'),
    new OpportunityContactRole(OpportunityId = opp.Id, ContactId = tom.Id, Role = 'Technical Buyer')
};

insert new Renewal_Brief__c(
    Opportunity__c = opp.Id,
    Version__c = 1,
    Generated_At__c = System.now().addHours(-2),
    Risk_Level__c = 'At Risk',
    Sources_Note__c = '23 Gong calls, ChurnZero and Salesforce',
    Summary__c = 'The agent sees this renewal at risk. The champion, David Ross, left on Oct 2. A new VP Finance, Rachel Stern, is reviewing every vendor before Q2 budgets, and active users fell 22% in the Operations team David ran. The value is strong and provable, so this is a relationship to rebuild, not a product problem.',
    Value_Annual__c = 410000,
    Value_Summary__c = '38 workflows automated, up from 21. Month-end close went from 9 days to 5. About 1,240 hours saved a year. Finance users up 30%.'
);

insert new List<Renewal_Signal__c>{
    new Renewal_Signal__c(Opportunity__c = opp.Id, Detected_On__c = today.addDays(-3), Type__c = 'Stakeholder', Severity__c = 'High',
        Headline__c = 'The champion has left Atlas.', Detail__c = 'David Ross\'s email bounces and his profile shows a new company.', Source__c = 'Clay'),
    new Renewal_Signal__c(Opportunity__c = opp.Id, Detected_On__c = today.addDays(-4), Type__c = 'Usage', Severity__c = 'Medium',
        Headline__c = 'Active users down 22% in 60 days.', Detail__c = 'Almost all of it in Operations. Finance usage is up.', Source__c = 'ChurnZero'),
    new Renewal_Signal__c(Opportunity__c = opp.Id, Detected_On__c = today.addDays(-5), Type__c = 'Competitor', Severity__c = 'Medium',
        Headline__c = 'A competitor came up twice.', Detail__c = 'On the Ops weekly sync.', Source__c = 'Gong', Source_Ref__c = '23:40',
        Quote__c = 'Ledgerly showed us something similar, and cheaper.', Quote_By__c = 'Ops team lead'),
    new Renewal_Signal__c(Opportunity__c = opp.Id, Detected_On__c = today.addDays(-6), Type__c = 'Budget', Severity__c = 'High',
        Headline__c = 'A new economic buyer.', Detail__c = 'Every vendor contract is under review.', Source__c = 'Gong', Source_Ref__c = '14:20',
        Quote__c = 'Rachel is reviewing every vendor contract before Q2 budgets.', Quote_By__c = 'Mark Ellis, Controller')
};

insert new List<Renewal_Action__c>{
    new Renewal_Action__c(Opportunity__c = opp.Id, Kind__c = 'Plan', Status__c = 'Proposed', Priority__c = 'High',
        Owner_Role__c = 'AE', Assigned_To__c = me, Due_Date__c = today.addDays(4),
        Title__c = 'Introduce yourself to Rachel Stern, the new VP Finance',
        Reason__c = 'She is the economic buyer now and is reviewing every vendor before Q2 budgets (Mark Ellis, Gong, 14:20). Lead with the $410K a year Atlas saves.',
        Prepared__c = 'Intro email drafted, with the value summary attached',
        Draft__c = 'Hi Rachel,\n\nI\'m the account executive for Atlas. Mark mentioned you\'re looking at vendor contracts ahead of Q2, and I\'d like to make that easy.\n\nIn the last year Atlas automated 38 finance and ops workflows. Month-end close went from 9 days to 5, and we estimate about $410K a year in time saved. The one-page summary is attached.\n\nCould we take 30 minutes in the next two weeks? I\'d like to hear what matters most to you for next year.\n\nBest regards'),
    new Renewal_Action__c(Opportunity__c = opp.Id, Kind__c = 'Plan', Status__c = 'Proposed', Priority__c = 'Medium',
        Owner_Role__c = 'CSM', Assigned_To__c = me, Due_Date__c = today.addDays(11),
        Title__c = 'Win back the Ops team with a 30-day adoption plan',
        Reason__c = 'The drop is almost all in Operations, David\'s former team: 31 active users fell to 19.',
        Prepared__c = 'Plan drafted: 3 sessions, a new team admin, 2 workflows to switch on',
        Draft__c = 'Week 1: name a new Ops admin with Mark Ellis.\nWeek 2: two 45-minute sessions for the 12 users who stopped.\nWeek 3: switch on the 2 workflows Ops asked about (Gong, Sep 22).\nWeek 4: check usage and share the before and after with Rachel.'),
    new Renewal_Action__c(Opportunity__c = opp.Id, Kind__c = 'Plan', Status__c = 'Proposed', Priority__c = 'Low',
        Owner_Role__c = 'AE + CSM', Assigned_To__c = me, Due_Date__c = today.addDays(18),
        Title__c = 'Make Mark Ellis the new champion',
        Reason__c = 'He joined 4 of the last 6 calls, pushed for more automation twice, and warned us about the vendor review.',
        Prepared__c = 'Talking points ready for your next call')
};

List<Renewal_Action__c> milestones = new List<Renewal_Action__c>();
Map<Integer, String> steps = new Map<Integer, String>{
    180 => 'AE + CSM kickoff', 120 => 'EBR with the economic buyer', 90 => 'Commercial call', 60 => 'Proposal sent', 30 => 'Contract signed'
};
for (Integer offset : steps.keySet()) {
    milestones.add(new Renewal_Action__c(Opportunity__c = opp.Id, Kind__c = 'Milestone', Milestone_Offset__c = offset,
        Title__c = steps.get(offset), Status__c = offset == 180 ? 'Done' : 'Proposed', Due_Date__c = renewal.addDays(-offset)));
}
insert milestones;

System.debug('Atlas Group renewal ready: /lightning/r/Opportunity/' + opp.Id + '/view');
