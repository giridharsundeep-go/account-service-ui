import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Testcases } from './testcases';

describe('Testcases', () => {
  let component: Testcases;
  let fixture: ComponentFixture<Testcases>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Testcases],
    }).compileComponents();

    fixture = TestBed.createComponent(Testcases);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
