#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EventDrivenServerlessCdkTsStack } from '../lib/event-driven-serverless-cdk-ts-stack';

const app = new cdk.App();
new EventDrivenServerlessCdkTsStack(app, 'EventDrivenServerlessCdkTsStack', {});