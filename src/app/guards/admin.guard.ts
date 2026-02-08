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
    console.error('🚨 ADMIN GUARD EXECUTADO');
    try {
      // 1. Verificar se tem token
      const token = localStorage.getItem('jwtToken');
      console.error('🚨 Token:', token ? 'SIM' : 'NÃO');
      if (!token) {
        this.ui.showToast('❌ Token não encontrado. Faça login novamente.', 'error', 4000);
        this.router.navigate(['/login']);
        return false;
      }

      // 2. Decodificar JWT
      const payload = this.legacy.decodeJwt(token);
      
      // 3. Se payload for null/undefined, retornar falso
      if (!payload) {
        this.ui.showToast('❌ Token inválido (payload null). Faça login novamente.', 'error', 4000);
        this.router.navigate(['/login']);
        return false;
      }

      // 4. Extrair role - tentar múltiplas formas
      let roleValue: any = null;
      let foundInField = 'nenhum';
      
      // Tentar payload.roles (array)
      if (Array.isArray(payload.roles) && payload.roles.length > 0) {
        roleValue = payload.roles[0];
        foundInField = 'roles[0]';
      }
      // Tentar payload.role
      else if (payload.role) {
        roleValue = payload.role;
        foundInField = 'role';
      }
      // Tentar payload.authorities (array)
      else if (Array.isArray(payload.authorities) && payload.authorities.length > 0) {
        roleValue = payload.authorities[0];
        foundInField = 'authorities[0]';
      }

      // 5. Se não encontrou role, negar acesso
      if (!roleValue) {
        this.ui.showToast(`⚠️ Role não encontrado em payload. Campos: roles=${payload.roles}, role=${payload.role}, authorities=${payload.authorities}`, 'warning', 5000);
        this.router.navigate(['/group']);
        return false;
      }

      // 6. Converter para string e verificar
      const roleStr = String(roleValue);
      const roleUpper = roleStr.toUpperCase();
      
      // DEBUG: mostrar qual role foi encontrado
      this.ui.showToast(`🔍 Role encontrado em ${foundInField}: "${roleStr}" → "${roleUpper}"`, 'info', 3000);
      
      // 7. Verificar se contém 'ADMIN'
      const isAdmin = roleUpper.includes('ADMIN');

      if (isAdmin) {
        this.ui.showToast(`✅ Acesso ADMIN garantido!`, 'success', 2000);
        return true;
      }

      // 8. Negar acesso
      this.ui.showToast(`❌ Role "${roleUpper}" não contém 'ADMIN'. Acesso negado.`, 'warning', 4000);
      this.router.navigate(['/group']);
      return false;

    } catch (err) {
      this.ui.showToast(`❌ Erro inesperado: ${err}`, 'error', 4000);
      this.router.navigate(['/group']);
      return false;
    }
  }
}
