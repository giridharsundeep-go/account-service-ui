import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { WorkspaceSettingsService } from '../shared/workspace-settings.service';
import { AuthService } from '../auth.service';
import { SprintPlanning } from './sprint-planning';

describe('SprintPlanning', () => {
  let component: SprintPlanning;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SprintPlanning],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { getAuthHeaders: () => new HttpHeaders() } },
        { provide: WorkspaceSettingsService, useValue: { revision: () => 0 } },
      ],
    }).compileComponents();

    component = TestBed.createComponent(SprintPlanning).componentInstance;
    component.sprints = [
      { id: 1, name: 'Cycle 1', status: 'ACTIVE', projectId: 10 },
      { id: 2, name: 'Cycle 2', status: 'PLANNED', projectId: 10 },
    ];
    component.selectedSprintId = 1;
    component.items = [
      item(1, null, null, 'Backlog'),
      item(2, 10, null, 'To Do'),
      item(3, 20, null, 'In Progress'),
      item(4, 10, 1, 'Backlog'),
      item(5, 20, 1, 'To Do'),
      item(6, null, 1, 'To Do'),
      item(7, -10, 1, 'In Progress'),
    ];
  });

  function item(sourceId: number, assigneeId: number | null, sprintId: number | null, status: string): SprintPlanning['items'][number] {
    const key = `TASK-${sourceId}`;
    return {
      id: key, sourceId, kind: 'TASK', key, title: `Work item ${sourceId}`, description: '',
      status, priority: 'Medium', points: null, teamId: null, assigneeId,
      assigneeName: assigneeId === null ? 'Unassigned' : `Assignee ${assigneeId}`, assigneeAvatarUrl: null,
      sprintId, sprintName: '', parentName: '', raw: {},
    };
  }

  it('shows all unscheduled work in the backlog and keeps every sprint for Everyone', () => {
    expect(component.backlogItems.map(work => work.sourceId)).toEqual([1, 2, 3]);
    expect(component.filteredSprintGroups.map(group => group.sprintId)).toEqual([1, 2]);
    expect(component.filteredSprintGroups[0].assigneeGroups.map(group => group.personId)).toEqual([-10, 10, 20, null]);
    expect(component.filteredSprintGroups[1].items).toEqual([]);
  });

  it('keeps unassigned backlog work while filtering sprint items to the selected person', () => {
    component.toggleItemSelection('TASK-5', true);
    component.selectPlanningPerson(10);

    expect(component.selectedItemCount).toBe(0);
    expect(component.backlogItems.map(work => work.sourceId)).toEqual([1, 2]);
    expect(component.filteredSprintItems.map(work => work.sourceId)).toEqual([4]);
    expect(component.filteredSprintGroups.map(group => group.sprintId)).toEqual([1]);
  });

  it('filters by agent and keeps backlog search separate from sprint work', () => {
    component.selectPlanningPerson(-10);
    expect(component.backlogItems.map(work => work.sourceId)).toEqual([1]);
    expect(component.filteredSprintItems.map(work => work.sourceId)).toEqual([7]);

    component.toggleItemSelection('TASK-1', true);
    component.backlogSearch = 'missing';
    expect(component.selectedBacklogItems).toEqual([]);
    expect(component.filteredSprintItems.map(work => work.sourceId)).toEqual([7]);
  });

  it('filters backlog assignments within the selected person scope and clears hidden backlog selections', () => {
    component.items.push(item(8, -10, null, 'To Do'));
    component.setBacklogAssigneeFilter('ASSIGNED');
    expect(component.backlogItems.map(work => work.sourceId)).toEqual([2, 3, 8]);

    component.selectPlanningPerson(10);
    expect(component.backlogItems.map(work => work.sourceId)).toEqual([2]);
    component.toggleItemSelection('TASK-2', true);
    component.toggleItemSelection('TASK-4', true);

    component.setBacklogAssigneeFilter('UNASSIGNED');
    expect(component.backlogItems.map(work => work.sourceId)).toEqual([1]);
    expect(component.selectedItems.map(work => work.sourceId)).toEqual([4]);
    expect(component.filteredSprintItems.map(work => work.sourceId)).toEqual([4]);

    component.setBacklogAssigneeFilter('ALL');
    expect(component.backlogItems.map(work => work.sourceId)).toEqual([1, 2]);
  });

  it('assigns an unassigned backlog item from a person chip without changing its sprint', () => {
    const http = TestBed.inject(HttpTestingController);
    const drop = new Event('drop', { cancelable: true }) as DragEvent;
    component.onDragStart(component.items[0], new Event('dragstart') as DragEvent);
    component.onAssigneeDrop(10, 'Assignee 10', drop);

    expect(drop.defaultPrevented).toBe(true);
    const request = http.expectOne(req => req.url.endsWith('/tickets/TASK/1/assignment'));
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ assigneeId: 10 });
    request.flush({ updated: true });
    expect(component.notice).toContain('assigned to Assignee 10');
    http.verify();
  });

  it('assigns and moves to a sprint in one request and does not overwrite an existing assignment', () => {
    const http = TestBed.inject(HttpTestingController);
    component.onDragStart(component.items[1], new Event('dragstart') as DragEvent);
    const assignedDrop = new Event('drop', { cancelable: true }) as DragEvent;
    component.onAssigneeDrop(20, 'Assignee 20', assignedDrop, 2);
    expect(assignedDrop.defaultPrevented).toBe(false);
    http.expectNone(req => req.url.endsWith('/assignment'));
    component.onDragEnd();

    component.onDragStart(component.items[0], new Event('dragstart') as DragEvent);
    component.onAssigneeDrop(20, 'Assignee 20', new Event('drop') as DragEvent, 2);
    const request = http.expectOne(req => req.url.endsWith('/tickets/TASK/1/assignment'));
    expect(request.request.body).toEqual({ assigneeId: 20, sprintId: 2 });
    request.flush(null, { status: 409, statusText: 'Conflict' });
    expect(component.saveError).toContain('already assigned');
    http.verify();
  });
});
