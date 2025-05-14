import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';

export class WideOpenDatabaseStack extends cdk.Stack {
  public readonly dbEndpoint: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. Reference existing VPC (replace with your VPC ID)
    const vpc = ec2.Vpc.fromVpcAttributes(this, 'Vpc', {
      vpcId: 'vpc-0680be921bcbc1828',
      privateSubnetIds: [
        'subnet-061980806b12e1c2f', // PrivateUSEAST2A
        'subnet-09b243837a89946c5', // PrivateUSEAST2B
        'subnet-083228039588ac823', // PrivateUSEAST2C
      ],
      privateSubnetRouteTableIds: [
        'rtb-0dcc5e5427fbd28d1', // PrivateRouteTableUSEAST2A
        'rtb-0592adebceed9a1af', // PrivateRouteTableUSEAST2B
        'rtb-0f8e2f574de7d509e', // PrivateRouteTableUSEAST2C
      ],
      publicSubnetIds: [
        'subnet-0f7f60a04eee90e0e', // PublicUSEAST2A
        'subnet-07e9e222ffb54b488', // PublicUSEAST2B
        'subnet-078b290b2356971fa', // PublicUSEAST2C
      ],
      publicSubnetRouteTableIds: [
        'rtb-00b8e0f9dab393b4a', // PublicRouteTable
        'rtb-00b8e0f9dab393b4a', // Same route table for all public subnets
        'rtb-00b8e0f9dab393b4a',
      ],
      availabilityZones: ['us-east-2a', 'us-east-2b', 'us-east-2c'],
    });

    // 2. Create wide-open security group
    // const openSg = new ec2.SecurityGroup(this, 'PublicPostgresSG', {
    //   vpc,
    //   allowAllOutbound: true,
    // });
    // openSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(5432), 'Open PostgreSQL to world');

    const clusterNodeSg = ec2.SecurityGroup.fromSecurityGroupId(this, 'NodeSG', 'sg-0c741c7eeb0b1e3fa');
    const controlPlaneSg = ec2.SecurityGroup.fromSecurityGroupId(this, 'ControlPlaneSG', 'sg-0047198913daa5d4c');

    // Create a new restricted DB SG
    const dbSg = new ec2.SecurityGroup(this, 'DBSecurityGroup', {
      vpc,
      description: 'Allow only EKS cluster access',
    });

    // Allow only from EKS nodes and control plane
    dbSg.addIngressRule(clusterNodeSg, ec2.Port.tcp(5432), 'Allow from EKS nodes');
    dbSg.addIngressRule(controlPlaneSg, ec2.Port.tcp(5432), 'Allow from EKS control plane');

    // 3. Create public RDS instance
    const db = new rds.DatabaseInstance(this, 'PublicPostgres', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16_3 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      deletionProtection: false,
      securityGroups: [dbSg],
      publiclyAccessible: false, // Critical for public access
      databaseName: 'thingsboard',
      credentials: rds.Credentials.fromGeneratedSecret('postgres'), // Random password
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Delete on stack deletion
    });

    this.dbEndpoint = db.dbInstanceEndpointAddress;
    new cdk.CfnOutput(this, 'DBEndpoint', { value: db.dbInstanceEndpointAddress });
  }
}
