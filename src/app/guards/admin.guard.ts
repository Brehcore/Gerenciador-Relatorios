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
      // Usar ensureUserRole que tem múltiplos fallbacks (como UserGuard)
      // Isso garante que o role será extraído corretamente mesmo em race conditions
      const role = await this.legacy.ensureUserRole();
      const upperRole = (role || '').toUpperCase();
      
      console.log('[AdminGuard] Role obtido:', role, '| Upper:', upperRole);

      // Aceitar ambos os formatos (ADMIN ou ROLE_ADMIN)
      if (upperRole === 'ADMIN' || upperRole === 'ROLE_ADMIN') {
        return true;
      }

      // Se não for admin, mostrar toast e redirecionar
      this.ui.showToast('Acesso negado. Apenas administradores podem acessar esta página.', 'error', 4000);
      this.router.navigate(['/group']);
      return false;
    } catch (err) {
      console.warn('AdminGuard check failed', err);
      this.ui.showToast('Erro ao verificar permissões.', 'error', 3000);
      this.router.navigate(['/group']);
      return false;
    }
  }
}
