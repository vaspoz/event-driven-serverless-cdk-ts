import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EventAuditService } from './event-audit-service';
import { FrontendApiService } from './frontend-api-service';
import { NotificationService } from './notification-service';
import { ReviewAnalysisService } from './review-analysis-service';
import { SharedResources } from './shared-resources';

export class EventDrivenServerlessCdkTsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    let sharedStack = new SharedResources(this, 'sharedResources');

    new FrontendApiService(this, 'apiStack', {
      centralEventBridge: sharedStack.centralEventBus
    });

    new ReviewAnalysisService(this, 'sentimentAnalysis', {
      centralEventBus: sharedStack.centralEventBus
    });

    new EventAuditService(this, 'eventAuditService');

    new NotificationService(this, 'notificationService', {
      centralEventBus: sharedStack.centralEventBus
    });

  }
}
