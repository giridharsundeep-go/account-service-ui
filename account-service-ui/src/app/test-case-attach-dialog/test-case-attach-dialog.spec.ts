import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TestCaseAttachDialog } from './test-case-attach-dialog';

describe('TestCaseAttachDialog', () => {
  let component: TestCaseAttachDialog;
  let fixture: ComponentFixture<TestCaseAttachDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestCaseAttachDialog],
    }).compileComponents();

    fixture = TestBed.createComponent(TestCaseAttachDialog);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
