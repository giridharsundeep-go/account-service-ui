import { randomBytes } from 'node:crypto';
import type { Express, Request, Response, Router } from 'express';
import { readWorkspace, updateWorkspace, type RegisteredGitHubApp } from './build-store';
import { githubRequest, ownedInstallation, validatePrivateKey } from './github';
import { setting } from './server-config';

const setupCookie = 'gp_build_github_setup';
const setupAge = 30 * 60 * 1000;
const flows = new Map<string, {
  state: string;
  orgId: string;
  userId: string;
  orgLogin?: string;
  expiresAt: number;
  secure: boolean;
  webhook: boolean;
  code?: string;
}>();
const finishing = new Set<string>();
const githubLogin = /^[a-z\d](?:[a-z\d-]{0,38})$/i;
const apiPath = '/api/build-center';
const configuredOrigin = setting('BUILD_CENTER_PUBLIC_ORIGIN');

function sameOrigin(request: Request): URL | undefined {
  try {
    const origin = request.get('Origin');
    if (!origin) return;
    const url = new URL(origin);
    if (configuredOrigin) {
      const configured = new URL(configuredOrigin);
      if (url.origin === configured.origin && configured.protocol === 'https:') return configured;
    } else if (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname) &&
        url.port === (process.env['PORT'] || '4212')) {
      return url;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function cookie(request: Request): string {
  return request.get('Cookie')?.match(/(?:^|;\s*)gp_build_github_setup=([\w-]+)(?:;|$)/)?.[1] || '';
}

function requireAdmin(response: Response): boolean {
  if (response.locals['isAdmin'] === true && response.locals['userId']) return true;
  response.status(403).json({ message: 'A workspace administrator can connect GitHub.' });
  return false;
}

export function installUrl(app: RegisteredGitHubApp): string {
  return `https://github.com/apps/${encodeURIComponent(app.slug)}/installations/new`;
}

export function registerGitHubSetup(app: Express, api: Router): void {
  api.post('/provider/github/begin', (request, response) => {
    if (!requireAdmin(response)) return;
    const origin = sameOrigin(request);
    if (!origin) {
      response.status(400).json({ message: 'Open Build Center on localhost or its configured HTTPS address to connect GitHub.' });
      return;
    }
    const { orgId, userId } = response.locals;
    const existing = readWorkspace(orgId).githubApp;
    if (existing || finishing.has(orgId)) {
      response.status(409).json({ message: 'A GitHub App is already registered or being verified for this workspace. Refresh Settings to continue.' });
      return;
    }

    const { accountType, organization } = request.body ?? {};
    const orgLogin = accountType === 'organization' && typeof organization === 'string' ? organization.trim() : undefined;
    if (accountType !== 'personal' && (!orgLogin || !githubLogin.test(orgLogin))) {
      response.status(400).json({ message: 'Enter the GitHub organization’s account name.' });
      return;
    }

    const now = Date.now();
    for (const [key, flow] of flows) {
      if (flow.expiresAt <= now || flow.orgId === orgId) flows.delete(key);
    }
    const browserKey = randomBytes(32).toString('base64url');
    const state = randomBytes(32).toString('base64url');
    const secure = origin.protocol === 'https:';
    const webhook = secure && setting('BUILD_CENTER_GITHUB_WEBHOOKS') === 'true';
    flows.set(browserKey, { state, orgId, userId, orgLogin, secure, webhook, expiresAt: now + setupAge });
    response.cookie(setupCookie, browserKey, { httpOnly: true, sameSite: 'lax', secure, path: apiPath, maxAge: setupAge });

    const action = new URL(orgLogin
      ? `https://github.com/organizations/${encodeURIComponent(orgLogin)}/settings/apps/new`
      : 'https://github.com/settings/apps/new');
    action.searchParams.set('state', state);
    response.json({
      action: action.href,
      manifest: {
        name: `Build Center ${randomBytes(4).toString('hex')}`,
        url: new URL('/', origin).href,
        description: 'Build Docker image archives from selected repositories.',
        redirect_url: new URL(`${apiPath}/github/registered`, origin).href,
        setup_url: new URL(`${apiPath}/github/installed`, origin).href,
        setup_on_update: true,
        public: false,
        default_permissions: { contents: 'read', metadata: 'read' },
        ...(webhook ? {
          hook_attributes: { url: new URL(`${apiPath}/webhooks/github/${orgId}`, origin).href, active: true },
          default_events: ['push'],
        } : {}),
      },
    });
  });

  app.get(`${apiPath}/github/registered`, (request, response) => {
    response.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    const flow = flows.get(cookie(request));
    const { code, state } = request.query;
    if (!flow || flow.state !== state || flow.expiresAt <= Date.now() || flow.code ||
        typeof code !== 'string' || !/^[a-z\d_-]{1,200}$/i.test(code)) {
      response.redirect(303, '/?view=settings&github=expired');
      return;
    }
    flow.code = code;
    response.redirect(303, '/?view=settings&github=registered');
  });

  api.post('/provider/github/complete', async (request, response) => {
    if (!requireAdmin(response)) return;
    const browserKey = cookie(request);
    const flow = flows.get(browserKey);
    const { orgId, userId } = response.locals;
    if (!flow?.code || flow.expiresAt <= Date.now() || flow.orgId !== orgId || flow.userId !== userId) {
      response.status(400).json({ message: 'GitHub setup expired. Start again from Settings.' });
      return;
    }
    if (finishing.has(orgId) || readWorkspace(orgId).githubApp) {
      response.status(409).json({ message: 'This workspace already has a GitHub App in setup. Reload Settings.' });
      return;
    }
    flows.delete(browserKey);
    finishing.add(orgId);
    response.clearCookie(setupCookie, { httpOnly: true, sameSite: 'lax', secure: flow.secure, path: apiPath });
    try {
      const result = await githubRequest(`/app-manifests/${encodeURIComponent(flow.code)}/conversions`, undefined, { method: 'POST' });
      if (!result.ok) throw new Error('GitHub rejected the registration code.');
      const details = await result.json() as {
        id: number;
        slug: string;
        pem: string;
        webhook_secret?: string;
        owner?: { id: number; login: string; type: string };
      };
      const { owner } = details;
      if (!Number.isSafeInteger(details.id) || details.id <= 0 || !/^[a-z\d][a-z\d-]+$/.test(details.slug) ||
          !owner || !Number.isSafeInteger(owner.id) || owner.id <= 0 || !githubLogin.test(owner.login) ||
          (flow.orgLogin ? owner.type !== 'Organization' ||
            owner.login.toLowerCase() !== flow.orgLogin.toLowerCase() : owner.type !== 'User')) {
        throw new Error('The GitHub App was not registered for the selected account.');
      }
      validatePrivateKey(details.pem);
      const registered: RegisteredGitHubApp = {
        appId: String(details.id), slug: details.slug, pem: details.pem,
        ownerId: owner.id, account: owner.login, accountType: flow.orgLogin ? 'Organization' : 'User',
        webhookSecret: flow.webhook ? details.webhook_secret : undefined,
      };
      updateWorkspace(orgId, workspace => { workspace.githubApp = registered; });
      response.json({ installUrl: installUrl(registered) });
    } catch {
      response.status(502).json({ message: 'Build Center could not finish GitHub registration. Check the app in GitHub settings before retrying.' });
    } finally {
      finishing.delete(orgId);
    }
  });

  app.get(`${apiPath}/github/installed`, (_request, response) => {
    // The callback's installation ID is not trusted. Settings verifies with GitHub separately.
    response.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    response.redirect(303, '/?view=settings&github=installed');
  });

  api.post('/provider/github/check', async (_request, response) => {
    if (!requireAdmin(response)) return;
    const orgId = response.locals['orgId'];
    const registered = readWorkspace(orgId).githubApp;
    if (!registered) {
      response.status(409).json({ message: 'Start by registering the GitHub App from Settings.' });
      return;
    }
    try {
      const installation = await ownedInstallation(registered);
      updateWorkspace(orgId, workspace => {
        if (workspace.githubApp?.appId === registered.appId) {
          workspace.githubApp.installationId = installation ? String(installation.id) : undefined;
        }
      });
      response.json({ connected: !!installation });
    } catch {
      response.status(502).json({ message: 'Build Center could not verify the GitHub installation. Try again from Settings.' });
    }
  });
}
