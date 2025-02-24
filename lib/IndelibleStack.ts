import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as eks from 'aws-cdk-lib/aws-eks';
import { getSubnetCidr } from './utils';

export class IndelibleStack extends cdk.Stack {
  public eksVPC: ec2.CfnVPC;
  public eksSecurityGroup: ec2.CfnSecurityGroup;
  public pubSubnetA: ec2.CfnSubnet;
  public pubSubnetB: ec2.CfnSubnet;
  public pubSubnetC: ec2.CfnSubnet;
  public pubSubnetD: ec2.CfnSubnet;
  public privSubnetA: ec2.CfnSubnet;
  public privSubnetB: ec2.CfnSubnet;
  public cluster: eks.Cluster;
  //Exports
  public eksVPCID: string;
  public eksSecurityGroupID: string;
  public pubSubnetA_ID: string;
  public pubSubnetB_ID: string;
  public pubSubnetC_ID: string;
  public pubSubnetD_ID: string;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    // VPC
    const cidrEKSVPC: string = '10.1.0.0/16';
    this.eksVPC = new ec2.CfnVPC(this, 'EKSVPC', {
      cidrBlock: cidrEKSVPC,
    });
    // Route Table and IGW stuff
    const internetGateway = new ec2.CfnInternetGateway(this, 'EKSInternetGateway', {});
    new ec2.CfnVPCGatewayAttachment(this, 'EKSVPCGatewayAttachment', {
      vpcId: this.eksVPC.attrVpcId,
      internetGatewayId: internetGateway.ref,
    });

    // Route Tables
    const publicRouteTable = new ec2.CfnRouteTable(this, 'EKSPublicRouteTable', {
      vpcId: this.eksVPC.attrVpcId,
    });
    const privateRouteTable = new ec2.CfnRouteTable(this, 'EKSPrivateRouteTable', {
      vpcId: this.eksVPC.attrVpcId,
    });

    // Subnets
    const privateCidrBlock0 = getSubnetCidr(cidrEKSVPC, 0);
    const privateCidrBlock1 = getSubnetCidr(cidrEKSVPC, 1);
    const publicCidrBlock0 = getSubnetCidr(cidrEKSVPC, 2);
    const publicCidrBlock1 = getSubnetCidr(cidrEKSVPC, 3);
    const publicCidrBlock2 = getSubnetCidr(cidrEKSVPC, 4);
    const publicCidrBlock3 = getSubnetCidr(cidrEKSVPC, 5);
    // Public
    this.pubSubnetA = new ec2.CfnSubnet(this, 'EKSPublicSubnetA', {
      vpcId: this.eksVPC.attrVpcId,
      availabilityZone: this.availabilityZones[1],
      cidrBlock: publicCidrBlock0,
      mapPublicIpOnLaunch: true, // Ensures instances get public IPs
      tags: [
        { key: 'aws-cdk:subnet-type', value: 'Public' },
        { key: 'kubernetes.io/role/internal-elb', value: '1' },
      ],
    });
    this.pubSubnetB = new ec2.CfnSubnet(this, 'EKSPublicSubnetB', {
      vpcId: this.eksVPC.attrVpcId,
      availabilityZone: this.availabilityZones[1],
      cidrBlock: publicCidrBlock1,
      mapPublicIpOnLaunch: true, // Ensures instances get public IPs
      tags: [
        { key: 'aws-cdk:subnet-type', value: 'Public' },
        { key: 'kubernetes.io/role/internal-elb', value: '1' },
      ],
    });
    this.pubSubnetC = new ec2.CfnSubnet(this, 'EKSPublicSubnetC', {
      vpcId: this.eksVPC.attrVpcId,
      availabilityZone: this.availabilityZones[2],
      cidrBlock: publicCidrBlock2,
      mapPublicIpOnLaunch: true, // Ensures instances get public IPs
      tags: [
        { key: 'aws-cdk:subnet-type', value: 'Public' },
        { key: 'kubernetes.io/role/internal-elb', value: '1' },
      ],
    });
    this.pubSubnetD = new ec2.CfnSubnet(this, 'EKSPublicSubnetD', {
      vpcId: this.eksVPC.attrVpcId,
      availabilityZone: this.availabilityZones[2],
      cidrBlock: publicCidrBlock3,
      mapPublicIpOnLaunch: true, // Ensures instances get public IPs
      tags: [
        { key: 'aws-cdk:subnet-type', value: 'Public' },
        { key: 'kubernetes.io/role/internal-elb', value: '1' },
      ],
    });
    // Private
    this.privSubnetA = new ec2.CfnSubnet(this, 'EKSPrivateSubnetA', {
      vpcId: this.eksVPC.attrVpcId,
      availabilityZone: this.availabilityZones[0], //Private AZ = 0
      cidrBlock: privateCidrBlock0,
      mapPublicIpOnLaunch: false,
      tags: [{ key: 'aws-cdk:subnet-type', value: 'Private' }],
    });
    this.privSubnetB = new ec2.CfnSubnet(this, 'EKSPrivateSubnetB', {
      vpcId: this.eksVPC.attrVpcId,
      availabilityZone: this.availabilityZones[0],
      cidrBlock: privateCidrBlock1,
      mapPublicIpOnLaunch: false,
      tags: [{ key: 'aws-cdk:subnet-type', value: 'Private' }],
    });
    // Associations
    const pubSubnetList = [this.pubSubnetA, this.pubSubnetB, this.pubSubnetC, this.pubSubnetD];
    const privSubnetList = [this.privSubnetA, this.privSubnetB];
    pubSubnetList.forEach((subnet, index) => {
      new ec2.CfnSubnetRouteTableAssociation(this, `pubAssoc${index}`, {
        subnetId: subnet.attrSubnetId,
        routeTableId: publicRouteTable.ref,
      });
    });
    privSubnetList.forEach((subnet, index) => {
      new ec2.CfnSubnetRouteTableAssociation(this, `privAssoc${index}`, {
        subnetId: subnet.attrSubnetId,
        routeTableId: privateRouteTable.ref,
      });
    });

    // Public Routing
    new ec2.CfnRoute(this, 'EKSInternetRoute', {
      routeTableId: publicRouteTable.ref,
      destinationCidrBlock: '0.0.0.0/0',
      gatewayId: internetGateway.ref,
    });
    //Private Routing
    const natEip = new ec2.CfnEIP(this, 'NatEIP');
    const natGateway = new ec2.CfnNatGateway(this, 'natGateway', {
      allocationId: natEip.attrAllocationId,
      subnetId: this.pubSubnetA.attrSubnetId, // Placing NAT Gateway in Public Subnet A
    });
    new ec2.CfnRoute(this, 'privateNatRoute', {
      routeTableId: privateRouteTable.ref,
      destinationCidrBlock: '0.0.0.0/0',
      natGatewayId: natGateway.ref,
    });

    //Security Groups
    this.eksSecurityGroup = new ec2.CfnSecurityGroup(this, 'eksSecurityGroup', {
      groupDescription: 'EKS Security Group',
      groupName: 'eksSecurityGroup',
      vpcId: this.eksVPC.attrVpcId,
      securityGroupIngress: [
        {
          ipProtocol: 'tcp',
          cidrIp: '0.0.0.0/0', // Equivalent to ec2.Peer.anyIpv4()
          fromPort: 22,
          toPort: 22,
          description: 'Allow SSH access from any IPv4',
        },
        {
          ipProtocol: 'tcp',
          cidrIp: '0.0.0.0/0', // Equivalent to ec2.Peer.anyIpv4()
          fromPort: 443,
          toPort: 443,
          description: 'Allow HTTPS access from any IPv4',
        },
      ],
    });

    // Exports
    this.eksVPCID = this.eksVPC.attrVpcId;
    this.eksSecurityGroupID = this.eksSecurityGroup.attrId;
    this.pubSubnetA_ID = this.pubSubnetA.attrSubnetId;
    this.pubSubnetB_ID = this.pubSubnetB.attrSubnetId;
    this.pubSubnetC_ID = this.pubSubnetC.attrSubnetId;
    this.pubSubnetD_ID = this.pubSubnetD.attrSubnetId;
  }
}
