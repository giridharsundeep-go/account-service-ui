import { HttpClient } from '@angular/common/http';
import { Component, OnInit, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Observable } from 'rxjs';
import { finalize, switchMap, map } from 'rxjs/operators';
import { environment } from '../../environment';
import { AuthService } from '../auth.service';

// Angular Material Module Imports
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

export interface AgileProductNode {
  id?: number; 
  user_id?: number;
  name: string;
  description: string;
}

@Component({
  selector: 'app-products',
  standalone: true,
  templateUrl: './products.html',
  styleUrl: './products.css',
  imports: [
    CommonModule, 
    FormsModule, 
    MatIconModule, 
    MatInputModule, 
    MatFormFieldModule, 
    MatButtonModule, 
    MatProgressSpinnerModule
  ]
})
export class Products implements OnInit {
  baseUrl = environment.apiBaseUrl;

  public productsRefresh$ = new BehaviorSubject<void>(undefined);
  products$: Observable<AgileProductNode[]> | undefined;
  
  productLookupFilter = '';
  isComposerOpen = false;
  isSaving = false;

  productForm!: AgileProductNode;

  constructor(
    private http: HttpClient, 
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.resetProductForm();
  }

  ngOnInit(): void {
    this.products$ = this.productsRefresh$.pipe(
      switchMap(() => {
        return this.http.get<any>(`${this.baseUrl}/products`, { headers: this.auth.getAuthHeaders() });
      }),
      map((res: any) => {
        return res?.data || res || [];
      })
    );
  }

  // ✅ POST: Authenticated creation route
  saveAndInitializeProduct(): void {
    if (!this.productForm.name.trim()) return;
    this.isSaving = true;
    this.cdr.markForCheck();

    this.http.post<any>(`${this.baseUrl}/products/create`, this.productForm, { headers: this.auth.getAuthHeaders() })
      .pipe(finalize(() => { this.isSaving = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => {
          this.isComposerOpen = false;
          this.resetProductForm();
          this.refreshProductList();
        },
        error: (err) => console.error('Failed to initialize product record:', err)
      });
  }

  // ✅ PUT: Authenticated mutation update route
  commitPortfolioChanges(): void {
    if (!this.productForm.id) return;
    this.isSaving = true;
    this.cdr.markForCheck();

    this.http.put(`${this.baseUrl}/products/${this.productForm.id}`, this.productForm, { headers: this.auth.getAuthHeaders() })
      .pipe(finalize(() => { this.isSaving = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => {
          this.isComposerOpen = false;
          this.resetProductForm();
          this.refreshProductList();
        },
        error: (err) => console.error('Failed to commit portfolio modifications:', err)
      });
  }

  // ✅ DELETE: Authenticated data extraction cleanup route
  archiveProductEntity(productId: number | undefined): void {
    if (productId === undefined || !confirm('Permanently delete this product portfolio?')) return;
    
    this.http.delete(`${this.baseUrl}/products/${productId}`, { headers: this.auth.getAuthHeaders() }).subscribe({
      next: () => this.refreshProductList(),
      error: (err) => console.error("Failed to remove product context:", err)
    });
  }

  // View state engine helpers
  loadProductToComposer(product: AgileProductNode): void {
    this.productForm = JSON.parse(JSON.stringify(product));
    this.isComposerOpen = true;
    this.cdr.markForCheck();
  }

  refreshProductList(): void { this.productsRefresh$.next(); }
  closeComposerDrawer(): void { this.isComposerOpen = false; this.resetProductForm(); }
  initiateNewProduct(): void { this.resetProductForm(); this.isComposerOpen = true; }

  private resetProductForm(): void {
    this.productForm = {
      id: undefined, 
      name: '', 
      description: ''
    };
  }
}