import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SprintPlanning } from './sprint-planning';

describe('SprintPlanning', () => {
  let component: SprintPlanning;
  let fixture: ComponentFixture<SprintPlanning>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SprintPlanning],
    }).compileComponents();

    fixture = TestBed.createComponent(SprintPlanning);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
