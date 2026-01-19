import { Injectable, inject } from '@angular/core';
import { LegacyService } from './legacy.service';

export interface Client {
  id?: number;
  name: string;
  email: string;
  companyIds: number[];
  companies?: any[];
  companyNames?: string[];
}

export interface PaginatedResponse<T> {
  content: T[];
  page: {
    totalElements: number;
    totalPages: number;
    number: number;
    size: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ClientService {
  private legacy = inject(LegacyService);

  async getAll(page: number = 0, size: number = 10): Promise<PaginatedResponse<Client>> {
    try {
      const url = `${this.legacy.apiBaseUrl}/clients?page=${page}&size=${size}`;
      console.log('[ClientService] GET', url);

      const resp = await fetch(url, {
        method: 'GET',
        headers: this.legacy.authHeaders()
      });

      if (!resp.ok) {
        let errorMsg = `Status ${resp.status}: ${resp.statusText}`;
        try {
          const ct = resp.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const errBody = await resp.json();
            errorMsg += ` | ${JSON.stringify(errBody)}`;
          }
        } catch (_) {}
        throw new Error(errorMsg);
      }

      const data = await resp.json();
      console.log('[ClientService] Clientes obtidos:', data);

      if (Array.isArray(data)) {
        return {
          content: data,
          page: {
            totalElements: data.length,
            totalPages: 1,
            number: 0,
            size: data.length
          }
        };
      }

      return {
        content: data.content || [],
        page: {
          totalElements: data.page?.totalElements || 0,
          totalPages: data.page?.totalPages || 0,
          number: data.page?.number || 0,
          size: data.page?.size || 10
        }
      };
    } catch (err) {
      console.error('[ClientService] Erro ao buscar clientes:', err);
      throw err;
    }
  }

  async getById(id: number): Promise<Client> {
    try {
      const url = `${this.legacy.apiBaseUrl}/clients/${id}`;
      console.log('[ClientService] GET', url);

      const resp = await fetch(url, {
        method: 'GET',
        headers: this.legacy.authHeaders()
      });

      if (!resp.ok) {
        let errorMsg = `Status ${resp.status}: ${resp.statusText}`;
        try {
          const ct = resp.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const errBody = await resp.json();
            errorMsg += ` | ${JSON.stringify(errBody)}`;
          }
        } catch (_) {}
        throw new Error(errorMsg);
      }

      const data = await resp.json();
      console.log('[ClientService] Cliente obtido:', data);
      return data;
    } catch (err) {
      console.error('[ClientService] Erro ao buscar cliente:', err);
      throw err;
    }
  }

  async create(client: Client): Promise<Client> {
    try {
      const url = `${this.legacy.apiBaseUrl}/clients`;
      const payload = {
        name: client.name,
        email: client.email,
        companyIds: client.companyIds || []
      };

      console.log('[ClientService] POST', url, payload);

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          ...this.legacy.authHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        let errorMsg = `Status ${resp.status}: ${resp.statusText}`;
        try {
          const ct = resp.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const errBody = await resp.json();
            errorMsg += ` | ${JSON.stringify(errBody)}`;
          } else {
            const errText = await resp.text();
            errorMsg += ` | ${errText}`;
          }
        } catch (_) {}
        throw new Error(errorMsg);
      }

      const data = await resp.json();
      console.log('[ClientService] Cliente criado:', data);
      return data;
    } catch (err) {
      console.error('[ClientService] Erro ao criar cliente:', err);
      throw err;
    }
  }

  async update(id: number, client: Client): Promise<Client> {
    try {
      const url = `${this.legacy.apiBaseUrl}/clients/${id}`;
      const payload = {
        name: client.name,
        email: client.email,
        companyIds: client.companyIds || []
      };

      console.log('[ClientService] PUT', url, payload);

      const resp = await fetch(url, {
        method: 'PUT',
        headers: {
          ...this.legacy.authHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        let errorMsg = `Status ${resp.status}: ${resp.statusText}`;
        try {
          const ct = resp.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const errBody = await resp.json();
            errorMsg += ` | ${JSON.stringify(errBody)}`;
          } else {
            const errText = await resp.text();
            errorMsg += ` | ${errText}`;
          }
        } catch (_) {}
        throw new Error(errorMsg);
      }

      const data = await resp.json();
      console.log('[ClientService] Cliente atualizado:', data);
      return data;
    } catch (err) {
      console.error('[ClientService] Erro ao atualizar cliente:', err);
      throw err;
    }
  }

  async delete(id: number): Promise<void> {
    try {
      const url = `${this.legacy.apiBaseUrl}/clients/${id}`;
      console.log('[ClientService] DELETE', url);

      const resp = await fetch(url, {
        method: 'DELETE',
        headers: this.legacy.authHeaders()
      });

      if (!resp.ok) {
        let errorMsg = `Status ${resp.status}: ${resp.statusText}`;
        let errorDetails = null;
        try {
          const ct = resp.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const errBody = await resp.json();
            errorDetails = errBody;
            // Tenta usar a mensagem customizada do backend, senão usa o error
            if (errBody.message) {
              errorMsg = errBody.message;
            } else if (errBody.error) {
              errorMsg = errBody.error;
            } else {
              errorMsg += ` | ${JSON.stringify(errBody)}`;
            }
          } else {
            const errText = await resp.text();
            errorMsg += ` | ${errText}`;
          }
        } catch (_) {}
        
        const error = new Error(errorMsg);
        (error as any).details = errorDetails;
        (error as any).status = resp.status;
        throw error;
      }

      console.log('[ClientService] Cliente deletado:', id);
    } catch (err) {
      console.error('[ClientService] Erro ao deletar cliente:', err);
      throw err;
    }
  }
}
