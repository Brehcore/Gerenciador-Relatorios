import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { UiService } from '../services/ui.service';
import { LegacyService } from '../services/legacy.service';

@Injectable({ providedIn: 'root' })
export class UserGuard implements CanActivate {
  constructor(private router: Router, private ui: UiService, private legacy: LegacyService) {}

  /**
   * Normaliza uma role removendo prefixo ROLE_ e convertendo para MAIÚSCULO
   * ROLE_USER → USER
   * USER → USER
   */
  private normalizeRole(role: any): string {
    if (!role) return '';
    const roleStr = String(role).toUpperCase().trim();
    return roleStr.startsWith('ROLE_') ? roleStr.substring(5) : roleStr;
  }

  /**
   * Extrai roles do payload JWT de múltiplas formas
   * Sempre retorna um ARRAY para garantir consistência
   */
  private extractRoles(payload: any): string[] {
    if (!payload) return [];
    
    const roles: string[] = [];
    
    // Tentar payload.roles (array - formato Spring)
    if (Array.isArray(payload.roles)) {
      roles.push(...payload.roles.map((r: any) => this.normalizeRole(r)));
    }
    
    // Tentar payload.role (string única)
    if (payload.role && typeof payload.role === 'string') {
      roles.push(this.normalizeRole(payload.role));
    }
    
    // Tentar payload.authorities (array - formato Spring Security)
    if (Array.isArray(payload.authorities)) {
      roles.push(...payload.authorities.map((r: any) => this.normalizeRole(r)));
    }
    
    // Remover duplicatas
    return [...new Set(roles)].filter(r => r.length > 0);
  }

  /**
   * Verifica se alguma role contém 'USER'
   */
  private hasUserRole(roles: string[]): boolean {
    return roles.some(role => role.includes('USER'));
  }

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
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
      
      // 3. Se payload for null/undefined, retornar falso
      if (!payload) {
        this.ui.showToast('❌ Token inválido. Faça login novamente.', 'error', 4000);
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
