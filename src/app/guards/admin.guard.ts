import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { UiService } from '../services/ui.service';

@Injectable({
  providedIn: 'root'
})
export class AdminGuard implements CanActivate {
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
   * Verifica se alguma role contém 'ADMIN'
   */
  private hasAdminRole(roles: string[]): boolean {
    return roles.some(role => role.includes('ADMIN'));
  }

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean {
    // DEBUG: Armazenar estado para inspecionar
    (window as any).__adminGuardDebug = {
      timestamp: new Date().toISOString(),
      isBrowser: this.isBrowser(),
      tokenExists: false,
      payloadExists: false,
      rolesFound: [],
      isAdmin: false,
      result: false
    };

    // ✅ SSR SEGURO: Servidor não valida, só browser faz
    if (!this.isBrowser()) {
      (window as any).__adminGuardDebug.result = true;
      (window as any).__adminGuardDebug.reason = 'SSR - retornando true';
      return true;
    }

    try {
      // 1. Verificar se tem token
      const token = localStorage.getItem('jwtToken');
      (window as any).__adminGuardDebug.tokenExists = !!token;
      
      if (!token) {
        (window as any).__adminGuardDebug.reason = 'Token não encontrado';
        this.ui.showToast('❌ Token não encontrado. Faça login novamente.', 'error', 4000);
        this.router.navigate(['/login']);
        return false;
      }

      // 2. Decodificar JWT - SEM SERVICE
      let payload: any = null;
      try {
        const base64Payload = token.split('.')[1];
        payload = JSON.parse(atob(base64Payload));
        (window as any).__adminGuardDebug.payloadExists = !!payload;
      } catch (decodeErr) {
        (window as any).__adminGuardDebug.reason = 'Erro ao decodificar: ' + decodeErr;
        this.ui.showToast('❌ Erro ao decodificar token.', 'error', 4000);
        this.router.navigate(['/login']);
        return false;
      }
      
      if (!payload) {
        (window as any).__adminGuardDebug.reason = 'Payload nulo';
        this.ui.showToast('❌ Token inválido.', 'error', 4000);
        this.router.navigate(['/login']);
        return false;
      }

      // 4. Extrair roles (sempre retorna array)
      const roles = this.extractRoles(payload);
      (window as any).__adminGuardDebug.rolesFound = roles;

      // 5. Se nenhuma role encontrada
      if (roles.length === 0) {
        (window as any).__adminGuardDebug.reason = 'Nenhuma role encontrada';
        this.ui.showToast('⚠️ Nenhuma role encontrada no token.', 'warning', 4000);
        this.router.navigate(['/group']);
        return false;
      }

      // 6. Verificar se tem role ADMIN
      const isAdmin = this.hasAdminRole(roles);
      (window as any).__adminGuardDebug.isAdmin = isAdmin;

      if (isAdmin) {
        (window as any).__adminGuardDebug.result = true;
        (window as any).__adminGuardDebug.reason = 'ADMIN encontrado';
        return true;
      }

      // 7. Negar acesso
      (window as any).__adminGuardDebug.reason = 'Não é ADMIN';
      this.ui.showToast(`❌ Acesso negado. Apenas administradores podem acessar.`, 'error', 4000);
      this.router.navigate(['/group']);
      return false;

    } catch (err) {
      (window as any).__adminGuardDebug.reason = 'Erro: ' + err;
      console.error('[AdminGuard] Erro:', err);
      this.ui.showToast('❌ Erro ao verificar permissões.', 'error', 4000);
      this.router.navigate(['/group']);
      return false;
    }
  }
}
