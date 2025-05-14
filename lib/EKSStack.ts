import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamo from 'aws-cdk-lib/aws-dynamodb';
import { KubectlV31Layer } from '@aws-cdk/lambda-layer-kubectl-v31';
import { App } from 'cdk8s';
import { AuthChart } from './authChart';

// blueprints.HelmAddOn.validateHelmVersions = true; // optional if you would like to check for newer versions
interface ClusterStackProps extends cdk.StackProps {
  // stack objects that you'll consume is added  with interfaces
  playgroundTable?: dynamo.ITable; // such as dynamodb table and S3 bucket here
  playgroundBucket?: s3.IBucket;
  // importedAssetBucket: s3.IBucket;
  eksSecurityGroupID: string;
  eksVPCID: string;
  pubSubnetA_ID: string;
  pubSubnetB_ID: string;
  pubSubnetC_ID: string;
  pubSubnetD_ID: string;
}

export class EKSStack extends cdk.Stack {
  public cluster: eks.Cluster;
  public cfncluster: eks.CfnCluster;
  public eksVPC: ec2.IVpc;
  public mainRole: iam.Role;
  public nodeGroupRole: iam.Role;
  public pubSubnetA: ec2.ISubnet;
  public pubSubnetB: ec2.ISubnet;
  public pubSubnetC: ec2.ISubnet;
  public pubSubnetD: ec2.ISubnet;
  public assetBucket: s3.Bucket;
  public eksSecurityGroup: ec2.ISecurityGroup;
  public clusterName: string;
  public clusterARN: string;
  public configCommand: string;
  public mainRoleArn: string;

  constructor(scope: Construct, id: string, props: ClusterStackProps) {
    super(scope, id, props);

    this.mainRole = new iam.Role(this, 'eksMainRole', {
      description: 'Master role for the EKS control plane',
      assumedBy: new iam.CompositePrincipal(
        new iam.ArnPrincipal('arn:aws:iam::844062109895:role/cdk-hnb659fds-deploy-role-844062109895-us-east-2'),
        new iam.ServicePrincipal('ec2.amazonaws.com'),
        new iam.ServicePrincipal('eks.amazonaws.com'),
      ),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSClusterPolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSServicePolicy'),
        //These others may not be needed
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2FullAccess'), // Required for networking
        iam.ManagedPolicy.fromAwsManagedPolicyName('IAMFullAccess'), // Required for passing IAM roles
        iam.ManagedPolicy.fromAwsManagedPolicyName('AutoScalingFullAccess'), // Required for node autoscaling
      ],
    });

    // this.nodeGroupRole = new iam.Role(this, 'EKSNodeGroupRole', {
    //   description: 'Node group role for worker nodes in the EKS cluster',
    //   assumedBy: new iam.CompositePrincipal(
    //     new iam.ArnPrincipal('arn:aws:iam::844062109895:role/cdk-hnb659fds-deploy-role-844062109895-us-east-2'),
    //     new iam.ServicePrincipal('ec2.amazonaws.com'),
    //     new iam.ServicePrincipal('eks.amazonaws.com'),
    //   ),
    //   managedPolicies: [
    //     iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
    //     iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
    //     iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'),
    //   ],
    // });
    this.assetBucket = new s3.Bucket(this, 'assetBucket', {
      bucketName: 'assetbucket-eksthingsboard',
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });
    this.assetBucket.grantReadWrite(this.mainRole);

    this.eksVPC = ec2.Vpc.fromVpcAttributes(this, 'importedEKSVPC', {
      vpcId: props.eksVPCID, // Get VPC ID from CfnVPC
      publicSubnetIds: [props.pubSubnetB_ID, props.pubSubnetC_ID, props.pubSubnetD_ID],
      availabilityZones: this.availabilityZones, // Use available AZs
    });
    this.eksSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(this, 'importedEKSSecurityGroup', props.eksSecurityGroupID);

    this.eksVPC.publicSubnets.forEach((subnet) => {
      cdk.Annotations.of(subnet).acknowledgeWarning('@aws-cdk/aws-ec2:noSubnetRouteTableId', 'Will not read route table ID for subnet');
    });
    cdk.Annotations.of(this).acknowledgeWarning('@aws-cdk/aws-eks:clusterMustManuallyTagSubnet', 'Imported Subnet does not need tag');
    cdk.Annotations.of(this).acknowledgeWarning('@aws-cdk/aws-ec2:ipv4IgnoreEgressRule');
    cdk.Annotations.of(this).acknowledgeWarning('@aws-cdk/aws-autoscaling:desiredCapacitySet');
    // this.pubSubnetA = ec2.Subnet.fromSubnetId(this, 'importEKSPublicSubnetA', props.pubSubnetA_ID);
    // this.pubSubnetB = ec2.Subnet.fromSubnetId(this, 'importEKSPublicSubnetB', props.pubSubnetB_ID);
    // this.pubSubnetC = ec2.Subnet.fromSubnetId(this, 'importEKSPrivateSubnetA', props.pubSubnetC_ID);
    // this.pubSubnetD = ec2.Subnet.fromSubnetId(this, 'importEKSPrivateSubnetB', props.pubSubnetD_ID);
    // cdk.Annotations.of(this.pubSubnetB).acknowledgeWarning('@aws-cdk/aws-ec2:noSubnetRouteTableId', 'Will not read route table ID for subnet');
    // cdk.Annotations.of(this.pubSubnetC).acknowledgeWarning('@aws-cdk/aws-ec2:noSubnetRouteTableId', 'Will not read route table ID for subnet');
    // cdk.Annotations.of(this.pubSubnetD).acknowledgeWarning('@aws-cdk/aws-ec2:noSubnetRouteTableId', 'Will not read route table ID for subnet');

    const clusterName = 'ThingsboardEKSCluster-blue';
    this.cluster = new eks.Cluster(this, 'eksClusterID-blue', {
      mastersRole: this.mainRole,
      clusterName: clusterName,
      role: this.mainRole,
      vpc: this.eksVPC,
      outputClusterName: true,
      outputConfigCommand: true,
      outputMastersRoleArn: true,
      kubectlEnvironment: {
        S3_BUCKET_NAME: this.assetBucket.bucketName,
      },
      vpcSubnets: [
        {
          subnets: [...this.eksVPC.publicSubnets],
        },
      ],
      version: eks.KubernetesVersion.V1_31,
      securityGroup: this.eksSecurityGroup,
      defaultCapacity: 0,
      defaultCapacityType: eks.DefaultCapacityType.EC2,
      clusterLogging: [eks.ClusterLoggingTypes.API, eks.ClusterLoggingTypes.AUTHENTICATOR, eks.ClusterLoggingTypes.AUDIT],
      kubectlLayer: new KubectlV31Layer(this, 'kubectl'),
      endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE,
      authenticationMode: eks.AuthenticationMode.API_AND_CONFIG_MAP
    });
    const autoScalingGroup = this.cluster.addAutoScalingGroupCapacity('EC2Capacity', {
      instanceType: new ec2.InstanceType('t3.micro'),
      desiredCapacity: 2,
      minCapacity: 2,
      maxCapacity: 3,
      mapRole: true,
      allowAllOutbound: false,
      autoScalingGroupName: 'eksClusterAutoScalingGroup',
      bootstrapEnabled: true,
      vpcSubnets: {
        subnets: [...this.eksVPC.publicSubnets],
      },
    });

    new eks.CfnAccessEntry(this, 'accessEntryConsole', {
      clusterName: this.cluster.clusterName,
      principalArn: 'arn:aws:iam::844062109895:role/TheHuman',
      type: 'STANDARD',
      accessPolicies: [{
        accessScope: {
          type: 'cluster'
        },
        policyArn: 'arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy',
      }],
    });
    // new eks.CfnAccessEntry(this, 'accessEntryMainRole', {
    //   principalArn: this.mainRole.roleArn,
    //   clusterName: this.cluster.clusterName,
    //   type: 'EC2_LINUX',
    //   accessPolicies: [{
    //     accessScope: {
    //       type: 'cluster'
    //     },
    //     policyArn: 'arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy',
    //   }],
    // })
    // new eks.AccessEntry(this, 'accessEntryMainRole', {
    //   cluster: this.cluster,
    //   principal: this.mainRoleArn,
    //   accessEntryName: 'accessEntryForMainRole',
    //   accessEntryType: eks.AccessEntryType.EC2_LINUX,
    //   accessPolicies: [
    //     eks.AccessPolicy.fromAccessPolicyName('AmazonEKSClusterAdminPolicy', {
    //       accessScopeType: eks.AccessScopeType.CLUSTER,
    //     }),
    //   ],
    // });

    // Output the Cluster Name, Config Command, and Masters Role ARN
    this.clusterName = this.cluster.clusterName;
    this.clusterARN = this.cluster.clusterArn;
    this.configCommand = `aws eks update-kubeconfig --name ${this.cluster.clusterName} --region ${this.region}`;
    this.mainRoleArn = this.mainRole.roleArn;

    // const cdk8sApp = new App();
    // const authChart = new AuthChart(cdk8sApp, 'AuthChart', { mainRoleArn: this.mainRoleArn });
    // this.cluster.addCdk8sChart('authChart', authChart)
    // new eks.KubernetesPatch(this, 'hello-kub-deployment-label', {
    //   cluster: this.cluster,
    //   resourceName: 'ConfigMap/aws-auth',
    //   applyPatch: {'spec': {'replicas': 5}},
    //   restorePatch: {'spec': {'replicas': 3}}
    // })
  }
}

//   cluster=cluster,
//   resource_name="deployment/hello-kubernetes",
//   apply_patch={"spec": {"replicas": 5}},
//   restore_patch={"spec": {"replicas": 3}}
// )
// const cfnclusterName = 'HelloCfnEKSCluster'
// this.cfncluster = new eks.CfnCluster(this, cfnclusterName, {
//   name: cfnclusterName,
//   version: '1.32',
//   roleArn: props.mainRole.roleArn,
//   resourcesVpcConfig: {
//     subnetIds: [props.pubSubnetA_ID, props.pubSubnetB_ID, props.pubSubnetC_ID, props.pubSubnetD_ID],
//     securityGroupIds: [props.eksSecurityGroupID],
//     endpointPublicAccess: true,
//     endpointPrivateAccess: false,
//   },
// });
// const eksNodeGroup = new eks.CfnNodegroup(this, 'EKSCfnNodeGroup', {
//   clusterName: cfnclusterName, // Name of the EKS cluster
//   nodegroupName: 'defaultNodeGroup', // Node group name
//   nodeRole: props.nodeGroupRole.roleArn, // IAM role for the nodes
//   subnets: [
//     props.pubSubnetA_ID,
//     props.pubSubnetB_ID,
//     props.pubSubnetC_ID,
//     props.pubSubnetD_ID
//   ],
//   scalingConfig: {
//     desiredSize: 2,
//     maxSize: 3,
//     minSize: 0,
//   },
//   diskSize: 50, // Disk size in GiB
//   amiType: 'AL2_x86_64', // Amazon Linux 2 AMI
//   capacityType: 'ON_DEMAND', // Instance type: On-Demand
//   instanceTypes: ['t3.micro'], // Equivalent to BURSTABLE3.MICRO
// });
// eksNodeGroup.addDependency(this.cfncluster)

// this.cluster.addNodegroupCapacity('cdk-node-group', {
//   nodegroupName: 'cdk-node-group',
//   instanceTypes: [ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO)],
//   // instanceTypes: [new ec2.InstanceType('m5.large'), new ec2.InstanceType('m5.xlarge')],
//   capacityType: eks.CapacityType.ON_DEMAND,
//   desiredSize: 2,
//   nodeRole: this.nodeGroupRole,
//   maxSize: 3,
//   minSize: 0,
//   diskSize: 50,
//   amiType: eks.NodegroupAmiType.AL2_X86_64,
//   subnets: {
//     subnets: [this.pubSubnetA, this.pubSubnetB, this.pubSubnetC, this.pubSubnetD]
//   }
// });
