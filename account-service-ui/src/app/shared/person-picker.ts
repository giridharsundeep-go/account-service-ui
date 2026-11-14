import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ActorIconComponent, actorKind } from './actor-icon';

interface PickerPerson {
  id: number; name: string; initials?: string; designation?: string;
  avatarUrl?: string | null; email?: string;
  lookupIds?: number[];
  actorType?: string;
}

/** One searchable, progressively rendered people picker for creation and editing. */
@Component({
  selector: 'app-person-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, MatAutocompleteModule, MatFormFieldModule, MatInputModule, ActorIconComponent],
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="gp-person-picker-field">
      <app-actor-icon matPrefix [actorId]="value" [actorType]="selectedPerson?.actorType"></app-actor-icon>
      <input matInput #triggerInput [value]="displayText" [placeholder]="emptyLabel"
        [attr.aria-label]="label" [matAutocomplete]="menu" autocomplete="off"
        (focus)="resetSearch()" (input)="typeSearch($event)">
      <mat-autocomplete #menu="matAutocomplete" class="gp-people-autocomplete"
        [displayWith]="displayPerson" (optionSelected)="choose($event.option.value)" (closed)="restoreSelection()">
        <div class="gp-people-kinds" role="group" aria-label="Assignment type" (keydown)="$event.stopPropagation()">
          <button type="button" [class.active]="category==='HUMAN'" [attr.aria-pressed]="category==='HUMAN'" (mousedown)="$event.preventDefault()" (click)="selectCategory('HUMAN', $event)"><app-actor-icon actorType="HUMAN"></app-actor-icon> {{label==='Assignee' ? 'Assign to users' : 'Users'}} <small>{{humanCount}}</small></button>
          <button type="button" [class.active]="category==='AGENT'" [attr.aria-pressed]="category==='AGENT'" (mousedown)="$event.preventDefault()" (click)="selectCategory('AGENT', $event)"><app-actor-icon actorType="AGENT"></app-actor-icon> {{label==='Assignee' ? 'Assign to agents' : 'Agents'}} <small>{{agentCount}}</small></button>
        </div>
        <div class="gp-people-search" role="search" (click)="$event.stopPropagation()">
          <span aria-hidden="true">⌕</span>
          <input type="search" [attr.aria-label]="'Search ' + label.toLowerCase()"
            placeholder="Search name, email or designation" [ngModel]="query"
            [ngModelOptions]="{standalone: true}" (ngModelChange)="search($event)"
            (keydown)="$event.stopPropagation()" (keydown.escape)="closeSearch(triggerInput)">
        </div>
        <p class="gp-people-search-hint" *ngIf="query.trim().length < 2">Type at least 2 characters to find people.</p>
        <mat-option *ngIf="query.trim().length >= 2" [value]="null">{{ emptyLabel }}</mat-option>
        <mat-option *ngFor="let person of visiblePeople; trackBy: trackPerson" [value]="person.id">
          <span class="gp-people-option">
            <span class="gp-people-avatar" [ngClass]="'gp-people-tone-' + tone(person.id)">
              <img *ngIf="person.avatarUrl" [src]="person.avatarUrl" alt="">
              <span *ngIf="!person.avatarUrl">{{ person.initials || person.name.slice(0, 2).toUpperCase() }}</span>
            </span>
            <span class="gp-people-copy"><strong><app-actor-icon [actorId]="person.id" [actorType]="person.actorType"></app-actor-icon> {{ person.name }}</strong><small>{{ person.designation || 'Designation not set' }}</small><small *ngIf="person.email">{{ person.email }}</small></span>
          </span>
        </mat-option>
        <mat-option *ngIf="query.trim().length >= 2 && !matchingPeople.length" disabled>{{category==='AGENT' ? 'No matching agents in this project' : 'No matching users'}}</mat-option>
        <div class="gp-people-more" *ngIf="matchingPeople.length > limit">
          <button type="button" (mousedown)="$event.preventDefault()" (click)="loadMore($event)">Load more · {{ limit }} of {{ matchingPeople.length }}</button>
        </div>
      </mat-autocomplete>
    </mat-form-field>`,
  styles: [`:host { display:block; min-width:0; width:100%; } .gp-person-picker-field { width:100%; } .gp-people-search-hint{margin:10px 16px 12px;color:#68717d;font-size:13px} app-actor-icon[matPrefix]{margin:0 10px 0 14px;color:#596579}`],
})
export class PersonPickerComponent implements OnChanges,AfterViewInit,OnDestroy {
  @Input() people: PickerPerson[] = [];
  @Input() value: number | null = null;
  @Input() label = 'Assignee';
  @Input() emptyLabel = 'Unassigned';
  @Input() selectedName = '';
  @Input() autoOpen = false;
  @Output() selected = new EventEmitter<number | null>();
  @ViewChild(MatAutocompleteTrigger) trigger?: MatAutocompleteTrigger;
  @ViewChild('triggerInput') input?: ElementRef<HTMLInputElement>;
  private openTimer?:ReturnType<typeof setTimeout>;
  tone(id:number){return Math.abs(id)%5;}
  query = '';
  displayText = '';
  limit = 50;
  category: 'HUMAN' | 'AGENT' = 'HUMAN';
  get selectedPerson(): PickerPerson | undefined { return this.people.find(person => person.id === Number(this.value) || person.lookupIds?.includes(Number(this.value))); }
  get humanCount(): number { return this.people.filter(person => actorKind(person.id, person.actorType) === 'HUMAN').length; }
  get agentCount(): number { return this.people.filter(person => actorKind(person.id, person.actorType) === 'AGENT').length; }
  ngOnChanges(changes?:SimpleChanges): void {
    if(!this.trigger?.panelOpen||changes?.['value']){
      this.displayText=this.displayPerson(this.value);
      this.category=actorKind(this.value,this.selectedPerson?.actorType)==='AGENT'?'AGENT':'HUMAN';
    }
  }
  ngAfterViewInit():void {
    if(this.autoOpen)this.openTimer=setTimeout(()=>{
      this.input?.nativeElement.focus();
      this.input?.nativeElement.select();
      this.trigger?.openPanel();
    });
  }
  ngOnDestroy():void {clearTimeout(this.openTimer);}
  // Keep the search text separate from option IDs. In particular, never coerce
  // an already formatted name to Number() when Material formats a selection.
  displayPerson = (value: number | string | PickerPerson | null): string => {
    if(value==null||value==='')return this.emptyLabel;
    if(typeof value==='object')return value.name||this.emptyLabel;
    if(typeof value==='string'&&!/^-?\d+$/.test(value.trim()))return /^(?:user\s+)?nan$/i.test(value.trim())?this.emptyLabel:value;
    const id=Number(value);
    if(!Number.isSafeInteger(id)||id===0)return this.emptyLabel;
    const person=this.people.find(person=>Number(person.id)===id||person.lookupIds?.includes(id));
    return person?.name||(id===Number(this.value)&&this.selectedName)||`${id<0?'Agent':'User'} ${Math.abs(id)}`;
  };
  get matchingPeople(): PickerPerson[] {
    const query = this.query.trim().toLowerCase();
    if (query.length < 2) return [];
    return this.people.filter(person => actorKind(person.id, person.actorType) === this.category && (!query || [person.name, person.email, person.designation]
      .some(value => String(value ?? '').toLowerCase().includes(query))));
  }
  get visiblePeople(): PickerPerson[] { return this.matchingPeople.slice(0, this.limit); }
  resetSearch(): void { this.query = ''; this.limit = 50; this.category = actorKind(this.value, this.selectedPerson?.actorType) === 'AGENT' ? 'AGENT' : 'HUMAN'; }
  selectCategory(category: 'HUMAN' | 'AGENT', event: Event): void { event.stopPropagation(); this.category = category; this.query = ''; this.limit = 50; }
  restoreSelection(): void { this.displayText = this.displayPerson(this.value); }
  search(query: string): void { this.query = query; this.limit = 50; }
  typeSearch(event: Event): void { this.displayText=(event.target as HTMLInputElement).value;this.search(this.displayText); }
  loadMore(event: Event): void { event.stopPropagation(); this.limit += 50; }
  choose(value: number | null): void {
    if(value!==null&&(!Number.isSafeInteger(Number(value))||Number(value)===0))return;
    this.value=value===null?null:Number(value);
    this.displayText=this.displayPerson(this.value);
    this.selected.emit(this.value);
  }
  closeSearch(input: HTMLInputElement): void { input.focus(); this.trigger?.closePanel(); }
  trackPerson(_index: number, person: PickerPerson): number { return person.id; }
}
