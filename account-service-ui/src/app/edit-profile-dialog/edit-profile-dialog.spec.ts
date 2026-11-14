import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { EditProfileDialog } from './edit-profile-dialog';

describe('EditProfileDialog', () => {
  let component: EditProfileDialog;
  let fixture: ComponentFixture<EditProfileDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditProfileDialog],
      providers: [{provide:MAT_DIALOG_DATA,useValue:{name:'Maya Chen',email:'maya@example.test',phone:'555-0100',image:null}},
        {provide:MatDialogRef,useValue:{close:vi.fn()}}],
    }).compileComponents();

    fixture = TestBed.createComponent(EditProfileDialog);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
