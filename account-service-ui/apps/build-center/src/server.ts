import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { readWorkspace, updateWorkspace } from './build-store';
import { isActive, permittedRepository, queueBuild, readBuildLog, resolveArchive, runnerStatus } from './runner';
import { isBuildInProgress, recipeLabels } from './models';
import type { BuildRun, Pipeline, PipelineSettings } from './models';
import { setting } from './server-config';
import { allowedOrgId, connectedGitHub, githubRequest, installationToken, manualConnection } from './github';
import { installUrl, registerGitHubSetup } from './github-setup';
import { registerDeployments } from './deployment-api';
import { eksAccounts } from './eks';

interface GitHubRepo {
  id: number;
  full_name: string;
  html_url: string;
  default_branch: string;
  private: boolean;
}

const app = express();
const angularApp = new AngularNodeAppEngine({ allowedHosts: ['localhost', '127.0.0.1'] });
const downloads = new Map<string, { orgId: string; archive: string; expiresAt: number }>();
const workspaceApi = setting('BUILD_CENTER_WORKSPACE_API') || 'http://127.0.0.1:8080';

const api = express.Router();
api.use(express.json({ limit: '80kb' }));
api.use(async (request, response, next) => {
  response.setHeader('Cache-Control', 'no-store');
  const authorization = request.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    response.status(401).json({ message: 'Sign in with Passport to continue.' });
    return;
  }

  try {
    const access = await fetch(new URL('/api/session/access', workspaceApi), {
      headers: { Authorization: authorization },
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    });
    if (access.status === 401 || access.status === 403) {
      response.status(401).json({ message: 'Sign in with Passport to continue.' });
      return;
    }
    if (!access.ok) throw new Error(`Workspace session check failed (${access.status})`);
    const { user, isAdmin } = await access.json() as { user?: { id?: number | string; orgId?: number | string }; isAdmin?: boolean };
    const orgId = String(user?.orgId ?? '');
    if (!/^\d+$/.test(orgId) || (allowedOrgId && orgId !== allowedOrgId)) {
      response.status(403).json({ message: 'Build Center is unavailable for this workspace.' });
      return;
    }
    response.locals['orgId'] = orgId;
    response.locals['isAdmin'] = isAdmin === true;
    response.locals['userId'] = user?.id == null ? '' : String(user.id);
    next();
  } catch {
    response.status(502).json({ message: 'Could not verify your workspace session.' });
  }
});

registerGitHubSetup(app, api);
registerDeployments(api);

api.get('/provider', async (_request, response) => {
  const runner = await runnerStatus();
  const orgId = response.locals['orgId'] as string;
  const canManage = response.locals['isAdmin'] === true;
  const { githubApp } = readWorkspace(orgId);
  const connected = connectedGitHub(orgId);
  const manual = githubApp ? undefined : manualConnection(orgId);
  const slug = (githubApp ?? manual)?.slug;
  response.json({
    canManage,
    connected: Boolean(connected),
    account: githubApp?.account,
    installationId: connected?.installationId,
    manualAvailable: Boolean(manual),
    installUrl: canManage && githubApp && !connected ? installUrl(githubApp) : undefined,
    appUrl: slug ? `https://github.com/apps/${encodeURIComponent(slug)}` : undefined,
    runnerConfigured: runner.ready,
    runnerMessage: runner.message,
    webhookConfigured: Boolean(connected?.webhookSecret),
  });
});

// Support workspaces already using administrator-provided credentials.
api.post('/provider/connect', async (_request, response) => {
  if (!response.locals['isAdmin']) {
    response.status(403).json({ message: 'A workspace administrator must connect the provider.' });
    return;
  }
  const orgId = response.locals['orgId'] as string;
  const connection = manualConnection(orgId);
  if (!connection || readWorkspace(orgId).githubApp) {
    response.status(409).json({ message: 'Use Connect GitHub in Settings to finish the connection.' });
    return;
  }
  try {
    await installationToken(connection);
    updateWorkspace(orgId, state => { state.providerConnected = true; });
    response.sendStatus(204);
  } catch {
    response.status(502).json({ message: 'GitHub did not accept the configured App installation.' });
  }
});

api.get('/provider/repos', async (_request, response) => {
  const connection = connectedGitHub(response.locals['orgId']);
  if (!connection) {
    response.status(409).json({ message: 'Connect the GitHub provider in Settings first.' });
    return;
  }
  try {
    const token = await installationToken(connection);
    const repositories: GitHubRepo[] = [];
    for (let page = 1; ; page++) {
      const result = await githubRequest(`/installation/repositories?per_page=100&page=${page}`, token);
      if (!result.ok) throw new Error(`Repository listing failed (${result.status})`);
      const data = await result.json() as { repositories: GitHubRepo[] };
      repositories.push(...data.repositories);
      if (!result.headers.get('Link')?.includes('rel="next"')) break;
    }
    response.json({ repositories: repositories.map(repo => ({
      id: repo.id,
      fullName: repo.full_name,
      url: repo.html_url,
      defaultBranch: repo.default_branch,
      isPrivate: repo.private,
    })) });
  } catch {
    response.status(502).json({ message: 'Repository import failed. Check workspace access and the GitHub App installation.' });
  }
});

function parsePipeline(body: Partial<PipelineSettings> | undefined): PipelineSettings | null {
  const name = body?.name?.trim();
  const repositoryUrl = body?.repositoryUrl?.trim().replace(/(?:\.git)?\/$|\.git$/, '');
  const branch = body?.branch?.trim();
  const environment = body?.environment?.trim();
  const imageName = body?.imageName?.trim();
  const artifactPath = body?.artifactPath?.trim();
  const awsConnectionId = body?.awsConnectionId?.trim();
  const dockerfile = body?.dockerfile?.trim();
  const context = body?.context?.trim();
  if (!name || name.length > 100 || !environment || !/^[\w-]{1,50}$/.test(environment)) return null;
  if (!repositoryUrl || !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(repositoryUrl)) return null;
  if (!branch || !/^[A-Za-z0-9_][A-Za-z0-9_./-]{0,200}$/.test(branch) || branch.includes('..') ||
      branch.split('/').some(part => !part || part.startsWith('.') || part.endsWith('.lock')) || branch.endsWith('.')) return null;
  const validPath = (value: string | undefined) =>
    Boolean(value && value.length <= 180 && /^[a-z0-9]+(?:[._/-][a-z0-9]+)*$/.test(value));
  if (!imageName || !validPath(imageName) || !artifactPath || !validPath(artifactPath)) return null;
  if (awsConnectionId && (awsConnectionId.length > 100 || !/^[a-zA-Z0-9-]+$/.test(awsConnectionId))) return null;
  const relative = (path: string | undefined) => path && /^[\w./-]{1,200}$/.test(path) &&
    !path.startsWith('/') && !path.split('/').includes('..');
  if (!dockerfile || !relative(dockerfile) || !context || !relative(context)) return null;
  const args = body?.buildArgs ?? {};
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
  const entries = Object.entries(args);
  if (entries.length > 30 || entries.some(([key, value]) =>
    !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key) || typeof value !== 'string' || value.length > 512)) return null;
  if (body?.trigger && body.trigger !== 'manual' && body.trigger !== 'push') return null;
  if (body?.recipe && (typeof body.recipe !== 'string' || !Object.hasOwn(recipeLabels, body.recipe))) return null;
  if (body?.platform && body.platform !== 'linux/amd64' && body.platform !== 'linux/arm64') return null;
  return { name, repositoryUrl, branch, environment, imageName, artifactPath, dockerfile, context,
    recipe: body?.recipe || 'repository',
    platform: body?.platform || undefined,
    trigger: body?.trigger || 'manual',
    buildArgs: Object.fromEntries(entries), awsConnectionId: awsConnectionId || undefined };
}

api.get('/pipelines', (_request, response) => {
  response.json({ pipelines: readWorkspace(response.locals['orgId']).pipelines });
});

function getPipelineSettings(input: Record<string, unknown> | undefined): PipelineSettings | null {
  const fields = ['name', 'repositoryUrl', 'branch', 'environment', 'dockerfile', 'context', 'imageName', 'artifactPath'];
  return fields.every(key => typeof input?.[key] === 'string') ? parsePipeline(input as Partial<PipelineSettings>) : null;
}

api.post('/pipelines', (request, response) => {
  const settings = getPipelineSettings(request.body);
  if (!settings) {
    response.status(400).json({ message: 'Check the repository, branch, environment, paths, and image name.' });
    return;
  }
  if (settings.awsConnectionId && !eksAccounts(response.locals['orgId']).some(account => account.id === settings.awsConnectionId)) {
    response.status(400).json({ message: 'Choose an AWS connection available to this workspace.' });
    return;
  }
  const pipeline: Pipeline = { ...settings, id: randomUUID(), createdAt: new Date().toISOString() };
  updateWorkspace(response.locals['orgId'], state => { state.pipelines.unshift(pipeline); });
  response.status(201).json(pipeline);
});

api.put('/pipelines/:id', (request, response) => {
  const orgId = response.locals['orgId'] as string;
  const settings = getPipelineSettings(request.body);
  if (!settings) {
    response.status(400).json({ message: 'Check the repository, branch, environment, paths, and image name.' });
    return;
  }
  if (settings.awsConnectionId && !eksAccounts(orgId).some(account => account.id === settings.awsConnectionId)) {
    response.status(400).json({ message: 'Choose an AWS connection available to this workspace.' });
    return;
  }
  const previous = readWorkspace(orgId).pipelines.find(pipeline => pipeline.id === request.params.id);
  if (!previous) {
    response.sendStatus(404);
    return;
  }
  const pipeline = { ...previous, ...settings };
  updateWorkspace(orgId, state => {
    state.pipelines = state.pipelines.map(item => item.id === pipeline.id ? pipeline : item);
  });
  response.json(pipeline);
});

function currentRun(run: BuildRun): BuildRun {
  if (!isBuildInProgress(run.status) || isActive(run.id)) return run;
  return { ...run, status: 'failed', message: 'The runner stopped before this build completed.' };
}

api.get('/runs', (_request, response) => {
  response.json({ runs: readWorkspace(response.locals['orgId']).runs.map(currentRun) });
});

api.get('/pipelines/:id/runs', (request, response) => {
  const orgId = response.locals['orgId'] as string;
  const state = readWorkspace(orgId);
  if (!state.pipelines.some(pipeline => pipeline.id === request.params.id)) {
    response.sendStatus(404);
    return;
  }
  const runs = state.runs.filter(run => run.pipelineId === request.params.id).map(currentRun);
  response.json({ runs });
});

api.get('/pipelines/:id/runs/:runId/log', async (request, response) => {
  const orgId = response.locals['orgId'] as string;
  const run = readWorkspace(orgId).runs.find(item =>
    item.pipelineId === request.params.id && item.id === request.params.runId);
  if (!run) {
    response.sendStatus(404);
    return;
  }
  response.json({ log: await readBuildLog(orgId, run.id) });
});

api.post('/pipelines/:id/runs/:runId/download', async (request, response) => {
  const orgId = response.locals['orgId'] as string;
  const run = readWorkspace(orgId).runs.find(item =>
    item.pipelineId === request.params.id && item.id === request.params.runId);
  if (!run?.artifact?.path) {
    response.status(404).json({ message: 'This build has no image archive.' });
    return;
  }
  try {
    await resolveArchive(orgId, run.artifact.path);
  } catch {
    response.status(404).json({ message: 'This image archive is no longer available on the runner.' });
    return;
  }
  const now = Date.now();
  for (const [key, lease] of downloads) if (lease.expiresAt <= now) downloads.delete(key);
  const key = randomUUID();
  downloads.set(key, { orgId, archive: run.artifact.path, expiresAt: now + 60_000 });
  response.json({ url: `/api/build-center/download/${key}` });
});

app.get('/api/build-center/download/:key', async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  const lease = downloads.get(request.params.key);
  downloads.delete(request.params.key);
  if (!lease || lease.expiresAt <= Date.now()) {
    response.status(404).json({ message: 'Download link expired. Request a new download in Build Center.' });
    return;
  }
  let archive: string;
  try {
    archive = await resolveArchive(lease.orgId, lease.archive);
  } catch {
    response.status(404).json({ message: 'This image archive is no longer available on the runner.' });
    return;
  }
  // Scope Express to the verified directory so hidden storage parents do not block the transfer.
  const filename = basename(archive);
  response.download(filename, filename, { root: dirname(archive) }, error => {
    if (!error || response.destroyed) return;
    if (response.headersSent) {
      response.destroy();
      return;
    }
    response.removeHeader('Content-Disposition');
    const status = 'status' in error && typeof error.status === 'number' ? error.status : 500;
    response.status(status).json({ message: 'Could not transfer this image archive.' });
  });
});

function newRun(pipeline: Pipeline, existingRuns: BuildRun[], requestedCommit?: string): BuildRun {
  const id = randomUUID();
  const highestMinor = existingRuns.filter(run => run.pipelineId === pipeline.id)
    .map(run => /^v1\.(\d+)$/.exec(run.version ?? '')).filter((match): match is RegExpExecArray => Boolean(match))
    .reduce((max, match) => Math.max(max, Number(match[1])), -1);
  return {
    id, pipelineId: pipeline.id, startedAt: new Date().toISOString(), status: 'queued',
    branch: pipeline.branch, environment: pipeline.environment, imageName: pipeline.imageName,
    tag: `build-${id}`, version: `v1.${highestMinor + 1}`, trigger: requestedCommit ? 'push' : 'manual', requestedCommit,
  };
}

function launchRun(orgId: string, pipeline: Pipeline, run: BuildRun): void {
  queueBuild(orgId, pipeline, run, () => {
    const connection = connectedGitHub(orgId);
    if (!connection) throw new Error('Connect GitHub from Settings to run this build.');
    return installationToken(connection);
  }, updated => {
    updateWorkspace(orgId, state => {
      state.runs = state.runs.map(item => item.id === updated.id ? updated : item);
    });
  });
}

api.post('/pipelines/:id/runs', async (request, response) => {
  const orgId = response.locals['orgId'] as string;
  if (!connectedGitHub(orgId)) {
    response.status(409).json({ message: 'Connect GitHub in Settings first.' });
    return;
  }
  const runner = await runnerStatus();
  if (!runner.ready) {
    response.status(503).json({ message: runner.message });
    return;
  }
  const pipeline = readWorkspace(orgId).pipelines.find(item => item.id === request.params.id);
  if (!pipeline) {
    response.sendStatus(404);
    return;
  }
  if (!permittedRepository(pipeline)) {
    response.status(403).json({ message: 'This repository is outside the runner allowlist.' });
    return;
  }
  const run = newRun(pipeline, readWorkspace(orgId).runs);
  updateWorkspace(orgId, state => { state.runs.unshift(run); });
  launchRun(orgId, pipeline, run);
  response.status(202).json(run);
});

api.post('/runs', async (request, response) => {
  const orgId = response.locals['orgId'] as string;
  const ids = request.body?.pipelineIds as unknown;
  if (!Array.isArray(ids) || !ids.length || ids.length > 50 || ids.some(id => typeof id !== 'string')) {
    response.status(400).json({ message: 'Select between 1 and 50 pipelines.' });
    return;
  }
  if (!connectedGitHub(orgId)) {
    response.status(409).json({ message: 'Connect GitHub in Settings first.' });
    return;
  }
  const runner = await runnerStatus();
  if (!runner.ready) {
    response.status(503).json({ message: runner.message });
    return;
  }
  const state = readWorkspace(orgId);
  const pipelines = [...new Set<string>(ids)].map(id => state.pipelines.find(pipeline => pipeline.id === id));
  if (pipelines.some(pipeline => !pipeline)) {
    response.status(404).json({ message: 'One or more selected pipelines were not found.' });
    return;
  }
  const selected = pipelines.filter((pipeline): pipeline is Pipeline => Boolean(pipeline));
  const blocked = selected.filter(pipeline => !permittedRepository(pipeline));
  if (blocked.length) {
    response.status(403).json({ message: `The runner does not allow these repositories: ${blocked.map(pipeline => pipeline.name).join(', ')}` });
    return;
  }
  const jobs = selected.filter(pipeline => !state.runs.some(run => run.pipelineId === pipeline.id && isActive(run.id)))
    .map(pipeline => ({ pipeline, run: newRun(pipeline, state.runs) }));
  const runs = jobs.map(job => job.run);
  if (runs.length) {
    updateWorkspace(orgId, workspace => { workspace.runs.unshift(...runs); });
    for (const { pipeline, run } of jobs) launchRun(orgId, pipeline, run);
  }
  response.status(202).json({ runs, skipped: selected.length - jobs.length });
});

app.post([
  '/api/build-center/webhooks/github', '/api/build-center/webhooks/github/:orgId',
], express.raw({ type: 'application/json', limit: '2mb' }), async (request, response) => {
  const workspace = request.params['orgId'];
  const orgId = typeof workspace === 'string' ? workspace : allowedOrgId;
  const connection = orgId && /^\d+$/.test(orgId) ? connectedGitHub(orgId) : undefined;
  if (!orgId || !connection?.webhookSecret) {
    response.sendStatus(404);
    return;
  }
  const body: unknown = request.body;
  if (!Buffer.isBuffer(body)) {
    response.sendStatus(415);
    return;
  }
  const header = request.get('X-Hub-Signature-256') || '';
  const expected = `sha256=${createHmac('sha256', connection.webhookSecret).update(body).digest('hex')}`;
  const signature = Buffer.from(header);
  if (signature.length !== expected.length || !timingSafeEqual(signature, Buffer.from(expected))) {
    response.sendStatus(401);
    return;
  }
  if (request.get('X-GitHub-Event') !== 'push') {
    response.sendStatus(204);
    return;
  }
  const push = JSON.parse(body.toString('utf8')) as {
    ref?: string; after?: string; deleted?: boolean; installation?: { id?: number }; repository?: { full_name?: string };
  };
  const repo = push.repository?.full_name?.toLowerCase();
  const commit = push.after;
  if (String(push.installation?.id) !== connection.installationId || push.deleted || !repo || !commit ||
      !/^[0-9a-f]{40}$/.test(commit) || /^0+$/.test(commit)) {
    response.sendStatus(204);
    return;
  }

  if (!(await runnerStatus()).ready) {
    response.sendStatus(503);
    return;
  }

  const entries = updateWorkspace(orgId, state => {
    const pipelines = state.pipelines.filter(pipeline => pipeline.trigger === 'push' &&
      push.ref === `refs/heads/${pipeline.branch}` &&
      new URL(pipeline.repositoryUrl).pathname.slice(1).toLowerCase() === repo &&
      permittedRepository(pipeline) &&
      !state.runs.some(run => run.pipelineId === pipeline.id && run.requestedCommit === commit));
    return pipelines.map(pipeline => {
      const run = newRun(pipeline, state.runs, commit);
      state.runs.unshift(run);
      return { pipeline, run };
    });
  });
  response.sendStatus(entries.length ? 202 : 204);
  for (const { pipeline, run } of entries) launchRun(orgId, pipeline, run);
});

app.use('/api/build-center', api);

app.use(express.static(join(import.meta.dirname, '../browser'), { maxAge: '1y', index: false, redirect: false }));
app.use((request, response, next) => {
  angularApp.handle(request).then(result => {
    if (result) return writeResponseToNodeResponse(result, response);
    return next();
  }).catch(next);
});

if (isMainModule(import.meta.url)) {
  const port = Number(process.env['PORT'] || 4212);
  app.listen(port, '127.0.0.1', () => console.log(`Build Center listening on 127.0.0.1:${port}`));
}

export const reqHandler = createNodeRequestHandler(app);
