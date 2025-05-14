#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
// import { EKSStack } from '../lib/EKSStack';
// import { IndelibleStack } from '../lib/IndelibleStack';
import { DatabaseStack } from '../lib/DatabaseStack';
import { WideOpenDatabaseStack } from '../lib/WideOpenDatabaseStack';

const app = new cdk.App();
const version = 'auto';

const props = {
  env: {
    account: process.env.AWS_ACCOUNT_ID,
    region: process.env.AWS_REGION,
  },
};

// new DatabaseStack(app, 'ThingsboardDatabaseStack');
new WideOpenDatabaseStack(app, 'WOThingsboardDatabaseStack');

// const indelibleStack = new IndelibleStack(app, 'indelibleStack', props);
// const eksStack = new EKSStack(app, 'EKSStack', {
//   ...props,
//   // importedAssetBucket: indelibleStack.assetBucket,
//   eksSecurityGroupID: indelibleStack.eksSecurityGroupID,
//   eksVPCID: indelibleStack.eksVPCID,
//   pubSubnetA_ID: indelibleStack.pubSubnetA_ID,
//   pubSubnetB_ID: indelibleStack.pubSubnetB_ID,
//   pubSubnetC_ID: indelibleStack.pubSubnetC_ID,
//   pubSubnetD_ID: indelibleStack.pubSubnetD_ID,
// });

