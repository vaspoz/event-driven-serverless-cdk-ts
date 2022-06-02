import { EventBus, Rule } from "aws-cdk-lib/aws-events";
import { SfnStateMachine } from "aws-cdk-lib/aws-events-targets";
import { StateMachine, TaskInput } from "aws-cdk-lib/aws-stepfunctions";
import { EventBridgePutEvents } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";

interface AddRulesProps {
    eventSource: string[],
    eventType?: string[],
    workflow: StateMachine
};

interface PublishEventProps {
    eventSource: string,
    eventName: string,
    eventDetail: TaskInput
};


export class CentralEventBus {

    private static _bus: EventBus;


    public static addCentralEventBus = (bus: EventBus) => {
        
        CentralEventBus._bus = bus;

    }


    public static addRule = (scope: Construct, ruleName: string, props: AddRulesProps) => {
        
        return new Rule(scope, ruleName, {
            eventBus: CentralEventBus._bus,
            ruleName,
            eventPattern: {
                detailType: props.eventType,
                source: props.eventSource
            },
            targets: [new SfnStateMachine(props.workflow)]
        });

    }


    public static publishEvent = (scope: Construct, stepName: string, props: PublishEventProps) => {

        return new EventBridgePutEvents(scope, stepName, {
            entries: [{
                detail: props.eventDetail,
                detailType: props.eventName,
                source: props.eventSource,
                eventBus: CentralEventBus._bus
            }],
            resultPath: '$.eventPublishResult'
        });
    }
}