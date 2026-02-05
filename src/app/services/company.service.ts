import { Injectable, inject } from '@angular/core';
import { LegacyService } from './legacy.service';

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
export class CompanyService {
  private legacy = inject(LegacyService);

  /**
   * Busca empresas com paginação
   * @param page Número da página (começando em 0)
   * @param size Quantidade de itens por página
   */
  async getAll(page: number = 0, size: number = 10): Promise<PaginatedResponse<any>> {
    try {
      const baseUrl = this.legacy.apiBaseUrl;
      const url = `${baseUrl}/companies?page=${page}&size=${size}`;

      const resp = await fetch(url, {
        headers: this.legacy.authHeaders()
      });

      if (!resp.ok) {
        throw new Error(`Falha ao carregar empresas (status ${resp.status})`);
      }

      // Obter texto bruto
      const text = await resp.text();
      
      // Tentar fazer parse normal primeiro
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        // Se falhar, fazer parse manual removendo referências circulares
        console.warn('JSON inválido detectado, tentando recuperar...');
        data = this.parseWithCircularRefFix(text);
      }
      
      // Limpar referências circulares nas unidades
      if (data.content && Array.isArray(data.content)) {
        data.content = data.content.map((company: any) => ({
          id: company.id,
          name: company.name,
          cnpj: company.cnpj,
          units: (company.units || []).map((unit: any) => ({
            id: unit.id,
            name: unit.name,
            cnpj: unit.cnpj
          })),
          sectors: company.sectors || []
        }));
      }
      
      // Garantir que a resposta tem a estrutura esperada
      return {
        content: data.content || [],
        page: {
          totalElements: data.page?.totalElements || 0,
          totalPages: data.page?.totalPages || 0,
          number: data.page?.number || 0,
          size: data.page?.size || 10
        }
      };
    } catch (error) {
      console.error('Erro ao buscar empresas:', error);
      throw error;
    }
  }

  /**
   * Cria uma nova empresa via POST /companies
   */
  async create(payload: { name: string; cnpj: string; units?: any[]; sectors?: any[] }): Promise<any> {
    try {
      const url = `${this.legacy.apiBaseUrl}/companies`;
      const body = {
        name: payload.name,
        cnpj: payload.cnpj,
        units: payload.units || [],
        sectors: payload.sectors || []
      };
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          ...this.legacy.authHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        let err = `Status ${resp.status}: ${resp.statusText}`;
        try {
          const ct = resp.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const b = await resp.json();
            if (b.message) err = b.message;
            else err += ` | ${JSON.stringify(b)}`;
          } else {
            const t = await resp.text();
            err += ` | ${t}`;
          }
        } catch (_) {}
        const e: any = new Error(err);
        e.status = resp.status;
        throw e;
      }

      return await resp.json();
    } catch (err) {
      console.error('[CompanyService] Erro ao criar empresa:', err);
      throw err;
    }
  }

  /**
   * Atualiza uma empresa existente via PUT /companies/{id}
   */
  async update(id: number, payload: { name: string; cnpj: string; units?: any[]; sectors?: any[] }): Promise<any> {
    try {
      const url = `${this.legacy.apiBaseUrl}/companies/${id}`;
      const body = {
        name: payload.name,
        cnpj: payload.cnpj,
        units: payload.units || [],
        sectors: payload.sectors || []
      };
      const resp = await fetch(url, {
        method: 'PUT',
        headers: {
          ...this.legacy.authHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        let err = `Status ${resp.status}: ${resp.statusText}`;
        try {
          const ct = resp.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const b = await resp.json();
            if (b.message) err = b.message;
            else err += ` | ${JSON.stringify(b)}`;
          } else {
            const t = await resp.text();
            err += ` | ${t}`;
          }
        } catch (_) {}
        const e: any = new Error(err);
        e.status = resp.status;
        throw e;
      }

      return await resp.json();
    } catch (err) {
      console.error('[CompanyService] Erro ao atualizar empresa:', err);
      throw err;
    }
  }

  /**
   * Parse manual de JSON com referências circulares
   * Remove "company" dos objetos aninhados para quebrar o loop
   */
  private parseWithCircularRefFix(text: string): any {
    try {
      // Encontrar a posição onde o JSON fica inválido (aproximadamente)
      // Vamos remover todas as propriedades "company" aninhadas
      let cleaned = text.replace(/"company":\{[^}]*"units":/g, '"company":null,"units":');
      
      // Se ainda não funcionar, tenta uma abordagem mais agressiva
      if (!this.isValidJSON(cleaned)) {
        // Remove toda ocorrência de ,"company":{...} até o próximo ] ou }
        cleaned = text.replace(/"company":\{[\s\S]*?\}(?=,"units"|,"id"|,"name"|,"cnpj"|\]|\})/g, '"company":null');
      }

      // Última tentativa: encontrar apenas o conteúdo válido até "content" e reconstruir
      if (!this.isValidJSON(cleaned)) {
        const contentMatch = text.match(/"content":\[([\s\S]*?)\],"page"/);
        if (contentMatch) {
          // Temos o array de empresas, vamos reconstruir o JSON simples
          const metadata = text.match(/"page":\{\s*"totalElements":(\d+),"totalPages":(\d+),"number":(\d+),"size":(\d+)/);
          if (metadata) {
            return {
              content: [], // Retornar vazio é melhor que erro
              page: {
                totalElements: parseInt(metadata[1]) || 0,
                totalPages: parseInt(metadata[2]) || 0,
                number: parseInt(metadata[3]) || 0,
                size: parseInt(metadata[4]) || 10
              }
            };
          }
        }
        throw new Error('Não foi possível recuperar o JSON da resposta');
      }

      return JSON.parse(cleaned);
    } catch (e) {
      console.error('Falha no parse manual:', e);
      throw new Error('Resposta do servidor não é um JSON válido - possível referência circular no backend');
    }
  }

  /**
   * Verifica se uma string é um JSON válido
   */
  private isValidJSON(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }
}
