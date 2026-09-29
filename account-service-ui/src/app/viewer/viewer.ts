import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  HostListener,
  Inject,
  PLATFORM_ID,
  inject
} from '@angular/core';

import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { EditProfileDialog } from '../edit-profile-dialog/edit-profile-dialog';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../environment';
import { AuthService } from '../auth.service';

import { forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';

type ViewerType = 'EPIC' | 'STORY' | 'TASK' | 'ISSUE';

@Component({
  selector: 'app-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './viewer.html',
  styleUrls: ['./viewer.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Viewer implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly dialog = inject(MatDialog);
  private readonly platformId = inject(PLATFORM_ID);

  /**
   * Use the same application API base as the Epics / Stories / Tasks workspace.
   * apiBaseUrl points at the legacy/auth API in some environments, while
   * apiBaseUrlM is the application CRUD API used by the current screens.
   */
  readonly baseUrl = environment.apiBaseUrlM || environment.apiBaseUrlM;
  readonly baseUrl2 = environment.apiBaseUrlM || environment.apiBaseUrlM || environment.apiBaseUrlM;

  type: ViewerType | null = null;
  itemId: number | null = null;
  projectId: number | null = null;

  loading = true;
  saving = false;
  errorMessage = '';
  editMode = false;
  // Exact UserHome navigation state
  isCollapsed = false;
  activeMenu = 'dashboard';
  searchQuery = '';
  createMenuOpen = false;
  profileMenuOpen = false;

  // Viewer-specific state
  navCollapsed = false;
  searchText = '';
  toastMessage = '';
  showAllFields = false;
  showRawData = false;
  descriptionEditor: HTMLElement | null = null;
  commentDraft = '';

  currentItem: any = null;
  epic: any = null;
  story: any = null;
  task: any = null;
  issue: any = null;

  project: any = null;
  sprint: any = null;
  assignee: any = null;
  reporter: any = null;
  team: any = null;
  parentEpic: any = null;
  parentStory: any = null;

  editModel: any = {};

  readonly statusOptions = [
    'BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW',
    'TESTING', 'COMPLETED', 'BLOCKED', 'CANCELLED'
  ];

  readonly issueStatusOptions = [
    'OPEN', 'BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW',
    'TESTING', 'RESOLVED', 'COMPLETED', 'CLOSED', 'BLOCKED'
  ];

  readonly priorityOptions = [
    'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  ];


  // =========================================================
  // EXACT USERHOME NAVIGATION
  // =========================================================

  readonly primaryNavigation = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'products', label: 'Products', icon: 'products' },
    { id: 'projects', label: 'Projects', icon: 'projects' },
    { id: 'epics', label: 'Epics & Backlogs', icon: 'epics' },
    { id: 'issues', label: 'Issues', icon: 'issues' },
    { id: 'test-cases', label: 'Test Cases', icon: 'tests' },
    { id: 'releases', label: 'Releases', icon: 'releases' },
    { id: 'docs', label: 'Documentation', icon: 'docs' }
  ];

  readonly administrationNavigation = [
    { id: 'roles', label: 'Roles', icon: 'roles' },
    { id: 'users', label: 'Users', icon: 'users' },
    { id: 'teams', label: 'Teams', icon: 'teams' }
  ];

  readonly createItems = [
    { id: 'epic', label: 'Epic', icon: 'epics' },
    { id: 'story', label: 'Story', icon: 'story' },
    { id: 'task', label: 'Task', icon: 'task' },
    { id: 'issue', label: 'Issue', icon: 'issues' },
    { id: 'test-case', label: 'Test Case', icon: 'tests' },
    { id: 'release', label: 'Release', icon: 'releases' }
  ];

  user = {
    name: 'Giridhar Sundeep',
    email: 'giridharsundeep.pro@gmail.com',
    phone: '7799165659',
    image: null as string | ArrayBuffer | null
  };

  projects: any[] = [];
  users: any[] = [];
  teams: any[] = [];
  sprints: any[] = [];

  stories: any[] = [];
  tasks: any[] = [];
  issues: any[] = [];
  testCases: any[] = [];
  comments: any[] = [];
  activity: any[] = [];

  // Explicit relationship collections used by the template.
  projectEpics: any[] = [];
  projectStories: any[] = [];
  projectTasks: any[] = [];
  childStories: any[] = [];
  childTasks: any[] = [];

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const rawType = (params.get('type') || '').toUpperCase();
      const rawId = Number(params.get('id'));
      const queryProjectId = Number(
        this.route.snapshot.queryParamMap.get('projectId')
      );

      this.type = this.isValidType(rawType)
        ? rawType as ViewerType
        : null;

      this.itemId =
        Number.isFinite(rawId) && rawId > 0 ? rawId : null;

      this.projectId =
        Number.isFinite(queryProjectId) && queryProjectId > 0
          ? queryProjectId
          : null;

      this.activeMenu = this.viewerMenuForType(this.type);
      this.resetState();

      if (!this.type || this.itemId === null) {
        this.loading = false;
        this.errorMessage = 'Invalid viewer URL.';
        this.cdr.markForCheck();
        return;
      }

      this.loadViewerData();
    });
  }

  private isValidType(value: string): boolean {
    return ['EPIC', 'STORY', 'TASK', 'ISSUE'].includes(value);
  }

  private headers() {
    return {
      headers: this.auth.getAuthHeaders()
    };
  }

  private resetState(): void {
    this.loading = true;
    this.saving = false;
    this.errorMessage = '';
    this.editMode = false;
    this.currentItem = null;

    this.epic = null;
    this.story = null;
    this.task = null;
    this.issue = null;

    this.project = null;
    this.sprint = null;
    this.assignee = null;
    this.reporter = null;
    this.team = null;
    this.parentEpic = null;
    this.parentStory = null;

    this.projects = [];
    this.users = [];
    this.teams = [];
    this.sprints = [];

    this.stories = [];
    this.tasks = [];
    this.issues = [];

    this.projectEpics = [];
    this.projectStories = [];
    this.projectTasks = [];
    this.childStories = [];
    this.childTasks = [];
    this.testCases = [];
    this.comments = [];
    this.activity = [];

    this.editModel = {};
    this.showAllFields = false;
    this.showRawData = false;
    this.descriptionEditor = null;
    this.commentDraft = '';
  }

  private unwrap(response: any): any {
    return response?.data ??
      response?.item ??
      response?.result ??
      response;
  }

  private toArray(response: any): any[] {
    if (Array.isArray(response)) return response;

    const data = this.unwrap(response);
    if (Array.isArray(data)) return data;

    if (!data || typeof data !== 'object') return [];

    const keys = [
      'items', 'results', 'records',
      'projects', 'users', 'teams', 'sprints',
      'epics', 'stories', 'tasks',
      'issues', 'testCases', 'testcases',
      'comments', 'commentList', 'activities',
      'activity', 'history'
    ];

    for (const key of keys) {
      if (Array.isArray(data[key])) {
        return data[key];
      }
    }

    return [];
  }

  private getItemUrl(): string {
    switch (this.type) {
      case 'EPIC':
        return `${this.baseUrl}/epics/${this.itemId}`;
      case 'STORY':
        return `${this.baseUrl}/stories/${this.itemId}`;
      case 'TASK':
        return `${this.baseUrl}/tasks/${this.itemId}`;
      case 'ISSUE':
        return `${this.baseUrl2}/v1/issues/${this.itemId}`;
      default:
        return '';
    }
  }

  private loadViewerData(): void {
    this.loading = true;
    this.errorMessage = '';

    const projectId = Number(this.projectId || 0);

    // Load the selected item first. Related collections are loaded after it.
    // STORY is deliberately handled through the project/global collection
    // because that API is the reliable source in this application.
    if (this.type === 'STORY') {
      this.loadStoryPrimary(projectId);
      return;
    }

    const url = this.getItemUrl();
    if (!url) {
      this.loading = false;
      this.errorMessage = 'Invalid viewer URL.';
      this.cdr.markForCheck();
      return;
    }

    this.http.get<any>(url, this.headers()).pipe(
      catchError(error => {
        console.error('Viewer item API failed:', error);

        // Fall back to collection endpoints when the singular endpoint
        // is not available.
        return this.loadFromCollectionFallback(projectId);
      }),
      finalize(() => {
        this.loading = false;
        this.cdr.markForCheck();
      })
    ).subscribe(response => {
      if (!response) {
        if (!this.errorMessage) {
          this.errorMessage =
            `Unable to load ${this.type} #${this.itemId}.`;
        }
        return;
      }

      const data = this.unwrap(response);

      if (Array.isArray(data)) {
        const selected = this.findSelected(data);
        if (!selected) {
          this.errorMessage =
            `${this.type} #${this.itemId} was not found.`;
          return;
        }
        this.assignCurrentItem(selected);
        this.extractEmbeddedRelations(selected);
        this.loadAllSupportingData(selected);
        return;
      }

      this.assignCurrentItem(data);
      this.extractEmbeddedRelations(data);
      this.loadAllSupportingData(data);
    });
  }

  private loadStoryPrimary(projectId: number): void {
    const urls: string[] = [];

    if (projectId > 0) {
      urls.push(`${this.baseUrl}/projects/${projectId}/stories`);
    }

    urls.push(`${this.baseUrl}/stories`);

    if (this.itemId) {
      urls.push(`${this.baseUrl}/stories/${this.itemId}`);
    }

    this.loadStoryFromCandidates(urls, 0);
  }

  private loadStoryFromCandidates(
    urls: string[],
    index: number
  ): void {
    if (index >= urls.length) {
      this.loading = false;
      this.errorMessage =
        `STORY #${this.itemId} was not found.`;
      this.cdr.markForCheck();
      return;
    }

    const url = urls[index];

    this.http.get<any>(url, this.headers()).pipe(
      catchError(error => {
        console.warn(
          'Story endpoint failed:',
          url,
          error?.status
        );
        return of(null);
      })
    ).subscribe(response => {
      if (!response) {
        this.loadStoryFromCandidates(urls, index + 1);
        return;
      }

      const array = this.toArray(response);

      if (array.length) {
        const selected = this.findSelected(array);

        // A successful 200 with stories from the wrong project must NOT
        // stop the fallback chain. Continue until the requested story is
        // actually found.
        if (!selected) {
          this.loadStoryFromCandidates(urls, index + 1);
          return;
        }

        this.assignCurrentItem(selected);
        this.extractEmbeddedRelations(selected);
        this.loadAllSupportingData(selected);

        this.loading = false;
        this.cdr.markForCheck();
        return;
      }

      const data = this.unwrap(response);

      if (
        data &&
        typeof data === 'object' &&
        Number(
          data?.id ??
          data?.story_id ??
          data?.storyId
        ) === Number(this.itemId)
      ) {
        this.assignCurrentItem(data);
        this.extractEmbeddedRelations(data);
        this.loadAllSupportingData(data);

        this.loading = false;
        this.cdr.markForCheck();
        return;
      }

      this.loadStoryFromCandidates(urls, index + 1);
    });
  }

  private getFirstSuccessfulResponse(urls: string[]) {
    const candidates = urls.filter(Boolean);

    const attempt = (index: number): any => {
      if (index >= candidates.length) {
        return of(null);
      }

      return this.http.get<any>(
        candidates[index],
        this.headers()
      ).pipe(
        catchError(error => {
          console.warn(
            'Viewer fallback endpoint failed:',
            candidates[index],
            error?.status
          );
          return attempt(index + 1);
        })
      );
    };

    return attempt(0);
  }

  private loadFromCollectionFallback(projectId: number) {
    let urls: string[] = [];

    switch (this.type) {
      case 'EPIC':
        urls = projectId > 0
          ? [
              `${this.baseUrl}/projects/${projectId}/epics`,
              `${this.baseUrl}/epics`
            ]
          : [`${this.baseUrl}/epics`];
        break;

      case 'TASK':
        urls = [`${this.baseUrl}/tasks`];
        break;

      case 'ISSUE':
        urls = [
          `${this.baseUrl2}/v1/issues?projectId=${projectId}`,
          `${this.baseUrl2}/issues`
        ];
        break;

      default:
        urls = [];
    }

    if (!urls.length) {
      return of(null);
    }

    return this.getFirstSuccessfulResponse(urls);
  }

  private assignCurrentItem(data: any): void {
    this.currentItem = data;

    switch (this.type) {
      case 'EPIC':
        this.epic = data;
        break;
      case 'STORY':
        this.story = data;
        break;
      case 'TASK':
        this.task = data;
        break;
      case 'ISSUE':
        this.issue = data;
        break;
    }

    this.resolveReferences(data);
  }

  private extractEmbeddedRelations(data: any): void {
    this.stories = this.firstArray(
      data?.stories,
      data?.story_list,
      data?.storyList
    );

    this.tasks = this.firstArray(
      data?.tasks,
      data?.task_list,
      data?.taskList
    );

    this.issues = this.firstArray(
      data?.issues,
      data?.linkedIssues,
      data?.linked_issues
    );

    this.testCases = this.firstArray(
      data?.testCases,
      data?.test_cases,
      data?.testcases
    );

    this.comments = this.firstArray(
      data?.comments,
      data?.commentList,
      data?.comment_list
    );

    this.activity = this.firstArray(
      data?.activity,
      data?.activities,
      data?.history,
      data?.audit
    );
  }

  private firstArray(...values: any[]): any[] {
    for (const value of values) {
      if (Array.isArray(value)) return value;
    }
    return [];
  }

  private loadAllSupportingData(data: any): void {
    const projectId = this.firstNumericId(
      this.projectId,
      data?.projectId,
      data?.project_id,
      data?.project?.id
    );

    if (projectId > 0 && this.projectId === null) {
      this.projectId = projectId;
    }

    // Always load the base collections. The repositories supplied for this
    // application expose:
    //   /projects
    //   /users
    //   /teams
    //   /sprints
    //   /stories
    //   /tasks
    // plus project-scoped stories/epics and story-scoped tasks.
    const requests: any[] = [
      this.http.get<any>(`${this.baseUrl}/projects`, this.headers())
        .pipe(catchError(() => of(null))),

      this.http.get<any>(`${this.baseUrl}/users`, this.headers())
        .pipe(catchError(() => of(null))),

      this.http.get<any>(`${this.baseUrl}/teams`, this.headers())
        .pipe(catchError(() => of(null))),

      this.http.get<any>(`${this.baseUrl}/sprints`, this.headers())
        .pipe(catchError(() => of(null))),

      this.http.get<any>(`${this.baseUrl}/stories`, this.headers())
        .pipe(catchError(() => of(null))),

      this.http.get<any>(`${this.baseUrl}/tasks`, this.headers())
        .pipe(catchError(() => of(null))),

      this.http.get<any>(`${this.baseUrl2}/v1/issues`, this.headers())
        .pipe(catchError(() => of(null))),

      this.http.get<any>(`${this.baseUrl2}/testcases`, this.headers())
        .pipe(catchError(() => of(null)))
    ];

    // Project stories and epics are particularly important because the
    // supplied repositories expose get_stories_by_project/get_epics_by_project.
    if (projectId > 0) {
      requests.push(
        this.http.get<any>(
          `${this.baseUrl}/projects/${projectId}/stories`,
          this.headers()
        ).pipe(catchError(() => of(null)))
      );

      requests.push(
        this.http.get<any>(
          `${this.baseUrl}/projects/${projectId}/epics`,
          this.headers()
        ).pipe(catchError(() => of(null)))
      );
    } else {
      requests.push(of(null));
      requests.push(of(null));
    }

    // Story -> Tasks is explicitly supported by TasksRepository.
    if (this.type === 'STORY' && this.itemId) {
      requests.push(
        this.http.get<any>(
          `${this.baseUrl}/stories/${this.itemId}/tasks`,
          this.headers()
        ).pipe(catchError(() => of(null)))
      );
    } else {
      requests.push(of(null));
    }

    forkJoin(requests).pipe(
      finalize(() => {
        this.loading = false;
        this.cdr.markForCheck();
      })
    ).subscribe((results: any[]) => {
      this.projects = this.toArray(results[0]);
      this.users = this.toArray(results[1]);
      this.teams = this.toArray(results[2]);
      this.sprints = this.toArray(results[3]);

      const globalStories = this.toArray(results[4]);
      const globalTasks = this.toArray(results[5]);
      const globalIssues = this.toArray(results[6]);
      const globalTestCases = this.toArray(results[7]);
      const projectStories = this.toArray(results[8]);
      const projectEpics = this.toArray(results[9]);
      const directStoryTasks = this.toArray(results[10]);

      this.projectEpics = this.mergeUnique([], projectEpics);
      this.projectStories = this.mergeUnique([], projectStories);
      this.projectTasks = this.mergeUnique([], globalTasks);

      this.stories = this.mergeUnique(
        globalStories,
        projectStories
      );

      this.tasks = this.mergeUnique(
        globalTasks,
        directStoryTasks
      );

      this.issues = this.mergeUnique(this.issues, globalIssues);
      this.testCases = this.mergeUnique(this.testCases, globalTestCases);

      // Embedded children returned by a singular endpoint are authoritative
      // additions and are merged into the corresponding collection.
      if (this.type === 'EPIC') {
        this.stories = this.mergeUnique(
          this.stories,
          this.firstArray(
            this.currentItem?.stories,
            this.currentItem?.story_list,
            this.currentItem?.storyList
          )
        );
      }

      if (this.type === 'STORY') {
        this.tasks = this.mergeUnique(
          this.tasks,
          this.firstArray(
            this.currentItem?.tasks,
            this.currentItem?.task_list,
            this.currentItem?.taskList
          )
        );
      }

      /*
       * IMPORTANT:
       * Filter using the database relationships shown by the supplied
       * repositories:
       *
       * stories.epic_id  -> epics.id
       * tasks.story_id   -> stories.id
       */
      const currentId = Number(this.itemId);

      if (this.type === 'EPIC') {
        this.childStories = this.stories.filter(story =>
          this.firstNumericId(
            story?.epic_id,
            story?.epicId,
            story?.epic?.id
          ) === currentId
        );

        this.stories = [...this.childStories];
      }

      if (this.type === 'STORY') {
        this.childTasks = this.tasks.filter(task =>
          this.firstNumericId(
            task?.story_id,
            task?.storyId,
            task?.story?.id
          ) === currentId
        );

        this.tasks = [...this.childTasks];
      }

      if (this.type === 'TASK') {
        this.tasks = this.tasks.filter(task =>
          Number(task?.id ?? task?.task_id) === currentId
        );
      }

      // Use the same issue propagation semantics as the Epics workspace:
      // Epic issues include direct + descendant Story/Task issues;
      // Story issues include direct + child Task issues;
      // Task issues remain directly linked only.
      this.issues = this.issuesForCurrentItem(currentId);

      // Resolve hierarchy from the correct collection.
      this.resolveReferencesFromCollections();
      this.autoPopulatePeople();

      // Make sure the current item has the normalized IDs used by the edit
      // form, without overwriting the original API values.
      this.normaliseEditSource();

      this.cdr.markForCheck();
    });
  }

  private relationIds(item: any, type: 'EPIC' | 'STORY' | 'TASK'): number[] {
    if (!item) return [];

    const fieldPairs: Record<'EPIC' | 'STORY' | 'TASK', string[]> = {
      EPIC: ['epicId', 'epic_id', 'epic'] ,
      STORY: ['storyId', 'story_id', 'story'],
      TASK: ['taskId', 'task_id', 'task']
    };

    const ids: number[] = [];
    for (const key of fieldPairs[type]) {
      const value = item?.[key];
      const id = typeof value === 'object'
        ? this.firstNumericId(value?.id, value?.[`${key}_id`])
        : this.firstNumericId(value);
      if (id > 0) ids.push(id);
    }

    const pluralKey = type === 'EPIC' ? 'epicIds' : type === 'STORY' ? 'storyIds' : 'taskIds';
    for (const value of (Array.isArray(item?.[pluralKey]) ? item[pluralKey] : [])) {
      const id = this.firstNumericId(value);
      if (id > 0) ids.push(id);
    }

    for (const allocation of (Array.isArray(item?.allocations) ? item.allocations : [])) {
      const allocationType = String(
        allocation?.allocatableType ?? allocation?.allocatable_type ?? ''
      ).toUpperCase();
      if (allocationType !== type) continue;

      const id = this.firstNumericId(
        allocation?.allocatableId,
        allocation?.allocatable_id,
        allocation?.allocatable?.id
      );
      if (id > 0) ids.push(id);
    }

    return [...new Set(ids)];
  }

  private issuesForCurrentItem(currentId: number): any[] {
    const source = this.issues || [];
    if (!currentId || !this.type) return [];

    if (this.type === 'ISSUE') return [];

    const issueMatches = (issue: any): boolean => {
      const epicIds = new Set(this.relationIds(issue, 'EPIC'));
      const storyIds = new Set(this.relationIds(issue, 'STORY'));
      const taskIds = new Set(this.relationIds(issue, 'TASK'));

      if (this.type === 'EPIC') {
        if (epicIds.has(currentId)) return true;

        const storyIdsForEpic = new Set(
          (this.childStories || [])
            .map(story => this.firstNumericId(story?.id, story?.story_id, story?.storyId))
            .filter(id => id > 0)
        );
        const taskIdsForEpic = new Set(
          (this.childTasks || [])
            .map(task => this.firstNumericId(task?.id, task?.task_id, task?.taskId))
            .filter(id => id > 0)
        );

        return [...storyIds].some(id => storyIdsForEpic.has(id)) ||
          [...taskIds].some(id => taskIdsForEpic.has(id));
      }

      if (this.type === 'STORY') {
        if (storyIds.has(currentId)) return true;

        const taskIdsForStory = new Set(
          (this.childTasks || [])
            .map(task => this.firstNumericId(task?.id, task?.task_id, task?.taskId))
            .filter(id => id > 0)
        );
        return [...taskIds].some(id => taskIdsForStory.has(id));
      }

      return taskIds.has(currentId);
    };

    return source.filter(issueMatches);
  }

  public isBlockingIssue(item: any): boolean {
    return Boolean(
      item?.isBlocking ??
      item?.is_blocking ??
      item?.blocking ??
      item?.blocksLinkedWork ??
      item?.blocks_linked_work
    );
  }

  public getBlockingIssues(items: any[] | null | undefined): any[] {
    return (items || []).filter(item => this.isBlockingIssue(item));
  }

  public getBlockingIssueCodes(items: any[] | null | undefined): string {
    return this.getBlockingIssues(items)
      .map(item =>
        item?.issueCode ||
        item?.issue_code ||
        item?.code ||
        `#${item?.id}`
      )
      .join(', ');
  }

  public isCurrentItemBlocking(): boolean {
    return this.type === 'ISSUE' && this.isBlockingIssue(this.currentItem);
  }

  public currentItemBlockingCount(): number {
    return this.getBlockingIssues(this.issues).length;
  }

  public issueLinkedWork(): Array<{
    type: 'EPIC' | 'STORY' | 'TASK';
    id: number;
    code: string;
    title: string;
  }> {
    if (this.type !== 'ISSUE') return [];

    const result: Array<{
      type: 'EPIC' | 'STORY' | 'TASK';
      id: number;
      code: string;
      title: string;
    }> = [];

    const add = (type: 'EPIC' | 'STORY' | 'TASK', id: number) => {
      if (!id || result.some(item => item.type === type && item.id === id)) return;

      const collections = {
        EPIC: this.projectEpics,
        STORY: this.projectStories.length ? this.projectStories : this.stories,
        TASK: this.projectTasks.length ? this.projectTasks : this.tasks
      };

      const item = (collections[type] || []).find(candidate =>
        this.firstNumericId(candidate?.id, candidate?.[`${type.toLowerCase()}_id`], candidate?.[`${type.toLowerCase()}Id`]) === id
      );

      result.push({
        type,
        id,
        code:
          type === 'EPIC'
            ? item?.epic_code || item?.epicCode || `EPIC-${id}`
            : type === 'STORY'
              ? item?.story_code || item?.storyCode || `STORY-${id}`
              : item?.task_code || item?.taskCode || `TASK-${id}`,
        title:
          item?.title ||
          item?.name ||
          item?.summary ||
          `${type} #${id}`
      });
    };

    for (const id of this.relationIds(this.currentItem, 'EPIC')) add('EPIC', id);
    for (const id of this.relationIds(this.currentItem, 'STORY')) add('STORY', id);
    for (const id of this.relationIds(this.currentItem, 'TASK')) add('TASK', id);

    // Nested relation objects are a useful fallback when only expanded
    // allocations are returned by the API.
    add('EPIC', this.firstNumericId(this.currentItem?.epic?.id, this.currentItem?.epic_id, this.currentItem?.epicId));
    add('STORY', this.firstNumericId(this.currentItem?.story?.id, this.currentItem?.story_id, this.currentItem?.storyId));
    add('TASK', this.firstNumericId(this.currentItem?.task?.id, this.currentItem?.task_id, this.currentItem?.taskId));

    return result;
  }

  public issueLinkedWorkCount(): number {
    return this.issueLinkedWork().length;
  }

  private normaliseEditSource(): void {
    if (!this.currentItem) return;

    const item = this.currentItem;

    const assigneeId = this.firstNumericId(
      item?.assignee_user_id,
      item?.assigneeUserId,
      item?.assigneeId,
      item?.assignee_id,
      item?.assignee?.id,
      item?.assignee?.user_id
    );

    const reporterId = this.firstNumericId(
      item?.reporter_user_id,
      item?.reporterUserId,
      item?.reporterId,
      item?.reporter_id,
      item?.reporter?.id,
      item?.reporter?.user_id
    );

    const sprintId = this.firstNumericId(
      item?.sprint_id,
      item?.sprintId,
      item?.sprint?.id
    );

    const epicId = this.firstNumericId(
      item?.epic_id,
      item?.epicId,
      item?.epic?.id
    );

    const storyId = this.firstNumericId(
      item?.story_id,
      item?.storyId,
      item?.story?.id
    );

    this.currentItem = {
      ...item,
      assignee_user_id: assigneeId || null,
      reporter_user_id: reporterId || null,
      sprint_id: sprintId || null,
      epic_id: epicId || null,
      story_id: storyId || null
    };
  }

  private mergeUnique(current: any[], incoming: any[]): any[] {
    const map = new Map<string, any>();

    for (const item of current || []) {
      const key = String(
        item?.id ??
        item?.issue_id ??
        item?.testcase_id ??
        JSON.stringify(item)
      );
      map.set(key, item);
    }

    for (const item of incoming || []) {
      const key = String(
        item?.id ??
        item?.issue_id ??
        item?.testcase_id ??
        JSON.stringify(item)
      );
      map.set(key, item);
    }

    return [...map.values()];
  }

  private filterRelations(): void {
    const id = Number(this.itemId);
    if (!id) return;

    // Always derive children from the actual parent relationship.
    if (this.type === 'EPIC') {
      this.stories = this.relationOrAll(
        this.stories,
        ['epicId', 'epic_id'],
        id
      );

      this.childStories = [...this.stories];

      this.issues = this.relationOrAll(
        this.issues,
        ['epicId', 'epic_id'],
        id
      );

      this.testCases = this.relationOrAll(
        this.testCases,
        ['epicId', 'epic_id'],
        id
      );
    }

    if (this.type === 'STORY') {
      this.tasks = this.relationOrAll(
        this.tasks,
        ['storyId', 'story_id'],
        id
      );

      this.childTasks = [...this.tasks];

      this.issues = this.relationOrAll(
        this.issues,
        ['storyId', 'story_id'],
        id
      );

      this.testCases = this.relationOrAll(
        this.testCases,
        ['storyId', 'story_id'],
        id
      );
    }

    if (this.type === 'TASK') {
      this.issues = this.relationOrAll(
        this.issues,
        ['taskId', 'task_id'],
        id
      );

      this.testCases = this.relationOrAll(
        this.testCases,
        ['taskId', 'task_id'],
        id
      );
    }
  }

  private relationOrAll(
    items: any[],
    keys: string[],
    id: number
  ): any[] {
    const source = items || [];
    if (!id) return [];

    const matched = source.filter(item => {
      const value = this.firstNumericId(
        item?.[keys[0]],
        item?.[keys[1]],
        item?.[keys[0]]?.id,
        item?.[keys[1]]?.id
      );
      return value === id;
    });

    // IMPORTANT:
    // Never return the entire collection when no relationship matched.
    // Returning the source here caused every Story/Task/Issue to appear
    // under unrelated parents.
    return matched;
  }

  private resolveReferences(data: any): void {
    this.project =
      data?.project ??
      data?.projectInfo ??
      null;

    this.sprint =
      data?.sprint ??
      data?.sprintInfo ??
      null;

    this.assignee =
      data?.assignee ??
      data?.assigneeUser ??
      data?.assignee_user ??
      null;

    this.reporter =
      data?.reporter ??
      data?.reporterUser ??
      data?.reporter_user ??
      null;

    this.team = data?.team ?? null;

    this.parentEpic =
      data?.epic ??
      data?.parentEpic ??
      data?.parent_epic ??
      null;

    this.parentStory =
      data?.story ??
      data?.parentStory ??
      data?.parent_story ??
      null;
  }

  private resolveReferencesFromCollections(): void {
    const item = this.currentItem;
    if (!item) return;

    const projectId = this.firstNumericId(
      item?.projectId,
      item?.project_id,
      item?.project?.id,
      this.project?.id,
      this.projectId
    );

    const sprintId = this.firstNumericId(
      item?.sprintId,
      item?.sprint_id,
      item?.sprint?.id,
      this.sprint?.id
    );

    const assigneeId = this.firstNumericId(
      item?.assigneeUserId,
      item?.assignee_user_id,
      item?.assigneeId,
      item?.assignee_id,
      item?.assignedUserId,
      item?.assigned_user_id,
      item?.assignedToId,
      item?.assigned_to_id,
      item?.assignee?.id,
      item?.assigneeUser?.id,
      item?.assignee_user?.id
    );

    const reporterId = this.firstNumericId(
      item?.reporterUserId,
      item?.reporter_user_id,
      item?.reporterId,
      item?.reporter_id,
      item?.reportedById,
      item?.reported_by_id,
      item?.reporter?.id,
      item?.reporterUser?.id,
      item?.reporter_user?.id
    );

    const teamId = this.firstNumericId(
      item?.teamId,
      item?.team_id,
      item?.team?.id
    );

    const epicId = this.firstNumericId(
      item?.epicId,
      item?.epic_id,
      item?.epic?.id,
      item?.parentEpic?.id,
      item?.parent_epic?.id
    );

    const storyId = this.firstNumericId(
      item?.storyId,
      item?.story_id,
      item?.story?.id,
      item?.parentStory?.id,
      item?.parent_story?.id
    );

    if (!this.project && projectId > 0) {
      this.project = this.findById(
        this.projects,
        projectId,
        ['id', 'project_id']
      );
    }

    if (!this.sprint && sprintId > 0) {
      this.sprint = this.findById(
        this.sprints,
        sprintId,
        ['id', 'sprint_id']
      );
    }

    if (!this.assignee) {
      this.assignee =
        this.extractPerson(item?.assignee) ??
        this.extractPerson(item?.assigneeUser) ??
        this.extractPerson(item?.assignee_user) ??
        this.findById(
          this.users,
          assigneeId,
          ['id', 'user_id', 'uid']
        );
    }

    if (!this.reporter) {
      this.reporter =
        this.extractPerson(item?.reporter) ??
        this.extractPerson(item?.reporterUser) ??
        this.extractPerson(item?.reporter_user) ??
        this.findById(
          this.users,
          reporterId,
          ['id', 'user_id', 'uid']
        );
    }

    if (!this.team && teamId > 0) {
      this.team = this.findById(
        this.teams,
        teamId,
        ['id', 'team_id']
      );
    }

    if (!this.parentEpic && epicId > 0) {
      // IMPORTANT: an Epic must be resolved from EPICS, never from STORIES.
      this.parentEpic = this.findById(
        this.projectEpics,
        epicId,
        ['id', 'epic_id', 'epicId']
      );
    }

    if (!this.parentStory && storyId > 0) {
      // Story belongs to stories, not tasks.
      this.parentStory = this.findById(
        this.stories,
        storyId,
        ['id', 'story_id']
      );
    }
  }

  public firstNumericId(...values: any[]): number {
    for (const value of values) {
      const id = Number(value);
      if (Number.isFinite(id) && id > 0) {
        return id;
      }
    }
    return 0;
  }

  private extractPerson(value: any): any {
    if (!value) return null;

    if (typeof value === 'string') {
      return { name: value };
    }

    if (typeof value === 'object') {
      return value;
    }

    return null;
  }

  /**
   * Resolve Assignee and Reporter strictly from the selected item's data.
   *
   * NEVER use the logged-in user as a fallback. Every item can have a
   * different assignee and reporter, so falling back to the current user
   * makes every item appear to have the same people.
   */
  private autoPopulatePeople(): void {
    const item = this.currentItem;
    if (!item) {
      this.assignee = null;
      this.reporter = null;
      return;
    }

    const assigneeId = this.firstNumericId(
      item?.assignee_user_id,
      item?.assigneeUserId,
      item?.assigneeId,
      item?.assignee_id,
      item?.assignedUserId,
      item?.assigned_user_id,
      item?.assignedToId,
      item?.assigned_to_id,
      item?.assignee?.id,
      item?.assignee?.user_id,
      item?.assigneeUser?.id,
      item?.assignee_user?.id
    );

    const reporterId = this.firstNumericId(
      item?.reporter_user_id,
      item?.reporterUserId,
      item?.reporterId,
      item?.reporter_id,
      item?.reportedById,
      item?.reported_by_id,
      item?.reporter?.id,
      item?.reporter?.user_id,
      item?.reporterUser?.id,
      item?.reporter_user?.id
    );

    // Assignee and Reporter are deliberately resolved independently.
    // Never use the current logged-in user as a fallback.
    this.assignee =
      this.extractPerson(item?.assignee) ??
      this.extractPerson(item?.assigneeUser) ??
      this.extractPerson(item?.assignee_user) ??
      (assigneeId > 0
        ? this.findById(this.users, assigneeId, ['id', 'user_id', 'uid'])
        : null);

    this.reporter =
      this.extractPerson(item?.reporter) ??
      this.extractPerson(item?.reporterUser) ??
      this.extractPerson(item?.reporter_user) ??
      (reporterId > 0
        ? this.findById(this.users, reporterId, ['id', 'user_id', 'uid'])
        : null);
  }

  private findCurrentUser(): any {
    const targetEmail = String(
      this.user?.email ?? ''
    ).trim().toLowerCase();

    const targetName = String(
      this.user?.name ?? ''
    ).trim().toLowerCase();

    const matched = (this.users || []).find(candidate => {
      const email = String(
        candidate?.email ??
        candidate?.user_email ??
        candidate?.mail ??
        ''
      ).trim().toLowerCase();

      const name = String(
        candidate?.name ??
        candidate?.full_name ??
        candidate?.fullName ??
        candidate?.username ??
        ''
      ).trim().toLowerCase();

      return (
        (targetEmail && email === targetEmail) ||
        (targetName && name === targetName)
      );
    });

    return matched ?? {
      name: this.user?.name || 'Current User',
      email: this.user?.email || ''
    };
  }

  private findById(
    items: any[],
    id: number,
    keys: string[]
  ): any {
    return (items || []).find(item =>
      keys.some(key =>
        Number(item?.[key]) === Number(id)
      )
    ) ?? null;
  }

  get title(): string {
    return this.currentItem?.title ||
      this.currentItem?.name ||
      this.currentItem?.summary ||
      'Untitled';
  }

  get code(): string {
    const item = this.currentItem;

    return item?.epic_code ||
      item?.issueCode ||
      item?.issue_code ||
      item?.story_code ||
      item?.storyCode ||
      item?.task_code ||
      item?.taskCode ||
      item?.code ||
      `${this.type}-${this.itemId}`;
  }

  get status(): string {
    return this.currentItem?.status || 'BACKLOG';
  }

  get priority(): string {
    return this.currentItem?.priority || 'MEDIUM';
  }

  get description(): string {
    return this.currentItem?.description ||
      this.currentItem?.details ||
      '';
  }

  get allPrimitiveFields(): { key: string; label: string; value: any }[] {
    if (!this.currentItem || typeof this.currentItem !== 'object') return [];

    const ignored = new Set([
      'description', 'details', 'stories', 'story_list', 'storyList',
      'tasks', 'task_list', 'taskList', 'issues', 'linkedIssues',
      'linked_issues', 'testCases', 'test_cases', 'testcases',
      'comments', 'commentList', 'comment_list', 'activity',
      'activities', 'history', 'audit'
    ]);

    return Object.keys(this.currentItem)
      .filter(key => !ignored.has(key))
      .map(key => ({
        key,
        label: this.formatFieldLabel(key),
        value: this.currentItem[key]
      }));
  }

  get allCollections(): { key: string; label: string; value: any[] }[] {
    if (!this.currentItem || typeof this.currentItem !== 'object') return [];

    const known = [
      'stories', 'story_list', 'storyList',
      'tasks', 'task_list', 'taskList',
      'issues', 'linkedIssues', 'linked_issues',
      'testCases', 'test_cases', 'testcases',
      'comments', 'commentList', 'comment_list',
      'activity', 'activities', 'history', 'audit'
    ];

    const seen = new Set<string>();

    return known
      .filter(key => {
        const value = this.currentItem[key];
        if (!Array.isArray(value) || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(key => ({
        key,
        label: this.formatFieldLabel(key),
        value: this.currentItem[key]
      }));
  }

  formatFieldLabel(key: string): string {
    return String(key)
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  isComplexValue(value: any): boolean {
    return value !== null &&
      value !== undefined &&
      typeof value === 'object';
  }

  displayValue(value: any): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  prettyJson(value: any): string {
    try {
      return JSON.stringify(value ?? {}, null, 2);
    } catch {
      return String(value ?? '');
    }
  }

  toggleAllFields(): void {
    this.showAllFields = !this.showAllFields;
  }

  toggleRawData(): void {
    this.showRawData = !this.showRawData;
  }

  focusDescriptionEditor(element: HTMLElement): void {
    this.descriptionEditor = element;
  }

  execDescription(command: string, value?: string): void {
    if (!this.editMode) this.startEdit();

    const editor = this.descriptionEditor;
    if (!editor) return;

    editor.focus();

    try {
      document.execCommand(command, false, value);
      this.editModel.description = editor.innerHTML;
      this.cdr.markForCheck();
    } catch (error) {
      console.warn('Description formatting command failed:', error);
    }
  }

  onDescriptionInput(event: Event): void {
    const element = event.target as HTMLElement;
    this.editModel.description = element.innerHTML;
  }

  insertDescriptionLink(): void {
    const url = window.prompt('Enter URL');
    if (url) {
      this.execDescription('createLink', url);
    }
  }

  insertDescriptionCode(): void {
    this.execDescription('formatBlock', 'pre');
  }

  insertDescriptionQuote(): void {
    this.execDescription('formatBlock', 'blockquote');
  }

  descriptionHtml(): string {
    const value = this.editModel?.description ?? this.description;
    return value || '';
  }

  getNavTitle(): string {
    if (this.type === 'EPIC') return 'Epic';
    if (this.type === 'STORY') return 'Story';
    if (this.type === 'TASK') return 'Task';
    if (this.type === 'ISSUE') return 'Issue';
    return 'Viewer';
  }

  get storyPoints(): number | string {
    return this.currentItem?.story_points ??
      this.currentItem?.storyPoints ??
      this.currentItem?.points ??
      '—';
  }

  get itemProjectName(): string {
    return this.project?.name ||
      this.currentItem?.project?.name ||
      this.currentItem?.project_name ||
      '—';
  }

  get sprintName(): string {
    return this.sprint?.name ||
      this.currentItem?.sprint_name ||
      'No Sprint';
  }

  get assigneeName(): string {
    return this.getPersonName(
      this.assignee ?? this.currentItem?.assignee
    );
  }

  get reporterName(): string {
    return this.getPersonName(
      this.reporter ?? this.currentItem?.reporter
    );
  }

  get teamName(): string {
    return this.team?.name ||
      this.currentItem?.team_name ||
      '—';
  }

  get creatorName(): string {
    return this.getPersonName(
      this.currentItem?.creator ??
      this.currentItem?.creatorUser
    );
  }

  get parentEpicName(): string {
    return this.parentEpic?.name ||
      this.currentItem?.epic_name ||
      this.currentItem?.epicName ||
      '—';
  }

  get parentStoryName(): string {
    return this.parentStory?.title ||
      this.parentStory?.name ||
      this.currentItem?.story_title ||
      this.currentItem?.story_name ||
      '—';
  }

  getPersonName(person: any): string {
    if (!person) return 'Unassigned';
    if (typeof person === 'string') return person;

    return person.name ||
      person.full_name ||
      person.fullName ||
      person.username ||
      person.email ||
      'Unassigned';
  }

  getUserInitials(name: string): string {
    if (!name || name === 'Unassigned') return '—';

    const parts = name.trim().split(/\s+/);

    return parts.length >= 2
      ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      : name.substring(0, 2).toUpperCase();
  }

  get typeIcon(): string {
    switch (this.type) {
      case 'EPIC': return '◇';
      case 'STORY': return '▤';
      case 'TASK': return '✓';
      case 'ISSUE': return '!';
      default: return '•';
    }
  }

  statusClass(value: string): string {
    return (value || 'BACKLOG')
      .toLowerCase()
      .replace(/_/g, '-');
  }

  priorityClass(value: string): string {
    return (value || 'MEDIUM').toLowerCase();
  }

  formatDate(value: any): string {
    if (!value) return '—';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  formatDateTime(value: any): string {
    if (!value) return '—';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  isFieldEditable(field: string): boolean {
    if (!this.type) return false;

    const common = new Set([
      'title',
      'description',
      'status',
      'sprint_id',
      'assignee_user_id',
      'reporter_user_id'
    ]);

    if (common.has(field)) return true;

    if (this.type === 'STORY') {
      return new Set([
        'priority',
        'story_points',
        'epic_id'
      ]).has(field);
    }

    return false;
  }

  personOptions(): any[] {
    return this.users || [];
  }

  userId(user: any): number | null {
    const id = this.firstNumericId(
      user?.id,
      user?.user_id,
      user?.uid
    );
    return id > 0 ? id : null;
  }

  sprintOptions(): any[] {
    return this.sprints || [];
  }

  epicOptions(): any[] {
    return this.projectEpics || [];
  }

  startEdit(): void {
    const item = this.currentItem;
    if (!item) return;

    const assigneeId = this.firstNumericId(
      item?.assignee_user_id,
      item?.assigneeUserId,
      item?.assigneeId,
      item?.assignee_id,
      item?.assignee?.id,
      item?.assignee?.user_id
    );

    const reporterId = this.firstNumericId(
      item?.reporter_user_id,
      item?.reporterUserId,
      item?.reporterId,
      item?.reporter_id,
      item?.reporter?.id,
      item?.reporter?.user_id
    );

    const sprintId = this.firstNumericId(
      item?.sprint_id,
      item?.sprintId,
      item?.sprint?.id
    );

    const epicId = this.firstNumericId(
      item?.epic_id,
      item?.epicId,
      item?.epic?.id
    );

    const storyId = this.firstNumericId(
      item?.story_id,
      item?.storyId,
      item?.story?.id
    );

    const points =
      item?.story_points ??
      item?.storyPoints ??
      item?.points ??
      null;

    this.editModel = {
      ...item,

      title:
        item?.title ??
        item?.name ??
        item?.summary ??
        '',

      description:
        item?.description ??
        item?.details ??
        '',

      status:
        item?.status ??
        'BACKLOG',

      priority:
        item?.priority ??
        'MEDIUM',

      story_points: points,

      assignee_user_id: assigneeId || null,
      reporter_user_id: reporterId || null,
      sprint_id: sprintId || null,
      epic_id: epicId || null,
      story_id: storyId || null
    };

    this.editMode = true;
    this.errorMessage = '';
    this.cdr.markForCheck();
  }

  cancelEdit(): void {
    this.editMode = false;
    this.editModel = {};
    this.cdr.markForCheck();
  }

  beginFieldEdit(field: string): void {
    if (!this.editMode) this.startEdit();

    setTimeout(() => {
      const element = document.querySelector(
        `[data-edit-field="${field}"]`
      ) as HTMLElement | null;

      element?.focus();
    });
  }

  finishFieldEdit(): void {}

  save(): void {
    if (!this.type || this.itemId === null) return;

    const url = this.getItemUrl();
    if (!url) return;

    this.saving = true;
    this.errorMessage = '';

    const model = this.editModel || {};
    const nullableNumber = (value: any): number | null => {
      if (value === '' || value === null || value === undefined) return null;
      const n = Number(value);
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    let payload: any;

    /*
     * Match the actual repository update signatures supplied with this task.
     *
     * Epic:
     *   name, description, sprint_id, status,
     *   assignee_user_id, reporter_user_id
     *
     * Story:
     *   title, description, story_points, status, priority,
     *   epic_id, sprint_id, assignee_user_id, reporter_user_id
     *
     * Task:
     *   title, description, sprint_id, status,
     *   assignee_user_id, reporter_user_id
     */
    if (this.type === 'EPIC') {
      payload = {
        name: model.title ?? model.name ?? '',
        description: model.description ?? '',
        sprint_id: nullableNumber(model.sprint_id),
        status: model.status ?? 'BACKLOG',
        assignee_user_id: nullableNumber(model.assignee_user_id),
        reporter_user_id: nullableNumber(model.reporter_user_id)
      };
    } else if (this.type === 'STORY') {
      payload = {
        title: model.title ?? '',
        description: model.description ?? '',
        story_points:
          model.story_points === '' ||
          model.story_points === null ||
          model.story_points === undefined
            ? 0
            : Number(model.story_points),
        status: model.status ?? 'BACKLOG',
        priority: model.priority ?? 'MEDIUM',
        epic_id: nullableNumber(model.epic_id),
        sprint_id: nullableNumber(model.sprint_id),
        assignee_user_id: nullableNumber(model.assignee_user_id),
        reporter_user_id: nullableNumber(model.reporter_user_id)
      };
    } else if (this.type === 'TASK') {
      payload = {
        title: model.title ?? '',
        description: model.description ?? '',
        sprint_id: nullableNumber(model.sprint_id),
        status: model.status ?? 'TODO',
        assignee_user_id: nullableNumber(model.assignee_user_id),
        reporter_user_id: nullableNumber(model.reporter_user_id)
      };
    } else {
      // Preserve existing Issue behavior.
      payload = {
        ...model,
        title: model.title,
        description: model.description,
        status: model.status,
        priority: model.priority,
        assignee_user_id: nullableNumber(model.assignee_user_id),
        reporter_user_id: nullableNumber(model.reporter_user_id),
        sprint_id: nullableNumber(model.sprint_id),
        story_points:
          model.story_points === '' ||
          model.story_points === undefined
            ? null
            : model.story_points
      };
    }

    this.http.put<any>(
      url,
      payload,
      this.headers()
    ).pipe(
      catchError(error => {
        console.error('Viewer save failed:', error);
        this.errorMessage =
          error?.error?.message ||
          error?.error?.error ||
          'Unable to save changes.';
        return of(null);
      }),
      finalize(() => {
        this.saving = false;
        this.cdr.markForCheck();
      })
    ).subscribe(response => {
      if (!response) return;

      const returned = this.unwrap(response);

      // Some update APIs return row-count / message rather than the full row.
      // In that case merge the edited values into the existing item and keep
      // the relationships intact.
      const returnedItem =
        returned &&
        typeof returned === 'object' &&
        !Array.isArray(returned) &&
        (
          returned.id !== undefined ||
          returned.title !== undefined ||
          returned.name !== undefined
        )
          ? returned
          : {};

      this.currentItem = {
        ...this.currentItem,
        ...returnedItem,
        ...model
      };

      // Restore canonical DB field names after the merge.
      if (this.type === 'EPIC') {
        this.currentItem.name = model.title;
      }

      this.currentItem.description = model.description;
      this.currentItem.status = model.status;

      if (this.type === 'STORY') {
        this.currentItem.title = model.title;
        this.currentItem.priority = model.priority;
        this.currentItem.story_points = model.story_points;
      }

      if (this.type === 'TASK') {
        this.currentItem.title = model.title;
      }

      this.currentItem.assignee_user_id =
        nullableNumber(model.assignee_user_id);
      this.currentItem.reporter_user_id =
        nullableNumber(model.reporter_user_id);
      this.currentItem.sprint_id =
        nullableNumber(model.sprint_id);

      if (this.type === 'STORY') {
        this.currentItem.epic_id = nullableNumber(model.epic_id);
      }

      this.editMode = false;
      this.editModel = {};

      this.autoPopulatePeople();
      this.resolveReferencesFromCollections();

      this.cdr.markForCheck();
    });
  }

  // =========================================================
  // EXACT USERHOME HEADER / NAVIGATION BEHAVIOUR
  // =========================================================

  toggleSidebar(): void {
    this.isCollapsed = !this.isCollapsed;
    this.createMenuOpen = false;
    this.profileMenuOpen = false;
  }

  toggleNavigation(): void {
    this.toggleSidebar();
    this.navCollapsed = this.isCollapsed;
  }

  setActive(menu: string): void {
    this.activeMenu = menu;
    this.createMenuOpen = false;
    this.profileMenuOpen = false;

    // Viewer is a detail route. Leaving it takes the user back
    // into the same UserHome application shell/menu.
    this.router.navigate(['/user-home'], {
      queryParams: { menu }
    });
  }

  isActive(menu: string): boolean {
    return this.activeMenu === menu;
  }

  isUserGroupActive(): boolean {
    return ['roles', 'users', 'teams'].includes(this.activeMenu);
  }

  viewerMenuForType(type: ViewerType | null): string {
    switch (type) {
      case 'EPIC':
      case 'STORY':
      case 'TASK':
        return 'epics';
      case 'ISSUE':
        return 'issues';
      default:
        return 'dashboard';
    }
  }

  toggleCreateMenu(event?: Event): void {
    event?.stopPropagation();
    this.profileMenuOpen = false;
    this.createMenuOpen = !this.createMenuOpen;
  }

  closeCreateMenu(): void {
    this.createMenuOpen = false;
  }

  onCreateItem(type: string): void {
    this.createMenuOpen = false;

    if (type === 'epic' || type === 'story' || type === 'task') {
      this.setActive('epics');
      return;
    }

    if (type === 'issue') {
      this.setActive('issues');
      return;
    }

    if (type === 'test-case') {
      this.setActive('test-cases');
      return;
    }

    if (type === 'release') {
      this.setActive('releases');
    }
  }

  toggleProfileMenu(event?: Event): void {
    event?.stopPropagation();
    this.createMenuOpen = false;
    this.profileMenuOpen = !this.profileMenuOpen;
  }

  closeProfileMenu(): void {
    this.profileMenuOpen = false;
  }

  openEditDialog(): void {
    this.profileMenuOpen = false;

    const dialogRef = this.dialog.open(EditProfileDialog, {
      width: '600px',
      height: '600px',
      data: { ...this.user }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.user = result;
        this.cdr.markForCheck();
      }
    });
  }

  focusSearch(event?: Event): void {
    event?.stopPropagation();

    const element = document.querySelector(
      '.search-input'
    ) as HTMLInputElement | null;

    element?.focus();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchText = '';
    this.focusSearch();
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent): void {
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === 'k'
    ) {
      event.preventDefault();
      this.focusSearch();
      return;
    }

    if (event.key === 'Escape') {
      this.createMenuOpen = false;
      this.profileMenuOpen = false;
    }
  }

  @HostListener('document:click', ['$event'])
  handleDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;

    if (!target.closest('.create-wrapper')) {
      this.createMenuOpen = false;
    }

    if (!target.closest('.profile-wrapper')) {
      this.profileMenuOpen = false;
    }
  }

  logout(): void {
    if (isPlatformBrowser(this.platformId)) {
      sessionStorage.clear();
      localStorage.clear();
    }

    this.router.navigate(['/login']);
  }

  get userInitials(): string {
    return this.getUserInitials(this.user?.name || 'U');
  }

  goBack(): void {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      this.goToUserHome();
    }
  }

  goToUserHome(): void {
  this.createMenuOpen = false;
  this.profileMenuOpen = false;
  this.router.navigate(['/user-home']);
}

  goToProject(): void {
    this.router.navigate(['/user-home']);
  }

  openItem(
    type: ViewerType,
    id: number | null | undefined
  ): void {
    if (
      id === null ||
      id === undefined ||
      !Number.isFinite(Number(id)) ||
      Number(id) <= 0
    ) return;

    const query = this.projectId
      ? `?projectId=${encodeURIComponent(this.projectId)}`
      : '';

    window.open(
      `/viewer/${type}/${Number(id)}${query}`,
      '_blank',
      'noopener,noreferrer'
    );
  }

  openEpic(id: number | null | undefined): void {
    this.openItem('EPIC', id);
  }

  openStory(id: number | null | undefined): void {
    this.openItem('STORY', id);
  }

  openTask(id: number | null | undefined): void {
    this.openItem('TASK', id);
  }

  openIssue(id: number | null | undefined): void {
    this.openItem('ISSUE', id);
  }

  close(): void {
    window.close();

    setTimeout(() => {
      if (!window.closed) this.goToUserHome();
    }, 100);
  }

  trackById(index: number, item: any): any {
    return item?.id ??
      item?.issue_id ??
      item?.testcase_id ??
      index;
  }

  trackByCode(index: number, item: any): any {
    return item?.issueCode ??
      item?.issue_code ??
      item?.code ??
      item?.id ??
      index;
  }

  private findSelected(items: any[]): any | null {
  const targetId = Number(this.itemId);

  if (!Number.isFinite(targetId) || targetId <= 0) {
    return null;
  }

  for (const item of items || []) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const candidateIds = [
      item.id,
      item.story_id,
      item.storyId,
      item.epic_id,
      item.epicId,
      item.task_id,
      item.taskId,
      item.issue_id,
      item.issueId
    ];

    const matched = candidateIds.some(value => {
      const id = Number(value);
      return Number.isFinite(id) && id === targetId;
    });

    if (matched) {
      return item;
    }
  }

  return null;
}



}
