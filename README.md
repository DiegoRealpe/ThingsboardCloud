# Encryption-as-a-Service for MQTT in Smart Agriculture

This repository implements the infrastructure and deployment logic for a cloud-managed security model that enables end-to-end encrypted telemetry in LoRaWAN-based smart agriculture environments.

It combines AWS CDK for cloud infrastructure provisioning and Kubernetes manifests (with future cdk8s integration) for deploying secure application workloads, including the Key Management Microservice (KMM), MQTT broker, and ThingsBoard.

## Project Overview

This project supports a modular, cloud-fog architecture for managing symmetric key rotation and secure telemetry communication between IoT devices and a cloud application. It is part of a thesis project focused on exploring Encryption-as-a-Service (EaaS) as a scalable model for securing MQTT-based communications in resource-constrained environments.

## Deployment

This project consists of two main deployment phases: provisioning AWS infrastructure using AWS CDK, and deploying Kubernetes workloads to the EKS cluster.

### 1. Deploy AWS Infrastructure (CDK)

Ensure your AWS CLI is configured and CDK dependencies are installed:

```bash
npm install
cdk bootstrap
cdk deploy
```

This will provision the following resources:
- DynamoDB table for key storage
- PostgreSQL instance (via RDS)
- EKS cluster for running application workloads

### 2. Deploy Kubernetes Workloads

Once the CDK deployment is complete, use `eksctl` to create the Kubernetes cluster using the provided configuration:

```bash
eksctl create cluster -f manifests/cluster.yml
```

This deploys core workloads such as:
- The Key Management Microservice (KMM)
- MQTT broker
- Application layer services (e.g., ThingsBoard)

You can verify the deployments using:

```bash
kubectl get pods -A
```

TODO: Migrate into CDK8s constructs