import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { ProjectContextService } from '../project-context.service';
import { SuiteSessionService } from './suite-session.service';

@Component({
  selector: 'app-suite-menu',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<gp-theme-toggle></gp-theme-toggle><gp-apps current="professy" [attr.project-id]="project.selectedProjectId()" (gp-app-open)="open($event)"></gp-apps>`,
})
export class SuiteAppMenu {
  readonly project = inject(ProjectContextService);
  private readonly suite = inject(SuiteSessionService);

  open(event: Event): void {
    event.preventDefault();
    const detail = (event as CustomEvent<{ app: string; projectId: number | null }>).detail;
    this.suite.open(detail.app, { projectId: detail.projectId });
  }
}
