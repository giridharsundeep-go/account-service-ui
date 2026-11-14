import { Component, Input } from '@angular/core';

export type ActorKind = 'HUMAN' | 'AGENT' | 'SYSTEM' | 'UNASSIGNED';

/** Ticket selectors use negative agent IDs; actor records carry an explicit type. */
export function actorKind(id: number | string | null | undefined, type?: string | null): ActorKind {
  if (type?.toUpperCase() === 'AGENT' || Number(id) < 0) return 'AGENT';
  if (type?.toUpperCase() === 'SYSTEM') return 'SYSTEM';
  if (type?.toUpperCase() === 'HUMAN' || Number(id) > 0) return 'HUMAN';
  return 'UNASSIGNED';
}

@Component({
  selector: 'app-actor-icon', standalone: true,
  template: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round" role="img" [attr.aria-label]="label || kindLabel"
    [attr.data-actor-kind]="kind"><title>{{label || kindLabel}}</title>
    @switch (kind) {
      @case ('AGENT') { <path d="M12 3v3M9 3h6"/><rect x="5" y="6" width="14" height="14" rx="3"/><path d="M2 11v5m20-5v5M9 16h6"/><circle cx="9" cy="11" r=".8"/><circle cx="15" cy="11" r=".8"/> }
      @case ('SYSTEM') { <rect x="4" y="4" width="16" height="6" rx="2"/><rect x="4" y="14" width="16" height="6" rx="2"/><path d="M8 7h.01M8 17h.01"/> }
      @default { <circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/> }
    }
  </svg>`,
  styles: [`:host{display:inline-flex;vertical-align:middle;align-items:center;justify-content:center;flex:0 0 auto;width:18px;height:18px;color:inherit;line-height:1}svg{display:block;width:100%;height:100%}`],
})
export class ActorIconComponent {
  @Input() actorId: number | string | null | undefined = null;
  @Input() actorType: string | null | undefined;
  @Input() label = '';
  get kind(): ActorKind { return actorKind(this.actorId, this.actorType); }
  get kindLabel(): string { return ({HUMAN:'Human', AGENT:'Agent', SYSTEM:'System', UNASSIGNED:'Unassigned'})[this.kind]; }
}
