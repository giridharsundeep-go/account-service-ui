import {Component,Input,Output,EventEmitter,ViewChild,ElementRef} from '@angular/core';
import {CommonModule} from '@angular/common';
import {OverlayModule} from '@angular/cdk/overlay';
import {A11yModule} from '@angular/cdk/a11y';

/** One anchored, keyboard-accessible filter surface for workspace lists. */
@Component({selector:'app-filter-menu',standalone:true,imports:[CommonModule,OverlayModule,A11yModule],template:`
<button #trigger type="button" class="filter-trigger" cdkOverlayOrigin #origin="cdkOverlayOrigin" [class.applied]="activeCount>0" aria-haspopup="dialog" [attr.aria-expanded]="opened" (click)="opened=!opened">
 <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg><span>Filters</span><b *ngIf="activeCount">{{activeCount}}</b>
</button>
<ng-template cdkConnectedOverlay [cdkConnectedOverlayOrigin]="origin" [cdkConnectedOverlayOpen]="opened" [cdkConnectedOverlayHasBackdrop]="true" cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop" [cdkConnectedOverlayPush]="true" [cdkConnectedOverlayViewportMargin]="12" [cdkConnectedOverlayPositions]="positions" (backdropClick)="close()" (overlayKeydown)="escape($event)">
 <section class="filter-popover" role="dialog" [attr.aria-label]="title" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
  <header><div><strong>{{title}}</strong><small>Refine the results in this view.</small></div><button type="button" (click)="close()" aria-label="Close filters">×</button></header>
  <div class="filter-content"><ng-content></ng-content></div>
  <footer><button type="button" class="clear" (click)="clear.emit()">Clear filters</button><button type="button" class="done" (click)="close()">Done</button></footer>
 </section>
</ng-template>`,styles:[`
:host{display:inline-flex;flex-shrink:0}.filter-trigger{height:50px;display:inline-flex;align-items:center;gap:9px;padding:0 18px;border:1px solid var(--gp-border-color, #a0a6b1);border-radius:10px;background:var(--gp-surface,#fff);color:var(--gp-text,#273244);font:600 15px var(--gp-font,system-ui);cursor:pointer;white-space:nowrap}.filter-trigger svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round}.filter-trigger.applied{background:var(--gp-selection,#edf3ff);color:var(--gp-accent,#1764d4)}.filter-trigger b{display:grid;place-items:center;min-width:22px;height:22px;padding:0 4px;border-radius:20px;background:var(--gp-accent,#1764d4);color:white;font-size:12px}.filter-popover{width:480px;max-width:calc(100vw - 24px);max-height:min(680px,calc(100dvh - 90px));display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--gp-border-color, #a0a6b1);border-radius:16px;background:var(--gp-surface,#fff);color:var(--gp-text,#273244);box-shadow:var(--gp-float-shadow,0 16px 50px #172b4d26);font-family:var(--gp-font,system-ui);animation:filter-enter .16s ease-out}.filter-popover header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px;border-bottom:1px solid var(--gp-border-color, #a0a6b1)}header strong{display:block;font-size:19px}header small{display:block;margin-top:5px;color:var(--gp-muted,#69758a);font-size:13px}header button{width:34px;height:34px;border:0;background:transparent;color:inherit;font-size:25px;cursor:pointer}.filter-content{display:grid;gap:18px;min-height:0;overflow:auto;overscroll-behavior:contain;padding:22px}.filter-popover footer{display:flex;justify-content:space-between;gap:12px;padding:14px 20px;border-top:1px solid var(--gp-border-color, #a0a6b1)}footer button{height:42px;padding:0 18px;border:1px solid var(--gp-border-color, #a0a6b1);border-radius:10px;font:600 14px var(--gp-font,system-ui);cursor:pointer}.clear{background:var(--gp-surface,#fff);color:inherit}.done{background:var(--gp-accent,#1764d4);color:white;border-color:transparent}button:focus-visible{outline:2px solid var(--gp-accent,#1764d4);outline-offset:2px}@keyframes filter-enter{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){.filter-popover{animation:none}}
`]})
export class FilterMenu {
 @Input() title='Filters';@Input() activeCount=0;@Output() clear=new EventEmitter<void>();@ViewChild('trigger') trigger?:ElementRef<HTMLButtonElement>;opened=false;
 positions=[{originX:'end' as const,originY:'bottom' as const,overlayX:'end' as const,overlayY:'top' as const,offsetY:8},{originX:'end' as const,originY:'top' as const,overlayX:'end' as const,overlayY:'bottom' as const,offsetY:-8}];
 close(){this.opened=false;this.trigger?.nativeElement.focus();}
 escape(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();this.close();}}
}
