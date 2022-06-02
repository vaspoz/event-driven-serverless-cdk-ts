import { SpotRequestType } from "aws-cdk-lib/aws-ec2";
import { EventBus } from "aws-cdk-lib/aws-events";
import { Choice, Condition, JsonPath, Pass, State, StateMachineType } from "aws-cdk-lib/aws-stepfunctions";
import { Construct } from "constructs";
import { CentralEventBus } from "./sharedConstructs/central-event-bus";
import { DefaultStateMachine } from "./sharedConstructs/default-state-machine";
import { WorkflowStep } from "./sharedConstructs/workflow-step";

interface ReviewAnalysisServiceProps {
    centralEventBus: EventBus
};

export class ReviewAnalysisService extends Construct {
    constructor(scope: Construct, id: string, props: ReviewAnalysisServiceProps) {
        super(scope, id);

        let analyzeSentiment = WorkflowStep.analyzeSentiment(scope)
                                    .next(new Choice(this, 'sentimentChoise')
                                        .when(Condition.numberGreaterThan('$.SentimentResult.SentimentScore.Positive', 0.95),
                                            WorkflowStep.publishReviewEvent(this, 'publishPositiveEvent', {
                                                eventName: 'positiveReview',
                                                publishTo: props.centralEventBus
                                            }))
                                        .when(Condition.numberGreaterThan('$.SentimentResult.SentimentScore.Negative', 0.95),
                                            WorkflowStep.publishReviewEvent(this, 'publishNegativeEvent', {
                                                eventName: 'negativeReview',
                                                publishTo: props.centralEventBus
                                            }))
                                        .otherwise(new Pass(this, 'unknownSentiment'))
                                    );

        let analyseSentiment = WorkflowStep.detectLanguage(this)
                                    .next(WorkflowStep.formatLanguageResults(this))
                                    .next(new Choice(this, 'translateNonEnLanguage')
                                        .when(Condition.not(Condition.stringEquals(JsonPath.stringAt('$.dominantLanguage'), 'en')),
                                            WorkflowStep.translateNonEnglishLanguage(this)
                                                .next(WorkflowStep.addTranslationToState(this))
                                                .next(analyzeSentiment))
                                        .otherwise(analyzeSentiment));

        let stateMachine = new DefaultStateMachine(this, 'sentimentAnalysisStateMachine', {
            definition: analyseSentiment,
            type: StateMachineType.STANDARD
        });

        CentralEventBus.addRule(this, 'triggerSentimentAnalysisRule', {
            eventSource: ['event-driven-cdk.api'],
            eventType: ['newReview'],
            workflow: stateMachine
        });
        
    }
}