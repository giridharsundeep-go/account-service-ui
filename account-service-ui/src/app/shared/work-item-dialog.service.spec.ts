import { TestBed } from '@angular/core/testing';
import { WorkItemDialogService } from './work-item-dialog.service';

describe('WorkItemDialogService', () => {
  it('opens details without exiting the fullscreen workspace', () => {
    const service = TestBed.inject(WorkItemDialogService);
    const exit = vi.fn();
    const original = Object.getOwnPropertyDescriptor(document, 'exitFullscreen');
    Object.defineProperty(document, 'exitFullscreen', { value: exit, configurable: true });
    try {
      service.open(4, 'EPIC', 21);
      expect(service.request()).toEqual({ projectId: 4, type: 'EPIC', id: 21 });
      expect(exit).not.toHaveBeenCalled();
      service.close();
      expect(service.request()).toBeNull();
      expect(service.revision()).toBe(1);
    } finally {
      if (original) Object.defineProperty(document, 'exitFullscreen', original);
      else delete (document as any).exitFullscreen;
    }
  });
  it('uses the shared dialog for create and ignores incomplete project context', () => {
    const service = TestBed.inject(WorkItemDialogService);
    service.create(4, 'story');
    expect(service.request()).toEqual({ projectId: 4, type: 'STORY', id: 0, create: true });
    service.close();
    service.open(0, 'TASK', 30);
    expect(service.request()).toBeNull();
  });
});
