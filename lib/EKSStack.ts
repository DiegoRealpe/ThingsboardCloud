import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as eks from "aws-cdk-lib/aws-eks";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamo from "aws-cdk-lib/aws-dynamodb";
import { KubectlV28Layer } from "@aws-cdk/lambda-layer-kubectl-v28";

// blueprints.HelmAddOn.validateHelmVersions = true; // optional if you would like to check for newer versions
interface ClusterStackProps extends cdk.StackProps {
  // stack objects that you'll consume is added  with interfaces
  playgroundTable?: dynamo.ITable; // such as dynamodb table and S3 bucket here
  playgroundBucket?: s3.IBucket;
  importedAssetBucket: s3.IBucket;
  pubSubnetA: ec2.ISubnet;
  pubSubnetB: ec2.ISubnet;
  privSubnetA: ec2.ISubnet;
  privSubnetB: ec2.ISubnet;
}

export class EKSStack extends cdk.Stack {
  private props: ClusterStackProps;
  private cluster: eks.Cluster;
  private importedVPC: ec2.IVpc;
  private mainRole: iam.Role;

  constructor(scope: Construct, id: string, props: ClusterStackProps) {
    super(scope, id, props);
    this.props = props;
    // console.log(props);

    this.cluster = new eks.Cluster(this, "hello-eks", {
      mastersRole: this.mainRole,
      role: this.mainRole,
      vpc: this.importedVPC,
      kubectlEnvironment: {
        S3_BUCKET_NAME: this.props.importedAssetBucket.bucketName,
      },
      vpcSubnets: [
        {
          subnets: [
            props.pubSubnetA,
            props.pubSubnetB,
            props.privSubnetA,
            props.privSubnetB,
          ],
        },
      ], //subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      version: eks.KubernetesVersion.V1_28,
      defaultCapacity: 0,
      clusterLogging: [
        eks.ClusterLoggingTypes.API,
        eks.ClusterLoggingTypes.AUTHENTICATOR,
        eks.ClusterLoggingTypes.AUDIT,
      ],
      kubectlLayer: new KubectlV28Layer(this, "kubectl"),
    });
    this.cluster.addNodegroupCapacity("cdk-node-group", {
      nodegroupName: "cdk-node-group",
      instanceTypes: [
        new ec2.InstanceType("m5.large"),
        new ec2.InstanceType("m5.xlarge"),
      ],
      minSize: this.cluster.node.tryGetContext("node_group_min_size"),
      desiredSize: 1,
      maxSize: this.cluster.node.tryGetContext("node_group_max_size"),
      diskSize: 50,
      amiType: eks.NodegroupAmiType.AL2_X86_64,
      capacityType: eks.CapacityType.SPOT,
    });
  }
}
