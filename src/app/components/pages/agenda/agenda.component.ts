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
      this.isAdmin = !!(role && role.toUpperCase() === 'ADMIN');

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
              if (calApi && calApi.view && calApi.view.activeStart && calApi.view.activeEnd) {
                const activeStart: Date = calApi.view.activeStart as Date;
                const activeEnd: Date = calApi.view.activeEnd as Date;
                const startDate = activeStart.toISOString().split('T')[0];
                // activeEnd costuma ser exclusivo, subtrair 1ms para garantir inclusão do dia anterior
                const endDate = new Date(activeEnd.getTime() - 1).toISOString().split('T')[0];
                this.eventos = await this.agendaService.listGlobalEventos(startDate, endDate);
              } else {
                this.eventos = await this.agendaService.listGlobalEventos();
              }
            } catch (err) {
              console.warn('Erro ao obter agenda global com intervalo, tentando sem intervalo', err);
              this.eventos = await this.agendaService.listGlobalEventos();
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
    // Adicionar turno ao título se disponível
    let title = evento.title;
    if (evento.shift) {
      const shiftLabel = evento.shift === 'MANHA' ? '🌅 Manhã' : '🌆 Tarde';
      title = `${title} (${shiftLabel})`;
    }

    return {
      id: String(evento.referenceId),
      title: title,
      start: evento.date,
      backgroundColor: this.getColorByType(evento.type || 'EVENTO'),
      borderColor: this.getColorByType(evento.type || 'EVENTO'),
      extendedProps: {
        type: evento.type || 'EVENTO',
        description: evento.description,
        shift: evento.shift,
        clientName: evento.clientName,
        originalDate: evento.originalVisitDate,
        sourceVisitId: evento.sourceVisitId,
        nextVisitDate: evento.nextVisitDate,
        nextVisitShift: evento.nextVisitShift,
        responsibleName: evento.responsibleName || null
      }
    };
  }

  private getColorByType(type: string): string {
    const colors: { [key: string]: string } = {
      'EVENTO': '#3b82f6',           // azul
      'VISITA': '#10b981',           // verde
      'VISITA_REAGENDADA': '#f59e0b' // amarelo/laranja
    };
    return colors[type] || '#6b7280';
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
    if (evento && (evento.type === 'VISITA' || evento.type === 'VISITA_REAGENDADA')) {
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
      } else if (data.mode === 'reschedule') {
        if (!this.currentEditingItem) return;
        const visitId = this.currentEditingItem.sourceVisitId || this.currentEditingItem.referenceId;
        await this.agendaService.rescheduleVisit(visitId, {
          newDate: data.date,
          reason: data.reason || null
        });
        this.ui.showToast('Visita reagendada com sucesso', 'success');
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
    if (item.type === 'VISITA' || item.type === 'VISITA_REAGENDADA') {
      this.agendaModal?.open('reschedule', {
        date: item.date,
        reason: null
      });
      return;
    }
  }

  switchView(mode: 'calendar' | 'list'): void {
    console.log(`Alternando view para: ${mode}, eventos disponíveis:`, this.eventos.length);
    this.viewMode = mode;
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