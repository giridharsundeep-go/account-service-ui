import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { privateKeyPath, setting } from './server-config';

interface SqliteStatement {
  run(...values: unknown[]): unknown;
  get(...values: unknown[]): Record<string, unknown> | undefined;
}

interface SqliteDatabase {
  exec(statement: string): void;
  prepare(statement: string): SqliteStatement;
  close(): void;
}

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => SqliteDatabase;
};

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

function databasePath(): string {
  return privateKeyPath(setting('BUILD_CENTER_AWS_CREDENTIALS_DB') ||
    join(homedir(), '.greatley-build-center', 'aws-credentials.sqlite'));
}

function encryptionKey(): Buffer {
  const configured = setting('BUILD_CENTER_SECRET_ENCRYPTION_KEY');
  if (configured) {
    const key = Buffer.from(configured, 'base64');
    if (key.length !== 32 || key.toString('base64') !== configured) {
      throw new Error('BUILD_CENTER_SECRET_ENCRYPTION_KEY must be a 32-byte base64 value.');
    }
    return key;
  }

  const path = databasePath() + '.key';
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try {
    const existing = readFileSync(path);
    if (existing.length !== 32) throw new Error('The AWS credential encryption key is invalid.');
    chmodSync(path, 0o600);
    return existing;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const key = randomBytes(32);
    try {
      writeFileSync(path, key, { flag: 'wx', mode: 0o600 });
      return key;
    } catch (writeError) {
      if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') throw writeError;
      const existing = readFileSync(path);
      if (existing.length !== 32) throw new Error('The AWS credential encryption key is invalid.');
      return existing;
    }
  }
}

function database(): SqliteDatabase {
  const path = databasePath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  chmodSync(path, 0o600);
  db.exec("PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS aws_credentials ("
    + "workspace_id TEXT NOT NULL, credential_ref TEXT NOT NULL, aws_account_id TEXT NOT NULL, "
    + "iv BLOB NOT NULL, auth_tag BLOB NOT NULL, encrypted_credentials BLOB NOT NULL, "
    + "updated_at TEXT NOT NULL, PRIMARY KEY (workspace_id, credential_ref)); "
    + "CREATE TABLE IF NOT EXISTS deployment_env ("
    + "workspace_id TEXT NOT NULL, profile_ref TEXT NOT NULL, iv BLOB NOT NULL, auth_tag BLOB NOT NULL, "
    + "encrypted_content BLOB NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (workspace_id, profile_ref))");
  return db;
}

function deploymentProfileReference(targetId: string, pipelineId: string): string {
  return JSON.stringify([targetId, pipelineId]);
}

export function saveDeploymentEnvironment(workspaceId: string, targetId: string, pipelineId: string, content: string): void {
  const reference = deploymentProfileReference(targetId, pipelineId);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(workspaceId + ':' + reference));
  const encrypted = Buffer.concat([cipher.update(content, 'utf8'), cipher.final()]);
  const db = database();
  try {
    db.prepare("INSERT INTO deployment_env (workspace_id, profile_ref, iv, auth_tag, encrypted_content, updated_at) "
      + "VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(workspace_id, profile_ref) DO UPDATE SET iv=excluded.iv, "
      + "auth_tag=excluded.auth_tag, encrypted_content=excluded.encrypted_content, updated_at=excluded.updated_at")
      .run(workspaceId, reference, iv, cipher.getAuthTag(), encrypted, new Date().toISOString());
  } finally {
    db.close();
  }
}

export function readDeploymentEnvironment(workspaceId: string, targetId: string, pipelineId: string): string | undefined {
  const reference = deploymentProfileReference(targetId, pipelineId);
  const db = database();
  try {
    const row = db.prepare("SELECT iv, auth_tag, encrypted_content FROM deployment_env "
      + "WHERE workspace_id = ? AND profile_ref = ?").get(workspaceId, reference) as
      { iv: Buffer; auth_tag: Buffer; encrypted_content: Buffer } | undefined;
    if (!row) return undefined;
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), row.iv);
    decipher.setAAD(Buffer.from(workspaceId + ':' + reference));
    decipher.setAuthTag(row.auth_tag);
    return Buffer.concat([decipher.update(row.encrypted_content), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Could not decrypt the saved deployment environment. Check the Build Center encryption key.');
  } finally {
    db.close();
  }
}

export function saveAwsCredentials(
  workspaceId: string, reference: string, accountId: string, credentials: AwsCredentials,
): void {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(workspaceId + ':' + reference));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials)), cipher.final()]);
  const db = database();
  try {
    db.prepare("INSERT INTO aws_credentials (workspace_id, credential_ref, aws_account_id, iv, auth_tag, "
      + "encrypted_credentials, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(workspace_id, credential_ref) "
      + "DO UPDATE SET aws_account_id=excluded.aws_account_id, iv=excluded.iv, auth_tag=excluded.auth_tag, "
      + "encrypted_credentials=excluded.encrypted_credentials, updated_at=excluded.updated_at")
      .run(workspaceId, reference, accountId, iv, cipher.getAuthTag(), encrypted, new Date().toISOString());
  } finally {
    db.close();
  }
}

export function readAwsCredentials(workspaceId: string, reference: string): AwsCredentials {
  const db = database();
  try {
    const row = db.prepare("SELECT iv, auth_tag, encrypted_credentials FROM aws_credentials "
      + "WHERE workspace_id = ? AND credential_ref = ?").get(workspaceId, reference) as
      { iv: Buffer; auth_tag: Buffer; encrypted_credentials: Buffer } | undefined;
    if (!row) throw new Error('The saved AWS credentials are unavailable.');
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), row.iv);
    decipher.setAAD(Buffer.from(workspaceId + ':' + reference));
    decipher.setAuthTag(row.auth_tag);
    const plaintext = Buffer.concat([decipher.update(row.encrypted_credentials), decipher.final()]).toString('utf8');
    const credentials = JSON.parse(plaintext) as AwsCredentials;
    if (!credentials.accessKeyId || !credentials.secretAccessKey) throw new Error();
    return credentials;
  } catch {
    throw new Error('Could not decrypt the AWS credentials. Check the Build Center encryption key.');
  } finally {
    db.close();
  }
}

export function awsCredentialsDatabaseAvailable(): boolean {
  const db = database();
  db.close();
  encryptionKey();
  return true;
}
