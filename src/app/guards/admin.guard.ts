import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { UiService } from '../services/ui.service';
import { LegacyService } from '../services/legacy.service';

@Injectable({
  providedIn: 'root'
})
export class AdminGuard implements CanActivate {
  constructor(private router: Router, private ui: UiService, private legacy: LegacyService) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean {
    try {
      const token = localStorage.getItem('jwtToken');
      if (!token) {
        console.warn('%c[AdminGuard] Sem token!', 'color:red;font-weight:bold');
        this.ui.showToast('Token expirado. Faça login novamente.', 'error', 4000);
        this.router.navigate(['/login']);
        return false;
      }

      // Extrair role diretamente do JWT (fonte verdadeira)
      const payload = this.legacy.decodeJwt(token);
      console.warn(`%c[AdminGuard] JWT payload roles: ${JSON.stringify(payload?.roles)}`, 'color:blue');
      
      let hasAdminRole = false;
      
      // Verificar se tem ROLE_ADMIN no array roles
      if (Array.isArray(payload?.roles)) {
        hasAdminRole = payload.roles.some((r: string) => 
          String(r).toUpperCase() === 'ADMIN' || String(r).toUpperCase() === 'ROLE_ADMIN'
        );
      }
      
      // Fallback: verificar payload.role direto
      if (!hasAdminRole && payload?.role) {
        const role = String(payload.role).toUpperCase();
        hasAdminRole = role === 'ADMIN' || role === 'ROLE_ADMIN';
      }
      
      console.warn(`%c[AdminGuard] hasAdminRole: ${hasAdminRole}`, 'color:blue;font-weight:bold');

      if (hasAdminRole) {
        console.warn('%c[AdminGuard] ✅ ACESSO PERMITIDO', 'color:green;font-weight:bold');
        // Também salva no localStorage para próximas verificações
        try {
          localStorage.setItem('userRole', 'ROLE_ADMIN');
        } catch (_) {}
        return true;
      }

      console.warn('%c[AdminGuard] ❌ ACESSO NEGADO', 'color:red;font-weight:bold');
      this.ui.showToast('Acesso negado. Apenas administradores podem acessar.', 'error', 4000);
      this.router.navigate(['/group']);
      return false;
    } catch (err) {
      console.error('%c[AdminGuard] ❌ ERRO:', 'color:red;font-weight:bold', err);
      this.ui.showToast('Erro ao verificar permissões.', 'error', 3000);
      this.router.navigate(['/group']);
      return false;
    }
  }
}
