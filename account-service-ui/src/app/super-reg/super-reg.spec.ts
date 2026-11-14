import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SuperReg } from './super-reg';

describe('SuperReg', () => {
  let component: SuperReg;
  let fixture: ComponentFixture<SuperReg>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SuperReg],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SuperReg);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
