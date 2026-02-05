import { Component, EventEmitter, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UiService } from '../../../services/ui.service';

export type AgendaModalMode = 'create' | 'edit' | 'reschedule' | 'view';

export interface AgendaModalData {
  mode: AgendaModalMode;
  title: string;
  description?: string | null;
  date?: string;
  reason?: string | null;
  shift?: 'MANHA' | 'TARDE'; // Turno do evento/visita (agora)
  
  // campos extras para visualização (dados híbridos)
  type?: string | null;
  referenceId?: number | null;
  clientName?: string | null;      // Nome da empresa
  unitName?: string | null;
  sectorName?: string | null;
  originalVisitDate?: string | null;
  sourceVisitId?: number | null;   // Indica se é Visita Oficial
  nextVisitDate?: string | null;   // Data da próxima visita agendada
  nextVisitShift?: 'MANHA' | 'TARDE'; // Turno da próxima visita agendada
  responsibleName?: string | null;
}

@Component({
  selector: 'app-agenda-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-overlay" *ngIf="isOpen" (click)="cancel()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <div class="modal-title">
            <svg class="icon-calendar" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 10h5v5H7z" opacity=".3"></path><path fill="currentColor" d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"></path></svg>
            <h3>{{ getModalTitle() }}</h3>
          </div>
          <button class="close-btn" (click)="cancel()" aria-label="Fechar">✕</button>
        </div>

        <div class="modal-body">
          <!-- VIEW: Mostrar detalhes do evento e ações -->
          <ng-container *ngIf="mode === 'view'">
            <div class="details-card">
              <div class="details-header">
                <div class="details-left">
                  <div class="details-title">{{ formData.title }}</div>
                  <div class="details-sub">{{ formData.unitName || '—' }} • {{ formData.sectorName || '—' }}</div>
                </div>
                <div class="details-right">
                  <span class="badge-type">{{ (formData.type || 'EVENTO') | uppercase }}</span>
                  <div class="details-date">{{ formatDateToBrazil(formData.date) }}</div>
                </div>
              </div>

              <div class="details-body">
                <div class="details-row" *ngIf="formData.description">
                  <div class="label">Descrição</div>
                  <div class="value view-desc">{{ formData.description }}</div>
                </div>

                <div class="meta-grid">
                  <div class="meta-item">
                    <div class="label">Cliente/Empresa</div>
                    <div class="value">{{ formData.clientName || '—' }}</div>
                  </div>
                  <div class="meta-item">
                    <div class="label">Turno</div>
                    <div class="value">{{ formData.shift === 'MANHA' ? 'Manhã' : formData.shift === 'TARDE' ? 'Tarde' : '—' }}</div>
                  </div>
                  <div class="meta-item">
                    <div class="label">Data Original</div>
                    <div class="value">{{ formData.originalVisitDate ? formatDateToBrazil(formData.originalVisitDate) : '—' }}</div>
                  </div>
                  <div class="meta-item">
                    <div class="label">Próxima Visita</div>
                    <div class="value">{{ formData.nextVisitDate ? formatDateToBrazil(formData.nextVisitDate) : '—' }}</div>
                  </div>
                  <div class="meta-item">
                    <div class="label">Turno Próxima Visita</div>
                    <div class="value">{{ formData.nextVisitShift === 'MANHA' ? 'Manhã' : formData.nextVisitShift === 'TARDE' ? 'Tarde' : '—' }}</div>
                  </div>
                  <div class="meta-item">
                    <div class="label">Visit ID Origem</div>
                    <div class="value">{{ formData.sourceVisitId || '—' }}</div>
                  </div>
                  <div class="meta-item">
                    <div class="label">Responsável</div>
                    <div class="value">{{ formData.responsibleName || '—' }}</div>
                  </div>
                </div>
                </div>

                <!-- Inline delete confirmation banner -->
                <div *ngIf="showDeleteConfirm" class="delete-banner">
                  <div class="delete-message">Deseja realmente excluir o evento "<strong>{{ formData.title }}</strong>" em <strong>{{ formatDateToBrazil(formData.date) }}</strong>?</div>
                  <div class="delete-actions">
                    <button class="btn-danger" (click)="doConfirmDelete()">🗑️ Confirmar exclusão</button>
                    <button class="btn-close" (click)="cancelDelete()">Cancelar</button>
                  </div>
                </div>
            </div>
          </ng-container>
          <!-- CREATE / EDIT: Evento -->
          <ng-container *ngIf="mode === 'create' || mode === 'edit'">
            <div class="form-card">
              <div class="form-card-header">
                <div>
                  <div class="form-card-title">{{ mode === 'create' ? 'Criar novo evento' : 'Editar evento' }}</div>
                  <div class="form-card-sub">{{ mode === 'create' ? 'Preencha os campos e clique em salvar' : 'Altere os campos e confirme as mudanças' }}</div>
                </div>
                <div class="form-card-actions">
                  <span *ngIf="mode === 'edit'" class="mode-badge">{{ mode | uppercase }}</span>
                </div>
              </div>

              <div class="form-body">
                <div class="form-row">
                  <div class="form-group">
                    <label for="modalTitle">Título *</label>
                    <input
                      id="modalTitle"
                      type="text"
                      [(ngModel)]="formData.title"
                      placeholder="Ex.: Reunião com cliente"
                      required
                    />
                    <small class="error" *ngIf="errors['title']">{{ errors['title'] }}</small>
                  </div>

                  <div class="form-group">
                    <label for="modalDate">Data *</label>
                    <input id="modalDate" type="date" [(ngModel)]="formData.date" required />
                    <small class="error" *ngIf="errors['date']">{{ errors['date'] }}</small>
                  </div>
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label for="modalShift">Turno</label>
                    <select id="modalShift" [(ngModel)]="formData.shift">
                      <option value="MANHA">Manhã</option>
                      <option value="TARDE">Tarde</option>
                    </select>
                  </div>

                  <div class="form-group">
                    <label for="modalClientName">Empresa/Cliente</label>
                    <input
                      id="modalClientName"
                      type="text"
                      [(ngModel)]="formData.clientName"
                      placeholder="Nome da empresa"
                    />
                  </div>
                </div>

                <div class="form-group">
                  <label for="modalDescription">Descrição</label>
                  <textarea
                    id="modalDescription"
                    [(ngModel)]="formData.description"
                    placeholder="Detalhes do evento — público, local, observações"
                    rows="4"
                  ></textarea>
                </div>
              </div>
            </div>
          </ng-container>

          <!-- RESCHEDULE: Visita -->
          <ng-container *ngIf="mode === 'reschedule'">
            <div class="reschedule-card">
              <div class="reschedule-header">
                <svg class="icon-reschedule" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 8v5l3 3 1-1-2-2V8h-2z"></path><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z" opacity=".3"></path></svg>
                <div>
                  <div class="reschedule-title">Reagendar Visita</div>
                  <div class="reschedule-sub">Data atual: <strong>{{ formatDateToBrazil(formData.date) }}</strong></div>
                </div>
              </div>

              <div class="reschedule-body">
                <label for="rescheduleDate">Escolha a nova data *</label>
                <input id="rescheduleDate" type="date" [(ngModel)]="formData.date" required />
                <small class="error" *ngIf="errors['date']">{{ errors['date'] }}</small>

                <label for="rescheduleReason" class="mt-8">Motivo (opcional)</label>
                <textarea id="rescheduleReason" [(ngModel)]="formData.reason" placeholder="Motivo do reagendamento" rows="4"></textarea>
                <div class="hint">Dica: informe o motivo para registro e comunicação com o usuário.</div>
              </div>
            </div>
          </ng-container>
        </div>

        <div class="modal-footer">
          <ng-container *ngIf="mode === 'view'">
            <div class="footer-left">
              <button type="button" class="btn-edit" (click)="onRequestEdit()">✏️ Editar</button>
            </div>
            <div class="footer-right">
              <button type="button" class="btn-danger" (click)="onDelete()">🗑️ Excluir</button>
              <button type="button" class="btn-close" (click)="cancel()">Fechar</button>
            </div>
          </ng-container>

          <!-- Footer padrão para create/edit/reschedule -->
          <ng-container *ngIf="mode !== 'view'">
            <button type="button" class="btn-close" (click)="cancel()">Cancelar</button>
            <button type="button" class="btn-primary" (click)="confirm()" [disabled]="isSubmitting">
              {{ isSubmitting ? 'Salvando...' : 'Salvar' }}
            </button>
          </ng-container>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      padding: 20px;
    }
    .modal-content {
      background: #fff;
      border-radius: 10px;
      max-width: 680px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 12px 40px rgba(2,6,23,0.24);
      border: 1px solid rgba(0,0,0,0.06);
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 18px 20px;
      border-bottom: 1px solid #f0f0f0;
    }
    .modal-title { display:flex; align-items:center; gap:12px; }
    .modal-title h3 { margin: 0; font-size: 1.15rem; font-weight:700; color:#102a43; }
    .icon-calendar { width:22px; height:22px; color:#2b6cb0; }
    .close-btn {
      background: transparent;
      border: 1px solid transparent;
      font-size: 1rem;
      cursor: pointer;
      color: #6b7280;
      padding:6px 8px; border-radius:6px;
    }
    .close-btn:hover { background: rgba(0,0,0,0.03); }
    .modal-body { padding: 18px 20px; }
    .details-card { background:#fbfcfd; border:1px solid #eef3f8; border-radius:8px; padding:14px; }
  .details-header { display:flex; justify-content:space-between; align-items:baseline; gap:12px; margin-bottom:10px; }
  .details-left { display:flex; flex-direction:column; }
  .details-right { display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
  .details-title { font-weight:700; color:#0f172a; font-size:1.05rem; }
  .details-sub { font-size:0.9rem; color:#475569; }
  .details-date { font-weight:700; color:#0b1220; }
  .details-ref { font-size:0.85rem; color:#6b7280; }
  .badge-type { background:#eef2ff; color:#3730a3; padding:6px 8px; border-radius:999px; font-weight:700; font-size:0.75rem; }
  .details-meta { font-size:0.85rem; color:#334155; }
  .details-body { display:grid; gap:10px; }
  .meta-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:4px; }
  .meta-item .label { font-weight:600; color:#475569; margin-bottom:4px; }
  .reschedule-card { background:#fffdf7; border:1px solid #fff1e6; border-radius:8px; padding:12px; margin-bottom:6px; }
  .reschedule-header { display:flex; gap:12px; align-items:center; margin-bottom:8px; }
  .icon-reschedule { width:24px; height:24px; color:#d97706; }
  .reschedule-title { font-weight:700; color:#92400e; }
  .reschedule-sub { font-size:0.9rem; color:#7c2d12; }
  .reschedule-body label { display:block; margin-top:8px; font-weight:600; color:#475569; }
  .reschedule-body input, .reschedule-body textarea { width:100%; padding:8px; border-radius:6px; border:1px solid #e6eef7; margin-top:6px; }
  .reschedule-body .hint { font-size:0.85rem; color:#6b7280; margin-top:8px; }
    .details-row { display:flex; gap:12px; }
    .details-row .label { min-width:120px; font-weight:600; color:#475569; }
    .details-row .value { color:#0b1220; }
    .details-body .value { white-space:normal; }
    .view-desc { background: #fff; padding:10px; border-radius:6px; border:1px solid #e6eef7; color:#0b1220; }

    .delete-banner { margin-top:12px; padding:12px; border-radius:8px; background: linear-gradient(180deg,#fff7f7,#fff1f0); border:1px solid #fee2e2; display:flex; justify-content:space-between; align-items:center; gap:12px; }
    .delete-message { color:#7f1d1d; font-weight:600; }
    .delete-actions { display:flex; gap:8px; }

    /* Form card for create/edit */
    .form-card { background:#ffffff; border:1px solid #eef3f8; border-radius:8px; padding:14px; }
    .form-card-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
    .form-card-title { font-weight:700; color:#0b3a80; }
    .form-card-sub { font-size:0.9rem; color:#475569; }
    .mode-badge { background:#eef2ff; color:#3730a3; padding:6px 8px; border-radius:999px; font-weight:700; font-size:0.75rem; }
    .form-body { display:flex; flex-direction:column; gap:12px; }
    .form-row { display:flex; gap:12px; }
    .form-group { flex:1; display:flex; flex-direction:column; }
    .form-group label { font-weight:600; color:#475569; margin-bottom:6px; }
    .form-group input, .form-group textarea { padding:8px 10px; border-radius:8px; border:1px solid #e6eef7; font-size:0.95rem; }
    .form-group select { padding:8px 10px; border-radius:8px; border:1px solid #e6eef7; font-size:0.95rem; background-color: #fff; cursor: pointer; }
    .form-group input:focus, .form-group textarea:focus { outline: none; box-shadow: 0 0 0 3px rgba(59,130,246,0.06); border-color:#93c5fd; }
    .form-group select:focus { outline: none; box-shadow: 0 0 0 3px rgba(59,130,246,0.06); border-color:#93c5fd; }
    .error { color:#b91c1c; font-size:0.85rem; margin-top:6px; }

    .modal-footer { padding: 14px 20px; border-top: 1px solid #f0f0f0; display:flex; align-items:center; gap:12px; }
    .footer-left { flex:1; }
    .footer-right { display:flex; gap:8px; }

    .btn-primary {
      background-color: #14532d; color: #fff; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-weight:600;
    }
    .btn-close { background:#f1f5f9; color:#0f172a; border:none; padding:8px 12px; border-radius:8px; cursor:pointer; }
    .btn-edit { background:linear-gradient(180deg,#79c267,#54a23b); color:#fff; border:none; padding:8px 12px; border-radius:8px; cursor:pointer; font-weight:600; }
    .btn-danger { background:linear-gradient(180deg,#f97373,#ef4444); color:#fff; border:none; padding:8px 12px; border-radius:8px; cursor:pointer; font-weight:600; }
    .btn-edit:hover, .btn-danger:hover, .btn-close:hover { transform: translateY(-1px); }
    .btn-primary:disabled { opacity:0.6; cursor:not-allowed; }
  `]
})
export class AgendaModalComponent {
  private ui = inject(UiService);

  @Output() confirmAction = new EventEmitter<AgendaModalData>();
  @Output() cancelAction = new EventEmitter<void>();
  @Output() deleteAction = new EventEmitter<number>();
  @Output() requestEdit = new EventEmitter<AgendaModalData>();

  isOpen = false;
  mode: AgendaModalMode = 'create';
  isSubmitting = false;
  showDeleteConfirm = false;

  formData: AgendaModalData = {
    mode: 'create',
    title: '',
    description: null,
    date: '',
    reason: null,
    shift: 'MANHA',
    type: null,
    referenceId: null,
    clientName: null,
    unitName: null,
    sectorName: null,
    originalVisitDate: null,
    sourceVisitId: null,
    responsibleName: null
  };

  errors: Record<string, string> = {};

  // formata string YYYY-MM-DD para DD/MM/YYYY
  formatDateToBrazil(dateStr: any): string {
    if (!dateStr) return '';
    try {
      const s = String(dateStr).substring(0, 10);
      const parts = s.split('-');
      if (parts.length >= 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return s;
    } catch (_) { return String(dateStr); }
  }

  getModalTitle(): string {
    const titles = {
      create: 'Criar Novo Evento',
      edit: 'Editar Evento',
      reschedule: 'Reagendar Visita'
      ,view: 'Detalhes do Evento'
    };
    return titles[this.mode];
  }

  open(mode: AgendaModalMode, initialData?: Partial<AgendaModalData>): void {
    this.mode = mode;
    this.isOpen = true;
    this.errors = {};
    this.isSubmitting = false;
    this.formData = {
      mode,
      title: initialData?.title || '',
      description: initialData?.description || null,
      date: initialData?.date || '',
      reason: initialData?.reason || null,
      shift: initialData?.shift || 'MANHA',
      type: initialData?.type || null,
      referenceId: initialData?.referenceId || null,
      clientName: initialData?.clientName || null,
      unitName: initialData?.unitName || null,
      sectorName: initialData?.sectorName || null,
      originalVisitDate: initialData?.originalVisitDate || null,
      sourceVisitId: initialData?.sourceVisitId || null,
      responsibleName: initialData?.responsibleName || null
    };
    setTimeout(() => {
      try {
        const firstInput = document.querySelector('.modal-content input') as HTMLInputElement;
        if (firstInput) firstInput.focus();
      } catch (_) {}
    }, 100);
  }

  cancel(): void {
    this.isOpen = false;
    this.errors = {};
    this.formData = { mode: 'create', title: '', description: null, date: '', reason: null };
    this.cancelAction.emit();
  }

  onDelete(): void {
    const id = this.formData.referenceId;
    if (!id) {
      this.ui.showToast('ID do evento não disponível para exclusão', 'error');
      return;
    }
    // Show inline visual confirmation inside the modal instead of browser confirm()
    this.showDeleteConfirm = true;
  }

  doConfirmDelete(): void {
    const id = this.formData.referenceId;
    if (!id) {
      this.ui.showToast('ID do evento não disponível para exclusão', 'error');
      this.showDeleteConfirm = false;
      return;
    }
    this.deleteAction.emit(id);
    this.showDeleteConfirm = false;
    this.isOpen = false;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
  }

  onRequestEdit(): void {
    // Emit the full current data so parent can open the modal in edit mode with same payload
    this.requestEdit.emit(this.formData);
  }

  confirm(): void {
    this.errors = {};

    if (this.mode === 'create' || this.mode === 'edit') {
      if (!this.formData.title?.trim()) {
        this.errors['title'] = 'Título é obrigatório';
      }
      if (!this.formData.date?.trim()) {
        this.errors['date'] = 'Data é obrigatória';
      }
    }

    if (this.mode === 'reschedule') {
      if (!this.formData.date?.trim()) {
        this.errors['date'] = 'Nova data é obrigatória';
      }
    }

    if (Object.keys(this.errors).length > 0) {
      this.ui.showToast('Preencha os campos obrigatórios', 'warning');
      return;
    }

    this.isSubmitting = true;
    this.confirmAction.emit({ ...this.formData });
    // Não fechar automaticamente: o componente pai deve fechar o modal explicitamente
    // apenas quando a operação no backend for bem-sucedida. Isso permite manter o
    // formulário aberto em caso de erro (ex.: 409 Conflict) para que o usuário
    // corrija os dados sem perder o que preencheu.
    this.isSubmitting = true;
  }

  // Método público para fechar o modal após sucesso
  close(): void {
    this.isOpen = false;
    this.isSubmitting = false;
    this.errors = {};
    // reset formData to defaults but keep minimal state
    this.formData = { mode: 'create', title: '', description: null, date: '', reason: null, shift: 'MANHA', type: null, referenceId: null, clientName: null, unitName: null, sectorName: null, originalVisitDate: null, sourceVisitId: null, responsibleName: null };
  }
}
