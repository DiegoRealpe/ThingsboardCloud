import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import { getSubnetCidr } from './utils';

export class IndelibleStack extends cdk.Stack {
    public publicSubnet: ec2.Subnet;
    public privateSubnet: ec2.Subnet;
    public cluster: eks.Cluster;
    public importedVPC: ec2.IVpc;
    public mainRole: iam.Role;

    constructor(scope: Construct, id: string, props: cdk.StackProps) {
        super(scope, id, props);

        // The code that defines your stack goes here
        this.mainRole = new iam.Role(this, 'eksMainRole', {
            assumedBy: new cdk.aws_iam.ArnPrincipal('arn:aws:iam::844062109895:role/cdk-hnb659fds-deploy-role-844062109895-us-east-2'),
        });

        this.importedVPC = ec2.Vpc.fromLookup(this, 'SimpleVPC', {
            vpcId: 'vpc-0f670664' // SimpleVpc
        //   vpcId: 'vpc-0e9887775f8443b4f' // DefaultVpc

        });

        const vpcCidrString = '10.0.0.0/16'
        const privateCidrBlock1 = getSubnetCidr(vpcCidrString, 1)
        const privateCidrBlock2 = getSubnetCidr(vpcCidrString, 2)
        // Create a Public Subnet
        this.publicSubnet = new ec2.Subnet(this, 'SimplePublicSubnet', {
            vpcId: this.importedVPC.vpcId,
            availabilityZone: this.importedVPC.availabilityZones[0],
            cidrBlock: privateCidrBlock1,
            mapPublicIpOnLaunch: true, // Ensures instances get public IPs
        });
        // Create a Private Subnet
        this.privateSubnet = new ec2.Subnet(this, 'SimplePrivateSubnet', {
            vpcId: this.importedVPC.vpcId,
            availabilityZone: this.importedVPC.availabilityZones[1],
            cidrBlock: privateCidrBlock2,
            mapPublicIpOnLaunch: false,
        });
        // Lookup or Create an Internet Gateway (Assumes VPC already has one)
        const igw = new ec2.CfnInternetGateway(this, 'InternetGateway', {});
        // Attach the IGW to the VPC
        new ec2.CfnVPCGatewayAttachment(this, 'IgwAttachment', {
            vpcId: this.importedVPC.vpcId,
            internetGatewayId: igw.ref,
        });

        // Create a Route Table for the Public Subnet
        const publicRouteTable = new ec2.CfnRouteTable(this, 'PublicRouteTable', {
            vpcId: this.importedVPC.vpcId,
        });
        // Route all internet-bound traffic to the IGW
        new ec2.CfnRoute(this, 'DefaultRoute', {
            routeTableId: publicRouteTable.ref,
            destinationCidrBlock: '0.0.0.0/0',
            gatewayId: igw.ref,
        });
        // Associate the Public Subnet with the Public Route Table
        new ec2.CfnSubnetRouteTableAssociation(this, 'PublicSubnetAssociation', {
            subnetId: this.publicSubnet.subnetId,
            routeTableId: publicRouteTable.ref,
        });

    }
}



