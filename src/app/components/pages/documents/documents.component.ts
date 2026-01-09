import { Component, ElementRef, OnInit, OnDestroy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LegacyService } from '../../../services/legacy.service';
import { UiService } from '../../../services/ui.service';
import { ReportService } from '../../../services/report.service';
import { DocumentService } from '../../../services/document.service';
import { ClientService } from '../../../services/client.service';
import { SafeUrlPipe } from '../../../pipes/safe-url.pipe';
import localforage from 'localforage';

@Component({
  standalone: true,
  selector: 'app-documents',
  imports: [CommonModule, FormsModule, SafeUrlPipe],
  templateUrl: './documents.component.html',
  styleUrls: ['./documents.component.css']
})
export class DocumentsComponent implements OnInit, OnDestroy {
  private legacy = inject(LegacyService);
  private ui = inject(UiService);
  private reportService = inject(ReportService);
  private documentService = inject(DocumentService);
  private clientService = inject(ClientService);

  // Filtros (novo formato: type, clientName, startDate, endDate)
  filters = {
    type: '',
    clientName: '',
    startDate: '',
    endDate: ''
  };

  // Paginação
  currentPage = 0;
  itemsPerPage = 10;
  totalElements = 0;
  totalPages = 0;
  documents: any[] = [];
  pageNumbers: number[] = [];

  // PDF Modal
  pdfModalOpen = false;
  pdfBlobUrl: string | null = null;

  // Email State
  emailSendingFor: string = '';  // ID do documento sendo enviado (para mostrar loading)

  // Drafts salvos offline
  offlineDrafts: any[] = [];

  private outsideClickHandler = (ev: Event) => {
    // listener para fechar popup quando clicar fora (não mais necessário com icons inline)
  };

  constructor(private el: ElementRef, private router: Router) {}

  async ngOnInit(): Promise<void> {
    await this.loadDocumentsList();
    // Carregar e exibir drafts offline após carregar documentos do servidor
    try {
      await this.loadOfflineDrafts();
    } catch (e) {
      console.warn('[Documents] Erro ao carregar drafts offline:', e);
    }
  }

  ngOnDestroy(): void {
    this.closePdfModal();
    try { document.removeEventListener('click', this.outsideClickHandler); } catch(_: any) {}
  }

  formatDocumentType(type: any) {
    if (!type) return 'Documento';
    const t = String(type).toUpperCase();
    if (t.includes('CHECKLIST') || t.includes('INSPECAO') || t.includes('INSPEÇÃO')) return 'Check-List';
    if (t.includes('RELATORIO') || t.includes('VISITA')) return 'Relatório';
    if (t.includes('AEP')) return 'AEP';
    return String(type);
  }

  formatDate(d: any) {
    if (!d) return '';
    try {
      const s = String(d).substring(0,10);
      if (!s) return '';
      const parts = s.split('-'); if (parts.length>=3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return s;
    } catch(_) { return String(d); }
  }

  async loadDocumentsList() {
    try {
      const params = new URLSearchParams();
      
      // Filtro por tipo (visit, aep, risk)
      if (this.filters.type && this.filters.type !== '') {
        params.set('type', this.filters.type);
      }
      
      // Filtro por cliente
      if (this.filters.clientName && this.filters.clientName.trim()) {
        params.set('clientName', this.filters.clientName.trim());
      }
      
      // Filtro por data inicial
      if (this.filters.startDate && this.filters.startDate.trim()) {
        params.set('startDate', this.filters.startDate);
      }
      
      // Filtro por data final
      if (this.filters.endDate && this.filters.endDate.trim()) {
        params.set('endDate', this.filters.endDate);
      }
      
      // Paginação
      params.set('page', String(this.currentPage));
      params.set('size', String(this.itemsPerPage));
      
      const url = `${this.legacy.apiBaseUrl}/documents${params.toString() ? ('?' + params.toString()) : ''}`;
      console.log('[Documents] Loading with URL:', url);
      
      const resp = await fetch(url, { headers: this.legacy.authHeaders() });
      if (resp.ok) {
        const pageData = await resp.json();
        console.log('[Documents] Received page:', pageData);
        
        // Resposta do novo backend (Page<DocumentSummaryDTO>)
        this.documents = pageData.content || [];
        this.totalElements = pageData.totalElements || 0;
        this.totalPages = pageData.totalPages || 0;
        
        // Enriquecer documentos com e-mail de cliente (se não tiver)
        await this.enrichDocumentsWithClientEmail();
        
        // Calcular números das páginas para exibição (ex: 1, 2, 3, 4, 5)
        this.updatePageNumbers();
        return;
      }
    } catch (e: any) {
      console.warn('fetch documents failed', e && e.message);
      this.ui.showToast('Erro ao carregar documentos', 'error');
    }
    
    this.documents = [];
    this.totalElements = 0;
    this.totalPages = 0;
  }

  // Novo: Carregar drafts offline (Passo B)
  private async loadOfflineDrafts(): Promise<void> {
    try {
      const draftsList = (await localforage.getItem('reportDrafts')) as any[] || [];
      // Transformar drafts em formato compatível com a tabela de documentos
      this.offlineDrafts = draftsList.map((draft, idx) => ({
        id: draft.id,
        isOfflineDraft: true,
        draftId: draft.id,
        title: draft.data?.title || `Rascunho #${idx + 1}`,
        companyName: draft.data?.clientCompanyId || 'Empresa não informada',
        creationDate: draft.createdAt,
        status: 'DRAFT',
        documentType: 'Rascunho Pendente',
        data: draft.data // Dados completos do formulário
      }));

      // Mesclar drafts com documentos no início da lista
      this.documents = [...this.offlineDrafts, ...this.documents];
      this.totalElements += this.offlineDrafts.length;

      if (this.offlineDrafts.length > 0) {
        this.ui.showToast(`${this.offlineDrafts.length} rascunho(s) pendente(s) encontrado(s).`, 'info', 3000);
        console.log('[Documents] Drafts offline carregados:', this.offlineDrafts);
      }
    } catch (e) {
      console.error('[Documents] Erro ao carregar drafts offline:', e);
    }
  }

  private updatePageNumbers(): void {
    const maxButtons = 5;
    const pages: number[] = [];
    
    if (this.totalPages <= maxButtons) {
      for (let i = 0; i < this.totalPages; i++) {
        pages.push(i);
      }
    } else {
      let startPage = Math.max(0, this.currentPage - 2);
      let endPage = Math.min(this.totalPages - 1, startPage + maxButtons - 1);
      
      if (endPage - startPage < maxButtons - 1) {
        startPage = Math.max(0, endPage - maxButtons + 1);
      }
      
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
    }
    
    this.pageNumbers = pages;
  }

  /**
   * Enriquece documentos com e-mail de cliente se não tiverem
   * Busca clientes pela empresa do documento
   */
  private async enrichDocumentsWithClientEmail(): Promise<void> {
    try {
      // Buscar todos os clientes (sem paginação para cache)
      const response = await this.clientService.getAll(0, 999);
      const clients = response.content || [];
      
      // Para cada documento, tentar associar o e-mail do cliente da empresa
      for (const doc of this.documents) {
        // Se já tem e-mail, pular
        if (doc.clientEmail) continue;
        
        // Se tem companyId, procurar cliente dessa empresa
        if (doc.companyId) {
          const client = clients.find((c: any) => 
            c.companyIds && c.companyIds.includes(doc.companyId)
          );
          
          if (client && client.email) {
            doc.clientEmail = client.email;
            console.log(`[Documents] 📧 E-mail encontrado para doc ${doc.id}: ${client.email}`);
          }
        }
      }
    } catch (err) {
      console.warn('[Documents] ⚠️ Erro ao enriquecer documentos com e-mail:', err);
      // Continuar mesmo com erro - não é crítico
    }
  }

  goToPage(page: number): void {
    if (page >= 0 && page < this.totalPages) {
      this.currentPage = page;
      this.loadDocumentsList();
    }
  }

  goToPreviousPage(): void {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.loadDocumentsList();
    }
  }

  goToNextPage(): void {
    if (this.currentPage < this.totalPages - 1) {
      this.currentPage++;
      this.loadDocumentsList();
    }
  }

  changeItemsPerPage(count: number): void {
    this.itemsPerPage = count;
    this.currentPage = 0;
    this.loadDocumentsList();
  }

  resetFilters(): void {
    this.filters = { type: '', clientName: '', startDate: '', endDate: '' };
    this.currentPage = 0;
    this.loadDocumentsList();
  }

  async downloadDocument(d:any) {
    // Se é um draft offline, não há PDF para baixar
    if (d.isOfflineDraft) {
      this.ui.showToast('Rascunho ainda não foi enviado. Edite-o para completar e enviar.', 'info');
      return;
    }

    try {
      const typeSlug = this.documentTypeToSlug(d.documentType || d.type || '');
      const id = d.id || d.reportId || '';
      if (!id) throw new Error('ID ausente');
      const resp = await fetch(`${this.legacy.apiBaseUrl}/documents/${encodeURIComponent(typeSlug)}/${encodeURIComponent(id)}/pdf`, { headers: this.legacy.authHeaders() });
      if (!resp.ok) throw new Error('Falha ao baixar PDF');
      const ct = (resp.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('pdf')) throw new Error('Resposta não é PDF');
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Construir nome do arquivo: Tipo - Nome - Empresa - Data
      const docType = d.documentType || d.type || 'Documento';
      const docTitle = d.title || 'documento';
      const clientName = d.clientName || 'empresa';
      const dateStr = (d.creationDate || '').substring(0, 10); // YYYY-MM-DD
      const fileName = `${docType} - ${docTitle} - ${clientName} - ${dateStr}.pdf`;
      a.download = fileName;
      
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      this.ui.showToast('Download iniciado.', 'success');
      return;
    } catch (err:any) { console.warn('download failed', err); this.ui.showToast(err?.message || 'Não foi possível obter PDF do documento.', 'error'); }
  }

  async viewDocument(d:any) {
    // Se é um draft offline, não há PDF para visualizar
    if (d.isOfflineDraft) {
      this.ui.showToast('Rascunho ainda não foi enviado. Edite-o para completar e enviar.', 'info');
      return;
    }

    try {
      const typeSlug = this.documentTypeToSlug(d.documentType || d.type || '');
      const id = d.id || d.reportId || '';
      if (!id) throw new Error('ID ausente');
      const resp = await fetch(`${this.legacy.apiBaseUrl}/documents/${encodeURIComponent(typeSlug)}/${encodeURIComponent(id)}/pdf`, { headers: this.legacy.authHeaders() });
      if (!resp || !resp.ok) throw new Error('Erro ao obter PDF');
      const ct = (resp.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('pdf')) throw new Error('Servidor não retornou PDF');
      const blob = await resp.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      this.pdfBlobUrl = blobUrl;
      this.pdfModalOpen = true;
      setTimeout(() => {
        try { window.URL.revokeObjectURL(blobUrl); } catch(_) {}
      }, 5000);
      return;
    } catch (err:any) { console.error('view failed', err); this.ui.showToast(err?.message || 'Não foi possível carregar PDF para visualização.', 'error'); }
  }

  closePdfModal(): void {
    try {
      if (this.pdfBlobUrl) {
        window.URL.revokeObjectURL(this.pdfBlobUrl);
      }
    } catch (_) {}
    this.pdfBlobUrl = null;
    this.pdfModalOpen = false;
  }

  async deleteDocument(d:any) {
    try {
      const confirm = window.confirm('Confirma exclusão do documento?');
      if (!confirm) return;
      
  const typeSlug = this.documentTypeToSlug(d.documentType || d.type || '');
      const id = d.id || d.reportId || '';
      
      if (!id) {
        // remove local draft
        const all = JSON.parse(localStorage.getItem('savedInspectionReports') || '[]');
        const filtered = all.filter((x:any)=> String(x.id||x.reportId||'') !== String(id));
        localStorage.setItem('savedInspectionReports', JSON.stringify(filtered));
        this.loadDocumentsList();
        return;
      }
      
      // DELETE /documents/{type}/{id}
      const resp = await fetch(`${this.legacy.apiBaseUrl}/documents/${encodeURIComponent(typeSlug)}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: this.legacy.authHeaders() });
      if (!resp.ok) throw new Error('Falha ao excluir documento');
      this.ui.showToast('Documento excluído.', 'success');
      this.loadDocumentsList();
    } catch (err:any) { this.ui.showToast(err?.message || 'Erro ao excluir documento', 'error'); }
  }

  editDocument(d:any) {
    try {
      // Se é um draft offline, redirecionar com parâmetro de retomada (Passo C)
      if (d.isOfflineDraft) {
        console.log('[Documents] Abrindo draft offline:', d.draftId);
        this.router.navigate(['/report'], { queryParams: { resumeDraft: d.draftId } });
        return;
      }

      const id = d.id || d.reportId || '';
      if (!id) { this.ui.showToast('Documento não possui ID para edição', 'error'); return; }
      // Check if document is signed (immutable)
      if (this.isDocumentSigned(d)) {
        this.ui.showToast('Não é possível editar documentos assinados e finalizados.', 'warning');
        return;
      }
      const typeSlug = this.documentTypeToSlug(d.documentType || d.type || '');
      
      // Route to appropriate editor based on document type
      if (typeSlug === 'checklist' || typeSlug === 'risk') {
        this.router.navigate(['/checklist/edit', id]);
      } else if (typeSlug === 'aep') {
        // salvar rascunho temporário para acelerar o preenchimento no AEP
        try { localStorage.setItem('aepDraft', JSON.stringify(d)); } catch(_) {}
        // navegar para a rota AEP com query param id
        this.router.navigate(['/aep'], { queryParams: { id } });
      } else {
        this.ui.showToast('Tipo de documento não suporta edição', 'info');
      }
    } catch (err:any) { this.ui.showToast(err?.message || 'Não foi possível iniciar edição', 'error'); }
  }

  /**
   * Verifica o status de envio de e-mail do documento
   * @param doc - Documento a verificar
   * @returns true se já foi enviado, false caso contrário
   */
  hasEmailBeenSent(doc: any): boolean {
    return doc && typeof doc.emailSent === 'boolean' ? doc.emailSent : false;
  }

  /**
   * Verifica se o documento tem um cliente com e-mail vinculado
   * @param doc - Documento a verificar
   * @returns true se tem e-mail, false caso contrário
   */
  hasClientEmail(doc: any): boolean {
    return doc && typeof doc.clientEmail === 'string' && (doc.clientEmail?.trim()?.length ?? 0) > 0;
  }

  /**
   * Obtém a cor do ícone de e-mail baseado no estado de envio
   */
  getEmailIconColor(doc: any): string {
    if (!this.hasClientEmail(doc)) {
      return 'disabled';  // Cinza/desabilitado
    }
    return this.hasEmailBeenSent(doc) ? 'sent' : 'unsent';  // Verde ou Vermelho
  }

  /**
   * Obtém o título (tooltip) do botão de e-mail
   */
  getEmailButtonTitle(doc: any): string {
    if (!this.hasClientEmail(doc)) {
      return 'Empresa sem cliente vinculado';
    }
    return this.hasEmailBeenSent(doc) ? 'Enviar novamente' : 'Enviar por e-mail';
  }

  /**
   * Manipula o clique no botão de e-mail
   */
  async onEmailButtonClick(doc: any): Promise<void> {
    // 1. Bloqueio de Segurança: Se não tem e-mail, não fazer nada
    if (!this.hasClientEmail(doc)) {
      this.ui.showToast('Esta empresa não possui cliente/e-mail vinculado.', 'warning');
      return;
    }

    // 2. Se já foi enviado, pedir confirmação
    if (this.hasEmailBeenSent(doc)) {
      const confirmed = confirm(`Este documento já foi enviado para ${doc.clientEmail}. Deseja enviar novamente?`);
      if (!confirmed) return;
    }

    // 3. Processar envio
    await this.processarEnvioEmail(doc);
  }

  /**
   * Processa o envio de e-mail do documento
   */
  private async processarEnvioEmail(doc: any): Promise<void> {
    const docId = doc.id || doc.reportId || '';
    const documentType = doc.documentType || doc.type || '';
    
    if (!docId || !documentType) {
      this.ui.showToast('Dados do documento incompletos', 'error');
      return;
    }

    try {
      // Marcar como enviando
      this.emailSendingFor = String(docId);

      // Converter nome do documento para tag da API
      const typeTag = this.documentService.getDocTypeTag(documentType);

      if (!typeTag) {
        throw new Error(`Tipo de documento desconhecido: ${documentType}`);
      }

      console.log(`[Documents] 📧 Enviando e-mail para documento ${docId} (tipo: ${typeTag})`);

      // Chamar o novo service
      await this.documentService.sendEmail(typeTag, docId);

      // Atualizar o estado do documento
      doc.emailSent = true;

      console.log(`[Documents] ✅ E-mail enviado com sucesso`);
      this.ui.showToast('E-mail enviado com sucesso!', 'success');
    } catch (err: any) {
      console.error(`[Documents] ❌ Erro ao enviar e-mail:`, err);
      this.ui.showToast(err?.message || 'Erro ao enviar e-mail. Tente novamente.', 'error');
    } finally {
      // Limpar estado de envio
      this.emailSendingFor = '';
    }
  }

  // Helper: Check if a document is signed and therefore immutable
  isDocumentSigned(item: any): boolean {
    return item && typeof item.signed === 'boolean' ? item.signed : false;
  }

  // Helper: Check if edit is allowed for a document
  canEditDocument(item: any): boolean {
    return !this.isDocumentSigned(item);
  }

  documentTypeToSlug(type: any) {
    if (!type) return 'document';
    const raw = String(type || '');
    const normalized = raw.normalize ? raw.normalize('NFD').replace(/\p{Diacritic}/gu, '') : raw;
    const up = normalized.toUpperCase();
    // Map common full-text document types to canonical slugs
    if (up.includes('RISK') || up.includes('RISCO')) return 'risk';
    if (up.includes('CHECKLIST') || up.includes('INSPECAO') || up.includes('INSPECAO') || up.includes('INSPECC')) return 'checklist';
    if (up.includes('RELATORIO') || up.includes('RELAT') || (up.includes('VISITA') && up.includes('RELAT'))) return 'visit';
    if (up.includes('VISITA') && !up.includes('CHECK')) return 'visit';
    // Recognize full phrase for Avaliação Ergonômica Preliminar (with or without accents)
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

  // Novo: Descartar rascunho offline
  async discardOfflineDraft(draftId: string): Promise<void> {
    const proceed = window.confirm('Tem certeza que deseja descartar este rascunho?');
    if (!proceed) return;

    try {
      const draftsList = (await localforage.getItem('reportDrafts')) as any[] || [];
      const filtered = draftsList.filter(d => d.id !== draftId);
      await localforage.setItem('reportDrafts', filtered);

      // Recarregar lista
      this.documents = this.documents.filter(d => d.draftId !== draftId);
      this.offlineDrafts = this.offlineDrafts.filter(d => d.draftId !== draftId);
      this.totalElements--;

      this.ui.showToast('Rascunho descartado.', 'success', 2000);
    } catch (e) {
      console.error('[Documents] Erro ao descartar draft:', e);
      this.ui.showToast('Erro ao descartar rascunho.', 'error');
    }
  }}