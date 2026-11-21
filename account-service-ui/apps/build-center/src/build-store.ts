import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { BuildRun, DeploymentProfile, DeploymentRelease, EksConnection, EksProvision, Pipeline } from './models';
import type { EksAccount } from './eks';
import { setting } from './server-config';

export interface RegisteredGitHubApp {
  appId: string;
  slug: string;
  pem: string;
  ownerId: number;
  account: string;
  accountType: 'User' | 'Organization';
  installationId?: string;
  webhookSecret?: string;
}

interface WorkspaceState {
  providerConnected: boolean;
  githubApp?: RegisteredGitHubApp;
  pipelines: Pipeline[];
  runs: BuildRun[];
  releases: DeploymentRelease[];
  deploymentProfiles: DeploymentProfile[];
  eksConnections: EksConnection[];
  eksProvisions: EksProvision[];
  awsAccounts: EksAccount[];
}

const file = setting('BUILD_CENTER_DATA_FILE') || join(homedir(), '.greatley-build-center', 'state.json');

function read(): Record<string, WorkspaceState> {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, WorkspaceState>;
    for (const workspace of Object.values(data)) {
      workspace.runs ??= [];
      workspace.releases ??= [];
      workspace.deploymentProfiles ??= [];
      workspace.eksConnections ??= [];
      workspace.eksProvisions ??= [];
      workspace.awsAccounts ??= [];
      workspace.pipelines = workspace.pipelines.map(pipeline => {
        const { imageRepository, ...fields } = pipeline as Pipeline & { imageRepository?: string };
        return {
          ...fields,
          imageName: fields.imageName ?? imageRepository?.split('/').at(-1) ?? 'application',
          artifactPath: fields.artifactPath ?? imageRepository ?? 'images',
        };
      });
      const versions = new Map<string, number>();
      for (const run of [...workspace.runs].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))) {
        const next = versions.get(run.pipelineId) ?? 0;
        const current = /^v1\.(\d+)$/.exec(run.version ?? '');
        if (!current) run.version = `v1.${next}`;
        const actual = /^v1\.(\d+)$/.exec(run.version ?? '');
        versions.set(run.pipelineId, Math.max(next, actual ? Number(actual[1]) + 1 : next + 1));
      }
    }
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return {};
  }
}

function empty(): WorkspaceState {
  return { providerConnected: false, pipelines: [], runs: [], releases: [], deploymentProfiles: [], eksConnections: [],
    eksProvisions: [], awsAccounts: [] };
}

export function readWorkspace(orgId: string): WorkspaceState {
  return read()[orgId] ?? empty();
}

export function updateWorkspace<T>(orgId: string, update: (state: WorkspaceState) => T): T {
  const all = read();
  const result = update(all[orgId] ??= empty());
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.tmp`;
  writeFileSync(temp, JSON.stringify(all), { mode: 0o600 });
  renameSync(temp, file);
  return result;
}
