import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../auth.service';
import { signal } from '@angular/core';

import { Projects } from './projects';

describe('Projects', () => {
  let component: Projects;
  let fixture: ComponentFixture<Projects>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Projects],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        {provide:AuthService,useValue:{getAuthHeaders:()=>new HttpHeaders(),getCurrentUserId:()=>1,sessionRevision:signal(0),isAdmin:()=>true,isLoggedIn:()=>false}}],
    }).compileComponents();

    fixture = TestBed.createComponent(Projects);
    component = fixture.componentInstance;
    TestBed.inject(HttpTestingController).match(()=>true).forEach(request=>request.flush([]));
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
