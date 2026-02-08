import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { UiService } from '../services/ui.service';
import { LegacyService } from '../services/legacy.service';

@Injectable({
  providedIn: 'root'
})
export class AdminGuard implements CanActivate {
  constructor(private router: Router, private ui: UiService, private legacy: LegacyService) {}

  async canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Promise<boolean> {
    try {
      console.warn('%c[AdminGuard] INICIANDO', 'color:orange;font-weight:bold');
      
      const cachedRole = localStorage.getItem('userRole');
      console.warn(`%c[AdminGuard] localStorage.userRole: ${cachedRole}`, 'color:blue');
      
      const role = await this.legacy.ensureUserRole();
      console.warn(`%c[AdminGuard] ensureUserRole() retornou: ${role}`, 'color:blue');
      
      const upperRole = (role || '').toUpperCase();
      const isAdmin = upperRole === 'ADMIN' || upperRole === 'ROLE_ADMIN';
      
      console.warn(`%c[AdminGuard] upperRole: ${upperRole} | isAdmin: ${isAdmin}`, 'color:blue');

      if (isAdmin) {
        console.warn('%c[AdminGuard] ✅ ACESSO PERMITIDO', 'color:green;font-weight:bold');
        return true;
      }

      console.warn(`%c[AdminGuard] ❌ ACESSO NEGADO - role ${role} não é admin`, 'color:red;font-weight:bold');
      this.ui.showToast('Acesso negado. Apenas administradores podem acessar esta página.', 'error', 4000);
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
