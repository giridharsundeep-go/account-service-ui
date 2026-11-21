import { Component, CUSTOM_ELEMENTS_SCHEMA, afterNextRender, inject, signal } from '@angular/core';
import { defineWorkspaceShell } from '../../../vendor/suite/index.js';
import { BuildCenter } from './build-center';
import { BuildCenterSession } from './session';

@Component({
  selector: 'app-build-center-root',
  imports: [BuildCenter],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    @if (session.user()) {
      <app-build-center />
    } @else {
      <gp-workspace-shell current="build-center">
        <section class="suite-auth" aria-label="Build Center sign-in">
          <h1>Build Center</h1>
          @if (loading()) {
            <p role="status">Checking your Passport session…</p>
          } @else {
            @if (error()) {
              <p role="alert">{{ error() }}</p>
            }
            <button type="button" (click)="signIn()">Sign in with Passport</button>
          }
        </section>
      </gp-workspace-shell>
    }
  `,
})
export class BuildCenterApp {
  protected readonly session = inject(BuildCenterSession);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  constructor() {
    afterNextRender(() => {
      defineWorkspaceShell();
      this.applyAwsAppTrayLayout();
      void this.loadSession();
    });
  }

  private applyAwsAppTrayLayout(): void {
    const shell = document.querySelector('gp-workspace-shell');
    const tray = shell?.shadowRoot?.querySelector('gp-apps');
    const root = tray?.shadowRoot;
    const panel = root?.querySelector<HTMLElement>('.panel');
    const list = root?.querySelector<HTMLElement>('.apps-list');
    if (!tray || !root || !panel || !list) return;

    const resize = (): void => {
      const width = window.innerWidth;
      panel.style.setProperty('width', width <= 380 ? 'calc(100vw - 20px)' : width <= 520 ? 'min(700px, calc(100vw - 24px))' : 'min(900px, calc(100vw - 32px))', 'important');
      panel.style.setProperty('max-width', width <= 380 ? 'calc(100vw - 20px)' : 'calc(100vw - 32px)', 'important');
      list.style.setProperty('grid-template-columns', width <= 380 ? '1fr' : width <= 520 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))', 'important');
      list.style.setProperty('background', '#fff', 'important');
      for (const app of list.querySelectorAll<HTMLElement>('.app')) {
        app.style.setProperty('background', '#fff', 'important');
        if (app.hasAttribute('aria-current')) app.style.setProperty('box-shadow', 'inset 3px 0 #0972d3', 'important');
      }
      for (const surface of root.querySelectorAll<HTMLElement>('.panel,.apps-list,.workspace-tools,.footer')) {
        surface.style.setProperty('background', '#fff', 'important');
      }
    };
    resize();
    window.addEventListener('resize', resize);
  }

  protected async signIn(): Promise<void> {
    try {
      await this.session.signIn();
    } catch {
      this.error.set('Could not open Passport. Please try again.');
    }
  }

  private async loadSession(): Promise<void> {
    try {
      await this.session.load();
    } catch {
      this.error.set('Could not check your Passport session. Confirm Passport is running and try signing in.');
    } finally {
      this.loading.set(false);
    }
  }
}
