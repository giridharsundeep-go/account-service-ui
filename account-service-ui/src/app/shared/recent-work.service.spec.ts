import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth.service';
import { RecentWorkService } from './recent-work.service';

describe('RecentWorkService', () => {
  it('keeps recently opened items separate when the signed-in account changes', () => {
    let userId = 901;
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { getCurrentUserId: () => userId } }],
    });
    try {
      const service = TestBed.inject(RecentWorkService);
      const item = {
        id: 1,
        projectId: 4,
        type: 'TASK' as const,
        key: 'TASK-1',
        title: 'First account work',
      };
      service.remember(item);
      userId = 902;
      service.refreshForCurrentUser();
      expect(service.items()).toEqual([]);
      service.remember({ ...item, id: 2, title: 'Second account work' });
      expect(service.items().map((row) => row.id)).toEqual([2]);
      userId = 901;
      service.refreshForCurrentUser();
      expect(service.items().map((row) => row.id)).toEqual([1]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
