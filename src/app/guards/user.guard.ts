import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { UiService } from '../services/ui.service';

@Injectable({ providedIn: 'root' })
export class UserGuard implements CanActivate {
  private platformId = inject(PLATFORM_ID);
  constructor(private router: Router, private ui: UiService) {}

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  /**
   * Normaliza uma role removendo prefixo ROLE_ e convertendo para MAIÚSCULO
   */
  private normalizeRole(role: any): string {
    if (!role) return '';
    const roleStr = String(role).toUpperCase().trim();
    return roleStr.startsWith('ROLE_') ? roleStr.substring(5) : roleStr;
  }

  /**
   * Extrai roles do payload JWT de múltiplas formas
   */
  private extractRoles(payload: any): string[] {
    if (!payload) return [];
    
    const roles: string[] = [];
    
    if (Array.isArray(payload.roles)) {
      roles.push(...payload.roles.map((r: any) => this.normalizeRole(r)));
    }
    
    if (payload.role && typeof payload.role === 'string') {
      roles.push(this.normalizeRole(payload.role));
    }
    
    if (Array.isArray(payload.authorities)) {
      roles.push(...payload.authorities.map((r: any) => this.normalizeRole(r)));
    }
    
    return [...new Set(roles)].filter(r => r.length > 0);
  }

  /**
   * Verifica se alguma role contém 'USER'
   */
  private hasUserRole(roles: string[]): boolean {
    return roles.some(role => role.includes('USER'));
  }

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    // ✅ SSR SEGURO: Servidor não valida, só browser faz
    if (!this.isBrowser()) {
      return true;
    }

    try {
      // 1. Verificar se tem token
      const token = localStorage.getItem('jwtToken');
      if (!token) {
        this.ui.showToast('❌ Token não encontrado. Faça login novamente.', 'error', 4000);
        this.router.navigate(['/login']);
        return false;
      }

      // 2. Decodificar JWT - SEM SERVICE
      let payload: any = null;
      try {
        const base64Payload = token.split('.')[1];
        payload = JSON.parse(atob(base64Payload));
      } catch (decodeErr) {
        this.ui.showToast('❌ Erro ao decodificar token.', 'error', 4000);
        this.router.navigate(['/login']);
        return false;
      }
      
      if (!payload) {
        this.ui.showToast('❌ Token inválido.', 'error', 4000);
        this.router.navigate(['/login']);
        return false;
      }

      // 4. Extrair roles (sempre retorna array)
      const roles = this.extractRoles(payload);

      // 5. Se nenhuma role encontrada
      if (roles.length === 0) {
        this.ui.showToast('⚠️ Nenhuma role encontrada no token.', 'warning', 4000);
        this.router.navigate(['/group']);
        return false;
      }

      // 6. Verificar se tem role USER
      const isUser = this.hasUserRole(roles);

      if (isUser) {
        return true;
      }

      // 7. Negar acesso
      this.ui.showToast('❌ Acesso negado. Apenas técnicos podem acessar.', 'error', 4000);
      this.router.navigate(['/group']);
      return false;

    } catch (err) {
      console.error('[UserGuard] Erro:', err);
      this.ui.showToast('❌ Erro ao verificar permissões.', 'error', 4000);
      this.router.navigate(['/group']);
      return false;
    }
  }
}
