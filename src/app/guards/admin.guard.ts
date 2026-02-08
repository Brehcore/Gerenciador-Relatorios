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

      // COPIADO DO DASHBOARD QUE FUNCIONA!
      // Extrair role do JWT
      const payload = this.legacy.decodeJwt(token);
      let roleStr = '';
      
      // Tentar extrair de payload.role primeiro
      if (payload?.role) {
        roleStr = String(payload.role);
      }
      // Senão, tentar extrair do array roles
      else if (Array.isArray(payload?.roles) && payload.roles.length > 0) {
        roleStr = String(payload.roles[0]);
      }
      
      console.warn(`%c[AdminGuard] roleStr: ${roleStr}`, 'color:blue');
      
      // USAR .includes() COMO NO DASHBOARD (FUNCIONA!)
      const isAdmin = String(roleStr || '').toUpperCase().includes('ADMIN');
      
      console.warn(`%c[AdminGuard] isAdmin (includes ADMIN): ${isAdmin}`, 'color:blue;font-weight:bold');

      if (isAdmin) {
        console.warn('%c[AdminGuard] ✅ ACESSO PERMITIDO', 'color:green;font-weight:bold');
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
