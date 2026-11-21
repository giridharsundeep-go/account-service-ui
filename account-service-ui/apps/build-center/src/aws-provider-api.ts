import { randomUUID } from 'node:crypto';
import type { Router } from 'express';
import { readWorkspace, updateWorkspace } from './build-store';
import { awsCredentialsDatabaseAvailable, saveAwsCredentials } from './aws-credentials';
import { dnsLabel, object, text } from './deployment-config';
import { awsSetupSources, callerAccount, eksAccounts, readAccount, regionName, verifyAwsCredentials } from './eks';
import type { AwsCredentials } from './eks';

export function registerAwsProviderSetup(api: Router): void {
  api.get('/deployments/aws/accounts', (request, response) => {
    try {
      const accounts = eksAccounts(response.locals['orgId'] as string);
      response.json({ accounts: accounts.map(account => ({
        id: account.id, name: account.name, regions: account.regions, namespaces: account.namespaces,
        hasCredentials: Boolean(account.credentialRef), provisioning: Boolean(account.provisioning),
      })) });
    } catch {
      response.status(500).json({ message: 'Could not load AWS account connections.' });
    }
  });

  api.get('/deployments/aws/setup', (_request, response) => {
    const sources = awsSetupSources(response.locals['orgId']).map(({ id, name }) => ({ id, name }));
    try {
      awsCredentialsDatabaseAvailable();
      sources.unshift({ id: 'credentials', name: 'AWS access key' });
      response.json({ sources });
    } catch {
      response.status(503).json({ message: 'AWS credential encryption could not be initialized.' });
    }
  });

  api.post('/deployments/aws/setup', async (request, response) => {
    const workspaceId = response.locals['orgId'] as string;
    const body = object(request.body);
    const sourceName = text(body['source']);
    const credentialMode = sourceName === 'credentials';
    const source = credentialMode ? undefined : awsSetupSources(workspaceId).find(item => item.id === sourceName);
    const requestedName = text(body['name']);
    const region = text(body['region']);
    const namespace = text(body['namespace']);
    const credentials: AwsCredentials | undefined = credentialMode ? {
      accessKeyId: text(body['accessKeyId']),
      secretAccessKey: text(body['secretAccessKey']),
      sessionToken: text(body['sessionToken']) || undefined,
    } : undefined;
    if ((!source && !credentials) || requestedName.length > 100 || !regionName.test(region) || !dnsLabel.test(namespace) ||
        (credentials && (!/^(?:AKIA|ASIA)[A-Z0-9]{16}$/.test(credentials.accessKeyId) ||
          credentials.secretAccessKey.length < 20 || credentials.secretAccessKey.length > 256 ||
          (credentials.accessKeyId.startsWith('ASIA') && !credentials.sessionToken) ||
          (credentials.sessionToken && credentials.sessionToken.length > 4096)))) {
      response.status(400).json({ message: 'Choose an approved AWS identity and enter a name, region, and namespace.' });
      return;
    }
    try {
      const awsAccountId = credentials ? await verifyAwsCredentials(credentials, region) : await callerAccount(source!, region);
      const name = requestedName || 'AWS ' + awsAccountId;
      const prior = readWorkspace(workspaceId).awsAccounts.find(item =>
        item.awsAccountId === awsAccountId && item.profile === source?.profile &&
        item.regions[0] === region && item.namespaces[0] === namespace);
      const accountId = prior?.id ?? 'aws-' + randomUUID();
      const credentialRef = credentials ? prior?.credentialRef ?? randomUUID() : undefined;
      const account = readAccount({
        id: accountId, name, workspaceId, awsAccountId, profile: source?.profile, credentialRef,
        regions: [region], namespaces: [namespace], provisioning: body['provisioning'],
        domain: body['domain'], ingressClass: body['ingressClass'],
      });
      if (credentials && credentialRef) saveAwsCredentials(workspaceId, credentialRef, awsAccountId, credentials);
      const saved = updateWorkspace(workspaceId, state => {
        const index = state.awsAccounts.findIndex(item => item.id === account.id);
        if (index === -1) state.awsAccounts.push(account);
        else {
          account.id = state.awsAccounts[index].id;
          if (!account.provisioning) account.provisioning = state.awsAccounts[index].provisioning;
          state.awsAccounts[index] = account;
        }
        return account;
      });
      response.status(201).json({ id: saved.id, name: saved.name, regions: saved.regions,
        namespaces: saved.namespaces, provisioning: Boolean(saved.provisioning), hasCredentials: Boolean(saved.credentialRef) });
    } catch (error) {
      response.status(409).json({ message: error instanceof Error ? error.message : 'AWS connection failed.' });
    }
  });
}
