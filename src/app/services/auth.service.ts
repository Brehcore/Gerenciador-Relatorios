import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private platformId = inject(PLATFORM_ID);
  private userInfo: any = null;

  constructor(private http: HttpClient) {
    this.loadFromStorage();
  }

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  private loadFromStorage() {
    if (!this.isBrowser()) return; // No SSR, não tenta acessar localStorage
    
    try {
      const userStored = localStorage.getItem('userInfo');
      if (userStored) {
        this.userInfo = JSON.parse(userStored);
      }
    } catch (_) {}
  }

  async login(email: string, password: string) {
    console.log('[AuthService] Iniciando login com email:', email);
    try {
      const response = await firstValueFrom(
        this.http.post<any>('/auth/login', { email, password })
      );
      console.log('[AuthService] Resposta do login:', response);

      if (response && response.token) {
        // Armazenar apenas se estiver no browser
        if (this.isBrowser()) {
          try {
            localStorage.setItem('jwtToken', response.token);
            localStorage.setItem('userRole', response.role);
            localStorage.setItem('userInfo', JSON.stringify(response));
          } catch (_) {}
        }
        
        // Armazenar também em memória
        this.userInfo = response;
      }

      return response;
    } catch (err) {
      console.error('[AuthService] Erro no login:', err);
      throw err;
    }
  }

  getUserInfo(): any {
    return this.userInfo;
  }

  getToken(): string | null {
    if (!this.isBrowser()) return null;
    try {
      return localStorage.getItem('jwtToken');
    } catch (_) {
      return null;
    }
  }

  logout() {
    if (this.isBrowser()) {
      try {
        localStorage.removeItem('jwtToken');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userInfo');
      } catch (_) {}
    }
    this.userInfo = null;
  }
}

