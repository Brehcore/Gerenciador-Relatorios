import { Component, ElementRef, OnInit, inject } from '@angular/core';
import { CommonModule, NgIf, NgForOf } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UiService } from '../../../services/ui.service';
import { ReportService } from '../../../services/report.service';
import { LegacyService } from '../../../services/legacy.service';
import { PasswordResetService } from '../../../services/password-reset.service';
import { SafeUrlPipe } from '../../../pipes/safe-url.pipe';

@Component({
  standalone: true,
  selector: 'app-group',
  imports: [CommonModule, NgIf, NgForOf, SafeUrlPipe, FormsModule],
  templateUrl: './group.component.html',
  styleUrls: ['./group.component.css']
})
export class GroupComponent implements OnInit {
  history: any[] = [];
  loading = true;
  // próximos eventos/visitas (agenda)
  upcomingEventsAll: any[] = [];
  loadingUpcoming = false;
  upcomingPageIndex = 0;
  upcomingPageSize = 5; // mostrar 5 por página
  // Modal para visualizar PDFs
  pdfModalOpen = false;
  pdfBlobUrl: string | null = null;
  // item atualmente aberto no modal de PDF (para ações como download)
  pdfModalItem: any = null;
  // Perfil do usuário logado
  userProfile: any = null;
  isUserAdmin = false;

  // Password reset modal
  showResetPasswordModal = false;
  resetPasswordForm = {
    newPassword: '',
    confirmPassword: ''
  };
  resetPasswordLoading = false;
  resetPasswordError = '';

  private ui = inject(UiService);
  private report = inject(ReportService);
  private legacy = inject(LegacyService);
  private passwordResetService = inject(PasswordResetService);
  constructor(private el: ElementRef, private router: Router) {}

  ngOnInit(): void {
    // Não injetamos estilos legacy automaticamente — a UI foi migrada.
    
    // Verificar se precisa resetar senha
    this.passwordResetService.passwordResetRequired$.subscribe((required) => {
      this.showResetPasswordModal = required;
    });
    
    // Carregar perfil do usuário
    this.loadUserProfile();
    // Carregar histórico com pequeno delay para garantir que o token foi salvo
    setTimeout(() => {
      try { this.loadHistory(); } catch (e) { console.warn('loadHistory init failed', e); }
    }, 100);
    // carregar próximos eventos da agenda (somente para usuários não-admin)
    setTimeout(() => {
      try { 
        const role = (this.userProfile?.role || '').toUpperCase();
        // Não carregar eventos se for ADMIN ou ROLE_ADMIN
        if (role !== 'ADMIN' && role !== 'ROLE_ADMIN') {
          this.loadUpcomingEvents();
        }
      } catch (e) { console.warn('loadUpcomingEvents init failed', e); }
    }, 120);
  }

  async loadUserProfile() {
    try {
      this.userProfile = await this.legacy.fetchUserProfile();
      // Verificar se é admin (aceita ambos os formatos)
      const role = (this.userProfile?.role || '').toUpperCase();
      this.isUserAdmin = role === 'ADMIN' || role === 'ROLE_ADMIN';
    } catch (e) {
      console.warn('loadUserProfile error', e);
    }
  }

  async loadHistory(limit = 10) {
    this.loading = true;
    this.history = [];
    try {
      const data = await this.report.fetchLatestDocuments();
      const items = Array.isArray(data) ? data : (data ? [data] : []);
      this.history = items.slice(0, limit);
      console.log('[GroupComponent] Histórico carregado:', this.history.length, 'itens');
    } catch (e: any) {
      console.warn('loadHistory error', e);
      // Se houver erro, tentar log do status se disponível
      if (e.status !== undefined) {
        console.warn(`Status: ${e.status}, StatusText: ${e.statusText}, URL: ${e.url}`);
      }
      this.history = [];
    } finally {
      this.loading = false;
    }
  }

  // Carrega eventos da agenda e filtra apenas os futuros/pendentes
  async loadUpcomingEvents(limit = 5) {
    this.loadingUpcoming = true;
    this.upcomingEventsAll = [];
    try {
      const data = await this.report.fetchAgendaEvents();
      const items = Array.isArray(data) ? data : (data ? [data] : []);
      const normalized = items.map((it: any, idx: number) => ({
        id: it.id || it._id || idx + 1,
        title: it.title || it.titulo || '',
        description: it.description || it.descricao || '',
        date: (it.eventDate || it.date || it.event_date || '').slice(0,10),
        type: it.type || it.tipo || '',
        unitName: it.unitName || it.unidade || it.unit_name || null,
        sectorName: it.sectorName || it.sector_name || it.setor || null
      }));

      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

      // filtrar eventos cuja data >= hoje
      const future = normalized.filter(e => (e.date || '') >= todayStr);

      // ordenar por data asc
      future.sort((a,b) => (a.date || '').localeCompare(b.date || ''));

      // armazenar apenas os 5 primeiros eventos
      this.upcomingEventsAll = future.slice(0, limit);
      this.upcomingPageIndex = 0;
      this.upcomingPageSize = limit;
    } catch (err) {
      console.warn('[GroupComponent] Falha ao carregar eventos da agenda', err);
      this.upcomingEventsAll = [];
    } finally {
      this.loadingUpcoming = false;
    }
  }

  // retorna página atual de eventos
  get pagedUpcoming() {
    const start = this.upcomingPageIndex * this.upcomingPageSize;
    return this.upcomingEventsAll.slice(start, start + this.upcomingPageSize);
  }

  prevUpcomingPage() {
    if (this.upcomingPageIndex > 0) this.upcomingPageIndex -= 1;
  }

  nextUpcomingPage() {
    const maxIndex = Math.max(0, Math.ceil(this.upcomingEventsAll.length / this.upcomingPageSize) - 1);
    if (this.upcomingPageIndex < maxIndex) this.upcomingPageIndex += 1;
  }

  get upcomingPageStart() {
    return this.upcomingPageIndex * this.upcomingPageSize + 1;
  }

  get upcomingPageEnd() {
    return Math.min((this.upcomingPageIndex + 1) * this.upcomingPageSize, this.upcomingEventsAll.length);
  }

  get upcomingMaxPageIndex() {
    return Math.max(0, Math.ceil(this.upcomingEventsAll.length / this.upcomingPageSize) - 1);
  }

  formatDocumentType(type: any) {
    if (!type) return 'Documento';
    const t = String(type).toUpperCase();
    if (t.includes('CHECKLIST') || t.includes('INSPECAO') || t.includes('INSPEÇÃO')) return 'Check-List de Inspeção de Segurança';
    if (t.includes('RELATORIO') || t.includes('VISITA')) return 'Relatório de Visita Técnica';
    if (t.includes('AEP')) return 'Avaliação Ergônomica Preliminar (AEP)';
    return String(type);
  }

  formatDateToBrazil(dateStr: any) {
    if (!dateStr) return '';
    try {
      const s = String(dateStr).trim();
      const match = s.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (match) { const [, y, m, d] = match; return `${d}/${m}/${y}`; }
      const dt = new Date(s);
      if (!isNaN(dt.getTime())) {
        const dd = String(dt.getDate()).padStart(2,'0');
        const mm = String(dt.getMonth()+1).padStart(2,'0');
        const yy = dt.getFullYear();
        return `${dd}/${mm}/${yy}`;
      }
      return s;
    } catch (_) { return String(dateStr); }
  }

  async downloadDoc(item: any) {
    try {
      const typeSlug = this.documentTypeToSlug(item.type || item.documentType || '');
      const id = item.id || item.reportId;
      if (!id) return;
      const resp = await fetch(`${this.legacy.apiBaseUrl}/documents/${encodeURIComponent(typeSlug)}/${encodeURIComponent(id)}/pdf`, { headers: this.legacy.authHeaders() });
      if (!resp.ok) throw new Error('Falha ao baixar PDF');
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Construir nome do arquivo: Tipo - Nome - Empresa - Data
      const docType = item.type || item.documentType || 'Documento';
      const docTitle = item.title || 'documento';
      const clientName = item.clientName || item.companyName || 'empresa';
      const dateStr = (item.creationDate || item.date || '').substring(0, 10); // YYYY-MM-DD
      const fileName = `${docType} - ${docTitle} - ${clientName} - ${dateStr}.pdf`;
      a.download = fileName;
      
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      this.ui.showToast('Download iniciado.', 'success');
    } catch (e: any) {
      console.warn('downloadDoc failed', e);
      this.ui.showToast(e?.message || 'Não foi possível obter PDF do documento.', 'error');
    }
  }

  async viewDoc(item: any) {
    try {
      const typeSlug = this.documentTypeToSlug(item.type || item.documentType || '');
      const id = item.id || item.reportId;
      if (!id) return;
      const resp = await fetch(`${this.legacy.apiBaseUrl}/documents/${encodeURIComponent(typeSlug)}/${encodeURIComponent(id)}/pdf`, { headers: this.legacy.authHeaders() });
      if (!resp.ok) throw new Error('Falha ao obter PDF');
      const blob = await resp.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      // Abrir o PDF em modal na mesma página (iframe no componente)
      this.pdfBlobUrl = blobUrl;
      this.pdfModalItem = item;
      this.pdfModalOpen = true;
      // Revogar URL após algum tempo para liberar memória
      setTimeout(() => {
        try { window.URL.revokeObjectURL(blobUrl); } catch(_) {}
      }, 5000);
    } catch (e: any) {
      console.warn('viewDoc failed', e);
      this.ui.showToast(e?.message || 'Não foi possível carregar PDF para visualização.', 'error');
    }
  }

  closePdfModal() {
    try {
      if (this.pdfBlobUrl) {
        window.URL.revokeObjectURL(this.pdfBlobUrl);
      }
    } catch (_) {}
    this.pdfBlobUrl = null;
    this.pdfModalItem = null;
    this.pdfModalOpen = false;
  }

  openPdfInNewTab(): void {
    try {
      if (!this.pdfBlobUrl) return;
      window.open(this.pdfBlobUrl, '_blank');
    } catch (e) {
      console.warn('openPdfInNewTab failed', e);
    }
  }

  documentTypeToSlug(type: string): string {
    if (!type) return 'document';
    const raw = String(type || '');
    const normalized = raw.normalize ? raw.normalize('NFD').replace(/\p{Diacritic}/gu, '') : raw;
    const up = normalized.toUpperCase();
    if (up.includes('RISK') || up.includes('RISCO')) return 'risk';
    if (up.includes('CHECKLIST') || up.includes('INSPECAO') || up.includes('INSPEÇÃO') || up.includes('INSPECC')) return 'checklist';
    if (up.includes('RELATORIO') || up.includes('RELAT') || (up.includes('VISITA') && up.includes('RELAT'))) return 'visit';
    if (up.includes('VISITA') && !up.includes('CHECK')) return 'visit';
  // Reconhecer a frase 'Avaliação Ergonômica Preliminar' (com ou sem acentos)
  if (up.includes('AVALIACAO') && up.includes('ERGONOMICA')) return 'aep';
  if (up.includes('AEP')) return 'aep';
    switch (up) {
      case 'CHECKLIST_INSPECAO': return 'checklist';
      case 'RELATORIO_VISITA': return 'visit';
      case 'AEP': return 'aep';
    }
    const slug = String(type).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return slug || 'document';
  }

  go(route: string) {
    try { this.router.navigate([route]); } catch (_) { window.location.href = '/' + route; }
  }

  async submitResetPassword() {
    // Validar senhas
    if (!this.resetPasswordForm.newPassword || !this.resetPasswordForm.confirmPassword) {
      this.resetPasswordError = 'Nova senha e confirmação são obrigatórias';
      return;
    }

    if (this.resetPasswordForm.newPassword.length < 8) {
      this.resetPasswordError = 'A senha deve ter no mínimo 8 caracteres';
      return;
    }

    if (this.resetPasswordForm.newPassword !== this.resetPasswordForm.confirmPassword) {
      this.resetPasswordError = 'As senhas não correspondem';
      return;
    }

    this.resetPasswordLoading = true;
    this.resetPasswordError = '';

    try {
      // Usar o token JWT que foi obtido no login
      const token = localStorage.getItem('jwtToken');
      if (!token) {
        throw new Error('Token não encontrado. Por favor, faça login novamente.');
      }

      // Fazer requisição PUT para /users/me/change-password
      const response = await fetch(`${this.legacy.apiBaseUrl}/users/me/change-password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          newPassword: this.resetPasswordForm.newPassword
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Erro ao alterar senha (status ${response.status})`);
      }

      this.ui.showToast('Senha alterada com sucesso!', 'success');
      
      // Limpar modal e formulário
      this.showResetPasswordModal = false;
      this.passwordResetService.setPasswordResetRequired(false);
      this.resetPasswordForm = { newPassword: '', confirmPassword: '' };

      // Usuário pode agora navegar normalmente
    } catch (error: any) {
      this.resetPasswordError = error?.message || 'Erro ao alterar a senha. Tente novamente.';
      this.ui.showToast(this.resetPasswordError, 'error');
    } finally {
      this.resetPasswordLoading = false;
    }
  }
}

