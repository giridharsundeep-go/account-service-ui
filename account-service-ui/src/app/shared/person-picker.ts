import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

interface PickerPerson {
  id: number; name: string; initials?: string; designation?: string;
  avatarUrl?: string | null; email?: string;
  lookupIds?: number[];
}

/** One searchable, progressively rendered people picker for creation and editing. */
@Component({
  selector: 'app-person-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, MatAutocompleteModule, MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="gp-person-picker-field">
      <input matInput #triggerInput [(ngModel)]="displayText" [ngModelOptions]="{standalone: true}" [placeholder]="emptyLabel"
        [attr.aria-label]="label" [matAutocomplete]="menu" autocomplete="off"
        (focus)="resetSearch()" (input)="typeSearch($event)">
      <mat-autocomplete #menu="matAutocomplete" class="gp-people-autocomplete"
        [displayWith]="displayPerson" (optionSelected)="choose($event.option.value)" (closed)="restoreSelection()">
        <div class="gp-people-search" role="search" (click)="$event.stopPropagation()">
          <span aria-hidden="true">⌕</span>
          <input type="search" [attr.aria-label]="'Search ' + label.toLowerCase()"
            placeholder="Search name, email or designation" [ngModel]="query"
            [ngModelOptions]="{standalone: true}" (ngModelChange)="search($event)"
            (keydown)="$event.stopPropagation()" (keydown.escape)="closeSearch(triggerInput)">
        </div>
        <mat-option [value]="null">{{ emptyLabel }}</mat-option>
        <mat-option *ngFor="let person of visiblePeople; trackBy: trackPerson" [value]="person.id">
          <span class="gp-people-option">
            <span class="gp-people-avatar" [ngClass]="'gp-people-tone-' + (person.id % 5)">
              <img *ngIf="person.avatarUrl" [src]="person.avatarUrl" alt="">
              <span *ngIf="!person.avatarUrl">{{ person.initials || person.name.slice(0, 2).toUpperCase() }}</span>
            </span>
            <span class="gp-people-copy"><strong>{{ person.name }}</strong><small>{{ person.designation || 'Designation not set' }}</small><small *ngIf="person.email">{{ person.email }}</small></span>
          </span>
        </mat-option>
        <mat-option *ngIf="!matchingPeople.length" disabled>No matching people</mat-option>
        <div class="gp-people-more" *ngIf="matchingPeople.length > limit">
          <button type="button" (mousedown)="$event.preventDefault()" (click)="loadMore($event)">Load more · {{ limit }} of {{ matchingPeople.length }}</button>
        </div>
      </mat-autocomplete>
    </mat-form-field>`,
  styles: [`:host { display:block; min-width:0; width:100%; } .gp-person-picker-field { width:100%; }`],
})
export class PersonPickerComponent implements OnChanges {
  @Input() people: PickerPerson[] = [];
  @Input() value: number | null = null;
  @Input() label = 'Assignee';
  @Input() emptyLabel = 'Unassigned';
  @Output() selected = new EventEmitter<number | null>();
  @ViewChild(MatAutocompleteTrigger) trigger?: MatAutocompleteTrigger;
  query = '';
  displayText = '';
  limit = 50;
  ngOnChanges(): void { this.displayText = this.displayPerson(this.value); }
  displayPerson = (id: number | null): string => id == null ? this.emptyLabel : this.people.find(person => person.id === Number(id) || person.lookupIds?.includes(Number(id)))?.name ?? `User ${id}`;
  get matchingPeople(): PickerPerson[] {
    const query = this.query.trim().toLowerCase();
    return this.people.filter(person => !query || [person.name, person.email, person.designation]
      .some(value => String(value ?? '').toLowerCase().includes(query)));
  }
  get visiblePeople(): PickerPerson[] { return this.matchingPeople.slice(0, this.limit); }
  resetSearch(): void { this.query = ''; this.limit = 50; }
  restoreSelection(): void { this.displayText = this.displayPerson(this.value); }
  search(query: string): void { this.query = query; this.limit = 50; }
  typeSearch(event: Event): void { this.search((event.target as HTMLInputElement).value); }
  loadMore(event: Event): void { event.stopPropagation(); this.limit += 50; }
  choose(value: number | null): void { this.value = value; this.displayText = this.displayPerson(value); this.selected.emit(value); }
  closeSearch(input: HTMLInputElement): void { input.focus(); this.trigger?.closePanel(); }
  trackPerson(_index: number, person: PickerPerson): number { return person.id; }
}
