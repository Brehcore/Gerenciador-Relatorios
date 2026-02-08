import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { NgSelectModule } from '@ng-select/ng-select';
import { LegacyService } from '../../../services/legacy.service';
import { UiService } from '../../../services/ui.service';
import { CompanyService } from '../../../services/company.service';
import { ClientService, Client } from '../../../services/client.service';
import { CnpjFormatPipe } from '../../../pipes/cnpj-format.pipe';
import { debounceTime, Subject, takeUntil } from 'rxjs';

@Component({
  standalone: true,
  selector: 'app-admin',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NgSelectModule, CnpjFormatPipe, RouterModule],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})
export class AdminComponent implements OnInit, OnDestroy {
  private legacy = inject(LegacyService);
  private ui = inject(UiService);
  private companyService = inject(CompanyService);
  private clientService = inject(ClientService);
  
  // Subject para desinscrever todas as subscriptions
  private destroy$ = new Subject<void>();
  // Array para rastrear timeouts pendentes
  private pendingTimeouts: number[] = [];

  accessDenied = false;
  isAdmin = false;
  loadingUsers = false;
  loadingCompanies = false;
  loadingCompanyForm = false;
  loadingClients = false;
  loadingClientForm = false;
  users: any[] = [];
  companies: any[] = [];
  allCompaniesForModal: any[] = [];
  clients: Client[] = [];

  // Dropdown de usuários
  showUsersDropdown = false;
  showNewUserModal = false;

  // Dropdown e modal de clientes
  showClientsDropdown = false;
  showNewClientModal = false;
  editingClientId: number | null = null;
  showEditClientModal = false;

  // Modal de nova empresa
  showNewCompanyModal = false;
  showCompaniesDropdown = false;

  // Paginação
  currentPage = 0;
  pageSize = 5;
  totalElements = 0;
  totalPages = 0;
  
  // Paginação de usuários (separada)
  usersTotalElements = 0;
  usersTotalPages = 0;

  // Subject para debounce na busca de CNPJ
  private cnpjSearchSubject = new Subject<{ cnpj: string; field: 'company' | 'unit'; index?: number }>();

  // Importação de planilhas
  selectedFile: File | null = null;
  uploadingFile = false;
  importMsg = '';
  isExporting = false;

  // Form state (reactive)
  fb = inject(FormBuilder);
  
  userForm = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    birthDate: ['', Validators.required],
    phone: ['', Validators.required],
    cpf: ['', Validators.required],
    role: ['USER'],
    councilAcronym: [''],
    councilNumber: [''],
    specialty: ['']
  });

  companyForm = this.fb.group({
    companyName: ['', Validators.required],
    companyCnpj: ['', Validators.required]
  });
  // dynamic units/sectors
  dynamicUnits: Array<{ id?: number; name: string; cnpj?: string }> = [];
  dynamicSectors: Array<string | { id: number; name: string }> = [];
  // modal de edição de usuário
  editingUserId: number | null = null;
  showEditUserModal = false;
  editUserForm = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    cpf: [''],
    siglaConselhoClasse: [''],
    conselhoClasse: [''],
    especialidade: ['']
  });
  editUserFormMsg = '';

  // modal de edição de empresa
  editingCompanyId: number | null = null;
  showEditCompanyModal = false;
  editCompanyForm = this.fb.group({
    companyName: ['', Validators.required],
    companyCnpj: ['', Validators.required]
  });
  editCompanyFormMsg = '';

  // messages
  userFormMsg = '';
  companyFormMsg = '';
  clientFormMsg = '';
  editClientFormMsg = '';

  // Form para clientes
  clientForm = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    companyIds: [[] as number[]]
  });

  editClientForm = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    companyIds: [[] as number[]]
  });

  ngOnInit(): void {
    const role = this.legacy.getUserRole() || '';
    const upperRole = String(role).toUpperCase();
    // Aceitar AMBOS os formatos de role (ADMIN ou ROLE_ADMIN)
    this.isAdmin = upperRole === 'ADMIN' || upperRole === 'ROLE_ADMIN';
    // Allow non-admin authenticated users to view clients section. Load only the
    // datasets appropriate for the user's role.
    if (this.isAdmin) {
      this.loadUsers();
      this.loadCompanies();
    }
    // Clients list is available to all authenticated users
    this.loadClients();
    
    // Setup debounced CNPJ search com takeUntil para limpeza automática
    this.cnpjSearchSubject.pipe(
      debounceTime(800),
      takeUntil(this.destroy$)
    ).subscribe(({ cnpj, field, index }) => {
      this.fetchCnpjData(cnpj, field, index);
    });
  }

  ngOnDestroy(): void {
    // Limpar todos os timeouts pendentes
    this.pendingTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    this.pendingTimeouts = [];
    
    // Emitir o sinal de destruição para todas as subscriptions
    this.destroy$.next();
    this.destroy$.complete();
    
    // Limpar subjects
    this.cnpjSearchSubject.complete();
    
    // Garantir que overflow do body está resetado
    try {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    } catch (e) {}
    
    // Fechar todos os modais/dropdowns abertos
    this.showNewUserModal = false;
    this.showEditUserModal = false;
    this.showNewClientModal = false;
    this.showEditClientModal = false;
    this.showNewCompanyModal = false;
    this.showEditCompanyModal = false;
    this.showUsersDropdown = false;
    this.showClientsDropdown = false;
    this.showCompaniesDropdown = false;
  }

  // Helper para criar timeouts que serão limpos automaticamente
  private setTimeout(callback: () => void, delay: number): void {
    const timeoutId = window.setTimeout(() => {
      callback();
      // Remover do array quando executar
      this.pendingTimeouts = this.pendingTimeouts.filter(id => id !== timeoutId);
    }, delay);
    this.pendingTimeouts.push(timeoutId);
  }

  async loadUsers(page: number = 0) {
    this.loadingUsers = true;
    this.currentPage = page;
    try {
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('size', String(this.pageSize));
      
      const url = `${this.legacy.apiBaseUrl}/users?${params.toString()}`;
      const resp = await fetch(url, { headers: this.legacy.authHeaders() });
      if (!resp.ok) throw new Error('Falha ao carregar usuários');
      
      const data = await resp.json();
      
      // Backend retorna: { content: [...], page: { size, number, totalElements, totalPages } }
      if (data && data.content && Array.isArray(data.content) && data.page) {
        this.users = data.content;
        this.usersTotalElements = data.page.totalElements || 0;
        this.usersTotalPages = data.page.totalPages || 0;
      } 
      // Fallback para array simples
      else if (Array.isArray(data)) {
        this.users = data;
        this.usersTotalElements = data.length;
        this.usersTotalPages = 1;
      } else {
        this.users = [];
        this.usersTotalElements = 0;
        this.usersTotalPages = 0;
      }
    } catch (e: any) {
      this.ui.showToast(e?.message || 'Erro ao carregar usuários', 'error');
      this.users = [];
      this.usersTotalElements = 0;
      this.usersTotalPages = 0;
    } finally {
      this.loadingUsers = false;
    }
  }

  nextUsersPage() {
    if (this.currentPage < this.usersTotalPages - 1) {
      this.loadUsers(this.currentPage + 1);
    }
  }

  previousUsersPage() {
    if (this.currentPage > 0) {
      this.loadUsers(this.currentPage - 1);
    }
  }

  goToUsersPage(page: number) {
    if (page >= 0 && page < this.usersTotalPages) {
      this.loadUsers(page);
    }
  }

  onPageSizeChange() {
    this.currentPage = 0;
    this.loadUsers(0);
  }

  getPageNumbers(): number[] {
    if (this.usersTotalPages <= 0) return [];
    
    const pages: number[] = [];
    const maxButtons = 5;
    
    if (this.usersTotalPages <= maxButtons) {
      for (let i = 0; i < this.usersTotalPages; i++) {
        pages.push(i);
      }
    } else {
      const startPage = Math.max(0, this.currentPage - 2);
      const endPage = Math.min(this.usersTotalPages - 1, this.currentPage + 2);
      
      if (startPage > 0) {
        pages.push(0);
        if (startPage > 1) pages.push(-1);
      }
      
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
      
      if (endPage < this.usersTotalPages - 1) {
        if (endPage < this.usersTotalPages - 2) pages.push(-1);
        pages.push(this.usersTotalPages - 1);
      }
    }
    
    return pages;
  }

  async loadClients() {
    this.loadingClients = true;
    try {
      const result = await this.clientService.getAll(0, 999);
      this.clients = result.content || [];
    } catch (e: any) {
      this.ui.showToast(e?.message || 'Erro ao carregar clientes', 'error');
      this.clients = [];
    } finally {
      this.loadingClients = false;
    }
  }

  toggleUsersDropdown() {
    this.showUsersDropdown = !this.showUsersDropdown;
    if (this.showUsersDropdown && this.users.length === 0 && !this.loadingUsers) {
      this.loadUsers();
    }
  }

  toggleClientsDropdown() {
    this.showClientsDropdown = !this.showClientsDropdown;
    if (this.showClientsDropdown && this.clients.length === 0 && !this.loadingClients) {
      this.loadClients();
    }
  }

  toggleCompaniesDropdown() {
    this.showCompaniesDropdown = !this.showCompaniesDropdown;
    if (this.showCompaniesDropdown && this.companies.length === 0 && !this.loadingCompanies) {
      this.loadCompanies();
    }
  }

  openNewCompanyModal() {
    this.showNewCompanyModal = true;
    this.companyForm.reset({ companyName: '', companyCnpj: '' });
    this.dynamicUnits = [];
    this.dynamicSectors = [];
    this.companyFormMsg = '';
  }

  closeNewCompanyModal() {
    this.showNewCompanyModal = false;
    this.companyForm.reset();
    this.dynamicUnits = [];
    this.dynamicSectors = [];
    this.companyFormMsg = '';
  }

  openNewClientModal() {
    this.showNewClientModal = true;
    this.clientForm.reset({ name: '', email: '', companyIds: [] });
    this.clientFormMsg = '';
    this.loadAllCompaniesForModal();
  }

  closeNewClientModal() {
    this.showNewClientModal = false;
    this.clientForm.reset();
    this.clientFormMsg = '';
  }

  async submitCreateClient() {
    this.clientFormMsg = '';
    if (this.clientForm.invalid) {
      this.clientFormMsg = 'Preencha todos os campos obrigatórios corretamente.';
      return;
    }

    const val = this.clientForm.value;
    const payload: Client = {
      name: val.name || '',
      email: val.email || '',
      companyIds: val.companyIds || []
    };

    this.loadingClientForm = true;
    try {
      await this.clientService.create(payload);
      this.clientFormMsg = '✅ Cliente criado com sucesso.';
      this.ui.showToast('Cliente criado com sucesso', 'success');
      this.setTimeout(() => this.closeNewClientModal(), 1500);
      this.loadClients();
    } catch (e: any) {
      this.clientFormMsg = e?.message || String(e);
      this.ui.showToast(e?.message || 'Erro ao criar cliente', 'error');
    } finally {
      this.loadingClientForm = false;
    }
  }

  async openEditClientModal(client: Client) {
    this.editingClientId = client.id || null;
    this.showEditClientModal = true;
    this.editClientFormMsg = '';
    await this.loadAllCompaniesForModal();
    this.editClientForm.patchValue({
      name: client.name,
      email: client.email,
      companyIds: client.companyIds || []
    });
  }

  closeEditClientModal() {
    this.showEditClientModal = false;
    this.editingClientId = null;
    this.editClientForm.reset();
    this.editClientFormMsg = '';
  }

  async submitEditClient() {
    this.editClientFormMsg = '';
    if (this.editClientForm.invalid) {
      this.editClientFormMsg = 'Preencha todos os campos obrigatórios.';
      return;
    }
    if (!this.editingClientId) return;

    const val = this.editClientForm.value;
    const payload: Client = {
      id: this.editingClientId,
      name: val.name || '',
      email: val.email || '',
      companyIds: val.companyIds || []
    };

    this.loadingClientForm = true;
    try {
      await this.clientService.update(this.editingClientId, payload);
      this.editClientFormMsg = '✅ Cliente atualizado com sucesso.';
      this.ui.showToast('Cliente atualizado com sucesso', 'success');
      this.setTimeout(() => this.closeEditClientModal(), 1500);
      this.loadClients();
    } catch (e: any) {
      this.editClientFormMsg = e?.message || String(e);
      this.ui.showToast(e?.message || 'Erro ao atualizar cliente', 'error');
    } finally {
      this.loadingClientForm = false;
    }
  }

  async deleteClient(clientId: number | undefined) {
    if (!clientId) return;
    const proceed = window.confirm('Deseja realmente excluir este cliente? Esta ação não pode ser desfeita.');
    if (!proceed) return;
    
    this.loadingClients = true;
    try {
      await this.clientService.delete(clientId);
      this.ui.showToast('Cliente excluído com sucesso', 'success');
      await this.loadClients();
      this.showClientsDropdown = false;
    } catch (e: any) {
      console.error('[deleteClient] Erro completo:', e);
      
      // Extrai a mensagem de erro mais apropriada
      let errorMsg = e?.message || 'Erro ao excluir cliente';
      
      // Se houver detalhes, tenta formatar melhor a mensagem
      if (e?.details?.message) {
        errorMsg = e.details.message;
      } else if (e?.details?.error) {
        errorMsg = e.details.error;
      }
      
      // Se for erro 409 (Conflict), adiciona emoji
      if (e?.status === 409) {
        errorMsg = `⚠️ ${errorMsg}`;
      }
      
      this.ui.showToast(errorMsg, 'error', 5000);
    } finally {
      this.loadingClients = false;
    }
  }

  async getClientDetails(clientId: number | undefined) {
    if (!clientId) return;
    try {
      const client = await this.clientService.getById(clientId);
      console.log('Detalhes do cliente:', client);
      this.ui.showToast(`Cliente: ${client.name} (${client.email})`, 'success');
    } catch (e: any) {
      this.ui.showToast(e?.message || 'Erro ao buscar detalhes', 'error');
    }
  }

  toggleCompanySelection(companyId: number, isAdding: boolean) {
    const control = isAdding ? this.clientForm.get('companyIds') : this.editClientForm.get('companyIds');
    if (!control) return;
    
    const currentValues = control.value || [];
    if (isAdding) {
      if (currentValues.includes(companyId)) {
        control.setValue(currentValues.filter((id: number) => id !== companyId));
      } else {
        control.setValue([...currentValues, companyId]);
      }
    } else {
      if (currentValues.includes(companyId)) {
        control.setValue(currentValues.filter((id: number) => id !== companyId));
      } else {
        control.setValue([...currentValues, companyId]);
      }
    }
  }

  compareCompanies(c1: any, c2: any): boolean {
    if (!c1 || !c2) return c1 === c2;
    // Se c1 é um ID (número/string) e c2 é um objeto (ou vice-versa)
    const id1 = typeof c1 === 'object' ? c1.id : c1;
    const id2 = typeof c2 === 'object' ? c2.id : c2;
    return id1 === id2;
  }

  openNewUserModal() {
    this.showNewUserModal = true;
    this.userForm.reset({ role: 'USER' });
    this.userFormMsg = '';
  }

  closeNewUserModal() {
    this.showNewUserModal = false;
    this.userForm.reset({ role: 'USER' });
    this.userFormMsg = '';
  }

  async deleteUser(userId: string) {
    if (!userId) return;
    const me = (window as any).__cachedUserMe;
    if (me && me.id && String(me.id) === String(userId)) {
      this.ui.showToast('Você não pode excluir seu próprio usuário.', 'error');
      return;
    }
    const proceed = window.confirm('Deseja realmente excluir este usuário? Esta ação não pode ser desfeita.');
    if (!proceed) return;
    try {
      const delResp = await fetch(`${this.legacy.apiBaseUrl}/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: this.legacy.authHeaders()
      });
      if (!delResp.ok) throw new Error('Falha ao excluir usuário');
      this.ui.showToast('Usuário excluído', 'success');
      this.loadUsers();
    } catch (e: any) {
      this.ui.showToast(e?.message || 'Erro ao excluir', 'error');
    }
  }

  async resetUserPassword(userId: string) {
    if (!userId) return;
    const me = (window as any).__cachedUserMe;
    if (me && me.id && String(me.id) === String(userId)) {
      this.ui.showToast('Você não pode resetar a sua própria senha por aqui.', 'error');
      return;
    }
    const proceed = window.confirm('Deseja realmente resetar a senha deste usuário?');
    if (!proceed) return;
    try {
      const resp = await fetch(`${this.legacy.apiBaseUrl}/users/admin/reset-password/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        headers: this.legacy.authHeaders()
      });
      const txt = await resp.text().catch(() => '');
      if (!resp.ok) {
        let serverMsg = txt || `Erro ao resetar senha (status ${resp.status})`;
        try { const parsed = JSON.parse(txt); serverMsg = parsed.message || parsed.error || serverMsg; } catch(e) {}
        this.ui.showToast(serverMsg, 'error');
        throw new Error(serverMsg);
      }
      this.ui.showToast('Senha resetada com sucesso', 'success');
      this.loadUsers();
    } catch (e: any) {
      this.ui.showToast(e?.message || 'Erro ao resetar senha', 'error');
    }
  }

  openEditUserModal(user: any) {
    this.editingUserId = user.id;
    this.editUserForm.patchValue({
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      cpf: user.cpf || '',
      siglaConselhoClasse: user.siglaConselhoClasse || user.councilAcronym || '',
      conselhoClasse: user.conselhoClasse || user.councilNumber || '',
      especialidade: user.especialidade || user.specialty || ''
    });
    this.showEditUserModal = true;
    this.editUserFormMsg = '';
  }

  closeEditUserModal() {
    this.showEditUserModal = false;
    this.editingUserId = null;
    this.editUserForm.reset();
    this.editUserFormMsg = '';
  }

  async submitEditUser() {
    this.editUserFormMsg = '';
    if (this.editUserForm.invalid) { this.editUserFormMsg = 'Preencha os campos obrigatórios.'; return; }
    if (!this.editingUserId) return;

    const val = this.editUserForm.value;
    const payload = {
      name: val.name,
      email: val.email,
      phone: val.phone || '',
      cpf: val.cpf || '',
      siglaConselhoClasse: val.siglaConselhoClasse || '',
      conselhoClasse: val.conselhoClasse || '',
      especialidade: val.especialidade || ''
    };

    try {
      const resp = await fetch(`${this.legacy.apiBaseUrl}/users/${this.editingUserId}`, {
        method: 'PUT',
        headers: { ...this.legacy.authHeaders() },
        body: JSON.stringify(payload)
      });
      const txt = await resp.text().catch(() => '');
      if (!resp.ok) {
        let serverMsg = txt || `Erro ao atualizar usuário (status ${resp.status})`;
        try { const parsed = JSON.parse(txt); serverMsg = parsed.message || parsed.error || serverMsg; } catch(e) {}
        this.ui.showToast(serverMsg, 'error');
        throw new Error(serverMsg);
      }
      this.editUserFormMsg = 'Usuário atualizado com sucesso.';
      this.ui.showToast('Usuário atualizado com sucesso', 'success');
      this.setTimeout(() => this.closeEditUserModal(), 1500);
      this.loadUsers();
    } catch (e: any) {
      this.editUserFormMsg = e?.message || String(e);
    }
  }

  // create user
  async submitCreateUser() {
    this.userFormMsg = '';
    if (this.userForm.invalid) {
      this.userFormMsg = 'Preencha todos os campos obrigatórios corretamente.';
      return;
    }
    const val = this.userForm.value;
    // birthDate may be yyyy-mm-dd from input type=date; backend expects dd/MM/yyyy
    let birthDate = val.birthDate || '';
    const isoMatch = /^\d{4}-\d{2}-\d{2}$/.test(birthDate);
    if (isoMatch) {
      const [y, m, d] = (birthDate as string).split('-');
      birthDate = `${d}/${m}/${y}`;
    }

    const payload: any = {
      name: val.name,
      email: val.email,
      password: val.password,
      birthDate,
      phone: val.phone,
      cpf: val.cpf,
      role: val.role || null,
      siglaConselhoClasse: val.councilAcronym || '',
      conselhoClasse: val.councilNumber || '',
      especialidade: val.specialty || ''
    };

    try {
      const submitBtn = null; // kept for parity (no direct DOM manipulation)
      const resp = await fetch(`${this.legacy.apiBaseUrl}/users/insert`, {
        method: 'POST',
        headers: { ...this.legacy.authHeaders() },
        body: JSON.stringify(payload)
      });
      const respText = await resp.text().catch(() => '');
      if (!resp.ok) {
        let serverMsg = respText || `Erro ao criar usuário (status ${resp.status})`;
        try { const parsed = JSON.parse(respText); serverMsg = parsed.message || parsed.error || serverMsg; } catch(e) {}
        this.ui.showToast(serverMsg, 'error');
        throw new Error(serverMsg);
      }
      this.userFormMsg = 'Usuário criado com sucesso.';
      this.ui.showToast('Usuário criado com sucesso', 'success');
      this.setTimeout(() => this.closeNewUserModal(), 1500);
      this.loadUsers();
    } catch (e: any) {
      this.userFormMsg = e?.message || String(e);
    }
  }

  // Companies
  async loadCompanies() {
    this.loadingCompanies = true;
    try {
      const response = await this.companyService.getAll(this.currentPage, this.pageSize);
      this.companies = response.content || [];
      this.totalElements = response.page.totalElements;
      this.totalPages = response.page.totalPages;
      this.currentPage = response.page.number;
    } catch (e: any) {
      this.ui.showToast(e?.message || 'Erro ao carregar empresas', 'error');
      this.companies = [];
    } finally { this.loadingCompanies = false; }
  }

  async loadAllCompaniesForModal() {
    try {
      const response = await this.companyService.getAll(0, 999);
      this.allCompaniesForModal = response.content || [];
    } catch (e: any) {
      console.error('Erro ao carregar todas as empresas para modal:', e);
      this.allCompaniesForModal = [];
    }
  }

  async deleteCompany(id: number) {
    if (!confirm('Tem certeza que deseja excluir esta empresa?')) return;
    try {
      const resp = await fetch(`${this.legacy.apiBaseUrl}/companies/${id}`, {
        method: 'DELETE',
        headers: this.legacy.authHeaders()
      });

      if (resp.status === 204) {
        // ✅ Sucesso - empresa excluída
        this.ui.showToast('Empresa excluída com sucesso', 'success');
        this.loadCompanies();
      } else if (resp.status === 409) {
        // ⚠️ Conflict - empresa vinculada a relatórios
        const txt = await resp.text().catch(() => '');
        let msg = 'Esta empresa não pode ser excluída, pois está sendo usada.';
        try {
          const parsed = JSON.parse(txt);
          msg = parsed.message || msg;
        } catch(e) {}
        this.ui.showToast(msg, 'error');
      } else if (resp.status === 404) {
        // ❌ Not Found - empresa não existe
        const txt = await resp.text().catch(() => '');
        let msg = 'Empresa não encontrada.';
        try {
          const parsed = JSON.parse(txt);
          msg = parsed.message || msg;
        } catch(e) {}
        this.ui.showToast(msg, 'error');
        this.loadCompanies();
      } else {
        // ⚠️ Outro erro
        const txt = await resp.text().catch(() => '');
        let msg = `Erro ao excluir empresa (status ${resp.status})`;
        try {
          const parsed = JSON.parse(txt);
          msg = parsed.message || parsed.error || msg;
        } catch(e) {}
        this.ui.showToast(msg, 'error');
      }
    } catch (e: any) {
      this.ui.showToast(e?.message || 'Erro ao excluir empresa', 'error');
    }
  }

  /**
   * Navega para uma página específica
   */
  onPageChange(page: number) {
    if (page < 0 || page >= this.totalPages) return;
    this.currentPage = page;
    this.loadCompanies();
  }

  addUnit(nameInput: HTMLInputElement, cnpjInput: HTMLInputElement) {
    const name = (nameInput?.value || '').trim();
    const cnpj = (cnpjInput?.value || '').trim();
    if (!name) { this.ui.showToast('Nome da unidade é obrigatório', 'error'); return; }
    // CNPJ é opcional na unidade
    if (cnpj && !this.validateCNPJ(cnpj)) { this.ui.showToast('CNPJ inválido', 'error'); return; }
    const cleanCnpj = cnpj ? this.onlyDigits(cnpj) : '';
    this.dynamicUnits.push({ name, ...(cleanCnpj ? { cnpj: cleanCnpj } : {}) });
    nameInput.value = ''; cnpjInput.value = '';
  }

  removeUnit(idx: number) { this.dynamicUnits.splice(idx,1); }

  async removeUnitWithDelete(idx: number) {
    const unit = this.dynamicUnits[idx];
    if (!unit.id) {
      // Unidade nova sem ID, apenas remove da lista
      this.dynamicUnits.splice(idx, 1);
      return;
    }
    try {
      const resp = await fetch(`${this.legacy.apiBaseUrl}/units/${unit.id}`, {
        method: 'DELETE',
        headers: this.legacy.authHeaders()
      });
      if (resp.status === 204) {
        this.dynamicUnits.splice(idx, 1);
        this.ui.showToast('Unidade removida com sucesso', 'success');
      } else if (resp.status === 409) {
        this.ui.showToast('Esta unidade não pode ser excluída, pois está sendo usada...', 'error');
      } else {
        const txt = await resp.text().catch(() => '');
        let msg = `Erro ao remover unidade (status ${resp.status})`;
        try { const parsed = JSON.parse(txt); msg = parsed.message || parsed.error || msg; } catch(e) {}
        this.ui.showToast(msg, 'error');
      }
    } catch (e: any) {
      this.ui.showToast(e?.message || 'Erro ao remover unidade', 'error');
    }
  }

  removeSector(idx: number) { this.dynamicSectors.splice(idx,1); }

  addSector(nameInput: HTMLInputElement) {
    const name = (nameInput?.value || '').trim();
    if (!name) { this.ui.showToast('Nome do setor é obrigatório', 'error'); return; }
    if (this.dynamicSectors.includes(name)) { this.ui.showToast('Este setor já foi adicionado', 'error'); return; }
    this.dynamicSectors.push(name);
    nameInput.value = '';
  }

  async removeSectorWithDelete(idx: number) {
    const sector = this.dynamicSectors[idx];
    if (typeof sector === 'string') {
      // Setor novo sem ID, apenas remove da lista
      this.dynamicSectors.splice(idx, 1);
      return;
    }
    const sectorId = (sector as any).id;
    if (!sectorId) {
      this.dynamicSectors.splice(idx, 1);
      return;
    }
    try {
      const resp = await fetch(`${this.legacy.apiBaseUrl}/sectors/${sectorId}`, {
        method: 'DELETE',
        headers: this.legacy.authHeaders()
      });
      if (resp.status === 204) {
        this.dynamicSectors.splice(idx, 1);
        this.ui.showToast('Setor removido com sucesso', 'success');
      } else if (resp.status === 409) {
        this.ui.showToast('Este setor não pode ser excluído, pois está sendo usado...', 'error');
      } else {
        const txt = await resp.text().catch(() => '');
        let msg = `Erro ao remover setor (status ${resp.status})`;
        try { const parsed = JSON.parse(txt); msg = parsed.message || parsed.error || msg; } catch(e) {}
        this.ui.showToast(msg, 'error');
      }
    } catch (e: any) {
      this.ui.showToast(e?.message || 'Erro ao remover setor', 'error');
    }
  }

  async submitCreateCompany() {
    this.companyFormMsg = '';
    if (this.companyForm.invalid) { this.companyFormMsg = 'Preencha os campos obrigatórios.'; return; }
    const val = this.companyForm.value;
    const cnpj = val.companyCnpj || '';
    if (!this.validateCNPJ(cnpj)) { this.companyFormMsg = 'CNPJ inválido.'; return; }
    const payload: any = {
      name: val.companyName,
      cnpj: this.onlyDigits(cnpj),
      units: this.dynamicUnits
        .map((u: any) => {
          const obj: any = { name: u.name };
          if (u.cnpj && u.cnpj.toString().trim()) {
            obj.cnpj = this.onlyDigits(u.cnpj);
          }
          return obj;
        }),
      sectors: this.dynamicSectors
    };
    this.loadingCompanyForm = true;
    try {
      const resp = await fetch(`${this.legacy.apiBaseUrl}/companies`, {
        method: 'POST',
        headers: { ...this.legacy.authHeaders() },
        body: JSON.stringify(payload)
      });
      const txt = await resp.text().catch(()=>'');
      if (!resp.ok) {
        let serverMsg = txt || `Erro ao criar empresa (status ${resp.status})`;
        try { const parsed = JSON.parse(txt); serverMsg = parsed.message || parsed.error || serverMsg; } catch(e) {}
        this.ui.showToast(serverMsg, 'error');
        throw new Error(serverMsg);
      }
      this.companyFormMsg = '✅ Empresa criada com sucesso!';
      this.ui.showToast('Empresa criada com sucesso', 'success');
      this.setTimeout(() => {
        this.closeNewCompanyModal();
        this.loadCompanies();
      }, 1500);
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      if (errorMsg.includes('Failed to fetch') || errorMsg.toLowerCase().includes('timeout')) {
        this.companyFormMsg = '⚠️ Timeout na conexão. O servidor está demorando mais do que o normal. Tente novamente em alguns segundos...';
      } else {
        this.companyFormMsg = `❌ ${errorMsg}`;
      }
    } finally {
      this.loadingCompanyForm = false;
    }
  }

  // CNPJ helpers (portado do legacy)
  onlyDigits(v: string) { return (v||'').replace(/\D+/g,''); }
  formatCNPJ(v: string) {
    const d = this.onlyDigits(v).slice(0,14);
    if (!d) return '';
    let out = d;
    if (d.length > 2) out = d.slice(0,2)+'.'+d.slice(2);
    if (d.length > 5) out = out.slice(0,6)+'.'+out.slice(6);
    if (d.length > 8) out = out.slice(0,10)+'/'+out.slice(10);
    if (d.length > 12) out = out.slice(0,15)+'-'+out.slice(15);
    return out;
  }
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

  // Buscar dados do CNPJ e preencher razão social
  async fetchCnpjData(cnpj: string, field: 'company' | 'unit', index?: number) {
    const cleanCnpj = this.onlyDigits(cnpj);
    if (!cleanCnpj || cleanCnpj.length !== 14 || !this.validateCNPJ(cleanCnpj)) {
      return; // CNPJ inválido, não fazer a busca
    }

    try {
      const resp = await fetch(`${this.legacy.apiBaseUrl}/external/cnpj/${cleanCnpj}`, {
        headers: this.legacy.authHeaders()
      });
      
      if (!resp.ok) {
        return; // Falha na busca, não preencher nada
      }

      const data = await resp.json();
      // Tenta diferentes chaves possíveis da resposta
      const socialName = data.razao_social || data.socialName || data.nome || data.name || '';

      if (!socialName) {
        return; // Nenhum nome encontrado, não preencher
      }

      if (field === 'company') {
        // Preencher campo de empresa
        this.companyForm.patchValue({ companyName: socialName });
      } else if (field === 'unit' && typeof index === 'number') {
        // Preencher nome da unidade
        if (this.dynamicUnits[index]) {
          this.dynamicUnits[index].name = socialName;
        }
      }
    } catch (e: any) {
      // Silenciosamente ignorar erros na busca automática
      console.debug('Erro ao buscar CNPJ:', e);
    }
  }

  // Trigger busca de CNPJ com debounce
  onCnpjChange(cnpj: string, field: 'company' | 'unit', index?: number) {
    this.cnpjSearchSubject.next({ cnpj, field, index });
  }

  // Busca CNPJ específica para unidade (preenche o input de nome antes de adicionar)
  async onUnitCnpjChange(cnpj: string, nameInput: HTMLInputElement) {
    const cleanCnpj = this.onlyDigits(cnpj);
    if (!cleanCnpj || cleanCnpj.length !== 14 || !this.validateCNPJ(cleanCnpj)) {
      return; // CNPJ inválido, não fazer a busca
    }

    try {
      const resp = await fetch(`${this.legacy.apiBaseUrl}/external/cnpj/${cleanCnpj}`, {
        headers: this.legacy.authHeaders()
      });
      
      if (!resp.ok) {
        return; // Falha na busca, não preencher nada
      }

      const data = await resp.json();
      // Tenta diferentes chaves possíveis da resposta
      const socialName = data.razao_social || data.socialName || data.nome || data.name || '';

      if (socialName && nameInput) {
        nameInput.value = socialName;
      }
    } catch (e: any) {
      // Silenciosamente ignorar erros na busca automática
      console.debug('Erro ao buscar CNPJ:', e);
    }
  }

  // Editar Empresa
  openEditCompanyModal(company: any) {
    this.editingCompanyId = company.id;
    this.editCompanyForm.patchValue({
      companyName: company.name,
      companyCnpj: company.cnpj
    });
    // Limpar unidades: remover cnpj vazio/null
    this.dynamicUnits = (company.units || []).map((u: any) => {
      const obj: any = { name: u.name };
      if (u.cnpj && u.cnpj.toString().trim()) {
        obj.cnpj = u.cnpj;
      }
      return obj;
    });
    // Converter setores do formato de objeto para string (se necessário)
    this.dynamicSectors = (company.sectors || []).map((s: any) => typeof s === 'string' ? s : s.name);
    this.showEditCompanyModal = true;
    this.editCompanyFormMsg = '';
  }

  closeEditCompanyModal() {
    this.showEditCompanyModal = false;
    this.editingCompanyId = null;
    this.editCompanyForm.reset();
    this.dynamicUnits = [];
    this.dynamicSectors = [];
    this.editCompanyFormMsg = '';
  }

  async submitEditCompany() {
    this.editCompanyFormMsg = '';
    if (this.editCompanyForm.invalid) { this.editCompanyFormMsg = 'Preencha os campos obrigatórios.'; return; }
    if (!this.editingCompanyId) return;

    const val = this.editCompanyForm.value;
    const cnpj = val.companyCnpj || '';
    if (!this.validateCNPJ(cnpj)) { this.editCompanyFormMsg = 'CNPJ inválido.'; return; }

    const payload: any = {
      name: val.companyName,
      cnpj: this.onlyDigits(cnpj),
      units: this.dynamicUnits
        .map((u: any) => {
          const obj: any = { name: u.name };
          if (u.cnpj && u.cnpj.toString().trim()) {
            obj.cnpj = this.onlyDigits(u.cnpj);
          }
          return obj;
        }),
      sectors: this.dynamicSectors
    };

    try {
      const resp = await fetch(`${this.legacy.apiBaseUrl}/companies/${this.editingCompanyId}`, {
        method: 'PUT',
        headers: { ...this.legacy.authHeaders() },
        body: JSON.stringify(payload)
      });
      const txt = await resp.text().catch(()=>'');
      if (!resp.ok) {
        let serverMsg = txt || `Erro ao atualizar empresa (status ${resp.status})`;
        try { const parsed = JSON.parse(txt); serverMsg = parsed.message || parsed.error || serverMsg; } catch(e) {}
        this.ui.showToast(serverMsg, 'error');
        throw new Error(serverMsg);
      }
      this.editCompanyFormMsg = 'Empresa atualizada com sucesso.';
      this.ui.showToast('Empresa atualizada com sucesso', 'success');
      this.setTimeout(() => this.closeEditCompanyModal(), 1500);
      this.loadCompanies();
    } catch (e: any) {
      this.editCompanyFormMsg = e?.message || String(e);
    }
  }

  // Download/Exportação de dados
  downloadTemplate() {
    const link = document.createElement('a');
    link.href = '/assets/templates/Planilha-empresas.xlsx';
    link.download = 'Planilha-empresas.xlsx';
    link.click();
  }

  downloadExport() {
    this.isExporting = true;

    try {
      const endpoint = `${this.legacy.apiBaseUrl}/import/export`;
      
      fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
        }
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`Erro ao exportar (status ${response.status})`);
          }
          return response.blob();
        })
        .then(blob => {
          // Cria um link temporário no navegador para baixar o arquivo
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `empresas_exportadas_${new Date().toISOString().split('T')[0]}.xlsx`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          
          this.ui.showToast('Dados exportados com sucesso', 'success');
          this.isExporting = false;
        })
        .catch(error => {
          console.error('Erro ao exportar:', error);
          this.ui.showToast('Erro ao exportar dados: ' + error.message, 'error');
          this.isExporting = false;
        });
    } catch (error: any) {
      console.error('Erro ao exportar:', error);
      this.ui.showToast('Erro ao exportar dados', 'error');
      this.isExporting = false;
    }
  }

  // Importação de planilhas
  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      // Validar se é um arquivo Excel
      const validTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
      if (!validTypes.includes(file.type)) {
        this.ui.showToast('Por favor, selecione um arquivo Excel válido (.xlsx ou .xls)', 'error');
        this.selectedFile = null;
        event.target.value = ''; // Limpar o input
        return;
      }
      this.selectedFile = file;
      this.importMsg = `Arquivo selecionado: ${file.name}`;
    }
  }

  async uploadFile() {
    if (!this.selectedFile) {
      this.ui.showToast('Nenhum arquivo selecionado', 'error');
      return;
    }

    this.uploadingFile = true;
    this.importMsg = '';

    try {
      const formData = new FormData();
      formData.append('file', this.selectedFile);

      // Gerar um ID aleatório para a requisição
      const randomId = Math.random().toString(36).substring(2, 10);
      const endpoint = `${this.legacy.apiBaseUrl}/import/companies?file=${randomId}`;

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
          // NÃO definir Content-Type para FormData - o navegador faz isso automaticamente
        },
        body: formData
      });

      const txt = await resp.text().catch(() => '');
      
      if (!resp.ok) {
        let serverMsg = txt || `Erro ao importar arquivo (status ${resp.status})`;
        try {
          const parsed = JSON.parse(txt);
          serverMsg = parsed.message || parsed.error || serverMsg;
        } catch (e) {}
        this.ui.showToast(serverMsg, 'error');
        this.importMsg = `❌ ${serverMsg}`;
        throw new Error(serverMsg);
      }

      this.importMsg = '✅ Importação realizada com sucesso!';
      this.ui.showToast('Planilha importada com sucesso', 'success');
      
      // Limpar o arquivo selecionado
      this.selectedFile = null;
      const fileInput = document.querySelector('input[type="file"]#fileInput') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      // Recarregar a lista de empresas
      this.setTimeout(() => {
        this.loadCompanies();
        this.importMsg = '';
      }, 1500);
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      if (errorMsg.includes('Failed to fetch') || errorMsg.toLowerCase().includes('timeout')) {
        this.importMsg = '⚠️ Timeout na conexão. O servidor está demorando mais do que o normal. Tente novamente em alguns segundos...';
      } else {
        this.importMsg = `❌ ${errorMsg}`;
      }
    } finally {
      this.uploadingFile = false;
    }
  }

  cancelUpload() {
    this.selectedFile = null;
    this.importMsg = '';
    const fileInput = document.querySelector('input[type="file"]#fileInput') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  }
}
