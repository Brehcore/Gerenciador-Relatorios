import { Injectable, inject } from '@angular/core';
import { Router, CanDeactivate, CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { UiService } from '../services/ui.service';

@Injectable({ providedIn: 'root' })
export class PasswordResetGuard implements CanDeactivate<any> {
  private router = inject(Router);
  private auth = inject(AuthService);

  canDeactivate(component: any): boolean | Observable<boolean> {
    // Verificar se o componente tem o modal de reset de senha aberto
    if (component && component.showResetPasswordModal) {
      // Impedir saída do componente de login enquanto modal estiver aberto
      return false;
    }
    return true;
  }
}

export const requirePasswordResetGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Se NÃO precisa resetar a senha, redireciona para dashboard
  if (!authService.isPasswordResetRequired()) {
    router.navigate(['/dashboard']);
    return false;
  }

  return true;
};

export const blockUntilPasswordResetGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  console.error('🚨 BLOCK UNTIL PASSWORD RESET GUARD EXECUTADO');
  const authService = inject(AuthService);
  const router = inject(Router);
  const uiService = inject(UiService);

  // Se precisa resetar a senha, bloqueia acesso a essa rota
  if (authService.isPasswordResetRequired()) {
    console.error('🚨 PASSWORD RESET REQUIRED, BLOQUEANDO');
    uiService.showToast('⚠️ Você precisa resetar sua senha antes de acessar esta página.', 'warning', 4000);
    router.navigate(['/reset-senha-obrigatoria']);
    return false;
  }

  console.error('🚨 Password reset OK, permitindo');
  return true;
};
