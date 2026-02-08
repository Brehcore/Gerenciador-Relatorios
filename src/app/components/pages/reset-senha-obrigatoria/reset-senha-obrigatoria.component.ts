import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LegacyService } from '../../../services/legacy.service';
import { AuthService } from '../../../services/auth.service';
import { UiService } from '../../../services/ui.service';

@Component({
  standalone: true,
  selector: 'app-reset-senha-obrigatoria',
  imports: [CommonModule, FormsModule],
  templateUrl: './reset-senha-obrigatoria.component.html',
  styleUrls: ['./reset-senha-obrigatoria.component.css']
})
export class ResetSenhaObrigatóriaComponent implements OnInit {
  private legacy = inject(LegacyService);
  private auth = inject(AuthService);
  private ui = inject(UiService);
  private router = inject(Router);

  newPassword = '';
  confirmPassword = '';
  submitting = false;
  userEmail = '';

  ngOnInit() {
    // Obter email do usuário logado
    const userInfo = this.auth.getUserInfo();
    this.userEmail = userInfo?.email || 'Usuário';
  }

  async submitResetPassword() {
    // Validações
    if (!this.newPassword || !this.confirmPassword) {
      this.ui.showToast('Preencha todos os campos', 'warning');
      return;
    }

    if (this.newPassword.length < 8) {
      this.ui.showToast('A senha deve ter no mínimo 8 caracteres', 'warning');
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.ui.showToast('As senhas não conferem', 'warning');
      return;
    }

    this.submitting = true;
    try {
      const url = `${this.legacy.apiBaseUrl}/users/me/change-password`;
      const payload = {
        newPassword: this.newPassword,
        currentPassword: '' // Reset obrigatório não precisa de senha atual
      };

      const resp = await fetch(url, {
        method: 'PUT',
        headers: {
          ...this.legacy.authHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        let errorMsg = `Status ${resp.status}: ${resp.statusText}`;
        try {
          const ct = resp.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const errBody = await resp.json();
            errorMsg = errBody.message || errBody.error || errorMsg;
          }
        } catch (_) {}
        throw new Error(errorMsg);
      }

      const data = await resp.json();
      this.ui.showToast('Senha definida com sucesso!', 'success');
      
      // Redirecionar para dashboard
      this.router.navigate(['/dashboard']);
    } catch (err: any) {
      const msg = err?.message || 'Erro ao definir nova senha';
      this.ui.showToast(msg, 'error', 6000);
    } finally {
      this.submitting = false;
    }
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
