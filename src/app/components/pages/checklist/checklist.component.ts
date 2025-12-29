import { Component, ViewChild, OnInit, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { formatCNPJ } from '../../../utils/formatters';
import { CommonModule, NgForOf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SignatureModalComponent } from '../../shared/signature-modal/signature-modal.component';
import { LegacyService } from '../../../services/legacy.service';
import { ReportService } from '../../../services/report.service';
import { UiService } from '../../../services/ui.service';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-checklist',
  imports: [CommonModule, FormsModule, NgForOf, SignatureModalComponent],
  templateUrl: '././checklist.component.html',
  styleUrls: ['./checklist.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChecklistComponent implements OnInit {
  @ViewChild('sigModal', { static: false }) sigModal!: SignatureModalComponent;
  private legacy = inject(LegacyService);
  private report = inject(ReportService);
  private ui = inject(UiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  companies: any[] = [];
  filteredCompanies: any[] = [];
  companySearchTerm: string = '';
  showCompanySuggestions: boolean = false;
  jobRoles: any[] = [];
  units: any[] = [];
  sectors: any[] = [];
  loadingCompanies = false;
  // Edit mode: when editing existing checklist
  editingChecklistId: string | null = null;
  editingChecklistData: any = null;
  // function selector state
  companyFunctions: any[] = [];
  showFunctionSelector = false;
  selectedFunction: string = '';
  // functions added to the report
  evaluatedFunctions: Array<{ functionName: string; selectedRiskCodes: number[]; expanded?: boolean }> = [];
  showNewRoleInput = false;
  newRoleName = '';
  showRiskTable = false;
  // confirmation overlay for finalizing report
  showFinalizeConfirm = false;
  
  ngOnInit(): void {
    // Load profile and companies first
    this.loadProfile();
    
    // Then check if we're in edit mode (/checklist/edit/:id)
    // Wait for companies to load before attempting to load checklist
    this.route.params.subscribe(async (params: any) => {
      if (params.id) {
        this.editingChecklistId = params.id;
        // Ensure companies are loaded
        if (!this.companies.length) {
          await this.loadCompanies();
        }
        this.loadExistingChecklist();
      }
    });
    
    // Load companies
    this.loadCompanies();
  }

  async loadExistingChecklist() {
    try {
      if (!this.editingChecklistId) return;
      
      console.log('[ChecklistComponent] loadExistingChecklist - ID:', this.editingChecklistId);
      
      // Fetch existing checklist data from backend
      const data = await this.report.getRiskChecklist(this.editingChecklistId);
      if (!data) {
        this.ui.showToast('Não foi possível carregar o checklist', 'error');
        return;
      }

      console.log('[ChecklistComponent] Dados carregados:', data);

      // Pre-fill form fields
      this.title = data.title || '';
      this.date = data.inspectionDate || '';
      this.company = data.companyId;
      this.evaluatedFunctions = (data.functions || []).map((f: any) => ({
        functionName: f.functionName || '',
        selectedRiskCodes: Array.isArray(f.selectedRiskCodes) ? f.selectedRiskCodes : [],
        expanded: true
      }));

      // If there are functions, enable the risk table display
      if (this.evaluatedFunctions.length > 0) {
        this.showRiskTable = true;
      }

      console.log('[ChecklistComponent] Funções carregadas:', this.evaluatedFunctions);

      // Load company details (CNPJ, units, sectors)
      if (this.company) {
        const selectedCompany = this.companies.find(c => c.id === this.company);
        console.log('[ChecklistComponent] Empresa selecionada:', selectedCompany);
        if (selectedCompany) {
          this.fillCompany(selectedCompany);
          this.loadCompanyFunctions(selectedCompany);
          await this.loadJobRoles(this.company);
        }
      }

      this.cdr.markForCheck();
      this.ui.showToast('Checklist carregado para edição', 'success');
    } catch (err: any) {
      console.warn('[ChecklistComponent] Error loading existing checklist:', err);
      this.ui.showToast(err?.message || 'Erro ao carregar o checklist', 'error');
    }
  }

  async loadProfile(){
    try{
      const me = await this.legacy.fetchUserProfile();
      if (me) {
        this.evaluator = me.name || me.fullName || me.nome || '';
        this.sigla = me.siglaConselhoClasse || me.siglaConselho || me.sigla || '';
        this.registro = me.conselhoClasse || me.registroConselho || me.registro || '';
        const specialty = me.especialidade || me.specialty || me.profissao || me.profession || me.role || me.cargo || me.specialization || '';
        if (specialty) this.especialidade = specialty;
        this.cdr.markForCheck();
      }
    }catch(e){/* ignore */}
  }

  async loadCompanies(){
    this.loadingCompanies = true;
    try{
      const resp = await this.report.fetchCompanies();
      this.companies = Array.isArray(resp) ? resp : [];
      this.filteredCompanies = [...this.companies];
      this.cdr.markForCheck();
    }catch(e:any){ this.ui.showToast(e?.message || 'Erro ao carregar empresas', 'error'); this.companies = []; }
    finally{ this.loadingCompanies = false; this.cdr.markForCheck(); }
  }

  filterCompanies(): void {
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
    this.cdr.markForCheck();
  }

  onCompanyFocus(): void {
    this.showCompanySuggestions = true;
    this.filterCompanies();
  }

  onCompanyBlur(): void {
    setTimeout(() => { this.showCompanySuggestions = false; this.cdr.markForCheck(); }, 180);
  }

  onSearchCompany(event: any): void {
    const input = event.target as HTMLInputElement;
    this.companySearchTerm = input.value;
    this.filterCompanies();
  }

  getCompanyInitials(name: string): string {
    if (!name) return '';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    if (parts.length === 1) return parts[0].slice(0,2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  selectCompanyFromSuggestion(company: any): void {
    try {
      this.company = company.id || company._id || company.name || this.company;
      try { this.onCompanyChange(this.company); } catch(_) {}
      // Atualiza o input visível e esconde sugestões
      try { this.companySearchTerm = company.name || company.razaoSocial || company.nomeFantasia || ''; } catch(_) {}
      this.filteredCompanies = [];
      this.cdr.markForCheck();
    } catch (e) {
      console.warn('[Checklist] Erro ao selecionar empresa via sugestão', e);
    }
  }

  // Limpa seleção de empresa e sincroniza estado do input visível
  clearCompanySelection(): void {
    try {
      this.companySearchTerm = '';
      this.filterCompanies();
      this.company = '';
      try { this.onCompanyChange(this.company); } catch(_) {}
      this.cdr.markForCheck();
    } catch (e) { /* ignore */ }
  }

  onCompanyChange(companyId: any){
    if (!companyId) { this.cnpj = ''; return; }
    const sel = this.companies.find(c => String(c.id || c._id || c.name) === String(companyId) || String(c.id) === String(companyId));
    if (!sel) {
      const byName = this.companies.find(c => c.name === companyId);
      if (byName) { this.fillCompany(byName); return; }
      this.cnpj = '';
      return;
    }
    this.fillCompany(sel);
    // pre-load available functions for the selected company if present
    this.loadCompanyFunctions(sel);
    // fetch job roles from backend for this company
    try { this.loadJobRoles(sel.id || sel._id || sel.id); } catch(_) {}
  }

  async loadJobRoles(companyId: any) {
    try {
      const roles = await this.report.fetchJobRoles(companyId);
      // Use only the 'name' field as requested by frontend design
      this.jobRoles = Array.isArray(roles) ? roles.map((r: any) => (r && (r.name || r)) ) : [];
    } catch (e) {
      console.warn('Não foi possível carregar funções da empresa', e);
      this.jobRoles = [];
    }
  }

  async createJobRole() {
    if (!this.newRoleName || !this.company) { this.ui.showToast('Informe o nome da função e selecione a empresa', 'warning'); return; }
    try {
      const created = await this.report.postJobRole({ name: this.newRoleName, companyId: Number(this.company) });
      if (created) {
        // push only the name into jobRoles (we use only name on the UI)
        const roleName = created && (created.name || created);
        this.jobRoles = [ ...(this.jobRoles || []), roleName ];
        this.selectedFunction = roleName || '';
        this.newRoleName = '';
        this.showNewRoleInput = false;
        this.ui.showToast('Função criada e selecionada', 'success');
      }
    } catch (err:any) {
      this.ui.showToast(err?.message || 'Erro ao criar função', 'error');
    }
  }

  addFunctionToReport() {
    const name = this.selectedFunction;
    if (!name) { this.ui.showToast('Selecione uma função antes de adicionar', 'warning'); return; }
    // prevent duplicates
    if (this.evaluatedFunctions.find(f => f.functionName === name)) { this.ui.showToast('Função já adicionada ao relatório', 'warning'); return; }
    this.evaluatedFunctions.push({ functionName: name, selectedRiskCodes: [], expanded: true });
    this.selectedFunction = '';
    this.showFunctionSelector = false;
    // informar o usuário que a função foi adicionada
    try { this.ui.showToast('Função adicionada com sucesso', 'success'); } catch(e) { /* ignore */ }
    this.cdr.markForCheck();
  }

  removeEvaluatedFunction(idx: number) {
    this.evaluatedFunctions.splice(idx, 1);
    this.cdr.markForCheck();
  }

  confirmRemove(idx: number) {
    const name = this.evaluatedFunctions[idx]?.functionName || 'esta função';
    try {
      const ok = confirm(`Remover ${name} do relatório?`);
      if (ok) {
        this.removeEvaluatedFunction(idx);
        try { this.ui.showToast('Função removida do relatório', 'success'); } catch(e) { /* ignore */ }
      }
    } catch (e) {
      // fallback: remove without confirmation if confirm unavailable
      this.removeEvaluatedFunction(idx);
    }
  }

  toggleRisk(evaluated: any, code: number, event?: Event) {
    // Apenas sincronize o modelo com o estado do checkbox no DOM
    // Deixe o navegador gerenciar o comportamento nativo
    const i = evaluated.selectedRiskCodes.indexOf(code);
    if (i === -1) {
      evaluated.selectedRiskCodes.push(code);
    } else {
      evaluated.selectedRiskCodes.splice(i, 1);
    }
    
    // Remova o foco do checkbox para evitar scroll jump
    const target = (event?.target as HTMLInputElement);
    if (target) target.blur();
    
    // Notifique o Angular que este componente precisa ser verificado
    this.cdr.markForCheck();
  }

  async saveRiskReport(signatureBase64: string | null = null, technicianName: string | null = null) {
    try {
      const companyIdNum = this.company ? Number(this.company) : null;
      if (!companyIdNum) { this.ui.showToast('Selecione uma empresa antes de salvar', 'warning'); return; }
      if (!this.evaluatedFunctions.length) { this.ui.showToast('Adicione pelo menos uma função ao relatório', 'warning'); return; }
      
      // Determine signature value:
      // - If signatureBase64 is explicitly null => send null (no signature)
      // - If signatureBase64 is a string (Base64) => send it as-is
      // - If signatureBase64 is undefined => treat as null (no signature)
      let signatureValue: string | null = null;
      if (typeof signatureBase64 === 'string' && signatureBase64.length > 0) {
        signatureValue = this.stripDataUrl(signatureBase64) || null;
      } else if (signatureBase64 === null || signatureBase64 === undefined) {
        signatureValue = null;
      }
      
      const payload: any = {
        title: this.title || `Checklist de Riscos - ${this.date || new Date().toISOString().slice(0,10)}`,
        companyId: companyIdNum,
        unitId: null,
        sectorId: null,
        inspectionDate: this.date || new Date().toISOString().slice(0,10),
        // Send explicit null when user chose not to sign (backend will handle it)
        // Do NOT send company logo image - backend injects it automatically
        technicianSignatureImageBase64: signatureValue,
        // Enviar também o nome do técnico quando disponível (backend pode armazenar)
        technicianName: technicianName && technicianName.trim() ? technicianName.trim() : null,
        functions: this.evaluatedFunctions.map(f => ({ functionName: f.functionName, selectedRiskCodes: f.selectedRiskCodes }))
      };
      
      // attempt to include unidade and setor as names (backend may ignore)
      if (this.unidade) payload.unitName = this.unidade;
      if (this.setor) payload.sectorName = this.setor;

      // Use PUT if editing, POST if creating new
      let resp: any;
      if (this.editingChecklistId) {
        resp = await this.report.putRiskChecklist(this.editingChecklistId, payload);
        this.ui.showToast('Relatório atualizado com sucesso', 'success');
      } else {
        resp = await this.report.postRiskChecklist(payload);
        this.ui.showToast('Relatório salvo com sucesso', 'success');
      }
      
      // Redirect to documents page after successful save
      setTimeout(() => {
        this.router.navigate(['/documents']);
      }, 1500);
      
      return resp;
    } catch (err:any) {
      console.error(err);
      this.ui.showToast(err?.message || 'Erro ao salvar relatório', 'error');
      throw err;
    }
  }

  // Remove possible data URL prefix: "data:<mime>;base64,...." -> return only base64 part
  private stripDataUrl(dataUrl: string): string | null {
    if (!dataUrl) return null;
    const parts = dataUrl.split(',');
    return parts.length > 1 ? parts[1] : dataUrl;
  }

  fillCompany(sel: any){
    const cnpj = sel.cnpj || sel.CNPJ || sel.companyCnpj || '';
    this.cnpj = cnpj || '';
  }

  // Try to extract functions/roles from selected company object
  loadCompanyFunctions(sel: any){
    if (!sel) { this.companyFunctions = []; return; }
    // common property names that may contain roles/functions
    const candidates = sel.functions || sel.roles || sel.positions || sel.jobTitles || sel.funcoes || sel.cargos;
    if (Array.isArray(candidates) && candidates.length) {
      // normalize to array of { id, name }
      this.companyFunctions = candidates.map((f: any, idx: number) => {
        if (typeof f === 'string') return { id: idx, name: f };
        return { id: f.id || f._id || idx, name: f.name || f.title || f.label || f };
      });
    } else {
      // no functions available on object — clear list
      this.companyFunctions = [];
    }
    // populate units and sectors if available on the company object
    const unitCandidates = sel.units || sel.unidades || sel.branches || sel.filiais || sel.locations;
    if (Array.isArray(unitCandidates) && unitCandidates.length) {
      this.units = unitCandidates.map((u: any, idx: number) => (typeof u === 'string' ? { id: idx, name: u } : { id: u.id || u._id || idx, name: u.name || u.label || u }));
    } else {
      this.units = [];
    }

    const sectorCandidates = sel.sectors || sel.setores || sel.departments || sel.deptos || sel.areas;
    if (Array.isArray(sectorCandidates) && sectorCandidates.length) {
      this.sectors = sectorCandidates.map((s: any, idx: number) => (typeof s === 'string' ? { id: idx, name: s } : { id: s.id || s._id || idx, name: s.name || s.label || s }));
    } else {
      this.sectors = [];
    }
    // reset selection when company changes
    this.selectedFunction = '';
    this.showFunctionSelector = false;
    this.showRiskTable = false;
    // reset selected unit/sector when changing company
    this.unidade = '';
    this.setor = '';
  }

  // user clicked 'Adicionar função'
  addFunction(){
    if (!this.company) { this.ui.showToast('Selecione a empresa antes de adicionar uma função', 'warning'); return; }
    // if we don't have any functions, still show an empty selector as placeholder
    this.showFunctionSelector = true;
  }

  confirmFunction(){
    if (!this.selectedFunction) { this.ui.showToast('Selecione uma função', 'warning'); return; }
    this.showRiskTable = true;
    this.showFunctionSelector = false;
  }

  clearFunction(){
    this.selectedFunction = '';
    this.showRiskTable = false;
    this.showFunctionSelector = false;
  }
  // Header fields (same structure as AEP header visually)
  company = '';
  cnpj = '';
  formatCnpj = (v: string) => formatCNPJ(v || '');
  title = '';  // Título do relatório
  unidade = '';
  setor = '';
  evaluator = '';
  sigla = '';
  registro = '';
  especialidade = '';
  date = '';
  funcao = '';

  // Character limits for inputs
  charLimits = {
    evaluator: 100,
    sigla: 10,
    registro: 50,
    especialidade: 100,
    title: 200
  };

  // checklist items (code, risco, fator)
  items: Array<{ code: number; risco: string; fator: string; checked?: boolean }> = [
    { code: 1, risco: 'FÍSICO', fator: 'Infrassom e sons de baixa frequência' },
    { code: 2, risco: 'FÍSICO', fator: 'Ruído contínuo ou intermitente' },
    { code: 3, risco: 'FÍSICO', fator: 'Ruído impulsivo ou de impacto' },
    { code: 4, risco: 'FÍSICO', fator: 'Ultrassom' },
    { code: 5, risco: 'FÍSICO', fator: 'Campos magnéticos estáticos' },
    { code: 6, risco: 'FÍSICO', fator: 'Campos magnéticos de sub-radiofrequência (30 kHz e abaixo)' },
    { code: 7, risco: 'FÍSICO', fator: 'Sub-radiofrequência (30 kHz e abaixo) e campos eletrostáticos' },
    { code: 8, risco: 'FÍSICO', fator: 'Radiação de radiofrequência' },
    { code: 9, risco: 'FÍSICO', fator: 'Micro-ondas' },
    { code: 10, risco: 'FÍSICO', fator: 'Radiação visível e infravermelho próximo' },
    { code: 11, risco: 'FÍSICO', fator: 'Radiação ultravioleta, exceto radiação na faixa 400 a 320 nm (Luz Negra)' },
    { code: 12, risco: 'FÍSICO', fator: 'Radiação ultravioleta na faixa 400 a 320 nm (Luz Negra)' },
    { code: 13, risco: 'FÍSICO', fator: 'Laser' },
    { code: 14, risco: 'FÍSICO', fator: 'Radiações ionizantes' },
    { code: 15, risco: 'FÍSICO', fator: 'Vibrações localizadas (mão-braço)' },
    { code: 16, risco: 'FÍSICO', fator: 'Vibração de corpo inteiro (aceleração resultante de exposição normalizada – aren)' },
    { code: 17, risco: 'FÍSICO', fator: 'Frio' },
    { code: 18, risco: 'FÍSICO', fator: 'Temperaturas anormais (calor)' },
    { code: 19, risco: 'FÍSICO', fator: 'Pressão hiperbárica' },
    { code: 20, risco: 'FÍSICO', fator: 'Pressão hipobárica' },
    { code: 21, risco: 'FÍSICO', fator: 'Vibração de corpo inteiro (Valor da Dose de Vibração Resultante – VDVR)' },
    { code: 22, risco: 'QUÍMICO', fator: 'Exposição a Fumos Metálicos' },
    { code: 23, risco: 'QUÍMICO', fator: 'Exposição a Poeira' },
    { code: 24, risco: 'QUÍMICO', fator: 'Exposição a Produtos Químicos' },
    { code: 25, risco: 'BIOLÓGICO', fator: 'Agentes biológicos infecciosos e infectocontagiosos' },
    { code: 26, risco: 'ERGONÔMICO', fator: 'Trabalho em posturas incômodas ou pouco confortáveis por longos períodos' },
    { code: 27, risco: 'ERGONÔMICO', fator: 'Postura sentada por longos períodos' },
    { code: 28, risco: 'ERGONÔMICO', fator: 'Postura de pé por longos períodos' },
    { code: 29, risco: 'ERGONÔMICO', fator: 'Frequente deslocamento a pé durante a jornada de trabalho' },
    { code: 30, risco: 'ERGONÔMICO', fator: 'Trabalho com esforço físico intenso' },
    { code: 31, risco: 'ERGONÔMICO', fator: 'Levantamento e transporte manual de cargas ou volumes' },
    { code: 32, risco: 'ERGONÔMICO', fator: 'Frequente ação de puxar/empurrar cargas ou volumes' },
    { code: 33, risco: 'ERGONÔMICO', fator: 'Frequente execução de movimentos repetitivos' },
    { code: 34, risco: 'ERGONÔMICO', fator: 'Manuseio de ferramentas e/ou objetos pesados por longos períodos' },
    { code: 35, risco: 'ERGONÔMICO', fator: 'Exigência de uso frequente de força, pressão, preensão, flexão, extensão ou torção dos segmentos corporais' },
    { code: 36, risco: 'ERGONÔMICO', fator: 'Compressão de partes do corpo por superfícies rígidas ou com quinas' },
    { code: 37, risco: 'ERGONÔMICO', fator: 'Exigência de flexões de coluna vertebral frequentes' },
    { code: 38, risco: 'ERGONÔMICO', fator: 'Uso frequente de pedais' },
    { code: 39, risco: 'ERGONÔMICO', fator: 'Uso frequente de alavancas' },
    { code: 40, risco: 'ERGONÔMICO', fator: 'Exigência de elevação frequente de membros superiores' },
    { code: 41, risco: 'ERGONÔMICO', fator: 'Manuseio ou movimentação de cargas e volumes sem pega ou com “pega pobre”' },
    { code: 42, risco: 'ERGONÔMICO', fator: 'Exposição a vibração de corpo inteiro' },
    { code: 43, risco: 'ERGONÔMICO', fator: 'Exposição a vibrações localizadas (mão-braço)' },
    { code: 44, risco: 'ERGONÔMICO', fator: 'Uso frequente de escadas' },
    { code: 45, risco: 'ERGONÔMICO', fator: 'Trabalho intensivo com teclado ou outros dispositivos de entrada de dados' },
    { code: 46, risco: 'ERGONÔMICO', fator: 'Posto de trabalho improvisado' },
    { code: 47, risco: 'ERGONÔMICO', fator: 'Mobiliário sem meios de regulagem de ajuste' },
    { code: 48, risco: 'ERGONÔMICO', fator: 'Equipamentos e/ou máquinas sem meios de regulagem de ajuste ou sem condições de uso' },
    { code: 49, risco: 'ERGONÔMICO', fator: 'Posto de trabalho não planejado/adaptado para a posição sentada' },
    { code: 50, risco: 'ERGONÔMICO', fator: 'Assento inadequado' },
    { code: 51, risco: 'ERGONÔMICO', fator: 'Encosto do assento inadequado ou ausente' },
    { code: 52, risco: 'ERGONÔMICO', fator: 'Mobiliário ou equipamento sem espaço para movimentação de segmentos corporais' },
    { code: 53, risco: 'ERGONÔMICO', fator: 'Trabalho com necessidade de alcançar objetos, documentos, controles ou qualquer ponto além das zonas de alcance ideais para as características antropométricas do trabalhador' },
    { code: 54, risco: 'ERGONÔMICO', fator: 'Equipamentos ou mobiliários não adaptados à antropometria do trabalhador' },
    { code: 55, risco: 'ERGONÔMICO', fator: 'Condições de trabalho com níveis de pressão sonora fora dos parâmetros de conforto' },
    { code: 56, risco: 'ERGONÔMICO', fator: 'Condições de trabalho com índice de temperatura efetiva fora dos parâmetros de conforto' },
    { code: 57, risco: 'ERGONÔMICO', fator: 'Condições de trabalho com velocidade do ar fora dos parâmetros de conforto' },
    { code: 58, risco: 'ERGONÔMICO', fator: 'Condições de trabalho com umidade do ar fora dos parâmetros de conforto' },
    { code: 59, risco: 'ERGONÔMICO', fator: 'Condições de trabalho com Iluminação diurna inadequada' },
    { code: 60, risco: 'ERGONÔMICO', fator: 'Condições de trabalho com Iluminação noturna inadequada' },
    { code: 61, risco: 'ERGONÔMICO', fator: 'Presença de reflexos em telas, painéis, vidros, monitores ou qualquer superfície, que causem desconforto ou prejudiquem a visualização' },
    { code: 62, risco: 'ERGONÔMICO', fator: 'Piso escorregadio e/ou irregular' },
    { code: 63, risco: 'ERGONÔMICO', fator: 'Excesso de situações de estresse' },
    { code: 64, risco: 'ERGONÔMICO', fator: 'Situações de sobrecarga de trabalho mental' },
    { code: 65, risco: 'ERGONÔMICO', fator: 'Exigência de alto nível de concentração, atenção e memória' },
    { code: 66, risco: 'ERGONÔMICO', fator: 'Trabalho em condições de difícil comunicação' },
    { code: 67, risco: 'ERGONÔMICO', fator: 'Excesso de conflitos hierárquicos no trabalho' },
    { code: 68, risco: 'ERGONÔMICO', fator: 'Excesso de demandas emocionais/afetivas no trabalho' },
    { code: 69, risco: 'ERGONÔMICO', fator: 'Assédio de qualquer natureza no trabalho' },
    { code: 70, risco: 'ERGONÔMICO', fator: 'Trabalho com demandas divergentes (ordens divergentes, metas incompatíveis entre si, entre outras)' },
    { code: 71, risco: 'ERGONÔMICO', fator: 'Exigência de realização de múltiplas tarefas, com alta demanda cognitiva' },
    { code: 72, risco: 'ERGONÔMICO', fator: 'Insatisfação no trabalho' },
    { code: 73, risco: 'ERGONÔMICO', fator: 'Falta de autonomia no trabalho' },
    { code: 74, risco: 'ACIDENTE', fator: 'Diferença de nível menor ou igual a dois metros' },
    { code: 75, risco: 'ACIDENTE', fator: 'Diferença de nível maior que dois metros' },
    { code: 76, risco: 'ACIDENTE', fator: 'Iluminação diurna inadequada' },
    { code: 77, risco: 'ACIDENTE', fator: 'Iluminação noturna inadequada' },
    { code: 78, risco: 'ACIDENTE', fator: 'Condições ou procedimentos que possam provocar contato com eletricidade' },
    { code: 79, risco: 'ACIDENTE', fator: 'Arranjo físico deficiente ou inadequado' },
    { code: 80, risco: 'ACIDENTE', fator: 'Máquinas e equipamentos sem proteção' },
    { code: 81, risco: 'ACIDENTE', fator: 'Armazenamento inadequado' },
    { code: 82, risco: 'ACIDENTE', fator: 'Ferramentas necessitando de ajustes e manutenção' },
    { code: 83, risco: 'ACIDENTE', fator: 'Ferramentas inadequadas' },
    { code: 84, risco: 'ACIDENTE', fator: 'Ambientes com risco de engolfamento' },
    { code: 85, risco: 'ACIDENTE', fator: 'Ambientes com risco de afogamento' },
    { code: 86, risco: 'ACIDENTE', fator: 'Áreas classificadas' },
    { code: 87, risco: 'ACIDENTE', fator: 'Queda de objetos' },
    { code: 88, risco: 'ACIDENTE', fator: 'Intempéries' },
    { code: 89, risco: 'ACIDENTE', fator: 'Ambientes com risco de soterramento' },
    { code: 90, risco: 'ACIDENTE', fator: 'Animais peçonhentos' },
    { code: 91, risco: 'ACIDENTE', fator: 'Animais selvagens' },
    { code: 92, risco: 'ACIDENTE', fator: 'Mobiliário e/ou superfícies com quinas vivas, rebarbas ou elementos de fixação expostos' },
    { code: 93, risco: 'ACIDENTE', fator: 'Pisos, passagens, passarelas, plataformas, rampas e corredores com saliências, descontinuidades, aberturas ou obstruções, ou escorregadios' },
    { code: 94, risco: 'ACIDENTE', fator: 'Escadas e rampas inadequadas' },
    { code: 95, risco: 'ACIDENTE', fator: 'Superfícies e/ou materiais aquecidos expostos' },
    { code: 96, risco: 'ACIDENTE', fator: 'Superfícies e/ou materiais em baixa temperatura expostos' },
    { code: 97, risco: 'ACIDENTE', fator: 'Áreas de trânsito de pedestres ou veículos sem demarcação' },
    { code: 98, risco: 'ACIDENTE', fator: 'Áreas de movimentação de materiais sem demarcação' },
    { code: 99, risco: 'ACIDENTE', fator: 'Condução de veículos de qualquer natureza em vias públicas' },
    { code: 100, risco: 'ACIDENTE', fator: 'Objetos cortantes e/ou perfurocortantes' },
    { code: 101, risco: 'ACIDENTE', fator: 'Movimentação de materiais' },
    { code: 102, risco: 'ACIDENTE', fator: 'Máquinas e equipamentos necessitando ajustes e manutenção' },
    { code: 103, risco: 'ACIDENTE', fator: 'Procedimentos de ajuste, limpeza, manutenção e inspeção deficientes ou inexistentes' }
  ];

  get riskGroups() {
    const map = new Map<string, Array<any>>();
    for (const it of this.items) {
      const k = (it.risco || 'OUTROS').toString();
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    }
    return Array.from(map.entries()).map(([key, value]) => ({ key, value }));
  }

  trackByRisk(index: number, item: any): number {
    return item.code; // O código do risco é um ID único
  }

  toggle(item: any, ev: Event) {
    // Apenas sincronize o modelo com o estado do checkbox no DOM
    // Deixe o navegador gerenciar o comportamento nativo
    const target = ev.target as HTMLInputElement;
    item.checked = target.checked;
    
    // Remova o foco do checkbox para evitar scroll jump
    target.blur();
  }

  // retorno simplificado: listar códigos selecionados
  get selectedCodes() {
    return this.items.filter(i => i.checked).map(i => i.code);
  }

  saveSelection() {
    // por ora salvar no localStorage e logar
    const selected = this.selectedCodes;
    try {
      localStorage.setItem('checklist:selectedCodes', JSON.stringify(selected));
    } catch (e) { /* ignore */ }
    // expor via console para depuração (evitar uso direto de `console` no template)
    // Mas este método pode ser ligado ao backend mais tarde.
    // eslint-disable-next-line no-console
    console.log('Checklist selecionados:', selected);
  }

  openSignatureModal() {
    // salvar seleção antes de abrir
    this.saveSelection();
    try {
      if (this.sigModal && typeof this.sigModal.open === 'function') {
        this.sigModal.techOnly = true;
        this.sigModal.open();
      }
    } catch (e) {
      // se por algum motivo o modal falhar, logar para debug
      // eslint-disable-next-line no-console
      console.error('Falha ao abrir o modal de assinatura:', e);
    }
  }

  // Start finalize flow: show confirmation choices (assinar ou salvar sem assinar)
  finalizeReport() {
    this.showFinalizeConfirm = true;
  }

  // User chose to open the signature modal and then submit with signature
  onConfirmSign() {
    this.showFinalizeConfirm = false;
    // open signature modal; after the user confirms inside the modal, onTechSignature will be called
    this.openSignatureModal();
  }

  // User chose to save without signature -> send payload with explicit null
  async onConfirmNoSign() {
    this.showFinalizeConfirm = false;
    try {
      await this.saveRiskReport(null, null);
    } catch (e) {
      // error handling already done in saveRiskReport
    }
  }

  // receber assinatura do técnico e persistir junto com seleção
  onTechSignature(payload: { techName: string; techSignature: string; clientName: string; clientSignature: string; geolocation?: any }) {
    const sel = this.selectedCodes;
    const out = {
      selectedCodes: sel,
      technician: {
        name: payload.techName || '',
        signature: payload.techSignature || '',
      },
      geolocation: payload.geolocation || null,
      timestamp: new Date().toISOString()
    };
    try {
      localStorage.setItem('checklist:submission', JSON.stringify(out));
    } catch (e) {}
    // eslint-disable-next-line no-console
    console.log('Checklist salvo com assinatura do técnico:', out);
    // Após receber assinatura do modal, enviar o relatório com a assinatura em Base64
    const sig = payload.techSignature || '';
    try { this.saveRiskReport(sig, payload.techName || null); } catch(e) { /* saveRiskReport already shows toasts */ }
  }

}
