import { Component } from '@angular/core';
import { SprintPlanning } from '../sprint-planning/sprint-planning';
@Component({
  selector: 'app-project-planning',
  standalone: true,
  imports: [SprintPlanning],
  template: '<app-sprint-planning [projectScope]="true" />',
})
export class ProjectPlanning {}
