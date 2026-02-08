import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { UiService } from '../services/ui.service';
import { LegacyService } from '../services/legacy.service';

@Injectable({ providedIn: 'root' })
export class UserGuard implements CanActivate {
  constructor(private router: Router, private ui: UiService, private legacy: LegacyService) {}

  async canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Promise<boolean> {
    try {
      const role = await this.legacy.ensureUserRole();
      const up = (role || '').toString().toUpperCase();
      // Aceitar AMBOS os formatos (USER ou ROLE_USER)
      if (up === 'USER' || up === 'ROLE_USER') return true;

      this.ui.showToast('Acesso negado. Apenas técnicos (USER) podem acessar esta página.', 'error', 4000);
      this.router.navigate(['/group']);
      return false;
    } catch (err) {
      console.warn('UserGuard error', err);
      this.ui.showToast('Erro ao verificar permissões.', 'error', 3000);
      this.router.navigate(['/group']);
      return false;
    }
  }
}
