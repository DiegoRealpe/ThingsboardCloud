import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as eks from "aws-cdk-lib/aws-eks";
import * as iam from "aws-cdk-lib/aws-iam";
import { getSubnetCidr } from "./utils";

export class IndelibleStack extends cdk.Stack {
  public publicSubnet: ec2.Subnet;
  public privateSubnet: ec2.Subnet;
  public cluster: eks.Cluster;
  public importedVPC: ec2.IVpc;
  public mainRole: iam.Role;
  public assetBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    this.mainRole = new iam.Role(this, "eksMainRole", {
      assumedBy: new iam.CompositePrincipal(
        new iam.ArnPrincipal(
          "arn:aws:iam::844062109895:role/cdk-hnb659fds-deploy-role-844062109895-us-east-2",
        ),
        new iam.ServicePrincipal("eks.amazonaws.com"),
      ),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEKSClusterPolicy"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEKSServicePolicy"),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonEC2ContainerRegistryReadOnly",
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2FullAccess"), // Required for networking
        iam.ManagedPolicy.fromAwsManagedPolicyName("IAMFullAccess"), // Required for passing IAM roles
        iam.ManagedPolicy.fromAwsManagedPolicyName("AutoScalingFullAccess"), // Required for node autoscaling
      ],
    });

    this.assetBucket = new s3.Bucket(this, "assetBucket", {
      bucketName: "assetbucket-eksthingsboard",
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: true,
    });
    this.assetBucket.grantReadWrite(this.mainRole);

    this.importedVPC = ec2.Vpc.fromLookup(this, "SimpleVPC", {
      // vpcId: 'vpc-0f670664' // Default
      vpcId: "vpc-0e9887775f8443b4f", // SimpleVpc
    });

    const cidrSimpleVPC: string = "10.0.0.0/16";
    // Get first existing public subnet
    const importedPublicRouteTable =
      this.importedVPC.publicSubnets[0].routeTable;
    const privateCidrBlock1 = getSubnetCidr(cidrSimpleVPC, 3);
    const privateCidrBlock2 = getSubnetCidr(cidrSimpleVPC, 4);
    // Create a Public Subnet
    this.publicSubnet = new ec2.Subnet(this, "EKSPublicSubnet", {
      vpcId: this.importedVPC.vpcId,
      availabilityZone: this.importedVPC.availabilityZones[1], //Other subnet is already in AZ0
      cidrBlock: privateCidrBlock1,
      mapPublicIpOnLaunch: true, // Ensures instances get public IPs
    });
    // Create a Private Subnet
    this.privateSubnet = new ec2.Subnet(this, "EKSPrivateSubnet", {
      vpcId: this.importedVPC.vpcId,
      availabilityZone: this.importedVPC.availabilityZones[1],
      cidrBlock: privateCidrBlock2,
      mapPublicIpOnLaunch: false,
    });
    new ec2.CfnSubnetRouteTableAssociation(
      this,
      "EKSPublicRouteTableAssociation",
      {
        subnetId: this.publicSubnet.subnetId,
        routeTableId: importedPublicRouteTable.routeTableId,
      },
    );
  }
}
