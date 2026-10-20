import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SuperReg } from './super-reg';

describe('SuperReg', () => {
  let component: SuperReg;
  let fixture: ComponentFixture<SuperReg>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SuperReg],
    }).compileComponents();

    fixture = TestBed.createComponent(SuperReg);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
