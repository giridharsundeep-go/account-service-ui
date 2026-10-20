import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth.service';
import { environment } from '../../environment';

type TabKey = 'pages' | 'services' | 'api' | 'permissions' | 'activity';
// API payloads are dynamic JSON objects; `any` avoids TS4111 dot-access errors
// when Angular strict index-signature checking is enabled. Prefer DTO interfaces
// once the backend response contracts are finalized.
type AnyRecord = any;

@Component({
  selector: 'app-docs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './docs.html',
  styleUrl: './docs.css',
})
export class Docs implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly baseUrl = `${environment.apiBaseUrl}/docs`;

  activeTab: TabKey = 'pages';
  loading = false;
  saving = false;
  errorMessage = '';
  successMessage = '';
  searchText = '';

  spaces: AnyRecord[] = [];
  pages: AnyRecord[] = [];
  services: AnyRecord[] = [];
  apiVersions: AnyRecord[] = [];
  permissions: AnyRecord[] = [];
  auditLogs: AnyRecord[] = [];

  selectedSpace: AnyRecord | null = null;
  selectedPage: AnyRecord | null = null;
  selectedService: AnyRecord | null = null;
  selectedApiVersion: AnyRecord | null = null;
  pageVersions: AnyRecord[] = [];

  showSpaceForm = false;
  showServiceForm = false;
  showApiForm = false;
  showPermissionForm = false;
  editorMode: 'create' | 'edit' = 'create';

  spaceDraft: AnyRecord = this.emptySpace();
  pageDraft: AnyRecord = this.emptyPage();
  serviceDraft: AnyRecord = this.emptyService();
  apiDraft: AnyRecord = this.emptyApiVersion();
  permissionDraft: AnyRecord = this.emptyPermission();

  ngOnInit(): void {
    void this.loadInitialData();
  }

  private headers(): HttpHeaders {
    // Uses the existing app auth service. Org/user identity should be resolved by the backend
    // from the authenticated principal, not trusted from browser-supplied IDs.
    const authHeaders = this.auth.getAuthHeaders();
    return authHeaders instanceof HttpHeaders
      ? authHeaders
      : new HttpHeaders(authHeaders as any);
  }

  private async request<T>(method: 'get' | 'post' | 'put' | 'delete', path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const options = { headers: this.headers() };
    if (method === 'get') return await firstValueFrom(this.http.get<T>(url, options));
    if (method === 'post') return await firstValueFrom(this.http.post<T>(url, body, options));
    if (method === 'put') return await firstValueFrom(this.http.put<T>(url, body, options));
    return await firstValueFrom(this.http.delete<T>(url, options));
  }

  async loadInitialData(): Promise<void> {
    this.loading = true;
    this.clearMessages();
    try {
      const results = await Promise.allSettled([
        this.request<AnyRecord[]>('get', '/spaces'),
        this.request<AnyRecord[]>('get', '/services'),
        this.request<AnyRecord[]>('get', '/audit-logs'),
      ]);
      if (results[0].status === 'fulfilled') {
        this.spaces = this.asArray(results[0].value);
        if (!this.selectedSpace && this.spaces.length) {
          this.selectSpace(this.spaces[0]);
        }
      } else this.setError(results[0].reason, 'Could not load documentation spaces.');

      if (results[1].status === 'fulfilled') this.services = this.asArray(results[1].value);
      if (results[2].status === 'fulfilled') this.auditLogs = this.asArray(results[2].value);
    } finally {
      this.loading = false;
    }
  }

  private asArray(value: any): AnyRecord[] {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.content)) return value.content;
    if (Array.isArray(value?.data)) return value.data;
    return [];
  }

  async selectSpace(space: AnyRecord): Promise<void> {
    this.selectedSpace = space;
    this.selectedPage = null;
    this.pageDraft = this.emptyPage();
    this.pages = [];
    try {
      const data = await this.request<AnyRecord[]>('get', `/pages?spaceId=${encodeURIComponent(space.id)}`);
      this.pages = this.asArray(data);
    } catch (error) {
      this.setError(error, 'Could not load pages for this space.');
    }
  }

  async selectPage(page: AnyRecord): Promise<void> {
    this.selectedPage = page;
    this.editorMode = 'edit';
    this.pageDraft = { ...this.emptyPage(), ...page };
    try {
      this.pageVersions = this.asArray(await this.request<AnyRecord[]>('get', `/page-versions?pageId=${encodeURIComponent(page.id)}`));
    } catch {
      this.pageVersions = [];
    }
  }

  startNewPage(): void {
    if (!this.selectedSpace) {
      this.errorMessage = 'Create or select a documentation space first.';
      return;
    }
    this.selectedPage = null;
    this.editorMode = 'create';
    this.pageDraft = { ...this.emptyPage(), spaceId: this.selectedSpace.id };
    this.pageVersions = [];
  }

  async savePage(): Promise<void> {
    if (!this.selectedSpace || !this.pageDraft.title?.trim()) {
      this.errorMessage = 'Select a space and enter a page title.';
      return;
    }
    this.saving = true;
    this.clearMessages();
    const payload = {
      ...this.pageDraft,
      spaceId: this.selectedSpace.id,
      title: this.pageDraft.title.trim(),
      slug: this.pageDraft.slug?.trim() || this.slugify(this.pageDraft.title),
      contentFormat: this.pageDraft.contentFormat || 'MARKDOWN',
      pageType: this.pageDraft.pageType || 'GENERAL',
      status: this.pageDraft.status || 'DRAFT',
    };
    try {
      const result = this.editorMode === 'edit' && this.selectedPage
        ? await this.request<AnyRecord>('put', `/pages/${this.selectedPage.id}`, payload)
        : await this.request<AnyRecord>('post', '/pages', payload);
      this.successMessage = this.editorMode === 'edit' ? 'Page updated.' : 'Page created.';
      await this.selectSpace(this.selectedSpace);
      const saved = result?.id ? result : this.pages.find(p => p.slug === payload.slug || p.title === payload.title);
      if (saved) await this.selectPage(saved);
    } catch (error) {
      this.setError(error, 'Could not save the page.');
    } finally {
      this.saving = false;
    }
  }

  async publishPage(): Promise<void> {
    if (!this.selectedPage) return;
    this.saving = true;
    this.clearMessages();
    try {
      const payload = { ...this.pageDraft, status: 'PUBLISHED' };
      const updated = await this.request<AnyRecord>('put', `/pages/${this.selectedPage.id}`, payload);
      this.pageDraft = { ...this.pageDraft, ...updated, status: 'PUBLISHED' };
      this.selectedPage = { ...this.selectedPage, ...updated, status: 'PUBLISHED' };
      this.successMessage = 'Page published.';
      await this.selectSpace(this.selectedSpace!);
      if (this.selectedPage) await this.selectPage(this.selectedPage);
    } catch (error) {
      this.setError(error, 'Could not publish the page. Check that the backend supports updating status through PUT /pages/{id}.');
    } finally {
      this.saving = false;
    }
  }

  async deletePage(): Promise<void> {
    if (!this.selectedPage || !confirm(`Delete “${this.selectedPage.title}”?`)) return;
    try {
      await this.request<void>('delete', `/pages/${this.selectedPage.id}`);
      this.successMessage = 'Page deleted.';
      this.selectedPage = null;
      this.pageDraft = this.emptyPage();
      await this.selectSpace(this.selectedSpace!);
    } catch (error) {
      this.setError(error, 'Could not delete the page.');
    }
  }

  openSpaceForm(): void {
    this.spaceDraft = this.emptySpace();
    this.showSpaceForm = true;
  }

  async saveSpace(): Promise<void> {
    if (!this.spaceDraft.name?.trim()) return;
    this.saving = true;
    this.clearMessages();
    const payload = { ...this.spaceDraft, name: this.spaceDraft.name.trim(), slug: this.spaceDraft.slug?.trim() || this.slugify(this.spaceDraft.name) };
    try {
      const created = await this.request<AnyRecord>('post', '/spaces', payload);
      this.showSpaceForm = false;
      this.successMessage = 'Documentation space created.';
      await this.loadInitialData();
      const target = created?.id ? this.spaces.find(s => s.id === created.id) : this.spaces.find(s => s.slug === payload.slug);
      if (target) await this.selectSpace(target);
    } catch (error) {
      this.setError(error, 'Could not create the documentation space.');
    } finally {
      this.saving = false;
    }
  }

  openServiceForm(): void {
    this.serviceDraft = this.emptyService();
    this.showServiceForm = true;
  }

  async saveService(): Promise<void> {
    if (!this.serviceDraft.name?.trim()) return;
    this.saving = true;
    try {
      const payload = { ...this.serviceDraft, name: this.serviceDraft.name.trim(), slug: this.serviceDraft.slug?.trim() || this.slugify(this.serviceDraft.name) };
      await this.request('post', '/services', payload);
      this.showServiceForm = false;
      this.successMessage = 'Service registered.';
      this.services = this.asArray(await this.request('get', '/services'));
    } catch (error) {
      this.setError(error, 'Could not register the service.');
    } finally { this.saving = false; }
  }

  async selectService(service: AnyRecord): Promise<void> {
    this.selectedService = service;
    this.selectedApiVersion = null;
    try {
      this.apiVersions = this.asArray(await this.request('get', `/api-versions?serviceId=${encodeURIComponent(service.id)}`));
    } catch (error) {
      this.apiVersions = [];
      this.setError(error, 'Could not load API versions.');
    }
  }

  openApiForm(): void {
    if (!this.selectedService) {
      this.errorMessage = 'Select a service first.';
      return;
    }
    this.apiDraft = { ...this.emptyApiVersion(), serviceId: this.selectedService.id };
    this.showApiForm = true;
  }

  async saveApiVersion(): Promise<void> {
    if (!this.selectedService || !this.apiDraft.versionLabel?.trim()) return;
    this.saving = true;
    try {
      await this.request('post', '/api-versions', {
        ...this.apiDraft,
        serviceId: this.selectedService.id,
        versionLabel: this.apiDraft.versionLabel.trim(),
      });
      this.showApiForm = false;
      this.successMessage = 'API version saved.';
      await this.selectService(this.selectedService);
    } catch (error) {
      this.setError(error, 'Could not save the API version.');
    } finally { this.saving = false; }
  }

  async loadPermissions(space: AnyRecord): Promise<void> {
    this.selectedSpace = space;
    try {
      this.permissions = this.asArray(await this.request('get', `/permissions?spaceId=${encodeURIComponent(space.id)}`));
    } catch (error) { this.setError(error, 'Could not load permissions.'); }
  }

  openPermissionForm(): void {
    if (!this.selectedSpace) {
      this.errorMessage = 'Select a documentation space first.';
      return;
    }
    this.permissionDraft = { ...this.emptyPermission(), spaceId: this.selectedSpace.id };
    this.showPermissionForm = true;
  }

  async savePermission(): Promise<void> {
    if (!this.selectedSpace || !this.permissionDraft.principalId) return;
    this.saving = true;
    try {
      await this.request('post', '/permissions', { ...this.permissionDraft, spaceId: this.selectedSpace.id });
      this.showPermissionForm = false;
      this.successMessage = 'Permission granted.';
      await this.loadPermissions(this.selectedSpace);
    } catch (error) { this.setError(error, 'Could not grant permission.'); }
    finally { this.saving = false; }
  }

  async loadActivity(): Promise<void> {
    this.activeTab = 'activity';
    try { this.auditLogs = this.asArray(await this.request('get', '/audit-logs')); }
    catch (error) { this.setError(error, 'Could not load audit activity.'); }
  }

  setTab(tab: TabKey): void {
    this.activeTab = tab;
    this.clearMessages();
    if (tab === 'activity') void this.loadActivity();
    if (tab === 'permissions' && this.selectedSpace) void this.loadPermissions(this.selectedSpace);
  }

  get filteredPages(): AnyRecord[] {
    const q = this.searchText.toLowerCase().trim();
    return !q ? this.pages : this.pages.filter(p => `${p.title ?? ''} ${p.slug ?? ''} ${p.content ?? ''}`.toLowerCase().includes(q));
  }

  get filteredSpaces(): AnyRecord[] {
    const q = this.searchText.toLowerCase().trim();
    return !q ? this.spaces : this.spaces.filter(s => `${s.name ?? ''} ${s.description ?? ''}`.toLowerCase().includes(q));
  }

  slugify(value: string): string {
    return (value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  private emptySpace(): AnyRecord {
    return { name: '', slug: '', description: '', visibility: 'ORGANIZATION', status: 'ACTIVE' };
  }
  private emptyPage(): AnyRecord {
    return { title: '', slug: '', content: '', contentFormat: 'MARKDOWN', pageType: 'GENERAL', status: 'DRAFT', sortOrder: 0, parentPageId: null };
  }
  private emptyService(): AnyRecord {
    return { name: '', slug: '', description: '', serviceType: 'REST_API', repositoryUrl: '', baseUrlDev: '', baseUrlTest: '', baseUrlProd: '', status: 'ACTIVE' };
  }
  private emptyApiVersion(): AnyRecord {
    return { versionLabel: '', specificationFormat: 'OPENAPI_YAML', specification: '', status: 'DRAFT', isDefault: false, changelog: '' };
  }
  private emptyPermission(): AnyRecord {
    return { principalType: 'USER', principalId: null, permission: 'VIEW' };
  }
  private clearMessages(): void { this.errorMessage = ''; this.successMessage = ''; }
  private setError(error: unknown, fallback: string): void {
    const e = error as HttpErrorResponse;
    this.errorMessage = e?.error?.message || e?.error?.error || e?.message || fallback;
  }
}
