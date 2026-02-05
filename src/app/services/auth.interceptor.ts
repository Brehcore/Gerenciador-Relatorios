import { Injectable, inject } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { UiService } from './ui.service';
import { Router } from '@angular/router';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private ui = inject(UiService);
  private router = inject(Router);

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const token = localStorage.getItem('jwtToken');
    
    if (token) {
      request = request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
    }

    return next.handle(request).pipe(
      tap((event: HttpEvent<any>) => {
        if (event instanceof HttpResponse) {
          // no-op: keep for debug if needed
        }
      }),
      catchError((error: HttpErrorResponse) => {
        try {
          // Preferir extrair mensagem estruturada do backend
          let serverMsg: string | null = null;
          if (error.error) {
            if (typeof error.error === 'object') {
              serverMsg = (error.error.message || error.error.error || JSON.stringify(error.error));
            } else if (typeof error.error === 'string') {
              serverMsg = error.error;
            }
          }

          if (error.status === 409) {
            // Business rule: Bloqueio de agenda
            const msg = serverMsg || 'Conflito de agenda detectado.';
            this.ui.showToast(msg, 'warning', 7000);
            return throwError(() => ({ ...error, userMessage: msg }));
          }

          if (error.status === 403) {
            const msg = serverMsg || 'Acesso negado: você não possui permissão para acessar este recurso.';
            this.ui.showToast(msg, 'error');
            try { this.router.navigate(['/dashboard']); } catch (_) {}
            return throwError(() => ({ ...error, userMessage: msg }));
          }

          if (error.status >= 500) {
            const msg = 'Erro interno no servidor. Tente novamente mais tarde.';
            this.ui.showToast(msg, 'error');
            return throwError(() => ({ ...error, userMessage: msg }));
          }

          // Default: rethrow original error
          return throwError(() => error);
        } catch (e) {
          return throwError(() => error);
        }
      })
    );
  }
}
