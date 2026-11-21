import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, chmod, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { managedDockerfile } from './build-recipes';
import { dockerfileEnvironmentNames } from './dockerfile-env';
import { publishEcrArchive } from './ecr';
import { eksAccounts } from './eks';
import type { BuildRun, Pipeline } from './models';
import { setting } from './server-config';

const exec = promisify(execFile);
const enabled = setting('BUILD_CENTER_RUNNER_ENABLED') === 'true';
const allowedRepositories = new Set((setting('BUILD_CENTER_ALLOWED_REPOSITORIES') || '')
  .split(',').map(value => value.trim().toLowerCase()).filter(Boolean));
const artifactRoot = resolve(setting('BUILD_CENTER_ARTIFACT_ROOT') || join(homedir(), '.greatley-build-center', 'artifacts'));
const dockerSettings = ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG',
  'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH', 'BUILDX_BUILDER'];
const environment: NodeJS.ProcessEnv = {
  PATH: process.env['PATH'],
  HOME: process.env['HOME'],
  LANG: process.env['LANG'],
  TMPDIR: process.env['TMPDIR'],
  ...Object.fromEntries(dockerSettings.map(name => [name, setting(name)])),
};
const logLimit = 256 * 1024;
const activeBuilds = new Set<string>();
const queuedBuilds: (() => Promise<void>)[] = [];
const concurrency = Math.max(1, Math.min(4, Number.parseInt(setting('BUILD_CENTER_RUNNER_CONCURRENCY') || '', 10) || 1));
let runningBuilds = 0;

export function permittedRepository(pipeline: Pipeline): boolean {
  return allowedRepositories.has(new URL(pipeline.repositoryUrl).pathname.slice(1).toLowerCase());
}

export async function runnerStatus(): Promise<{ ready: boolean; message: string }> {
  if (!enabled) {
    return { ready: false, message: 'The Docker runner is disabled. Set BUILD_CENTER_RUNNER_ENABLED=true on the Build Center server.' };
  }
  if (!allowedRepositories.size) {
    return { ready: false, message: 'Set BUILD_CENTER_ALLOWED_REPOSITORIES on the Build Center server to allow trusted source repositories.' };
  }
  const checks = [
    { command: 'git', args: ['--version'], message: 'Install Git on the Build Center host.' },
    { command: 'docker', args: ['--version'], message: 'Install the Docker CLI on the Build Center host.' },
    { command: 'docker', args: ['version', '--format', '{{.Server.Version}}'],
      message: 'Start the local Docker engine or check the runner’s Docker connection.' },
    { command: 'docker', args: ['buildx', 'inspect'],
      message: 'Install Docker Buildx or select a working Buildx builder.' },
  ];
  for (const check of checks) {
    try {
      await exec(check.command, check.args, { env: environment, timeout: 4_000 });
    } catch {
      return { ready: false, message: check.message };
    }
  }
  return { ready: true, message: 'The Docker engine and Buildx are ready.' };
}

function within(root: string, path: string): boolean {
  const relativePath = relative(root, path);
  return !isAbsolute(relativePath) && relativePath !== '..' && !relativePath.startsWith('..' + sep);
}

async function ensureDirectory(root: string, parts: string[]): Promise<string> {
  let current = root;
  for (const segment of parts) {
    const target = join(current, segment);
    await mkdir(target, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;
    });
    current = await realpath(target);
    if (current !== target || !within(root, current)) throw new Error('Unsafe artifact directory.');
  }
  return current;
}

async function workspaceDirectory(orgId: string): Promise<string> {
  await mkdir(artifactRoot, { recursive: true, mode: 0o700 });
  return ensureDirectory(await realpath(artifactRoot), [orgId]);
}

function logPath(workspace: string, runId: string): string {
  return join(workspace, '.logs', `${runId}.txt`);
}

export async function readBuildLog(orgId: string, runId: string): Promise<string> {
  try {
    return await readFile(logPath(await workspaceDirectory(orgId), runId), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
}

export async function resolveArchive(orgId: string, archive: string): Promise<string> {
  const root = await workspaceDirectory(orgId);
  const path = await realpath(resolve(root, archive));
  if (!within(root, path) || !path.endsWith('.tar') || !(await stat(path)).isFile()) throw new Error('Invalid archive path.');
  return path;
}

function command(file: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, timeout: number,
                 writeLog: (data: Buffer) => void): Promise<void> {
  return new Promise((success, failure) => {
    const child = spawn(file, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], signal: AbortSignal.timeout(timeout) });
    let processError: Error | undefined;
    child.stdout.on('data', writeLog);
    child.stderr.on('data', writeLog);
    child.once('error', error => { processError = error; });
    child.once('close', (code) => {
      if (processError) failure(processError);
      else if (code === 0) success();
      else failure(new Error(`${file} exited with code ${code ?? 'unknown'}.`));
    });
  });
}

async function build(orgId: string, pipeline: Pipeline, run: BuildRun, token: () => Promise<string>,
                     update: (run: BuildRun) => void): Promise<void> {
  const root = await workspaceDirectory(orgId);
  await ensureDirectory(root, ['.logs']);
  const log = logPath(root, run.id);
  let logBytes = 0;
  let pendingLog: Promise<void> = Promise.resolve();
  const writeLog = (data: Buffer) => {
    if (logBytes >= logLimit) return;
    const chunk = data.subarray(0, logLimit - logBytes);
    logBytes += chunk.length;
    pendingLog = pendingLog.then(() => appendFile(log, chunk, { mode: 0o600 })).catch(() => {});
  };
  const note = (message: string) => writeLog(Buffer.from(`${message}\n`));
  const work = await mkdtemp(join(root, '.work-'));
  const checkout = join(work, 'source');
  const archive = join(work, 'image.tar');

  try {
    update({ ...run, status: 'running' });
    note(`Checking out ${pipeline.branch} from ${pipeline.repositoryUrl}`);
    const gitToken = await token();
    const auth = Buffer.from(`x-access-token:${gitToken}`).toString('base64');
    const gitEnv = {
      ...environment,
      GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_COUNT: '3', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraHeader',
      GIT_CONFIG_VALUE_0: `Authorization: Basic ${auth}`,
      GIT_CONFIG_KEY_1: 'core.hooksPath', GIT_CONFIG_VALUE_1: '/dev/null',
      GIT_CONFIG_KEY_2: 'http.followRedirects', GIT_CONFIG_VALUE_2: 'false',
    };
    // The checkout token is passed only to Git and is never written to a remote URL.
    await mkdir(checkout, { mode: 0o700 });
    await command('git', ['init', '--quiet'], checkout, gitEnv, 10_000, writeLog);
    await command('git', ['fetch', '--depth=1', '--no-tags', '--no-recurse-submodules',
      `${pipeline.repositoryUrl}.git`, run.requestedCommit || `refs/heads/${pipeline.branch}`],
    checkout, gitEnv, 180_000, writeLog);
    await command('git', ['checkout', '--quiet', '--detach', 'FETCH_HEAD'], checkout, gitEnv, 90_000, writeLog);
    const revision = await exec('git', ['rev-parse', 'HEAD'], { cwd: checkout, env: gitEnv, timeout: 10_000 });
    run.commit = revision.stdout.trim();
    if (run.requestedCommit && run.commit !== run.requestedCommit) throw new Error('The checkout did not match the requested commit.');
    await rm(join(checkout, '.git'), { recursive: true, force: true });

    const directory = await realpath(checkout);
    const context = await realpath(resolve(directory, pipeline.context));
    if (!within(directory, context) || !(await stat(context)).isDirectory()) {
      throw new Error('The build context must resolve inside the checkout.');
    }
    const recipe = pipeline.recipe ?? 'repository';
    let dockerfile = '';
    let dockerfileContents = '';
    if (recipe === 'repository' || recipe === 'gradle-mirror') {
      dockerfile = await realpath(resolve(directory, pipeline.dockerfile));
      if (!within(directory, dockerfile) || !(await stat(dockerfile)).isFile()) {
        throw new Error('The Dockerfile must resolve inside the checkout.');
      }
      dockerfileContents = await readFile(dockerfile, 'utf8');
    }
    if (recipe !== 'repository') {
      const wrapperMissing = recipe === 'gradle-mirror' &&
        !(await stat(join(context, 'gradle', 'wrapper', 'gradle-wrapper.jar')).catch(() => undefined))?.isFile();
      const contents = managedDockerfile(recipe, dockerfileContents || undefined, wrapperMissing);
      dockerfileContents = contents;
      dockerfile = join(work, 'build.Dockerfile');
      await writeFile(dockerfile, contents, { mode: 0o600 });
    }
    run.dockerfileEnv = dockerfileEnvironmentNames(dockerfileContents);
    update({ ...run, dockerfileEnv: run.dockerfileEnv });
    const image = `${pipeline.imageName}:${run.tag}`;
    note(`Building ${image} from commit ${run.commit}`);
    const variables = { ...pipeline.buildArgs };
    if ((recipe === 'angular-static' || recipe === 'angular-ssr') && !variables['ANGULAR_APP_DIRECTORY']) {
      variables['ANGULAR_APP_DIRECTORY'] = context === directory ? basename(new URL(pipeline.repositoryUrl).pathname) : basename(context);
    }
    const buildArgs = Object.entries(variables).flatMap(([name, value]) => ['--build-arg', `${name}=${value}`]);
    const platform = pipeline.platform ? ['--platform', pipeline.platform] : [];
    await command('docker', ['buildx', 'build', '--progress', 'plain', '--file', dockerfile, '--tag', image,
      '--output', `type=docker,dest=${archive}`, ...platform, ...buildArgs, context],
    directory, environment, 45 * 60 * 1000, writeLog);
    note('Saving image archive');
    const fileInfo = await stat(archive);
    if (!fileInfo.isFile() || !fileInfo.size) throw new Error('Docker did not export an image archive.');
    const checksum = createHash('sha256');
    for await (const chunk of createReadStream(archive)) checksum.update(chunk);
    const target = await ensureDirectory(root, pipeline.artifactPath.split('/'));
    const destination = join(target, `${run.tag}.tar`);
    await chmod(archive, 0o600);
    await rename(archive, destination);
    const storedPath = `${pipeline.artifactPath}/${basename(destination)}`;
    note(`Saved image archive at ${storedPath}`);
    const accounts = eksAccounts(orgId);
    const ecrAccount = pipeline.awsConnectionId
      ? accounts.find(account => account.id === pipeline.awsConnectionId)
      : accounts[0];
    if (pipeline.awsConnectionId && !ecrAccount) {
      throw new Error('The selected AWS ECR connection is unavailable. Select an active connection in pipeline settings.');
    }
    const publishedImage = ecrAccount
      ? await publishEcrArchive(ecrAccount, ecrAccount.regions[0], pipeline.imageName, destination, run.tag, work)
      : image;
    if (ecrAccount) note('Published image to Amazon ECR: ' + publishedImage);
    await pendingLog;
    update({ ...run, status: 'succeeded', finishedAt: new Date().toISOString(), artifact: {
      image: publishedImage, path: storedPath, sha256: checksum.digest('hex'), sizeBytes: fileInfo.size,
    } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The build failed.';
    // GitHub and Docker credentials are kept out of user-visible error messages.
    note(error instanceof Error && 'code' in error ? 'A build step failed. Check the runner and the preceding log.' : message);
    await pendingLog;
    update({ ...run, status: 'failed', finishedAt: new Date().toISOString(), message: 'A build step failed. See the build log.' });
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

export function queueBuild(orgId: string, pipeline: Pipeline, run: BuildRun, token: () => Promise<string>,
                           update: (run: BuildRun) => void): void {
  activeBuilds.add(run.id);
  queuedBuilds.push(async () => {
    try {
      await build(orgId, pipeline, run, token, update);
    } catch {
      try {
        update({ ...run, status: 'failed', finishedAt: new Date().toISOString(),
          message: 'The runner could not prepare or save this build.' });
      } catch {
        console.error('Could not save Build Center run', run.id);
      }
    } finally {
      activeBuilds.delete(run.id);
    }
  });
  runNextBuild();
}

function runNextBuild(): void {
  while (runningBuilds < concurrency) {
    const job = queuedBuilds.shift();
    if (!job) return;
    runningBuilds++;
    void job().finally(() => {
      runningBuilds--;
      runNextBuild();
    });
  }
}

export function isActive(id: string): boolean {
  return activeBuilds.has(id);
}
