import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Epics } from './epics';

describe('Epics', () => {
  let component: Epics;
  let fixture: ComponentFixture<Epics>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Epics],
    }).compileComponents();

    fixture = TestBed.createComponent(Epics);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
