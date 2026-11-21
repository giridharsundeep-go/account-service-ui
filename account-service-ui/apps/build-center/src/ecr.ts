import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { object, text } from './deployment-config';
import { aws, AwsResourceExists, AwsResourceNotFound, verifyAwsAccount } from './eks';
import type { EksAccount } from './eks';

const exec = promisify(execFile);

export async function prepareEcrRepository(
  account: EksAccount, region: string, app: string, directory: string,
): Promise<{ repository: string; authFile: string }> {
  await verifyAwsAccount(account, region);
  const prefix = account.ecrRepositoryPrefix ?? (!/^[a-z]/.test(app) || app.length < 2 ? 'apps' : undefined);
  const name = prefix ? prefix + '/' + app : app;
  if (name.length > 256) throw new Error('The ECR repository name is too long. Shorten the app name or repository prefix.');
  const describe = async () => {
    const result = await aws(account, region, ['ecr', 'describe-repositories', '--registry-id', account.awsAccountId,
      '--repository-names', name], 'ecr:DescribeRepositories');
    return Array.isArray(result['repositories']) ? object(result['repositories'][0]) : {};
  };

  let details: Record<string, unknown>;
  try {
    details = await describe();
  } catch (error) {
    if (!(error instanceof AwsResourceNotFound)) throw error;
    try {
      const result = await aws(account, region, ['ecr', 'create-repository', '--repository-name', name,
        '--image-tag-mutability', 'IMMUTABLE'], 'ecr:CreateRepository');
      details = object(result['repository']);
    } catch (race) {
      if (!(race instanceof AwsResourceExists)) throw race;
      details = await describe();
    }
  }
  const repository = text(details['repositoryUri']);
  const slash = repository.indexOf('/');
  const host = repository.slice(0, slash);
  if (details['registryId'] !== account.awsAccountId || slash < 1 || repository.slice(slash + 1) !== name ||
      !host.startsWith(account.awsAccountId + '.dkr.ecr.' + region + '.') || !/^[a-z0-9.-]+$/.test(host)) {
    throw new Error('ECR did not return the expected repository in this AWS account and region.');
  }

  const response = await aws(account, region, ['ecr', 'get-authorization-token'], 'ecr:GetAuthorizationToken');
  const credentials = Array.isArray(response['authorizationData']) ? response['authorizationData'].map(object) : [];
  const credential = credentials.find(item => item['proxyEndpoint'] === 'https://' + host);
  const auth = text(credential?.['authorizationToken']);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(auth) || !Buffer.from(auth, 'base64').toString('utf8').startsWith('AWS:')) {
    throw new Error('ECR did not return a registry token for the selected repository.');
  }
  const authFile = join(directory, 'ecr-auth.json');
  await writeFile(authFile, JSON.stringify({ auths: { [host]: { auth } } }), { mode: 0o600 });
  return { repository, authFile };
}

export async function publishEcrArchive(
  account: EksAccount, region: string, app: string, archive: string, tag: string, directory: string,
): Promise<string> {
  const { repository, authFile } = await prepareEcrRepository(account, region, app, directory);
  const digestFile = join(directory, 'ecr-image-digest');
  try {
    await exec('skopeo', ['copy', '--dest-authfile', authFile, '--digestfile', digestFile,
      'docker-archive:' + archive, 'docker://' + repository + ':' + tag], {
      timeout: 10 * 60_000, maxBuffer: 1024 * 1024,
    });
    const digest = (await readFile(digestFile, 'utf8')).trim();
    if (!/^sha256:[0-9a-f]{64}$/.test(digest)) throw new Error('The registry did not return a valid image digest.');
    return repository + '@' + digest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('Install Skopeo on the Build Center server.');
    if (error instanceof Error && error.message.includes('valid image digest')) throw error;
    throw new Error('Could not publish the image to Amazon ECR. Check AWS ECR permissions and the runner logs.');
  }
}
