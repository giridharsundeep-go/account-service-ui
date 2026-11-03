import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild, inject, OnDestroy, effect, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth.service';
import { environment } from '../../environment';
import { WorkspaceHeroComponent } from '../shared/workspace-hero';
import { ProjectContextService } from '../project-context.service';

type TabKey = 'pages' | 'services' | 'api' | 'permissions' | 'activity';
// API payloads are dynamic JSON objects; `any` avoids TS4111 dot-access errors
// when Angular strict index-signature checking is enabled. Prefer DTO interfaces
// once the backend response contracts are finalized.
type AnyRecord = any;
type FolderNode = AnyRecord & { children: FolderNode[]; expanded?: boolean; depth?: number };

@Component({
  selector: 'app-docs',
  standalone: true,
  imports: [CommonModule, FormsModule, WorkspaceHeroComponent],
  templateUrl: './docs.html',
  styleUrls: ['./docs.css', '../shared/field-controls.css'],
})
export class Docs implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly baseUrl = `${environment.apiBaseUrlM}/docs`;
  readonly projectContext = inject(ProjectContextService);
  private initialized = false;
  private loadedProjectId: number | null = null;
  private libraryRequest = 0;
  creatingDocument = false;
  loadingDocumentId: number | null = null;
  documentSort: 'recent' | 'title' | 'updated' = 'recent';
  private documentTouches: Record<string, string> = {};
  readonly documentTemplates = [
    { id: 'blank', name: 'Blank document', code: '', accent: '#2563eb', content: '' },
    { id: 'brief', name: 'Project brief', code: 'BRIEF', accent: '#7c3aed', content: '<h1>Project brief</h1><h2>Purpose</h2><p>What problem are we solving?</p><h2>Goals and success measures</h2><p></p><h2>Scope</h2><p></p><h2>Milestones and owners</h2><p></p>' },
    { id: 'requirements', name: 'Product requirements', code: 'PRD', accent: '#16a34a', content: '<h1>Product requirements</h1><h2>Customer problem</h2><p></p><h2>Proposed experience</h2><p></p><h2>Requirements</h2><ul><li>Requirement and acceptance criteria</li></ul><h2>Open questions</h2><p></p>' },
    { id: 'design', name: 'Technical design', code: 'RFC', accent: '#4f46e5', content: '<h1>Technical design</h1><h2>Context and constraints</h2><p></p><h2>Proposed architecture</h2><p></p><h2>Alternatives considered</h2><p></p><h2>Risks and rollout</h2><p></p>' },
    { id: 'meeting', name: 'Meeting notes', code: 'NOTES', accent: '#ea580c', content: '<h1>Meeting notes</h1><h2>Agenda</h2><ul><li>Discussion topic</li></ul><h2>Decisions</h2><p></p><h2>Actions and owners</h2><ul><li>Action · Owner · Due date</li></ul>' },
    { id: 'release', name: 'Release notes', code: 'RELEASE', accent: '#dc2626', content: '<h1>Release notes</h1><h2>What is new</h2><p></p><h2>Improvements</h2><p></p><h2>Fixes</h2><p></p><h2>Known limitations</h2><p></p>' },
  ];
  private projectSync = effect(() => {
    const id = this.projectContext.selectedProjectId();
    untracked(() => { if (this.initialized && id !== this.loadedProjectId) void this.loadInitialData(); });
  });

  get projectName(): string { return this.projectContext.selectedProject()?.name || 'Select a project'; }
  get documentOpen(): boolean { return this.pageViewMode === 'edit' && (!!this.selectedPage || this.editorMode === 'create'); }
  get galleryDocuments(): AnyRecord[] {
    const query = this.searchText.trim().toLowerCase();
    return this.pages.filter(page => !query || `${page.title} ${page.pageType || ''}`.toLowerCase().includes(query)).slice().sort((a,b) =>
      this.documentSort === 'title' ? a.title.localeCompare(b.title) :
      this.documentTime(b) - this.documentTime(a));
  }
  private documentTime(page: AnyRecord): number { return Date.parse((this.documentSort === 'recent' ? this.documentTouches[String(page.id)] : '') || page.updatedAt || page.createdAt || '') || 0; }
  documentOpenedAt(page: AnyRecord): string { return this.documentTouches[String(page.id)] || page.updatedAt || page.createdAt || ''; }
  private get documentRecentKey(): string { return `greatley-docs-recent-${this.auth.getCurrentUserId()}-${this.projectContext.selectedProjectId()}`; }
  private touchDocument(page: AnyRecord): void {
    this.documentTouches = {...this.documentTouches, [page.id]: new Date().toISOString()};
    try { localStorage.setItem(this.documentRecentKey, JSON.stringify(this.documentTouches)); } catch {}
  }
  private belongsToProject(space: AnyRecord, id: number): boolean {
    const explicit = space.projectId ?? space.project_id ?? space.project?.id;
    return explicit != null ? Number(explicit) === id : space.slug === `project-${id}`;
  }
  async createFromTemplate(templateId = 'blank'): Promise<void> {
    const projectId = this.projectContext.selectedProjectId();
    if (!projectId || this.loading || this.creatingDocument) return;
    this.creatingDocument = true; this.clearMessages();
    try {
      if (!this.selectedSpace) {
        const result = await this.request<AnyRecord>('post', '/spaces', { name: `${this.projectName} documents`, slug: `project-${projectId}`, projectId, project_id: projectId, visibility: 'ORGANIZATION', status: 'ACTIVE' });
        if (projectId !== this.projectContext.selectedProjectId()) return;
        this.selectedSpace = this.normalizeSpace(result?.data ?? result);
        if (!this.selectedSpace?.id) throw new Error('The document service did not return a project library ID.');
      }
      if (projectId !== this.projectContext.selectedProjectId()) return;
      const template = this.documentTemplates.find(row => row.id === templateId) || this.documentTemplates[0];
      this.startNewPage();
      const date = new Date().toLocaleDateString('en-CA');
      this.pageDraft.title = template.code ? `[${template.code}] ${this.projectName} · ${date}` : 'Untitled document';
      this.pageDraft.slug = `document-${Date.now()}`;
      this.editorHtml = template.content;
    } catch (error) { if (projectId === this.projectContext.selectedProjectId()) this.setError(error, 'Could not create the document.'); }
    finally { this.creatingDocument=false; this.cdr.markForCheck(); }
  }
  async openDocument(page: AnyRecord): Promise<void> {
    const projectId = this.projectContext.selectedProjectId();
    this.loadingDocumentId = Number(page.id);
    const session = ++this.editorSession;
    try {
      const response = await this.request<AnyRecord>('get', `/pages/${page.id}`);
      if (session !== this.editorSession || projectId !== this.projectContext.selectedProjectId()) return;
      const record = response?.data ?? response;
      if (!record || Array.isArray(record) || typeof record !== 'object') throw new Error('The document could not be loaded.');
      const docProject = record.projectId ?? record.project_id;
      if ((docProject != null && Number(docProject) !== projectId) || (record.spaceId != null && !this.sameId(record.spaceId,this.selectedSpace?.id))) throw new Error('This document belongs to a different project.');
      this.selectedPage = this.normalizePage({...page,...record});
      this.startEditingPage(); this.touchDocument(this.selectedPage);
    } catch(error) { if (projectId === this.projectContext.selectedProjectId()) this.setError(error, 'Could not open the document.'); }
    finally { this.loadingDocumentId=null;this.cdr.markForCheck(); }
  }
  async closeDocument(): Promise<void> {
    if(this.saving)return;
    if(this.editorMode==='create' || this.editorSaveLabel==='Unsaved changes'){
      await this.savePage();if(this.errorMessage)return;
    }
    this.beginEditorSession();this.selectedPage=null;this.pageViewMode='view';this.editorMode='edit';this.docFullScreen=false;
  }

  versionHistoryOpen = false;
  cloudView: 'list'|'grid'='grid';
  private autosaveTimer:ReturnType<typeof setTimeout>|null=null;
  private documentRevision=0;
  private editorSession=0;
  private beginEditorSession():void{this.editorSession++;this.saving=false;if(this.autosaveTimer)clearTimeout(this.autosaveTimer);this.autosaveTimer=null;}
  ngOnDestroy():void {if(this.autosaveTimer)clearTimeout(this.autosaveTimer);}
  scheduleDocumentSave():void {
    this.documentRevision++;this.editorSaveLabel='Unsaved changes';if(this.autosaveTimer)clearTimeout(this.autosaveTimer);
    if(this.selectedSpace && this.pageDraft.title?.trim() && this.pageDraft.status!=='PUBLISHED')this.autosaveTimer=setTimeout(()=>{if(!this.saving && this.pageViewMode==='edit')void this.savePage();},1800);
  }
  exportDocument():void {const title=this.pageDraft.title||this.selectedPage?.title||'Document';const content=this.editorHtml||this.contentToEditorHtml(this.selectedPage?.content||'',this.selectedPage?.contentFormat);const blob=new Blob(['<!doctype html><html><meta charset="utf-8"><body>'+content+'</body></html>'],{type:'text/html'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=this.slugify(title)+'.html';link.click();URL.revokeObjectURL(url);}
  activeTab: TabKey = 'pages';
  loading = false;
  loadingLibrary = false;
  saving = false;
  renamingFolderId: number | string | null = null;
  folderRenameDraft = '';
  private spaceLoadSequence = 0;
  private loadedSpaceKey: string | null = null;
  errorMessage = '';
  successMessage = '';
  searchText = '';

  spaces: AnyRecord[] = [];
  pages: AnyRecord[] = [];
  folders: FolderNode[] = [];
  selectedFolderId: number | null = null;
  folderDraft: AnyRecord = this.emptyFolder();
  showFolderForm = false;
  services: AnyRecord[] = [];
  apiVersions: AnyRecord[] = [];
  permissions: AnyRecord[] = [];
  auditLogs: AnyRecord[] = [];

  selectedSpace: AnyRecord | null = null;
  selectedPage: AnyRecord | null = null;
  selectedService: AnyRecord | null = null;
  selectedApiVersion: AnyRecord | null = null;
  pageVersions: AnyRecord[] = [];
  editorHtml = '';
  editorSaveLabel = 'Unsaved changes';
  paragraphStyle = 'p';
  fontSize = '3';
  private savedSelection: Range | null = null;

  showSpaceForm = false;
  showServiceForm = false;
  showApiForm = false;
  showPermissionForm = false;
  editorMode: 'create' | 'edit' = 'create';
  pageViewMode: 'view' | 'edit' = 'view';
  sidebarCollapsed = false;
  sidebarWidth = 280;
  docFullScreen = false;
  private sidebarResizeStartX = 0;
  private sidebarResizeStartWidth = 280;
  folderBackStack: Array<number | null> = [];
  folderForwardStack: Array<number | null> = [];

  @ViewChild('documentEditor')
  set documentEditorElement(ref: ElementRef<HTMLElement> | undefined) {
    // Set the editor HTML only when Angular creates the editor element. Updating
    // [innerHTML] on every change-detection pass resets the caret and can make
    // typing appear reversed or jump to the beginning.
    if (ref) ref.nativeElement.innerHTML = this.editorHtml || '';
  }

  spaceDraft: AnyRecord = this.emptySpace();
  pageDraft: AnyRecord = this.emptyPage();
  serviceDraft: AnyRecord = this.emptyService();
  apiDraft: AnyRecord = this.emptyApiVersion();
  permissionDraft: AnyRecord = this.emptyPermission();

  toggleSidebar(): void { this.sidebarCollapsed = !this.sidebarCollapsed; }

  startSidebarResize(event: PointerEvent): void {
    if (this.sidebarCollapsed || window.innerWidth <= 760) return;
    event.preventDefault();
    this.sidebarResizeStartX = event.clientX;
    this.sidebarResizeStartWidth = this.sidebarWidth;
    const move = (moveEvent: PointerEvent) => {
      this.sidebarWidth = Math.max(220, Math.min(480, this.sidebarResizeStartWidth + moveEvent.clientX - this.sidebarResizeStartX));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }

  toggleDocFullScreen(): void { this.docFullScreen = !this.docFullScreen; }

  trackDocumentId(index: number, row: AnyRecord): number | string {
    return row.id ?? index;
  }
  setDocumentFolder(value: string): void {
    this.pageDraft.folderId = value === '' ? null : Number(value);
    this.scheduleDocumentSave();
  }

  ngOnInit(): void {
    this.initialized = true;
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


  /**
   * Every Docs API request receives the authenticated user ID.
   *
   * GET and DELETE: user_id query parameter.
   * POST, PUT and PATCH: user_id in the JSON body and query parameter.
   */
  
private async request<T>(
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string,
  body?: unknown
): Promise<T> {
  const userId = this.getRequestedUserId();

  if (userId === null) {
    throw new Error(
      'Logged-in user ID was not found. Please check your authentication session.'
    );
  }

  const [pathOnly, queryString] = path.split('?');
  const params = new URLSearchParams(queryString || '');

  // Include the user ID in every request URL.
  params.set('user_id', String(userId));

  const query = params.toString();
  const url = `${this.baseUrl}${pathOnly}${query ? `?${query}` : ''}`;
  const options = { headers: this.headers() };

  // Include both fields in JSON payloads without removing existing fields.
  const payload =
    body !== null &&
    typeof body === 'object' &&
    !Array.isArray(body)
      ? {
          ...(body as AnyRecord),
          user_id: userId,
          createdBy: userId
        }
      : body;

  if (method === 'get') {
    return await firstValueFrom(
      this.http.get<T>(url, options)
    );
  }

  if (method === 'post') {
    return await firstValueFrom(
      this.http.post<T>(url, payload, options)
    );
  }

  if (method === 'put') {
    return await firstValueFrom(
      this.http.put<T>(url, payload, options)
    );
  }

  if (method === 'patch') {
    return await firstValueFrom(
      this.http.patch<T>(url, payload, options)
    );
  }

  return await firstValueFrom(
    this.http.delete<T>(url, options)
  );
}

private getRequestedUserId(): number | null {
  return this.getAuthenticatedUserId();
}

  async loadInitialData(_retryOnce = true): Promise<void> {
    const projectId = this.projectContext.selectedProjectId();
    this.loadedProjectId = projectId;
    const request = ++this.libraryRequest;
    this.spaceLoadSequence++;
    this.beginEditorSession();
    this.selectedSpace=null;this.selectedPage=null;this.pages=[];this.folders=[];
    this.pageViewMode='view';this.editorMode='edit';this.docFullScreen=false;
    this.clearMessages();
    this.documentTouches={};
    try { this.documentTouches=JSON.parse(localStorage.getItem(this.documentRecentKey)||'{}'); } catch {}
    if (!projectId) {this.loading=false;this.loadingLibrary=false;return;}
    this.loading=true;
    try {
      const result=await this.request<AnyRecord[]>('get','/spaces');
      if(request!==this.libraryRequest || projectId!==this.projectContext.selectedProjectId())return;
      this.spaces=this.asArray(result).map(space=>this.normalizeSpace(space)).filter(space=>space.id!=null && this.belongsToProject(space,projectId));
      const space=this.spaces[0];
      if(space)await this.selectSpace(space);
    } catch(error) { if(request===this.libraryRequest)this.setError(error,'Could not load project documents.'); }
    finally { if(request===this.libraryRequest){this.loading=false;this.cdr.markForCheck();} }
  }

  sameId(a: unknown, b: unknown): boolean {
    return a != null && b != null && String(a) === String(b);
  }

  private asArray(value: any, depth = 0): AnyRecord[] {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object' || depth > 4) return [];
    // APIs in this application have used both direct arrays and wrapped payloads
    // (for example { data: { items: [...] } } or { result: { content: [...] } }).
    for (const key of ['content', 'items', 'results', 'pages', 'folders', 'spaces', 'data', 'result', 'payload']) {
      if (value[key] !== undefined && value[key] !== value) {
        const rows = this.asArray(value[key], depth + 1);
        if (rows.length || Array.isArray(value[key])) return rows;
      }
    }
    return [];
  }

  private normalizePage(page: AnyRecord): AnyRecord {
    return {
      ...page,
      id: page?.id ?? page?.pageId ?? page?.page_id,
      spaceId: page?.spaceId ?? page?.space_id ?? page?.shelfId ?? page?.shelf_id,
      folderId: page?.folderId ?? page?.folder_id ?? page?.bookId ?? page?.book_id ?? null,
      title: page?.title ?? page?.name ?? 'Untitled page',
      content: page?.content ?? page?.body ?? page?.bodyContent ?? '',
      contentFormat: page?.contentFormat ?? page?.content_format ?? 'MARKDOWN',
      pageType: page?.pageType ?? page?.page_type ?? 'GENERAL',
      updatedAt: page?.updatedAt ?? page?.updated_at,
      createdAt: page?.createdAt ?? page?.created_at,
    };
  }

  private normalizeSpace(space: AnyRecord): AnyRecord {
    return {
      ...space,
      id: space?.id ?? space?.spaceId ?? space?.space_id ?? space?.shelfId ?? space?.shelf_id,
      name: space?.name ?? space?.title ?? 'Project documents',
      slug: space?.slug ?? space?.urlSlug ?? space?.url_slug ?? '',
      description: space?.description ?? '',
    };
  }

  async selectSpace(space: AnyRecord): Promise<void> {
    if(!space?.id)return;
    this.beginEditorSession();
    const request=++this.spaceLoadSequence;
    const projectId=this.projectContext.selectedProjectId();
    this.selectedSpace=space;this.selectedPage=null;this.selectedFolderId=null;
    this.pageViewMode='view';this.editorMode='edit';this.loadingLibrary=true;
    try {
      const result=await this.request<AnyRecord[]>('get',`/pages?spaceId=${encodeURIComponent(space.id)}&space_id=${encodeURIComponent(space.id)}`);
      if(request!==this.spaceLoadSequence || projectId!==this.projectContext.selectedProjectId())return;
      this.pages=this.asArray(result).map(page=>this.normalizePage(page)).filter(page=>page.id!=null && (page.spaceId==null || this.sameId(page.spaceId,space.id)) && (page.projectId==null && page.project_id==null || Number(page.projectId??page.project_id)===projectId));
    } catch(error) {if(request===this.spaceLoadSequence)this.setError(error,'Could not load project documents.');}
    finally {if(request===this.spaceLoadSequence){this.loadingLibrary=false;this.cdr.markForCheck();}}
  }

  async selectPage(page: AnyRecord): Promise<void> {
    this.beginEditorSession();
    this.docFullScreen = false;
    this.selectedPage = page;
    this.editorMode = 'edit';
    this.pageViewMode = 'view';
    this.pageDraft = { ...this.emptyPage(), ...page };
    this.editorHtml = this.contentToEditorHtml(this.pageDraft.content || '', this.pageDraft.contentFormat);
    this.editorSaveLabel = 'Saved document';
    this.selectedFolderId = page.folderId ?? null;
    try {
      this.pageVersions = this.asArray(await this.request<AnyRecord[]>('get', `/page-versions?pageId=${encodeURIComponent(page.id)}`));
    } catch {
      this.pageVersions = [];
    }
    this.cdr.markForCheck();
  }

  startEditingPage(): void {
    this.beginEditorSession();
    if (!this.selectedPage) return;
    this.editorMode = 'edit';
    this.pageViewMode = 'edit';
    this.pageDraft = { ...this.emptyPage(), ...this.selectedPage };
    this.editorHtml = this.contentToEditorHtml(this.pageDraft.content || '', this.pageDraft.contentFormat);
    this.editorSaveLabel = 'Editing document';
  }

  cancelPageEditing(): void {
    this.beginEditorSession();
    if (this.selectedPage) {
      this.pageDraft = { ...this.emptyPage(), ...this.selectedPage };
      this.editorHtml = this.contentToEditorHtml(this.pageDraft.content || '', this.pageDraft.contentFormat);
      this.pageViewMode = 'view';
      this.editorMode = 'edit';
    } else {
      this.pageViewMode = 'view';
      this.editorMode = 'create';
    }
  }

  startNewPage(): void {
    this.beginEditorSession();
    if (!this.selectedSpace) {
      this.errorMessage = 'Create or select a shelf first.';
      return;
    }
    this.selectedPage = null;
    this.editorMode = 'create';
    this.pageViewMode = 'edit';
    this.pageDraft = { ...this.emptyPage(), spaceId: this.selectedSpace.id, folderId: null };
    this.editorHtml = '';
    this.editorSaveLabel = 'New document';
    this.pageVersions = [];
  }

  contentToEditorHtml(content: string, format?: string): string {
    if ((format || '').toUpperCase() === 'HTML') return content || '';
    return (content || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, '<br>');
  }

  onDocumentInput(event: Event): void {
    const editor = event.target as HTMLElement;
    this.editorHtml = editor.innerHTML;
    this.pageDraft.content = this.editorHtml;
    this.pageDraft.contentFormat = 'HTML';
    this.scheduleDocumentSave();
  }

  rememberEditorSelection(): void {
    const selection = typeof window !== 'undefined' ? window.getSelection() : null;
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const editor = document.querySelector('.rich-document-editor');
    if (editor && editor.contains(range.commonAncestorContainer)) this.savedSelection = range.cloneRange();
  }

  private restoreEditorSelection(): void {
    if (!this.savedSelection || typeof window === 'undefined') return;
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(this.savedSelection);
  }

  formatDocument(command: string): void {
    this.restoreEditorSelection();
    document.execCommand(command, false);
    const editor = document.querySelector('.rich-document-editor') as HTMLElement | null;
    if (editor) {
      this.editorHtml = editor.innerHTML;
      this.pageDraft.content = this.editorHtml;
      this.pageDraft.contentFormat = 'HTML';
      this.scheduleDocumentSave();
      editor.focus();
    }
  }

  applyParagraphStyle(tag: string): void {
    this.paragraphStyle = tag;
    this.restoreEditorSelection();
    document.execCommand('formatBlock', false, tag);
    this.syncEditorAfterCommand();
  }

  applyFontSize(size: string): void {
    this.fontSize = size;
    this.restoreEditorSelection();
    document.execCommand('fontSize', false, size);
    this.syncEditorAfterCommand();
  }

  applyTextColor(color: string): void {
    this.restoreEditorSelection();
    document.execCommand('foreColor', false, color);
    this.syncEditorAfterCommand();
  }

  applyHighlight(color: string): void {
    this.restoreEditorSelection();
    const supported = document.queryCommandSupported?.('hiliteColor');
    document.execCommand(supported ? 'hiliteColor' : 'backColor', false, color);
    this.syncEditorAfterCommand();
  }

  insertDocumentLink(): void {
    const url = typeof window !== 'undefined' ? window.prompt('Enter the link URL') : null;
    if (!url?.trim()) return;
    this.restoreEditorSelection();
    document.execCommand('createLink', false, url.trim());
    this.syncEditorAfterCommand();
  }

  insertDocumentTable(): void {
    this.restoreEditorSelection();
    const table = '<table><tbody><tr><td> </td><td> </td></tr><tr><td> </td><td> </td></tr></tbody></table><p><br></p>';
    document.execCommand('insertHTML', false, table);
    this.syncEditorAfterCommand();
  }

  private syncEditorAfterCommand(): void {
    const editor = document.querySelector('.rich-document-editor') as HTMLElement | null;
    if (!editor) return;
    this.editorHtml = editor.innerHTML;
    this.pageDraft.content = this.editorHtml;
    this.pageDraft.contentFormat = 'HTML';
    this.scheduleDocumentSave();
    editor.focus();
  }

  async savePage(): Promise<void> {
    if (!this.selectedSpace || !this.pageDraft.title?.trim()) {
      this.errorMessage = 'Select a space and enter a page title.';
      return;
    }
    const session=this.editorSession;
    const revision=this.documentRevision;
    if(this.autosaveTimer)clearTimeout(this.autosaveTimer);
    this.saving = true;
    this.editorSaveLabel='Saving to cloud…';
    this.clearMessages();
    this.pageDraft.content = this.editorHtml;
    this.pageDraft.contentFormat = 'HTML';
    const payload = {
      ...this.pageDraft,
      spaceId: this.selectedSpace.id,
      projectId: this.projectContext.selectedProjectId(),
      title: this.pageDraft.title.trim(),
      slug: this.pageDraft.slug?.trim() || this.slugify(this.pageDraft.title),
      contentFormat: this.pageDraft.contentFormat || 'MARKDOWN',
      pageType: this.pageDraft.pageType || 'GENERAL',
      status: this.pageDraft.status || 'DRAFT',
      folderId: this.pageDraft.folderId ?? null,
    };
    try {
      const result = this.editorMode === 'edit' && this.selectedPage
        ? await this.request<AnyRecord>('put', `/pages/${this.selectedPage.id}`, payload)
        : await this.request<AnyRecord>('post', '/pages', payload);
      if(session!==this.editorSession)return;
      this.successMessage = this.editorMode === 'edit' ? 'Page updated.' : 'Page created.';
      const response=result?.data??result;
      const saved=this.normalizePage({...payload,...response,id:response?.id??this.selectedPage?.id});
      if(!saved.id)throw new Error('The document service did not return a saved document ID.');
      if(saved.id){this.selectedPage=saved;this.editorMode='edit';this.pages=[saved,...this.pages.filter(page=>!this.sameId(page.id,saved.id))];}
      this.touchDocument(saved);
      this.editorSaveLabel=revision===this.documentRevision?'Saved to cloud':'Unsaved changes';
      if(revision!==this.documentRevision)this.scheduleDocumentSave();
      this.cdr.markForCheck();
    } catch (error) {
      if(session!==this.editorSession)return;
      this.editorSaveLabel='Not saved — retry Save draft';
      this.setError(error, 'Could not save the document. Your changes remain in the editor.');
    } finally {
      if(session===this.editorSession){this.saving = false;this.cdr.markForCheck();}
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

  private normalizeFolder(folder: AnyRecord, depth = 0): FolderNode {
    return {
      ...folder,
      id: folder?.id ?? folder?.folderId ?? folder?.folder_id ?? folder?.bookId ?? folder?.book_id,
      name: folder?.name ?? folder?.title ?? 'Untitled book',
      parentFolderId: folder?.parentFolderId ?? folder?.parent_folder_id ?? folder?.parentId ?? folder?.parent_id ?? null,
      depth,
      expanded: folder?.expanded ?? true,
      children: [],
    };
  }

  private async loadFolders(spaceId: number | string): Promise<FolderNode[]> {
    const response = await this.request<AnyRecord[]>('get', `/spaces/${encodeURIComponent(spaceId)}/folders`);
    const records = this.asArray(response).filter(folder => this.normalizeFolder(folder).id != null);
    if (!records.length) return [];

    // Some endpoints return a flat list of every book; others return only root books.
    // Build the tree locally when parent IDs are present, instead of depending on a
    // second request to /children to reveal nested books after the user clicks.
    const normalized = records.map(folder => this.normalizeFolder(folder));
    const hasParentLinks = normalized.some(folder => folder.parentFolderId != null && String(folder.parentFolderId).trim() !== '');
    if (hasParentLinks) {
      const byId = new Map<string, FolderNode>();
      normalized.forEach(folder => byId.set(String(folder.id), folder));
      const roots: FolderNode[] = [];
      normalized.forEach(folder => {
        const parent = folder.parentFolderId == null ? null : byId.get(String(folder.parentFolderId));
        if (parent && parent !== folder) parent.children.push(folder);
        else roots.push(folder);
      });
      const setDepth = (nodes: FolderNode[], depth: number): void => nodes.forEach(node => { node.depth = depth; setDepth(node.children, depth + 1); });
      setDepth(roots, 0);
      return roots;
    }

    return await Promise.all(records.map(folder => this.loadFolderNode(folder, 0)));
  }

  private async loadFolderNode(folder: AnyRecord, depth: number): Promise<FolderNode> {
    const node = this.normalizeFolder(folder, depth);
    const embeddedChildren = this.asArray(folder?.children);
    if (embeddedChildren.length) {
      node.children = await Promise.all(embeddedChildren.map(child => this.loadFolderNode(child, depth + 1)));
      return node;
    }
    if (node.id == null) return node;
    try {
      const response = await this.request<AnyRecord[]>('get', `/folders/${encodeURIComponent(node.id)}/children`);
      const children = this.asArray(response).filter(child => this.normalizeFolder(child).id != null);
      node.children = await Promise.all(children.map(child => this.loadFolderNode(child, depth + 1)));
    } catch {
      // Keep the parent visible if this backend does not expose the optional children route.
      node.children = [];
    }
    return node;
  }

  get rootFolders(): FolderNode[] {
    return this.folders;
  }

  get selectedFolderChildren(): FolderNode[] {
    if (this.selectedFolderId == null) return this.folders;
    return this.allFolders.find(folder => this.sameId(folder.id, this.selectedFolderId))?.children || [];
  }

  get allFolders(): FolderNode[] {
    const result: FolderNode[] = [];
    const visit = (nodes: FolderNode[], depth: number): void => {
      for (const node of nodes) {
        result.push({ ...node, depth });
        visit(node.children || [], depth + 1);
      }
    };
    visit(this.folders, 0);
    return result;
  }

  folderName(folderId: number | string): string {
    return this.allFolders.find(folder => String(folder.id) === String(folderId))?.name || 'Folder';
  }

  get visibleFolders(): FolderNode[] {
    const result: FolderNode[] = [];
    const visit = (nodes: FolderNode[], depth: number): void => {
      for (const node of nodes) {
        result.push({ ...node, depth });
        if (node.expanded && node.children?.length) visit(node.children, depth + 1);
      }
    };
    visit(this.folders, 0);
    return result;
  }

  get visiblePages(): AnyRecord[] {
    const folderId = this.selectedFolderId;
    const q = this.searchText.toLowerCase().trim();
    return this.pages.filter(page => {
      const rawFolderId = page.folderId ?? page.folder_id ?? page.bookId ?? page.book_id ?? null;
      const pageFolderId = rawFolderId == null || String(rawFolderId).trim() === '' ? null : String(rawFolderId);
      const selectedId = folderId == null || String(folderId).trim() === '' ? null : String(folderId);
      const sameFolder = pageFolderId === selectedId;
      const matches = !q || `${page.title ?? page.name ?? ''} ${page.slug ?? ''} ${page.content ?? page.body ?? ''}`.toLowerCase().includes(q);
      return sameFolder && matches;
    });
  }

  openBook(folder: FolderNode): void {
    if (!this.sameId(this.selectedFolderId, folder.id)) {
      this.folderBackStack.push(this.selectedFolderId);
      this.folderForwardStack = [];
    }
    this.selectFolder(folder);
  }

  navigateFolderBack(): void {
    if (!this.folderBackStack.length) return;
    this.folderForwardStack.push(this.selectedFolderId);
    this.navigateToFolder(this.folderBackStack.pop() ?? null);
  }

  navigateFolderForward(): void {
    if (!this.folderForwardStack.length) return;
    this.folderBackStack.push(this.selectedFolderId);
    this.navigateToFolder(this.folderForwardStack.pop() ?? null);
  }

  navigateToFolder(folderId: number | null): void {
    if (folderId == null) {
      this.selectedFolderId = null;
      this.selectedPage = null;
      this.docFullScreen = false;
      this.editorMode = 'edit';
      this.pageViewMode = 'view';
      return;
    }
    const folder = this.allFolders.find(item => this.sameId(item.id, folderId));
    if (folder) this.selectFolder(folder);
  }

  selectFolder(folder: FolderNode): void {
    this.selectedFolderId = folder.id;
    this.selectedPage = null;
    this.editorMode = 'edit';
    this.pageViewMode = 'view';
    this.docFullScreen = false;
    this.pageDraft = { ...this.emptyPage(), spaceId: this.selectedSpace?.id, folderId: null };
    // Keep the selected book visible in the tree even when it was nested.
    const expandPath = (nodes: FolderNode[]): boolean => {
      for (const node of nodes) {
        if (this.sameId(node.id, folder.id)) return true;
        if (expandPath(node.children || [])) {
          node.expanded = true;
          return true;
        }
      }
      return false;
    };
    expandPath(this.folders);
  }

  toggleFolder(folderId: number | string): void {
    const toggle = (nodes: FolderNode[]): boolean => {
      for (const node of nodes) {
        if (String(node.id) === String(folderId)) {
          node.expanded = !node.expanded;
          return true;
        }
        if (toggle(node.children || [])) return true;
      }
      return false;
    };
    toggle(this.folders);
  }

  openFolderForm(parentFolderId: number | null = null): void {
    if (!this.selectedSpace) {
      this.errorMessage = 'Select a shelf first.';
      return;
    }
    this.folderDraft = { ...this.emptyFolder(), parentFolderId };
    this.showFolderForm = true;
  }

  async saveFolder(): Promise<void> {
    const name = this.folderDraft.name?.trim();
    if (!this.selectedSpace || !name) {
      this.errorMessage = 'Enter a book name.';
      return;
    }
    this.saving = true;
    this.clearMessages();
    try {
      const userId = this.getAuthenticatedUserId();
      const payload = { ...this.folderDraft, name, user_id: userId, createdBy: userId };
      const created = await this.request<AnyRecord>('post', `/spaces/${encodeURIComponent(this.selectedSpace.id)}/folders`, payload);
      this.showFolderForm = false;
      this.successMessage = 'Book created.';
      await this.selectSpace(this.selectedSpace);
      const createdFolder = created && typeof created === 'object' ? (created as AnyRecord).data ?? created : null;
      const createdId = createdFolder?.id ?? createdFolder?.folderId ?? createdFolder?.folder_id;
      if (createdId != null) {
        const match = this.allFolders.find(folder => this.sameId(folder.id, createdId));
        if (match) this.selectFolder(match);
      }
    } catch (error) {
      this.setError(error, 'Could not create the folder. Confirm the folder API is implemented.');
    } finally {
      this.saving = false;
    }
  }

  renameFolder(folder: FolderNode): void {
    this.renamingFolderId = folder.id;
    this.folderRenameDraft = String(folder.name || '');
  }

  cancelFolderRename(): void {
    this.renamingFolderId = null;
    this.folderRenameDraft = '';
  }

  async saveFolderRename(folder: FolderNode): Promise<void> {
    const name = this.folderRenameDraft.trim();
    if (!name || this.saving) return;
    this.saving = true;
    const payload = { name, updatedBy: this.getAuthenticatedUserId(), updated_by: this.getAuthenticatedUserId() };
    const routes: Array<{ method: 'patch' | 'put'; url: string }> = [
      { method: 'patch', url: `/folders/${encodeURIComponent(folder.id)}` },
      { method: 'put', url: `/folders/${encodeURIComponent(folder.id)}` },
      ...(this.selectedSpace ? [
        { method: 'patch' as const, url: `/spaces/${encodeURIComponent(this.selectedSpace.id)}/folders/${encodeURIComponent(folder.id)}` },
        { method: 'put' as const, url: `/spaces/${encodeURIComponent(this.selectedSpace.id)}/folders/${encodeURIComponent(folder.id)}` },
      ] : []),
    ];
    let lastError: unknown = null;
    try {
      let saved = false;
      for (const route of routes) {
        try { await this.request(route.method, route.url, payload); saved = true; break; }
        catch (error) { lastError = error; }
      }
      if (!saved) throw lastError || new Error('No supported folder update endpoint succeeded.');
      // Update the visible tree immediately, then refresh from the source of truth.
      const renameInTree = (nodes: FolderNode[]): void => nodes.forEach(node => {
        if (this.sameId(node.id, folder.id)) node.name = name;
        renameInTree(node.children || []);
      });
      renameInTree(this.folders);
      this.cancelFolderRename();
      if (this.selectedSpace) {
        const expandedIds = new Set(this.allFolders.filter(item => item.expanded).map(item => String(item.id)));
        const refreshed = await this.loadFolders(this.selectedSpace.id);
        const restore = (nodes: FolderNode[]): void => nodes.forEach(node => { node.expanded = expandedIds.has(String(node.id)); restore(node.children || []); });
        restore(refreshed);
        this.folders = refreshed;
      }
      this.successMessage = 'Book renamed.';
    } catch (error) {
      this.setError(error, 'Could not rename this book. The backend must expose a PATCH or PUT folder update endpoint.');
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async deleteFolder(folder: FolderNode): Promise<void> {
    if (!confirm(`Delete folder “${folder.name}”? The backend may reject deletion when it contains pages or subfolders.`)) return;
    try {
      await this.request<void>('delete', `/folders/${encodeURIComponent(folder.id)}`);
      if (String(this.selectedFolderId) === String(folder.id)) this.selectedFolderId = null;
      await this.selectSpace(this.selectedSpace!);
      this.successMessage = 'Folder deleted.';
    } catch (error) {
      this.setError(error, 'Could not delete the folder. It may contain pages or subfolders.');
    }
  }

  openSpaceForm(): void {
    this.spaceDraft = this.emptySpace();
    this.showSpaceForm = true;
  }

  async saveSpace(): Promise<void> {
    const name = this.spaceDraft.name?.trim();

    if (!name) {
      this.errorMessage = 'Enter a shelf name.';
      return;
    }

    const userId = this.getAuthenticatedUserId();

    if (userId === null) {
      this.errorMessage =
        'Logged-in user ID was not found. Check your authentication session.';
      return;
    }

    this.saving = true;
    this.clearMessages();

    const payload = {
      ...this.spaceDraft,
      user_id: userId,
      createdBy: userId,
      name,
      slug: this.spaceDraft.slug?.trim() || this.slugify(name),
    };

    try {

      const created = await this.request<AnyRecord>(
        'post',
        '/spaces',
        payload
      );

      this.showSpaceForm = false;
      this.successMessage = 'Documentation space created.';

      await this.loadInitialData();

      const target = created?.id
        ? this.spaces.find(
          s => String(s.id) === String(created.id)
        )
        : this.spaces.find(s => s.slug === payload.slug);

      if (target) {
        await this.selectSpace(target);
      }
    } catch (error) {
      this.setError(
        error,
        'Could not create the documentation space.'
      );
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
      this.errorMessage = 'Select a shelf first.';
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
    const changed = this.activeTab !== tab;
    this.activeTab = tab;
    this.clearMessages();
    if (tab === 'pages' && this.selectedSpace && (changed || this.loadedSpaceKey !== String(this.selectedSpace.id) || !this.pages.length || !this.folders.length)) {
      void this.selectSpace(this.selectedSpace);
    }
    if (tab === 'pages' && !this.selectedSpace && !this.loading) void this.loadInitialData();
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

  private emptyFolder(): AnyRecord { return { name: '', description: '', parentFolderId: null }; }
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



  private getAuthenticatedUserId(): number | null {
    const authenticatedId = this.auth.getCurrentUserId();
    if (authenticatedId !== null) return authenticatedId;

    if (typeof localStorage === 'undefined') {
      return null;
    }

    const readId = (value: unknown): number | null => {
      if (value === null || value === undefined || value === '') {
        return null;
      }

      const id = Number(value);
      return Number.isFinite(id) && id > 0 ? id : null;
    };

    // Accept the full account session and older numeric-ID sessions.
    const storedUser = localStorage.getItem('user');

    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);

        // Resolve the account ID from either supported session format.
        const id = readId(
          typeof parsed === 'object' && parsed !== null
            ? parsed.id ?? parsed.user_id ?? parsed.userId
            : parsed
        );

        if (id !== null) {
          return id;
        }
      } catch {
        const id = readId(storedUser);
        if (id !== null) {
          return id;
        }
      }
    }

    // Fallback: extract the user ID from the JWT if available.
    const token = localStorage.getItem('token');

    if (token && token.split('.').length === 3) {
      try {
        const payloadPart = token.split('.')[1];
        const normalized = payloadPart
          .replace(/-/g, '+')
          .replace(/_/g, '/');

        const payload = JSON.parse(atob(normalized));

        return readId(
          payload?.user_id ??
          payload?.userId ??
          payload?.id ??
          payload?.sub
        );
      } catch {
        // Continue to the null result below.
      }
    }

    return null;
  }


}
