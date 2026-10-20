@IsTest
private class RenewalBriefControllerTest {

    // User mode enforces field permissions even for admins, so every test runs as a
    // standard user who has the Renewal Agent User permission set.
    @TestSetup
    static void setup() {
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
        User u = new User(
            LastName = 'Renewal AE', Alias = 'rnwlae', Email = 'renewal.ae@example.invalid',
            Username = 'renewal.ae.' + System.now().getTime() + '@example.invalid',
            ProfileId = p.Id, TimeZoneSidKey = 'America/New_York', LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8', LanguageLocaleKey = 'en_US'
        );
        insert u;
        insert new PermissionSetAssignment(
            AssigneeId = u.Id,
            PermissionSetId = [SELECT Id FROM PermissionSet WHERE Name = 'Renewal_Agent_User' LIMIT 1].Id
        );
        System.runAs(u) {
            createData();
        }
    }

    static User ae() {
        return [SELECT Id FROM User WHERE Alias = 'rnwlae' LIMIT 1];
    }

    static void createData() {
        Account acct = new Account(Name = 'Atlas Group');
        insert acct;
        Opportunity opp = new Opportunity(
            Name = 'Atlas Group · Renewal 2027',
            AccountId = acct.Id,
            StageName = 'Prospecting',
            CloseDate = Date.today().addDays(150),
            Amount = 320000,
            Renewal_Date__c = Date.today().addDays(177),
            Renewal_Tier__c = 'Tier 1',
            Agent_Forecast_Category__c = 'At Risk',
            Agent_Likelihood__c = 58,
            Agent_Expected_ARR__c = 270000,
            CSM__c = UserInfo.getUserId()
        );
        insert opp;
        Contact c = new Contact(LastName = 'Stern', FirstName = 'Rachel', AccountId = acct.Id, Stakeholder_Status__c = 'Not met');
        insert c;
        insert new OpportunityContactRole(OpportunityId = opp.Id, ContactId = c.Id, Role = 'Economic Buyer');
        insert new Renewal_Brief__c(Opportunity__c = opp.Id, Summary__c = 'At risk: the champion left.', Risk_Level__c = 'At Risk', Version__c = 1, Generated_At__c = System.now());
        insert new Renewal_Signal__c(Opportunity__c = opp.Id, Headline__c = 'Champion left', Type__c = 'Stakeholder', Severity__c = 'High', Detected_On__c = Date.today(), Source__c = 'Clay');
        insert new List<Renewal_Action__c>{
            new Renewal_Action__c(Opportunity__c = opp.Id, Title__c = 'Low priority step', Kind__c = 'Plan', Priority__c = 'Low', Status__c = 'Proposed', Due_Date__c = Date.today().addDays(3)),
            new Renewal_Action__c(Opportunity__c = opp.Id, Title__c = 'Introduce yourself to Rachel', Kind__c = 'Plan', Priority__c = 'High', Status__c = 'Proposed', Due_Date__c = Date.today().addDays(4), Draft__c = 'Hi Rachel'),
            new Renewal_Action__c(Opportunity__c = opp.Id, Title__c = 'EBR', Kind__c = 'Milestone', Milestone_Offset__c = 120, Status__c = 'Proposed')
        };
    }

    static Opportunity opp() {
        return [SELECT Id FROM Opportunity LIMIT 1];
    }

    @IsTest
    static void returnsTheWholeBriefWithThePlanInPriorityOrder() {
        System.runAs(ae()) {
            RenewalBriefController.Brief b = RenewalBriefController.getBrief(opp().Id);
            Assert.areEqual('Atlas Group', b.opportunity.Account.Name);
            Assert.areEqual('At Risk', b.brief.Risk_Level__c);
            Assert.areEqual(1, b.signals.size());
            Assert.areEqual(2, b.plan.size());
            Assert.areEqual('Introduce yourself to Rachel', b.plan[0].Title__c, 'High priority comes first');
            Assert.areEqual(1, b.milestones.size());
            Assert.areEqual(1, b.committee.size());
        }
    }

    @IsTest
    static void returnsAnEmptyBriefForAnUnknownRecord() {
        System.runAs(ae()) {
            Id missing = Opportunity.SObjectType.getDescribe().getKeyPrefix() + '000000000000';
            RenewalBriefController.Brief b = RenewalBriefController.getBrief(missing);
            Assert.isNull(b.opportunity);
        }
    }

    @IsTest
    static void approvingSavesTheEditedDraftAndRecordsWhoApproved() {
        System.runAs(ae()) {
            Renewal_Action__c a = [SELECT Id FROM Renewal_Action__c WHERE Priority__c = 'High' LIMIT 1];
            Test.startTest();
            RenewalBriefController.approveAction(a.Id, 'Hi Rachel, edited');
            Test.stopTest();
            a = [SELECT Status__c, Draft__c, Approved_By__c, Approved_At__c FROM Renewal_Action__c WHERE Id = :a.Id];
            Assert.areEqual('Approved', a.Status__c);
            Assert.areEqual('Hi Rachel, edited', a.Draft__c);
            Assert.areEqual(UserInfo.getUserId(), a.Approved_By__c);
            Assert.isNotNull(a.Approved_At__c);
        }
    }

    @IsTest
    static void approvingTwiceIsRefused() {
        System.runAs(ae()) {
            Renewal_Action__c a = [SELECT Id FROM Renewal_Action__c WHERE Priority__c = 'High' LIMIT 1];
            RenewalBriefController.approveAction(a.Id, null);
            try {
                RenewalBriefController.approveAction(a.Id, null);
                Assert.fail('A second approval should be refused');
            } catch (AuraHandledException e) {
                Assert.isTrue(e.getMessage().contains('already approved'));
            }
        }
    }

    @IsTest
    static void dismissingNeedsAReason() {
        System.runAs(ae()) {
            Renewal_Action__c a = [SELECT Id FROM Renewal_Action__c WHERE Priority__c = 'Low' LIMIT 1];
            try {
                RenewalBriefController.dismissAction(a.Id, ' ');
                Assert.fail('A blank reason should be refused');
            } catch (AuraHandledException e) {
                Assert.isTrue(e.getMessage().contains('reason'));
            }
            RenewalBriefController.dismissAction(a.Id, 'Already done by phone');
            a = [SELECT Status__c, Dismiss_Reason__c FROM Renewal_Action__c WHERE Id = :a.Id];
            Assert.areEqual('Dismissed', a.Status__c);
            Assert.areEqual(1, RenewalBriefController.getBrief(opp().Id).plan.size(), 'Dismissed steps leave the plan');
        }
    }

    @IsTest
    static void theAeCanUpdateTheirOwnForecastCategory() {
        System.runAs(ae()) {
            Id oppId = opp().Id;
            RenewalBriefController.updateForecastCategory(oppId, 'Best Case');
            Assert.areEqual('Best Case', [SELECT ForecastCategoryName FROM Opportunity WHERE Id = :oppId].ForecastCategoryName);
            try {
                RenewalBriefController.updateForecastCategory(oppId, 'Closed');
                Assert.fail('Closed is not a call the AE makes here');
            } catch (AuraHandledException e) {
                Assert.isTrue(e.getMessage().contains('Pick'));
            }
        }
    }
}
