import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../auth.service';
export interface RecentWork {
  id: number;
  type: 'EPIC' | 'STORY' | 'TASK' | 'ISSUE';
  projectId: number;
  key: string;
  title: string;
  openedAt: string;
  action?: 'Opened' | 'Updated' | 'Created';
}
@Injectable({ providedIn: 'root' })
export class RecentWorkService {
  private auth = inject(AuthService);
  private get storageKey() {
    return 'greatley-recent-work-' + (this.auth.getCurrentUserId() || 'session');
  }
  private accountKey = this.storageKey;
  readonly items = signal<RecentWork[]>(this.read());
  refreshForCurrentUser(): void {
    this.accountKey = this.storageKey;
    this.items.set(this.read());
  }
  remember(item: Omit<RecentWork, 'openedAt'>): void {
    if (this.accountKey !== this.storageKey) this.refreshForCurrentUser();
    const next = [
      { ...item, openedAt: new Date().toISOString() },
      ...this.items().filter(
        (r) => !(r.id === item.id && r.type === item.type && r.projectId === item.projectId),
      ),
    ].slice(0, 30);
    this.items.set(next);
    try {
      if (this.auth.getCurrentUserId()) localStorage.setItem(this.storageKey, JSON.stringify(next));
    } catch {}
  }
  private read(): RecentWork[] {
    try {
      const rows = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
      return Array.isArray(rows)
        ? rows
            .filter(
              (r) =>
                r.id > 0 &&
                r.projectId > 0 &&
                ['EPIC', 'STORY', 'TASK', 'ISSUE'].includes(r.type) &&
                typeof r.title === 'string',
            )
            .slice(0, 30)
        : [];
    } catch {
      return [];
    }
  }
}
