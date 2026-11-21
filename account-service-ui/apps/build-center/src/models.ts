export const recipeLabels = {
  repository: 'Repository Dockerfile',
  'gradle-mirror': 'Gradle with Maven mirror',
  'angular-static': 'Angular static site',
  'angular-ssr': 'Angular server',
  'agent-runtime': 'Python agent runtime',
} as const;

export type BuildRecipe = keyof typeof recipeLabels;
export type BuildPlatform = 'linux/amd64' | 'linux/arm64';

export interface PipelineSettings {
  name: string;
  repositoryUrl: string;
  branch: string;
  environment: string;
  dockerfile: string;
  recipe?: BuildRecipe;
  platform?: BuildPlatform;
  context: string;
  imageName: string;
  artifactPath: string;
  awsConnectionId?: string;
  buildArgs: Record<string, string>;
  trigger?: 'manual' | 'push';
}

export interface Pipeline extends PipelineSettings {
  id: string;
  createdAt: string;
}

export interface BuildRun {
  id: string;
  pipelineId: string;
  startedAt: string;
  finishedAt?: string;
  status: 'starting' | 'queued' | 'running' | 'succeeded' | 'failed' | 'stopped';
  branch: string;
  environment: string;
  imageName: string;
  tag: string;
  /** Monotonically increasing release label within a pipeline (v1.0, v1.1, ...). */
  version?: string;
  trigger?: 'manual' | 'push';
  requestedCommit?: string;
  commit?: string;
  dockerfileEnv?: string[];
  message?: string;
  artifact?: { image: string; path: string; sha256: string; sizeBytes: number };
}

export function isBuildInProgress(status: BuildRun['status']): boolean {
  return status === 'starting' || status === 'queued' || status === 'running';
}

export interface ProviderStatus {
  connected: boolean;
  canManage: boolean;
  manualAvailable: boolean;
  account?: string;
  installationId?: string;
  appUrl?: string;
  installUrl?: string;
  runnerConfigured: boolean;
  webhookConfigured: boolean;
  runnerMessage: string;
}

export interface SourceRepository {
  id: number;
  fullName: string;
  url: string;
  defaultBranch: string;
  isPrivate: boolean;
}

export interface DeploymentTarget {
  id: string;
  name: string;
  namespace: string;
  platform: BuildPlatform;
  domain?: string;
  ingressClass?: string;
  eks?: { cluster: string; region: string };
  registries?: ImageRegistry[];
}

export type ImageRegistry = 'ecr' | 'configured';

export interface EksAccountOption {
  id: string;
  name: string;
  regions: string[];
  namespaces: string[];
  provisioning?: boolean;
  hasCredentials?: boolean;
}

export interface EksConnection {
  id: string;
  accountId: string;
  cluster: string;
  arn: string;
  createdAt: number;
  region: string;
  namespace: string;
  platform: BuildPlatform;
  deploymentRoleArn?: string;
}

export interface EksSubnet {
  id: string;
  vpc: string;
  zone: string;
  zoneId: string;
  name?: string;
}

export interface EksProvisionSettings {
  accountId: string;
  region: string;
  cluster: string;
  namespace: string;
  kubernetesVersion: string;
  subnetIds: string[];
  publicAccessCidr?: string;
  nodeGroup: string;
  instanceType: string;
  capacityType: 'ON_DEMAND' | 'SPOT';
  minNodes: number;
  desiredNodes: number;
  maxNodes: number;
  diskGiB: number;
}

export interface EksProvision {
  id: string;
  settings: EksProvisionSettings;
  status: 'running' | 'paused' | 'ready' | 'failed';
  message: string;
  requestedAt: string;
  targetId?: string;
  workerGroupStatus?: string;
  workerGroupUpdateId?: string;
  workerGroupIssues?: { code: string; message: string; resourceIds: string[] }[];
  workerNodePolicyAttached?: boolean;
}

export type DeploymentScaling =
  | { mode: 'fixed'; replicas: number }
  | { mode: 'auto'; min: number; max: number; cpuPercent: number };

export interface DeploymentSettings {
  app: string;
  port: number;
  cpuMillicores: number;
  memoryMiB: number;
  readinessPath?: string;
  configMap?: string;
  secret?: string;
  serviceAccount?: string;
  nodeName?: string;
  runtimeEnv?: Record<string, string>;
  secretNames?: string[];
  publicHostname: boolean;
  publicSubdomain?: string;
  publicLoadBalancer?: boolean;
  publicCustomHostname?: string;
  publicTlsCertificateArn?: string;
  imageRegistry?: ImageRegistry;
  scaling: DeploymentScaling;
}

export interface DeploymentProfile {
  targetId: string;
  pipelineId: string;
  settings: DeploymentSettings;
  workloadState?: 'running' | 'stopped';
  /** Returned to the authorized admin UI; persisted separately as encrypted data. */
  envContent?: string;
}

export interface DeploymentProgressEntry {
  at: string;
  message: string;
  percent?: number;
}

export interface DeploymentRelease {
  id: string;
  targetId: string;
  targetName: string;
  namespace: string;
  runId: string;
  pipelineId: string;
  settings: DeploymentSettings;
  requestedAt: string;
  finishedAt?: string;
  status: 'running' | 'succeeded' | 'failed';
  workloadState?: 'running' | 'stopped';
  message: string;
  progress?: DeploymentProgressEntry[];
  progressPercent?: number;
  version?: string;
  image?: string;
  hostname?: string;
  rollbackOf?: string;
}
