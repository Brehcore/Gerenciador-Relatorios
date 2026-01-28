import { Component, OnInit, OnDestroy, inject, ElementRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AvailabilityCalendarComponent } from '../../shared/availability-calendar/availability-calendar.component';
import { LegacyService } from '../../../services/legacy.service';
import { formatCNPJ } from '../../../utils/formatters';
import { CnpjFormatPipe } from '../../../pipes/cnpj-format.pipe';
import { UiService } from '../../../services/ui.service';
import { ReportService } from '../../../services/report.service';
import { SignatureService } from '../../../services/signature.service';
import { AgendaValidationService } from '../../../services/agenda-validation.service';
import { TechnicalVisitService } from '../../../services/technical-visit.service';
import { ShiftAvailabilityService } from '../../../services/shift-availability.service';
import { SignatureModalComponent } from '../../shared/signature-modal/signature-modal.component';
import { KonvaEditorComponent } from '../../shared/konva-editor/konva-editor.component';
import localforage from 'localforage';

interface ReportRecord {
  id?: string;
  description: string;
  consequences: string;
  legal: string;
  penalties: string;
  responsible: string;
  priority: 'Alta' | 'Media' | 'Baixa';
  deadline: string;
  unchanged: 'Sim' | 'Não';
  photos: Array<string>; // base64 data URLs
}

@Component({
  standalone: true,
  selector: 'app-report',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDatepickerModule, MatInputModule, MatNativeDateModule, MatButtonModule, MatIconModule, AvailabilityCalendarComponent, SignatureModalComponent, KonvaEditorComponent, CnpjFormatPipe],
  templateUrl: './report.component.html',
  styleUrls: ['./report.component.css']
})
export class ReportComponent implements OnInit, OnDestroy {
  private legacy = inject(LegacyService);
  private ui = inject(UiService);
  private report = inject(ReportService);
  private signatureService = inject(SignatureService);
  private agendaValidation = inject(AgendaValidationService);
  private technicalVisit = inject(TechnicalVisitService);
  private shiftAvailability = inject(ShiftAvailabilityService);
  private host = inject(ElementRef);
  private router = inject(Router);

  // Formulário reativo usado no template
  private fb = inject(FormBuilder);
  form: FormGroup = this.fb.group({
    empresa: [''],
    dataVisita: [''],
    horaInicial: [''],
    horaFinal: [''],
    nomeColaborador: [''],
    registro: [''],
    proximaVisita: [''],
    turnoProximaVisita: [''],
    observacoes: ['']
  });

  records: Array<ReportRecord> = [];
  companies: Array<any> = [];
  filteredCompanies: Array<any> = [];
  companySearchTerm: string = '';
  showCompanySuggestions: boolean = false;
  selectingCompany: boolean = false; // Flag para prevenir blur durante seleção

  // Character limits for record fields
  recordFieldLimits = {
    description: 2000,
    consequences: 2000,
    legal: 3000,
    penalties: 2000,
    responsible: 255
  };
  private reportDraft: { records: ReportRecord[] } = { records: [] };
  private readonly DRAFT_KEY = 'draftReport';
  private onlineListener: any = null;

  // Propriedades para câmera
  cameraActive = false;
  cameraStream: MediaStream | null = null;
  capturedImageBase64: string | null = null;
  currentRecordIndexForCamera: number | null = null;
  
  // Propriedades para editor Konva
  konvaEditorVisible = false;
  konvaImageToEdit: string | null = null;
  konvaEditTarget: { recordIndex: number; photoIndex: number } | null = null;
  private _konvaSaveResolver: ((value?: unknown) => void) | null = null;
  
  // Propriedades para desenho na foto
  isDrawingMode = false;
  drawingTool: 'circle' | 'rectangle' | 'arrow' | 'pen' | null = null;
  drawingColor = '#ff0000';
  drawingLineWidth = 3;
  isDrawing = false;
  startX = 0;
  startY = 0;
  private canvasContext: CanvasRenderingContext2D | null = null;
  private originalImageBase64: string | null = null;
  
  // Propriedades para recorte de foto
  isCroppingMode = false;
  cropStartX = 0;
  cropStartY = 0;
  cropEndX = 0;
  cropEndY = 0;
  isCropSelecting = false;
  private cropCanvasContext: CanvasRenderingContext2D | null = null;

  // Propriedades para o turno da próxima visita
  selectedNextVisitShift: string = '';
  selectedNextVisitDate: string = '';
  selectedDate: Date | null = null;
  
  // ID da visita técnica (para validação de conflito)
  visitId: number | null = null;

  // Estados de validação de duplicidade
  duplicityCheckPending = false;
  duplicityError: string | null = null;
  isDuplicityBlocked = false;
  
  // Timers para debounce
  private duplicityCheckTimer: any = null;

  // Etapa A: Auto-save em localforage (IndexedDB)
  private autoSaveDraftTimer: any = null;
  private readonly AUTO_SAVE_INTERVAL = 3000; // 3 segundos
  private readonly AUTO_SAVE_KEY = 'reportDraftAuto'; // Auto-save em IndexedDB

  async ngOnInit(): Promise<void> {
    // Etapa 0: Verificar se há rascunho pendente antes de carregar novo
    await this.checkAndPromptPendingDraft();
    
    // Carrega rascunho salvo do localStorage
    this.loadDraftFromStorage();
    
    // Verificar se há parâmetro de retomada de draft offline (Passo D)
    const queryParams = new URLSearchParams(window.location.search);
    const resumeDraftId = queryParams.get('resumeDraft');
    if (resumeDraftId) {
      try {
        await this.loadOfflineDraft(resumeDraftId);
      } catch (e) {
        console.warn('[Report] Erro ao carregar draft offline:', e);
      }
    }
    
    // Carrega a hora atual do fuso horário
    this.loadCurrentTime();
    
    // Carrega empresas do backend
    await this.loadCompanies();

    // Carrega dados do técnico logado (nome, conselho, registro)
    await this.loadLoggedTechnician();

    // Pequeno delay para garantir que o DOM foi completamente renderizado
    // antes de tentar preencher os inputs
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Tenta preencher novamente (retry) em caso de inputs não encontrados na primeira vez
    await this.loadLoggedTechnician();

    // Conecta botões do modal de assinaturas aos métodos do componente
    this.wireSignatureModalButtons();
    
    // Tenta reenviar rascunhos pendentes quando carregado
    try {
      const result = await this.report.retryPendingDrafts();
      if (result && (result.success > 0 || result.failed > 0)) {
        const messages = [];
        if (result.success > 0) messages.push(`${result.success} rascunho(s) reenviado(s) com sucesso`);
        if (result.failed > 0) messages.push(`${result.failed} rascunho(s) ainda pendente(s)`);
        
        if (messages.length > 0) {
          const msg = messages.join(', ');
          console.log('[Report] Resultado de reenviamento de rascunhos:', msg);
          if (result.success > 0) {
            this.ui.showToast(`Sucesso! ${msg}`, 'success', 4000);
          }
        }
      }
    } catch(_) {}

    // Registrar listener para reconexão
    this.onlineListener = () => {
      try {
        this.report.retryPendingDrafts().catch(()=>{});
      } catch(_) {}
    };
    window.addEventListener('online', this.onlineListener);

    // Etapa A: Inicializar auto-save em localforage
    this.startAutoSaveDraft();
  }

  private wireSignatureModalButtons(): void {
    try {
      const clearTechBtn = document.getElementById('clearTechSigReport');
      const clearClientBtn = document.getElementById('clearClientSigReport');
      const clearAllBtn = document.getElementById('clearAllSignaturesBtnReport');
      const confirmBtn = document.getElementById('confirmSendReportBtn');
      const cancelBtn = document.getElementById('cancelSendReportBtn');

      if (clearTechBtn) clearTechBtn.addEventListener('click', () => this.clearTechSig());
      if (clearClientBtn) clearClientBtn.addEventListener('click', () => this.clearClientSig());
      if (clearAllBtn) clearAllBtn.addEventListener('click', () => this.clearAllSignatures());
      if (confirmBtn) confirmBtn.addEventListener('click', () => this.handleSendReport());
      if (cancelBtn) cancelBtn.addEventListener('click', () => this.cancelSignatureModal());

      // Botões do modal de assinatura conectados
    } catch (e) {
      // Erro ao conectar botões do modal
    }
  }

  private async loadCompanies(): Promise<void> {
    try {
      const companiesData = await this.report.fetchCompanies();
      if (companiesData && Array.isArray(companiesData)) {
        this.companies = companiesData;
        this.filteredCompanies = [...this.companies];
      }
    } catch (e) {
      // Falha ao carregar empresas
      this.ui.showToast('Falha ao carregar, verifique o servidor e tente novamente.', 'error', 4000);
    }
  }

  private populateCompanyDropdown(): void {
    // Método mantido por compatibilidade, mas agora não faz nada
    // O template cuida de renderizar filteredCompanies via *ngFor
  }

  filterCompanies(): void {
    console.log('[Report] filterCompanies() chamado - term:', this.companySearchTerm, 'companies:', this.companies.length);
    const term = this.companySearchTerm.toLowerCase().trim();
    if (!term) {
      this.filteredCompanies = [...this.companies];
    } else {
      this.filteredCompanies = this.companies.filter((company: any) => {
        const name = (company.name || company.razaoSocial || company.nomeFantasia || '').toLowerCase();
        const cnpj = (company.cnpj || '').toLowerCase();
        return name.includes(term) || cnpj.includes(term);
      });
    }
    // Se há resultados, mostrar as sugestões mesmo se showCompanySuggestions estava false
    if (this.filteredCompanies.length > 0) {
      this.showCompanySuggestions = true;
    }
  }

  onCompanyFocus(): void {
    this.showCompanySuggestions = true;
    // ensure list is populated when focusing
    this.filterCompanies();
  }

  onCompanyBlur(): void {
    // Não fechar as sugestões se estamos selecionando uma empresa
    if (this.selectingCompany) {
      return;
    }
    // delay hiding to allow click on suggestion
    setTimeout(() => { this.showCompanySuggestions = false; }, 180);
  }

  onSearchCompany(event: any): void {
    const input = event.target as HTMLInputElement;
    this.companySearchTerm = input.value;
    this.filterCompanies();
  }

  // Mostrar iniciais (ex: "ACME LTDA" -> "AL")
  getCompanyInitials(name: string): string {
    if (!name) return '';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // Seleciona empresa a partir da lista de sugestões
  selectCompanyFromSuggestion(company: any): void {
    try {
      this.selectingCompany = true; // Impedir que blur feche as sugestões durante seleção
      const selectElement = this.host.nativeElement.querySelector('#empresaCliente') as HTMLSelectElement;
      if (selectElement) {
        const val = company.id || company._id || company.name || '';
        selectElement.value = val;
        // Dispara change event para disparar o fluxo existente
        const evt = new Event('change', { bubbles: true });
        selectElement.dispatchEvent(evt);
        // **IMPORTANTE: Chamar onCompanyChange() diretamente para garantir que o ID seja armazenado**
        this.onCompanyChange(evt as any);
      }
      // Atualiza o input visível com o nome selecionado e esconde as sugestões
      try { this.companySearchTerm = company.name || company.razaoSocial || company.nomeFantasia || ''; } catch(_) {}
      this.filteredCompanies = [];
      this.showCompanySuggestions = false; // Esconder as sugestões imediatamente
      // Limpar a flag após 300ms para permitir que blur funcione normalmente depois
      setTimeout(() => { this.selectingCompany = false; }, 300);
    } catch (e) {
      console.warn('[Report] Erro ao selecionar empresa via sugestão', e);
      this.selectingCompany = false;
    }
  }

  ngOnDestroy(): void {
    // Limpar auto-save timer e salvar rascunho uma última vez
    this.stopAutoSaveDraft();
    this.saveAutoSaveDraft().catch(e => console.warn('[Report] Erro ao fazer save final no destroy:', e));
    
    // Ao sair do componente, limpa o rascunho para que o próximo "Novo Relatório" comece vazio
    this.clearDraft();
    try { if (this.onlineListener) window.removeEventListener('online', this.onlineListener); } catch(_) {}
    // Limpar timer de duplicity check
    if (this.duplicityCheckTimer) clearTimeout(this.duplicityCheckTimer);
  }

  private clearDraft(): void {
    try {
      localStorage.removeItem(this.DRAFT_KEY);
      this.records = [];
      this.reportDraft = { records: [] };
    } catch (e) {
      // Falha ao limpar rascunho
    }
  }

  private loadCurrentTime(): void {
    try {
      // Pega a hora atual do fuso horário local
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const timeString = `${hours}:${minutes}`;
      
      // Carrega o valor no input de "Hora inicial"
      const reportStartTimeInput = this.host.nativeElement.querySelector('#reportStartTime') as HTMLInputElement;
      if (reportStartTimeInput) {
        reportStartTimeInput.value = timeString;
      }
    } catch (e) {
      // Falha ao carregar hora atual
    }
  }

  private loadDraftFromStorage(): void {
    try {
      const saved = localStorage.getItem(this.DRAFT_KEY);
      if (saved) {
        this.reportDraft = JSON.parse(saved);
        this.records = this.reportDraft.records || [];
      }
    } catch (e) {
      // Falha ao carregar rascunho
      this.reportDraft = { records: [] };
    }
  }

  private saveDraftToStorage(): void {
    try {
      this.reportDraft.records = this.records;
      localStorage.setItem(this.DRAFT_KEY, JSON.stringify(this.reportDraft));
    } catch (e) {
      // Falha ao salvar rascunho
    }
  }

  addRecord(): void {
    const newRecord: ReportRecord = {
      description: '',
      consequences: '',
      legal: '',
      penalties: '',
      responsible: '',
      priority: 'Media',
      deadline: '',
      unchanged: 'Não',
      photos: []
    };
    this.records.push(newRecord);
    // Reatribui o array para forçar a detecção de mudanças do Angular
    this.records = [...this.records];
    this.saveDraftToStorage();
  }

  removeRecord(index: number): void {
    if (index >= 0 && index < this.records.length) {
      // Remove o registro e cria novo array para forçar detecção de mudanças
      this.records = this.records.filter((_, i) => i !== index);
      this.saveDraftToStorage();
      this.ui.showToast('Registro removido com sucesso.', 'success', 2000);
    }
  }

  trackByIndex(index: number): number {
    return index;
  }

  // ============================================================================
  // ETAPA A: Salvamento Automático em LocalForage (IndexedDB)
  // ============================================================================

  /**
   * Verificar se há rascunho pendente e perguntar ao usuário se deseja retomar
   * Chamado no ngOnInit antes de carregar qualquer outro dado
   */
  private async checkAndPromptPendingDraft(): Promise<void> {
    try {
      const autoDrafts = (await localforage.getItem(this.AUTO_SAVE_KEY)) as any || null;
      
      if (!autoDrafts) {
        console.log('[Report] Nenhum rascunho auto-salvo encontrado');
        return;
      }

      // Se há um rascunho pendente, perguntar se deseja retomar
      const hasPendingData = autoDrafts && Object.keys(autoDrafts).length > 0;
      if (!hasPendingData) return;

      const lastSaved = autoDrafts.lastSaved ? new Date(autoDrafts.lastSaved).toLocaleString('pt-BR') : 'desconhecida';
      
      const message = `Você tem um rascunho auto-salvo desde ${lastSaved}.\n\nDeseja retomá-lo ou começar um novo?`;
      
      // Usar confirm() para perguntar ao usuário
      const shouldResume = window.confirm(message);
      
      if (shouldResume) {
        console.log('[Report] Retomando rascunho auto-salvo...');
        await this.loadAutoSaveDraft();
        this.ui.showToast('Rascunho retomado com sucesso!', 'success', 3000);
      } else {
        console.log('[Report] Descartando rascunho anterior e iniciando novo');
        await this.clearAutoSaveDraft();
      }
    } catch (e) {
      console.warn('[Report] Erro ao verificar rascunho pendente:', e);
      // Não bloqueia o carregamento normal em caso de erro
    }
  }

  /**
   * Iniciar auto-save periódico em localforage (a cada 3 segundos)
   * Garante que dados sejam persistidos mesmo com queda de conexão ou bateria
   */
  private startAutoSaveDraft(): void {
    // Limpar timer anterior se existir
    this.stopAutoSaveDraft();
    
    // Configurar auto-save a cada 3 segundos
    this.autoSaveDraftTimer = setInterval(() => {
      this.saveAutoSaveDraft().catch(e => {
        console.warn('[Report] Erro no auto-save periódico:', e);
      });
    }, this.AUTO_SAVE_INTERVAL);

    console.log('[Report] Auto-save iniciado (intervalo: ' + this.AUTO_SAVE_INTERVAL + 'ms)');
  }

  /**
   * Parar auto-save periódico
   */
  private stopAutoSaveDraft(): void {
    if (this.autoSaveDraftTimer) {
      clearInterval(this.autoSaveDraftTimer);
      this.autoSaveDraftTimer = null;
      console.log('[Report] Auto-save parado');
    }
  }

  /**
   * Salvar rascunho automaticamente em localforage (IndexedDB)
   * Inclui: formulário, registros, fotos em base64, geolocalização
   * Chamado a cada 3 segundos ou após ações críticas (foto, mudança de campo)
   */
  private async saveAutoSaveDraft(): Promise<void> {
    try {
      // Só salvar se houver algo para salvar (registros ou dados do formulário)
      if (this.records.length === 0) return;

      const formData = {
        title: (document.getElementById('reportTitle') as HTMLInputElement)?.value?.trim() || '',
        visitDate: (document.getElementById('dataInspecao') as HTMLInputElement)?.value || '',
        startTime: (document.getElementById('reportStartTime') as HTMLInputElement)?.value || '',
        location: (document.getElementById('localInspecao') as HTMLInputElement)?.value?.trim() || '',
        summary: (document.getElementById('reportSummary') as HTMLTextAreaElement)?.value?.trim() || '',
        clientCompanyId: (document.getElementById('empresaCliente') as HTMLSelectElement)?.value?.trim() || '',
        unitId: (document.getElementById('empresaUnidade') as HTMLSelectElement)?.value?.trim() || '',
        sectorId: (document.getElementById('empresaSetor') as HTMLSelectElement)?.value?.trim() || '',
        nextVisitDate: this.selectedNextVisitDate || '',
        nextVisitShift: this.selectedNextVisitShift || '',
        records: this.records,
        companySearchTerm: this.companySearchTerm,
        geolocation: this.geolocation,
        lastSaved: new Date().toISOString()
      };

      await localforage.setItem(this.AUTO_SAVE_KEY, formData);
      console.log('[Report] Auto-save concluído em localforage', {
        registros: this.records.length,
        timestamp: formData.lastSaved
      });
    } catch (e) {
      console.error('[Report] Erro ao fazer auto-save:', e);
      // Não lançar erro para não interromper o fluxo
    }
  }

  /**
   * Carregar rascunho do auto-save (IndexedDB)
   * Restaura todos os campos do formulário e registros
   */
  private async loadAutoSaveDraft(): Promise<void> {
    try {
      const autoDrafts = (await localforage.getItem(this.AUTO_SAVE_KEY)) as any;
      
      if (!autoDrafts) {
        console.warn('[Report] Nenhum auto-save encontrado');
        return;
      }

      const data = autoDrafts;
      console.log('[Report] Carregando auto-save:', data);

      // Pequeno delay para garantir que o DOM foi renderizado
      await new Promise(resolve => setTimeout(resolve, 500));

      // Preencher os campos do formulário
      const fields: Record<string, string> = {
        'reportTitle': data.title || '',
        'dataInspecao': data.visitDate || '',
        'reportStartTime': data.startTime || '',
        'localInspecao': data.location || '',
        'reportSummary': data.summary || '',
        'empresaCliente': data.clientCompanyId || '',
        'empresaUnidade': data.unitId || '',
        'empresaSetor': data.sectorId || ''
      };

      for (const [id, value] of Object.entries(fields)) {
        const element = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        if (element) {
          element.value = value;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      // Restaurar dados do componente
      this.selectedNextVisitDate = data.nextVisitDate || '';
      this.selectedNextVisitShift = data.nextVisitShift || '';
      this.records = data.records || [];
      this.companySearchTerm = data.companySearchTerm || '';
      this.selectedClientCompanyId = data.clientCompanyId || null;

      // Limpar assinatura anterior (Regra de Ouro)
      this.clearAllSignatures();
      this.techPad = null;
      this.clientPad = null;

      console.log('[Report] Auto-save carregado com sucesso');
    } catch (e) {
      console.error('[Report] Erro ao carregar auto-save:', e);
      this.ui.showToast('Erro ao carregar rascunho auto-salvo.', 'error');
    }
  }

  /**
   * Limpar auto-save do localforage
   * Chamado quando usuário escolhe descartar rascunho ou após envio bem-sucedido
   */
  private async clearAutoSaveDraft(): Promise<void> {
    try {
      await localforage.removeItem(this.AUTO_SAVE_KEY);
      console.log('[Report] Auto-save limpo');
    } catch (e) {
      console.error('[Report] Erro ao limpar auto-save:', e);
    }
  }

  removePhotos(index: number): void {
    if (index >= 0 && index < this.records.length) {
      this.records[index].photos = [];
      this.saveDraftToStorage();
    }
  }

  async onRecordFileChange(event: Event, recordIndex: number, photoIndex: 0 | 1): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input?.files?.length) return;

    const file = input.files[0];
    try {
      // Ler arquivo como dataURL e abrir editor Konva para edição antes de salvar
      const dataUrl = await this.readFileAsDataURL(file);
      await this.openKonvaEditorAndWait(dataUrl, recordIndex, photoIndex);
    } catch (err: any) {
      console.error('[Report] onRecordFileChange - Erro ao processar arquivo:', err?.message || err);
      this.ui.showToast(`Erro ao abrir editor de imagem: ${err?.message || err}`, 'error', 4000);
    } finally {
      // Limpar o input para permitir novo upload
      try { input.value = ''; } catch(_) {}
    }
  }

  private readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
      reader.readAsDataURL(file);
    });
  }

  private openKonvaEditorAndWait(dataUrl: string, recordIndex: number, photoIndex: number): Promise<void> {
    return new Promise(async (resolve) => {
      this.konvaImageToEdit = dataUrl;
      this.konvaEditTarget = { recordIndex, photoIndex };
      this.konvaEditorVisible = true;

      // Resolverá quando o usuário salvar ou cancelar
      this._konvaSaveResolver = (v?: any) => { this._konvaSaveResolver = null; resolve(); };
    });
  }

  handleKonvaSave(editedBase64: string): void {
    try {
      if (!this.konvaEditTarget) return;
      const { recordIndex, photoIndex } = this.konvaEditTarget;

      // Redimensionar imagem editada para o padrão do relatório
      this.resizeImageToBase64(editedBase64).then((resizedBase64: string) => {
        if (recordIndex >= 0 && recordIndex < this.records.length) {
          if (!this.records[recordIndex].photos) this.records[recordIndex].photos = [];
          this.records[recordIndex].photos[photoIndex] = resizedBase64;
          this.records[recordIndex].photos = [...this.records[recordIndex].photos];
          this.records = [...this.records];
          this.saveAutoSaveDraft().catch(e => console.warn('[Report] Erro ao salvar foto editada no auto-save:', e));
        }
      }).catch((err) => {
        console.error('[Report] Erro ao redimensionar imagem editada:', err);
        this.ui.showToast('Erro ao processar imagem editada.', 'error');
      }).finally(() => {
        this.konvaEditorVisible = false;
        this.konvaImageToEdit = null;
        this.konvaEditTarget = null;
        if (this._konvaSaveResolver) this._konvaSaveResolver();
      });
    } catch (e) {
      console.error('[Report] handleKonvaSave error:', e);
      this.konvaEditorVisible = false;
      if (this._konvaSaveResolver) this._konvaSaveResolver();
    }
  }

  handleKonvaCancel(): void {
    this.konvaEditorVisible = false;
    this.konvaImageToEdit = null;
    this.konvaEditTarget = null;
    if (this._konvaSaveResolver) this._konvaSaveResolver();
  }

  // Abre o editor Konva para uma foto já existente no registro
  openKonvaForExisting(recordIndex: number, photoIndex: number): void {
    try {
      if (!this.records[recordIndex] || !this.records[recordIndex].photos) return;
      const img = this.records[recordIndex].photos[photoIndex];
      if (!img) return;
      this.konvaImageToEdit = img;
      this.konvaEditTarget = { recordIndex, photoIndex };
      this.konvaEditorVisible = true;
      // resolver será chamado quando salvar/cancelar
      this._konvaSaveResolver = (v?: any) => { this._konvaSaveResolver = null; };
    } catch (e) {
      console.error('[Report] openKonvaForExisting error:', e);
      this.ui.showToast('Erro ao abrir editor da foto.', 'error');
    }
  }

  async onCaptureClick(recordIndex: number): Promise<void> {
    try {
      this.currentRecordIndexForCamera = recordIndex;
      this.cameraActive = true;
      
      // Obter facing mode do localStorage ou usar padrão (traseira)
      const facingMode = (localStorage.getItem('cameraFacing') || 'environment') as 'user' | 'environment';
      
      // Solicitar acesso à câmera
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode } // Usa o facing mode salvo ou padrão
      });
      
      this.cameraStream = stream;
      
      // Pequeno delay para garantir que o elemento de vídeo foi renderizado
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Anexar stream ao elemento de vídeo
      const videoElement = document.getElementById('cameraVideoFeed') as HTMLVideoElement;
      if (videoElement) {
        videoElement.srcObject = stream;
        videoElement.play().catch(err => console.error('Erro ao reproduzir vídeo:', err));
      }
    } catch (e) {
      this.cameraActive = false;
      this.ui.showToast(`Não foi possível acessar a câmera: ${(e as Error).message}`, 'error');
    }
  }

  async capturePhotoFromCamera(): Promise<void> {
    try {
      const videoElement = document.getElementById('cameraVideoFeed') as HTMLVideoElement;
      if (!videoElement) return;

      // Criar canvas e capturar frame do vídeo
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) return;

      // **IMPORTANTE: Desenhar o vídeo no canvas PRIMEIRO**
      context.drawImage(videoElement, 0, 0);

      // Depois verificar se precisa rotacionar (landscape -> portrait)
      let finalImageBase64: string;
      if (canvas.width > canvas.height) {
        // Imagem está em landscape, girar para portrait
        const rotatedCanvas = document.createElement('canvas');
        rotatedCanvas.width = canvas.height;
        rotatedCanvas.height = canvas.width;
        const rotatedContext = rotatedCanvas.getContext('2d');
        if (!rotatedContext) return;
        
        rotatedContext.translate(canvas.height, 0);
        rotatedContext.rotate(Math.PI / 2);
        rotatedContext.drawImage(canvas, 0, 0);
        finalImageBase64 = rotatedCanvas.toDataURL('image/jpeg', 0.99);
      } else {
        // Já está em portrait, usar normalmente
        finalImageBase64 = canvas.toDataURL('image/jpeg', 0.99);
      }
      
      this.capturedImageBase64 = finalImageBase64;

      // Pausa o vídeo para focar na pré-visualização e evitar que o feed continue
      try { videoElement.pause(); } catch (_) {}

      // Garantir que os modos de edição estejam resetados para que os botões apareçam
      this.isDrawingMode = false;
      this.isCroppingMode = false;
      this.isDrawing = false;
      this.drawingTool = null;
      this.originalImageBase64 = this.capturedImageBase64;
    } catch (e) {
      this.ui.showToast(`Erro ao capturar foto: ${(e as Error).message}`, 'error');
    }
  }

  toggleCameraFacing(): void {
    try {
      if (this.cameraStream) {
        // Parar stream atual
        this.cameraStream.getTracks().forEach(track => track.stop());
        this.cameraStream = null;
      }
      
      // Obter facing mode atual do localStorage ou padrão
      const currentFacing = localStorage.getItem('cameraFacing') || 'environment';
      const newFacing = currentFacing === 'environment' ? 'user' : 'environment';
      localStorage.setItem('cameraFacing', newFacing);
      
      // Reiniciar câmera com novo facing
      this.cameraActive = false;
      setTimeout(() => {
        if (this.currentRecordIndexForCamera !== null) {
          this.onCaptureClick(this.currentRecordIndexForCamera);
        }
      }, 300);
    } catch (e) {
      this.ui.showToast(`Erro ao trocar câmera: ${(e as Error).message}`, 'error');
    }
  }

  confirmCapturedPhoto(): void {
    try {
      if (!this.capturedImageBase64 || this.currentRecordIndexForCamera === null) return;

      const recordIndex = this.currentRecordIndexForCamera;
      
      // Redimensionar a imagem capturada
      this.resizeImageToBase64(this.capturedImageBase64).then((resizedBase64: string) => {
        if (recordIndex >= 0 && recordIndex < this.records.length) {
          if (!this.records[recordIndex].photos) {
            this.records[recordIndex].photos = [];
          }
          // Adicionar à primeira foto vazia
          const slot = this.records[recordIndex].photos[0] ? 1 : 0;
          if (slot < 2) {
            this.records[recordIndex].photos[slot] = resizedBase64;
            this.records[recordIndex].photos = [...this.records[recordIndex].photos];
            this.records = [...this.records];
            this.saveDraftToStorage();
            this.ui.showToast('Foto adicionada com sucesso!', 'success');
            // IMPORTANTE: Disparar auto-save após captura
            this.saveAutoSaveDraft().catch(e => console.warn('[Report] Erro ao salvar foto capturada no auto-save:', e));
          } else {
            this.ui.showToast('Limite de 2 fotos por registro já atingido.', 'info');
          }
        }
        this.closeCameraModal();
      }).catch((error: Error) => {
        console.error('[Report] Erro ao redimensionar foto capturada:', error);
        // Fallback: usa a foto original
        if (recordIndex >= 0 && recordIndex < this.records.length) {
          if (!this.records[recordIndex].photos) {
            this.records[recordIndex].photos = [];
          }
          const slot = this.records[recordIndex].photos[0] ? 1 : 0;
          if (slot < 2) {
            this.records[recordIndex].photos[slot] = this.capturedImageBase64!;
            this.records[recordIndex].photos = [...this.records[recordIndex].photos];
            this.records = [...this.records];
            this.saveDraftToStorage();
            this.ui.showToast('Foto adicionada com sucesso!', 'success');
          }
        }
        this.closeCameraModal();
      });
    } catch (e) {
      this.ui.showToast(`Erro ao confirmar foto: ${(e as Error).message}`, 'error');
    }
  }

  closeCameraModal(): void {
    try {
      if (this.cameraStream) {
        this.cameraStream.getTracks().forEach(track => track.stop());
        this.cameraStream = null;
      }
      this.cameraActive = false;
      this.capturedImageBase64 = null;
      this.currentRecordIndexForCamera = null;
      this.isDrawingMode = false;
      this.drawingTool = null;
      this.originalImageBase64 = null;
      this.canvasContext = null;
      localStorage.removeItem('cameraFacing');
    } catch (e) {
      console.error('Erro ao fechar modal de câmera:', e);
    }
  }

  // Ativa modo de desenho
  enterDrawingMode(): void {
    this.isDrawingMode = true;
    this.originalImageBase64 = this.capturedImageBase64;
    
    // Aguarda o canvas ser renderizado
    setTimeout(() => {
      const canvas = document.getElementById('drawingCanvas') as HTMLCanvasElement;
      if (canvas) {
        const img = new Image();
        img.onload = () => {
          // Define as dimensões do canvas baseado na imagem
          // Calcula uma escala apropriada para caber na tela
          const maxWidth = Math.min(img.width, 800);
          const maxHeight = Math.min(img.height, window.innerHeight * 0.6);
          const scale = Math.min(maxWidth / img.width, maxHeight / img.height);
          
          canvas.width = img.width;
          canvas.height = img.height;
          canvas.style.width = (img.width * scale) + 'px';
          canvas.style.height = (img.height * scale) + 'px';
          
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            this.canvasContext = ctx;
          }
        };
        img.src = this.capturedImageBase64 || '';
      }
    }, 100);
  }

  // Seleciona ferramenta de desenho
  selectDrawingTool(tool: 'circle' | 'rectangle' | 'arrow' | 'pen'): void {
    this.drawingTool = tool;
  }

  // Inicia desenho no canvas
  onCanvasMouseDown(e: MouseEvent | TouchEvent): void {
    if (!this.isDrawingMode || !this.drawingTool) return;
    
    const canvas = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    if (!canvas) return;
    
    e.preventDefault();
    
    const rect = canvas.getBoundingClientRect();
    const clientX = e instanceof TouchEvent ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = e instanceof TouchEvent ? e.touches[0].clientY : (e as MouseEvent).clientY;
    
    // Calcula a posição relativa ao canvas, considerando a escala
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    this.startX = (clientX - rect.left) * scaleX;
    this.startY = (clientY - rect.top) * scaleY;
    this.isDrawing = true;
  }

  // Desenha enquanto mouse está pressionado
  onCanvasMouseMove(e: MouseEvent | TouchEvent): void {
    if (!this.isDrawing || !this.canvasContext || !this.drawingTool) return;
    
    const canvas = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    if (!canvas) return;
    
    e.preventDefault();
    
    const rect = canvas.getBoundingClientRect();
    const clientX = e instanceof TouchEvent ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = e instanceof TouchEvent ? e.touches[0].clientY : (e as MouseEvent).clientY;
    
    // Calcula a posição relativa ao canvas, considerando a escala
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const currentX = (clientX - rect.left) * scaleX;
    const currentY = (clientY - rect.top) * scaleY;

    // Recarrega a imagem original
    if (this.originalImageBase64) {
      const img = new Image();
      img.onload = () => {
        this.canvasContext?.drawImage(img, 0, 0);
        this.drawShape(currentX, currentY);
      };
      img.src = this.originalImageBase64;
    }
  }

  // Finaliza desenho
  onCanvasMouseUp(e?: MouseEvent | TouchEvent): void {
    if (e) {
      e.preventDefault();
    }
    this.isDrawing = false;
  }

  // Desenha forma (círculo, retângulo, seta, caneta)
  private drawShape(endX: number, endY: number): void {
    if (!this.canvasContext) return;
    
    const ctx = this.canvasContext;
    ctx.strokeStyle = this.drawingColor;
    ctx.fillStyle = this.drawingColor;
    ctx.lineWidth = this.drawingLineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (this.drawingTool) {
      case 'circle':
        const radiusX = Math.abs(endX - this.startX);
        const radiusY = Math.abs(endY - this.startY);
        const radius = Math.max(radiusX, radiusY);
        ctx.beginPath();
        ctx.arc(this.startX, this.startY, radius, 0, 2 * Math.PI);
        ctx.stroke();
        break;

      case 'rectangle':
        const width = endX - this.startX;
        const height = endY - this.startY;
        ctx.strokeRect(this.startX, this.startY, width, height);
        break;

      case 'arrow':
        this.drawArrow(this.startX, this.startY, endX, endY);
        break;

      case 'pen':
        ctx.beginPath();
        ctx.moveTo(this.startX, this.startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        break;
    }
  }

  // Desenha seta
  private drawArrow(fromX: number, fromY: number, toX: number, toY: number): void {
    if (!this.canvasContext) return;
    
    const ctx = this.canvasContext;
    const headlen = 15;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    // Desenha linha
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // Desenha ponta da seta
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  // Salva desenho para a imagem
  saveDrawing(): void {
    const canvas = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    if (canvas) {
      this.capturedImageBase64 = canvas.toDataURL('image/jpeg', 0.99);
      this.isDrawingMode = false;
      this.drawingTool = null;
    }
  }

  // Descarta desenho
  discardDrawing(): void {
    this.capturedImageBase64 = this.originalImageBase64;
    this.isDrawingMode = false;
    this.drawingTool = null;
  }

  // Ativa modo de recorte
  enterCropMode(): void {
    this.isCroppingMode = true;
    this.originalImageBase64 = this.capturedImageBase64;
    
    // Aguarda o canvas ser renderizado
    setTimeout(() => {
      const canvas = document.getElementById('cropCanvas') as HTMLCanvasElement;
      if (canvas) {
        const img = new Image();
        img.onload = () => {
          // Define as dimensões do canvas baseado na imagem
          const maxWidth = Math.min(img.width, 800);
          const maxHeight = Math.min(img.height, window.innerHeight * 0.6);
          const scale = Math.min(maxWidth / img.width, maxHeight / img.height);
          
          canvas.width = img.width;
          canvas.height = img.height;
          canvas.style.width = (img.width * scale) + 'px';
          canvas.style.height = (img.height * scale) + 'px';
          
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            this.cropCanvasContext = ctx;
          }
        };
        img.src = this.capturedImageBase64 || '';
      }
    }, 100);
  }

  // Inicia seleção de recorte
  onCropMouseDown(e: MouseEvent | TouchEvent): void {
    if (!this.isCroppingMode) return;
    
    const canvas = document.getElementById('cropCanvas') as HTMLCanvasElement;
    if (!canvas) return;
    
    e.preventDefault();
    
    const rect = canvas.getBoundingClientRect();
    const clientX = e instanceof TouchEvent ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = e instanceof TouchEvent ? e.touches[0].clientY : (e as MouseEvent).clientY;
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    this.cropStartX = (clientX - rect.left) * scaleX;
    this.cropStartY = (clientY - rect.top) * scaleY;
    this.cropEndX = this.cropStartX;
    this.cropEndY = this.cropStartY;
    this.isCropSelecting = true;
  }

  // Desenha seleção de recorte
  onCropMouseMove(e: MouseEvent | TouchEvent): void {
    if (!this.isCropSelecting || !this.cropCanvasContext || !this.originalImageBase64) return;
    
    const canvas = document.getElementById('cropCanvas') as HTMLCanvasElement;
    if (!canvas) return;
    
    e.preventDefault();
    
    const rect = canvas.getBoundingClientRect();
    const clientX = e instanceof TouchEvent ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = e instanceof TouchEvent ? e.touches[0].clientY : (e as MouseEvent).clientY;
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    this.cropEndX = (clientX - rect.left) * scaleX;
    this.cropEndY = (clientY - rect.top) * scaleY;

    // Recarrega a imagem original
    const img = new Image();
    img.onload = () => {
      this.cropCanvasContext?.drawImage(img, 0, 0);
      this.drawCropSelection();
    };
    img.src = this.originalImageBase64;
  }

  // Finaliza seleção de recorte
  onCropMouseUp(e?: MouseEvent | TouchEvent): void {
    if (e) {
      e.preventDefault();
    }
    this.isCropSelecting = false;
  }

  // Desenha retângulo de seleção de recorte
  private drawCropSelection(): void {
    if (!this.cropCanvasContext) return;
    
    const ctx = this.cropCanvasContext;
    const x = Math.min(this.cropStartX, this.cropEndX);
    const y = Math.min(this.cropStartY, this.cropEndY);
    const width = Math.abs(this.cropEndX - this.cropStartX);
    const height = Math.abs(this.cropEndY - this.cropStartY);

    // Desenha overlay escuro fora da área de recorte
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    
    // Parte superior
    ctx.fillRect(0, 0, ctx.canvas.width, y);
    // Parte esquerda
    ctx.fillRect(0, y, x, height);
    // Parte direita
    ctx.fillRect(x + width, y, ctx.canvas.width - (x + width), height);
    // Parte inferior
    ctx.fillRect(0, y + height, ctx.canvas.width, ctx.canvas.height - (y + height));

    // Desenha borda da área de recorte
    ctx.strokeStyle = '#bfe038';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);
  }

  // Salva recorte
  saveCrop(): void {
    const canvas = document.getElementById('cropCanvas') as HTMLCanvasElement;
    if (!canvas) return;

    const x = Math.min(this.cropStartX, this.cropEndX);
    const y = Math.min(this.cropStartY, this.cropEndY);
    const width = Math.abs(this.cropEndX - this.cropStartX);
    const height = Math.abs(this.cropEndY - this.cropStartY);

    // Validação mínima de área
    if (width < 10 || height < 10) {
      this.ui.showToast('Selecione uma área maior para recortar', 'info', 2000);
      return;
    }

    // Cria um novo canvas para o recorte
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = width;
    cropCanvas.height = height;
    
    const cropCtx = cropCanvas.getContext('2d');
    if (cropCtx) {
      const img = new Image();
      img.onload = () => {
        cropCtx.drawImage(canvas, x, y, width, height, 0, 0, width, height);
        this.capturedImageBase64 = cropCanvas.toDataURL('image/jpeg', 0.99);
        this.isCroppingMode = false;
        this.ui.showToast('Foto recortada com sucesso!', 'success', 2000);
      };
      img.src = this.originalImageBase64 || '';
    }
  }

  // Descarta recorte
  discardCrop(): void {
    this.capturedImageBase64 = this.originalImageBase64;
    this.isCroppingMode = false;
  }

  onSelectFileClick(recordIndex: number): void {
    // Criar input file dinamicamente para evitar interferência com os inputs dos slots
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true; // Permitir seleção de múltiplas fotos
    input.onchange = (e: any) => {
      const files = e.target.files as FileList;
      if (!files || files.length === 0) return;

      const maxPhotos = 2;
      const currentPhotos = this.records[recordIndex]?.photos || [];
      
      if (currentPhotos.length >= maxPhotos) {
        this.ui.showToast('Limite de 2 fotos por registro já atingido.', 'info', 3000);
        return;
      }

      let photosAdded = 0;
      const availableSlots = maxPhotos - currentPhotos.length;

      // Processar arquivo por arquivo até preencher os slots disponíveis
      for (let i = 0; i < files.length && photosAdded < availableSlots; i++) {
        const file = files[i];
        console.log('[Report] Processando arquivo da galeria:', file.name, 'Tamanho:', file.size);
        // Redimensiona a imagem antes de armazenar
        this.resizeImageTo6_8cm(file).then((resizedBase64: string) => {
          console.log('[Report] Arquivo da galeria redimensionado com sucesso:', file.name, 'Tamanho base64:', resizedBase64.length);
          if (recordIndex >= 0 && recordIndex < this.records.length) {
            if (!this.records[recordIndex].photos) {
              this.records[recordIndex].photos = [];
            }

            // Adicionar nas posições vazias (índices 0 ou 1)
            if (this.records[recordIndex].photos.length < maxPhotos) {
              this.records[recordIndex].photos[this.records[recordIndex].photos.length] = resizedBase64;
              // Reatribui fotos e array principal para forçar detecção
              this.records[recordIndex].photos = [...this.records[recordIndex].photos];
              this.records = [...this.records];
              this.saveAutoSaveDraft().catch(e => console.warn('[Report] Erro ao salvar foto da galeria:', e));
            }
          }
        }).catch((error: Error) => {
          console.error('[Report] Erro ao redimensionar imagem da galeria:', file.name, error.message);
          // IMPORTANTE: NÃO usar fallback - OBRIGAR redimensionamento bem-sucedido
          this.ui.showToast(`Erro ao processar ${file.name}: ${error.message}. Tente novamente.`, 'error', 4000);
        });
        photosAdded++;
      }

      if (photosAdded < files.length) {
        this.ui.showToast(`Apenas ${photosAdded} foto(s) adicionada(s). Limite de 2 fotos por registro.`, 'info', 3000);
      }
    };
    input.click();
  }

  onRecordChange(index: number): void {
    // Método chamado quando qualquer campo do registro é alterado
    this.saveDraftToStorage(); // Manter localStorage para compatibilidade
    
    // NOVO: Também salvar em localforage para persistência offline
    this.saveAutoSaveDraft().catch(e => console.warn('[Report] Erro ao fazer auto-save ao modificar registro:', e));
  }

  /**
   * Verifica duplicidade quando empresa, data ou turno mudam.
   * Usa debounce para evitar requisições excessivas.
   * 
   * Este é o coração da "Reação em Cadeia":
   * - Monitora mudanças nos 3 campos críticos
   * - Só valida quando TODOS estão preenchidos
   * - Envia requisição silenciosa ao backend
   * - Fornece feedback visual instantâneo
   */
  async onReportFieldChange(): Promise<void> {
    // Limpar timer anterior
    if (this.duplicityCheckTimer) clearTimeout(this.duplicityCheckTimer);
    
    console.log('[Report.onReportFieldChange] Mudança detectada no formulário');
    
    // Debounce: só fazer a requisição 800ms após a última mudança
    // Isso evita múltiplas requisições enquanto o usuário está digitando
    this.duplicityCheckTimer = setTimeout(() => {
      // Debounce expirado, chamando checkDuplicity...
      this.checkDuplicity();
    }, 800);
  }

  /**
   * Verifica se já existe relatório para a mesma empresa, data e turno.
   * 
   * Lógica da "Reação em Cadeia":
   * 1. Verifica se os 3 campos críticos estão preenchidos
   * 2. Converte hora (se aplicável) para turno (MANHA/TARDE)
   * 3. Envia GET /technical-visits/check-duplicity
   * 4. Envia GET /technical-visits/check-availability para validar turno
   * 5. Fornece feedback visual instantâneo baseado na resposta
   */
  private async checkDuplicity(): Promise<void> {
    try {
      console.log('[Report.checkDuplicity] === INICIANDO VERIFICAÇÃO ===');
      
      // ====== PASSO 1: Coleta dos Dados ======
      const companyIdValue = (document.getElementById('empresaCliente') as HTMLSelectElement)?.value?.trim();
      const dateValue = this.selectedNextVisitDate || '';
      const shiftValue = this.selectedNextVisitShift || '';

      console.log('[Report.checkDuplicity] Estado dos campos:', {
        empresaValue: companyIdValue,
        dataValue: dateValue,
        turnoValue: shiftValue,
        isDuplicityBlocked: this.isDuplicityBlocked
      });

      console.log('[Report] Monitoramento de campos - Estado atual:', {
        empresa: companyIdValue ? '✓ Preenchida' : '✗ Vazia',
        data: dateValue ? '✓ Preenchida' : '✗ Vazia',
        turno: shiftValue ? '✓ Preenchido' : '✗ Vazio'
      });

      // ====== PASSO 2: Validação - Todos os 3 campos devem estar preenchidos ======
      // Este é o gatilho: se algum campo faltar, não faz nada
      if (!companyIdValue || !dateValue || !shiftValue) {
        console.log('[Report] Não validando - campos incompletos. Limpando erros anteriores.');
        // Se algum campo ficou vazio, limpar erros da validação anterior
        this.clearDuplicityError();
        return;
      }

      const companyId = parseInt(companyIdValue);
      
      // Validar se é um número válido
      if (isNaN(companyId)) {
        this.clearDuplicityError();
        return;
      }

      console.log('[Report] ✓ Todos os 3 campos preenchidos! Disparando verificação de duplicidade...');
      console.log('[Report] Enviando para backend:', { companyId, dateValue, shiftValue });
      
      this.duplicityCheckPending = true;
      this.clearDuplicityError();

      // ====== PASSO 3: Verificações Silenciosas ao Backend ======
      // 1. Verificar duplicidade (check-duplicity)
      // 2. Verificar bloqueio de turno (check-availability)
      
      console.log('[Report] Chamando checkAvailability do TechnicalVisitService...');
      await this.technicalVisit.checkAvailability(dateValue, shiftValue);

      console.log('[Report] ✓ Resposta OK - Sem bloqueios encontrados');

      // ====== PASSO 4: Sucesso (200 OK) - Agenda Está Livre ======
      // Se passou na verificação, limpar erros e habilitar botão
      console.log('[Report] ✓ Sem bloqueios encontrados - Agenda está LIVRE');
      this.isDuplicityBlocked = false;
      this.clearDuplicityError();
      this.enableSubmitButton();
      
      // Feedback visual opcional (muito discreto)
      console.log('[Report] Status: PRONTO PARA ENVIO');

    } catch (error: any) {
      const status = error?.status || error?.response?.status;
      const message = (error as Error).message || 'Erro ao verificar disponibilidade';

      console.error('[Report] ✗ Erro na verificação:', { status, message });

      // ====== PASSO 5: Conflito (409) - Data/Turno Bloqueado ======
      if (status === 409) {
        console.log('[Report] ⚠ CONFLITO DETECTADO! Data/Turno bloqueado.');
        console.log('[Report] Antes: isDuplicityBlocked =', this.isDuplicityBlocked);
        this.isDuplicityBlocked = true;
        console.log('[Report] Depois: isDuplicityBlocked =', this.isDuplicityBlocked);
        this.duplicityError = message || 'Horário indisponível!';
        console.log('[Report] duplicityError =', this.duplicityError);
        this.disableSubmitButton();
        
        // Toast como feedback adicional (não obrigatório)
        this.ui.showToast(message, 'warning', 4000);
        
        console.log('[Report] Status: BLOQUEADO - Botão de envio desabilitado');
      } else {
        // ====== Outros Erros (não bloqueam) ======
        // Ex: erro de rede, timeout, etc.
        console.warn('[Report] ⚠ Erro na verificação (não bloqueante):', message);
        this.isDuplicityBlocked = false;
        this.clearDuplicityError();
        // Não mostrar toast em erro de rede, apenas logging
      }

    } finally {
      this.duplicityCheckPending = false;
    }
  }

  private clearDuplicityError(): void {
    this.duplicityError = null;
    this.isDuplicityBlocked = false;
  }

  private disableSubmitButton(): void {
    try {
      const btnSave = document.getElementById('handleSaveClickBtn') as HTMLButtonElement;
      if (btnSave) {
        btnSave.disabled = true;
        btnSave.setAttribute('aria-disabled', 'true');
        btnSave.classList.add('btn-disabled');
        btnSave.title = 'Agenda bloqueada: já existe relatório para este turno';
        console.log('[Report] Botão de envio desabilitado');
      }
    } catch (e) {
      console.warn('[Report] Erro ao desabilitar botão:', e);
    }
  }

  private enableSubmitButton(): void {
    try {
      const btnSave = document.getElementById('handleSaveClickBtn') as HTMLButtonElement;
      if (btnSave) {
        btnSave.disabled = false;
        btnSave.removeAttribute('aria-disabled');
        btnSave.classList.remove('btn-disabled');
        btnSave.title = '';
        console.log('[Report] Botão de envio habilitado');
      }
    } catch (e) {
      console.warn('[Report] Erro ao habilitar botão:', e);
    }
  }

  /**
   * Método chamado quando usuário seleciona data no mat-datepicker
   */
  onDatePickerChange(event: any): void {
    try {
      const selectedDate = event.value as Date;
      if (!selectedDate) {
        return;
      }

      console.log('[Report] Data selecionada do datepicker:', selectedDate);

      // Sincronizar com o campo de texto de data (formato YYYY-MM-DD)
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      this.selectedNextVisitDate = `${year}-${month}-${day}`;

      console.log('[Report] Data sincronizada:', this.selectedNextVisitDate);

      // Disparar validação de duplicidade
      this.onReportFieldChange();

      this.ui.showToast('Data selecionada', 'success', 1500);
    } catch (e) {
      console.error('[Report] Erro ao processar data do datepicker:', e);
    }
  }

  /**
   * Método para aplicar CSS classes aos dias do datepicker baseado na disponibilidade
   * Retorna classe CSS para um dia específico
   */
  dateClass = (d: Date): string => {
    try {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;

      // Para indicar visualmente que o componente de calendário separado tem mais informações
      // Este é um placeholder visual - o verdadeiro filtro está no AvailabilityCalendarComponent
      return '';
    } catch (e) {
      console.warn('[Report] Erro ao aplicar class ao dia:', e);
      return '';
    }
  };

  /**
   * Handler para quando usuário seleciona data no calendário de disponibilidade (componente separado)
   * Sincroniza com os campos de data e turno do formulário
   */
  onAvailabilityDateSelected(date: Date): void {
    try {
      console.log('[Report] Data selecionada do calendário de disponibilidade:', date);
      
      // Atualizar selectedDate para o datepicker do formulário
      this.selectedDate = date;
      
      // Formatar e sincronizar com o campo de data de próxima visita
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      this.selectedNextVisitDate = `${year}-${month}-${day}`;
      
      console.log('[Report] Data sincronizada:', this.selectedNextVisitDate);
      
      // Disparar validação de duplicidade
      this.onReportFieldChange();
      
      this.ui.showToast('Data da próxima visita atualizada', 'success', 2000);
    } catch (e) {
      console.error('[Report] Erro ao selecionar data do calendário:', e);
      this.ui.showToast('Erro ao selecionar data', 'error', 3000);
    }
  }

  onCompanyChange(e: Event): void {
    try {
      const selectElement = e.target as HTMLSelectElement;
      const selectedCompanyId = selectElement.value;
      console.log('[Report] Empresa selecionada:', selectedCompanyId);

      if (!selectedCompanyId) {
        // Limpa os campos se nenhuma empresa for selecionada
        this.selectedClientCompanyId = null;
        this.clearCompanyFields();
        return;
      }

      // **IMPORTANTE: Salvar o ID da empresa em propriedade do componente**
      this.selectedClientCompanyId = parseInt(selectedCompanyId, 10);

      // Primeiro, tente obter os dados diretamente do option (data-company) — garante o objeto exato
      let selectedOption: HTMLOptionElement | null = null;
      try {
        selectedOption = selectElement.options[selectElement.selectedIndex] as HTMLOptionElement;
      } catch (_) { selectedOption = null; }

      let selectedCompany: any = null;
      if (selectedOption) {
        const dataAttr = selectedOption.getAttribute('data-company');
        if (dataAttr) {
          try { selectedCompany = JSON.parse(dataAttr); }
          catch (e) { /* ignore parse error and fallback below */ }
        }
      }

      // Fallback: procura na lista this.companies com comparação de strings (para evitar mismatch de tipo)
      if (!selectedCompany) {
        selectedCompany = this.companies.find((c: any) => {
          const cid = c && (c.id || c._id || c.companyId || c._companyId);
          return String(cid) === String(selectedCompanyId);
        });
      }

      console.log('[Report] Empresa encontrada:', selectedCompany);

      if (selectedCompany) {
        // Popula o CNPJ
        const cnpjInput = this.host.nativeElement.querySelector('#empresaCnpj') as HTMLInputElement;
        if (cnpjInput) {
          const cnpjValue = selectedCompany.cnpj || selectedCompany.documentNumber || selectedCompany.document || selectedCompany.cpfCnpj || '';
          try { cnpjInput.value = formatCNPJ(cnpjValue) || ''; } catch { cnpjInput.value = cnpjValue || ''; }
          console.log('[Report] CNPJ preenchido:', cnpjValue);
        }

        // Popula as unidades
        this.populateUnidades(selectedCompany);

        // Popula os setores
        this.populateSetores(selectedCompany);
      } else {
        console.warn('[Report] Não foi possível localizar dados completos da empresa selecionada. Verifique estrutura retornada pelo backend.');
        // limpa campos para evitar dados inconsistentes
        this.clearCompanyFields();
      }
    } catch (err) {
      console.warn('Erro ao selecionar empresa', err);
    }
  }

  private clearCompanyFields(): void {
    const cnpjInput = this.host.nativeElement.querySelector('#empresaCnpj') as HTMLInputElement;
    const unidadeSelect = this.host.nativeElement.querySelector('#empresaUnidade') as HTMLSelectElement;
    const setorSelect = this.host.nativeElement.querySelector('#empresaSetor') as HTMLSelectElement;

    if (cnpjInput) cnpjInput.value = '';
    
    if (unidadeSelect) {
      unidadeSelect.disabled = true;
      unidadeSelect.innerHTML = '<option value="">Selecione uma empresa primeiro</option>';
    }

    if (setorSelect) {
      setorSelect.disabled = true;
      setorSelect.innerHTML = '<option value="">Selecione uma empresa primeiro</option>';
    }
  }

  // Limpa seleção de empresa e sincroniza estado do input visível
  clearCompanySelection(): void {
    try {
      this.companySearchTerm = '';
      this.filterCompanies();
      const selectElement = this.host.nativeElement.querySelector('#empresaCliente') as HTMLSelectElement;
      if (selectElement) {
        selectElement.value = '';
        const evt = new Event('change', { bubbles: true });
        selectElement.dispatchEvent(evt);
      }
    } catch (e) { /* ignore */ }
  }

  private populateUnidades(company: any): void {
    const unidadeSelect = this.host.nativeElement.querySelector('#empresaUnidade') as HTMLSelectElement;
    if (!unidadeSelect) return;

    // Limpa as opções existentes
    unidadeSelect.innerHTML = '<option value="">Selecione uma unidade</option>';
    unidadeSelect.disabled = false;

    const unidades = company.units || company.unidades || company.branches || [];
    console.log('[Report] Unidades disponíveis:', unidades);
    
    if (Array.isArray(unidades) && unidades.length > 0) {
      unidades.forEach((unit: any) => {
        const option = document.createElement('option');
        option.value = unit.id || unit._id || unit.name || '';
        option.textContent = unit.name || unit.nomeFantasia || unit.address || 'Sem nome';
        unidadeSelect.appendChild(option);
      });
      console.log('[Report] Unidades adicionadas:', unidades.length);
    } else {
      console.warn('[Report] Nenhuma unidade encontrada na empresa');
    }
  }

  private populateSetores(company: any): void {
    const setorSelect = this.host.nativeElement.querySelector('#empresaSetor') as HTMLSelectElement;
    if (!setorSelect) return;

    // Limpa as opções existentes
    setorSelect.innerHTML = '<option value="">Selecione um setor</option>';
    setorSelect.disabled = false;

    const setores = company.sectors || company.setores || company.departments || [];
    console.log('[Report] Setores disponíveis:', setores);
    
    if (Array.isArray(setores) && setores.length > 0) {
      setores.forEach((setor: any) => {
        const option = document.createElement('option');
        option.value = setor.id || setor._id || setor.name || '';
        option.textContent = setor.name || setor.nomeDepartamento || 'Sem nome';
        setorSelect.appendChild(option);
      });
      console.log('[Report] Setores adicionados:', setores.length);
    } else {
      console.warn('[Report] Nenhum setor encontrado na empresa');
    }
  }

  private async loadLoggedTechnician(): Promise<void> {
    try {
      const me = await this.legacy.fetchUserProfile();
      
      if (!me) {
        return;
      }

      // Mapear possíveis campos de nome e conselho/registro
      const name = me.name || me.fullName || me.nome || me.usuario || '';

      // ampliar aliases conhecidos para sigla e registro do conselho
      const councilAcronym = (
        me.councilAcronym || me.siglaConselhoClasse || me.conselhoSigla || me.sigla || me.siglaConselho || me.conselho || me.council || me.acronym || me.codigoConselho || ''
      );

      const councilRegistration = (
        me.councilNumber || me.conselhoClasse || me.registration || me.registro || me.conselhoRegistro || me.registrationNumber || me.crm || me.crea || me.numeroRegistro || me.registroProfissional || ''
      );

      // Buscar os inputs
      const respInput = this.host.nativeElement.querySelector('#responsavel') as HTMLInputElement;
      const siglaInput = this.host.nativeElement.querySelector('#responsavelSigla') as HTMLInputElement;
      const regInput = this.host.nativeElement.querySelector('#responsavelRegistro') as HTMLInputElement;
      const techNameInput = this.host.nativeElement.querySelector('#techNameReport') as HTMLInputElement;

      // Preenche os inputs e dispara evento 'input' para notificar possíveis listeners
      const dispatchInput = (el: HTMLInputElement | null, fieldName: string, val: string) => {
        if (!el) {
          return;
        }
        el.value = val || '';
        try { 
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (_) {
          console.warn(`[Report] Erro ao disparar eventos para ${fieldName}`);
        }
      };

      // Sempre preencher mesmo se vazio
      if (respInput) dispatchInput(respInput, 'responsavel', name);
      if (siglaInput) dispatchInput(siglaInput, 'responsavelSigla', councilAcronym);
      if (regInput) dispatchInput(regInput, 'responsavelRegistro', councilRegistration);
      if (techNameInput) dispatchInput(techNameInput, 'techNameReport', name);

    } catch (e) {
      console.warn('Erro ao carregar técnico logado', e);
      console.error('[Report] Stack trace:', e);
    }
  }

  private captureGeolocation(): void {
    if (!navigator.geolocation) {
      console.warn('[Report] Geolocalização não disponível no navegador');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.geolocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        console.log('[Report] Geolocalização capturada:', this.geolocation);
      },
      (error) => {
        console.warn('[Report] Erro ao capturar geolocalização:', error.message);
        // Mantém valores padrão 0,0 se não conseguir capturar
        this.geolocation = { latitude: 0, longitude: 0 };
      },
      { timeout: 5000, enableHighAccuracy: false }
    );
  }

  // Pads de assinatura inicializados pelo SignatureService
  private techPad: any = null;
  private clientPad: any = null;
  // overlays de debug por canvas key ('tech' | 'client')
  private signatureOverlays: Record<string, HTMLElement> = {};
  // Geolocalização capturada
  private geolocation: { latitude: number; longitude: number } = { latitude: 0, longitude: 0 };
  // ID da empresa cliente selecionada
  private selectedClientCompanyId: number | null = null;

  // Ref para o componente compartilhado de assinatura
  @ViewChild('reportSignatureModal', { static: false }) reportSignatureModalComp: any;

  // Estado para gerenciar handler do botão voltar enquanto modal aberto
  private modalHistoryPushed = false;
  private modalPopStateHandler = (ev: PopStateEvent) => {
    try {
      // Se o modal de assinatura estiver visível, interceptamos o popstate
      const sigModal = this.host.nativeElement.querySelector('app-signature-modal') as HTMLElement;
      const isHidden = sigModal && sigModal.classList && sigModal.classList.contains('hidden-modal');
      const isOpen = sigModal && !isHidden;
      if (!isOpen) return; // permitir comportamento normal se modal não estiver aberto

      const message = 'Se você voltar perderá todos os dados preenchidos. Use o botão Cancelar para retornar ao relatório já preenchido. Deseja realmente voltar?';
      const proceed = window.confirm(message);
      if (!proceed) {
        // Usuário cancelou a navegação: empurrar o estado novamente para manter o modal no histórico
        try { history.pushState({ reportModal: true }, ''); } catch (_) {}
      } else {
        // Usuário confirmou que quer voltar -> fechar modal e permitir a navegação
        try { this.closeSignatureModal(); } catch (_) {}
        // removemos o handler porque o usuário está saindo
        try { this.unregisterModalBackHandler(); } catch(_) {}
      }
    } catch (e) {
      console.warn('[Report] Erro ao tratar popstate no modal de assinatura', e);
    }
  };

  private async openSignatureModalAngular(): Promise<void> {
    try {
      // Garante que pads anteriores foram limpos
      try { this.clearAllSignatures(); } catch (_) {}
      this.techPad = null;
      this.clientPad = null;
      
      // Capturar geolocalização quando modal é aberto
      this.captureGeolocation();
      
      const sigModal = this.host.nativeElement.querySelector('#reportSignatureModal') as HTMLElement;
      const techCanvas = this.host.nativeElement.querySelector('#techSignatureCanvasReport') as HTMLCanvasElement;
      const clientCanvas = this.host.nativeElement.querySelector('#clientSignatureCanvasReport') as HTMLCanvasElement;

      if (!sigModal || !techCanvas || !clientCanvas) {
        this.ui.showToast('Elemento de assinatura não encontrado.', 'error');
        return;
      }

      // Exibe modal - toggle de várias formas para garantir visibilidade
      try {
        sigModal.classList.remove('hidden');
        sigModal.classList.add('open');
        sigModal.style.display = 'flex';
        sigModal.setAttribute('aria-hidden', 'false');
      } catch (err) {
        console.warn('[Report] Falha ao ajustar classes/estilos do modal', err);
      }

      // Registrar handler para o botão voltar do navegador enquanto o modal estiver aberto
      try { this.registerModalBackHandler(); } catch(_) {}

      // Inicializa pads usando SignatureService
      try {
        // Cria overlay visual para diagnóstico
        this.ensureSignatureOverlay(techCanvas, 'tech');
        this.ensureSignatureOverlay(clientCanvas, 'client');

        const baseOpts = this.signatureService.getDefaultPadOptions();
        const pads = await this.signatureService.initSignaturePads(techCanvas, clientCanvas, {
          ...baseOpts,
          onPointerDown: (pos: any, ev: any) => {
            // pos is in canvas CSS pixels as provided by SimpleSignaturePad
            try {
              const canvasId = (ev && ev.target && (ev.target as Element).id) ? (ev.target as Element).id : null;
              if (canvasId && canvasId.includes('tech')) this.showDebugMarkers('tech', pos, ev);
              else this.showDebugMarkers('client', pos, ev);
            } catch (_) {}
          }
        });
        if (pads) {
          this.techPad = pads.tech;
          this.clientPad = pads.client;
          // Log debug das dimensões
          console.log('[Report] Signature pads inicializados', {
            techCanvasWidth: techCanvas.width,
            techCanvasHeight: techCanvas.height,
            techCanvasClientWidth: techCanvas.clientWidth,
            techCanvasClientHeight: techCanvas.clientHeight,
            devicePixelRatio: window.devicePixelRatio
          });
          
          // Bloqueia scroll APENAS após inicialização bem-sucedida dos pads
          try { document.documentElement.style.overflow = 'hidden'; } catch (_) { try { document.body.style.overflow = 'hidden'; } catch(_){} }
          console.log('[Report] Modal de assinatura exibido e scroll bloqueado');
        }
      } catch (e) {
        console.warn('Falha ao inicializar SignaturePad via service', e);
        // Se falhar, restaura scroll e esconde modal
        try { document.documentElement.style.overflow = ''; } catch (_) { try { document.body.style.overflow = ''; } catch(_){} }
        try {
          sigModal.classList.add('hidden');
          sigModal.classList.remove('open');
          sigModal.style.display = 'none';
          sigModal.setAttribute('aria-hidden', 'true');
        } catch (_) {}
      }
    } catch (e) {
      console.warn('Erro ao abrir modal de assinatura', e);
    }
  }

  private closeSignatureModal(): void {
    try {
      const sigModal = this.host.nativeElement.querySelector('#reportSignatureModal') as HTMLElement;
      if (sigModal) {
        sigModal.classList.add('hidden');
        sigModal.classList.remove('open');
        sigModal.style.display = 'none';
        sigModal.setAttribute('aria-hidden', 'true');
      }
    } catch (e) {
      console.warn('Erro ao esconder modal de assinatura', e);
    }

    try { document.documentElement.style.overflow = ''; } catch (_) { try { document.body.style.overflow = ''; } catch(_){} }

    // Remover o handler do botão voltar quando fechar o modal
    try { this.unregisterModalBackHandler(); } catch(_) {}

    // Limpa pads e referências
    try { this.clearAllSignatures(); } catch (_) {}
    this.techPad = null;
    this.clientPad = null;
    console.log('[Report] Modal de assinatura fechado e scroll restaurado');
  }

  // Cria um overlay transparente sobre o canvas para debug (marcar posições)
  private ensureSignatureOverlay(canvas: HTMLCanvasElement, key: 'tech' | 'client'): void {
    try {
      if (this.signatureOverlays[key]) return;
      const parent = canvas.parentElement as HTMLElement;
      if (!parent) return;
      // garante que o parente tem position para o overlay absoluto
      const cs = window.getComputedStyle(parent);
      if (cs.position === 'static') parent.style.position = 'relative';

      const overlay = document.createElement('div');
      overlay.className = 'sig-overlay';
      overlay.style.position = 'absolute';
      overlay.style.left = '0';
      overlay.style.top = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '2000';
      parent.appendChild(overlay);
      this.signatureOverlays[key] = overlay;
    } catch (e) {
      console.warn('Falha ao criar overlay de assinatura', e);
    }
  }

  // Mostra marcadores de debug: posição do evento e posição usada pelo pad
  private showDebugMarkers(key: 'tech' | 'client', padPos: { x: number; y: number }, ev: any): void {
    try {
      const overlay = this.signatureOverlays[key];
      if (!overlay) return;
      const canvas = document.getElementById(key === 'tech' ? 'techSignatureCanvasReport' : 'clientSignatureCanvasReport') as HTMLCanvasElement;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();

      // posição do evento (client coords)
      const eventX = ev && ev.clientX ? (ev.clientX - rect.left) : (ev.offsetX || 0);
      const eventY = ev && ev.clientY ? (ev.clientY - rect.top) : (ev.offsetY || 0);

      // padPos já está em coordenadas relativas ao canvas (CSS pixels)
      const padX = padPos.x;
      const padY = padPos.y;

      // cria pontos
      const pEvent = document.createElement('span');
      pEvent.className = 'sig-dot sig-dot-event';
      pEvent.style.left = `${eventX - 6}px`;
      pEvent.style.top = `${eventY - 6}px`;
      overlay.appendChild(pEvent);

      const pPad = document.createElement('span');
      pPad.className = 'sig-dot sig-dot-pad';
      pPad.style.left = `${padX - 6}px`;
      pPad.style.top = `${padY - 6}px`;
      overlay.appendChild(pPad);

      // remove após curto período
      setTimeout(() => { try { pEvent.remove(); pPad.remove(); } catch (_) {} }, 1200);
    } catch (e) {
      console.warn('Erro ao mostrar marcadores de debug', e);
    }
  }

  clearTechSig(): void {
    try { if (this.techPad) this.techPad.clear(); } catch (_) {}
  }

  clearClientSig(): void {
    try { if (this.clientPad) this.clientPad.clear(); } catch (_) {}
  }

  clearAllSignatures(): void {
    this.clearTechSig();
    this.clearClientSig();
  }

  cancelSignatureModal(): void {
    try {
      this.closeSignatureModal();
    } catch (e) {
      console.warn('Erro ao cancelar modal de assinatura', e);
    }
  }

  // Registra um estado no history e adiciona listener para interceptar 'back' do navegador
  private registerModalBackHandler(): void {
    try {
      if (this.modalHistoryPushed) return;
      // pushState com pequeno delay para maior compatibilidade em alguns browsers
      try { setTimeout(() => { try { history.pushState({ reportModal: true }, ''); } catch(_) {} }, 50); } catch(_) {}
      window.addEventListener('popstate', this.modalPopStateHandler);
      // Fallback: impedir unload acidental (navegação/fechar aba)
      try { window.addEventListener('beforeunload', this.beforeUnloadHandler); } catch(_) {}
      this.modalHistoryPushed = true;
    } catch (e) {
      console.warn('[Report] Falha ao registrar handler do botão voltar:', e);
    }
  }

  // Remove o listener e limpa flag
  private unregisterModalBackHandler(): void {
    try {
      if (!this.modalHistoryPushed) return;
      window.removeEventListener('popstate', this.modalPopStateHandler);
      try { window.removeEventListener('beforeunload', this.beforeUnloadHandler); } catch(_) {}
      this.modalHistoryPushed = false;
    } catch (e) {
      console.warn('[Report] Falha ao remover handler do botão voltar:', e);
    }
  }

  // Handler beforeunload para prevenir perda de dados como fallback
  private beforeUnloadHandler = (ev: BeforeUnloadEvent) => {
    try {
      // Mostrar diálogo nativo de confirmação - texto customizado é ignorado por alguns browsers
      const confirmationMessage = 'Se você sair desta página perderá todos os dados preenchidos no relatório.';
      (ev || window.event).returnValue = confirmationMessage;
      return confirmationMessage;
    } catch (e) {
      return undefined as any;
    }
  };

  async handleSaveClick(e: Event): Promise<void> {
    e.preventDefault();
    
    // **NOVO: Passo A - Verificar conexão ANTES de abrir modal**
    if (!navigator.onLine) {
      const message = 'Você está sem conexão. O relatório será salvo como Rascunho para envio posterior.';
      const proceed = window.confirm(message);
      if (proceed) {
        await this.saveDraftOffline();
      }
      return;
    }
    
    // Verificar se há erro de duplicidade
    if (this.isDuplicityBlocked || this.duplicityError) {
      this.ui.showToast('Não é possível enviar: ' + (this.duplicityError || 'Conflito de agenda detectado'), 'error');
      return;
    }
    
    // Validar campos mínimos
    const title = (document.getElementById('reportTitle') as HTMLInputElement)?.value || '';
    const visitDate = (document.getElementById('dataInspecao') as HTMLInputElement)?.value || '';
    const location = (document.getElementById('localInspecao') as HTMLInputElement)?.value || '';

    if (!title || !visitDate || !location) {
      this.ui.showToast('Preencha os campos obrigatórios: Título, Data da Visita e Local.', 'warning');
      return;
    }

    // Validar agenda ANTES de abrir modal de assinatura
    try {
      // Se houver visitId, validar conflito de agenda
      if (this.visitId) {
        console.log('[Report] Validando relatório com visitId:', this.visitId);
        
        // Formatar data para YYYY-MM-DD se necessário
        const formattedDate = this.formatDate(visitDate);
        const shift = this.selectedNextVisitShift || 'MANHA'; // Usar turno selecionado ou padrão
        
        // Chamar validação no backend
        await this.agendaValidation.validateReportSubmission(this.visitId, formattedDate, shift);
        
        console.log('[Report] Validação de agenda passou');
        this.ui.showToast('✓ Agendamento validado com sucesso!', 'success', 2000);
      }
    } catch (validationError: any) {
      const errorMsg = (validationError as Error).message || 'Erro na validação de agenda';
      console.error('[Report] Erro na validação de agenda:', errorMsg);
      
      // Se for bloqueio de agenda (409), mostrar mensagem específica
      if (errorMsg.includes('BLOQUEIO DE AGENDA')) {
        this.ui.showToast(errorMsg, 'error', 6000);
      } else {
        this.ui.showToast(`Falha na validação: ${errorMsg}`, 'warning', 4000);
      }
      return; // Bloquear avanço
    }

    // Capturar geolocalização antes de abrir o modal de assinatura
    try {
      this.captureGeolocation();
    } catch (_) {}

    // Abrir modal de assinatura compartilhado (SignatureModalComponent)
    try {
      if (this.reportSignatureModalComp && typeof this.reportSignatureModalComp.open === 'function') {
        this.reportSignatureModalComp.open();
        try { this.registerModalBackHandler(); } catch(_) {}
        return;
      }
      // Fallback: antiga implementação que inicializava pads manualmente
      await this.openSignatureModalAngular();
    } catch (e) {
      console.warn('signature init failed', e);
      this.ui.showToast('Não foi possível inicializar a assinatura.', 'error');
    }
  }

  // Novo: Salvar rascunho offline quando sem internet (Passo A)
  private async saveDraftOffline(): Promise<void> {
    try {
      // Coletar todos os dados do formulário
      const formData = {
        title: (document.getElementById('reportTitle') as HTMLInputElement)?.value?.trim() || '',
        visitDate: (document.getElementById('dataInspecao') as HTMLInputElement)?.value || '',
        startTime: (document.getElementById('reportStartTime') as HTMLInputElement)?.value || '',
        location: (document.getElementById('localInspecao') as HTMLInputElement)?.value?.trim() || '',
        summary: (document.getElementById('reportSummary') as HTMLTextAreaElement)?.value?.trim() || '',
        clientCompanyId: (document.getElementById('empresaCliente') as HTMLSelectElement)?.value?.trim() || '',
        unitId: (document.getElementById('empresaUnidade') as HTMLSelectElement)?.value?.trim() || '',
        sectorId: (document.getElementById('empresaSetor') as HTMLSelectElement)?.value?.trim() || '',
        nextVisitDate: this.selectedNextVisitDate || '',
        nextVisitShift: this.selectedNextVisitShift || '',
        records: this.records,
        companySearchTerm: this.companySearchTerm,
        geolocation: this.geolocation
      };

      const draftItem = {
        id: `draft_${Date.now()}`,
        createdAt: new Date().toISOString(),
        status: 'DRAFT',
        data: formData
      };

      // Salvar em localforage
      const draftsList = (await localforage.getItem('reportDrafts')) as any[] || [];
      draftsList.push(draftItem);
      await localforage.setItem('reportDrafts', draftsList);

      console.log('[Report] Rascunho salvo offline com ID:', draftItem.id);

      this.ui.showToast('Você está sem conexão. O rascunho foi salvo e será reenviado quando houver internet.', 'warning', 5000);
      
      // Redirecionar para documents após curto delay
      setTimeout(() => {
        try {
          this.router.navigate(['/documents']);
        } catch (e) {
          console.error('[Report] Erro ao redirecionar para documents:', e);
          window.location.href = '/documents';
        }
      }, 1500);
    } catch (e) {
      console.error('[Report] Erro ao salvar rascunho offline:', e);
      this.ui.showToast('Falha ao salvar rascunho offline.', 'error');
    }
  }

  // Novo: Carregar rascunho offline para retomada (Passo D)
  private async loadOfflineDraft(draftId: string): Promise<void> {
    try {
      const draftsList = (await localforage.getItem('reportDrafts')) as any[] || [];
      const draftItem = draftsList.find(d => d.id === draftId);
      
      if (!draftItem) {
        console.warn('[Report] Draft não encontrado:', draftId);
        return;
      }

      const data = draftItem.data;
      console.log('[Report] Carregando draft offline:', draftId, data);

      // Pequeno delay para garantir que o DOM foi renderizado
      await new Promise(resolve => setTimeout(resolve, 500));

      // Preencher os campos do formulário
      const fields: Record<string, string> = {
        'reportTitle': data.title || '',
        'dataInspecao': data.visitDate || '',
        'reportStartTime': data.startTime || '',
        'localInspecao': data.location || '',
        'reportSummary': data.summary || '',
        'empresaCliente': data.clientCompanyId || '',
        'empresaUnidade': data.unitId || '',
        'empresaSetor': data.sectorId || ''
      };

      for (const [id, value] of Object.entries(fields)) {
        const element = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        if (element) {
          element.value = value;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      // Restaurar dados do componente
      this.selectedNextVisitDate = data.nextVisitDate || '';
      this.selectedNextVisitShift = data.nextVisitShift || '';
      this.records = data.records || [];
      this.companySearchTerm = data.companySearchTerm || '';
      // **IMPORTANTE: Restaurar o ID da empresa armazenado para manter consistência**
      this.selectedClientCompanyId = data.clientCompanyId || null;

      // **IMPORTANTE: Limpar assinatura anterior (Regra de Ouro)**
      // Quando o formulário é reabrido para edição, a assinatura anterior fica inválida
      this.clearAllSignatures();
      this.techPad = null;
      this.clientPad = null;

      this.ui.showToast('Rascunho carregado. Revise e corrija os dados antes de enviar.', 'info', 3000);
    } catch (e) {
      console.error('[Report] Erro ao carregar draft offline:', e);
      this.ui.showToast('Erro ao carregar rascunho offline.', 'error');
    }
  }

  // Recebe as assinaturas do componente compartilhado e envia o relatório
  public async onSharedSignaturesConfirmed(data: any): Promise<void> {
    let payload: any = null;
    try {
      // IMPORTANTE: Parar auto-save antes de enviar para evitar race conditions
      this.stopAutoSaveDraft();

      // Validações
      if (!this.selectedClientCompanyId) {
        this.ui.showToast('Selecione uma empresa cliente antes de enviar.', 'warning');
        this.startAutoSaveDraft();
        return;
      }

      if (!this.records || this.records.length === 0) {
        this.ui.showToast('Adicione pelo menos um registro antes de enviar.', 'warning');
        this.startAutoSaveDraft();
        return;
      }

      for (let i = 0; i < this.records.length; i++) {
        const record = this.records[i];
        if (!record.photos || record.photos.length === 0) {
          this.ui.showToast(`Registro ${i + 1}: Adicione pelo menos 1 foto.`, 'warning');
          this.startAutoSaveDraft();
          return;
        }
      }

      // Extrair IDs de unidade e setor - converter para number
      // **IMPORTANTE: Usar o ID armazenado na propriedade do componente ao invés do DOM**
      const unitIdValue = (document.getElementById('empresaUnidade') as HTMLSelectElement)?.value?.trim();
      const sectorIdValue = (document.getElementById('empresaSetor') as HTMLSelectElement)?.value?.trim();

      const visitDateFormatted = this.formatDate((document.getElementById('dataInspecao') as HTMLInputElement)?.value || '');
      const startTimeFormatted = this.formatTime((document.getElementById('reportStartTime') as HTMLInputElement)?.value || '');

      payload = {
        title: (document.getElementById('reportTitle') as HTMLInputElement)?.value?.trim() || '',
        clientCompanyId: this.selectedClientCompanyId || null,
        unitId: unitIdValue ? parseInt(unitIdValue) : null,
        sectorId: sectorIdValue ? parseInt(sectorIdValue) : null,
        location: (document.getElementById('localInspecao') as HTMLInputElement)?.value?.trim() || '',
        visitDate: visitDateFormatted || null,
        startTime: startTimeFormatted || null,
        technicalReferences: Array.from(document.querySelectorAll('#referencesList li')).map(li => li.textContent?.trim() || '').filter(Boolean).join('; '),
        summary: (document.getElementById('reportSummary') as HTMLTextAreaElement)?.value?.trim() || '',
        findings: this.records.map(r => {
          const photo1Base64 = this.stripDataUrl(r.photos[0] || '') || '';
          const photo2Base64 = this.stripDataUrl(r.photos[1] || '') || '';
          const deadlineFormatted = r.deadline ? this.formatDate(r.deadline) : null;
          return {
            photoBase64_1: photo1Base64,
            photoBase64_2: photo2Base64,
            description: r.description?.trim() || '',
            consequences: r.consequences?.trim() || '',
            legalGuidance: r.legal?.trim() || '',
            responsible: r.responsible?.trim() || '',
            penalties: r.penalties?.trim() || '',
            priority: (r.priority || 'MEDIA').toUpperCase(),
            deadline: deadlineFormatted,
            recurrence: r.unchanged === 'Sim'
          };
        }),
        technicianSignatureImageBase64: this.stripDataUrl(data.techSignature) || '',
        clientSignatureImageBase64: this.stripDataUrl(data.clientSignature) || '',
        clientSignerName: data.clientName || '',
        clientSignatureLatitude: this.geolocation.latitude,
        clientSignatureLongitude: this.geolocation.longitude
      };
      // campo opcional: próxima visita
      try {
        console.log('[onSharedSignaturesConfirmed] Valor em selectedNextVisitDate:', this.selectedNextVisitDate);
        if (this.selectedNextVisitDate && this.selectedNextVisitDate.trim()) {
          payload.nextVisitDate = this.selectedNextVisitDate;
        } else {
          payload.nextVisitDate = null;
        }
      } catch(e) { 
        console.error('[onSharedSignaturesConfirmed] Erro ao processar data próxima visita', e);
        payload.nextVisitDate = null; 
      }

      // campo opcional: turno da próxima visita
      try {
        console.log('[report] selectedNextVisitShift from component:', this.selectedNextVisitShift);
        payload.nextVisitShift = this.selectedNextVisitShift && this.selectedNextVisitShift.trim() ? this.selectedNextVisitShift : null;
        console.log('[report] nextVisitShift final payload value:', payload.nextVisitShift);
      } catch(e) { 
        console.error('[report] error capturing nextVisitShift:', e);
        payload.nextVisitShift = null; 
      }

      const resp = await this.report.postTechnicalVisit(payload);
      if (!resp) throw new Error('Resposta vazia do servidor');

      // Limpar e fechar modal
      try { if (this.reportSignatureModalComp && typeof this.reportSignatureModalComp.close === 'function') this.reportSignatureModalComp.close(); } catch(_) {}
      try { this.clearAllSignatures(); } catch(_) {}
      // Garantir que o handler do botão voltar seja removido
      try { this.unregisterModalBackHandler(); } catch(_) {}

      // Limpar rascunho
      localStorage.removeItem(this.DRAFT_KEY);
      await this.clearAutoSaveDraft();
      this.records = [];
      this.reportDraft = { records: [] };

      this.ui.showToast('Relatório enviado com sucesso!', 'success', 4000);
    } catch (e) {
      const error = e as any;
      const errorMsg = error?.message || 'Erro desconhecido';
      console.error('Erro ao enviar relatório via modal compartilhado:', error);
      
      // IMPORTANTE: Reiniciar auto-save em caso de erro para não perder dados
      this.startAutoSaveDraft();
      
      // Se não conseguiu fazer POST (ex: sem internet), salvar rascunho com tudo que tem
      // Payload pode estar null se erro foi em validações iniciais (records, fotos)
      // Nesse caso, não salvar rascunho
      if (!payload) {
        this.ui.showToast(`Falha ao enviar relatório: ${errorMsg}`, 'error');
        return;
      }
      
      // Salvar rascunho para reenvio posterior (com assinatura se tiver, sem se não tiver)
      try {
        console.log('[Report] Salvando rascunho (offline/reconexão necessária):', payload);
        await this.report.savePendingDraft(payload);
        this.saveDraftToStorage();
        this.ui.showToast('Rascunho salvo. Será reenviado quando houver conexão.', 'info', 6000);
      } catch (saveErr) {
        console.error('[Report] Falha ao salvar rascunho localmente:', saveErr);
        this.ui.showToast('Erro ao salvar rascunho localmente.', 'error');
      }
    }
  }

  public async handleSendReport(): Promise<void> {
    let payload: any = null;
    try {
      // IMPORTANTE: Parar auto-save antes de enviar para evitar race conditions
      this.stopAutoSaveDraft();

      // Validar que empresa foi selecionada
      if (!this.selectedClientCompanyId) {
        this.ui.showToast('Selecione uma empresa cliente antes de enviar.', 'warning');
        // Reiniciar auto-save se validação falhou
        this.startAutoSaveDraft();
        return;
      }

      // Validar que pelo menos um registro foi adicionado
      if (!this.records || this.records.length === 0) {
        this.ui.showToast('Adicione pelo menos um registro antes de enviar.', 'warning');
        // Reiniciar auto-save se validação falhou
        this.startAutoSaveDraft();
        return;
      }

      // Validar que cada registro tem pelo menos 1 foto
      for (let i = 0; i < this.records.length; i++) {
        const record = this.records[i];
        if (!record.photos || record.photos.length === 0) {
          this.ui.showToast(`Registro ${i + 1}: Adicione pelo menos 1 foto.`, 'warning');
          // Reiniciar auto-save se validação falhou
          this.startAutoSaveDraft();
          return;
        }
      }

      // Extrair IDs de unidade e setor - converter para number (será enviado como inteiro ao backend)
      // **IMPORTANTE: Usar o ID armazenado na propriedade do componente ao invés do DOM**
      const unitIdValue = (document.getElementById('empresaUnidade') as HTMLSelectElement)?.value?.trim();
      const sectorIdValue = (document.getElementById('empresaSetor') as HTMLSelectElement)?.value?.trim();
      
      // Validar assinaturas
      const techSig = this.getTechSignatureBase64();
      const clientSig = this.getClientSignatureBase64();
      if (!techSig || !clientSig) {
        this.ui.showToast('Ambas as assinaturas (Técnico e Responsável) são obrigatórias.', 'warning');
        // Reiniciar auto-save se validação falhou
        this.startAutoSaveDraft();
        return;
      }

      // Preparar payload conforme DTO: CreateTechnicalVisitRequestDTO
      const visitDateFormatted = this.formatDate((document.getElementById('dataInspecao') as HTMLInputElement)?.value || '');
      const startTimeFormatted = this.formatTime((document.getElementById('reportStartTime') as HTMLInputElement)?.value || '');
      
      payload = {
        title: (document.getElementById('reportTitle') as HTMLInputElement)?.value?.trim() || '',
        clientCompanyId: this.selectedClientCompanyId || null,
        unitId: unitIdValue ? parseInt(unitIdValue) : null,
        sectorId: sectorIdValue ? parseInt(sectorIdValue) : null,
        location: (document.getElementById('localInspecao') as HTMLInputElement)?.value?.trim() || '',
        visitDate: visitDateFormatted || null, // YYYY-MM-DD format para LocalDate do backend
        startTime: startTimeFormatted || null, // HH:mm format para LocalTime do backend
        technicalReferences: Array.from(document.querySelectorAll('#referencesList li'))
          .map(li => li.textContent?.trim() || '')
          .filter(Boolean)
          .join('; '), // String separada por ponto-vírgula
        summary: (document.getElementById('reportSummary') as HTMLTextAreaElement)?.value?.trim() || '',
        findings: this.records.map(r => {
          // Extrair e validar base64 das fotos
          const photo1Base64 = this.stripDataUrl(r.photos[0] || '') || '';
          const photo2Base64 = this.stripDataUrl(r.photos[1] || '') || '';
          
          // Formatar deadline para YYYY-MM-DD ou null
          const deadlineFormatted = r.deadline ? this.formatDate(r.deadline) : null;
          
          return {
            photoBase64_1: photo1Base64,
            photoBase64_2: photo2Base64,
            description: r.description?.trim() || '',
            consequences: r.consequences?.trim() || '',
            legalGuidance: r.legal?.trim() || '',
            responsible: r.responsible?.trim() || '',
            penalties: r.penalties?.trim() || '',
            priority: (r.priority || 'MEDIA').toUpperCase(),
            deadline: deadlineFormatted, // YYYY-MM-DD format para LocalDate do backend
            recurrence: r.unchanged === 'Sim'
          };
        }),
        technicianSignatureImageBase64: techSig || '',
        clientSignatureImageBase64: clientSig || '',
        clientSignerName: (document.getElementById('clientSignerName') as HTMLInputElement)?.value?.trim() || '',
        clientSignatureLatitude: this.geolocation.latitude,
        clientSignatureLongitude: this.geolocation.longitude
      };
      // campo opcional: próxima visita
      try {
        (payload as any).nextVisitDate = this.selectedNextVisitDate && this.selectedNextVisitDate.trim() ? this.selectedNextVisitDate : null;
        console.log('[report] nextVisitDate from component:', this.selectedNextVisitDate);
        console.log('[report] nextVisitDate final payload value:', (payload as any).nextVisitDate);
      } catch(e) { 
        console.error('[report] error capturing nextVisitDate:', e);
        (payload as any).nextVisitDate = null; 
      }

      // campo opcional: turno da próxima visita
      try {
        console.log('[report] selectedNextVisitShift from component:', this.selectedNextVisitShift);
        (payload as any).nextVisitShift = this.selectedNextVisitShift && this.selectedNextVisitShift.trim() ? this.selectedNextVisitShift : null;
        console.log('[report] nextVisitShift final payload value:', (payload as any).nextVisitShift);
      } catch(e) { 
        console.error('[report] error capturing nextVisitShift:', e);
        (payload as any).nextVisitShift = null; 
      }

      console.log('[report] payload to send', payload);
      console.log('[report] findings count:', payload.findings.length);
      console.log('[report] first finding:', JSON.stringify(payload.findings[0], null, 2));
      console.log('[report] visitDate type:', typeof payload.visitDate, '| value:', payload.visitDate);
      console.log('[report] startTime type:', typeof payload.startTime, '| value:', payload.startTime);
      console.log('[report] Full payload JSON:', JSON.stringify(payload, null, 2));
      
      // Log detalhado dos registros para debug
      this.records.forEach((r, idx) => {
        const photo1 = this.stripDataUrl(r.photos[0] || '') || '';
        const photo2 = this.stripDataUrl(r.photos[1] || '') || '';
        console.log(`[Report] Registro ${idx}:`, {
          description: r.description,
          photo1_size: photo1.length,
          photo2_size: photo2.length,
          photo1_valid: photo1.length > 0 ? 'SIM' : 'NÃO',
          photo2_valid: photo2.length > 0 ? 'SIM' : 'NÃO',
          priority: r.priority,
          deadline: r.deadline,
          recurrence: r.unchanged
        });
      });

      // Validar que todas as imagens têm conteúdo válido (não vazio)
      for (let i = 0; i < this.records.length; i++) {
        const record = this.records[i];
        const photo1Base64 = this.stripDataUrl(record.photos[0] || '') || '';
        
        if (!photo1Base64 || photo1Base64.trim().length === 0) {
          this.ui.showToast(`Registro ${i + 1}: Foto inválida ou vazia. Adicione novamente.`, 'warning');
          return;
        }
        
        // Se houver foto 2, validar também
        if (record.photos[1]) {
          const photo2Base64 = this.stripDataUrl(record.photos[1] || '') || '';
          if (photo2Base64.trim().length === 0) {
            console.warn(`[Report] Registro ${i}: Foto 2 está vazia, será ignorada`);
          }
        }
      }

      // Enviar ao backend
      const data = await this.report.postTechnicalVisit(payload);
      
      if (!data) {
        throw new Error('Resposta vazia do servidor');
      }

      console.log('[Report] Visita técnica criada com sucesso:', data);

      // Fechar modal
      // Usar helper consistente para fechar o modal
      this.closeSignatureModal();

      // Limpa pads de assinatura
      try { this.clearAllSignatures(); } catch (_) {}
      this.techPad = null;
      this.clientPad = null;

      // Limpar rascunho
      localStorage.removeItem(this.DRAFT_KEY);
      await this.clearAutoSaveDraft();
      this.records = [];
      this.reportDraft = { records: [] };

      this.ui.showToast('Relatório enviado com sucesso!', 'success', 4000);

      // Nota: A geração automática de PDF no backend está com erro
      // Por enquanto, o usuário pode baixar o PDF manualmente após criação
      // TODO: Investigar o erro de geração de PDF no backend e habilitá-lo depois
    } catch (e) {
      const error = e as any;
      let errorMsg = error.message || 'Erro desconhecido';
      
      // IMPORTANTE: Reiniciar auto-save em caso de erro para não perder dados
      this.startAutoSaveDraft();
      
      // Log detalhado para debug de erro 500
      console.error('=== ERRO AO ENVIAR RELATÓRIO ===');
      console.error('Tipo de erro:', error.constructor.name);
      console.error('Mensagem:', errorMsg);
      console.error('Status:', error.status);
      console.error('Response text:', error.response?.text);
      console.error('Response JSON:', error.response?.json);
      console.error('Stack:', error.stack);
      console.error('Full error object:', error);
      
      this.ui.showToast(`Falha ao enviar relatório: ${errorMsg}`, 'error');
      
      // Salvar rascunho completo para reenvio posterior (inclui imagens de assinatura e fotos)
      if (payload) {
        try {
          console.log('[Report] Salvando rascunho com payload:', payload);
          await this.report.savePendingDraft(payload);
          this.saveDraftToStorage();
          this.ui.showToast('Rascunho salvo localmente. Será reenviado quando houver conexão.', 'info', 6000);
        } catch (saveErr) {
          console.error('[Report] Falha ao salvar rascunho localmente:', saveErr);
          this.ui.showToast('Erro ao salvar rascunho localmente.', 'error');
        }
      } else {
        console.warn('[Report] Payload não está disponível para salvar rascunho');
        this.ui.showToast('Rascunho não pôde ser salvo - payload indisponível.', 'error');
      }
    }
  }

  private getTechSignatureBase64(): string {
    try {
      // Tentar pegar do canvas primeiro (mais direto)
      const canvas = document.getElementById('techSignatureCanvasReport') as HTMLCanvasElement;
      if (canvas) {
        // Crop and export to avoid large transparent margins and keep stroke proportion
        try {
          const dataUrl = this.exportCroppedDataUrlLocal(canvas, 'image/png');
          return this.stripDataUrl(dataUrl) || '';
        } catch (_) {
          const dataUrl = canvas.toDataURL('image/png');
          return this.stripDataUrl(dataUrl) || '';
        }
      }
      
      // Fallback para this.techPad
      if (this.techPad && typeof this.techPad.toDataURL === 'function') {
        const dataUrl = this.techPad.toDataURL('image/png');
        return this.stripDataUrl(dataUrl) || '';
      }
    } catch (e) {
      console.warn('Erro ao obter assinatura técnica', e);
    }
    return '';
  }

  private getClientSignatureBase64(): string {
    try {
      // Tentar pegacar do canvas primeiro (mais direto)
      const canvas = document.getElementById('clientSignatureCanvasReport') as HTMLCanvasElement;
      if (canvas) {
        try {
          const dataUrl = this.exportCroppedDataUrlLocal(canvas, 'image/png');
          return this.stripDataUrl(dataUrl) || '';
        } catch (_) {
          const dataUrl = canvas.toDataURL('image/png');
          return this.stripDataUrl(dataUrl) || '';
        }
      }
      
      // Fallback para this.clientPad
      if (this.clientPad && typeof this.clientPad.toDataURL === 'function') {
        const dataUrl = this.clientPad.toDataURL('image/png');
        return this.stripDataUrl(dataUrl) || '';
      }
    } catch (e) {
      console.warn('Erro ao obter assinatura do cliente', e);
    }
    return '';
  }

  // Local helper to crop a canvas removing transparent margins (similar to SignatureModalComponent)
  private cropCanvasLocal(sourceCanvas: HTMLCanvasElement, alphaThreshold: number = 10): HTMLCanvasElement {
    try {
      const w = sourceCanvas.width;
      const h = sourceCanvas.height;
      const ctx = sourceCanvas.getContext('2d');
      if (!ctx) return sourceCanvas;

      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      let minX = w, minY = h, maxX = 0, maxY = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const alpha = data[idx + 3];
          if (alpha > alphaThreshold) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (maxX < minX || maxY < minY) return sourceCanvas;

      const cropW = maxX - minX + 1;
      const cropH = maxY - minY + 1;
      const out = document.createElement('canvas');
      out.width = cropW;
      out.height = cropH;
      const outCtx = out.getContext('2d');
      if (!outCtx) return sourceCanvas;
      outCtx.drawImage(sourceCanvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
      return out;
    } catch (e) {
      return sourceCanvas;
    }
  }

  // Export cropped canvas to dataURL and optionally resize if wider than maxWidth
  private exportCroppedDataUrlLocal(sourceCanvas: HTMLCanvasElement, type: string = 'image/png', maxWidth: number | null = 1200): string {
    try {
      const cropped = this.cropCanvasLocal(sourceCanvas);
      if (maxWidth && cropped.width > maxWidth) {
        const scale = maxWidth / cropped.width;
        const resized = document.createElement('canvas');
        resized.width = Math.round(cropped.width * scale);
        resized.height = Math.round(cropped.height * scale);
        const rctx = resized.getContext('2d');
        if (rctx) rctx.drawImage(cropped, 0, 0, resized.width, resized.height);
        return resized.toDataURL(type);
      }
      return cropped.toDataURL(type);
    } catch (e) {
      try { return sourceCanvas.toDataURL(type); } catch (_) { return ''; }
    }
  }

  private formatDate(dateString: string): string {
    if (!dateString) return '';
    // Se já está em YYYY-MM-DD, retorna
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return dateString;
    // Tenta converter de DD/MM/YYYY
    const match = dateString.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (match) {
      let day = match[1].padStart(2, '0');
      let month = match[2].padStart(2, '0');
      let year = match[3];
      if (year.length === 2) year = '20' + year;
      return `${year}-${month}-${day}`;
    }
    return '';
  }

  private formatTime(timeString: string): string {
    if (!timeString) return '';
    // Remove segundos se presentes (HH:mm:ss -> HH:mm)
    return timeString.split(':').slice(0, 2).join(':');
  }

  private stripDataUrl(dataUrl: string): string | null {
    if (!dataUrl) return null;
    const parts = dataUrl.split(',');
    return parts.length > 1 ? parts[1] : dataUrl;
  }

  private resizeImageTo6_8cm(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      // Validar tipo de arquivo
      if (!file.type.startsWith('image/')) {
        reject(new Error(`Arquivo inválido: ${file.type}. Deve ser uma imagem.`));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        try {
          const img = new Image();
          
          // Timeout para detectar imagens corrompidas
          const loadTimeout = setTimeout(() => {
            reject(new Error('Timeout ao carregar imagem (pode estar corrompida)'));
          }, 5000);

          img.onload = () => {
            clearTimeout(loadTimeout);
            try {
              // 6.8 cm = 256 pixels (96 DPI padrão PDF) - MÁXIMO em ambas as dimensões
              const maxWidth = 256;
              const maxHeight = 256; // NOVO: Limitar também a altura para não quebrar tabelas
              let width = img.width;
              let height = img.height;

              console.log('[Report] Imagem original:', width, 'x', height, 'pixels, arquivo:', file.name);

              // Calcula a proporção respeitando AMBAS as dimensões máximas
              const widthRatio = width > maxWidth ? maxWidth / width : 1;
              const heightRatio = height > maxHeight ? maxHeight / height : 1;
              const ratio = Math.min(widthRatio, heightRatio);
              
              width = Math.round(width * ratio);
              height = Math.round(height * ratio);

              console.log('[Report] Após redimensionamento:', width, 'x', height, 'pixels');

              // Cria um canvas com as novas dimensões
              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;

              // Desenha a imagem redimensionada no canvas
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                reject(new Error('Falha ao obter contexto 2D do canvas'));
                return;
              }

              ctx.drawImage(img, 0, 0, width, height);

              // Converte para base64 com qualidade máxima (0.99 = quase sem perda)
              try {
                const resizedBase64 = canvas.toDataURL('image/jpeg', 0.99);
                console.log('[Report] ✅ Imagem redimensionada com sucesso para', width, 'x', height, 'pixels (máx 256x256) | Tamanho base64:', (resizedBase64.length / 1024).toFixed(2), 'KB');
                resolve(resizedBase64);
              } catch (toDataUrlError) {
                reject(new Error(`Falha ao converter canvas para base64: ${toDataUrlError}`));
              }
            } catch (drawError) {
              reject(new Error(`Falha ao desenhar imagem no canvas: ${drawError}`));
            }
          };

          img.onerror = () => {
            clearTimeout(loadTimeout);
            reject(new Error('Falha ao carregar imagem (arquivo corrompido ou formato não suportado)'));
          };

          img.src = e.target?.result as string;
        } catch (error) {
          reject(new Error(`Erro durante redimensionamento: ${error}`));
        }
      };

      reader.onerror = () => {
        reject(new Error('Falha ao ler arquivo (permissão ou arquivo danificado)'));
      };

      reader.readAsDataURL(file);
    });
  }

  private resizeImageToBase64(base64String: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // 6.3 cm = 220 pixels (96 DPI padrão PDF) - otimizado entre qualidade e tamanho
        const maxWidth = 220;
        let width = img.width;
        let height = img.height;

        // Calcula a proporção
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        // Cria um canvas com as novas dimensões
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        // Desenha a imagem redimensionada no canvas
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Não foi possível obter contexto 2D do canvas'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        // Converte para base64 com qualidade máxima (0.99 = quase sem perda)
        const resizedBase64 = canvas.toDataURL('image/jpeg', 0.99);
        console.log('[Report] Imagem (base64) redimensionada para', width, 'x', height, 'pixels com qualidade 80%');
        resolve(resizedBase64);
      };
      img.onerror = () => {
        reject(new Error('Falha ao carregar imagem base64'));
      };
      img.src = base64String;
    });
  }

  // Método público para debug - chame via console: document.querySelector('app-report').__ngContext__.lView[8].component.debugUserProfile()
  public async debugUserProfile(): Promise<void> {
    console.log('=== DEBUG USER PROFILE ===');
    const me = await this.legacy.fetchUserProfile();
    console.log('Perfil completo:', me);
    console.log('Chaves:', Object.keys(me || {}));
    console.table(me);
    
    const siglaInput = this.host.nativeElement.querySelector('#responsavelSigla') as HTMLInputElement;
    const regInput = this.host.nativeElement.querySelector('#responsavelRegistro') as HTMLInputElement;
    
    console.log('Input #responsavelSigla:', { exists: !!siglaInput, value: siglaInput?.value, id: siglaInput?.id });
    console.log('Input #responsavelRegistro:', { exists: !!regInput, value: regInput?.value, id: regInput?.id });
    
    // Tenta preencher manualmente
    if (siglaInput && me) {
      const sigla = me.councilAcronym || me.siglaConselhoClasse || me.sigla || me.conselhoSigla || me.councilAcronym || '';
      console.log('Tentando preencher sigla com:', sigla);
      siglaInput.value = sigla;
      siglaInput.dispatchEvent(new Event('input', { bubbles: true }));
      siglaInput.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('Após preencher, valor no input:', siglaInput.value);
    }
    
    if (regInput && me) {
      const reg = me.councilNumber || me.conselhoClasse || me.registro || me.conselhoRegistro || me.registration || me.crm || '';
      console.log('Tentando preencher registro com:', reg);
      regInput.value = reg;
      regInput.dispatchEvent(new Event('input', { bubbles: true }));
      regInput.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('Após preencher, valor no input:', regInput.value);
    }
  }

  // Função de debug para visualizar o payload antes de enviar
  public debugPayload(): void {
    console.log('=== DEBUG PAYLOAD ===');
    console.log('Registros:', this.records.length);
    this.records.forEach((r, idx) => {
      const photo1 = this.stripDataUrl(r.photos[0] || '') || '';
      const photo2 = this.stripDataUrl(r.photos[1] || '') || '';
      console.log(`Registro ${idx}:`, {
        description: r.description,
        consequences: r.consequences,
        legal: r.legal,
        responsible: r.responsible,
        penalties: r.penalties,
        priority: r.priority,
        deadline: r.deadline,
        unchanged: r.unchanged,
        photo1_tamanho: photo1.length,
        photo2_tamanho: photo2.length
      });
    });

    // Captura dados do formulário
    const dataInspacao = (document.getElementById('dataInspecao') as HTMLInputElement)?.value || '';
    const startTime = (document.getElementById('reportStartTime') as HTMLInputElement)?.value || '';
    const responsavel = (document.getElementById('responsavel') as HTMLInputElement)?.value || '';
    const sigla = (document.getElementById('responsavelSigla') as HTMLInputElement)?.value || '';
    const registro = (document.getElementById('responsavelRegistro') as HTMLInputElement)?.value || '';

    console.log('Dados do formulário:', {
      dataInspacao,
      startTime,
      responsavel,
      sigla,
      registro
    });

    // Verifica assinaturas
    const techSig = this.getTechSignatureBase64();
    const clientSig = this.getClientSignatureBase64();
    console.log('Assinaturas:', {
      tech_tamanho: techSig.length,
      client_tamanho: clientSig.length,
      tech_valid: techSig.length > 0 ? 'SIM' : 'NÃO',
      client_valid: clientSig.length > 0 ? 'SIM' : 'NÃO'
    });

    console.log('Geolocalização:', this.geolocation);
  }
}
