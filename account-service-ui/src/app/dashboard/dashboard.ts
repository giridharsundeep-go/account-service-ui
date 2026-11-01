import { Component, OnDestroy, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { WorkspaceHeroComponent } from '../shared/workspace-hero';
import { ProjectContextService } from '../project-context.service';
import {
  ProjectWorkItem,
  ProjectWorkService,
  ProjectWorkSnapshot,
} from '../shared/project-work.service';
import { WorkItemDialogService } from '../shared/work-item-dialog.service';
import { ChangeDetectorRef } from '@angular/core';
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, WorkspaceHeroComponent],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css', '../shared/field-controls.css'],
})
export class Dashboard implements OnDestroy {
  readonly context = inject(ProjectContextService);
  private data = inject(ProjectWorkService);
  private dialog = inject(WorkItemDialogService);
  private cdr = inject(ChangeDetectorRef);
  private subscription?: Subscription;
  snapshot: ProjectWorkSnapshot = {
    items: [],
    sprints: [],
    releases: [],
    teams: [],
    users: [],
    unavailable: [],
  };
  loading = false;
  team = 'ALL';
  updated: Date | null = null;
  readonly colors = ['#7c3aed', '#4f46e5', '#2563eb', '#16a34a', '#eab308', '#ea580c', '#dc2626'];
  private sync = effect(() => {
    this.dialog.revision();
    const id = this.context.selectedProjectId();
    this.subscription?.unsubscribe();
    this.team = 'ALL';
    if (!id) {
      this.snapshot = {
        items: [],
        sprints: [],
        releases: [],
        teams: [],
        users: [],
        unavailable: [],
      };
      return;
    }
    this.refresh(id);
  });
  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }
  refresh(id = this.context.selectedProjectId()) {
    if (!id) return;
    this.subscription?.unsubscribe();
    this.loading = true;
    this.subscription = this.data.load(id).subscribe((value) => {
      if (id !== this.context.selectedProjectId()) return;
      this.snapshot = value;
      this.updated = new Date();
      this.loading = false;
      this.cdr.markForCheck();
    });
  }
  private itemDate(item: ProjectWorkItem, kind: 'created' | 'updated'): string {
    const r = item.raw;
    return String(
      kind === 'created'
        ? (r.created_at ?? r.createdAt ?? r.creation_date ?? '')
        : (r.updated_at ?? r.updatedAt ?? r.modified_at ?? ''),
    );
  }
  get freshness() {
    return this.metric('freshness', () => {
      const now = Date.now(),
        week = 7 * 86400000;
      return {
        created: this.items.filter((i) => {
          const t = Date.parse(this.itemDate(i, 'created'));
          return t <= now && t >= now - week;
        }).length,
        updated: this.items.filter((i) => {
          const t = Date.parse(this.itemDate(i, 'updated'));
          return t <= now && t >= now - week;
        }).length,
        due: this.items.filter((i) => {
          const t = Date.parse(i.due);
          return !this.data.done(i.status) && t >= now && t <= now + week;
        }).length,
      };
    });
  }
  get typeMix() {
    return this.metric('typeMix', () => {
      return ['EPIC', 'STORY', 'TASK', 'ISSUE'].map((kind, index) => ({
        name: kind,
        count: this.items.filter((i) => i.kind === kind).length,
        color: this.colors[index],
      }));
    });
  }
  get distribution() {
    return this.metric('distribution', () => {
      return this.statusMix.map((row) => ({
        ...row,
        count: this.items.filter((i) => row.states.includes(i.status)).length,
      }));
    });
  }
  get donutBackground() {
    return this.metric('donutBackground', () => {
      let cursor = 0;
      const total = this.distribution.reduce((n, r) => n + r.count, 0);
      if (!total) return '#edf1f7';
      return (
        'conic-gradient(' +
        this.distribution
          .filter((r) => r.count)
          .map((r) => {
            const start = cursor;
            cursor += (r.count / total) * 100;
            return r.color + ' ' + start + '% ' + cursor + '%';
          })
          .join(',') +
        ')'
      );
    });
  }
  get priorities() {
    return this.metric('priorities', () => {
      const result = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'].map((name, index) => ({
        name,
        count: this.items.filter((i) => String(i.raw.priority ?? 'NONE').toUpperCase() === name)
          .length,
        color: this.colors[6 - index],
      }));
      const max = Math.max(...result.map((r) => r.count), 1);
      return result.map((r) => ({ ...r, height: (r.count / max) * 100 }));
    });
  }
  get activityBars() {
    return this.metric('activityBars', () => {
      const today = new Date();
      return Array.from({ length: 14 }, (_, index) => {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13 + index);
        const key = d.toLocaleDateString('en-CA');
        const matches = (value: string) => {
          const date = new Date(value);
          return !isNaN(date.getTime()) && date.toLocaleDateString('en-CA') === key;
        };
        return {
          label: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
          created: this.items.filter((i) => matches(this.itemDate(i, 'created'))).length,
          updated: this.items.filter((i) => matches(this.itemDate(i, 'updated'))).length,
        };
      });
    });
  }
  get activityMax() {
    return this.metric('activityMax', () => {
      return Math.max(1, ...this.activityBars.flatMap((r) => [r.created, r.updated]));
    });
  }
  get teams() {
    return this.snapshot.teams;
  }
  private scopeSnapshot: ProjectWorkSnapshot | null = null;
  private scopeTeam = '';
  private scopeDay = '';
  private scopedItems: ProjectWorkItem[] = [];
  private metricsCache = new Map<string, unknown>();
  private metric<T>(key: string, build: () => T): T {
    this.items;
    if (!this.metricsCache.has(key)) this.metricsCache.set(key, build());
    return this.metricsCache.get(key) as T;
  }
  get items(): ProjectWorkItem[] {
    const day = new Date().toDateString();
    if (
      this.scopeSnapshot !== this.snapshot ||
      this.scopeTeam !== this.team ||
      this.scopeDay !== day
    ) {
      this.scopeSnapshot = this.snapshot;
      this.scopeTeam = this.team;
      this.scopeDay = day;
      this.metricsCache.clear();
      const sprintIds = new Set(
        this.snapshot.sprints
          .filter((s) => Number(s.team_id ?? s.teamId ?? s.team?.id) === Number(this.team))
          .map((s) => Number(s.id)),
      );
      this.scopedItems = this.snapshot.items.filter(
        (i) =>
          this.team === 'ALL' ||
          i.teamId === Number(this.team) ||
          sprintIds.has(Number(i.sprintId)),
      );
    }
    return this.scopedItems;
  }
  get execution() {
    return this.metric('execution', () => {
      const parents = new Set(
        this.items
          .filter((i) => i.kind === 'TASK')
          .map((i) => Number(i.raw.story_id ?? i.raw.storyId ?? i.raw.story?.id)),
      );
      return this.items.filter(
        (i) => i.kind === 'TASK' || (i.kind === 'STORY' && !parents.has(i.id)),
      );
    });
  }
  get completed() {
    return this.metric('completed', () => {
      return this.execution.filter((i) => this.data.done(i.status)).length;
    });
  }
  get completion() {
    return this.metric('completion', () => {
      return this.execution.length ? Math.round((this.completed / this.execution.length) * 100) : 0;
    });
  }
  get blocked() {
    return this.metric('blocked', () => {
      return this.items.filter(
        (i) => !this.data.done(i.status) && ['BLOCKED', 'ON_HOLD'].includes(i.status),
      );
    });
  }
  get unassigned() {
    return this.metric('unassigned', () => {
      return this.execution.filter((i) => !this.data.done(i.status) && !i.assigneeId).length;
    });
  }
  get statusMix() {
    return this.metric('statusMix', () => {
      const groups = [
        { name: 'Backlog', states: ['BACKLOG'], color: this.colors[0] },
        { name: 'To do', states: ['TODO', 'TO_DO', 'OPEN', 'NEW'], color: this.colors[2] },
        {
          name: 'In progress',
          states: ['IN_PROGRESS', 'IN_REVIEW', 'REVIEW'],
          color: this.colors[1],
        },
        { name: 'Testing', states: ['TESTING', 'QA'], color: this.colors[4] },
        {
          name: 'Completed',
          states: ['DONE', 'COMPLETED', 'CLOSED', 'RESOLVED', 'RELEASED'],
          color: this.colors[3],
        },
        { name: 'Blocked', states: ['BLOCKED', 'ON_HOLD'], color: this.colors[6] },
      ].map((g) => ({
        ...g,
        count: this.execution.filter((i) => g.states.includes(i.status)).length,
      }));
      const known = new Set(groups.flatMap((group) => group.states));
      const others = [...new Set(this.items.map((item) => item.status))].filter(
        (status) => !known.has(status),
      );
      return [
        ...groups,
        {
          name: 'Other',
          states: others,
          color: this.colors[5],
          count: this.execution.filter((item) => others.includes(item.status)).length,
        },
      ];
    });
  }
  get sprintMetrics() {
    return this.metric('sprintMetrics', () => {
      return this.snapshot.sprints
        .filter(
          (s) =>
            this.team === 'ALL' ||
            Number(s.team_id ?? s.teamId ?? s.team?.id) === Number(this.team),
        )
        .map((s, index) => {
          const work = this.items.filter((i) => i.sprintId === Number(s.id) && i.kind === 'STORY');
          const points = work.reduce((n, i) => n + i.points, 0);
          const done = work
            .filter((i) => this.data.done(i.status))
            .reduce((n, i) => n + i.points, 0);
          const count = this.items.filter((i) => i.sprintId === Number(s.id));
          return {
            id: Number(s.id),
            name: s.name ?? s.sprint_name ?? `Sprint ${s.id}`,
            points,
            done,
            count: count.length,
            progress: points ? Math.round((done / points) * 100) : 0,
            color: this.colors[index % 7],
            state: s.status ?? 'PLANNED',
          };
        })
        .slice(-8);
    });
  }
  get people() {
    return this.metric('people', () => {
      const map = new Map<string, { name: string; open: number; done: number; color: string }>();
      for (const i of this.execution) {
        const key = String(i.assigneeId ?? 'none');
        const row = map.get(key) ?? {
          name: i.assignee,
          open: 0,
          done: 0,
          color: this.colors[map.size % 7],
        };
        this.data.done(i.status) ? row.done++ : row.open++;
        map.set(key, row);
      }
      return [...map.values()].sort((a, b) => b.open - a.open);
    });
  }
  get releases() {
    return this.metric('releases', () => {
      return [...this.snapshot.releases].sort((a, b) =>
        String(a.release_date ?? a.releaseDate ?? '9999').localeCompare(
          String(b.release_date ?? b.releaseDate ?? '9999'),
        ),
      );
    });
  }
  get teamMetrics() {
    return this.metric('teamMetrics', () => {
      return this.teams
        .filter((team) => this.team === 'ALL' || Number(team.id) === Number(this.team))
        .map((team, index) => {
          const work = this.snapshot.items.filter(
            (i) =>
              (i.kind === 'TASK' || i.kind === 'STORY') &&
              (i.teamId === Number(team.id) ||
                this.snapshot.sprints.some(
                  (s) =>
                    Number(s.id) === i.sprintId &&
                    Number(s.team_id ?? s.teamId ?? s.team?.id) === Number(team.id),
                )),
          );
          const parentIds = new Set(
            work
              .filter((i) => i.kind === 'TASK')
              .map((i) => Number(i.raw.story_id ?? i.raw.storyId)),
          );
          const execution = work.filter((i) => i.kind === 'TASK' || !parentIds.has(i.id));
          const done = execution.filter((i) => this.data.done(i.status)).length;
          return {
            name: team.name ?? team.team_name,
            done,
            total: execution.length,
            progress: execution.length ? Math.round((done / execution.length) * 100) : 0,
            color: this.colors[index % 7],
          };
        });
    });
  }
  get shipped() {
    return this.metric('shipped', () => {
      return this.releases.filter((r) => r.status === 'RELEASED').length;
    });
  }
  get risks() {
    return this.metric('risks', () => {
      const today = new Date().toISOString().slice(0, 10);
      return this.items
        .filter(
          (i) =>
            !this.data.done(i.status) &&
            (i.status === 'BLOCKED' || (i.due && i.due.slice(0, 10) < today)),
        )
        .slice(0, 8);
    });
  }
  open(item: ProjectWorkItem) {
    this.dialog.open(item.projectId, item.kind, item.id);
  }
}
