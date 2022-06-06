import { EventBus, EventBusProps } from "aws-cdk-lib/aws-events";
import { CfnDiscoverer } from "aws-cdk-lib/aws-eventschemas";
import { Construct } from "constructs";
import { CentralEventBus } from "./central-event-bus";

export class SharedResources extends Construct {

    public readonly centralEventBus: EventBus;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        this.centralEventBus = new EventBus(this, 'centralEventBridge', {
            eventBusName: 'CentralEventBus'
        });

        new CfnDiscoverer(this, 'eventBridgeDiscovery', {
            sourceArn: this.centralEventBus.eventBusArn,
            crossAccount: false,
            description: 'Discovery for central event bus'
        });

        CentralEventBus.addCentralEventBus(this.centralEventBus);
    }
}