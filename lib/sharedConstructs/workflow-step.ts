import { RemovalPolicy } from "aws-cdk-lib";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { EventBus } from "aws-cdk-lib/aws-events";
import { JsonPattern } from "aws-cdk-lib/aws-logs";
import { Topic } from "aws-cdk-lib/aws-sns";
import { EmailSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { IntegrationPattern, JsonPath, Pass, TaskInput } from "aws-cdk-lib/aws-stepfunctions";
import { CallAwsService, DynamoAttributeValue, DynamoPutItem, DynamoReturnValues, DynamoUpdateItem, EventBridgePutEvents, SnsPublish, SqsSendMessage } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";


interface PublishReviewEventProps {
    eventName: string, 
    publishTo: EventBus
};

interface SendEmailProps {
    to: string,
    subject: string,
    body: string
};

interface PublishSentEmailEventProps {
    eventName: string,
    publishTo: EventBus
};


export class WorkflowStep {

    
    public static generateCaseID = (scope: Construct, apiTable: Table) => {

        return new DynamoUpdateItem(scope, 'generateCaseId', {
            table: apiTable,
            returnValues: DynamoReturnValues.UPDATED_NEW,
            updateExpression: 'set IDvalue = IDvalue + :val',
            expressionAttributeValues: {
                ":val": DynamoAttributeValue.fromNumber(1)
            },
            key: {
                'PK': DynamoAttributeValue.fromString('reviewId')
            },
            resultSelector: {
                'reviewId': DynamoAttributeValue.fromString(JsonPath.stringAt('$.Attributes.IDvalue.N'))
            },
            resultPath: '$.reviewIdentifier'
        });

    }


    public static storeApiData = (scope: Construct, apiTable: Table) => {

        return new DynamoPutItem(scope, 'StoreApiInput', {
            table: apiTable,
            resultPath: '$.output',
            item: {
                'PK': DynamoAttributeValue.fromString(JsonPath.stringAt('$.body.reviewIdentifier')),
                'Data': DynamoAttributeValue.fromMap({
                    'reviewIdentifier': DynamoAttributeValue.fromString(JsonPath.stringAt('$.body.reviewIdentifier')),
                    'reviewId': DynamoAttributeValue.fromString(JsonPath.stringAt('$.reviewIdentifier.reviewId.attributeValue.S')),
                    'emailAddress': DynamoAttributeValue.fromString(JsonPath.stringAt('$.body.emailAddress')),
                    'reviewContents': DynamoAttributeValue.fromString(JsonPath.stringAt('$.body.reviewContents'))
                })
            }
        });

    }


    public static publishNewApiRequestEvent = (scope: Construct, publishTo: EventBus) => {

        return new EventBridgePutEvents(scope, 'publishEvent', {
            entries: [{
                detail: TaskInput.fromObject({
                    'reviewId': JsonPath.stringAt('$.reviewIdentifier.reviewId.attributeValue.S'),
                    'reviewIdentifier': JsonPath.stringAt('$.body.reviewIdentifier'),
                    'emailAddress': JsonPath.stringAt('$.body.emailAddress'),
                    'reviewContents': JsonPath.stringAt('$.body.reviewContents'),
                    'type': 'newReview'
                }),
                detailType: 'newReview',
                source: 'event-driven-cdk.api',
                eventBus: publishTo
            }],
            resultPath: '$.eventOutput'
        });

    }


    public static formatStateForHttpResponse = (scope: Construct) => {

        return new Pass(scope, 'formatHttpResponse', {
            parameters: {
                'reviewId': JsonPath.stringAt('$.reviewIdentifier.reviewId.attributeValue.S'),
                'reviewIdentifier': JsonPath.stringAt('$.body.reviewIdentifier'),
                'emailAddress': JsonPath.stringAt('$.body.emailAddress'),
                'reviewContents': JsonPath.stringAt('$.body.reviewContents'),
                'type': 'newReview'
            }
        });
        
    }


    public static analyzeSentiment = (scope: Construct) => {

        return new CallAwsService(scope, 'callSentimentAnalysis', {
            service: 'comprehend',
            action: 'detectSentiment',
            parameters: {
                'LanguageCode': 'en',
                'Text': JsonPath.stringAt('$.reviewContents')
            },
            iamResources: ['*'],
            resultPath: '$.SentimentResult'
        });

    }


    public static addTranslationToState = (scope: Construct) => {

        return new Pass(scope, 'addTranslatedTextToState', {
            parameters: {
                'dominantLanguage': JsonPath.stringAt('$.dominantLanguage'),
                "reviewIdentifier": JsonPath.stringAt("$.reviewIdentifier"),
                "reviewId": JsonPath.stringAt("$.reviewId"),
                "emailAddress": JsonPath.stringAt("$.emailAddress"),
                "reviewContents": JsonPath.stringAt("$.Translation.TranslatedText"),
                "originalReviewContents": JsonPath.stringAt("$.reviewContents")
            }
        });

    }


    public static translateNonEnglishLanguage = (scope: Construct) => {

        return new CallAwsService(scope, 'translateNonEn', {
            service: 'translate',
            action: 'translateText',
            parameters: {
                'SourceLanguageCode': JsonPath.stringAt('$.dominantLanguage'),
                'TargetLanguageCode': 'en',
                'Text': JsonPath.stringAt('$.reviewContents')
            },
            iamResources: ['*'],
            resultPath: '$.Translation'
        });

    }


    public static formatLanguageResults = (scope: Construct) => {

        return new Pass(scope, 'formatResult', {
            parameters: {
                'dominantLanguage': JsonPath.stringAt('$.DominantLanguage.Languages[0].LanguageCode'),
                'reviewIdentifier': JsonPath.stringAt('$.detail.reviewIdentifier'),
                'reviewId': JsonPath.stringAt('$.detail.reviewId'),
                "emailAddress": JsonPath.stringAt('$.detail.emailAddress'),
                'reviewContents': JsonPath.stringAt('$.detail.reviewContents'),
                'originalReviewContents': JsonPath.stringAt('$.detail.reviewContents')
            }
        });

    }


    public static detectLanguage = (scope: Construct) => {

        return new CallAwsService(scope, 'detectReviewLanguage', {
            service: 'comprehend',
            action: 'detectDominantLanguage',
            parameters: {
                'Text': JsonPath.stringAt('$.detail.reviewContents')
            },
            iamResources: ['*'],
            resultPath: '$.DominantLanguage'
        });

    }


    public static publishReviewEvent = (scope: Construct, stepName: string, props: PublishReviewEventProps) => {
        
        return new EventBridgePutEvents(scope, stepName, {
            entries: [{
                detailType: props.eventName,
                source: 'event-driven-cdk.sentiment-analysis',
                eventBus: props.publishTo,
                detail: TaskInput.fromObject({
                    'dominantLanguage': JsonPath.stringAt('$.dominantLanguage'),
                    'reviewIdentifier': JsonPath.stringAt('$.reviewIdentifier'),
                    'reviewId': JsonPath.stringAt('$.reviewId'),
                    'emailAddress': JsonPath.stringAt('$.emailAddress'),
                    'reviewContents': JsonPath.stringAt('$.reviewContents'),
                    'originalReviewContents': JsonPath.stringAt('$.originalReviewContents'),
                    'type': props.eventName
                })
            }]
        });
        
    }


    public static sendEmail = (scope: Construct, id: string, props: SendEmailProps) => {

        return new CallAwsService(scope, id, {
            service: 'ses',
            action: 'sendEmail',
            parameters: {
                'Destination': {
                    'ToAddresses': JsonPath.array(props.to)
                },
                'Source': props.to,
                'Message': {
                    'Body': {
                        'Html': {
                            'Charset': 'UTF-8',
                            'Data': `<html><head></head><body><p>${props.body}</p></body></html>`
                        },
                        'Text': {
                            'Charset': 'UTF-8',
                            'Data': props.body
                        }
                    },
                    'Subject': {
                        'Charset': 'UTF-8',
                        'Data': props.subject
                    }
                }
            },
            iamResources: ['*'],
            resultPath: '$.SendEmailResult'
        });

    }


    public static publishSentEmailEvent = (scope: Construct, stepName: string, props: PublishSentEmailEventProps) => {

        return new EventBridgePutEvents(scope, stepName, {
            entries: [{
                detail: TaskInput.fromObject({
                    'reviewId': JsonPath.stringAt('$.detail.reviewId'),
                    'emailAddress': JsonPath.stringAt('$.detail.emailAddress'),
                    'type': props.eventName
                }),
                detailType: props.eventName,
                source: 'event-driven-cdk.notifications',
                eventBus: props.publishTo
            }]
        });
        
    }


    public static notifyBadReview= (scope: Construct) => {

        let negativeReviewNotification = new Topic(scope, 'reviewNotificationTopic', {
            displayName: 'Negative Review Notification',
            topicName: 'NegativeReviewNotification'
        });
        negativeReviewNotification.addSubscription(new EmailSubscription('example@mail.com', {}));

        return new SnsPublish(scope, 'notifyNewBadreview', {
            topic: negativeReviewNotification,
            message: TaskInput.fromText('There has been a new negative review'),
            resultPath: '$.snsResult'
        });

    }


    public static waitForCustomerAgentClaim = (scope: Construct) => {

        let awaitingClaimQueue = new Queue(scope, 'awaitingClaimQueue', {
            queueName: 'AwaitingClaim'
        });

        return new SqsSendMessage(scope, 'queueForClaim', {
            queue: awaitingClaimQueue,
            messageBody: TaskInput.fromObject({
                'Token': JsonPath.taskToken,
                'Payload': {
                    'emailAddress': JsonPath.stringAt('$.detail.emailAddress'),
                    'reviewContent': JsonPath.stringAt('$.details.reviewContents'),
                    'originalReviewContents': JsonPath.stringAt('$.detail.originalReviewContents'),
                    'reviewId': JsonPath.stringAt('$.detail.reviewId')
                }
            }),
            resultPath: '$.claimResponse',
            integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN
        });

    }


    public static storeCustomerServiceClaim = (scope: Construct) => {

        let cunstomerContactTable = new Table(scope, 'customerContactClaim', {
            tableName: 'CustomerContactTable',
            partitionKey: {
                name: 'PK',
                type: AttributeType.STRING
            },
            billingMode: BillingMode.PAY_PER_REQUEST,
            removalPolicy: RemovalPolicy.DESTROY
        });

        return new DynamoPutItem(scope, 'storeCustomerServiceClaim', {
            table: cunstomerContactTable,
            resultPath: '$.output',
            item: {
                'PK': DynamoAttributeValue.fromString(JsonPath.stringAt("$.detail.reviewId")),
                'Data': DynamoAttributeValue.fromMap({
                    'reviewIdentifier': DynamoAttributeValue.fromString(JsonPath.stringAt("$.detail.reviewIdentifier")),
                    'claimedBy': DynamoAttributeValue.fromString(JsonPath.stringAt("$.claimResponse.ClaimedBy")),
                    'reviewId': DynamoAttributeValue.fromString(JsonPath.stringAt("$.detail.reviewId")),
                    'emailAddress': DynamoAttributeValue.fromString(JsonPath.stringAt("$.detail.emailAddress")),
                    'reviewContents': DynamoAttributeValue.fromString(JsonPath.stringAt("$.detail.reviewContents"))
                })
            }
        });

    }
}