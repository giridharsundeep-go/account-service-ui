import { ChangeDetectorRef } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { AuthService } from '../auth.service';
import { Docs } from './docs';

describe('Docs cloud workspace', () => {
  let docs: Docs;
  let http: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    http = { get: vi.fn(() => of([])), post: vi.fn(), put: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: HttpClient, useValue: http },
        {
          provide: AuthService,
          useValue: { getCurrentUserId: () => 42, getAuthHeaders: () => new HttpHeaders() },
        },
        { provide: ChangeDetectorRef, useValue: { detectChanges: vi.fn(), markForCheck: vi.fn() } },
      ],
    });
    docs = TestBed.runInInjectionContext(() => new Docs());
  });
  afterEach(() => docs.ngOnDestroy());

  it('settles after opening the rich document editor with folder options', async () => {
    const fixture = TestBed.createComponent(Docs);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.selectedSpace = { id: 1, name: 'Product' };
    component.folders = [{ id: 2, name: 'Architecture', children: [] }];
    component.selectedPage = { id: 8, title: 'Recovery guide', folderId: 2, status: 'DRAFT' };
    component.startEditingPage();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[aria-label="Document content"]')).toBeTruthy();
    fixture.destroy();
  });

  it('loads the library using the authenticated session instead of depending on one storage format', async () => {
    await docs.loadInitialData(false);
    expect(docs.errorMessage).toBe('');
    expect(http.get).toHaveBeenCalledTimes(3);
    for (const [url] of http.get.mock.calls) expect(String(url)).toContain('user_id=42');
  });

  it('keeps the editor and its content open after saving a new document', async () => {
    docs.selectedSpace = { id: 1 };
    docs.startNewPage();
    docs.pageDraft.title = 'Recovery guide';
    docs.editorHtml = '<p>Retry safely.</p>';
    http.post.mockReturnValue(of({ id: 8 }));
    await docs.savePage();
    expect(docs.selectedPage.id).toBe(8);
    expect(docs.pageViewMode).toBe('edit');
    expect(docs.editorHtml).toBe('<p>Retry safely.</p>');
    expect(docs.editorSaveLabel).toBe('Saved to cloud');
    expect(http.get).not.toHaveBeenCalled();
  });

  it('does not replace a different document with a late save response', async () => {
    const pending = new Subject<unknown>();
    docs.selectedSpace = { id: 1 };
    docs.startNewPage();
    docs.pageDraft.title = 'First document';
    http.post.mockReturnValue(pending);
    const save = docs.savePage();
    docs.startNewPage();
    docs.pageDraft.title = 'Second document';
    pending.next({ id: 8 });
    pending.complete();
    await save;
    expect(docs.pageDraft.title).toBe('Second document');
    expect(docs.selectedPage).toBeNull();
    expect(docs.successMessage).toBe('');
  });
});
