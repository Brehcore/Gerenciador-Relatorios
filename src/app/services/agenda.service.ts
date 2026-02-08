import { Injectable, inject } from '@angular/core';
import { LegacyService } from './legacy.service';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * Interface que representa a resposta da API de agenda.
 * Contém informações sobre eventos, visitas e visitas reagendadas.
 * Suporta lógica híbrida: Eventos Manuais + Visitas Técnicas Oficiais
 */
export interface AgendaResponseDTO {
  referenceId: number;
  title: string;
  date: string; // yyyy-MM-dd
  type: 'EVENTO' | 'TREINAMENTO' | 'VISITA_TECNICA' | null;
  description?: string | null;
  shift?: 'MANHA' | 'TARDE';
  responsibleName?: string | null;
  clientName?: string | null;
  unitName?: string | null;
  sectorName?: string | null;

  // --- NOVOS CAMPOS ---
  status?: 'CONFIRMADO' | 'A_CONFIRMAR' | 'REAGENDADO' | 'CANCELADO' | null;
  statusDescricao?: string | null; // Ex: "Reagendado p/ 25/02" ou "Confirmado"

  // --- Campos de visita técnica (compatibilidade)
  sourceVisitId?: number | null;
  originalVisitDate?: string | null;
  nextVisitDate?: string | null;
  nextVisitShift?: 'MANHA' | 'TARDE' | null;
}

/**
 * Serviço responsável por gerenciar operações relacionadas à agenda de eventos.
 * Fornece métodos para criar, atualizar, excluir e consultar eventos da agenda.
 * Sincronizado com o AgendaController do backend.
 */
@Injectable({ providedIn: 'root' })
export class AgendaService {
  private legacy = inject(LegacyService);
  private http = inject(HttpClient);

  private baseUrl(): string {
    return `${this.legacy.apiBaseUrl}/api/agenda`;
  }

  private headersJson(): Record<string,string> {
    return { ...this.legacy.authHeaders() } as Record<string,string>;
  }

  /**
   * Retorna todos os eventos da agenda do usuário autenticado.
   * 
   * @returns Promise contendo lista de AgendaResponseDTO
   * @throws Error se a requisição falhar
   */
  async listEventos(): Promise<AgendaResponseDTO[]> {
    const url = `${this.baseUrl()}/eventos`;
    const resp = await fetch(url, { headers: this.legacy.authHeaders() });
    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Falha ao listar eventos: ${errorText}`);
    }
    return resp.json();
  }

  /**
   * Cria um novo evento na agenda.
   * 
   * @param payload Objeto com title, description, eventDate, shift e clientName
   * @returns Promise contendo o AgendaResponseDTO do evento criado
   * @throws Error se a requisição falhar
   */
  async createEvento(payload: { title: string; description?: string | null; eventDate: string; shift?: 'MANHA' | 'TARDE'; clientName?: string | null; }): Promise<AgendaResponseDTO> {
    const url = `${this.baseUrl()}/eventos`;
    const resp = await fetch(url, { 
      method: 'POST', 
      headers: this.headersJson(), 
      body: JSON.stringify(payload) 
    });
    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Falha ao criar evento: ${errorText}`);
    }
    return resp.json();
  }

  /**
   * Atualiza um evento existente na agenda.
   * 
   * @param id Identificador do evento (AgendaEvent ID)
   * @param payload Objeto com title, description, eventDate, eventType, shift e clientName
   * @returns Promise contendo o AgendaResponseDTO do evento atualizado
   * @throws Error se a requisição falhar
   */
  async updateEvento(id: number | string, payload: { title: string; description?: string | null; eventDate: string; eventType: string; shift?: 'MANHA' | 'TARDE'; clientName?: string | null; status?: 'CONFIRMADO' | 'A_CONFIRMAR' | 'REAGENDADO' | 'CANCELADO'; statusDescricao?: string | null; }): Promise<AgendaResponseDTO> {
    const url = `${this.baseUrl()}/eventos/${id}`;
    const resp = await fetch(url, { 
      method: 'PUT', 
      headers: this.headersJson(), 
      body: JSON.stringify(payload) 
    });
    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Falha ao atualizar evento: ${errorText}`);
    }
    return resp.json();
  }

  /**
   * Reagenda uma visita técnica, convertendo-a em um evento de agenda.
   * 
   * @param visitId Identificador da visita técnica original (TechnicalVisit ID)
   * @param payload Objeto com newDate e reason
   * @returns Promise contendo o AgendaResponseDTO do evento reagendado
   * @throws Error se a requisição falhar
   */
  async rescheduleVisit(visitId: number | string, payload: { newDate: string; reason?: string | null; }): Promise<AgendaResponseDTO> {
    const url = `${this.baseUrl()}/visitas/${visitId}/reagendar`;
    const resp = await fetch(url, { 
      method: 'PUT', 
      headers: this.headersJson(), 
      body: JSON.stringify(payload) 
    });
    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Falha ao reagendar visita: ${errorText}`);
    }
    return resp.json();
  }

  /**
   * Confirma uma visita técnica na agenda.
   * 
   * @param visitId Identificador da visita técnica a ser confirmada
   * @returns Promise vazia (HTTP 200 OK)
   * @throws Error se a requisição falhar
   */
  async confirmarVisitaTecnica(visitId: number | string): Promise<void> {
    const url = `${this.baseUrl()}/visitas/${visitId}/confirmar`;
    const resp = await fetch(url, { 
      method: 'PUT', 
      headers: this.legacy.authHeaders()
    });
    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Falha ao confirmar visita técnica: ${errorText}`);
    }
  }

  /**
   * Remove um evento da agenda.
   * 
   * @param id Identificador do evento a ser removido (AgendaEvent ID)
   * @returns Promise vazia (HTTP 204 No Content)
   * @throws Error se a requisição falhar
   */
  async deleteEvento(id: number | string): Promise<void> {
    const url = `${this.baseUrl()}/eventos/${id}`;
    const resp = await fetch(url, { 
      method: 'DELETE', 
      headers: this.legacy.authHeaders() 
    });
    if (resp.status !== 204 && !resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Falha ao deletar evento: ${errorText}`);
    }
  }

  /**
   * Retorna todos os eventos da agenda do sistema (acesso administrativo).
   * Requer role ADMIN.
   * 
   * @returns Promise contendo lista completa de AgendaResponseDTO
   * @throws Error se a requisição falhar ou sem permissão ADMIN
   */
  async listAllEventos(): Promise<AgendaResponseDTO[]> {
    const url = `${this.baseUrl()}/eventos/all`;
    const resp = await fetch(url, { headers: this.legacy.authHeaders() });
    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Falha ao listar todos os eventos: ${errorText}`);
    }
    return resp.json();
  }

  /**
   * Lista eventos filtrados por uma lista de IDs (melhor performance no backend quando aplicável).
   * Exemplo: GET /api/agenda/eventos?ids=1,2,3
   */
  async listEventosByIds(ids: Array<number | string>): Promise<AgendaResponseDTO[]> {
    if (!ids || !ids.length) return [];
    const q = ids.map(String).join(',');
    const url = `${this.baseUrl()}/eventos?ids=${encodeURIComponent(q)}`;
    const resp = await fetch(url, { headers: this.legacy.authHeaders() });
    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Falha ao listar eventos filtrados: ${errorText}`);
    }
    return resp.json();
  }

  /**
   * Lista eventos filtrados pelo nome do responsável (search por responsibleName).
   * Exemplo: GET /api/agenda/eventos?responsible=Nome%20do%20Usuario
   */
  async listEventosByResponsible(responsible: string): Promise<AgendaResponseDTO[]> {
    if (!responsible || !String(responsible).trim()) return [];
    const url = `${this.baseUrl()}/eventos?responsible=${encodeURIComponent(String(responsible).trim())}`;
    const resp = await fetch(url, { headers: this.legacy.authHeaders() });
    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Falha ao listar eventos por responsável: ${errorText}`);
    }
    return resp.json();
  }

  /**
   * Retorna todos os eventos visíveis globalmente para todos os usuários
   * dentro de um intervalo de datas.
   * Endpoint backend: GET /api/agenda/global?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
   */
  async listGlobalEventos(startDate?: string, endDate?: string): Promise<AgendaResponseDTO[]> {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const url = `${this.baseUrl()}/global${params.toString() ? `?${params.toString()}` : ''}`;
    const resp = await fetch(url, { headers: this.legacy.authHeaders() });
    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Falha ao listar eventos globais: ${errorText}`);
    }
    return resp.json();
  }

  /**
   * Chama o endpoint que retorna o PDF com o histórico da agenda.
   * Retorna um Observable<Blob> para permitir subscribe() do componente.
   */
  exportarRelatorioPdf(inicio: Date, fim: Date): Observable<Blob> {
    const start = inicio.toISOString().split('T')[0];
    const end = fim.toISOString().split('T')[0];
    const params = new HttpParams().set('startDate', start).set('endDate', end);
    const headers = new HttpHeaders(this.legacy.authHeaders());
    const url = `${this.baseUrl()}/export/pdf`;
    return this.http.get(url, { params, headers, responseType: 'blob' as 'blob' });
  }

  /**
   * Verifica conflitos GLOBAIS para uma data/turno fornecidos.
   * Backend deve responder 200 OK com corpo texto contendo mensagem de aviso
   * quando houver conflito, ou body vazio / string vazia quando estiver livre.
   * Exemplo: GET /api/agenda/check-global-conflicts?date=YYYY-MM-DD&shift=MANHA
   */
  async checkGlobalConflicts(date: string, shift?: 'MANHA' | 'TARDE'): Promise<string | null> {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (shift) params.set('shift', shift);
    const url = `${this.baseUrl()}/check-global-conflicts?${params.toString()}`;
    const resp = await fetch(url, { headers: this.legacy.authHeaders() });
    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Falha ao verificar conflitos globais: ${errorText}`);
    }
    // Backend retorna JSON: { warning: '...' } quando há conflito, ou {} quando livre
    try {
      const json = await resp.json();
      if (json && typeof json.warning === 'string' && json.warning.trim().length) return json.warning.trim();
      return null;
    } catch (e) {
      // fallback: se não puder parsear JSON, tentar ler texto
      const text = (await resp.text()).trim();
      return text.length ? text : null;
    }
  }

  /**
   * Confirma o agendamento/visita.
   * - Para `VISITA_TECNICA` chama o endpoint específico de confirmar visita.
   * - Para eventos manuais, faz um PUT no recurso de eventos atualizando o status.
   * Retorna um Observable para o caller decidir subscribe/pipe.
   */
  confirmarAgendamento(evento: AgendaResponseDTO) {
    if (!evento || !evento.referenceId) throw new Error('Evento inválido para confirmação');
    const headers = new HttpHeaders(this.legacy.authHeaders());
    if (evento.type === 'VISITA_TECNICA') {
      const url = `${this.baseUrl()}/visitas/${evento.referenceId}/confirmar`;
      return this.http.put(url, {}, { headers });
    } else {
      const url = `${this.baseUrl()}/eventos/${evento.referenceId}`;
      const payload = {
        title: evento.title,
        description: evento.description || null,
        eventDate: evento.date,
        eventType: evento.type || 'EVENTO',
        shift: evento.shift || 'MANHA',
        clientName: evento.clientName || null,
        status: 'CONFIRMADO'
      };
      return this.http.put(url, payload, { headers });
    }
  }
}
