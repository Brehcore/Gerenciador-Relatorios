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
      console.log('[AdminGuard] INICIANDO VERIFICAÇÃO');
      
      // Log 1: Verificar localStorage
      const cachedRole = localStorage.getItem('userRole');
      console.log('[AdminGuard] 1. localStorage.userRole =', cachedRole);
      
      // Log 2: Verificar token
      const token = localStorage.getItem('jwtToken');
      console.log('[AdminGuard] 2. token existe?', !!token);
      
      // Usar ensureUserRole que tem múltiplos fallbacks
      const role = await this.legacy.ensureUserRole();
      console.log('[AdminGuard] 3. ensureUserRole() retornou:', role);
      
      const upperRole = (role || '').toUpperCase();
      console.log('[AdminGuard] 4. upperRole =', upperRole);
      
      const isAdmin = upperRole === 'ADMIN' || upperRole === 'ROLE_ADMIN';
      console.log('[AdminGuard] 5. isAdmin (ADMIN ou ROLE_ADMIN)?', isAdmin);

      if (isAdmin) {
        console.log('[AdminGuard] ✅ ACESSO PERMITIDO');
        return true;
      }

      // Se não for admin
      console.log('[AdminGuard] ❌ ACESSO NEGADO - role não é admin');
      this.ui.showToast('Acesso negado. Apenas administradores podem acessar esta página.', 'error', 4000);
      this.router.navigate(['/group']);
      return false;
    } catch (err) {
      console.error('[AdminGuard] ❌ ERRO NA VERIFICAÇÃO:', err);
      this.ui.showToast('Erro ao verificar permissões.', 'error', 3000);
      this.router.navigate(['/group']);
      return false;
    }
  }
}
