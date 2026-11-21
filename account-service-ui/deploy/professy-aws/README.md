# Professy on AWS

Deploy the first two images from Build Center to one Kubernetes namespace:

| Application | Public URL | Container port |
| --- | --- | --- |
| `professy-backend` | `https://professy-backend.greatley-poshley.com` | 8080 |
| `professy-ui` | `https://professy-ui.greatley-poshley.com` | 8080 |

The backend uses existing RDS MySQL and Amazon SQS. Public HTTPS goes through
Cloudflare Tunnel to Kubernetes ingress.

## 1. Create a cluster from Build Center

Install AWS CLI v2, `kubectl`, and `skopeo` on the Build Center host. Set
`BUILD_CENTER_AWS_SETUP_ORG_ID` to the Passport workspace ID and
`BUILD_CENTER_AWS_PROFILES=professy-deploy`. For a local installation, sign
in using `aws sso login --profile professy-deploy`. On EC2, attach an IAM
instance role and set `BUILD_CENTER_AWS_ALLOW_HOST_ROLE=true` to offer it
in Build Center.

Open **Settings → Cloud providers → Connect AWS account**. Select the
approved identity, region, and namespace. Check **Enable EKS cluster
creation** and enter the three IAM role ARNs. Create the roles in AWS in
advance. The deployment role must trust the provisioning identity, and the
provisioning identity needs `sts:AssumeRole` for that deployment role.

For server-managed account connections, use a private copy of
[eks-accounts.example.json](eks-accounts.example.json) and set
`BUILD_CENTER_EKS_ACCOUNTS_FILE` to its path.

| Provisioning access | AWS permissions |
| --- | --- |
| Discover and validate | `eks:ListClusters`, `eks:DescribeClusterVersions`, `ec2:DescribeSubnets`, `ec2:DescribeInstanceTypes` |
| Create and check the cluster and workers | `eks:CreateCluster`, `eks:DescribeCluster`, `eks:UpdateClusterConfig`, `eks:ListNodegroups`, `eks:CreateNodegroup`, `eks:DescribeNodegroup`, `eks:DeleteNodegroup`, `eks:TagResource`, `ec2:DescribeSubnets`, `ec2:DescribeInstanceTypes`, `autoscaling:DescribeScalingActivities`, `iam:ListAttachedRolePolicies` |
| Remediate the EC2 node role | `iam:AttachRolePolicy` for the configured EC2 node role |
| Set up deployments and CPU metrics | `eks:CreateAccessEntry`, `eks:DescribeAccessEntry`, `eks:CreateAddon`, `eks:DescribeAddon` |
| Pass approved roles | `iam:PassRole` for the control plane and worker roles. The first EKS setup in an account can also need `iam:CreateServiceLinkedRole` for EKS. |

Use **Settings → Cloud providers → Create EKS cluster**. Choose `us-east-1`,
then **Load AWS options**. Select the RDS VPC and subnets in at least two
Availability Zones. Choose the instance type and worker counts. Check that
workers can reach required AWS services and the image registry. For a
private API endpoint, run Build Center in the VPC or over a connected network.
If a local Build Center cannot reach a private endpoint, use **Resume setup** on
the failed cluster row and enter a restricted IPv4 CIDR for its current public
egress IP. Build Center adds that CIDR to the endpoint allowlist, preserves
existing entries, then retries namespace setup. Do not use `0.0.0.0/0`.

Build Center calls AWS to create the cluster and worker group, prepares
the Kubernetes namespace, installs Metrics Server, and verifies the assumed
deployment role. When the setup reaches **Ready**, choose **Deploy an app**.

[EKS cluster IAM role](https://docs.aws.amazon.com/eks/latest/userguide/cluster-iam-role.html) · [EKS node IAM role and VPC CNI permissions](https://docs.aws.amazon.com/eks/latest/userguide/create-node-role.html) · [EKS API permissions](https://docs.aws.amazon.com/service-authorization/latest/reference/list_eks.html) · [EKS endpoint access](https://docs.aws.amazon.com/eks/latest/userguide/cluster-endpoint.html)

### Connect an existing cluster instead

Use an existing EKS cluster in `us-east-1` or create an EKS cluster using
subnets in the RDS VPC. For the pilot, size an EC2 managed node group for both
apps, the ingress controller, and system pods. An initial example is one
8 GiB ARM64 worker, with a maximum of two workers if you install Cluster
Autoscaler. Choose x86-64 if that is what your existing workers run. Install
Metrics Server for CPU autoscaling and an internal ingress controller with an
IngressClass such as `traefik`. An EKS managed node group's size settings
bound worker scaling. Configure Cluster Autoscaler separately.

With your cluster administrator identity, apply the
[Build Center namespace and RBAC](build-center-rbac.yaml). Configure an EKS
access entry for a dedicated deploy role and map that role to the
`build-center-professy-deployer` Kubernetes group. Use your AWS IAM Identity
Center profile locally or an EC2 IAM role for a hosted Build Center instance.
Run the Build Center server in the VPC or on a VPN-connected host when the API
endpoint is private.

```sh
kubectl --context CLUSTER_ADMIN_CONTEXT apply -f deploy/professy-aws/build-center-rbac.yaml

aws eks create-access-entry --region us-east-1 --cluster-name CLUSTER_NAME \
  --principal-arn DEPLOY_ROLE_ARN --type STANDARD \
  --kubernetes-groups build-center-professy-deployer
```

The cluster needs EKS access entries enabled. The Build Center profile or host
role should resolve to the deploy role. Grant `eks:ListClusters` on all
resources and `eks:DescribeCluster` on the approved cluster ARNs, along with
the EKS access entry. Use Session Manager for administration of EC2 hosts.

[EKS access entries](https://docs.aws.amazon.com/eks/latest/userguide/access-entries.html) · [EC2 node autoscaling](https://docs.aws.amazon.com/eks/latest/userguide/autoscaling.html) · [Metrics Server](https://docs.aws.amazon.com/eks/latest/userguide/metrics-server.html) · [Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html)

## 2. Create FIFO queues and prepare MySQL

Deploy [sqs.yaml](sqs.yaml) in the same AWS region as the application and read
the two queue URLs and the three Pod Identity role ARNs from the stack outputs.

```sh
aws cloudformation deploy --region us-east-1 --stack-name professy-events \
  --template-file deploy/professy-aws/sqs.yaml --capabilities CAPABILITY_IAM
aws cloudformation describe-stacks --region us-east-1 --stack-name professy-events \
  --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output table
```

Use EKS Pod Identity for the Java services. Install the `eks-pod-identity-agent`
add-on if needed and apply [sqs-service-accounts.yaml](sqs-service-accounts.yaml)
in the cluster. Associate each role from the stack with its matching service
account in namespace `professy`.

| Service account | Stack output for role ARN | Queue environment values |
| --- | --- | --- |
| `professy-backend` | `BackendPublisherRoleArn` | `SQS_TICKET_EVENTS_QUEUE_URL` and `SQS_ACCOUNT_MAIL_QUEUE_URL` |
| `professy-notification-service` | `TicketConsumerRoleArn` | `SQS_TICKET_EVENTS_QUEUE_URL` |
| `professy-email-service` | `MailConsumerRoleArn` | `SQS_ACCOUNT_MAIL_QUEUE_URL` |

```sh
aws eks create-addon --region us-east-1 --cluster-name CLUSTER_NAME \
  --addon-name eks-pod-identity-agent
kubectl --context CLUSTER_ADMIN_CONTEXT apply -f deploy/professy-aws/sqs-service-accounts.yaml

aws eks create-pod-identity-association --region us-east-1 --cluster-name CLUSTER_NAME \
  --namespace professy --service-account SERVICE_ACCOUNT --role-arn SERVICE_ROLE_ARN
```

Repeat the association command for each service. In **Build Center → Deployments**
set **Kubernetes service account** to that service name and keep
`APP_EVENTS_TRANSPORT=sqs`. Configure the queue URLs and `AWS_REGION` either as
runtime variables or in a ConfigMap. Make sure the pods can reach the regional
SQS endpoint. The AWS SDK obtains temporary credentials through Pod Identity.

The backend publishes ticket notifications and account-mail jobs to their
respective FIFO queues. The services acknowledge after their existing
database handlers succeed. Failed messages can be redriven from the two
dead-letter queues. Workspace browser updates read the committed MySQL
outbox on each backend replica. Existing Calendar, Chatly, Post, and Radar
Kafka integrations are outside this SQS pilot.

In RDS, ensure the `professy` database exists. Create an application user with
grants on that database and allow TCP 3306 from the cluster's effective source
security group. JPA creates and updates tables inside that database. Use the
existing RDS instance with a dedicated pilot database and user. The sample
uses encrypted JDBC with `sslMode=REQUIRED`. For identity verification, install
the AWS RDS trust CA and set `sslMode=VERIFY_IDENTITY`.

Copy [runtime.example.yaml](runtime.example.yaml), fill in the queue URLs, and
apply it with your cluster administrator identity. Create a Kubernetes Secret
in `professy` named `professy-backend-secret` with `DB_USERNAME`,
`DB_PASSWORD`, and `JWT_SECRET`. The email and notification services also need
their own database configuration and access to the backend as before.

### Kafka fallback

The Kafka implementation stays available through
`APP_EVENTS_TRANSPORT=kafka` and `KAFKA_BOOTSTRAP_SERVERS`. A private
[Kafka Compose configuration](kafka.compose.yaml) is available for this mode.
Drain pending work on the active transport before switching producers and
consumers together. Changing transports does not move existing queue or topic
messages.

[EKS Pod Identity](https://docs.aws.amazon.com/eks/latest/userguide/pod-identities.html) · [SQS FIFO queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-fifo-queues.html) · [RDS TLS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html)

## 3. Prepare ECR access and choose public exposure

The AWS identity connected under **Cloud providers** needs
`ecr:DescribeRepositories`, `ecr:CreateRepository`, `ecr:GetAuthorizationToken`,
`ecr:BatchCheckLayerAvailability`, `ecr:InitiateLayerUpload`,
`ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`, and `ecr:PutImage`.
`ecr:BatchGetImage` is also included in AWS's ECR push policy.
Scope repository actions to the app repositories and authorize
`ecr:GetAuthorizationToken` on `*`. The EC2 node role needs ECR pull access.
When saving a pipeline, select the AWS account under **Amazon ECR destination**.
Build Center creates the app repository and publishes every build before it is
marked successful. [ECR publisher IAM permissions](https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-push-iam.html) · [EKS image pull permissions](https://docs.aws.amazon.com/AmazonECR/latest/userguide/ECR_on_EKS.html)

For an existing cluster, open **Deployments → Connect EKS cluster**.
Choose `us-east-1` and **Find EKS clusters**, then select the cluster, the
`professy` namespace, and the worker architecture. **Connect cluster**
checks access through the Kubernetes API.

For a direct HTTP endpoint, choose **AWS public load balancer** in the
deployment form. The cluster needs AWS load balancing support and suitable
public subnets. In Release details, click **Refresh pod and service status** to
get the AWS address. [EKS load balancing prerequisites](https://docs.aws.amazon.com/eks/latest/userguide/network-load-balancing.html)

For the pilot's custom HTTPS domains, enter `greatley-poshley.com` and your
IngressClass in the AWS connection, and choose **Custom domain (Ingress)** in
the deployment form. Run a Cloudflare Tunnel connector in the cluster and
route both hostnames to the ingress controller's internal Kubernetes service.
Preserve the incoming hostname so the controller selects the matching rule.
For Traefik, the service might be
`http://traefik.traefik.svc.cluster.local:80`. Switch any existing backend
route after testing the workload in the cluster. [Cloudflare Tunnel on Kubernetes](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/deployment-guides/kubernetes/)

## 4. Build and deploy the backend, then the UI

1. In the `professy-backend` pipeline, select the cluster's image platform
   and run a build, or select an existing build with the same platform.
   In **Deployments**, use app name `professy-backend`, port `8080`, CPU
   request `500` millicores, memory request `1024` MiB, and one fixed replica.
   Set ConfigMap `professy-backend-config`, Secret `professy-backend-secret`,
   Kubernetes service account `professy-backend`, and HTTP readiness path `/v3/api-docs`. Expose
   `professy-backend.greatley-poshley.com` and wait for the rollout.
2. In the `professy-ui` pipeline, use the **Angular server** recipe, choose the
   same platform, and add this build variable before making a new image:

   ```text
   ANGULAR_API_BASE_URL=https://professy-backend.greatley-poshley.com/api
   ```

   Deploy it as `professy-ui` on port `8080`. Use ConfigMap
   `professy-ui-config`, CPU request `100` millicores, memory request `256`
   MiB, and CPU autoscaling from one to two pods at 70%. Keep the default TCP
   readiness check so Kubernetes does not send an unrecognized SSR hostname.
   Expose `professy-ui.greatley-poshley.com`.
   Use **Save app settings** to reuse the CPU utilization target and replica
   bounds on future images. **Deploy image** applies the settings to the
   release and saves them for the next build.
3. Confirm the backend returns HTTP 200 at `/v3/api-docs`, then sign in from
   the UI and verify the browser makes API calls to the public backend URL.
   Check release details for pod counts and pod logs.

The pilot uses temporary pod directories for attachments and local avatars.
Keep file uploads out of the validation and configure persistent shared file
storage before enabling backend autoscaling or migrating existing uploads.
Verify rolling releases against database schema changes before relying on
image rollback. A rollback restores the image and deployment settings, while
the referenced ConfigMaps, Secrets, and database retain their current contents.
