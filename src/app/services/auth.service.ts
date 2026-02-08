import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private userInfo: any = null;

  constructor(private http: HttpClient) {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    const userStored = localStorage.getItem('userInfo');
    if (userStored) {
      this.userInfo = JSON.parse(userStored);
    }
  }

  async login(email: string, password: string) {
    console.log('[AuthService] Iniciando login com email:', email);
    try {
      const response = await firstValueFrom(
        this.http.post<any>('/auth/login', { email, password })
      );
      console.log('[AuthService] Resposta do login:', response);

      if (response && response.token) {
        // O AuthInterceptor e o logout esperam a chave 'jwtToken'
        localStorage.setItem('jwtToken', response.token);
        localStorage.setItem('userRole', response.role);
        
        // Armazenar informações do usuário
        this.userInfo = response;
        localStorage.setItem('userInfo', JSON.stringify(response));
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

  logout() {
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userInfo');
    this.userInfo = null;
  }
}

