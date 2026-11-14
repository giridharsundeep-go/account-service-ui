import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from '../auth.service';

import { UserSelectDialog } from './user-select-dialog';

describe('UserSelectDialog', () => {
  let component: UserSelectDialog;
  let fixture: ComponentFixture<UserSelectDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserSelectDialog],
      providers: [provideHttpClient(), provideHttpClientTesting(),
        {provide:MAT_DIALOG_DATA,useValue:{users:[],currentSelection:[]}},
        {provide:MatDialogRef,useValue:{close:vi.fn()}},
        {provide:AuthService,useValue:{getAuthHeaders:()=>({})}}],
    }).compileComponents();

    fixture = TestBed.createComponent(UserSelectDialog);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
