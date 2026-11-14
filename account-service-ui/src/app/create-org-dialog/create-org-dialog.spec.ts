import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from '../auth.service';

import { CreateOrgDialog } from './create-org-dialog';

describe('CreateOrgDialog', () => {
  let component: CreateOrgDialog;
  let fixture: ComponentFixture<CreateOrgDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateOrgDialog],
      providers: [provideHttpClient(), provideHttpClientTesting(),
        {provide:MAT_DIALOG_DATA,useValue:{}}, {provide:MatDialogRef,useValue:{close:vi.fn()}},
        {provide:AuthService,useValue:{getAuthHeaders:()=>({}),getCurrentUserId:()=>1}}],
    }).compileComponents();

    fixture = TestBed.createComponent(CreateOrgDialog);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
