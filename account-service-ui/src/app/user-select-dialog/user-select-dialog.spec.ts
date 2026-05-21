import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UserSelectDialog } from './user-select-dialog';

describe('UserSelectDialog', () => {
  let component: UserSelectDialog;
  let fixture: ComponentFixture<UserSelectDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserSelectDialog],
    }).compileComponents();

    fixture = TestBed.createComponent(UserSelectDialog);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
