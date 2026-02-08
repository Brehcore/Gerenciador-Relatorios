import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { UiService } from '../services/ui.service';

@Injectable({
  providedIn: 'root'
})
export class AdminGuard implements CanActivate {
  constructor(private router: Router, private ui: UiService) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean {
    try {
      const userRole = localStorage.getItem('userRole') || '';
      const role = userRole.toUpperCase();

      // Apenas usuários com role ADMIN podem acessar (aceita AMBOS os formatos)
      if (role === 'ADMIN' || role === 'ROLE_ADMIN') {
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
