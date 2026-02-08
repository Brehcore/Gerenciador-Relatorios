import { Component, OnInit, inject, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { FullCalendarComponent } from '@fullcalendar/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FullCalendarModule } from '@fullcalendar/angular';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import ptBrLocale from '@fullcalendar/core/locales/pt-br';
import { CalendarOptions, DateSelectArg, EventClickArg, EventDropArg } from '@fullcalendar/core';
import { AgendaService, AgendaResponseDTO } from '../../../services/agenda.service';
import { ActivatedRoute } from '@angular/router';
import { LegacyService } from '../../../services/legacy.service';
import { UiService } from '../../../services/ui.service';
import { AgendaModalComponent, AgendaModalMode } from '../../shared/agenda-modal/agenda-modal.component';

@Component({
  standalone: true,
  selector: 'app-agenda',
  imports: [CommonModule, FormsModule, AgendaModalComponent, FullCalendarModule],
  templateUrl: './agenda.component.html',
  styleUrls: ['./agenda.component.css']
})
export class AgendaComponent implements OnInit, AfterViewInit, OnDestroy {
  private agendaService = inject(AgendaService);
  private ui = inject(UiService);
  private legacy = inject(LegacyService);
  // ActivatedRoute is optional in some test setups (provide when available)
  private route = inject(ActivatedRoute, { optional: true });

  @ViewChild('agendaModal') agendaModal!: AgendaModalComponent;
  @ViewChild('fullcalendar') fullcalendar!: FullCalendarComponent;

  eventos: AgendaResponseDTO[] = [];
  loading = false;
  currentEditingItem: AgendaResponseDTO | null = null;
  // Export modal state
  showExportModal: boolean = false;
  exportStart: string | null = null; // bound to input[type=date] YYYY-MM-DD
  exportEnd: string | null = null;   // bound to input[type=date] YYYY-MM-DD
  isAdmin = false;
  // quando true, exibe a agenda GLOBAL (todos os técnicos) em vez da própria
  showGlobalAgenda = false;
  viewMode: 'calendar' | 'list' = 'calendar';

  calendarOptions: CalendarOptions = {
    initialView: 'dayGridMonth',
    locale: ptBrLocale,
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay'
    },
    selectable: true,
    editable: true,
    eventClick: (info: EventClickArg) => this.handleEventClick(info),
    select: (info: DateSelectArg) => this.handleDateSelect(info),
    eventDrop: (info: EventDropArg) => this.handleEventDrop(info),
    eventDisplay: 'block',
    eventContent: (arg) => this.renderCalendarEvent(arg),
    eventTimeFormat: { hour: 'numeric', minute: '2-digit', meridiem: 'short' }
    ,
    // garantir que após cada view ser montada a toolbar seja verificada/ajustada
    viewDidMount: () => {
      // small async tick to let FullCalendar finish any inline style adjustments
      setTimeout(() => this.adjustToolbarLayout?.(), 0);
    },
    // quando a janela for redimensionada, reajustar
    windowResize: () => {
      this.adjustToolbarLayout?.();
    }
  };

  async ngOnInit(): Promise<void> {
    // subscribe to queryParams so the component reacts to ?ids=1,2,3 or ?responsible=name
    if (this.route && this.route.queryParams && typeof this.route.queryParams.subscribe === 'function') {
      this.route.queryParams.subscribe(async params => {
        this.queryIds = params['ids'] || null;
        this.queryResponsible = params['responsible'] || null;
        // pre-fill the input model when route param provided
        this.filterResponsibleInput = this.queryResponsible || '';
        await this.loadEventos();
      });
    } else {
      // no ActivatedRoute available (tests or non-router context) -> just load eventos
      await this.loadEventos();
    }
    // bind modal confirm/cancel visit events
    setTimeout(() => {
      try {
        if (this.agendaModal) {
          this.agendaModal.confirmVisitAction.subscribe((id: number) => {
            const it = this.eventos.find(e => e.referenceId === id);
            if (it) this.confirmVisit(it);
          });
          this.agendaModal.cancelVisitAction.subscribe((id: number) => {
            const it = this.eventos.find(e => e.referenceId === id);
            if (it) this.cancelVisit(it);
          });
        }
      } catch (_) {}
    }, 200);
  }

  ngAfterViewInit(): void {
    // Ajuste inicial e listener de resize para manter toolbar empilhada em telas pequenas
    this.adjustToolbarLayout();
    this._resizeHandler = () => this.adjustToolbarLayout();
    window.addEventListener('resize', this._resizeHandler);
  }

  ngOnDestroy(): void {
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
  }

  // referência ao handler para remover no destroy
  private _resizeHandler: any = null;

  /**
   * Força o empilhamento da toolbar do FullCalendar em telas pequenas.
   * Remove estilos inline que o FullCalendar às vezes aplica e adiciona
   * a classe `fc-toolbar-stacked` no container para regras CSS específicas.
   */
  private adjustToolbarLayout(): void {
    try {
      const container = document.querySelector('.calendar-container');
      if (!container) return;
      const toolbar = container.querySelector('.fc-toolbar') as HTMLElement | null;
      const shouldStack = window.innerWidth <= 480;
      if (shouldStack) {
        container.classList.add('fc-toolbar-stacked');
      } else {
        container.classList.remove('fc-toolbar-stacked');
      }

      if (toolbar) {
        // remover propriedades que podem estar em linha e forçar layout responsivo
        toolbar.style.removeProperty('position');
        toolbar.style.removeProperty('left');
        toolbar.style.removeProperty('right');
        toolbar.style.removeProperty('top');
        toolbar.style.removeProperty('transform');
        toolbar.style.width = '';

        // também limpar nos filhos imediatos (left/center/right) pois FullCalendar pode aplicar position absolut
        const children = Array.from(toolbar.querySelectorAll<HTMLElement>('*'));
        children.forEach(ch => {
          ch.style.removeProperty('position');
          ch.style.removeProperty('left');
          ch.style.removeProperty('right');
          ch.style.removeProperty('top');
          ch.style.removeProperty('transform');
          ch.style.removeProperty('width');
        });
        // Ajuste direto no(s) título(s) do toolbar para garantir redução em telas pequenas
        const titles = Array.from(container.querySelectorAll<HTMLElement>('.fc-toolbar-title, h2[id^="fc-dom-"]'));
        titles.forEach(t => {
          if (shouldStack) {
            t.style.fontSize = '0.85rem';
            t.style.lineHeight = '1';
            t.style.maxHeight = '3.6rem';
            t.style.overflow = 'hidden';
          } else {
            t.style.removeProperty('font-size');
            t.style.removeProperty('line-height');
            t.style.removeProperty('max-height');
            t.style.removeProperty('overflow');
          }
        });
      }
    } catch (e) {
      // Não quebrar a aplicação por causa de ajustes de layout
      // console.debug('adjustToolbarLayout falhou', e);
    }
  }

  // optional queryIds (string like '1,2,3') populated from route
  queryIds: string | null = null;
  // optional responsible filter (string name) populated from route or input
  queryResponsible: string | null = null;
  // bound input model for the responsible filter UI
  filterResponsibleInput: string = '';

  loadEventos(): Promise<void> {
    // Start loading synchronously so tests can observe the flag immediately.
    this.loading = true;
    // Schedule the heavy work in the next macrotask to avoid racing with the test's
    // synchronous assertions. Return a promise that resolves when the impl finishes.
    return new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        this._loadEventosImpl().then(resolve).catch(reject);
      }, 0);
    });
  }

  private async _loadEventosImpl(): Promise<void> {
    try {
      // Se o usuário for ADMIN, carregar todos os eventos do sistema
      let role: string | null = null;
      try { role = await this.legacy.ensureUserRole(); } catch (_) { role = this.legacy.getUserRole(); }
      const upperRole = (role || '').toUpperCase();
      // Aceitar AMBOS os formatos (ADMIN ou ROLE_ADMIN)
      this.isAdmin = upperRole === 'ADMIN' || upperRole === 'ROLE_ADMIN';

      // If responsible filter present, prefer that
      if (this.queryResponsible && String(this.queryResponsible).trim()) {
        this.eventos = await this.agendaService.listEventosByResponsible(String(this.queryResponsible).trim());
      } else if (this.queryIds) {
        const parts = String(this.queryIds).split(',').map(s => s.trim()).filter(Boolean);
        if (parts.length) {
          // backend optimized query will be used by this endpoint
          this.eventos = await this.agendaService.listEventosByIds(parts);
        } else {
          this.eventos = this.isAdmin ? await this.agendaService.listAllEventos() : await this.agendaService.listEventos();
        }
      } else {
        if (this.isAdmin) {
          // for admins, show the list view only
          this.viewMode = 'list';
          this.eventos = await this.agendaService.listAllEventos();
        } else {
          // Usuário não-admin pode alternar entre agenda pessoal e agenda global
          if (this.showGlobalAgenda) {
            // tentar obter intervalo visível do calendário; se não disponível, buscar sem intervalo
            try {
              const calApi = this.fullcalendar?.getApi?.();
              let startDate: string | undefined;
              let endDate: string | undefined;
              if (calApi && calApi.view && calApi.view.activeStart && calApi.view.activeEnd) {
                const activeStart: Date = calApi.view.activeStart as Date;
                const activeEnd: Date = calApi.view.activeEnd as Date;
                startDate = activeStart.toISOString().split('T')[0];
                // activeEnd costuma ser exclusivo, subtrair 1ms para garantir inclusão do dia anterior
                endDate = new Date(activeEnd.getTime() - 1).toISOString().split('T')[0];
              } else {
                // fallback: use current month range
                const now = new Date();
                const first = new Date(now.getFullYear(), now.getMonth(), 1);
                const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                startDate = first.toISOString().split('T')[0];
                endDate = last.toISOString().split('T')[0];
              }

              // Always pass start/end since backend requires startDate
              this.eventos = await this.agendaService.listGlobalEventos(startDate as string, endDate as string);
            } catch (err) {
              console.warn('Erro ao obter agenda global com intervalo, tentando com intervalo padrao', err);
              // fallback: try with current month range
              const now2 = new Date();
              const first2 = new Date(now2.getFullYear(), now2.getMonth(), 1);
              const last2 = new Date(now2.getFullYear(), now2.getMonth() + 1, 0);
              const startDate2 = first2.toISOString().split('T')[0];
              const endDate2 = last2.toISOString().split('T')[0];
              this.eventos = await this.agendaService.listGlobalEventos(startDate2, endDate2);
            }
          } else {
            this.eventos = await this.agendaService.listEventos();
          }
        }
      }
      // DEBUG: Log the eventos to check if shift field is present
      console.log('Eventos carregados:', this.eventos);
      
      // Fallback: Se shift for null, usar 'MANHA' como padrão (até backend estar configurado)
      this.eventos = this.eventos.map(evt => ({
        ...evt,
        shift: evt.shift || 'MANHA' // Default to 'MANHA' if null/undefined
      }));
      
      // Atualiza o calendário imediatamente usando a API do FullCalendar
      // Only update FullCalendar when not in admin mode (admins don't use calendar UI)
      if (!this.isAdmin) {
        try {
          const calApi = this.fullcalendar?.getApi?.();
          if (calApi) {
            // limpa eventos antigos e adiciona os novos
            calApi.removeAllEvents();
            const calendarEvents = this.eventos.map(evt => this.mapEventoToCalendarEvent(evt));
            calendarEvents.forEach((ev: any) => {
              // FullCalendar espera campos como id, title, start
              calApi.addEvent({ id: String(ev.id || ev.id), title: ev.title, start: ev.start, backgroundColor: ev.backgroundColor, borderColor: ev.borderColor, extendedProps: ev.extendedProps });
            });
          }
        } catch (err) {
          console.warn('Não foi possível atualizar a API do calendário diretamente', err);
        }
      }
    } catch (e) {
      console.error('Erro ao carregar agenda', e);
      this.ui.showToast('Falha ao carregar agenda', 'error');
    } finally {
      this.loading = false;
    }
  }

  private mapEventoToCalendarEvent(evento: AgendaResponseDTO): any {
    // Adicionar turno ao título se disponível (texto, sem emoji)
    let title = evento.title;
    if (evento.shift) {
      title = `${title} (${evento.shift === 'MANHA' ? 'Manhã' : 'Tarde'})`;
    }

    const baseColor = this.getColorByType(evento.type || 'EVENTO');
    const color = evento.status === 'REAGENDADO' ? '#f59e0b' : baseColor;
    const clientDisplay = this.getClientDisplay(evento);
    return {
      id: String(evento.referenceId),
      title: title,
      start: evento.date,
      backgroundColor: color,
      borderColor: color,
      classNames: [evento.status ? String(evento.status).toLowerCase() : ''],
      editable: !(evento.status === 'REAGENDADO' || evento.status === 'CANCELADO'),
      extendedProps: {
        type: evento.type || 'EVENTO',
        description: evento.description,
        shift: evento.shift,
        clientName: evento.clientName,
        originalDate: evento.originalVisitDate,
        sourceVisitId: evento.sourceVisitId,
        nextVisitDate: evento.nextVisitDate,
        nextVisitShift: evento.nextVisitShift,
        responsibleName: evento.responsibleName || null,
        status: evento.status || null,
        statusDescricao: evento.statusDescricao || null
      }
    };
  }

  // Formata a string do cliente: Empresa - Unidade - Setor
  private getClientDisplay(evt: AgendaResponseDTO): string {
    const parts: string[] = [];
    if (evt.clientName) parts.push(evt.clientName);
    if (evt.unitName) parts.push(evt.unitName);
    if (evt.sectorName) parts.push(evt.sectorName);
    return parts.join(' - ');
  }

  // Renderização customizada do evento no FullCalendar (icone + título + cliente/status)
  renderCalendarEvent(arg: any): { domNodes: HTMLElement[] } {
    const event = arg.event;
    const props = event.extendedProps || {};
    const status: string | null = props.status || null;
    const statusDescricao: string | null = props.statusDescricao || null;
    const clientDisplay = props.clientName || '';
    const type = props.type || 'EVENTO';

    const wrapper = document.createElement('div');
    wrapper.className = 'fc-custom-event';

    // Ícone do lado esquerdo
    const left = document.createElement('div');
    left.className = 'fc-evt-left';
    const iconImg = document.createElement('img');
    iconImg.className = 'fc-evt-icon-img icon-svg';
    
    // Escolher ícone baseado no status
    let iconSrc = 'assets/icons/dot.svg';
    if (status === 'CONFIRMADO') iconSrc = 'assets/icons/confirm.svg';
    else if (status === 'A_CONFIRMAR') iconSrc = 'assets/icons/pending.svg';
    else if (status === 'REAGENDADO') iconSrc = 'assets/icons/rescheduled.svg';
    else if (status === 'CANCELADO') iconSrc = 'assets/icons/canceled.svg';
    
    iconImg.src = iconSrc;
    iconImg.alt = status || 'status';
    left.appendChild(iconImg);

    // Conteúdo do lado direito (título + detalhes)
    const right = document.createElement('div');
    right.className = 'fc-evt-right';
    
    // Título do evento
    const titleEl = document.createElement('div');
    titleEl.className = 'fc-evt-title';
    titleEl.textContent = this.truncateText(event.title || '', 14);
    right.appendChild(titleEl);

    // Linha de informações secundárias (cliente ou status)
    if (clientDisplay && status !== 'REAGENDADO') {
      const subClient = document.createElement('div');
      subClient.className = 'fc-evt-sub-client';
      subClient.textContent = this.truncateText(clientDisplay, 16);
      right.appendChild(subClient);
    } else if (status === 'REAGENDADO' && statusDescricao) {
      const sub = document.createElement('div');
      sub.className = 'fc-evt-sub';
      sub.textContent = this.truncateText(statusDescricao, 16);
      right.appendChild(sub);
    } else if (status === 'A_CONFIRMAR') {
      const sub = document.createElement('div');
      sub.className = 'fc-evt-sub';
      sub.textContent = 'À Confirmar';
      right.appendChild(sub);
    }

    wrapper.appendChild(left);
    wrapper.appendChild(right);

    return { domNodes: [wrapper] };
  }

  private truncateText(text: string, limit: number): string {
    if (!text) return '';
    if (text.length <= limit) return text;
    return text.substring(0, limit) + '...';
  }

  private getColorByType(type: string): string {
    const colors: { [key: string]: string } = {
      'EVENTO': '#3b82f6',           // azul
      'VISITA_TECNICA': '#10b981',   // verde
      'TREINAMENTO': '#06b6d4'       // ciano
    };
    return colors[type] || '#6b7280';
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

  private handleEventClick(info: EventClickArg): void {
    const evento = this.eventos.find(e => e.referenceId === parseInt(info.event.id));
    if (evento) {
      // abrir modal em modo de visualização com todos os dados
      this.currentEditingItem = evento;
      this.agendaModal?.open('view', {
        title: evento.title,
        description: evento.description || null,
        date: evento.date,
        shift: evento.shift,
        type: evento.type,
        referenceId: evento.referenceId,
        clientName: evento.clientName || null,
        unitName: evento.unitName || null,
        sectorName: evento.sectorName || null,
        originalVisitDate: evento.originalVisitDate || null,
        sourceVisitId: evento.sourceVisitId || null,
        nextVisitDate: evento.nextVisitDate || undefined,
        nextVisitShift: evento.nextVisitShift || undefined,
        responsibleName: evento.responsibleName || null
      });
    }
  }

  private handleDateSelect(info: DateSelectArg): void {
    const dateStr = info.startStr.split('T')[0];
    this.currentEditingItem = null;
    this.agendaModal?.open('create', { date: dateStr });
  }

  private handleEventDrop(info: EventDropArg): void {
    const evento = this.eventos.find(e => e.referenceId === parseInt(info.event.id));
    if (evento && evento.type === 'VISITA_TECNICA') {
      const newDate = info.event.startStr.split('T')[0];
      this.currentEditingItem = evento;
      this.agendaModal?.open('reschedule', {
        date: newDate,
        reason: null
      });
    } else {
      // Para EVENTO, permitir atualizar a data
      if (evento && evento.type === 'EVENTO') {
        const newDate = info.event.startStr.split('T')[0];
        this.currentEditingItem = evento;
        this.agendaModal?.open('edit', {
          title: evento.title,
          description: evento.description,
          date: newDate
        });
      }
    }
  }

  async createNew(): Promise<void> {
    this.currentEditingItem = null;
    this.agendaModal?.open('create', { date: new Date().toISOString().split('T')[0] });
  }

  // Apply responsible filter from the input and reload eventos
  async applyResponsibleFilter(): Promise<void> {
    this.queryResponsible = (this.filterResponsibleInput || '').trim() || null;
    await this.loadEventos();
  }

  // Clear responsible filter and reload
  async clearResponsibleFilter(): Promise<void> {
    this.filterResponsibleInput = '';
    this.queryResponsible = null;
    await this.loadEventos();
  }

  async onModalConfirm(data: any): Promise<void> {
    try {
      this.loading = true;
      // Antes de criar/atualizar/reagendar, verificar conflitos globais e avisar o usuário
      try {
        const conflictMsg = await this.agendaService.checkGlobalConflicts(data.date, data.shift || 'MANHA');
        if (conflictMsg) {
          const proceed = await this.ui.confirm(`${conflictMsg}\n\nDeseja continuar mesmo assim?`);
          if (!proceed) {
            this.ui.showToast('Operação cancelada pelo usuário', 'info');
            this.loading = false;
            return;
          }
        }
      } catch (err) {
        // Não bloquear operação em caso de falha na verificação; apenas logar
        console.warn('Verificação de conflito global falhou', err);
      }

      if (data.mode === 'create') {
        await this.agendaService.createEvento({
          title: data.title,
          description: data.description || null,
          eventDate: data.date,
          shift: data.shift || 'MANHA',
          clientName: data.clientName || null
        });
        this.ui.showToast('Evento criado com sucesso', 'success');
        try { this.agendaModal?.close(); } catch (_) {}
      } else if (data.mode === 'edit') {
        if (!this.currentEditingItem) return;
        await this.agendaService.updateEvento(this.currentEditingItem.referenceId, {
          title: data.title,
          description: data.description || null,
          eventDate: data.date,
          eventType: this.currentEditingItem.type || 'EVENTO',
          shift: data.shift || 'MANHA',
          clientName: data.clientName || null
        });
        this.ui.showToast('Evento atualizado com sucesso', 'success');
        try { this.agendaModal?.close(); } catch (_) {}
      } else if (data.mode === 'reschedule') {
        if (!this.currentEditingItem) return;
        const visitId = this.currentEditingItem.sourceVisitId || this.currentEditingItem.referenceId;
        await this.agendaService.rescheduleVisit(visitId, {
          newDate: data.date,
          reason: data.reason || null
        });
        this.ui.showToast('Visita reagendada com sucesso', 'success');
        try { this.agendaModal?.close(); } catch (_) {}
      }
      console.log('Recarregando eventos após operação...');
      await this.loadEventos();
    } catch (e) {
      console.error('Erro na operação', e);
      this.ui.showToast('Falha na operação', 'error');
    } finally {
      this.loading = false;
    }
  }

  async onModalDelete(id: number): Promise<void> {
    try {
      this.loading = true;
      await this.agendaService.deleteEvento(id);
      this.ui.showToast('Evento deletado com sucesso', 'success');
      await this.loadEventos();
    } catch (e) {
      console.error('Erro ao deletar via modal', e);
      this.ui.showToast('Falha ao deletar evento', 'error');
    } finally {
      this.loading = false;
    }
  }

  onModalRequestEdit(data?: any): void {
    // If payload provided by modal, use it to set currentEditingItem; otherwise fallback to previously selected
    if (data && data.referenceId) {
      this.currentEditingItem = {
        referenceId: data.referenceId,
        title: data.title || '',
        description: data.description || null,
        date: data.date || '',
        shift: data.shift,
        type: data.type || 'EVENTO',
        clientName: data.clientName || null,
        unitName: data.unitName || null,
        sectorName: data.sectorName || null,
        originalVisitDate: data.originalVisitDate || null,
        sourceVisitId: data.sourceVisitId || null
      } as AgendaResponseDTO;
    }
    if (!this.currentEditingItem) return;
    // Abrir modal em modo edit/reschedule conforme tipo
    this.editEvent(this.currentEditingItem);
  }

  async deleteEvent(item: AgendaResponseDTO): Promise<void> {
    if (!confirm(`Deseja realmente deletar o evento "${item.title}" na data ${this.formatDateToBrazil(item.date)}?`)) return;
    try {
      this.loading = true;
      await this.agendaService.deleteEvento(item.referenceId);
      this.ui.showToast('Evento deletado com sucesso', 'success');
      await this.loadEventos();
    } catch (e) {
      console.error('Erro ao deletar', e);
      this.ui.showToast('Falha ao deletar evento', 'error');
    } finally {
      this.loading = false;
    }
  }

  async editEvent(item: AgendaResponseDTO): Promise<void> {
    this.currentEditingItem = item;
    if (item.type === 'EVENTO') {
      this.agendaModal?.open('edit', {
        title: item.title,
        description: item.description,
        date: item.date,
        shift: item.shift,
        clientName: item.clientName
      });
      return;
    }
    if (item.type === 'VISITA_TECNICA') {
      this.agendaModal?.open('reschedule', {
        date: item.date,
        reason: null
      });
      return;
    }
  }

  // Confirmar uma visita técnica
  async confirmVisit(item: AgendaResponseDTO): Promise<void> {
    if (!item || !item.referenceId) return;
    if (item.status === 'REAGENDADO' || item.status === 'CANCELADO') return;
    try {
      this.loading = true;
      
      // Visitas técnicas usam endpoint diferente
      if (item.type === 'VISITA_TECNICA') {
        await this.agendaService.confirmarVisitaTecnica(item.referenceId);
      } else {
        // Eventos manuais usam updateEvento
        await this.agendaService.updateEvento(item.referenceId, {
          title: item.title,
          description: item.description || null,
          eventDate: item.date,
          eventType: item.type || 'EVENTO',
          shift: item.shift || 'MANHA',
          clientName: item.clientName || null,
          status: 'CONFIRMADO',
          statusDescricao: 'Confirmado'
        });
      }
      
      this.ui.showToast('Visita confirmada', 'success');
      await this.loadEventos();
    } catch (e) {
      console.error('Erro ao confirmar visita', e);
      this.ui.showToast('Falha ao confirmar visita', 'error');
    } finally {
      this.loading = false;
    }
  }

  // Cancelar uma visita técnica
  async cancelVisit(item: AgendaResponseDTO): Promise<void> {
    if (!item || !item.referenceId) return;
    if (item.status === 'REAGENDADO' || item.status === 'CANCELADO') return;
    if (!confirm(`Deseja cancelar a visita "${item.title}" em ${this.formatDateToBrazil(item.date)}?`)) return;
    try {
      this.loading = true;
      await this.agendaService.updateEvento(item.referenceId, {
        title: item.title,
        description: item.description || null,
        eventDate: item.date,
        eventType: item.type || 'EVENTO',
        shift: item.shift || 'MANHA',
        clientName: item.clientName || null,
        status: 'CANCELADO',
        statusDescricao: 'Cancelado'
      });
      this.ui.showToast('Visita cancelada', 'success');
      await this.loadEventos();
    } catch (e) {
      console.error('Erro ao cancelar visita', e);
      this.ui.showToast('Falha ao cancelar visita', 'error');
    } finally {
      this.loading = false;
    }
  }

  switchView(mode: 'calendar' | 'list'): void {
    console.log(`Alternando view para: ${mode}, eventos disponíveis:`, this.eventos.length);
    this.viewMode = mode;
  }

  openExportModal(): void {
    // default range: últimos 30 dias
    const now = new Date();
    const prior = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    this.exportStart = prior.toISOString().split('T')[0];
    this.exportEnd = now.toISOString().split('T')[0];
    this.showExportModal = true;
  }

  closeExportModal(): void {
    this.showExportModal = false;
  }

  formatDate(fileDate: Date): string {
    const y = fileDate.getFullYear();
    const m = String(fileDate.getMonth() + 1).padStart(2, '0');
    const d = String(fileDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  exportarRelatorio(): void {
    if (!this.exportStart || !this.exportEnd) {
      this.ui.showToast('Informe data inicial e final', 'error');
      return;
    }
    try {
      const dtStart = new Date(this.exportStart + 'T00:00:00');
      const dtEnd = new Date(this.exportEnd + 'T23:59:59');
      this.agendaService.exportarRelatorioPdf(dtStart, dtEnd).subscribe({
        next: (blob: Blob) => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          const filename = `Agenda_Visitas_${this.formatDate(new Date())}.pdf`;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          this.ui.showToast('Download iniciado', 'success');
          this.closeExportModal();
        },
        error: (err) => {
          console.error('Erro ao baixar PDF', err);
          this.ui.showToast('Falha ao baixar PDF', 'error');
        }
      });
    } catch (e) {
      console.error('Erro ao preparar download', e);
      this.ui.showToast('Erro ao preparar o download', 'error');
    }
  }

  getStatusClass(status?: string | null): string {
    if (!status) return '';
    switch (status) {
      case 'REAGENDADO': return 'status-reagendado';
      case 'A_CONFIRMAR': return 'status-a-confirmar';
      case 'CONFIRMADO': return 'status-confirmado';
      case 'CANCELADO': return 'status-cancelado';
      default: return '';
    }
  }

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

  trackByEventoId(index: number, evento: AgendaResponseDTO): any {
    return evento.referenceId;
  }
}