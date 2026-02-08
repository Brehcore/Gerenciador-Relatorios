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
  // status fields (opcionais) — podem ser usados pela view para controlar ações
  status?: 'CONFIRMADO' | 'A_CONFIRMAR' | 'REAGENDADO' | 'CANCELADO' | null;
  statusDescricao?: string | null;
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
            <div class="view-container">
              <!-- Main Header Card -->
              <div class="header-card">
                <div class="header-content">
                  <div class="header-left">
                    <h2 class="event-title">{{ formData.title }}</h2>
                    <p class="event-subtitle">{{ formData.clientName || 'Sem cliente definido' }}</p>
                  </div>
                  <div class="header-right">
                    <span class="badge badge-type" [class]="'badge-' + (formData.type || 'EVENTO').toLowerCase()">
                      {{ formatEventType(formData.type) }}
                    </span>
                    <span class="badge badge-status" [class]="'status-' + (formData.status || 'neutro').toLowerCase()">
                      {{ formData.statusDescricao || formData.status || 'Sem status' }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Description Section -->
              <div *ngIf="formData.description" class="section-card description-card">
                <div class="section-label">
                  <svg class="icon-section" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Descrição
                </div>
                <p class="section-value">{{ formData.description }}</p>
              </div>

              <!-- Info Grid -->
              <div class="info-grid">
                <!-- Left Column: Data & Turno -->
                <div class="info-card">
                  <div class="info-header">
                    <svg class="icon-header" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="currentColor" stroke-width="2"/>
                      <path d="M16 2v4M8 2v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                      <path d="M3 10h18" stroke="currentColor" stroke-width="2"/>
                    </svg>
                    Agendamento
                  </div>
                  <div class="info-row">
                    <span class="info-label">Data</span>
                    <span class="info-value">{{ formatDateToBrazil(formData.date) }}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Turno</span>
                    <span class="info-value">
                      <span class="shift-badge" [class]="'shift-' + (formData.shift || 'MANHA').toLowerCase()">
                        <svg *ngIf="formData.shift === 'MANHA'" class="icon-shift" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="2"/>
                          <path d="M12 1v6m0 6v6m11-11h-6m-6 0H1m16-3l-4 4m-6 0l-4-4m16 8l-4-4m-6 0l-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                        <svg *ngIf="formData.shift === 'TARDE'" class="icon-shift" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        {{ formData.shift === 'MANHA' ? 'Manhã' : formData.shift === 'TARDE' ? 'Tarde' : '—' }}
                      </span>
                    </span>
                  </div>
                </div>

                <!-- Right Column: Location & Responsible -->
                <div class="info-card">
                  <div class="info-header">
                    <svg class="icon-header" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <circle cx="12" cy="10" r="3" stroke="currentColor" stroke-width="2"/>
                    </svg>
                    Localização
                  </div>
                  <div class="info-row">
                    <span class="info-label">Unidade</span>
                    <span class="info-value">{{ formData.unitName || '—' }}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Setor</span>
                    <span class="info-value">{{ formData.sectorName || '—' }}</span>
                  </div>
                </div>

                <!-- Left Column: Original Visit -->
                <div class="info-card" *ngIf="formData.originalVisitDate || formData.sourceVisitId">
                  <div class="info-header">
                    <svg class="icon-header" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 11l3 3L22 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    Origem
                  </div>
                  <div class="info-row">
                    <span class="info-label">Data Original</span>
                    <span class="info-value">{{ formData.originalVisitDate ? formatDateToBrazil(formData.originalVisitDate) : '—' }}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Visit ID</span>
                    <span class="info-value">{{ formData.sourceVisitId || '—' }}</span>
                  </div>
                </div>

                <!-- Right Column: Next Visit -->
                <div class="info-card" *ngIf="formData.nextVisitDate || formData.nextVisitShift">
                  <div class="info-header">
                    <svg class="icon-header" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <polyline points="23 4 23 10 17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    Próxima
                  </div>
                  <div class="info-row">
                    <span class="info-label">Data Próxima</span>
                    <span class="info-value">{{ formData.nextVisitDate ? formatDateToBrazil(formData.nextVisitDate) : '—' }}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Turno</span>
                    <span class="info-value">
                      {{ formData.nextVisitShift === 'MANHA' ? 'Manhã' : formData.nextVisitShift === 'TARDE' ? 'Tarde' : '—' }}
                    </span>
                  </div>
                </div>

                <!-- Responsible -->
                <div class="info-card" *ngIf="formData.responsibleName">
                  <div class="info-header">
                    <svg class="icon-header" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    Responsável
                  </div>
                  <div class="info-row">
                    <span class="info-label">Nome</span>
                    <span class="info-value">{{ formData.responsibleName }}</span>
                  </div>
                </div>
              </div>

              <!-- Inline delete confirmation banner -->
              <div *ngIf="showDeleteConfirm" class="delete-banner">
                <div class="delete-message">Deseja realmente excluir o evento "<strong>{{ formData.title }}</strong>"?</div>
                <div class="delete-actions">
                  <button class="btn-danger" (click)="doConfirmDelete()">
                    <svg class="icon-btn" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    Confirmar
                  </button>
                  <button class="btn-cancel" (click)="cancelDelete()">Cancelar</button>
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
              <button type="button" class="btn-edit" (click)="onRequestEdit()">
                <svg class="icon-btn" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Editar
              </button>
            </div>
            <div class="footer-right">
              <!-- Confirm / Cancel visit actions (only for VISITA_TECNICA and when not historical) -->
              <button *ngIf="formData.type === 'VISITA_TECNICA' && formData['status'] !== 'REAGENDADO' && formData['status'] !== 'CONFIRMADO'" type="button" class="btn-edit" (click)="doConfirmVisit()" [disabled]="isConfirming">
                <svg class="icon-btn" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Confirmar
              </button>
              <button *ngIf="formData.type === 'VISITA_TECNICA' && formData['status'] !== 'REAGENDADO' && formData['status'] !== 'CANCELADO'" type="button" class="btn-danger" (click)="doCancelVisit()" [disabled]="isConfirming">
                <svg class="icon-btn" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Cancelar
              </button>
              <button type="button" class="btn-danger" (click)="onDelete()">
                <svg class="icon-btn" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Excluir
              </button>
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
    
    /* View Mode Styles */
    .view-container { display: flex; flex-direction: column; gap: 14px; }
    
    .header-card {
      background: linear-gradient(135deg, #f8fbff 0%, #eef5ff 100%);
      border: 1px solid #dce7f0;
      border-radius: 10px;
      padding: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    
    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      width: 100%;
      gap: 20px;
    }
    
    .header-left { flex: 1; }
    .header-right { display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
    
    .event-title {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.3;
    }
    
    .event-subtitle {
      margin: 6px 0 0 0;
      font-size: 0.95rem;
      color: #64748b;
    }
    
    .badge {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .badge-type {
      background: #eef2ff;
      color: #3730a3;
      border: 1px solid #c7d2fe;
    }
    
    .badge-evento { background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd; }
    .badge-visita_tecnica { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
    .badge-treinamento { background: #cffafe; color: #0e7490; border: 1px solid #06b6d4; }
    
    .badge-status {
      border: 1px solid;
    }
    
    .status-confirmado { background: #ecfdf5; color: #065f46; border-color: #6ee7b7; }
    .status-a_confirmar { background: #fffbeb; color: #92400e; border-color: #fcd34d; }
    .status-reagendado { background: #f3f4f6; color: #374151; border-color: #d1d5db; font-style: italic; }
    .status-cancelado { background: #fef2f2; color: #7f1d1d; border-color: #fca5a5; }
    .status-neutro { background: #f0f9ff; color: #0c4a6e; border-color: #38bdf8; }
    
    .section-card {
      background: #fffbf5;
      border: 1px solid #fde2d4;
      border-radius: 8px;
      padding: 14px;
    }
    
    .description-card { background: #f0fdf4; border-color: #bbf7d0; }
    
    .section-label {
      font-weight: 700;
      color: #5a3a1a;
      font-size: 0.95rem;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .icon-section {
      width: 18px;
      height: 18px;
      color: #92400e;
      flex-shrink: 0;
    }
    
    .section-value {
      color: #292524;
      line-height: 1.5;
      font-size: 0.95rem;
      margin: 0;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    
    @media (max-width: 640px) {
      .info-grid { grid-template-columns: 1fr; }
    }
    
    .info-card {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px;
    }
    
    .info-header {
      font-weight: 700;
      color: #1f2937;
      font-size: 0.9rem;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid #f3f4f6;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .icon-header {
      width: 16px;
      height: 16px;
      color: #3b82f6;
      flex-shrink: 0;
    }
    
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
      font-size: 0.9rem;
    }
    
    .info-label {
      font-weight: 600;
      color: #6b7280;
    }
    
    .info-value {
      text-align: right;
      color: #1f2937;
      font-weight: 500;
    }
    
    .shift-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 600;
    }

    .icon-shift {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }
    
    .shift-manha { background: #fff7ed; color: #b45309; }
    .shift-tarde { background: #fed7aa; color: #7c2d12; }
    
    .delete-banner {
      margin-top: 12px;
      padding: 12px;
      border-radius: 8px;
      background: linear-gradient(180deg, #fff7f7, #fff1f0);
      border: 1px solid #fee2e2;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    
    .delete-message {
      color: #7f1d1d;
      font-weight: 600;
      font-size: 0.9rem;
    }
    
    .delete-actions {
      display: flex;
      gap: 8px;
    }
    
    .btn-cancel {
      background: #f3f4f6;
      color: #374151;
      border: 1px solid #d1d5db;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      font-size: 0.9rem;
    }
    
    .btn-cancel:hover {
      background: #e5e7eb;
    }

    .icon-btn {
      width: 16px;
      height: 16px;
      display: inline;
      vertical-align: middle;
      margin-right: 4px;
    }
    
    .reschedule-card { background:#fffdf7; border:1px solid #fff1e6; border-radius:8px; padding:12px; margin-bottom:6px; }
    .reschedule-header { display:flex; gap:12px; align-items:center; margin-bottom:8px; }
    .icon-reschedule { width:24px; height:24px; color:#d97706; }
    .reschedule-title { font-weight:700; color:#92400e; }
    .reschedule-sub { font-size:0.9rem; color:#7c2d12; }
    .reschedule-body label { display:block; margin-top:8px; font-weight:600; color:#475569; }
    .reschedule-body input, .reschedule-body textarea { width:100%; padding:8px; border-radius:6px; border:1px solid #e6eef7; margin-top:6px; }
    .reschedule-body .hint { font-size:0.85rem; color:#6b7280; margin-top:8px; }

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

    .modal-footer { padding: 14px 20px; border-top: 1px solid #f0f0f0; display:flex; align-items:center; gap:12px; justify-content: space-between; flex-wrap: wrap; }
    .footer-left { flex:1; display: flex; gap: 8px; }
    .footer-right { display:flex; gap:8px; flex-wrap: wrap; }

    .btn-primary {
      background-color: #14532d; color: #fff; border:none; padding:10px 16px; border-radius:8px; cursor:pointer; font-weight:600; font-size: 0.95rem; transition: all 0.2s ease;
    }
    .btn-primary:hover { background-color: #0f4620; transform: translateY(-1px); }
    .btn-close { background:#f1f5f9; color:#0f172a; border:1px solid #e2e8f0; padding:10px 16px; border-radius:8px; cursor:pointer; font-weight: 500; font-size: 0.95rem; transition: all 0.2s ease; }
    .btn-close:hover { background: #e2e8f0; }
    .btn-edit { background:linear-gradient(180deg,#79c267,#54a23b); color:#fff; border:none; padding:10px 16px; border-radius:8px; cursor:pointer; font-weight:600; font-size: 0.95rem; transition: all 0.2s ease; }
    .btn-edit:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(84, 162, 59, 0.2); }
    .btn-danger { background:linear-gradient(180deg,#f97373,#ef4444); color:#fff; border:none; padding:10px 16px; border-radius:8px; cursor:pointer; font-weight:600; font-size: 0.95rem; transition: all 0.2s ease; }
    .btn-danger:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2); }
    .btn-primary:disabled { opacity:0.6; cursor:not-allowed; }
  `]
})
export class AgendaModalComponent {
  private ui = inject(UiService);

  @Output() confirmAction = new EventEmitter<AgendaModalData>();
  @Output() cancelAction = new EventEmitter<void>();
  @Output() deleteAction = new EventEmitter<number>();
  @Output() requestEdit = new EventEmitter<AgendaModalData>();
  @Output() confirmVisitAction = new EventEmitter<number>();
  @Output() cancelVisitAction = new EventEmitter<number>();

  isOpen = false;
  mode: AgendaModalMode = 'create';
  isSubmitting = false;
  isConfirming = false;
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
      reschedule: 'Reagendar Visita',
      view: 'Detalhes do Evento'
    };
    return titles[this.mode];
  }

  formatEventType(type: string | null | undefined): string {
    if (!type) return 'Evento';
    const types: { [key: string]: string } = {
      'EVENTO': 'Evento',
      'VISITA_TECNICA': 'Visita Técnica',
      'TREINAMENTO': 'Treinamento'
    };
    return types[type] || type;
  }

  open(mode: AgendaModalMode, initialData?: Partial<AgendaModalData>): void {
    this.mode = mode;
    this.isOpen = true;
    this.errors = {};
    this.isSubmitting = false;
    this.isConfirming = false;
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

  // Emitir confirmação de visita para o componente pai
  doConfirmVisit(): void {
    const id = this.formData.referenceId;
    if (!id) { this.ui.showToast('ID do evento não disponível', 'error'); return; }
    this.isConfirming = true;
    this.confirmVisitAction.emit(id);
    this.isOpen = false;
  }

  // Emitir cancelamento de visita para o componente pai
  doCancelVisit(): void {
    const id = this.formData.referenceId;
    if (!id) { this.ui.showToast('ID do evento não disponível', 'error'); return; }
    this.cancelVisitAction.emit(id);
    this.isOpen = false;
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
