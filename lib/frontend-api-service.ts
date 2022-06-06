import { CfnOutput, Duration, RemovalPolicy } from "aws-cdk-lib";
import { CfnMethod, Method, MethodLoggingLevel, StepFunctionsRestApi } from "aws-cdk-lib/aws-apigateway";
import { LoggingLevel } from "aws-cdk-lib/aws-chatbot";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { EventBus } from "aws-cdk-lib/aws-events";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { HttpMethod } from "aws-cdk-lib/aws-lambda";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { CfnIdentity } from "aws-cdk-lib/aws-pinpointemail";
import { Pass, StateMachineType } from "aws-cdk-lib/aws-stepfunctions";
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import { CentralEventBus } from "./sharedConstructs/central-event-bus";
import { DefaultStateMachine } from "./sharedConstructs/default-state-machine";
import { WorkflowStep } from "./sharedConstructs/workflow-step";

interface FrontendApiServiceProps {
    centralEventBridge: EventBus
}

export class FrontendApiService extends Construct {
    constructor(scope: Construct, id: string, props: FrontendApiServiceProps) {
        super(scope, id);

        // Define the table to support the storage first API pattern
        let apiTable = new Table(scope, 'storageFirstInput', {
            tableName: 'EventDrivenCDKApiStore',
            partitionKey: {
                name: 'PK',
                type: AttributeType.STRING
            },
            billingMode: BillingMode.PAY_PER_REQUEST,
            removalPolicy: RemovalPolicy.DESTROY
        });
        
        // Need to insers that row to have an initial value for reviewId. Without that, the generateCaseId will fail
        new AwsCustomResource(this, 'myCustomResource', {
            onCreate: {
                service: 'DynamoDB',
                action: 'putItem',
                physicalResourceId: PhysicalResourceId.of(apiTable.tableName),
                parameters: {
                    "TableName": apiTable.tableName,
                    'Item': {
                        'PK': {
                            'S': 'reviewId'
                        },
                        'IDvalue':{
                            'N': '1'
                        }
                    }
                }
            },
            logRetention: RetentionDays.ONE_DAY,
            policy: AwsCustomResourcePolicy.fromStatements([
                new PolicyStatement({
                    sid: 'DynamoWriteAccess',
                    effect: Effect.ALLOW,
                    actions: ['dynamodb:PutItem'],
                    resources: [apiTable.tableArn]
                })
            ]),
            timeout: Duration.minutes(1)
          });

        // Define the business workflow to integrate with the HTTP request, generate the case id, store and publish
        let stateMachine = new DefaultStateMachine(this, 'apiStateMachine', {
            definition: WorkflowStep.generateCaseID(this, apiTable)
                            .next(WorkflowStep.storeApiData(this, apiTable))
                            .next(WorkflowStep.publishNewApiRequestEvent(this, props.centralEventBridge))
                            .next(WorkflowStep.formatStateForHttpResponse(this)),
            type: StateMachineType.EXPRESS
        });

        stateMachine.addToRolePolicy(new PolicyStatement({
            actions: ['dynamodb:PutItem'],
            resources: [apiTable.tableArn]
        }));

        stateMachine.addToRolePolicy(new PolicyStatement({
            actions: ['events:PutEvents'],
            resources: [props.centralEventBridge.eventBusArn]
        }));


        let api = new StepFunctionsRestApi(this, 'stepFunctionsRestApi', {
            stateMachine: stateMachine,
            deploy: true,
            cloudWatchRole: true,
            deployOptions: {
                loggingLevel: MethodLoggingLevel.INFO,
                dataTraceEnabled: true
            }
        });

        new CfnOutput(this, 'apiEndpoint', {
            exportName: 'APIEndpoint',
            description: 'The endpoint for the created API',
            value: api.url
        });
        
    }
}