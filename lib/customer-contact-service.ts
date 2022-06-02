import { JsonPath, StateMachineType, TaskInput } from "aws-cdk-lib/aws-stepfunctions";
import { Construct } from "constructs";
import { CentralEventBus } from "./sharedConstructs/central-event-bus";
import { DefaultStateMachine } from "./sharedConstructs/default-state-machine";
import { WorkflowStep } from "./sharedConstructs/workflow-step";

export class CustomerContactService extends Construct {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        let workflow = 
            // First, notify agents that a bad review has been entered
            WorkflowStep.notifyBadReview(this)
                // Then send to a queue waiting for a customer service agent to claim
                .next(WorkflowStep.waitForCustomerAgentClaim(this))
                //Then store the customer service agent claim in a database
                .next(WorkflowStep.storeCustomerServiceClaim(this))
                .next(CentralEventBus.publishEvent(this, 'publishClaimEvent', {
                    eventSource: 'event-drive-cdk.customer-service',
                    eventName: 'customerServiceCaseClaimed',
                    eventDetail: TaskInput.fromObject({
                        'reviewId': JsonPath.stringAt('$.detail.reviewId'),
                        'claimedBy': JsonPath.stringAt('$.claimResponse.ClaimedBy'),
                        'emailAddress': JsonPath.stringAt('$.detail.emailAddress'),
                        'type': 'customerServiceCaseClaimed'
                    })
                }));

        let stateMachine = new DefaultStateMachine(this, 'customerContactWorkflow', {
            definition: workflow,
            type: StateMachineType.STANDARD
        });

        CentralEventBus.addRule(this, 'negativeReviewRule', {
            eventSource: ['event-driven-cdk.sentiment-analysis'],
            eventType: ['negativeReview'],
            workflow: stateMachine
        });
    }
}