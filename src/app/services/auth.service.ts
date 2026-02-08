import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private passwordResetRequired = false;
  private userInfo: any = null;

  constructor(private http: HttpClient) {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    const stored = localStorage.getItem('passwordResetRequired');
    if (stored) {
      this.passwordResetRequired = JSON.parse(stored);
    }
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
        
        // Armazenar informações do usuário incluindo passwordResetRequired
        this.userInfo = response;
        localStorage.setItem('userInfo', JSON.stringify(response));
        
        // Armazenar flag de reset de senha obrigatório
        this.passwordResetRequired = response.passwordResetRequired || false;
        localStorage.setItem('passwordResetRequired', JSON.stringify(this.passwordResetRequired));
      }

      return response;
    } catch (err) {
      console.error('[AuthService] Erro no login:', err);
      throw err;
    }
  }

  isPasswordResetRequired(): boolean {
    // Comparação estrita: apenas true é true
    if (this.passwordResetRequired === true) return true;
    // Fallback: ver localStorage
    const stored = localStorage.getItem('passwordResetRequired');
    return stored ? JSON.parse(stored) === true : false;
  }

  setPasswordResetRequired(value: boolean) {
    this.passwordResetRequired = value;
    localStorage.setItem('passwordResetRequired', JSON.stringify(value));
  }

  getUserInfo(): any {
    return this.userInfo;
  }

  logout() {
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('passwordResetRequired');
    localStorage.removeItem('userInfo');
    this.passwordResetRequired = false;
    this.userInfo = null;
  }
}

