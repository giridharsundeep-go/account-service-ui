import { createPrivateKey, createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readWorkspace, type RegisteredGitHubApp } from './build-store';
import { privateKeyPath, setting } from './server-config';

export interface GitHubConnection {
  appId: string;
  pem: string;
  slug?: string;
  account?: string;
  installationId: string;
  webhookSecret?: string;
}

export interface GitHubInstallation {
  id: number;
  app_id: number;
  suspended_at?: string;
  account: { id: number; login: string };
}

const workspaceOrgId = setting('BUILD_CENTER_WORKSPACE_ORG_ID');
export const allowedOrgId = workspaceOrgId && /^\d+$/.test(workspaceOrgId) ? workspaceOrgId : undefined;

export function validatePrivateKey(pem: string): void {
  if (createPrivateKey(pem).asymmetricKeyType !== 'rsa') throw new Error('GitHub App keys must be RSA.');
}

function loadManualConnection(): GitHubConnection | undefined {
  const appId = setting('GITHUB_APP_ID');
  const installationId = setting('GITHUB_APP_INSTALLATION_ID');
  if (!allowedOrgId || !appId || !installationId || !/^\d+$/.test(appId) || !/^\d+$/.test(installationId)) return;
  const keyFile = setting('GITHUB_APP_PRIVATE_KEY_FILE');
  const inlineKey = setting('GITHUB_APP_PRIVATE_KEY');
  try {
    const pem = inlineKey?.replace(/\\n/g, '\n') ?? (keyFile ? readFileSync(privateKeyPath(keyFile), 'utf8') : '');
    validatePrivateKey(pem);
    return { appId, installationId, pem, slug: setting('GITHUB_APP_SLUG'), webhookSecret: setting('GITHUB_APP_WEBHOOK_SECRET') };
  } catch {
    return undefined;
  }
}

const manual = loadManualConnection();

export function manualConnection(orgId: string): GitHubConnection | undefined {
  return orgId === allowedOrgId ? manual : undefined;
}

export function connectedGitHub(orgId: string): GitHubConnection | undefined {
  const state = readWorkspace(orgId);
  if (state.githubApp) {
    const { installationId, ...app } = state.githubApp;
    return installationId ? { ...app, installationId } : undefined;
  }
  return state.providerConnected ? manualConnection(orgId) : undefined;
}

export function githubRequest(path: string, token?: string, options?: RequestInit): Promise<Response> {
  return fetch(new URL(path, 'https://api.github.com'), {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-GitHub-Api-Version': '2026-03-10',
      'User-Agent': 'Greatley-Poshley-Build-Center',
      ...options?.headers,
    },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
}

function appToken(app: Pick<GitHubConnection, 'appId' | 'pem'>): string {
  const encode = (data: object) => Buffer.from(JSON.stringify(data)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const claims = encode({ iat: now - 30, exp: now + 540, iss: app.appId });
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${claims}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(app.pem, 'base64url');
  return `${unsigned}.${signature}`;
}

export async function ownedInstallation(app: RegisteredGitHubApp): Promise<GitHubInstallation | undefined> {
  const accountType = app.accountType === 'Organization' ? 'orgs' : 'users';
  const result = await githubRequest(`/${accountType}/${encodeURIComponent(app.account)}/installation`, appToken(app));
  if (result.status === 404) return undefined;
  if (!result.ok) throw new Error('Could not check the GitHub App installation.');
  const value = await result.json() as GitHubInstallation;
  if (String(value.app_id) !== app.appId || value.account?.id !== app.ownerId ||
      !Number.isSafeInteger(value.id) || value.id <= 0 || value.suspended_at) return undefined;
  return value;
}

export async function installationToken(connection: GitHubConnection): Promise<string> {
  const response = await githubRequest(`/app/installations/${connection.installationId}/access_tokens`, appToken(connection), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { metadata: 'read', contents: 'read' } }),
  });
  if (!response.ok) throw new Error(`Installation token request failed (${response.status})`);
  const data = await response.json() as { token: string };
  if (!data.token) throw new Error('GitHub did not return an installation token.');
  return data.token;
}
