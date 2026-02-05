import { Component, OnInit, OnDestroy, inject, ViewChildren, QueryList } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgSelectModule, NgSelectComponent } from '@ng-select/ng-select';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { CompanyService } from '../../../services/company.service';
import { LegacyService } from '../../../services/legacy.service';
import { UiService } from '../../../services/ui.service';
import { Router } from '@angular/router';
import { formatCNPJ } from '../../../utils/formatters';
import { ClientService } from '../../../services/client.service';

@Component({
  standalone: true,
  selector: 'app-cadastros',
  imports: [CommonModule, FormsModule, NgSelectModule],
  templateUrl: './cadastros.component.html',
  styleUrls: ['./cadastros.component.css']
})
export class CadastrosComponent implements OnInit, OnDestroy {
  private companyService = inject(CompanyService);
  private legacy = inject(LegacyService);
  private ui = inject(UiService);
  private router = inject(Router);

  companyName = '';
  companyCnpj = '';
  submitting = false;

  // Estado para edição de empresa
  showEditCompanyModal = false;
  editingCompanyId: number | null = null;
  editCompanyName = '';
  editCompanyCnpj = '';
  editDynamicUnits: Array<{ id?: number; name: string; cnpj?: string }> = [];
  editDynamicSectors: Array<string | { id: number; name: string }> = [];
  editSubmitting = false;

  // Estado para edição de cliente
  showEditClientModal = false;
  editingClientId: number | null = null;
  editClientName = '';
  editClientEmail = '';
  editSelectedCompanyIds: number[] = [];
  editClientSubmitting = false;

  isUser = false;

  // CLIENT FORM
  clientName = '';
  clientEmail = '';
  clientCompanyIds = '';// comma separated
  clientCompanyNames = '';// comma separated
  clientSubmitting = false;

  private clientService = inject(ClientService);

  // selections for client companies (ng-select)
  selectedCompanyIds: number[] = [];

  // dynamic units/sectors for company
  dynamicUnits: Array<{ id?: number; name: string; cnpj?: string }> = [];
  dynamicSectors: Array<string | { id: number; name: string }> = [];
  sectorInput = '';

  // cnpj debounce
  private cnpjSearchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  allCompaniesForModal: any[] = [];

  @ViewChildren(NgSelectComponent) ngSelects!: QueryList<NgSelectComponent>;

  // Lists for display
  companiesList: any[] = [];
  clientsList: any[] = [];
  showCompaniesList = false;
  showClientsList = false;

  // Paginação
  companiesPage = 0;
  companiesPageSize = 5;
  companiesTotalElements = 0;
  companiesTotalPages = 0;

  clientsPage = 0;
  clientsPageSize = 5;
  clientsTotalElements = 0;
  clientsTotalPages = 0;

  isCnpjValid(): boolean {
    return this.validateCNPJ(this.companyCnpj);
  }

  onCnpjChange(value: string) {
    this.companyCnpj = formatCNPJ(value || '');
    this.cnpjSearchSubject.next(this.companyCnpj);
  }

  async ngOnInit() {
    const role = this.legacy.getUserRole() || '';
    this.isUser = String(role).toUpperCase() === 'USER';
    // debounce CNPJ search and fetch company name
    this.cnpjSearchSubject.pipe(debounceTime(700), takeUntil(this.destroy$)).subscribe(c => {
      this.fetchCnpjData(c);
    });
    // preload companies for client selector and list
    await this.loadAllCompaniesForModal();
    // Load initial lists
    await this.loadCompaniesList();
    await this.loadClientsList();
  }

  ngOnDestroy(): void {
    try { this.destroy$.next(); this.destroy$.complete(); } catch(_) {}
  }

  async submit() {
    if (!this.companyName || !this.companyCnpj) {
      this.ui.showToast('Preencha o nome e o CNPJ da empresa', 'warning');
      return;
    }
    this.submitting = true;
    try {
      // build payload including units/sectors
      const payload = {
        name: this.companyName,
        cnpj: this.onlyDigits(this.companyCnpj),
        units: this.dynamicUnits.map(u => ({ name: u.name, ...(u.cnpj ? { cnpj: this.onlyDigits(u.cnpj) } : {}) })),
        sectors: this.dynamicSectors
      };
      const created = await this.companyService.create(payload as any);
      this.ui.showToast('Empresa cadastrada com sucesso', 'success');
      // limpar formulário e listas
      this.companyName = '';
      this.companyCnpj = '';
      this.dynamicUnits = [];
      this.dynamicSectors = [];
      // Recarregar lista de empresas
      await this.loadCompaniesList();
    } catch (err: any) {
      // Mostrar mensagem do backend quando disponível
      const msg = err?.message || 'Erro ao cadastrar empresa';
      const isWarning = err?.status === 409;
      const isForbidden = err?.status === 403;
      this.ui.showToast(msg, isForbidden ? 'error' : (isWarning ? 'warning' : 'error'), 6000);
      // NÃO navegar nem limpar formulário em caso de erro
      throw err;
    } finally {
      this.submitting = false;
    }
  }

  isEmailValid(email: string) {
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  }

  parseIds(raw: string) {
    return (raw||'').split(',').map(s=>s.trim()).filter(Boolean).map(s=>parseInt(s,10)).filter(n=>!isNaN(n));
  }

  parseNames(raw: string) {
    return (raw||'').split(',').map(s=>s.trim()).filter(Boolean);
  }

  compareCompanies(c1: any, c2: any): boolean {
    if (!c1 || !c2) return c1 === c2;
    const id1 = typeof c1 === 'object' ? c1.id : c1;
    const id2 = typeof c2 === 'object' ? c2.id : c2;
    return id1 === id2;
  }

  // Company helpers copied from Admin
  onlyDigits(v: string) { return (v||'').replace(/\D+/g,''); }

  validateCNPJ(cnpj: string) {
    const str = this.onlyDigits(cnpj);
    if (str.length !== 14) return false;
    if (/^(\d)\1+$/.test(str)) return false;
    const calc = (base: string) => {
      const factor = base.length === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
      const sum = base.split('').reduce((acc, cur, idx) => acc + parseInt(cur,10)*factor[idx], 0);
      const mod = sum % 11;
      return (mod < 2) ? 0 : 11 - mod;
    };
    const d1 = calc(str.slice(0,12));
    const d2 = calc(str.slice(0,12)+d1);
    return str.endsWith(String(d1)+String(d2));
  }

  addUnit(name: string, cnpj?: string) {
    const n = (name||'').trim();
    const c = (cnpj||'').trim();
    if (!n) { this.ui.showToast('Nome da unidade é obrigatório', 'error'); return; }
    if (c && !this.validateCNPJ(c)) { this.ui.showToast('CNPJ inválido na unidade', 'error'); return; }
    this.dynamicUnits.push({ name: n, ...(c ? { cnpj: this.onlyDigits(c) } : {}) });
  }

  removeUnit(idx: number) { this.dynamicUnits.splice(idx,1); }

  addSector(name: string) { const n = (name||'').trim(); if (!n) return; this.dynamicSectors.push(n); }

  removeSector(idx: number) { this.dynamicSectors.splice(idx,1); }

  async fetchCnpjData(cnpj: string) {
    const clean = this.onlyDigits(cnpj);
    if (!clean || clean.length !== 14 || !this.validateCNPJ(clean)) return;
    try {
      const resp = await fetch(`${this.legacy.apiBaseUrl}/external/cnpj/${clean}`, { headers: this.legacy.authHeaders() });
      if (!resp.ok) return;
      const data = await resp.json();
      const socialName = data.razao_social || data.socialName || data.nome || data.name || '';
      if (socialName) this.companyName = socialName;
    } catch (e) { console.debug('Erro fetchCnpjData', e); }
  }

  async loadAllCompaniesForModal() {
    try {
      const response = await this.companyService.getAll(0, 999);
      this.allCompaniesForModal = response.content || [];
    } catch (e: any) { this.allCompaniesForModal = []; }
  }

  async loadCompaniesList() {
    try {
      const response = await this.companyService.getAll(this.companiesPage, this.companiesPageSize);
      this.companiesList = response.content || [];
      this.companiesTotalElements = response.page?.totalElements || 0;
      this.companiesTotalPages = response.page?.totalPages || 0;
    } catch (err: any) {
      console.error('Erro ao carregar empresas:', err);
      this.companiesList = [];
    }
  }

  async loadClientsList() {
    try {
      const response = await this.clientService.getAll(this.clientsPage, this.clientsPageSize);
      this.clientsList = response.content || [];
      this.clientsTotalElements = response.page?.totalElements || 0;
      this.clientsTotalPages = response.page?.totalPages || 0;
    } catch (err: any) {
      console.error('Erro ao carregar clientes:', err);
      this.clientsList = [];
    }
  }

  toggleCompaniesList() {
    this.showCompaniesList = !this.showCompaniesList;
    if (this.showCompaniesList) {
      this.loadCompaniesList();
    }
  }

  toggleClientsList() {
    this.showClientsList = !this.showClientsList;
    if (this.showClientsList) {
      this.loadClientsList();
    }
  }

  getUnitNames(company: any): string {
    if (!company.units || !Array.isArray(company.units)) return '';
    return company.units.map((u: any) => u.name).join(', ');
  }

  getClientCompanyNames(client: any): string {
    if (client.companies && Array.isArray(client.companies)) {
      return client.companies.map((c: any) => c.name).join(', ');
    }
    if (client.companyNames && Array.isArray(client.companyNames)) {
      return client.companyNames.join(', ');
    }
    return '';
  }

  // Paginação de empresas
  onCompaniesPageSizeChange() {
    this.companiesPage = 0;
    this.loadCompaniesList();
  }

  async previousCompaniesPage() {
    if (this.companiesPage > 0) {
      this.companiesPage--;
      await this.loadCompaniesList();
    }
  }

  async nextCompaniesPage() {
    if (this.companiesPage < this.companiesTotalPages - 1) {
      this.companiesPage++;
      await this.loadCompaniesList();
    }
  }

  async goToCompaniesPage(page: number) {
    if (page >= 0 && page < this.companiesTotalPages) {
      this.companiesPage = page;
      await this.loadCompaniesList();
    }
  }

  // Paginação de clientes
  onClientsPageSizeChange() {
    this.clientsPage = 0;
    this.loadClientsList();
  }

  async previousClientsPage() {
    if (this.clientsPage > 0) {
      this.clientsPage--;
      await this.loadClientsList();
    }
  }

  async nextClientsPage() {
    if (this.clientsPage < this.clientsTotalPages - 1) {
      this.clientsPage++;
      await this.loadClientsList();
    }
  }

  async goToClientsPage(page: number) {
    if (page >= 0 && page < this.clientsTotalPages) {
      this.clientsPage = page;
      await this.loadClientsList();
    }
  }

  getPageNumbers(totalPages: number, currentPage: number): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 0; i < totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(0);
      
      let start = Math.max(1, currentPage - 1);
      let end = Math.min(totalPages - 2, currentPage + 1);
      
      if (start > 1) pages.push(-1); // ellipsis
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (end < totalPages - 2) pages.push(-1); // ellipsis
      
      pages.push(totalPages - 1);
    }
    
    return pages;
  }

  async submitClient() {
    if (!this.clientName || !this.clientEmail) {
      this.ui.showToast('Preencha nome e email do cliente', 'warning');
      return;
    }
    if (!this.isEmailValid(this.clientEmail)) {
      this.ui.showToast('Email inválido', 'warning');
      return;
    }
    this.clientSubmitting = true;
    try {
      // build payload using selectedCompanyIds and derive names
      const companyIds = (this.selectedCompanyIds || []).slice();
      const companyNames = (this.allCompaniesForModal || []).filter(c => companyIds.includes(c.id)).map(c => c.name);
      const payload = {
        id: 0,
        name: this.clientName,
        email: this.clientEmail,
        companyIds,
        companyNames
      };
      const created = await this.clientService.create(payload as any);
      this.ui.showToast('Cliente cadastrado com sucesso', 'success');
      // Limpar formulário
      this.clientName = '';
      this.clientEmail = '';
      this.selectedCompanyIds = [];
      // Recarregar lista de clientes
      await this.loadClientsList();
    } catch (err: any) {
      const msg = err?.message || 'Erro ao cadastrar cliente';
      const isForbidden = err?.status === 403;
      this.ui.showToast(msg, isForbidden ? 'error' : 'error', 6000);
      // NÃO limpar formulário em caso de erro
      throw err;
    } finally {
      this.clientSubmitting = false;
    }
  }

  openEditCompanyModal(company: any) {
    this.closeAllNgSelects();
    this.editingCompanyId = company.id;
    this.editCompanyName = company.name;
    this.editCompanyCnpj = formatCNPJ(company.cnpj);
    this.editDynamicUnits = (company.units || []).map((u: any) => ({
      id: u.id,
      name: u.name,
      cnpj: u.cnpj ? formatCNPJ(u.cnpj) : ''
    }));
    this.editDynamicSectors = company.sectors || [];
    this.showEditCompanyModal = true;
  }

  closeEditCompanyModal() {
    this.showEditCompanyModal = false;
    this.editingCompanyId = null;
    this.editCompanyName = '';
    this.editCompanyCnpj = '';
    this.editDynamicUnits = [];
    this.editDynamicSectors = [];
  }

  closeAllNgSelects() {
    try {
      // Close via component API when available
      if (this.ngSelects && this.ngSelects.length) {
        this.ngSelects.forEach(s => {
          try { s.close(); } catch(_) {}
        });
      }

      // Remove opened classes and hide any leftover panels
      try {
        document.querySelectorAll('.ng-select-opened').forEach(el => el.classList.remove('ng-select-opened'));
        document.querySelectorAll('.ng-dropdown-panel').forEach(el => {
          try { (el as HTMLElement).style.display = 'none'; } catch(_) {}
        });
      } catch (_) {}

      // Blur any active combobox input
      try {
        const active = document.activeElement as HTMLElement | null;
        if (active && active.tagName === 'INPUT' && active.getAttribute('role') === 'combobox') {
          try { (active as HTMLInputElement).blur(); } catch(_) {}
        }
      } catch(_) {}

      // fallback: click on body to close listeners
      try { document.body.click(); } catch(_) {}
    } catch(_) {}
  }

  addEditUnit(name: string, cnpj?: string) {
    const n = (name || '').trim();
    const c = (cnpj || '').trim();
    if (!n) {
      this.ui.showToast('Nome da unidade é obrigatório', 'error');
      return;
    }
    if (c && !this.validateCNPJ(c)) {
      this.ui.showToast('CNPJ inválido na unidade', 'error');
      return;
    }
    this.editDynamicUnits.push({ name: n, ...(c ? { cnpj: this.onlyDigits(c) } : {}) });
  }

  removeEditUnit(idx: number) {
    this.editDynamicUnits.splice(idx, 1);
  }

  addEditSector(name: string) {
    const n = (name || '').trim();
    if (!n) return;
    this.editDynamicSectors.push(n);
  }

  removeEditSector(idx: number) {
    this.editDynamicSectors.splice(idx, 1);
  }

  async submitEditCompany() {
    if (!this.editCompanyName || !this.editCompanyCnpj || !this.editingCompanyId) {
      this.ui.showToast('Preencha o nome e o CNPJ da empresa', 'warning');
      return;
    }
    this.editSubmitting = true;
    try {
      const payload = {
        name: this.editCompanyName,
        cnpj: this.onlyDigits(this.editCompanyCnpj),
        units: this.editDynamicUnits.map(u => ({
          ...(u.id ? { id: u.id } : {}),
          name: u.name,
          ...(u.cnpj ? { cnpj: this.onlyDigits(u.cnpj) } : {})
        })),
        sectors: this.editDynamicSectors
      };
      await this.companyService.update(this.editingCompanyId, payload as any);
      this.ui.showToast('Empresa atualizada com sucesso', 'success');
      this.closeEditCompanyModal();
      // Recarregar lista de empresas
      await this.loadCompaniesList();
      await this.loadAllCompaniesForModal();
    } catch (err: any) {
      const msg = err?.message || 'Erro ao atualizar empresa';
      const isForbidden = err?.status === 403;
      this.ui.showToast(msg, isForbidden ? 'error' : 'error', 6000);
      throw err;
    } finally {
      this.editSubmitting = false;
    }
  }

  openEditClientModal(client: any) {
    this.closeAllNgSelects();
    this.editingClientId = client.id;
    this.editClientName = client.name;
    this.editClientEmail = client.email;
    this.editSelectedCompanyIds = client.companyIds || [];
    this.showEditClientModal = true;
  }

  closeEditClientModal() {
    this.showEditClientModal = false;
    this.editingClientId = null;
    this.editClientName = '';
    this.editClientEmail = '';
    this.editSelectedCompanyIds = [];
  }

  async submitEditClient() {
    if (!this.editClientName || !this.editClientEmail || !this.editingClientId) {
      this.ui.showToast('Preencha nome e email do cliente', 'warning');
      return;
    }
    if (!this.isEmailValid(this.editClientEmail)) {
      this.ui.showToast('Email inválido', 'warning');
      return;
    }
    this.editClientSubmitting = true;
    try {
      const companyIds = (this.editSelectedCompanyIds || []).slice();
      const payload = {
        id: this.editingClientId,
        name: this.editClientName,
        email: this.editClientEmail,
        companyIds,
        companyNames: (this.allCompaniesForModal || []).filter(c => companyIds.includes(c.id)).map(c => c.name)
      };
      await this.clientService.update(this.editingClientId, payload as any);
      this.ui.showToast('Cliente atualizado com sucesso', 'success');
      this.closeEditClientModal();
      // Recarregar lista de clientes
      await this.loadClientsList();
    } catch (err: any) {
      const msg = err?.message || 'Erro ao atualizar cliente';
      const isForbidden = err?.status === 403;
      this.ui.showToast(msg, isForbidden ? 'error' : 'error', 6000);
      throw err;
    } finally {
      this.editClientSubmitting = false;
    }
  }
}
