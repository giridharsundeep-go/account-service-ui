import { HttpClient } from '@angular/common/http';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { environment } from '../../environment';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { map, Observable, BehaviorSubject, combineLatest, forkJoin, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { AuthService } from '../auth.service';

// Angular Material Imports
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';

@Component({
  selector: 'app-backlog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule
  ],
  templateUrl: './backlog.html',
  styleUrls: ['./backlog.css']
})
export class Backlog implements OnInit {
  baseUrl = environment.apiBaseUrl;

  private backlogRefresh$ = new BehaviorSubject<void>(undefined);
  private epicsSubject$ = new BehaviorSubject<any[]>([]);
  
  epicsWithTasks$: Observable<any[]> | undefined;
  allEpics: any[] = [];

  // Form Fields
  itemName = '';
  itemDescription = '';
  itemType = 'TASK'; // EPIC or TASK
  selectedEpicId: number | null = null;
  itemPriority = 'MEDIUM'; // LOW, MEDIUM, HIGH, CRITICAL
  itemStatus = 'BACKLOG'; // BACKLOG, IN_PROGRESS, VALIDATION, DONE

  editingItemId: number | null = null;
  searchTerm = '';
  loading = false;
  selectedItem: any = null;

  private originalItemState: any = null;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.loadEpicsBackground();

    this.epicsWithTasks$ = combineLatest([
      this.backlogRefresh$,
      this.epicsSubject$
    ]).pipe(
      switchMap(() => {
        this.loading = true;
        return this.http.get<any>(`${this.baseUrl}/backlog/items`, { headers: this.auth.getAuthHeaders() });
      }),
      map((res: any) => {
        const items = res?.data || [];
        
        // Structure flat items into a hierarchy of Epics containing Tasks
        const epics = items.filter((i: any) => i.type === 'EPIC' || i.item_type === 'EPIC');
        const tasks = items.filter((i: any) => i.type === 'TASK' || i.item_type === 'TASK');

        return epics.map((epic: any) => {
          epic.tasks = tasks.filter((t: any) => Number(t.epic_id || t.parent_id) === Number(epic.id));
          return epic;
        });
      }),
      map((structuredEpics) => {
        this.loading = false;
        return structuredEpics;
      })
    );
  }

  filterEpics(epics: any[] | null): any[] {
    if (!epics) return [];
    if (!this.searchTerm.trim()) return epics;
    
    const term = this.searchTerm.toLowerCase().trim();
    return epics.filter(epic => 
      epic.name?.toLowerCase().includes(term) || 
      epic.description?.toLowerCase().includes(term) ||
      epic.tasks?.some((t: any) => t.name?.toLowerCase().includes(term))
    );
  }

  refreshBacklog() {
    this.backlogRefresh$.next();
  }

  loadEpicsBackground() {
    this.http.get<any>(`${this.baseUrl}/backlog/epics`, {
      headers: this.auth.getAuthHeaders()
    }).subscribe({
      next: (res) => {
        this.allEpics = res?.data || [];
        this.epicsSubject$.next(this.allEpics);
        this.cdr.markForCheck();
      },
      error: (err) => console.error('Failed to pre-cache product epics matrix:', err)
    });
  }

  openItemDetails(item: any): void {
    this.selectedItem = item;
  }

  closeItemDetails(): void {
    this.selectedItem = null;
  }

  editItem(item: any, event: Event) {
    event.stopPropagation();
    this.editingItemId = item.id;
    this.itemName = item.name;
    this.itemDescription = item.description || '';
    this.itemType = item.type || item.item_type || 'TASK';
    this.selectedEpicId = item.epic_id || item.parent_id || null;
    this.itemPriority = item.priority || 'MEDIUM';
    this.itemStatus = item.status || 'BACKLOG';
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.cdr.markForCheck();
  }

  saveItem() {
    if (!this.itemName.trim()) return;
    this.loading = true;

    const payload = {
      name: this.itemName.trim(),
      description: this.itemDescription.trim(),
      type: this.itemType,
      epic_id: this.itemType === 'TASK' ? this.selectedEpicId : null,
      priority: this.itemPriority,
      status: this.itemStatus
    };

    const request$ = this.editingItemId 
      ? this.http.put(`${this.baseUrl}/backlog/items/${this.editingItemId}`, payload, { headers: this.auth.getAuthHeaders() })
      : this.http.post(`${this.baseUrl}/backlog/items/create`, payload, { headers: this.auth.getAuthHeaders() });

    request$.subscribe({
      next: () => {
        this.resetForm();
        this.refreshBacklog();
        this.loadEpicsBackground();
      },
      error: (err) => {
        console.error('Failed to sync product management blueprint asset:', err);
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  updateTaskStatusInline(task: any, newStatus: string) {
    this.http.patch(`${this.baseUrl}/backlog/items/${task.id}/status`, { status: newStatus }, {
      headers: this.auth.getAuthHeaders()
    }).subscribe({
      next: () => this.refreshBacklog(),
      error: (err) => console.error('Failed to alter runtime workflow progress marker:', err)
    });
  }

  deleteItem(id: number, event: Event) {
    event.stopPropagation();
    if (!confirm('Purge item architecture node from product roadmap record index?')) return;
    
    this.http.delete(`${this.baseUrl}/backlog/items/${id}`, {
      headers: this.auth.getAuthHeaders()
    }).subscribe(() => {
      this.refreshBacklog();
      if (this.editingItemId === id) this.resetForm();
      if (this.selectedItem?.id === id) this.closeItemDetails();
    });
  }

  resetForm() {
    this.itemName = '';
    this.itemDescription = '';
    this.itemType = 'TASK';
    this.selectedEpicId = null;
    this.itemPriority = 'MEDIUM';
    this.itemStatus = 'BACKLOG';
    this.editingItemId = null;
    this.cdr.markForCheck();
  }
}