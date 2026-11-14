import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {appRegistry} from '@greatley-poshley/suite';

@Component({
  selector:'app-auth-app-gallery',
  standalone:true,
  imports:[CommonModule],
  template:`<section class="gp-auth-gallery" aria-labelledby="auth-apps-heading">
    <div class="gp-auth-gallery-content">
      <h1 id="auth-apps-heading">One account.<br>Every way you work.</h1>
      <p>Plan, connect, and create with Greatley Poshley.</p>
      <ul class="gp-auth-app-grid" aria-label="Greatley Poshley apps">
        <li class="gp-auth-app" *ngFor="let app of apps">
          <img [src]="app.logo" width="52" height="52" alt="" loading="eager">
          <span>{{app.name}}</span>
        </li>
      </ul>
    </div>
  </section>`,
  styles:[`:host{display:block;min-width:0;height:100%}`]
})
export class AuthAppGallery {
  readonly apps=appRegistry();
}
