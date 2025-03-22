import { Chart } from 'cdk8s';
import { Construct } from 'constructs';
import { ConfigMap } from 'cdk8s-plus-31';
import * as yaml from 'js-yaml';

export interface AuthChartProps {
  mainRoleArn: string;
}

export class AuthChart extends Chart {
  constructor(scope: Construct, id: string, props: AuthChartProps) {
    super(scope, id);

    // Define the role mapping for the main role.
    const mapRoles = [
      {
        rolearn: props.mainRoleArn,
        username: 'admin',
        groups: ['system:masters'],
      },
    ];

    // Convert the mapping into a YAML string.
    const mapRolesYaml = yaml.dump(mapRoles);

    // Create (or update) the aws-auth ConfigMap in the kube-system namespace.
    new ConfigMap(this, 'AuthConfigMap', {
      metadata: {
        name: 'aws-auth',
        namespace: 'kube-system',
      },
      data: {
        mapRoles: mapRolesYaml,
      },
    });
  }
}
