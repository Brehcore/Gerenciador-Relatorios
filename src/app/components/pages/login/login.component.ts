import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { LegacyService } from '../../../services/legacy.service';
import { UiService } from '../../../services/ui.service';
import { PasswordResetService } from '../../../services/password-reset.service';

@Component({
  standalone: true,
  selector: 'app-login',
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
  email = '';
  password = '';
  loading = false;
  errorMessage = '';
  
  // Modal de reset obrigatório
  showPasswordResetRequiredModal = false;
  userEmailForReset = '';

  constructor(
    private auth: AuthService,
    private legacy: LegacyService,
    private ui: UiService,
    private router: Router,
    private passwordResetService: PasswordResetService
  ) {}

  ngOnInit(): void {
    try {
      const token = localStorage.getItem('jwtToken');
      // se já houver token, considera usuário autenticado e navega para página principal
      if (token) {
        try {
          // valida expiração do token quando disponível
          const payload: any = this.legacy.decodeJwt(token as string) || {};
          const now = Math.floor(Date.now() / 1000);
          if (payload && payload.exp && Number(payload.exp) > 0) {
            if (Number(payload.exp) > now) {
              try { this.router.navigate(['/group']); } catch (_) { window.location.href = '/'; }
              return;
            } else {
              // token expirado
              try { localStorage.removeItem('jwtToken'); } catch(_) {}
            }
          } else {
            // sem exp -> assumir válido (fallback) e navegar
            try { this.router.navigate(['/group']); } catch (_) { window.location.href = '/'; }
            return;
          }
        } catch (e) {
          // Se houver erro ao decodificar, tentar navegar por segurança
          try { this.router.navigate(['/group']); } catch (_) { window.location.href = '/'; }
          return;
        }
      }
    } catch (e) {
      // não bloquear UI em caso de erro ao acessar storage
      console.warn('[LoginComponent] erro ao verificar token no storage', e);
    }
  }

  async onSubmit(ev?: Event) {
    try {
      if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
    } catch(_) {}
    if (!this.email || !this.password) {
      this.ui.showToast('Email e senha são obrigatórios', 'error');
      return;
    }
    this.loading = true;
    this.errorMessage = '';
    try {
      const resp = await this.auth.login(this.email, this.password);
      // AuthService.login() já cuida de salvar token em localStorage
      // Aqui só confiamos que foi salvo corretamente
      
      // Verificar se passwordResetRequired é true
      if (resp && resp.passwordResetRequired === true) {
        this.userEmailForReset = resp.email || this.email;
        this.showPasswordResetRequiredModal = true;
        // Não navegar ainda - aguardar ação do usuário no modal
        return;
      }

      this.ui.showToast('Login realizado com sucesso', 'success');
      this.errorMessage = '';

      // navegar para a página principal (group)
      try { this.router.navigate(['/group']); } catch(_) { window.location.href = '/'; }
    } catch (err: any) {
      let msg = 'Erro ao efetuar login';
      try {
        if (err && typeof err === 'object') {
          // Erro de conexão / CORS / servidor inacessível
          if (err.status === 0) msg = 'Falha de conexão com o servidor';
          else if (err.status === 401) msg = 'Credenciais inválidas';
          else if (err.error && typeof err.error === 'string') msg = err.error;
          else if (err.error && err.error.message) msg = err.error.message;
          else if (err.message) msg = err.message;
        } else if (typeof err === 'string') {
          msg = err;
        }
      } catch (_) {}
      this.errorMessage = msg;
      this.ui.showToast(msg, 'error');
      console.error('login error', err);
    } finally {
      this.loading = false;
    }
  }

  closePasswordResetRequiredModal() {
    this.showPasswordResetRequiredModal = false;
    // Logout do usuário
    this.auth.logout();
  }

  continueToPasswordReset() {
    // Fechar modal e redirecionar para página de reset obrigatório
    this.showPasswordResetRequiredModal = false;
    try { this.router.navigate(['/reset-senha-obrigatoria']); } catch(_) { window.location.href = '/reset-senha-obrigatoria'; }
  }
}
