#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { EKSThingsboardStack } from "../lib/EKSThingsboardStack";
import { IndelibleStack } from "../lib/IndelibleStack";

const app = new cdk.App();
const version = "auto";

const props = {
  env: {
    account: process.env.AWS_ACCOUNT_ID,
    region: process.env.AWS_REGION,
  },
};

const indelibleStack = new IndelibleStack(app, "", props);
new EKSThingsboardStack(app, "CdkEksThingsboardStack", {
  // indelibleStack.playgroundTable?: dynamo.ITable,                            // such as dynamodb table and S3 bucket here
  // indelibleStack.playgroundBucket?: s3.IBucket,
  importedSubnets: [indelibleStack.publicSubnet, indelibleStack.privateSubnet],
});

// const addOns: Array<blueprints.ClusterAddOn> = [
//   new blueprints.addons.ArgoCDAddOn(),
//   new blueprints.addons.MetricsServerAddOn(),
//   new blueprints.addons.ClusterAutoScalerAddOn(),
//   new blueprints.addons.AwsLoadBalancerControllerAddOn(),
//   new blueprints.addons.VpcCniAddOn(), // support network policies ootb
//   new blueprints.addons.CoreDnsAddOn(),
//   new blueprints.addons.KubeProxyAddOn()
// ];

// const stack = blueprints.EksBlueprint.builder()
//   .account(account)
//   .region(region)
//   .version(version)
//   .addOns(...addOns)
//   .useDefaultSecretEncryption(true) // set to false to turn secret encryption off (non-production/demo cases)
//   .build(app, 'eks-blueprint');
