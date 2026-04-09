import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateOrgDialog } from './create-org-dialog';

describe('CreateOrgDialog', () => {
  let component: CreateOrgDialog;
  let fixture: ComponentFixture<CreateOrgDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateOrgDialog],
    }).compileComponents();

    fixture = TestBed.createComponent(CreateOrgDialog);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
