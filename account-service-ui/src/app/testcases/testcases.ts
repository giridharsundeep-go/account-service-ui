import { ChangeDetectorRef, Component, OnInit, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize, map } from 'rxjs/operators';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../auth.service';
import { ProjectContextService } from '../project-context.service';
import { environment } from '../../environment';
import { WorkspaceHeroComponent } from '../shared/workspace-hero';

export interface TestPlan {
  id?: number;
  name: string;
  description?: string;
  project?: any;
  projectId?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TestCase {
  id?: number;
  testCaseCode?: string;
  test_case_code?: string;
  code?: string;
  title?: string;
  name?: string;
  description?: string;
  preconditions?: string;
  steps?: string;
  expectedResult?: string;
  actualResult?: string;
  status?: string;
  priority?: string;
  type?: string;
  assignee?: any;
  reporter?: any;
  project?: any;
  projectId?: any;
  project_id?: any;
  testPlan?: any;
  testPlanId?: any;
  test_plan_id?: any;
  testSuite?: any;
  testSuiteId?: any;
  test_suite_id?: any;
  epic?: any;
  epicId?: any;
  epic_id?: any;
  story?: any;
  storyId?: any;
  story_id?: any;
  task?: any;
  taskId?: any;
  task_id?: any;
  user?: any;
  userId?: any;
  user_id?: any;
  creator?: any;
  createdAt?: string;
  updatedAt?: string;
}

@Component({
  selector: 'app-testcases',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, WorkspaceHeroComponent],
  templateUrl: './testcases.html',
  styleUrls: ['./testcases.css', '../shared/field-controls.css']
})
export class Testcases implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly projectContext = inject(ProjectContextService);

  readonly baseUrl = environment.apiBaseUrlM || environment.apiBaseUrl;
  readonly testApiUrl = environment.apiBaseUrlM || environment.apiBaseUrl2 || environment.apiBaseUrl;

  projects: any[] = [];
  selectedProjectId: number | null = null;
  testPlans: TestPlan[] = [];
  testCases: TestCase[] = [];
  testSuites: any[] = [];
  selectedPlan: TestPlan | null = null;
  selectedSuite: any | null = null;

  isProjectLoading = false;
  isCreatingPlan = false;
  isCreatingSuite = false;
  isCreatingCase = false;
  isAddingCases = false;
  showCreatePlanModal = false;
  showCreateSuiteModal = false;
  showCreateCaseModal = false;
  showAddCasesModal = false;
  successMessage = '';
  showSuccessToast = false;
  planSearch = '';
  caseSearch = '';
  librarySearch = '';
  selectedCaseIds = new Set<number>();
  planForm = { name: '', description: '' };
  suiteForm = { name: '', description: '' };
  caseForm = this.emptyCaseForm();
  private loadToken = 0;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly projectContextSync = effect(() => {
    const projectId = this.projectContext.selectedProjectId();
    if (!projectId || projectId === this.selectedProjectId) return;
    if (this.projects.some(project => Number(this.getProjectOptionId(project)) === projectId)) {
      this.onProjectChange(projectId);
    }
  });

  ngOnInit(): void {
    this.loadProjects();
  }

  loadProjects(): void {
    this.http.get<any>(String(this.baseUrl).replace(/\/$/, '') + '/projects', {
      headers: this.auth.getAuthHeaders()
    }).pipe(catchError(() => of([]))).subscribe(response => {
      this.projects = this.extractArray(response);
      const sharedId = this.projectContext.selectedProjectId();
      const preferred = this.projects.find(project => Number(this.getProjectOptionId(project)) === sharedId)
        || this.projects[0];
      if (preferred) this.onProjectChange(Number(this.getProjectOptionId(preferred)));
      this.cdr.markForCheck();
    });
  }

  onProjectChange(value: any): void {
    const projectId = Number(value);
    if (!Number.isFinite(projectId) || projectId <= 0) {
      this.selectedProjectId = null;
      this.projectContext.setSelectedProject(null);
      this.testPlans = [];
      this.testCases = [];
      this.testSuites = [];
      this.selectedPlan = null;
      this.selectedSuite = null;
      this.isProjectLoading = false;
      return;
    }

    this.selectedProjectId = projectId;
    this.projectContext.setSelectedProject(projectId);
    this.selectedPlan = null;
    this.selectedSuite = null;
    this.planSearch = '';
    this.caseSearch = '';
    this.loadProjectWorkspace(projectId);
  }

  private loadProjectWorkspace(projectId: number): void {
    const token = ++this.loadToken;
    this.isProjectLoading = true;
    const headers = this.auth.getAuthHeaders();
    const api = String(this.testApiUrl).replace(/\/$/, '');
    forkJoin({
      plans: this.http.get<any>(api + '/v1/test-plans', { headers }).pipe(catchError(() => of([]))),
      suites: this.http.get<any>(api + '/v1/test-suites', { headers }).pipe(catchError(() => of([]))),
      cases: this.http.get<any>(api + '/v1/testcases', { headers }).pipe(catchError(() => of([])))
    }).pipe(finalize(() => {
      if (token === this.loadToken) {
        this.isProjectLoading = false;
        this.cdr.markForCheck();
      }
    })).subscribe(({ plans, suites, cases }) => {
      if (token !== this.loadToken || projectId !== this.selectedProjectId) return;

      const allPlans = this.extractArray(plans);
      const allSuites = this.extractArray(suites);
      const allCases = this.extractArray(cases);
      this.testPlans = allPlans.map(plan => this.normalizePlan(plan)).filter(plan => this.getProjectId(plan) === projectId);
      const projectPlanIds = new Set(this.testPlans.map(plan => Number(plan.id)).filter(Number.isFinite));
      this.testSuites = allSuites.map(suite => this.normalizeSuite(suite)).filter(suite => {
        if (this.getProjectId(suite) === projectId) return true;
        const planId = this.entityId(suite.testPlan, suite.testPlanId ?? suite.test_plan_id);
        return planId !== null && projectPlanIds.has(planId);
      });
      const projectSuiteIds = new Set(this.testSuites.map(suite => Number(suite.id)).filter(Number.isFinite));
      this.testCases = allCases.map(testCase => this.normalizeCase(testCase)).filter(testCase => {
        if (this.getProjectId(testCase) === projectId) return true;
        const planId = this.entityId(testCase.testPlan, testCase.testPlanId ?? testCase.test_plan_id);
        const suiteId = this.entityId(testCase.testSuite, testCase.testSuiteId ?? testCase.test_suite_id);
        if (planId !== null && projectPlanIds.has(planId)) return true;
        if (suiteId !== null && projectSuiteIds.has(suiteId)) return true;
        const suite = this.testSuites.find(row => Number(row.id) === suiteId);
        const suitePlanId = suite ? this.entityId(suite.testPlan, suite.testPlanId ?? suite.test_plan_id) : null;
        return suitePlanId !== null && projectPlanIds.has(suitePlanId);
      });

      if (this.selectedPlan?.id) {
        this.selectedPlan = this.testPlans.find(plan => Number(plan.id) === Number(this.selectedPlan?.id)) || null;
      }
      if (this.selectedSuite?.id) {
        this.selectedSuite = this.testSuites.find(suite => Number(suite.id) === Number(this.selectedSuite?.id)) || null;
      }
      this.cdr.markForCheck();
    });
  }

  get visiblePlans(): TestPlan[] {
    const query = this.planSearch.trim().toLowerCase();
    return this.testPlans.filter(plan => !query || (plan.name + ' ' + (plan.description || '')).toLowerCase().includes(query));
  }

  get planCases(): TestCase[] {
    if (!this.selectedSuite?.id) return [];
    const query = this.caseSearch.trim().toLowerCase();
    return this.testCases.filter(testCase => this.isCaseInSuite(testCase, this.selectedSuite))
      .filter(testCase => !query || (this.getCaseCode(testCase) + ' ' + this.getCaseTitle(testCase) + ' ' + (testCase.description || '')).toLowerCase().includes(query));
  }

  get availableCases(): TestCase[] {
    const query = this.librarySearch.trim().toLowerCase();
    return this.testCases.filter(testCase => !query ||
      (this.getCaseCode(testCase) + ' ' + this.getCaseTitle(testCase) + ' ' + (testCase.description || '') + ' ' + (testCase.type || '')).toLowerCase().includes(query));
  }

  get unaddedAvailableCases(): TestCase[] {
    return this.availableCases.filter(testCase => !this.selectedSuite || !this.isCaseInSuite(testCase, this.selectedSuite));
  }

  get selectedProjectName(): string {
    const project = this.projects.find(item => Number(this.getProjectOptionId(item)) === this.selectedProjectId);
    return project?.name || project?.project_name || project?.projectName || project?.title || 'Project';
  }

  get selectedCaseCount(): number {
    return this.selectedSuite ? this.testCases.filter(testCase => this.isCaseInSuite(testCase, this.selectedSuite)).length : 0;
  }

  openPlan(plan: TestPlan): void {
    this.selectedPlan = plan;
    this.selectedSuite = null;
    this.planSearch = '';
    this.caseSearch = '';
    this.cdr.markForCheck();
  }

  openSuite(suite: any): void {
    this.selectedSuite = suite;
    this.caseSearch = '';
    this.cdr.markForCheck();
  }

  backToPlans(): void {
    this.selectedPlan = null;
    this.selectedSuite = null;
    this.caseSearch = '';
    this.cdr.markForCheck();
  }

  backToSuites(): void {
    this.selectedSuite = null;
    this.caseSearch = '';
    this.cdr.markForCheck();
  }

  openCreatePlan(): void {
    this.planForm = { name: '', description: '' };
    this.showCreatePlanModal = true;
  }

  closeCreatePlan(): void {
    if (!this.isCreatingPlan) this.showCreatePlanModal = false;
  }

  createPlan(): void {
    const name = this.planForm.name.trim();
    if (!name || !this.selectedProjectId || this.isCreatingPlan) return;
    this.isCreatingPlan = true;
    const payload = { name, description: this.planForm.description.trim(), project: { id: this.selectedProjectId } };
    this.http.post<any>(String(this.testApiUrl).replace(/\/$/, '') + '/v1/test-plans', payload, {
      headers: this.auth.getAuthHeaders()
    }).pipe(finalize(() => {
      this.isCreatingPlan = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: () => {
        this.showCreatePlanModal = false;
        this.showToast('Test plan created');
        this.loadProjectWorkspace(this.selectedProjectId as number);
      },
      error: error => {
        console.error('Unable to create test plan', error);
        this.showToast('Could not create test plan. Please try again.');
      }
    });
  }

  openCreateSuite(): void {
    if (!this.selectedPlan?.id) return;
    this.suiteForm = { name: '', description: '' };
    this.showCreateSuiteModal = true;
  }

  closeCreateSuite(): void {
    if (!this.isCreatingSuite) this.showCreateSuiteModal = false;
  }

  createSuite(): void {
    const name = this.suiteForm.name.trim();
    if (!name || !this.selectedProjectId || !this.selectedPlan?.id || this.isCreatingSuite) return;
    this.isCreatingSuite = true;
    const payload = {
      name,
      description: this.suiteForm.description.trim(),
      project: { id: this.selectedProjectId },
      testPlan: { id: Number(this.selectedPlan.id) }
    };
    this.http.post<any>(String(this.testApiUrl).replace(/\/$/, '') + '/v1/test-suites', payload, {
      headers: this.auth.getAuthHeaders()
    }).pipe(finalize(() => {
      this.isCreatingSuite = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: () => {
        this.showCreateSuiteModal = false;
        this.showToast('Test suite created');
        this.loadProjectWorkspace(this.selectedProjectId as number);
      },
      error: error => {
        console.error('Unable to create test suite', error);
        this.showToast('Could not create test suite. Please try again.');
      }
    });
  }

  openCreateTestCase(): void {
    if (!this.selectedProjectId || !this.selectedPlan?.id || !this.selectedSuite?.id) return;
    this.caseForm = this.emptyCaseForm();
    this.showCreateCaseModal = true;
  }

  closeCreateTestCase(): void {
    if (!this.isCreatingCase) this.showCreateCaseModal = false;
  }

  createTestCase(): void {
    const title = this.caseForm.title.trim();
    const steps = this.caseForm.steps.trim();
    const expectedResult = this.caseForm.expectedResult.trim();
    if (!title || !steps || !expectedResult || !this.selectedProjectId || !this.selectedPlan?.id || !this.selectedSuite?.id || this.isCreatingCase) return;

    this.isCreatingCase = true;
    const projectId = Number(this.selectedProjectId);
    const planId = Number(this.selectedPlan.id);
    const suiteId = Number(this.selectedSuite.id);
    const payload = {
      testCaseCode: this.caseForm.testCaseCode.trim() || null,
      title,
      description: this.caseForm.description.trim(),
      preconditions: this.caseForm.preconditions.trim(),
      steps,
      expectedResult,
      actualResult: '',
      status: 'DRAFT',
      priority: this.caseForm.priority,
      type: this.caseForm.type,
      project: { id: projectId },
      projectId,
      project_id: projectId,
      testPlan: { id: planId },
      testPlanId: planId,
      test_plan_id: planId,
      testSuite: { id: suiteId },
      testSuiteId: suiteId,
      test_suite_id: suiteId
    };

    this.http.post<any>(String(this.testApiUrl).replace(/\/$/, '') + '/v1/testcases', payload, {
      headers: this.auth.getAuthHeaders()
    }).pipe(finalize(() => {
      this.isCreatingCase = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: () => {
        this.showCreateCaseModal = false;
        this.showToast('Test case created in ' + this.selectedSuite?.name);
        this.loadProjectWorkspace(projectId);
      },
      error: error => {
        console.error('Unable to create test case', error);
        this.showToast(error?.error?.message || 'Could not create test case. Please try again.');
      }
    });
  }

  openAddCases(): void {
    if (!this.selectedPlan?.id || !this.selectedSuite?.id || !this.selectedProjectId) return;
    this.librarySearch = '';
    this.selectedCaseIds = new Set<number>();
    this.showAddCasesModal = true;
  }

  closeAddCases(): void {
    if (this.isAddingCases) return;
    this.showAddCasesModal = false;
    this.selectedCaseIds.clear();
    this.librarySearch = '';
  }

  isCaseInPlan(testCase: TestCase, plan: TestPlan): boolean {
    const planId = Number(plan.id);
    const directPlanId = this.entityId(testCase.testPlan, testCase.testPlanId ?? testCase.test_plan_id);
    if (directPlanId !== null) return directPlanId === planId;
    const suiteId = this.entityId(testCase.testSuite, testCase.testSuiteId ?? testCase.test_suite_id);
    if (suiteId === null) return false;
    const suite = this.testSuites.find(row => Number(row.id) === suiteId);
    return Boolean(suite && this.entityId(suite.testPlan, suite.testPlanId ?? suite.test_plan_id) === planId);
  }

  isCaseInSuite(testCase: TestCase, suite: any): boolean {
    return this.entityId(testCase.testSuite, testCase.testSuiteId ?? testCase.test_suite_id) === Number(suite?.id);
  }

  isCaseSelected(testCase: TestCase): boolean {
    const id = this.getCaseId(testCase);
    return id !== null && this.selectedCaseIds.has(id);
  }

  toggleCase(testCase: TestCase): void {
    const id = this.getCaseId(testCase);
    if (id === null || (this.selectedSuite && this.isCaseInSuite(testCase, this.selectedSuite))) return;
    const next = new Set(this.selectedCaseIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selectedCaseIds = next;
  }

  toggleAllCases(): void {
    const candidates = this.unaddedAvailableCases.filter(testCase => this.getCaseId(testCase) !== null);
    const allSelected = candidates.length > 0 && candidates.every(testCase => this.isCaseSelected(testCase));
    this.selectedCaseIds = allSelected ? new Set<number>() : new Set(candidates.map(testCase => this.getCaseId(testCase) as number));
  }

  areAllVisibleCasesSelected(): boolean {
    const candidates = this.unaddedAvailableCases.filter(testCase => this.getCaseId(testCase) !== null);
    return candidates.length > 0 && candidates.every(testCase => this.isCaseSelected(testCase));
  }

  setCaseSelection(testCase: TestCase, selected: boolean): void {
    const id = this.getCaseId(testCase);
    if (id === null || (this.selectedSuite && this.isCaseInSuite(testCase, this.selectedSuite))) return;
    const next = new Set(this.selectedCaseIds);
    if (selected) next.add(id);
    else next.delete(id);
    this.selectedCaseIds = next;
  }

  addSelectedCases(): void {
    if (!this.selectedPlan?.id || !this.selectedSuite?.id || !this.selectedCaseIds.size || this.isAddingCases) return;
    const planId = Number(this.selectedPlan.id);
    const suiteId = Number(this.selectedSuite.id);
    const selected = this.testCases.filter(testCase => {
      const id = this.getCaseId(testCase);
      return id !== null && this.selectedCaseIds.has(id) && !this.isCaseInSuite(testCase, this.selectedSuite);
    });
    if (!selected.length) return;

    this.isAddingCases = true;
    const api = String(this.testApiUrl).replace(/\/$/, '');
    const requests = selected.map(testCase => this.http.put<any>(api + '/v1/testcases/' + this.getCaseId(testCase), this.caseSuitePayload(testCase, planId, suiteId), {
      headers: this.auth.getAuthHeaders()
    }).pipe(map(() => true), catchError(error => {
      console.error('Unable to add test case ' + this.getCaseId(testCase) + ' to suite', error);
      return of(false);
    })));

    forkJoin(requests).pipe(finalize(() => {
      this.isAddingCases = false;
      this.cdr.markForCheck();
    })).subscribe(results => {
      const added = results.filter(Boolean).length;
      const failed = results.length - added;
      const failedIds = selected.filter((_testCase, index) => !results[index]).map(testCase => this.getCaseId(testCase) as number);
      this.selectedCaseIds = new Set(failedIds);
      if (!failed) {
        this.showAddCasesModal = false;
        this.librarySearch = '';
      }
      this.showToast(failed ? added + ' added, ' + failed + ' remain selected. Retry or inspect the failed requests.' : added + ' test case' + (added === 1 ? '' : 's') + ' added to the suite');
      this.loadProjectWorkspace(this.selectedProjectId as number);
    });
  }

  private caseSuitePayload(testCase: TestCase, planId: number, suiteId: number): any {
    const relation = (objectValue: any, directValue: any): any => {
      const id = this.entityId(objectValue, directValue);
      return id === null ? null : { id };
    };
    const code = testCase.testCaseCode || testCase.code || testCase.test_case_code || null;
    return {
      ...testCase,
      testCaseCode: code,
      test_case_code: code,
      title: this.getCaseTitle(testCase),
      description: testCase.description || '',
      preconditions: testCase.preconditions || '',
      steps: testCase.steps || '',
      expectedResult: testCase.expectedResult || '',
      actualResult: testCase.actualResult || '',
      status: testCase.status || 'DRAFT',
      priority: testCase.priority || 'MEDIUM',
      type: testCase.type || null,
      assignee: testCase.assignee || null,
      reporter: testCase.reporter || null,
      project: relation(testCase.project, testCase.projectId ?? testCase.project_id) || (this.selectedProjectId ? { id: this.selectedProjectId } : null),
      projectId: this.selectedProjectId,
      project_id: this.selectedProjectId,
      testPlan: { id: planId },
      testPlanId: planId,
      test_plan_id: planId,
      testSuite: { id: suiteId },
      testSuiteId: suiteId,
      test_suite_id: suiteId,
      epic: relation(testCase.epic, testCase.epicId ?? testCase.epic_id),
      story: relation(testCase.story, testCase.storyId ?? testCase.story_id),
      task: relation(testCase.task, testCase.taskId ?? testCase.task_id),
      user: relation(testCase.user, testCase.userId ?? testCase.user_id)
    };
  }

  getCaseCode(testCase: TestCase): string {
    return testCase.testCaseCode || testCase.test_case_code || testCase.code || ('TC-' + (this.getCaseId(testCase) ?? '—'));
  }

  getCaseId(testCase: TestCase): number | null {
    const id = Number((testCase as any).id ?? (testCase as any).testcase_id ?? (testCase as any).testCaseId ?? (testCase as any).test_case_id ?? (testCase as any).testcaseId ?? (testCase as any).caseId);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  getCaseTitle(testCase: TestCase): string {
    return testCase.title || testCase.name || 'Untitled test case';
  }

  getCaseType(testCase: TestCase): string {
    return testCase.type || 'Manual';
  }

  getStatusClass(status: string | undefined): string {
    const value = (status || 'DRAFT').toLowerCase().replace(/[^a-z]+/g, '-');
    return 'status-' + value;
  }

  getPriorityClass(priority: string | undefined): string {
    const value = (priority || 'medium').toLowerCase().replace(/[^a-z]+/g, '-');
    return 'priority-' + value;
  }

  getCasePlanName(testCase: TestCase): string {
    const id = this.entityId(testCase.testPlan, testCase.testPlanId ?? testCase.test_plan_id);
    const suiteId = this.entityId(testCase.testSuite, testCase.testSuiteId ?? testCase.test_suite_id);
    const suite = this.testSuites.find(row => Number(row.id) === suiteId);
    const suitePlanId = suite ? this.entityId(suite.testPlan, suite.testPlanId ?? suite.test_plan_id) : null;
    const plan = this.testPlans.find(row => Number(row.id) === (id ?? suitePlanId));
    return plan?.name || 'Unassigned';
  }

  getCaseSuiteName(testCase: TestCase): string {
    const suiteId = this.entityId(testCase.testSuite, testCase.testSuiteId ?? testCase.test_suite_id);
    const suite = this.testSuites.find(row => Number(row.id) === suiteId);
    return suite?.name || 'Unassigned';
  }

  getPlanCaseCount(plan: TestPlan): number {
    return this.testCases.filter(testCase => this.isCaseInPlan(testCase, plan)).length;
  }

  getSuiteCaseCount(suite: any): number {
    return this.testCases.filter(testCase => this.isCaseInSuite(testCase, suite)).length;
  }

  get visibleSuites(): any[] {
    if (!this.selectedPlan?.id) return [];
    const query = this.planSearch.trim().toLowerCase();
    return this.testSuites.filter(suite => {
      const planId = this.entityId(suite.testPlan, suite.testPlanId ?? suite.test_plan_id);
      return planId === Number(this.selectedPlan?.id) && (!query || (suite.name + ' ' + (suite.description || '')).toLowerCase().includes(query));
    });
  }

  visibleSuitesForPlan(plan: TestPlan): any[] {
    return this.testSuites.filter(suite =>
      this.entityId(suite.testPlan, suite.testPlanId ?? suite.test_plan_id) === Number(plan.id)
    );
  }

  trackById(_index: number, item: any): number | string {
    return item?.id ?? _index;
  }

  getProjectOptionId(project: any): number | null {
    const value = project?.id ?? project?.projectId ?? project?.project_id;
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  private getProjectId(item: any): number | null {
    if (!item) return null;
    const direct = item.project_id ?? item.projectId ?? item.project?.id ?? item.project?.projectId ?? (typeof item.project === 'number' ? item.project : null);
    const id = Number(direct);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  private normalizePlan(row: any): TestPlan {
    const id = Number(row?.id ?? row?.testPlanId ?? row?.test_plan_id);
    return { ...row, id: Number.isFinite(id) && id > 0 ? id : undefined, name: String(row?.name ?? row?.title ?? 'Untitled plan') };
  }

  private normalizeSuite(row: any): any {
    const id = Number(row?.id ?? row?.testSuiteId ?? row?.test_suite_id);
    return {
      ...row,
      id: Number.isFinite(id) && id > 0 ? id : undefined,
      name: String(row?.name ?? row?.title ?? 'Untitled suite'),
      testPlanId: row?.testPlanId ?? row?.test_plan_id ?? row?.testPlan?.id ?? row?.test_plan?.id
    };
  }

  private normalizeCase(row: any): TestCase {
    const id = Number(row?.id ?? row?.testcase_id ?? row?.testCaseId ?? row?.test_case_id ?? row?.testcaseId ?? row?.caseId);
    return {
      ...row,
      id: Number.isFinite(id) && id > 0 ? id : undefined,
      testCaseCode: row?.testCaseCode ?? row?.test_case_code ?? row?.code,
      title: row?.title ?? row?.name,
      projectId: row?.projectId ?? row?.project_id ?? row?.project?.id,
      testPlanId: row?.testPlanId ?? row?.test_plan_id ?? row?.testPlan?.id ?? row?.test_plan?.id,
      testSuiteId: row?.testSuiteId ?? row?.test_suite_id ?? row?.testSuite?.id ?? row?.test_suite?.id,
      status: row?.status ?? row?.executionStatus ?? row?.execution_status ?? 'DRAFT'
    };
  }

  private entityId(value: any, fallback?: any): number | null {
    const candidate = value && typeof value === 'object'
      ? value.id ?? value.projectId ?? value.testPlanId ?? value.testSuiteId ?? value.test_plan_id ?? value.test_suite_id ?? fallback
      : value ?? fallback;
    const id = Number(candidate);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  private extractArray(response: any): any[] {
    if (Array.isArray(response)) return response;
    if (!response || typeof response !== 'object') return [];
    for (const key of ['content', 'data', 'items', 'results', 'records', 'plans', 'suites', 'testPlans', 'testCases', 'testSuites', 'test_plans', 'test_cases', 'test_suites']) {
      if (Array.isArray(response[key]) && response[key].length) return response[key];
      if (response[key] && typeof response[key] === 'object') {
        const nested = this.extractArray(response[key]);
        if (nested.length) return nested;
      }
    }
    return [];
  }

  private showToast(message: string): void {
    this.successMessage = message;
    this.showSuccessToast = true;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.showSuccessToast = false;
      this.cdr.markForCheck();
    }, 3400);
  }

  private emptyCaseForm(): { testCaseCode: string; title: string; description: string; preconditions: string; steps: string; expectedResult: string; priority: string; type: string } {
    return {
      testCaseCode: 'TC-' + Date.now().toString().slice(-6),
      title: '',
      description: '',
      preconditions: '',
      steps: '',
      expectedResult: '',
      priority: 'MEDIUM',
      type: 'Functional'
    };
  }
}
