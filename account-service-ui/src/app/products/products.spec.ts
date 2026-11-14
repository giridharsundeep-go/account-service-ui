import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from '../auth.service';

import { Products } from './products';

describe('Products', () => {
  let component: Products;
  let fixture: ComponentFixture<Products>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Products],
      providers: [provideHttpClient(), provideHttpClientTesting(),
        {provide:AuthService,useValue:{getAuthHeaders:()=>new HttpHeaders()}}],
    }).compileComponents();

    fixture = TestBed.createComponent(Products);
    component = fixture.componentInstance;
    TestBed.inject(HttpTestingController).match(()=>true).forEach(request=>request.flush([]));
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
