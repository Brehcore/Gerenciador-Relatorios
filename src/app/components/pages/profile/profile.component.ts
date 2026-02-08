import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { LegacyService } from '../../../services/legacy.service';
import { AuthService } from '../../../services/auth.service';
import { UiService } from '../../../services/ui.service';

@Component({
  standalone: true,
  selector: 'app-profile',
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
  private legacy = inject(LegacyService);
  private auth = inject(AuthService);
  private ui = inject(UiService);

  // dados do perfil
  profile: any = null;
  isAdmin = false;
  hasCertificate = false;
  certificateValidity: string | null = null;

  // Mudança de senha
  showChangePasswordModal = false;
  newPassword = '';
  confirmPassword = '';
  currentPasswordForPassword = '';
  changePasswordSubmitting = false;

  // Mudança de email
  showChangeEmailModal = false;
  newEmail = '';
  confirmEmail = '';
  currentPassword = '';
  changeEmailSubmitting = false;

  async ngOnInit(): Promise<void> {
    this.profile = await this.legacy.fetchUserProfile().catch(()=>null) || {};
    // Verificar se é admin (aceita ambos os formatos)
    const role = (this.profile?.role || '').toUpperCase();
    this.isAdmin = role === 'ADMIN' || role === 'ROLE_ADMIN';
    // Load certificate info
    this.hasCertificate = !!this.profile?.hasCertificate;
    this.certificateValidity = this.profile?.certificateValidity || null;
  }

  initials(): string {
    if (!this.profile) return '';
    if (this.profile.initials) return this.profile.initials;
    const name = this.profile.name || '';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].slice(0,2).toUpperCase();
    return (parts[0][0] + (parts[1][0] || '')).toUpperCase();
  }

  formatDate(d: string|undefined|null): string {
    if (!d) return '-';
    try {
      // Tenta converter diferentes formatos: YYYY-MM-DD, DD/MM/YYYY, etc
      let dateStr = d.trim();
      
      // Se contém apenas números e caracteres de separação
      if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        // Formato ISO: YYYY-MM-DD
        const [year, month, day] = dateStr.split('-');
        return `${day}/${month}/${year}`;
      } else if (/^\d{2}\/\d{2}\/\d{4}/.test(dateStr)) {
        // Já está em DD/MM/YYYY
        return dateStr;
      } else {
        // Tenta como Date object
        const dt = new Date(dateStr);
        if (isNaN(dt.getTime())) {
          return dateStr;
        }
        // Formata como DD/MM/YYYY
        const day = String(dt.getDate()).padStart(2, '0');
        const month = String(dt.getMonth() + 1).padStart(2, '0');
        const year = dt.getFullYear();
        return `${day}/${month}/${year}`;
      }
    } catch {
      return d as string;
    }
  }

  openChangePasswordModal() {
    this.newPassword = '';
    this.confirmPassword = '';
    this.currentPasswordForPassword = '';
    this.showChangePasswordModal = true;
  }

  closeChangePasswordModal() {
    this.showChangePasswordModal = false;
    this.newPassword = '';
    this.confirmPassword = '';
    this.currentPasswordForPassword = '';
  }

  openChangeEmailModal() {
    this.newEmail = '';
    this.confirmEmail = '';
    this.currentPassword = '';
    this.showChangeEmailModal = true;
  }

  closeChangeEmailModal() {
    this.showChangeEmailModal = false;
    this.newEmail = '';
    this.confirmEmail = '';
    this.currentPassword = '';
  }

  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async submitChangePassword() {
    // Validações
    if (!this.newPassword || !this.confirmPassword || !this.currentPasswordForPassword) {
      this.ui.showToast('Preencha todos os campos', 'warning');
      return;
    }

    if (this.newPassword.length < 8) {
      this.ui.showToast('A nova senha deve ter no mínimo 8 caracteres', 'warning');
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.ui.showToast('As senhas não conferem', 'warning');
      return;
    }

    this.changePasswordSubmitting = true;
    try {
      const url = `${this.legacy.apiBaseUrl}/users/me/change-password`;
      const payload = {
        newPassword: this.newPassword,
        currentPassword: this.currentPasswordForPassword
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
      this.ui.showToast('Senha alterada com sucesso!', 'success');
      this.closeChangePasswordModal();
    } catch (err: any) {
      const msg = err?.message || 'Erro ao alterar senha';
      this.ui.showToast(msg, 'error', 6000);
    } finally {
      this.changePasswordSubmitting = false;
    }
  }

  async submitChangeEmail() {
    // Validações
    if (!this.newEmail || !this.confirmEmail || !this.currentPassword) {
      this.ui.showToast('Preencha todos os campos', 'warning');
      return;
    }

    if (!this.isValidEmail(this.newEmail)) {
      this.ui.showToast('E-mail inválido', 'warning');
      return;
    }

    if (this.newEmail !== this.confirmEmail) {
      this.ui.showToast('Os e-mails não conferem', 'warning');
      return;
    }

    if (this.currentPassword.length < 1) {
      this.ui.showToast('Digite sua senha atual', 'warning');
      return;
    }

    this.changeEmailSubmitting = true;
    try {
      const url = `${this.legacy.apiBaseUrl}/users/me/change-email`;
      const payload = {
        newEmail: this.newEmail,
        currentPassword: this.currentPassword
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
      this.ui.showToast('E-mail alterado com sucesso!', 'success');
      // Atualizar perfil local
      if (this.profile) {
        this.profile.email = this.newEmail;
      }
      this.closeChangeEmailModal();
    } catch (err: any) {
      const msg = err?.message || 'Erro ao alterar e-mail';
      this.ui.showToast(msg, 'error', 6000);
    } finally {
      this.changeEmailSubmitting = false;
    }
  }
}