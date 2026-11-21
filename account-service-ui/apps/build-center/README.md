# Build Center

Build Center is a separate Angular application in the Greatley Poshley suite.
It runs on port 4212 with Passport sign-in and the shared Apps launcher.

- Start the suite with `npm run start:apps`, or run `npm run start:build-center`.
- Create the application bundle with `npm run build:build-center` and serve it
  with `npm run serve:build-center`.

Passport needs `build-center=http://localhost:4212` in its local client origins.
For a deployment, register the actual HTTPS origin with Passport and configure
the suite's app URLs. Set `BUILD_CENTER_URL` on Professy to redirect old bookmarks
to the standalone app.

## Connect GitHub

As a workspace administrator, choose **Settings → Connect GitHub**. Select
**Personal account** or **Organization**. On GitHub, approve creation of the
private app and install it on the repositories you want to import. Build Center
verifies the installation with GitHub and saves the connection for your
workspace. Choose **Check installation** if an organization approval is pending
or GitHub does not return you to Settings.

The guided flow works on `http://localhost:4212` and
`http://127.0.0.1:4212`. On a deployed instance, set
`BUILD_CENTER_PUBLIC_ORIGIN` to the exact HTTPS origin. Build Center requests
read-only Contents and Metadata permissions. It stores the generated private
key in its server state file, which defaults to
`~/.greatley-build-center/state.json`. Keep that file private and outside Git.

### Existing GitHub App

An administrator can still supply an existing GitHub App through server
settings. For local development, place them in
`~/.config/professy/build-center.env` with mode `600`. Process environment
variables take precedence. Restart Build Center after editing the file, then
select **Connect GitHub**.

| Variable | Value |
| --- | --- |
| `BUILD_CENTER_WORKSPACE_ORG_ID` | Professy organization ID for this connection |
| `GITHUB_APP_ID` | GitHub App ID |
| `GITHUB_APP_INSTALLATION_ID` | ID of the approved installation |
| `GITHUB_APP_PRIVATE_KEY_FILE` | Path to the PEM file. Relative paths resolve next to `build-center.env`. |
| `GITHUB_APP_PRIVATE_KEY` | Alternative to the file path. Provide the PEM through server secrets. Literal backslash-n is accepted. |
| `GITHUB_APP_SLUG` | Optional GitHub App slug for the settings link |
| `BUILD_CENTER_WORKSPACE_API` | Workspace API origin. Local default is `http://127.0.0.1:8080`. |

## Enable the Docker runner

Install Git and Docker with Buildx on the runner host. Use a dedicated runner
account and builder for trusted repositories. The runner checks out source using
a short-lived GitHub App token, invokes Docker Buildx, and writes image archives
under the artifact root.

| Variable | Value |
| --- | --- |
| `BUILD_CENTER_RUNNER_ENABLED` | Set to `true` to enable builds |
| `BUILD_CENTER_ALLOWED_REPOSITORIES` | Comma-separated GitHub owner/repository list |
| `BUILD_CENTER_ARTIFACT_ROOT` | Absolute folder for archived images and build logs. Default is `~/.greatley-build-center/artifacts`. |
| `BUILD_CENTER_DATA_FILE` | State file. Default is `~/.greatley-build-center/state.json`. |
| `BUILD_CENTER_AWS_CREDENTIALS_DB` | Encrypted AWS credential database. Default is `~/.greatley-build-center/aws-credentials.sqlite`. |
| `BUILD_CENTER_SECRET_ENCRYPTION_KEY` | Optional 32-byte base64 key for encrypting AWS credentials. If absent, Build Center creates a private 0600 key file beside its AWS credential database. |
| `DOCKER_HOST` | Optional socket or endpoint for a dedicated Docker engine |
| `DOCKER_CONFIG` | Optional directory for runner-specific Docker CLI settings, including Buildx discovery |

Use **Settings → Check runner** after starting Docker. If using a dedicated
Colima profile named `build-center`, resume it after restarting the Mac with
`colima start build-center --activate=false`.

Use a single Build Center instance with its state file and artifact root on
persistent storage. Builds are queued one at a time. A runner restart interrupts
active jobs. Keep Docker credentials and any runner secrets outside pipeline
build arguments.

## Pipelines and artifacts

Set a branch, environment, Dockerfile, context, image name, and artifact folder.
Use one pipeline per branch and environment combination. Set nonsecret
`NAME=value` build arguments as needed. Builds start manually by default.

For guided connections on a reachable HTTPS host, set
`BUILD_CENTER_GITHUB_WEBHOOKS=true` before registration to set up Push delivery
and save the signing secret automatically. For manually configured apps, direct
Push events to `https://<build-center-host>/api/build-center/webhooks/github`
and set the same signing secret as `GITHUB_APP_WEBHOOK_SECRET` on the server.
Then select **GitHub push** as the pipeline's trigger.

Build history shows each run's status, commit and log. A successful build saves
`<artifact-root>/<workspace-id>/<artifact-folder>/build-<id>.tar` and lists the
image tag, archive path, size, and SHA-256 checksum. Download an archive and
import it into Docker with `docker image load --input build-<id>.tar`.

## Cloud providers

In **Settings → Cloud providers → Connect AWS account**, choose **AWS access
key** and enter your AWS access key ID, secret access key, region, and
namespace. Temporary credentials also require the session token. Build Center
checks the credentials with AWS STS and stores them encrypted with AES-256-GCM
in a SQLite database. Credentials are scoped to the Passport workspace and
never returned by the API. A private encryption key file is created beside the
database. For a hosted deployment, persist both files or set
`BUILD_CENTER_SECRET_ENCRYPTION_KEY` to a protected 32-byte base64 key before
the first connection. Keep the same key when restoring the database.

Build Center can also use an approved AWS CLI profile. Configure
`BUILD_CENTER_AWS_SETUP_ORG_ID` and comma-separated
`BUILD_CENTER_AWS_PROFILES`, or set `BUILD_CENTER_AWS_ALLOW_HOST_ROLE=true`
to offer the server's IAM role. Install AWS CLI v2, `kubectl`, and `skopeo`
on the Build Center host for AWS, Kubernetes, and registry operations.

Use **Settings → Cloud providers → Create EKS cluster** to provision the EKS
control plane and a managed EC2 node group. Build Center loads supported
Kubernetes versions and VPC subnets from AWS. Choose the account, region,
namespace, subnets, endpoint access, EC2 instance type, capacity type, disk
size, and minimum, desired, and maximum worker counts.

For a connected cluster, open **AWS resources → EKS cluster → Create node
group** to add another managed worker group. Choose the instance type, On-Demand
or Spot capacity, disk size, subnets across at least two Availability Zones,
and worker minimum/desired/maximum. This creates the managed group through the
AWS EKS API; Ready workers then appear in the cluster node inventory and the
Deployments worker selector. The account must have the EC2 node role configured
and `eks:CreateNodegroup`, `iam:PassRole`, `ec2:DescribeSubnets`, and
`ec2:DescribeInstanceTypes` permissions.

For failed setup jobs, Build Center displays EKS health and Auto Scaling launch
failures. When the configured role uses `AmazonEKSWorkerNodeMinimalPolicy`
without the standard worker permissions, the setup row offers an explicit
action to attach `AmazonEKSWorkerNodePolicy`. Replacing a `CREATE_FAILED` group
requires confirmation because AWS terminates any EC2 workers in that group.
Choose Spot or On-Demand for the replacement group.

To enable cluster creation, provide the approved IAM role ARNs for the
control plane, EC2 workers, and app deployment when connecting the account. The host
profile or EC2 role runs the AWS provisioning API calls under its own
identity. That identity retains EKS cluster administrator access for setup.
Build Center uses the separate app deployment role for namespace-scoped app
deployments. See the [Professy AWS setup](../../deploy/professy-aws/README.md)
for the exact prerequisites.

AWS charges for resources as they are created. Build Center provisions and
checks the cluster in the background, adds Metrics Server, and registers the
ready namespace as a deployment target. **Resume setup** checks the saved
AWS resources after an interruption. If you abandon a partial setup, remove
its resources through AWS to stop charges. EC2 worker counts configure the
node group. Enable Cluster Autoscaler separately for automatic worker scaling.

## Deployments

When saving a pipeline, choose the AWS connection under **Amazon ECR
destination**. Every successful build publishes its image to an immutable,
per build tag in a private ECR repository. Build Center creates the repository
on first use. You can build before connecting AWS, then select the account and
run the pipeline again to publish that image.

Workspace administrators can choose a successful build in **Deployments** or
start from **Images → Deploy image**. Select an EKS target and **Amazon ECR**,
then set the container port, resource requests, and fixed replicas or CPU
autoscaling with its CPU target and minimum and maximum pods. New builds scan
the final Dockerfile stage for `ENV` names and prefill the deployment form;
values are not copied out of the image. Blank regular values preserve image
defaults. Password, token, and key names go to the Secret editor. Secret names
can be saved with app settings, while their values are sent only when deploying.
You can also add nonsecret runtime variables or reference existing ConfigMaps
and Secrets in the target namespace. For EKS targets, Build Center lists Ready
worker nodes that match the image architecture. You can pin every replica to
one node or leave placement to the Kubernetes scheduler; pinned pods remain
Pending if that node is unavailable or lacks capacity. Choose an intranet-only
service, an internet-facing AWS public load balancer, or an internet custom
subdomain through a configured ingress. The selected subdomain is saved with
the deployment profile.

**Save app settings** stores the deployment configuration for the selected
pipeline and cluster target. Later builds of that pipeline load the stored
configuration. **Deploy image** also saves the settings and applies them to a
new release. CPU autoscaling uses the target CPU utilization as a percentage
of the pod's CPU request and scales within the configured replica bounds.
Enable Metrics Server before using this mode.

Sensitive environment values are sent only during **Deploy image** and applied
to the selected Kubernetes Secret; Build Center does not save their values in
deployment profiles or release history. The deployment role needs `get`,
`create`, and `patch` access to Secrets in the namespace. The generated EKS
role and the sample [RBAC manifest](../../deploy/professy-aws/build-center-rbac.yaml)
include these permissions.

The runner verifies the archive checksum and architecture and uses the
build's published ECR digest when the destination account and region match.
For another ECR destination, it publishes the same archive there before
deploying. Kubernetes pulls by digest. Use **Refresh
pod and service status** in Release details to check ready replicas and get
the public HTTP address after AWS provisions the load balancer. Rollback
deploys the selected successful release's image and settings as a new release.

Build Center also accepts server-managed AWS connections through
`BUILD_CENTER_EKS_ACCOUNTS_FILE`. Use a private copy of the
[AWS account template](../../deploy/professy-aws/eks-accounts.example.json).
These connections can optionally offer a second, configured image registry.

## AWS resources

Workspace administrators can open **AWS resources** to create Standard or
FIFO SQS queues, inspect EC2 instance state and CloudWatch metrics, and inspect
connected EKS node groups, nodes, deployments, and pods. Queue inspection reads
message counts and configuration only; it does not read message bodies.

The AWS identity needs `sqs:ListQueues`, `sqs:GetQueueAttributes`, and
`sqs:CreateQueue` for queue management; `ec2:DescribeInstances`,
`ec2:DescribeInstanceStatus`, `ec2:StartInstances`, `ec2:StopInstances`, and
`cloudwatch:GetMetricData` for EC2 inventory and controls; and
`eks:ListNodegroups`, `eks:DescribeNodegroup`, and
`eks:UpdateNodegroupConfig` for managed worker controls. Grant only the
permissions needed by the workspace. Instance CPU, network, and disk metrics
come from CloudWatch. Memory is not an EC2 default metric and requires the
CloudWatch Agent. EKS resource metrics require Metrics Server, and node
inventory requires Kubernetes permission to list nodes; pod and deployment
inventory requires read access to the connected namespace.

If SQS inventory reports `sqs:ListQueues` access denied, attach the example
[SQS resources policy](../../deploy/build-center/aws-resources-sqs-policy.example.json)
to the identity used by the Build Center AWS connection. Replace
`AWS_ACCOUNT_ID` with the 12-digit account ID. `sqs:ListQueues` must use
`Resource: "*"`; queue attribute reads and queue creation are scoped to that
account. For access-key connections, update the IAM user owning the key. For
profile or server-role connections, update the role or user provided by that
identity source. This is the Build Center server identity, not the EKS worker
node role. An explicit deny from a permissions boundary, session policy, or
organization SCP still overrides an allow.

Build Center only offers direct EC2 start and stop for standalone instances.
EKS and Auto Scaling instances are excluded so EC2 actions do not fight the
cluster or scaling group. Use **EKS cluster → Stop workers** to scale a managed
node group to zero, then **Start 1 worker** to bring it back. The EKS control
plane remains active and billable while workers are stopped. Each operation
requires an in-product confirmation and sends the request to AWS only after
confirmation. An EC2 stop and start can change its public IP; EBS volumes and
other attached resources can continue to incur charges while the instance is
stopped.

Once the account is registered, open **Deployments → Connect EKS cluster**.
Choose the AWS account and region and select **Find EKS clusters**. Choose a
cluster, namespace, and worker architecture. Build Center retrieves cluster
information through AWS and validates Kubernetes access before saving the
target. It generates temporary kubeconfig files that use short-lived AWS
tokens and refreshes cluster details for deployment operations.

For manually configured Kubernetes targets, set
`BUILD_CENTER_DEPLOY_TARGETS_FILE` to a private copy of the
[target template](../../deploy/professy-aws/targets.example.json).
The Build Center Dockerfile includes Skopeo. For a containerized Build Center,
supply the other binaries and mount the server-side configuration and
credential sources read-only where possible.

Each target belongs to one Passport workspace and one Kubernetes namespace.
Use a dedicated deploy identity, registry publisher credentials, and namespace
per environment. Keep target IDs stable for the lifetime of a destination and
assign new IDs to new destinations. The role that creates workloads can reference
Secrets in that namespace, so isolate workloads with different trust levels.
For private Kubernetes endpoints, run Build Center on a network that can reach
the API. A single Build Center server owns persisted release state and rollout
coordination.

The [Professy AWS pilot](../../deploy/professy-aws/README.md) includes a sample
target, namespace role, EC2 Kafka configuration, and the two deployment profiles.

[Docker Buildx reference](https://docs.docker.com/reference/cli/docker/buildx/build/) · [Load a Docker image archive](https://docs.docker.com/reference/cli/docker/image/load/) · [GitHub App permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)
