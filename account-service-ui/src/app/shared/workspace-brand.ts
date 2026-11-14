import {Component,Input} from '@angular/core';
import {CommonModule} from '@angular/common';
import {appLogo,brandMarkUrl} from '@greatley-poshley/suite';

@Component({
  selector:'app-workspace-brand',standalone:true,imports:[CommonModule],
  template:`<span class="brand-lockup" role="img" [attr.aria-label]="name || 'Greatley Poshley'"><span class="mark-frame"><img [src]="app?logo(app):brandMark" width="44" height="44" alt=""/></span><span class="brand-wordmark" *ngIf="!iconOnly">{{name}}</span></span>`,
  styles:[`
    :host{display:inline-flex;min-width:0;flex-shrink:0}
    .brand-lockup{display:inline-flex;align-items:center;gap:12px;min-width:0;color:var(--gp-text,#15161a);font-family:var(--gp-font,system-ui)}
    .mark-frame{width:44px;height:44px;display:grid;place-items:center;overflow:hidden;flex-shrink:0}
    img{width:44px;height:44px;object-fit:contain;display:block;max-width:none}
    .brand-wordmark{font-size:var(--gp-brand-size,21px);font-weight:var(--gp-brand-weight,780);letter-spacing:var(--gp-brand-tracking,-.65px);white-space:nowrap}
    @media(max-width:600px){.mark-frame,img{width:36px;height:36px}.brand-lockup{gap:8px}.brand-wordmark{font-size:18px}}
    @media(max-width:560px){:host(.header-brand) .brand-wordmark{font-size:18px}}
  `]
})
export class WorkspaceBrand {
  @Input() name='Professy';
  @Input() app='professy';
  @Input() iconOnly=false;
  readonly logo=appLogo;
  readonly brandMark=brandMarkUrl;
}
