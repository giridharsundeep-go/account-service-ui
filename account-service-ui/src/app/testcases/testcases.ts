import { Component, OnInit, ViewChild, TemplateRef, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../auth.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { environment } from '../../environment';

export interface Testcase {
  id?: number;
  testCaseCode?: string;
  code?: string;
  test_case_code?: string;
  title?: string;
  name?: string;
  description?: string;
  preconditions?: string;
  steps?: string;
  expectedResult?: string;
  actualResult?: string;
  status?: string;
  priority?: string;
  project?: any;
  projectId?: any;
  project_id?: any;
  epic?: any;
  epicId?: any;
  epic_id?: any;
  epicName?: any;
  epicTitle?: any;
  story?: any;
  userStory?: any;
  user_story?: any;
  storyId?: any;
  story_id?: any;
  userStoryId?: any;
  user_story_id?: any;
  storyName?: any;
  storyTitle?: any;
  task?: any;
  taskId?: any;
  task_id?: any;
  taskName?: any;
  taskTitle?: any;
  user?: any;
  userId?: any;
  user_id?: any;
  creator?: any;
}

@Component({
  selector: 'app-testcases',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDialogModule,
    MatCardModule,
    MatTooltipModule,
  ],
  templateUrl: './testcases.html',
  styleUrl: './testcases.css',
})
export class Testcases implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  baseUrl = environment.apiBaseUrl;
  baseUrl2 = environment.apiBaseUrl2 || environment.apiBaseUrl;

  displayedColumns: string[] = ['testCaseCode', 'title', 'priority', 'status', 'project', 'epic', 'story', 'task', 'user', 'actions'];
  dataSource = new MatTableDataSource<Testcase>([]);

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild('dialogTemplate') dialogTemplate!: TemplateRef<any>;

  projects: any[] = [];
  epics: any[] = [];
  stories: any[] = [];
  tasks: any[] = [];
  users: any[] = [];

  searchTerm: string = '';
  selectedProjectFilter: string = '';
  selectedPriorityFilter: string = '';
  selectedStatusFilter: string = '';

  testcaseForm!: FormGroup;
  isEditMode = false;
  selectedTestcaseId: number | null = null;
  private dialogRef!: MatDialogRef<any>;

  constructor(
    private fb: FormBuilder,
    private dialog: MatDialog
  ) { }

  ngOnInit(): void {
    this.initForm();
    this.setupFilterPredicate();
    this.loadAllDropdownData();
    this.loadTestcases();
  }

  initForm(): void {
    this.testcaseForm = this.fb.group({
      testCaseCode: ['', Validators.required],
      title: ['', Validators.required],
      description: [''],
      preconditions: [''],
      steps: ['', Validators.required],
      expectedResult: ['', Validators.required],
      actualResult: [''],
      status: ['DRAFT', Validators.required],
      priority: ['MEDIUM', Validators.required],
      projectId: ['', Validators.required],
      epicId: [''],
      storyId: [''],
      taskId: [''],
      userId: [''],
    });

    this.testcaseForm.get('projectId')?.valueChanges.subscribe((projectId: number | string) => {
      if (projectId) {
        this.loadProjectDependencies(Number(projectId));
      } else {
        this.epics = [];
        this.stories = [];
      }
    });
  }

  compareFn(o1: any, o2: any): boolean {
    if (o1 === '' || o1 === null || o1 === undefined || o2 === '' || o2 === null || o2 === undefined) {
      return o1 === o2;
    }
    return String(o1) === String(o2);
  }

  getOptionId(item: any): any {
    if (!item) return '';
    if (typeof item === 'object') {
      return item.id ?? item.storyId ?? item.userStoryId ?? item.taskId ?? item.epicId ?? item.projectId ?? item.userId ?? '';
    }
    return item;
  }

  loadAllDropdownData(): void {
    const headers = this.auth.getAuthHeaders();

    this.http.get<any[]>(`${this.baseUrl}/projects`, { headers }).pipe(catchError(() => of([]))).subscribe(data => {
      this.projects = this.extractArray(data);
    });

    this.http.get<any[]>(`${this.baseUrl}/epics`, { headers }).pipe(catchError(() => of([]))).subscribe(data => {
      this.epics = this.extractArray(data);
    });

    this.http.get<any[]>(`${this.baseUrl}/stories`, { headers }).pipe(
      catchError(() => this.http.get<any[]>(`${this.baseUrl}/user-stories`, { headers }).pipe(catchError(() => of([]))))
    ).subscribe(data => {
      this.stories = this.extractArray(data);
    });

    this.http.get<any[]>(`${this.baseUrl}/tasks`, { headers }).pipe(catchError(() => of([]))).subscribe(data => {
      this.tasks = this.extractArray(data);
    });

    this.http.get<any[]>(`${this.baseUrl}/user`, { headers }).pipe(catchError(() => of([]))).subscribe(data => {
      this.users = this.extractArray(data);
    });
  }

  loadProjectDependencies(projectId: number, callback?: () => void): void {
  const headers = this.auth.getAuthHeaders();

  forkJoin({
    epics: this.http.get<any[]>(`${this.baseUrl}/projects/${projectId}/epics`, { headers }).pipe(
      catchError(() => of([]))
    ),
    stories: this.http.get<any[]>(`${this.baseUrl}/projects/${projectId}/stories`, { headers }).pipe(
      catchError(() => this.http.get<any[]>(`${this.baseUrl}/projects/${projectId}/user-stories`, { headers }).pipe(catchError(() => of([]))))
    ),
    tasks: this.http.get<any[]>(`${this.baseUrl}/tasks`, { headers }).pipe(
      catchError(() => of([]))
    )
  }).subscribe({
    next: (res) => {
      const loadedEpics = this.extractArray(res.epics);
      const loadedStories = this.extractArray(res.stories);
      const loadedTasks = this.extractArray(res.tasks);

      if (loadedEpics.length > 0) this.epics = loadedEpics;
      if (loadedStories.length > 0) this.stories = loadedStories;
      if (loadedTasks.length > 0) this.tasks = loadedTasks;

      if (callback) callback();
    },
    error: () => {
      if (callback) callback();
    }
  });
}

  loadTestcases(): void {
    const headers = this.auth.getAuthHeaders();
    this.http.get<any>(`${this.baseUrl2}/v1/testcases`, { headers }).subscribe(res => {
      this.dataSource.data = this.extractArray(res);
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    });
  }

  private extractArray(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (res && typeof res === 'object') {
      return res.content || res.data || res.items || res.result || [];
    }
    return [];
  }

  private getEntityId(obj: any, directIdKey?: any, altIdKey?: any): any {
    if (obj !== null && obj !== undefined) {
      if (typeof obj === 'object') {
        if (obj.id !== undefined && obj.id !== null && obj.id !== '') return obj.id;
        if (obj.storyId !== undefined && obj.storyId !== null) return obj.storyId;
        if (obj.userStoryId !== undefined && obj.userStoryId !== null) return obj.userStoryId;
        if (obj.taskId !== undefined && obj.taskId !== null) return obj.taskId;
        if (obj.epicId !== undefined && obj.epicId !== null) return obj.epicId;
        if (obj.projectId !== undefined && obj.projectId !== null) return obj.projectId;
        if (obj.userId !== undefined && obj.userId !== null) return obj.userId;
      }
      if (typeof obj === 'number') return obj;
      if (typeof obj === 'string' && obj.trim() !== '' && !isNaN(Number(obj))) return Number(obj);
    }
    if (directIdKey !== null && directIdKey !== undefined && directIdKey !== '') return directIdKey;
    if (altIdKey !== null && altIdKey !== undefined && altIdKey !== '') return altIdKey;
    return '';
  }

  getTestCaseCode(tc: Testcase): string {
    return tc.testCaseCode || tc.code || tc.test_case_code || (tc.id ? `TC-${tc.id}` : '-');
  }

  getTestCaseTitle(tc: Testcase): string {
    return tc.title || tc.name || tc.description || (tc.id ? `Test Case #${tc.id}` : '-');
  }

  getProjectDisplay(tc: Testcase): string {
    const pId = this.getEntityId(tc.project, tc.projectId, tc.project_id);
    if (tc.project && typeof tc.project === 'object' && tc.project.name) return tc.project.name;
    if (pId !== '') {
      const found = this.projects.find(p => String(this.getOptionId(p)) === String(pId));
      return found ? (found.name || `Project #${this.getOptionId(found)}`) : `Project #${pId}`;
    }
    return '-';
  }

  getEpicDisplay(tc: Testcase): string {
    const eId = this.getEntityId(tc.epic, tc.epicId, tc.epic_id);
    if (tc.epic && typeof tc.epic === 'object') {
      const name = tc.epic.name || tc.epic.title || tc.epic.epicCode;
      if (name) return name;
    }
    if (tc.epicName || tc.epicTitle) return tc.epicName || tc.epicTitle;
    if (eId !== '') {
      const found = this.epics.find(e => String(this.getOptionId(e)) === String(eId));
      return found ? (found.name || found.title || `Epic #${this.getOptionId(found)}`) : `Epic #${eId}`;
    }
    return '-';
  }

  getStoryDisplay(tc: Testcase): string {
  if (!tc) return '-';

  const storyObj = tc.story || tc.userStory || tc.user_story;
  if (storyObj && typeof storyObj === 'object') {
    const name = storyObj.title || storyObj.name || storyObj.storyTitle || storyObj.storyName ||
                 storyObj.userStoryTitle || storyObj.userStoryName || storyObj.summary || 
                 storyObj.description || storyObj.storyCode || storyObj.code;
    if (name && name.trim() !== '') return name;
  }

  const directTitle = tc.storyTitle || tc.storyName || (tc as any).userStoryTitle || (tc as any).userStoryName || (tc as any).story_title || (tc as any).story_name;
  if (directTitle) return directTitle;

  const sId = this.getEntityId(storyObj, tc.storyId, tc.userStoryId || tc.story_id || tc.user_story_id);
  if (sId !== '') {
    const found = this.stories.find(s => String(this.getOptionId(s)) === String(sId));
    if (found) {
      return found.title || found.name || found.storyTitle || found.storyName || found.description || `Story #${this.getOptionId(found)}`;
    }
    return `Story #${sId}`;
  }

  return '-';
}

  getTaskDisplay(tc: Testcase): string {
    if (!tc) return '-';

    const taskObj = tc.task;
    if (taskObj && typeof taskObj === 'object') {
      const name = taskObj.title || taskObj.name || taskObj.taskTitle || taskObj.taskName ||
                   taskObj.summary || taskObj.description || taskObj.taskCode || taskObj.code;
      if (name) return name;
    }

    const directTitle = tc.taskTitle || tc.taskName || (tc as any).task_title || (tc as any).task_name;
    if (directTitle) return directTitle;

    const tId = this.getEntityId(taskObj, tc.taskId, tc.task_id);
    if (tId !== '') {
      const found = this.tasks.find(t => String(this.getOptionId(t)) === String(tId));
      if (found) {
        return found.title || found.name || found.taskTitle || found.taskName || found.description || `Task #${this.getOptionId(found)}`;
      }
      return `Task #${tId}`;
    }

    if (typeof taskObj === 'string' && isNaN(Number(taskObj))) return taskObj;
    return '-';
  }

  getUserDisplay(tc: Testcase): string {
    const user = tc.user || tc.creator;
    const uId = this.getEntityId(user, tc.userId, tc.user_id);

    if (user && typeof user === 'object') {
      const name = user.name || user.username || user.email;
      if (name) return name;
    }

    if (uId !== '') {
      const found = this.users.find(u => String(this.getOptionId(u)) === String(uId));
      return found ? (found.username || found.name || found.email || `User #${this.getOptionId(found)}`) : `User #${uId}`;
    }
    return '-';
  }

  setupFilterPredicate(): void {
    this.dataSource.filterPredicate = (data: Testcase, filter: string): boolean => {
      const searchStr = this.searchTerm.toLowerCase().trim();
      const code = this.getTestCaseCode(data).toLowerCase();
      const title = this.getTestCaseTitle(data).toLowerCase();
      const desc = (data.description || '').toLowerCase();

      const matchesSearch = !searchStr || title.includes(searchStr) || code.includes(searchStr) || desc.includes(searchStr);

      const projId = this.getEntityId(data.project, data.projectId, data.project_id);
      const matchesProject = !this.selectedProjectFilter || String(projId) === String(this.selectedProjectFilter);
      const matchesPriority = !this.selectedPriorityFilter || data.priority === this.selectedPriorityFilter;
      const matchesStatus = !this.selectedStatusFilter || data.status === this.selectedStatusFilter;

      return Boolean(matchesSearch && matchesProject && matchesPriority && matchesStatus);
    };
  }

  applyFilters(): void {
    this.dataSource.filter = `${this.searchTerm}-${this.selectedProjectFilter}-${this.selectedPriorityFilter}-${this.selectedStatusFilter}`;
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedProjectFilter = '';
    this.selectedPriorityFilter = '';
    this.selectedStatusFilter = '';
    this.applyFilters();
  }

  openCreateModal(): void {
    this.isEditMode = false;
    this.selectedTestcaseId = null;

    const defaultProjectId = this.projects.length > 0 ? this.getOptionId(this.projects[0]) : '';

    this.testcaseForm.reset({
      status: 'DRAFT',
      priority: 'MEDIUM',
      projectId: defaultProjectId !== '' ? Number(defaultProjectId) : '',
      epicId: '',
      storyId: '',
      taskId: '',
      userId: ''
    });

    if (defaultProjectId) {
      this.loadProjectDependencies(Number(defaultProjectId));
    }

    this.dialogRef = this.dialog.open(this.dialogTemplate, { width: '720px', disableClose: true });
  }

  openEditModal(tc: Testcase): void {
    this.isEditMode = true;
    this.selectedTestcaseId = tc.id!;

    const selectedProjId = this.getEntityId(tc.project, tc.projectId, tc.project_id);
    const epicId = this.getEntityId(tc.epic, tc.epicId, tc.epic_id);
    const storyId = this.getEntityId(tc.story || tc.userStory || tc.user_story, tc.storyId, tc.userStoryId || tc.story_id || tc.user_story_id);
    const taskId = this.getEntityId(tc.task, tc.taskId, tc.task_id);
    const userId = this.getEntityId(tc.user || tc.creator, tc.userId, tc.user_id);

    const populateForm = () => {
      this.testcaseForm.patchValue({
        testCaseCode: tc.testCaseCode || tc.code || tc.test_case_code || (tc.id ? `TC-${tc.id}` : ''),
        title: tc.title || tc.name || tc.description || '',
        description: tc.description || '',
        preconditions: tc.preconditions || '',
        steps: tc.steps || '',
        expectedResult: tc.expectedResult || '',
        actualResult: tc.actualResult || '',
        status: tc.status || 'DRAFT',
        priority: tc.priority || 'MEDIUM',
        projectId: selectedProjId !== '' ? Number(selectedProjId) : '',
        epicId: epicId !== '' ? Number(epicId) : '',
        storyId: storyId !== '' ? Number(storyId) : '',
        taskId: taskId !== '' ? Number(taskId) : '',
        userId: userId !== '' ? Number(userId) : '',
      }, { emitEvent: false });

      setTimeout(() => {
        this.cdr.detectChanges();
      }, 0);
    };

    if (selectedProjId) {
      this.loadProjectDependencies(Number(selectedProjId), populateForm);
    } else {
      populateForm();
    }

    this.dialogRef = this.dialog.open(this.dialogTemplate, { width: '720px', disableClose: true });
  }

  closeModal(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
    }
  }

  onSubmit(): void {
    if (this.testcaseForm.invalid) return;

    const val = this.testcaseForm.value;

    const toEntityRef = (idVal: any) => {
      if (idVal === null || idVal === undefined || idVal === '') return null;
      const num = Number(idVal);
      return !isNaN(num) && num > 0 ? { id: num } : null;
    };

    const storyRef = toEntityRef(val.storyId);
    const taskRef = toEntityRef(val.taskId);
    const epicRef = toEntityRef(val.epicId);
    const userRef = toEntityRef(val.userId);

    const payload: any = {
      testCaseCode: val.testCaseCode,
      title: val.title,
      description: val.description,
      preconditions: val.preconditions,
      steps: val.steps,
      expectedResult: val.expectedResult,
      actualResult: val.actualResult,
      status: val.status,
      priority: val.priority,

      project: val.projectId ? { id: Number(val.projectId) } : null,
      projectId: val.projectId ? Number(val.projectId) : null,
      project_id: val.projectId ? Number(val.projectId) : null,

      epic: epicRef,
      epicId: val.epicId ? Number(val.epicId) : null,
      epic_id: val.epicId ? Number(val.epicId) : null,

      story: storyRef,
      userStory: storyRef,
      user_story: storyRef,
      storyId: val.storyId ? Number(val.storyId) : null,
      userStoryId: val.storyId ? Number(val.storyId) : null,
      story_id: val.storyId ? Number(val.storyId) : null,
      user_story_id: val.storyId ? Number(val.storyId) : null,

      task: taskRef,
      taskId: val.taskId ? Number(val.taskId) : null,
      task_id: val.taskId ? Number(val.taskId) : null,

      user: userRef,
      userId: val.userId ? Number(val.userId) : null,
      user_id: val.userId ? Number(val.userId) : null,
      creator: userRef
    };

    const headers = this.auth.getAuthHeaders();

    if (this.isEditMode && this.selectedTestcaseId) {
      this.http.put<Testcase>(`${this.baseUrl2}/v1/testcases/${this.selectedTestcaseId}`, payload, { headers }).subscribe({
        next: () => {
          this.loadTestcases();
          this.closeModal();
        },
        error: (err) => console.error('Error updating test case:', err)
      });
    } else {
      this.http.post<Testcase>(`${this.baseUrl2}/v1/testcases`, payload, { headers }).subscribe({
        next: () => {
          this.loadTestcases();
          this.closeModal();
        },
        error: (err) => console.error('Error creating test case:', err)
      });
    }
  }

  deleteTestcase(id: number): void {
    if (confirm('Are you sure you want to delete this test case?')) {
      const headers = this.auth.getAuthHeaders();
      this.http.delete(`${this.baseUrl2}/v1/testcases/${id}`, { headers }).subscribe(() => {
        this.loadTestcases();
      });
    }
  }
}