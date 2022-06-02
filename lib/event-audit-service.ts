import { attachCustomSynthesis, RemovalPolicy } from "aws-cdk-lib";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { JsonPath, StateMachineType } from "aws-cdk-lib/aws-stepfunctions";
import { DynamoAttributeValue, DynamoPutItem } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";
import { CentralEventBus } from "./sharedConstructs/central-event-bus";
import { DefaultStateMachine } from "./sharedConstructs/default-state-machine";

export class EventAuditService extends Construct {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        let auditTable = new Table(this, 'eventAuditStore', {
            tableName: 'EventAuditStore',
            partitionKey: {
                name: 'PK',
                type: AttributeType.STRING
            },
            sortKey: {
                name: 'SK',
                type: AttributeType.STRING
            },
            billingMode: BillingMode.PAY_PER_REQUEST,
            removalPolicy: RemovalPolicy.DESTROY
        });

        let sfnWorkflow = new DynamoPutItem(this, 'storeEventData', {
            table: auditTable,
            item: {
                'PK': DynamoAttributeValue.fromString(JsonPath.stringAt('$.detail.reviewId')),
                'SK': DynamoAttributeValue.fromString(JsonPath.format('{}#{}', JsonPath.stringAt('$.time'), JsonPath.stringAt('$.detail.type'))),
                'Data': DynamoAttributeValue.mapFromJsonPath('$.detail')
            }
        });

        let stateMachine = new DefaultStateMachine(this, 'eventAuditStateMachine', {
            definition: sfnWorkflow,
            type: StateMachineType.EXPRESS
        });

        CentralEventBus.addRule(this, 'eventAuditRule', {
            eventSource: [
                'event-driven-cdk.api',
                'event-driven-cdk.sentiment-analysis',
                'event-driven-cdk.notifications',
                'event-driven-cdk.customer-service'
            ],
            workflow: stateMachine
        });
    }
}