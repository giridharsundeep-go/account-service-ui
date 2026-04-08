import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {

    const user = sessionStorage.getItem('auth_user');

    if (user) {
      const parsed = JSON.parse(user);

      const cloned = req.clone({
        setHeaders: {
          Authorization: `Bearer ${parsed.token || ''}`
        }
      });

      return next.handle(cloned).pipe(
        catchError(err => {
          if (err.status === 401) {
            sessionStorage.clear();
            window.location.href = '/login';
          }
          return throwError(() => err);
        })
      );
    }

    return next.handle(req);

  }
}