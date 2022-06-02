import { EventBus } from "aws-cdk-lib/aws-events";
import { Choice, Condition, JsonPath, StateMachineType } from "aws-cdk-lib/aws-stepfunctions";
import { Construct } from "constructs";
import { CentralEventBus } from "./sharedConstructs/central-event-bus";
import { DefaultStateMachine } from "./sharedConstructs/default-state-machine";
import { WorkflowStep } from "./sharedConstructs/workflow-step";

interface NotificationServiceProps {
    centralEventBus: EventBus
};

export class NotificationService extends Construct {
    constructor(scope: Construct, id: string, props: NotificationServiceProps) {
        super(scope, id);

        let choice = new Choice(this, 'eventTypeChoice')
                            .when(Condition.stringEquals(JsonPath.stringAt('$.detail.type'), 'customerServiceCaseClaimed'),
                                WorkflowStep.sendEmail(this, 'sendCustomerServiceClaimedEmail', {
                                    to: JsonPath.stringAt('$.detail.emailAddress'),
                                    subject: 'Your case is being worked on',
                                    body: 'Your case is being worked on'
                                }).next(WorkflowStep.publishSentEmailEvent(this, 'publishCaseClaimedEvent', {
                                    eventName: 'caseClaimedEmailSent',
                                    publishTo: props.centralEventBus
                                })))
                            .when(Condition.stringEquals(JsonPath.stringAt('$.detail.type'), 'positiveReview'),
                                WorkflowStep.sendEmail(this, 'sendPositiveEmail', {
                                    to: JsonPath.stringAt('$.detail.emailAddress'),
                                    subject: 'Thank you for your review',
                                    body: 'Thank you for your positive review'
                                }).next(WorkflowStep.publishSentEmailEvent(this, 'publishPositiveEmailEvent', {
                                    eventName: 'positiveEmailSent',
                                    publishTo: props.centralEventBus
                                })))
                            .when(Condition.stringEquals(JsonPath.stringAt('$.detail.type'), 'negativeReview'),
                                WorkflowStep.sendEmail(this, 'sendNegativeEmail', {
                                    to: JsonPath.stringAt('$.detail.emailAddress'),
                                    subject: 'Sorry',
                                    body: "I'm sorry our product didn't meet your satisfaction. One of our customer service agents will be in touch shortly"
                                }).next(WorkflowStep.publishSentEmailEvent(this, 'publishNegativeEmailEvent', {
                                    eventName: 'negativeEmailSent',
                                    publishTo: props.centralEventBus
                                })));
                                
        let stateMachine = new DefaultStateMachine(this, 'notificationServiceStateMachine', {
            definition: choice,
            type: StateMachineType.STANDARD
        });

        CentralEventBus.addRule(this, 'notificationRule', {
            eventSource: [
                'event-driven-cdk.sentiment-analysis',
                'event-driven-cdk.customer-service'
            ],
            eventType: [
                'positiveReview',
                'negativeReview',
                'customerServiceCaseClaimed'
            ],
            workflow: stateMachine
        })
    }
}