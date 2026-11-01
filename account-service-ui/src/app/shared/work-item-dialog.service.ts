import { Injectable, signal } from '@angular/core';
export interface WorkItemDialogRequest {
  projectId: number;
  type: 'EPIC' | 'STORY' | 'TASK' | 'ISSUE';
  id: number;
}
@Injectable({ providedIn: 'root' })
export class WorkItemDialogService {
  readonly request = signal<WorkItemDialogRequest | null>(null);
  readonly revision = signal(0);
  open(projectId: number, type: string, id: number): void {
    const kind = String(type).toUpperCase() === 'BUG' ? 'ISSUE' : String(type).toUpperCase();
    if (!(projectId > 0 && id > 0) || !['EPIC', 'STORY', 'TASK', 'ISSUE'].includes(kind)) return;
    const show = () =>
      this.request.set({ projectId, type: kind as WorkItemDialogRequest['type'], id });
    if (typeof document !== 'undefined' && document.fullscreenElement)
      document.exitFullscreen().then(show, show);
    else show();
  }
  close(): void {
    this.request.set(null);
    this.revision.update((value) => value + 1);
  }
}
