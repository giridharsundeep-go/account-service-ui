import {
  Component,
  ChangeDetectorRef,
  OnInit,
  inject
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { HttpClient } from '@angular/common/http';
import { AuthService } from '../auth.service';

import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { environment } from '../../environment';
import { MatIconModule } from '@angular/material/icon';


/* ============================================================
   TEST CASE
============================================================ */

export interface TestCase {

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

  testSuite?: any;
  testSuiteId?: any;
  test_suite_id?: any;

  testPlan?: any;
  testPlanId?: any;
  test_plan_id?: any;

  createdAt?: string;
  updatedAt?: string;

  createdDate?: string;
  updatedDate?: string;

  type?: string;
  assignee?: string;
  reporter?: string;
}


/* ============================================================
   TEST PLAN
============================================================ */

export interface TestPlan {

  id?: number;

  name: string;

  description?: string;

  project?: any;

  projectId?: number | null;

  expanded?: boolean;

  suites?: TestSuite[];

  createdAt?: string;
  updatedAt?: string;
}


/* ============================================================
   TEST SUITE
============================================================ */

export interface TestSuite {

  id?: number;

  name: string;

  description?: string;

  project?: any;

  projectId?: number | null;

  testPlan?: any;

  testPlanId?: number;

  expanded?: boolean;

  testCases?: TestCase[];

  createdAt?: string;
  updatedAt?: string;
}


/* ============================================================
   COMPONENT
============================================================ */

@Component({
  selector: 'app-testcases',
  standalone: true,

  imports: [
    CommonModule,
    FormsModule, MatIconModule
  ],

  templateUrl: './testcases.html',
  styleUrls: ['./testcases.css']
})
export class Testcases implements OnInit {

  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  /*
   * KEEP EXISTING API CONFIGURATION
   */
  baseUrl = environment.apiBaseUrl;
  baseUrl2 = environment.apiBaseUrl2 || environment.apiBaseUrl;


  /* ============================================================
     PAGE STATE
  ============================================================ */

  searchText = '';

  showFilters = false;

  showCreateTestCaseModal = false;
  showEditTestCaseModal = false;

  showCreatePlanModal = false;
  showEditPlanModal = false;

  showCreateSuiteModal = false;
  showEditSuiteModal = false;

  showSuccessToast = false;
  successMessage = '';


  /* ============================================================
     PROJECT SELECTION
  ============================================================ */

  selectedProjectId: number | null = null;


  /* ============================================================
     FILTERS
  ============================================================ */

  selectedStatus = '';
  selectedPriority = '';
  selectedType = '';
  selectedAssignee = '';

  statuses = [
    'DRAFT',
    'READY',
    'IN_PROGRESS',
    'PASSED',
    'FAILED',
    'BLOCKED'
  ];

  priorities = [
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
  ];

  types = [
    'Functional',
    'Regression',
    'Smoke',
    'Integration',
    'UI',
    'API'
  ];

  assignees = [
    'John Smith',
    'Sarah Wilson',
    'Michael Brown',
    'Priya Sharma',
    'David Miller'
  ];


  /* ============================================================
     DATA
  ============================================================ */

  projects: any[] = [];

  epics: any[] = [];

  stories: any[] = [];

  tasks: any[] = [];

  users: any[] = [];

  testPlans: TestPlan[] = [];

  testSuites: TestSuite[] = [];

  testCases: TestCase[] = [];


  /* ============================================================
     SELECTION
  ============================================================ */

  selectedPlan: TestPlan | null = null;

  selectedSuite: TestSuite | null = null;

  selectedTestCase: TestCase | null = null;

  /* ============================================================
   ADD EXISTING TEST CASES TO SUITE
============================================================ */

showAddTestCasesModal = false;

availableTestCases: TestCase[] = [];

selectedTestCaseIds = new Set<number>();

addTestCaseSearch = '';

isAddingTestCases = false;


  /* ============================================================
     FORMS
  ============================================================ */

  testcaseForm: TestCase =
    this.createEmptyTestCase();

  planForm: TestPlan =
    this.createEmptyPlan();

  suiteForm: TestSuite =
    this.createEmptySuite();


  /* ============================================================
     INIT
  ============================================================ */

  ngOnInit(): void {

    this.loadProjects();

    this.loadTestPlans();

    this.loadTestSuites();

    this.loadTestcases();

    this.loadUsers();

    this.loadTasks();
  }

  /* ============================================================
   ADD EXISTING TEST CASES TO SUITE
============================================================ */

openAddTestCasesToSuite(): void {

  if (!this.selectedSuite?.id) {
    this.showToast('Please select a test suite first');
    return;
  }

  if (!this.selectedProjectId) {
    this.showToast('Please select a project first');
    return;
  }

  this.addTestCaseSearch = '';

  this.selectedTestCaseIds =
    new Set<number>();

  /*
   * Use the already-loaded project-filtered
   * test cases.
   */
  this.availableTestCases =
    [...this.testCases];

  /*
   * Pre-select test cases that already
   * belong to this suite.
   */
  const suiteId =
    Number(this.selectedSuite.id);

  this.availableTestCases.forEach(tc => {

    const testcaseSuiteId =
      this.getEntityId(
        tc.testSuite,
        tc.testSuiteId ||
        tc.test_suite_id
      );

    if (
      testcaseSuiteId !== null &&
      testcaseSuiteId !== undefined &&
      testcaseSuiteId !== '' &&
      Number(testcaseSuiteId) === suiteId
    ) {

      if (tc.id !== undefined) {
        this.selectedTestCaseIds.add(
          Number(tc.id)
        );
      }
    }
  });

  this.showAddTestCasesModal =
    true;

  this.cdr.detectChanges();
}


closeAddTestCasesToSuite(): void {

  if (this.isAddingTestCases) {
    return;
  }

  this.showAddTestCasesModal =
    false;

  this.availableTestCases = [];

  this.selectedTestCaseIds =
    new Set<number>();

  this.addTestCaseSearch = '';
}


get filteredAvailableTestCases(): TestCase[] {

  const search =
    this.addTestCaseSearch
      .trim()
      .toLowerCase();

  if (!search) {
    return this.availableTestCases;
  }

  return this.availableTestCases.filter(
    tc => {

      const code =
        this.getTestCaseCode(tc);

      const title =
        this.getTestCaseTitle(tc);

      const description =
        tc.description || '';

      const status =
        tc.status || '';

      const priority =
        tc.priority || '';

      const suite =
        this.getSuiteDisplay(tc);

      return [
        code,
        title,
        description,
        status,
        priority,
        suite
      ]
        .join(' ')
        .toLowerCase()
        .includes(search);
    }
  );
}


isTestCaseSelected(
  testcase: TestCase
): boolean {

  if (testcase.id === undefined) {
    return false;
  }

  return this.selectedTestCaseIds.has(
    Number(testcase.id)
  );
}


toggleTestCaseForSuite(
  testcase: TestCase
): void {

  if (testcase.id === undefined) {
    return;
  }

  const id =
    Number(testcase.id);

  const next =
    new Set(
      this.selectedTestCaseIds
    );

  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }

  this.selectedTestCaseIds =
    next;
}


selectAllAvailableTestCases(): void {

  const next =
    new Set(
      this.selectedTestCaseIds
    );

  this.filteredAvailableTestCases
    .forEach(tc => {

      if (tc.id !== undefined) {
        next.add(
          Number(tc.id)
        );
      }
    });

  this.selectedTestCaseIds =
    next;
}


clearSelectedAvailableTestCases(): void {

  const visibleIds =
    new Set(
      this.filteredAvailableTestCases
        .filter(tc => tc.id !== undefined)
        .map(tc => Number(tc.id))
    );

  const next =
    new Set<number>();

  this.selectedTestCaseIds.forEach(id => {

    if (!visibleIds.has(id)) {
      next.add(id);
    }
  });

  this.selectedTestCaseIds =
    next;
}


get selectedAvailableTestCaseCount(): number {

  return this.selectedTestCaseIds.size;
}


get availableAlreadyAssignedCount(): number {

  if (!this.selectedSuite?.id) {
    return 0;
  }

  const suiteId =
    Number(this.selectedSuite.id);

  return this.availableTestCases.filter(
    tc => {

      const testcaseSuiteId =
        this.getEntityId(
          tc.testSuite,
          tc.testSuiteId ||
          tc.test_suite_id
        );

      return (
        testcaseSuiteId !== null &&
        testcaseSuiteId !== undefined &&
        testcaseSuiteId !== '' &&
        Number(testcaseSuiteId) === suiteId
      );
    }
  ).length;
}


/* ============================================================
   ADD SELECTED TEST CASES TO CURRENT SUITE
============================================================ */

addSelectedTestCasesToSuite(): void {

  if (!this.selectedSuite?.id) {
    this.showToast(
      'Please select a test suite first'
    );

    return;
  }

  if (!this.selectedTestCaseIds.size) {
    this.showToast(
      'Please select at least one test case'
    );

    return;
  }

  const suiteId =
    Number(this.selectedSuite.id);

  const selectedCases =
    this.availableTestCases.filter(
      tc =>
        tc.id !== undefined &&
        this.selectedTestCaseIds.has(
          Number(tc.id)
        )
    );

  if (!selectedCases.length) {
    return;
  }

  this.isAddingTestCases = true;

  const headers =
    this.auth.getAuthHeaders();

  /*
   * Only update cases that are not already
   * assigned to this suite.
   */
  const casesToUpdate =
    selectedCases.filter(tc => {

      const existingSuiteId =
        this.getEntityId(
          tc.testSuite,
          tc.testSuiteId ||
          tc.test_suite_id
        );

      return (
        Number(existingSuiteId) !== suiteId
      );
    });

  /*
   * Nothing new to attach.
   */
  if (!casesToUpdate.length) {

    this.isAddingTestCases = false;

    this.showToast(
      'Selected test cases are already in this suite'
    );

    this.closeAddTestCasesToSuite();

    return;
  }

  let completed = 0;

  let failed = 0;

  casesToUpdate.forEach(testcase => {

    const projectId =
      this.getEntityId(
        testcase.project,
        testcase.projectId ||
        testcase.project_id
      );

    const planId =
      this.getEntityId(
        testcase.testPlan,
        testcase.testPlanId ||
        testcase.test_plan_id
      );

    /*
     * Keep every existing testcase field.
     *
     * Only change testSuite.
     */
    const payload: any = {

      testCaseCode:
        testcase.testCaseCode ||
        testcase.code ||
        testcase.test_case_code ||
        null,

      title:
        this.getTestCaseTitle(testcase),

      description:
        testcase.description || '',

      preconditions:
        testcase.preconditions || '',

      steps:
        testcase.steps || '',

      expectedResult:
        testcase.expectedResult || '',

      actualResult:
        testcase.actualResult || '',

      status:
        testcase.status || 'DRAFT',

      priority:
        testcase.priority || 'MEDIUM',

      project:
        projectId
          ? {
              id:
                Number(projectId)
            }
          : null,

      testPlan:
        planId
          ? {
              id:
                Number(planId)
            }
          : null,

      /*
       * NEW / UPDATED SUITE
       */
      testSuite: {
        id: suiteId
      },

      epic:
        testcase.epicId ||
        testcase.epic_id
          ? {
              id:
                Number(
                  testcase.epicId ||
                  testcase.epic_id
                )
            }
          : null,

      story:
        testcase.storyId ||
        testcase.story_id
          ? {
              id:
                Number(
                  testcase.storyId ||
                  testcase.story_id
                )
            }
          : null,

      task:
        testcase.taskId ||
        testcase.task_id
          ? {
              id:
                Number(
                  testcase.taskId ||
                  testcase.task_id
                )
            }
          : null,

      user:
        testcase.userId ||
        testcase.user_id
          ? {
              id:
                Number(
                  testcase.userId ||
                  testcase.user_id
                )
            }
          : null
    };

    this.http
      .put<any>(
        `${this.baseUrl2}/v1/testcases/${testcase.id}`,
        payload,
        { headers }
      )
      .subscribe({

        next: () => {

          completed++;

          if (
            completed + failed ===
            casesToUpdate.length
          ) {

            this.finishAddingTestCases(
              completed,
              failed
            );
          }
        },

        error: err => {

          failed++;

          console.error(
            `Error adding test case ${testcase.id} to suite:`,
            err
          );

          if (
            completed + failed ===
            casesToUpdate.length
          ) {

            this.finishAddingTestCases(
              completed,
              failed
            );
          }
        }
      });
  });
}


private finishAddingTestCases(
  completed: number,
  failed: number
): void {

  this.isAddingTestCases = false;

  this.showAddTestCasesModal =
    false;

  this.availableTestCases = [];

  this.selectedTestCaseIds =
    new Set<number>();

  this.addTestCaseSearch = '';

  if (failed === 0) {

    this.showToast(
      `${completed} test case${completed === 1 ? '' : 's'} added to "${this.selectedSuite?.name}"`
    );

  } else {

    this.showToast(
      `${completed} added, ${failed} failed`
    );
  }

  /*
   * Reload through your existing API
   * and rebuild:
   *
   * Project
   *   └── Test Plan
   *       └── Test Suite
   *           └── Test Cases
   */
  this.loadTestcases();
}


  /* ============================================================
     PROJECTS
  ============================================================ */

  loadProjects(): void {

    const headers =
      this.auth.getAuthHeaders();

    this.http
      .get<any>(
        `${this.baseUrl}/projects`,
        { headers }
      )
      .pipe(
        catchError(() => of([]))
      )
      .subscribe(data => {

        this.projects =
          this.extractArray(data);

        /*
         * Automatically select first project
         * only when nothing is selected.
         */
        if (
          !this.selectedProjectId &&
          this.projects.length
        ) {

          const first =
            this.projects[0];

          this.selectedProjectId =
            Number(
              this.getOptionId(first)
            );

          this.applyProjectSelection();
        }

        this.cdr.detectChanges();
      });
  }


  /* ============================================================
     PROJECT CHANGE
  ============================================================ */

  onProjectChange(value: any): void {

    const projectId =
      Number(value);

    if (
      !projectId ||
      isNaN(projectId)
    ) {

      this.selectedProjectId = null;

      this.selectedPlan = null;
      this.selectedSuite = null;
      this.selectedTestCase = null;

      return;
    }

    this.selectedProjectId =
      projectId;

    this.applyProjectSelection();
  }


  /* ============================================================
     APPLY PROJECT SELECTION
  ============================================================ */

  applyProjectSelection(): void {

    const projectId =
      this.selectedProjectId;

    if (!projectId) {
      return;
    }

    /*
     * Reload the same existing APIs.
     */
    this.loadTestPlans();

    this.loadTestSuites();

    this.loadTestcases();

    /*
     * These require project id.
     */
    this.loadEpics();

    this.loadStories();

    /*
     * Reset current tree selection.
     */
    this.selectedPlan = null;

    this.selectedSuite = null;

    this.selectedTestCase = null;

    this.cdr.detectChanges();
  }


  /* ============================================================
     TEST PLANS
  ============================================================ */

  loadTestPlans(): void {

    const headers =
      this.auth.getAuthHeaders();

    this.http
      .get<any>(
        `${this.baseUrl2}/v1/test-plans`,
        { headers }
      )
      .pipe(
        catchError(() => of([]))
      )
      .subscribe(data => {

        const plans =
          this.extractArray(data);

        /*
         * Only show plans for selected project.
         */
        const filtered =
          this.selectedProjectId
            ? plans.filter(
                plan =>
                  String(
                    this.getProjectId(plan)
                  ) ===
                  String(
                    this.selectedProjectId
                  )
              )
            : plans;

        this.testPlans =
          filtered.map(plan => ({
            ...plan,
            expanded: false,
            suites: []
          }));

        this.attachTestCasesToSuites();
        this.attachSuitesToPlans();

        this.cdr.detectChanges();
      });
  }


  /* ============================================================
     TEST SUITES
  ============================================================ */

  loadTestSuites(): void {

    const headers =
      this.auth.getAuthHeaders();

    this.http
      .get<any>(
        `${this.baseUrl2}/v1/test-suites`,
        { headers }
      )
      .pipe(
        catchError(() => of([]))
      )
      .subscribe(data => {

        const suites =
          this.extractArray(data);

        /*
         * Only suites belonging to selected project.
         */
        this.testSuites =
          this.selectedProjectId
            ? suites.filter(
                suite =>
                  String(
                    this.getProjectId(suite)
                  ) ===
                  String(
                    this.selectedProjectId
                  )
              )
            : suites;

        this.attachTestCasesToSuites();
        this.attachSuitesToPlans();

        this.cdr.detectChanges();
      });
  }


  /* ============================================================
     TEST CASES
  ============================================================ */

  loadTestcases(): void {

    const headers =
      this.auth.getAuthHeaders();

    this.http
      .get<any>(
        `${this.baseUrl2}/v1/testcases`,
        { headers }
      )
      .pipe(
        catchError(() => of([]))
      )
      .subscribe(data => {

        const cases =
          this.extractArray(data);

        /*
         * IMPORTANT:
         *
         * Test cases are filtered by project_id.
         */
        this.testCases =
          this.selectedProjectId
            ? cases.filter(
                testcase =>
                  String(
                    this.getProjectId(testcase)
                  ) ===
                  String(
                    this.selectedProjectId
                  )
              )
            : cases;

        this.attachTestCasesToSuites();

        this.selectInitialNode();

        this.cdr.detectChanges();
      });
  }


  /* ============================================================
     USERS
  ============================================================ */

  loadUsers(): void {

    const headers =
      this.auth.getAuthHeaders();

    this.http
      .get<any>(
        `${this.baseUrl}/user`,
        { headers }
      )
      .pipe(
        catchError(() => of([]))
      )
      .subscribe(data => {

        this.users =
          this.extractArray(data);

        this.cdr.detectChanges();
      });
  }


  /* ============================================================
     EPICS
     FIXED: projId was undefined.
  ============================================================ */

  loadEpics(): void {

    const headers =
      this.auth.getAuthHeaders();

    const projId =
      this.selectedProjectId;

    if (!projId) {

      this.epics = [];

      return;
    }

    /*
     * KEEPING YOUR EXISTING API.
     */
    this.http
      .get<any>(
        `${this.baseUrl}/projects/${projId}/epics`,
        { headers }
      )
      .pipe(
        catchError(() => of([]))
      )
      .subscribe(data => {

        this.epics =
          this.extractArray(data);

        this.cdr.detectChanges();
      });
  }


  /* ============================================================
     STORIES
     FIXED: projId was undefined.
  ============================================================ */

  loadStories(): void {

    const headers =
      this.auth.getAuthHeaders();

    const projId =
      this.selectedProjectId;

    if (!projId) {

      this.stories = [];

      return;
    }

    /*
     * KEEPING YOUR EXISTING API.
     */
    this.http
      .get<any>(
        `${this.baseUrl}/projects/${projId}/stories`,
        { headers }
      )
      .pipe(
        catchError(() => of([]))
      )
      .subscribe(data => {

        this.stories =
          this.extractArray(data);

        this.cdr.detectChanges();
      });
  }


  /* ============================================================
     TASKS
  ============================================================ */

  loadTasks(): void {

    const headers =
      this.auth.getAuthHeaders();

    this.http
      .get<any[]>(
        `${this.baseUrl}/tasks`,
        { headers }
      )
      .pipe(
        catchError(() => of([]))
      )
      .subscribe(data => {

        this.tasks =
          this.extractArray(data);
      });
  }


  /* ============================================================
     ATTACH SUITES TO PLANS
  ============================================================ */

  attachSuitesToPlans(): void {

    this.testPlans.forEach(plan => {

      plan.suites = [];

      const planId =
        this.getEntityId(
          plan,
          plan.id
        );

      this.testSuites
        .filter(suite => {

          const suitePlanId =
            this.getEntityId(
              suite.testPlan,
              suite.testPlanId
            );

          return String(suitePlanId) ===
            String(planId);
        })
        .forEach(suite => {

          suite.testCases =
            suite.testCases || [];

          suite.expanded =
            suite.expanded ?? false;

          plan.suites!.push(
            suite
          );
        });
    });
  }


  /* ============================================================
     ATTACH TEST CASES TO SUITES
  ============================================================ */

  attachTestCasesToSuites(): void {

    this.testSuites.forEach(
      suite => {

        suite.testCases = [];

        const suiteId =
          suite.id;

        this.testCases
          .filter(testcase => {

            const testcaseSuiteId =
              this.getEntityId(
                testcase.testSuite,
                testcase.testSuiteId ||
                testcase.test_suite_id
              );

            return (
              testcaseSuiteId !== null &&
              testcaseSuiteId !== undefined &&
              testcaseSuiteId !== '' &&
              Number(testcaseSuiteId) === Number(suiteId)
            );
          })
          .forEach(testcase => {

            suite.testCases!.push(
              testcase
            );
          });
      }
    );

    this.attachSuitesToPlans();
  }


  /* ============================================================
     INITIAL SELECTION
  ============================================================ */

  selectInitialNode(): void {

    if (!this.testPlans.length) {

      this.selectedPlan = null;
      this.selectedSuite = null;
      this.selectedTestCase = null;

      return;
    }

    this.selectedPlan =
      this.testPlans[0];

    this.selectedPlan.expanded =
      true;

    const suites =
      this.selectedPlan.suites || [];

    if (!suites.length) {

      this.selectedSuite = null;
      this.selectedTestCase = null;

      return;
    }

    this.selectedSuite =
      suites[0];

    this.selectedSuite.expanded =
      true;

    const cases =
      this.selectedSuite.testCases || [];

    this.selectedTestCase =
      cases.length
        ? cases[0]
        : null;
  }


  /* ============================================================
     PLAN ACTIONS
  ============================================================ */

  togglePlan(
    event: Event,
    plan: TestPlan
  ): void {

    event.stopPropagation();

    plan.expanded =
      !plan.expanded;

    this.selectedPlan =
      plan;

    this.selectedSuite =
      null;

    this.selectedTestCase =
      null;
  }


  selectPlan(
    event: Event,
    plan: TestPlan
  ): void {

    event.stopPropagation();

    this.selectedPlan =
      plan;

    this.selectedSuite =
      null;

    this.selectedTestCase =
      null;

    plan.expanded =
      true;
  }


  /* ============================================================
     SUITE ACTIONS
  ============================================================ */

  toggleSuite(
    event: Event,
    plan: TestPlan,
    suite: TestSuite
  ): void {

    event.stopPropagation();

    this.selectedPlan =
      plan;

    this.selectedSuite =
      suite;

    this.selectedTestCase =
      null;

    suite.expanded =
      !suite.expanded;
  }


  selectSuite(
    event: Event,
    plan: TestPlan,
    suite: TestSuite
  ): void {

    event.stopPropagation();

    this.selectedPlan =
      plan;

    this.selectedSuite =
      suite;

    this.selectedTestCase =
      null;

    plan.expanded =
      true;

    suite.expanded =
      true;
  }


  /* ============================================================
     TEST CASE
  ============================================================ */

  selectTestCase(
    event: Event,
    testcase: TestCase
  ): void {

    event.stopPropagation();

    this.selectedTestCase =
      testcase;
  }


  /* ============================================================
     CREATE TEST PLAN
  ============================================================ */

  openCreatePlan(): void {

    this.planForm =
      this.createEmptyPlan();

    this.planForm.projectId =
      this.selectedProjectId || undefined;

    this.planForm.project =
      this.getSelectedProject();

    this.showCreatePlanModal =
      true;
  }


  closeCreatePlan(): void {

    this.showCreatePlanModal =
      false;
  }


  createPlan(): void {

    if (
      !this.planForm.name?.trim() ||
      !this.selectedProjectId
    ) {
      return;
    }

    const headers =
      this.auth.getAuthHeaders();

    const payload: any = {

      name:
        this.planForm.name.trim(),

      description:
        this.planForm.description || '',

      project: {
        id:
          Number(
            this.selectedProjectId
          )
      }
    };

    this.http
      .post<any>(
        `${this.baseUrl2}/v1/test-plans`,
        payload,
        { headers }
      )
      .subscribe({

        next: created => {

          this.showCreatePlanModal =
            false;

          this.showToast(
            'Test plan created successfully'
          );

          this.loadTestPlans();
        },

        error: err => {

          console.error(
            'Error creating test plan:',
            err
          );
        }
      });
  }


  /* ============================================================
     EDIT TEST PLAN
  ============================================================ */

  openEditPlan(
    event: Event,
    plan: TestPlan
  ): void {

    event.stopPropagation();

    this.planForm = {
      ...plan
    };

    this.planForm.projectId =
      this.getProjectId(plan);

    this.showEditPlanModal =
      true;
  }


  closeEditPlan(): void {

    this.showEditPlanModal =
      false;
  }


  updatePlan(): void {

    if (
      !this.planForm.id ||
      !this.planForm.name?.trim()
    ) {
      return;
    }

    const headers =
      this.auth.getAuthHeaders();

    const projectId =
      this.getProjectId(
        this.planForm
      );

    const payload: any = {

      name:
        this.planForm.name.trim(),

      description:
        this.planForm.description || '',

      project: {
        id:
          Number(
            projectId
          )
      }
    };

    this.http
      .put<any>(
        `${this.baseUrl2}/v1/test-plans/${this.planForm.id}`,
        payload,
        { headers }
      )
      .subscribe({

        next: () => {

          this.showEditPlanModal =
            false;

          this.showToast(
            'Test plan updated successfully'
          );

          this.loadTestPlans();
        },

        error: err => {

          console.error(
            'Error updating test plan:',
            err
          );
        }
      });
  }


  /* ============================================================
     DELETE TEST PLAN
  ============================================================ */

  deletePlan(
    event: Event,
    plan: TestPlan
  ): void {

    event.stopPropagation();

    if (!plan.id) {
      return;
    }

    if (
      !confirm(
        `Delete test plan "${plan.name}"?`
      )
    ) {
      return;
    }

    const headers =
      this.auth.getAuthHeaders();

    this.http
      .delete(
        `${this.baseUrl2}/v1/test-plans/${plan.id}`,
        { headers }
      )
      .subscribe({

        next: () => {

          this.showToast(
            'Test plan deleted successfully'
          );

          this.loadTestPlans();

          this.selectedPlan = null;
          this.selectedSuite = null;
          this.selectedTestCase = null;
        }
      });
  }


  /* ============================================================
     CREATE TEST SUITE
  ============================================================ */

  openCreateSuite(): void {

    this.suiteForm =
      this.createEmptySuite();

    if (this.selectedPlan) {

      this.suiteForm.testPlan =
        this.selectedPlan;

      this.suiteForm.testPlanId =
        this.selectedPlan.id;

      this.suiteForm.project =
        this.selectedPlan.project;

      this.suiteForm.projectId =
        this.getProjectId(
          this.selectedPlan
        );
    }

    if (!this.suiteForm.projectId) {

      this.suiteForm.projectId =
        this.selectedProjectId || undefined;
    }

    this.showCreateSuiteModal =
      true;
  }

  toNumber(value: any): number {
  const numberValue = Number(value);

  return Number.isFinite(numberValue)
    ? numberValue
    : 0;
}


  closeCreateSuite(): void {

    this.showCreateSuiteModal =
      false;
  }


  createSuite(): void {

    if (
      !this.suiteForm.name?.trim() ||
      !this.suiteForm.testPlanId ||
      !this.selectedProjectId
    ) {
      return;
    }

    const headers =
      this.auth.getAuthHeaders();

    const payload: any = {

      name:
        this.suiteForm.name.trim(),

      description:
        this.suiteForm.description || '',

      project: {
        id:
          Number(
            this.selectedProjectId
          )
      },

      testPlan: {
        id:
          Number(
            this.suiteForm.testPlanId
          )
      }
    };

    this.http
      .post<any>(
        `${this.baseUrl2}/v1/test-suites`,
        payload,
        { headers }
      )
      .subscribe({

        next: () => {

          this.showCreateSuiteModal =
            false;

          this.showToast(
            'Test suite created successfully'
          );

          this.loadTestSuites();
        },

        error: err => {

          console.error(
            'Error creating test suite:',
            err
          );
        }
      });
  }


  /* ============================================================
     EDIT TEST SUITE
  ============================================================ */

  openEditSuite(
    event: Event,
    suite: TestSuite
  ): void {

    event.stopPropagation();

    this.suiteForm = {
      ...suite
    };

    this.suiteForm.projectId =
      this.getProjectId(suite);

    this.suiteForm.testPlanId =
      this.getEntityId(
        suite.testPlan,
        suite.testPlanId
      );

    this.showEditSuiteModal =
      true;
  }


  closeEditSuite(): void {

    this.showEditSuiteModal =
      false;
  }


  updateSuite(): void {

    if (
      !this.suiteForm.id ||
      !this.suiteForm.name?.trim()
    ) {
      return;
    }

    const headers =
      this.auth.getAuthHeaders();

    const projectId =
      this.getProjectId(
        this.suiteForm
      );

    const planId =
      this.getEntityId(
        this.suiteForm.testPlan,
        this.suiteForm.testPlanId
      );

    const payload: any = {

      name:
        this.suiteForm.name.trim(),

      description:
        this.suiteForm.description || '',

      project: {
        id:
          Number(projectId)
      },

      testPlan: {
        id:
          Number(planId)
      }
    };

    this.http
      .put<any>(
        `${this.baseUrl2}/v1/test-suites/${this.suiteForm.id}`,
        payload,
        { headers }
      )
      .subscribe({

        next: () => {

          this.showEditSuiteModal =
            false;

          this.showToast(
            'Test suite updated successfully'
          );

          this.loadTestSuites();
        },

        error: err => {

          console.error(
            'Error updating test suite:',
            err
          );
        }
      });
  }


  /* ============================================================
     DELETE TEST SUITE
  ============================================================ */

  deleteSuite(
    event: Event,
    suite: TestSuite
  ): void {

    event.stopPropagation();

    if (!suite.id) {
      return;
    }

    if (
      !confirm(
        `Delete test suite "${suite.name}"?`
      )
    ) {
      return;
    }

    const headers =
      this.auth.getAuthHeaders();

    this.http
      .delete(
        `${this.baseUrl2}/v1/test-suites/${suite.id}`,
        { headers }
      )
      .subscribe({

        next: () => {

          this.showToast(
            'Test suite deleted successfully'
          );

          this.loadTestSuites();

          this.selectedSuite = null;
          this.selectedTestCase = null;
        }
      });
  }


  /* ============================================================
     CREATE TEST CASE
  ============================================================ */

  openCreateTestCase(): void {

    this.testcaseForm =
      this.createEmptyTestCase();

    this.testcaseForm.projectId =
      this.selectedProjectId || undefined;

    this.testcaseForm.project =
      this.getSelectedProject();

    if (this.selectedPlan) {

      this.testcaseForm.testPlan =
        this.selectedPlan;

      this.testcaseForm.testPlanId =
        this.selectedPlan.id;
    }

    if (this.selectedSuite) {

      this.testcaseForm.testSuite =
        this.selectedSuite;

      this.testcaseForm.testSuiteId =
        this.selectedSuite.id;
    }

    this.loadEpics();
    this.loadStories();

    this.showCreateTestCaseModal =
      true;
  }


  closeCreateTestCase(): void {

    this.showCreateTestCaseModal =
      false;
  }


  createTestCase(): void {

    if (
      !this.testcaseForm.title?.trim() ||
      !this.testcaseForm.steps?.trim() ||
      !this.testcaseForm.expectedResult?.trim() ||
      !this.selectedProjectId
    ) {
      return;
    }

    const headers =
      this.auth.getAuthHeaders();

    const projectId =
      this.selectedProjectId;

    const planId =
      this.getEntityId(
        this.testcaseForm.testPlan,
        this.testcaseForm.testPlanId
      );

    const suiteId =
      this.getEntityId(
        this.testcaseForm.testSuite,
        this.testcaseForm.testSuiteId
      );

    const payload: any = {

      testCaseCode:
        this.testcaseForm.testCaseCode || null,

      title:
        this.testcaseForm.title.trim(),

      description:
        this.testcaseForm.description || '',

      preconditions:
        this.testcaseForm.preconditions || '',

      steps:
        this.testcaseForm.steps,

      expectedResult:
        this.testcaseForm.expectedResult,

      actualResult:
        this.testcaseForm.actualResult || '',

      status:
        this.testcaseForm.status || 'DRAFT',

      priority:
        this.testcaseForm.priority || 'MEDIUM',

      project: {
        id:
          Number(projectId)
      },

      testPlan:
        planId
          ? { id: Number(planId) }
          : null,

      testSuite:
        suiteId
          ? { id: Number(suiteId) }
          : null,

      epic:
        this.testcaseForm.epicId
          ? {
              id:
                Number(
                  this.testcaseForm.epicId
                )
            }
          : null,

      story:
        this.testcaseForm.storyId
          ? {
              id:
                Number(
                  this.testcaseForm.storyId
                )
            }
          : null,

      task:
        this.testcaseForm.taskId
          ? {
              id:
                Number(
                  this.testcaseForm.taskId
                )
            }
          : null,

      user:
        this.testcaseForm.userId
          ? {
              id:
                Number(
                  this.testcaseForm.userId
                )
            }
          : null
    };

    this.http
      .post<any>(
        `${this.baseUrl2}/v1/testcases`,
        payload,
        { headers }
      )
      .subscribe({

        next: () => {

          this.showCreateTestCaseModal =
            false;

          this.showToast(
            'Test case created successfully'
          );

          this.loadTestcases();
        },

        error: err => {

          console.error(
            'Error creating test case:',
            err
          );
        }
      });
  }


  /* ============================================================
     EDIT TEST CASE
  ============================================================ */

  openEditTestCase(
    testcase: TestCase
  ): void {

    this.testcaseForm = {
      ...testcase,

      projectId:
        this.getEntityId(
          testcase.project,
          testcase.projectId ||
          testcase.project_id
        ),

      testPlanId:
        this.getEntityId(
          testcase.testPlan,
          testcase.testPlanId ||
          testcase.test_plan_id
        ),

      testSuiteId:
        this.getEntityId(
          testcase.testSuite,
          testcase.testSuiteId ||
          testcase.test_suite_id
        ),

      epicId:
        this.getEntityId(
          testcase.epic,
          testcase.epicId ||
          testcase.epic_id
        ),

      storyId:
        this.getEntityId(
          testcase.story,
          testcase.storyId ||
          testcase.story_id
        ),

      taskId:
        this.getEntityId(
          testcase.task,
          testcase.taskId ||
          testcase.task_id
        ),

      userId:
        this.getEntityId(
          testcase.user,
          testcase.userId ||
          testcase.user_id
        )
    };

    this.selectedProjectId =
      Number(
        this.testcaseForm.projectId
      ) || null;

    this.loadEpics();
    this.loadStories();

    this.showEditTestCaseModal =
      true;
  }


  closeEditTestCase(): void {

    this.showEditTestCaseModal =
      false;
  }


  updateTestCase(): void {

    if (
      !this.testcaseForm.id ||
      !this.testcaseForm.title?.trim()
    ) {
      return;
    }

    const headers =
      this.auth.getAuthHeaders();

    const projectId =
      this.getEntityId(
        this.testcaseForm.project,
        this.testcaseForm.projectId
      );

    const planId =
      this.getEntityId(
        this.testcaseForm.testPlan,
        this.testcaseForm.testPlanId
      );

    const suiteId =
      this.getEntityId(
        this.testcaseForm.testSuite,
        this.testcaseForm.testSuiteId
      );

    const payload: any = {

      testCaseCode:
        this.testcaseForm.testCaseCode,

      title:
        this.testcaseForm.title.trim(),

      description:
        this.testcaseForm.description || '',

      preconditions:
        this.testcaseForm.preconditions || '',

      steps:
        this.testcaseForm.steps || '',

      expectedResult:
        this.testcaseForm.expectedResult || '',

      actualResult:
        this.testcaseForm.actualResult || '',

      status:
        this.testcaseForm.status || 'DRAFT',

      priority:
        this.testcaseForm.priority || 'MEDIUM',

      project:
        projectId
          ? { id: Number(projectId) }
          : null,

      testPlan:
        planId
          ? { id: Number(planId) }
          : null,

      testSuite:
        suiteId
          ? { id: Number(suiteId) }
          : null,

      epic:
        this.testcaseForm.epicId
          ? {
              id:
                Number(
                  this.testcaseForm.epicId
                )
            }
          : null,

      story:
        this.testcaseForm.storyId
          ? {
              id:
                Number(
                  this.testcaseForm.storyId
                )
            }
          : null,

      task:
        this.testcaseForm.taskId
          ? {
              id:
                Number(
                  this.testcaseForm.taskId
                )
            }
          : null,

      user:
        this.testcaseForm.userId
          ? {
              id:
                Number(
                  this.testcaseForm.userId
                )
            }
          : null
    };

    this.http
      .put<any>(
        `${this.baseUrl2}/v1/testcases/${this.testcaseForm.id}`,
        payload,
        { headers }
      )
      .subscribe({

        next: () => {

          this.showEditTestCaseModal =
            false;

          this.showToast(
            'Test case updated successfully'
          );

          this.loadTestcases();
        },

        error: err => {

          console.error(
            'Error updating test case:',
            err
          );
        }
      });
  }


  /* ============================================================
     DELETE TEST CASE
  ============================================================ */

  deleteTestcase(
    testcase: TestCase
  ): void {

    if (!testcase.id) {
      return;
    }

    if (
      !confirm(
        `Delete "${this.getTestCaseTitle(testcase)}"?`
      )
    ) {
      return;
    }

    const headers =
      this.auth.getAuthHeaders();

    this.http
      .delete(
        `${this.baseUrl2}/v1/testcases/${testcase.id}`,
        { headers }
      )
      .subscribe({

        next: () => {

          if (
            this.selectedTestCase?.id ===
            testcase.id
          ) {

            this.selectedTestCase =
              null;
          }

          this.showToast(
            'Test case deleted successfully'
          );

          this.loadTestcases();
        }
      });
  }


  /* ============================================================
     SEARCH
  ============================================================ */

  get filteredTestCases(): TestCase[] {

    let result =
      [...this.testCases];

    const search =
      this.searchText
        .trim()
        .toLowerCase();

    if (search) {

      result =
        result.filter(testcase =>
          [
            this.getTestCaseCode(testcase),
            this.getTestCaseTitle(testcase),
            testcase.description,
            testcase.status,
            testcase.priority,
            testcase.type,
            this.getProjectDisplay(testcase),
            this.getPlanDisplay(testcase),
            this.getSuiteDisplay(testcase)
          ]
            .join(' ')
            .toLowerCase()
            .includes(search)
        );
    }

    if (this.selectedStatus) {

      result =
        result.filter(
          testcase =>
            String(
              testcase.status || ''
            ).toUpperCase() ===
            String(
              this.selectedStatus
            ).toUpperCase()
        );
    }

    if (this.selectedPriority) {

      result =
        result.filter(
          testcase =>
            String(
              testcase.priority || ''
            ).toUpperCase() ===
            String(
              this.selectedPriority
            ).toUpperCase()
        );
    }

    if (this.selectedType) {

      result =
        result.filter(
          testcase =>
            testcase.type ===
            this.selectedType
        );
    }

    if (this.selectedAssignee) {

      result =
        result.filter(
          testcase =>
            testcase.assignee ===
            this.selectedAssignee
        );
    }

    return result;
  }


  onSearchChange(): void {

    const visible =
      this.filteredTestCases;

    if (
      this.selectedTestCase &&
      !visible.some(
        tc =>
          tc.id ===
          this.selectedTestCase?.id
      )
    ) {

      this.selectedTestCase =
        visible[0] || null;
    }
  }


  clearSearch(): void {

    this.searchText = '';

    this.onSearchChange();
  }


  toggleFilters(): void {

    this.showFilters =
      !this.showFilters;
  }


  clearFilters(): void {

    this.selectedStatus = '';

    this.selectedPriority = '';

    this.selectedType = '';

    this.selectedAssignee = '';

    this.onSearchChange();
  }


  get activeFilterCount(): number {

    let count = 0;

    if (this.selectedStatus) {
      count++;
    }

    if (this.selectedPriority) {
      count++;
    }

    if (this.selectedType) {
      count++;
    }

    if (this.selectedAssignee) {
      count++;
    }

    return count;
  }


  /* ============================================================
     DISPLAY HELPERS
  ============================================================ */

  getTestCaseCode(
    tc: TestCase
  ): string {

    return (
      tc.testCaseCode ||
      tc.code ||
      tc.test_case_code ||
      (
        tc.id
          ? `TC-${tc.id}`
          : '-'
      )
    );
  }


  getTestCaseTitle(
    tc: TestCase
  ): string {

    return (
      tc.title ||
      tc.name ||
      tc.description ||
      (
        tc.id
          ? `Test Case #${tc.id}`
          : '-'
      )
    );
  }


  getPlanDisplay(
    tc: TestCase
  ): string {

    if (
      tc.testPlan &&
      typeof tc.testPlan === 'object'
    ) {

      return (
        tc.testPlan.name ||
        tc.testPlan.title ||
        '-'
      );
    }

    const id =
      this.getEntityId(
        tc.testPlan,
        tc.testPlanId ||
        tc.test_plan_id
      );

    const found =
      this.testPlans.find(
        plan =>
          String(plan.id) ===
          String(id)
      );

    return (
      found?.name ||
      (id ? `Plan #${id}` : '-')
    );
  }


  getSuiteDisplay(
    tc: TestCase
  ): string {

    if (
      tc.testSuite &&
      typeof tc.testSuite === 'object'
    ) {

      return (
        tc.testSuite.name ||
        tc.testSuite.title ||
        '-'
      );
    }

    const id =
      this.getEntityId(
        tc.testSuite,
        tc.testSuiteId ||
        tc.test_suite_id
      );

    const found =
      this.testSuites.find(
        suite =>
          String(suite.id) ===
          String(id)
      );

    return (
      found?.name ||
      (id ? `Suite #${id}` : '-')
    );
  }


  getProjectDisplay(
    tc: TestCase
  ): string {

    if (
      tc.project &&
      typeof tc.project === 'object'
    ) {

      return (
        tc.project.name ||
        tc.project.title ||
        '-'
      );
    }

    const id =
      this.getEntityId(
        tc.project,
        tc.projectId ||
        tc.project_id
      );

    const found =
      this.projects.find(
        project =>
          String(
            this.getOptionId(project)
          ) ===
          String(id)
      );

    return (
      found?.name ||
      found?.title ||
      (id ? `Project #${id}` : '-')
    );
  }


  getUserDisplay(
    tc: TestCase
  ): string {

    const user =
      tc.user ||
      tc.creator;

    if (
      user &&
      typeof user === 'object'
    ) {

      return (
        user.name ||
        user.username ||
        user.email ||
        '-'
      );
    }

    const id =
      this.getEntityId(
        user,
        tc.userId ||
        tc.user_id
      );

    const found =
      this.users.find(
        item =>
          String(
            this.getOptionId(item)
          ) ===
          String(id)
      );

    return (
      found?.name ||
      found?.username ||
      found?.email ||
      (id ? `User #${id}` : '-')
    );
  }


  getStatusClass(
    status?: string
  ): string {

    return (
      status ||
      'DRAFT'
    )
      .toLowerCase()
      .replace(/\s+/g, '-');
  }


  getPriorityClass(
    priority?: string
  ): string {

    return (
      priority ||
      'MEDIUM'
    )
      .toLowerCase();
  }


  getInitials(
    name?: string
  ): string {

    if (!name) {
      return '?';
    }

    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(
        item =>
          item.charAt(0).toUpperCase()
      )
      .join('');
  }


  /* ============================================================
     PROJECT ID HELPER
  ============================================================ */

  getProjectId(
    item: any
  ): number | null {

    if (!item) {
      return null;
    }

    if (
      item.project_id !==
      undefined &&
      item.project_id !== null
    ) {

      return Number(
        item.project_id
      );
    }

    if (
      item.projectId !==
      undefined &&
      item.projectId !== null
    ) {

      return Number(
        item.projectId
      );
    }

    if (
      item.project?.id !==
      undefined &&
      item.project?.id !== null
    ) {

      return Number(
        item.project.id
      );
    }

    if (
      item.project &&
      typeof item.project === 'number'
    ) {

      return Number(
        item.project
      );
    }

    return null;
  }


  /* ============================================================
     GENERAL HELPERS
  ============================================================ */

  private extractArray(
    response: any
  ): any[] {

    if (Array.isArray(response)) {
      return response;
    }

    if (
      response &&
      typeof response === 'object'
    ) {

      return (
        response.content ??
        response.data ??
        response.items ??
        response.result ??
        []
      );
    }

    return [];
  }


  private getEntityId(
    objectValue: any,
    directId?: any
  ): any {

    if (
      objectValue !== null &&
      objectValue !== undefined
    ) {

      if (
        typeof objectValue ===
        'object'
      ) {

        if (
          objectValue.id !==
          undefined
        ) {

          return objectValue.id;
        }

        if (
          objectValue.projectId !==
          undefined
        ) {

          return objectValue.projectId;
        }

        if (
          objectValue.testPlanId !==
          undefined
        ) {

          return objectValue.testPlanId;
        }

        if (
          objectValue.testSuiteId !==
          undefined
        ) {

          return objectValue.testSuiteId;
        }
      }

      if (
        typeof objectValue ===
        'number'
      ) {

        return objectValue;
      }

      if (
        typeof objectValue ===
        'string' &&
        objectValue.trim() !== ''
      ) {

        if (
          !isNaN(
            Number(objectValue)
          )
        ) {

          return Number(
            objectValue
          );
        }

        return objectValue;
      }
    }

    if (
      directId !== undefined &&
      directId !== null &&
      directId !== ''
    ) {

      return directId;
    }

    return '';
  }


  getOptionId(
    item: any
  ): any {

    if (!item) {
      return '';
    }

    if (
      typeof item === 'object'
    ) {

      return (
        item.id ??
        item.projectId ??
        item.userId ??
        item.epicId ??
        item.storyId ??
        item.taskId ??
        ''
      );
    }

    return item;
  }


  getSelectedProject(): any {

    if (!this.selectedProjectId) {
      return '';
    }

    return this.projects.find(
      project =>
        String(
          this.getOptionId(project)
        ) ===
        String(
          this.selectedProjectId
        )
    ) || '';
  }


  /* ============================================================
     EMPTY OBJECTS
  ============================================================ */

  createEmptyPlan(): TestPlan {

    return {

      id: undefined,

      name: '',

      description: '',

      project: '',

      projectId: undefined,

      expanded: false,

      suites: []
    };
  }


  createEmptySuite(): TestSuite {

    return {

      id: undefined,

      name: '',

      description: '',

      project: '',

      projectId: undefined,

      testPlan: '',

      testPlanId: undefined,

      expanded: false,

      testCases: []
    };
  }


  createEmptyTestCase(): TestCase {

    return {

      id: undefined,

      testCaseCode: '',

      title: '',

      description: '',

      preconditions: '',

      steps: '',

      expectedResult: '',

      actualResult: '',

      status: 'DRAFT',

      priority: 'MEDIUM',

      project: '',

      projectId: undefined,

      testPlan: '',

      testPlanId: undefined,

      testSuite: '',

      testSuiteId: undefined,

      epicId: undefined,

      storyId: undefined,

      taskId: undefined,

      userId: undefined,

      type: 'Functional',

      assignee: '',

      reporter: ''
    };
  }


  /* ============================================================
     TOAST
  ============================================================ */

  showToast(
    message: string
  ): void {

    this.successMessage =
      message;

    this.showSuccessToast =
      true;

    setTimeout(() => {

      this.showSuccessToast =
        false;

      this.cdr.detectChanges();

    }, 2500);
  }


  /* ============================================================
     TRACKING
  ============================================================ */

  trackByPlan(
    index: number,
    plan: TestPlan
  ): number | undefined {

    return plan.id;
  }


  trackBySuite(
    index: number,
    suite: TestSuite
  ): number | undefined {

    return suite.id;
  }


  trackByTestCase(
    index: number,
    testcase: TestCase
  ): number | undefined {

    return testcase.id;
  }
}

