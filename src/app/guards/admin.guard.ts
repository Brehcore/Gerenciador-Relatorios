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
      // Primeiro, tentar obter do localStorage
      let userRole = localStorage.getItem('userRole') || '';
      
      // Se não encontrar no localStorage, tentar extrair do token JWT
      if (!userRole) {
        const token = localStorage.getItem('jwtToken');
        userRole = this.legacy.extractRoleFromToken(token) || '';
        // Se conseguir extrair do token, salvar no localStorage para próximas vezes
        if (userRole) {
          try {
            localStorage.setItem('userRole', userRole);
          } catch (_) {}
        }
      }
      
      const role = userRole.toUpperCase();
      
      // Debug log (remover em produção se necessário)
      console.log('[AdminGuard] Verificando acesso - userRole:', userRole, '- role upper:', role);

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
