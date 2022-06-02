import { RemovalPolicy } from "aws-cdk-lib";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { IChainable, LogLevel, StateMachine, StateMachineType } from "aws-cdk-lib/aws-stepfunctions";
import { Construct } from "constructs";

interface DefaultStateMachineProps {
    definition: IChainable,
    type: StateMachineType
};

export class DefaultStateMachine extends StateMachine {
    constructor(scope: Construct, id: string, props: DefaultStateMachineProps) {
        super(scope, id, {
            definition: props.definition,
            logs: {
                destination: new LogGroup(scope, `${id}-LogGroup`, {
                    retention: RetentionDays.ONE_DAY,
                    logGroupName: `${id}-LogGroup`,
                    removalPolicy: RemovalPolicy.DESTROY
                }),
                level: LogLevel.ALL
            },
            tracingEnabled: true,
            stateMachineType: props.type,
            stateMachineName: id
        });
    }
}