import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TestCaseAttachDialogComponent } from './test-case-attach-dialog';

describe('TestCaseAttachDialogComponent', () => {
  it('opens with existing attachments selected and filters available cases', () => {
    TestBed.configureTestingModule({
      imports: [TestCaseAttachDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            itemType: 'STORY',
            itemTitle: 'Checkout flow',
            currentlyAttachedIds: [2],
            availableTestCases: [
              { id: 2, title: 'Payment succeeds', code: 'TC-2' },
              { id: 3, title: 'Address validation', code: 'TC-3' },
            ],
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(TestCaseAttachDialogComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.selectedIds()).toEqual(new Set([2]));
    component.searchTerm.set('address');
    expect(component.filteredTestCases().map(testCase => testCase.id)).toEqual([3]);
    fixture.destroy();
    TestBed.resetTestingModule();
  });
});
