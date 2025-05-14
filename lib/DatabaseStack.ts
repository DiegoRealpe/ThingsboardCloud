import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export class DatabaseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Reference existing VPC
    const vpc = ec2.Vpc.fromVpcAttributes(this, 'ExistingVpc', {
        vpcId: 'vpc-0680be921bcbc1828',
        availabilityZones: ['us-east-2a', 'us-east-2b', 'us-east-2c'],
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
      });

    // Reference existing security groups
    const clusterSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'ClusterSecurityGroup',
      'sg-0c741c7eeb0b1e3fa' // ClusterSharedNodeSecurityGroup
    );

    // Create database security group
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DBSecurityGroup', {
      vpc,
      description: 'Security group for PostgreSQL RDS',
    });

    // Allow inbound from EKS cluster nodes
    dbSecurityGroup.addIngressRule(
      clusterSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access from EKS nodes'
    );

    // Create custom parameter group
    const parameterGroup = new rds.ParameterGroup(this, 'PGParameterGroup', {
        engine: rds.DatabaseInstanceEngine.postgres({
          version: rds.PostgresEngineVersion.VER_16_3,
        }),
        parameters: {
          'max_connections': '200',
          'shared_buffers': '131072', // 128MB
          'maintenance_work_mem': '262144', // 256MB
          'work_mem': '32768', // 32MB
          'effective_cache_size': '786432', // 768MB
          'random_page_cost': '1.1',
          'log_min_duration_statement': '1000', // Log slow queries >1s
        },
      });

    // Create database credentials secret
    const dbCredentialsSecret = new secretsmanager.Secret(this, 'DBCredentialsSecret', {
      secretName: 'thingsboard-db-credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'postgres' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 32,
      },
    });

    // Create RDS instance
    const dbInstance = new rds.DatabaseInstance(this, 'ThingsboardDB', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_3,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.M6G, ec2.InstanceSize.LARGE),
      vpc,
      vpcSubnets: {
        subnets: [
          ec2.Subnet.fromSubnetAttributes(this, 'PrivateSubnetA', {
            subnetId: 'subnet-061980806b12e1c2f',
            routeTableId: 'rtb-0dcc5e5427fbd28d1',
          }),
          ec2.Subnet.fromSubnetAttributes(this, 'PrivateSubnetB', {
            subnetId: 'subnet-09b243837a89946c5',
            routeTableId: 'rtb-0592adebceed9a1af',
          }),
        ],
      },
      securityGroups: [dbSecurityGroup],
      parameterGroup,
      credentials: rds.Credentials.fromSecret(dbCredentialsSecret),
      databaseName: 'thingsboard',
      allocatedStorage: 100,
      storageType: rds.StorageType.IO1,
      iops: 5000,
      multiAz: true,
      backupRetention: cdk.Duration.days(7),
      deletionProtection: true,
      monitoringInterval: cdk.Duration.seconds(60),
    });

    // Output important values
    new cdk.CfnOutput(this, 'DBEndpoint', { value: dbInstance.dbInstanceEndpointAddress });
    new cdk.CfnOutput(this, 'DBSecretARN', { value: dbCredentialsSecret.secretArn });
  }
}