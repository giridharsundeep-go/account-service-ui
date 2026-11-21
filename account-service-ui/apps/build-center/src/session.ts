import { Injectable, signal } from '@angular/core';
import { SuiteAuth } from '../../../vendor/suite/index.js';

interface WorkspaceSession {
  user: {
    id: number;
    firstName?: string;
    lastName?: string;
    name?: string;
    email?: string;
    image?: string;
  };
  token: string;
}

@Injectable({ providedIn: 'root' })
export class BuildCenterSession {
  private readonly passport = new SuiteAuth('build-center');
  readonly user = signal<WorkspaceSession['user'] | null>(null);
  readonly token = signal('');

  async load(): Promise<void> {
    const session: WorkspaceSession | null = await this.passport.bootstrap();
    this.user.set(session?.user ?? null);
    this.token.set(session?.token ?? '');
  }

  signIn(): Promise<void> {
    return this.passport.signIn();
  }

  async authorization(): Promise<string> {
    const result = await this.passport.resume();
    const session: WorkspaceSession = result.data;
    this.token.set(session.token);
    return `Bearer ${session.token}`;
  }

  async request<T>(path: string, method = 'GET', body?: object): Promise<T> {
    const Authorization = await this.authorization();
    const response = await fetch(`/api/build-center${path}`, {
      method,
      headers: { Authorization, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 204) return undefined as T;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `The request failed (HTTP ${response.status}).`);
    return data as T;
  }

  async signOut(): Promise<void> {
    await this.passport.logout();
    this.token.set('');
    this.user.set(null);
  }
}
