import { Injectable, inject } from '@angular/core';
import { LegacyService } from './legacy.service';
import localforage from 'localforage';

@Injectable({
  providedIn: 'root'
})
export class ReportService {
  private legacy = inject(LegacyService);

  async postInspectionReport(payload: any) {
    try {
      const token = localStorage.getItem('jwtToken');
      const headers: any = {
        'Content-Type': 'application/json'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      if (!payload || typeof payload !== 'object') {
        throw new Error('Payload inválido: não é um objeto');
      }
      
      // 🔍 DEBUG: Criar uma cópia do payload sem as imagens para log (ficam muito grandes)
      const payloadForLogging = JSON.parse(JSON.stringify(payload));
      if (payloadForLogging.clientSignature?.signatureImage) {
        payloadForLogging.clientSignature.signatureImage = `[BASE64 - ${payloadForLogging.clientSignature.signatureImage.length} chars]`;
      }
      if (payloadForLogging.technicianSignature?.signatureImage) {
        payloadForLogging.technicianSignature.signatureImage = `[BASE64 - ${payloadForLogging.technicianSignature.signatureImage.length} chars]`;
      }
      if (payloadForLogging.technicianSignatureImageBase64) {
        payloadForLogging.technicianSignatureImageBase64 = `[BASE64 - ${payloadForLogging.technicianSignatureImageBase64.length} chars]`;
      }
      
      console.log('[ReportService] 📤 Enviando para /risk-checklist');
      console.log('[ReportService] 🔍 Payload recebido no postRiskChecklist:', {
        hasTechnicianSignature: !!payload.technicianSignatureImageBase64,
        signatureLength: payload.technicianSignatureImageBase64?.length || 0,
        signatureStarts: payload.technicianSignatureImageBase64?.substring(0, 50),
        technicianName: payload.technicianName
      });
      console.log('[ReportService] 🔍 Validando e limpando IDs aninhados...');
      this.validatePayloadIds(payload);
      
      // 🗑️ IMPORTANTE: Remover qualquer campo 'id' null/undefined que possa causar validação no backend
      const cleanedPayload = this.removeNullIds(payload);
      
      console.log('[ReportService] 📋 Payload (sem Base64):', JSON.stringify(payloadForLogging, null, 2));
      
      const jsonPayload = JSON.stringify(cleanedPayload);
      console.log('[ReportService] � Estrutura do payload:', Object.keys(payload));
      console.log('[ReportService] 📊 Tamanho:', jsonPayload.length, 'bytes');
      
      const resp = await fetch(`${this.legacy.apiBaseUrl}/inspection-reports`, { 
        headers,
        method: 'POST',
        body: jsonPayload  // Usando cleanedPayload (sem IDs nulos)
      });
      
      if (!resp.ok) {
        let errorDetails = `Status ${resp.status}: ${resp.statusText}`;
        try {
          const contentType = resp.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorBody = await resp.json();
            errorDetails += ` | ${JSON.stringify(errorBody)}`;
            console.error('[ReportService] ❌ Erro JSON do backend:', errorBody);
            console.error('[ReportService] 🔍 DICA: "The given id must not be null" geralmente significa:');
            console.error('[ReportService] 🔍   1. Uma entidade com @GeneratedValue está sendo salva com id=null');
            console.error('[ReportService] 🔍   2. Um relacionamento @ManyToOne está faltando ou mal estruturado');
            console.error('[ReportService] 🔍   3. Um cascade não está configurado corretamente');
            console.error('[ReportService] 📊 Payload enviado:', payloadForLogging);
          } else {
            const errorText = await resp.text();
            errorDetails += ` | ${errorText}`;
            console.error('[ReportService] ❌ Erro texto do backend:', errorText);
          }
        } catch (parseErr) {
          console.warn('[ReportService] ⚠️ Não foi possível fazer parse da resposta de erro', parseErr);
        }
        throw new Error(errorDetails);
      }
      
      const data = await resp.json();
      console.log('[ReportService] ✅ Inspeção salva com sucesso:', data);
      return data;
    } catch (err) {
      console.error('[ReportService] ❌ ERRO ao postar inspeção:', err);
      throw err;
    }
  }

  // Envia relatório NRS específico para endpoint /inspection-reports/nrs
  async postNrsReport(payload: any) {
    try {
      const token = localStorage.getItem('jwtToken');
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      if (!payload || typeof payload !== 'object') {
        throw new Error('Payload inválido: não é um objeto');
      }

      const payloadForLogging = JSON.parse(JSON.stringify(payload));
      if (payloadForLogging.clientSignature?.signatureImage) {
        payloadForLogging.clientSignature.signatureImage = `[BASE64 - ${payloadForLogging.clientSignature.signatureImage.length} chars]`;
      }

      console.log('[ReportService] 📤 Enviando NRS para /inspection-reports/nrs');
      this.validatePayloadIds(payload);
      const cleanedPayload = this.removeNullIds(payload);

      const resp = await fetch(`${this.legacy.apiBaseUrl}/inspection-reports/nrs`, {
        headers,
        method: 'POST',
        body: JSON.stringify(cleanedPayload)
      });

      if (!resp.ok) {
        let errorDetails = `Status ${resp.status}: ${resp.statusText}`;
        try {
          const ct = resp.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const body = await resp.json();
            errorDetails += ` | ${JSON.stringify(body)}`;
          } else {
            const txt = await resp.text();
            errorDetails += ` | ${txt}`;
          }
        } catch (_) { /* ignore */ }
        throw new Error(errorDetails);
      }

      const data = await resp.json();
      return data;
    } catch (err) {
      console.error('[ReportService] ❌ ERRO ao postar NRS:', err);
      throw err;
    }
  }

  private validatePayloadIds(obj: any, path: string = ''): void {
    if (!obj || typeof obj !== 'object') return;
    
    // Verificar se há campo 'id' com valor null
    if (obj.hasOwnProperty('id')) {
      if (obj.id === null || obj.id === undefined || obj.id === 0) {
        console.warn(`[ReportService] ⚠️ Campo 'id' é nulo ou zero em: ${path || 'raiz'}`);
      } else {
        console.log(`[ReportService] ✅ Campo 'id' encontrado em ${path}: ${obj.id}`);
      }
    }
    
    // Verificar recursivamente em arrays
    if (Array.isArray(obj)) {
      obj.forEach((item, idx) => {
        this.validatePayloadIds(item, `${path}[${idx}]`);
      });
    } else {
      // Verificar recursivamente em objetos
      Object.keys(obj).forEach(key => {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          this.validatePayloadIds(obj[key], `${path}.${key}`);
        }
      });
    }
  }

  private removeNullIds(obj: any, depth: number = 0): any {
    if (depth > 20) return obj; // Proteção contra recursão infinita
    
    if (!obj || typeof obj !== 'object') return obj;
    
    // Se for array, processar cada elemento
    if (Array.isArray(obj)) {
      return obj.map(item => this.removeNullIds(item, depth + 1));
    }
    
    // Se for objeto, criar cópia sem campos 'id' nulos, undefined ou zero
    const cleaned: any = {};
    Object.keys(obj).forEach(key => {
      // Se for o campo 'id' e for null/undefined, não incluir
      if (key === 'id' && (obj[key] === null || obj[key] === undefined || obj[key] === 0)) {
        return; // Pula este campo
      }
      
      // Se for 'undefined', pular (não enviar)
      if (obj[key] === undefined) {
        return;
      }
      
      // Se for objeto/array, processar recursivamente
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        cleaned[key] = this.removeNullIds(obj[key], depth + 1);
      } else {
        cleaned[key] = obj[key];
      }
    });
    
    return cleaned;
  }

  async fetchInspectionReports(params: Record<string, any> = {}) {
    try {
      const token = localStorage.getItem('jwtToken');
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const qs = new URLSearchParams(params as any).toString();
      const url = `${this.legacy.apiBaseUrl}/documents` + (qs ? ('?' + qs) : '');
      
      const resp = await fetch(url, { 
        headers,
        method: 'GET'
      });
      
      if (!resp.ok) {
        throw new Error(`Status ${resp.status}: ${resp.statusText}`);
      }
      
      const data = await resp.json();
      return data;
    } catch (err) {
      console.error('[ReportService] Erro ao buscar relatórios:', err);
      throw err;
    }
  }

  async fetchLatestDocuments(limit: number = 10) {
    try {
      const token = localStorage.getItem('jwtToken');
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      // Usar fetch diretamente para evitar problemas com HttpClient
      const resp = await fetch(`${this.legacy.apiBaseUrl}/documents/latest`, { 
        headers,
        method: 'GET'
      });
      
      if (!resp.ok) {
        throw new Error(`Status ${resp.status}: ${resp.statusText}`);
      }
      
      const data = await resp.json();
      // Normalize response shape to ensure frontend fields are consistent with examples
      try {
        const list = Array.isArray(data) ? data : (data ? [data] : []);
        const normalized = list.map((it: any) => {
          const id = it.id || it.reportId || it.documentId || it.report_id || '';
          const documentType = it.documentType || it.type || it.reportType || it.document_type || '';
          const title = it.title || it.name || it.reportTitle || '';
          const clientName = it.clientName || it.companyName || it.company || it.client || '';
          const creationDate = it.creationDate || it.createdAt || it.inspectionDate || it.date || '';
          const signed = (typeof it.signed === 'boolean') ? it.signed : (it.isSigned === true || it.signed === 'true');
          return { id, documentType, title, clientName, creationDate, signed };
        });
        return normalized.slice(0, Number(limit) || 10);
      } catch (mapErr) {
        // If normalization fails, return raw data as fallback
        console.warn('[ReportService] ⚠️ Falha ao normalizar /documents/latest response', mapErr);
        return data;
      }
    } catch (err) {
      console.error('[ReportService] Erro ao buscar documentos:', err);
      throw err;
    }
  }

  async fetchCompanies() {
    try {
      const token = localStorage.getItem('jwtToken');
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      // Usar fetch diretamente para evitar problemas com HttpClient
      // Usar size grande para trazer todas as empresas (sem paginação real para dropdowns)
      const resp = await fetch(`${this.legacy.apiBaseUrl}/companies?page=0&size=1000`, { 
        headers,
        method: 'GET'
      });
      
      if (!resp.ok) {
        throw new Error(`Status ${resp.status}: ${resp.statusText}`);
      }
      
      const data = await resp.json();
      
      // Se resposta tiver estrutura paginada, extrair apenas o content
      if (data.page && Array.isArray(data.content)) {
        return data.content;
      }
      
      // Se for um array simples, retornar como está
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('[ReportService] Erro ao buscar empresas:', err);
      throw err;
    }
  }

  // Job roles endpoints
  async fetchJobRoles(companyId: any) {
    if (!companyId) return [];
    try {
      const token = localStorage.getItem('jwtToken');
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const resp = await fetch(`${this.legacy.apiBaseUrl}/job-roles/company/${encodeURIComponent(String(companyId))}`, { headers, method: 'GET' });
      if (!resp.ok) throw new Error(`Status ${resp.status}: ${resp.statusText}`);
      return await resp.json();
    } catch (err) {
      console.error('[ReportService] Erro ao buscar job roles:', err);
      throw err;
    }
  }

  async postJobRole(payload: { name: string; companyId: number }) {
    try {
      const token = localStorage.getItem('jwtToken');
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const resp = await fetch(`${this.legacy.apiBaseUrl}/job-roles`, { headers, method: 'POST', body: JSON.stringify(payload) });
      if (!resp.ok) {
        let err = `Status ${resp.status}: ${resp.statusText}`;
        try { const ct = resp.headers.get('content-type') || ''; if (ct.includes('application/json')) { const b = await resp.json(); err += ` | ${JSON.stringify(b)}`; } } catch(_){}
        throw new Error(err);
      }
      return await resp.json();
    } catch (err) {
      console.error('[ReportService] Erro ao criar job role:', err);
      throw err;
    }
  }

  // Save risk checklist (final report)
  async postRiskChecklist(payload: any) {
    try {
      const token = localStorage.getItem('jwtToken');
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      // 🗑️ IMPORTANTE: Limpar IDs nulos (igual ao PUT)
      const cleanedPayload = this.removeNullIds(payload);
      
      const jsonPayload = JSON.stringify(cleanedPayload);
      const resp = await fetch(`${this.legacy.apiBaseUrl}/risk-checklist`, { headers, method: 'POST', body: jsonPayload });
      if (!resp.ok) {
        let err = `Status ${resp.status}: ${resp.statusText}`;
        try { const ct = resp.headers.get('content-type') || ''; if (ct.includes('application/json')) { const b = await resp.json(); err += ` | ${JSON.stringify(b)}`; } else { const t = await resp.text(); err += ` | ${t}`; } } catch(_){}
        throw new Error(err);
      }
      return await resp.json();
    } catch (err) {
      console.error('[ReportService] Erro ao postar risk-checklist:', err);
      throw err;
    }
  }

  // Update risk checklist (edit)
  async putRiskChecklist(id: any, payload: any) {
    if (!id) throw new Error('id é necessário para atualizar risk-checklist');
    try {
      const token = localStorage.getItem('jwtToken');
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      // 🔍 DEBUG: Log do payload ANTES da limpeza
      console.log('[ReportService] 📋 PUT payload (antes limpeza):', {
        hasTechnicianSignature: !!payload.technicianSignatureImageBase64,
        signatureLength: payload.technicianSignatureImageBase64?.length || 0,
        technicianName: payload.technicianName,
        functionCount: payload.functions?.length || 0,
        checklistId: id
      });
      
      // 🗑️ Limpar IDs nulos
      const cleanedPayload = this.removeNullIds(payload);
      
      // 🔍 DEBUG: Log do payload DEPOIS da limpeza
      console.log('[ReportService] 📋 PUT payload (depois limpeza):', {
        hasTechnicianSignature: !!cleanedPayload.technicianSignatureImageBase64,
        signatureLength: cleanedPayload.technicianSignatureImageBase64?.length || 0,
        technicianName: cleanedPayload.technicianName,
        functionCount: cleanedPayload.functions?.length || 0
      });
      
      const jsonPayload = JSON.stringify(cleanedPayload);
      console.log('[ReportService] 📤 Enviando PUT para /risk-checklist/:id, tamanho:', jsonPayload.length, 'bytes');
      
      const resp = await fetch(`${this.legacy.apiBaseUrl}/risk-checklist/${encodeURIComponent(String(id))}`, { headers, method: 'PUT', body: jsonPayload });
      if (!resp.ok) {
        let err = `Status ${resp.status}: ${resp.statusText}`;
        try { const ct = resp.headers.get('content-type') || ''; if (ct.includes('application/json')) { const b = await resp.json(); err += ` | ${JSON.stringify(b)}`; } else { const t = await resp.text(); err += ` | ${t}`; } } catch(_){}
        throw new Error(err);
      }
      return await resp.json();
    } catch (err) {
      console.error('[ReportService] Erro ao atualizar risk-checklist:', err);
      throw err;
    }
  }

  // Get risk checklist (fetch for edit)
  async getRiskChecklist(id: any) {
    if (!id) throw new Error('id é necessário para obter risk-checklist');
    try {
      const token = localStorage.getItem('jwtToken');
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      console.log('[ReportService] getRiskChecklist - tentando obter ID:', id);
      
      // Tentar obter diretamente via /risk-checklist/:id
      try {
        console.log('[ReportService] Tentando GET /risk-checklist/' + id);
        const resp = await fetch(`${this.legacy.apiBaseUrl}/risk-checklist/${id}`, { headers, method: 'GET' });
        if (resp.ok) {
          const data = await resp.json();
          console.log('[ReportService] ✅ Sucesso com /risk-checklist/:id', data);
          return data;
        } else {
          console.warn('[ReportService] GET /risk-checklist/:id retornou status', resp.status);
        }
      } catch (e) {
        console.warn('[ReportService] /risk-checklist/:id erro:', e);
      }

      // Se não conseguir via /risk-checklist/:id, buscar na listagem de documentos
      console.log('[ReportService] Tentando GET /documents');
      const resp = await fetch(`${this.legacy.apiBaseUrl}/documents`, { headers, method: 'GET' });
      if (!resp.ok) {
        throw new Error(`Status ${resp.status}: ${resp.statusText}`);
      }
      
      const documents = await resp.json();
      console.log('[ReportService] Documentos obtidos:', documents);
      
      const document = Array.isArray(documents) 
        ? documents.find(d => String(d.id || d.reportId) === String(id))
        : (String(documents.id || documents.reportId) === String(id) ? documents : null);
      
      console.log('[ReportService] Documento encontrado:', document);
      
      if (!document) {
        throw new Error(`Documento com ID ${id} não encontrado`);
      }
      
      return document;
    } catch (err) {
      console.error('[ReportService] Erro ao obter risk-checklist:', err);
      throw err;
    }
  }

  async fetchPhysiotherapists() {
    try {
      const token = localStorage.getItem('jwtToken');
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const resp = await fetch(`${this.legacy.apiBaseUrl}/physiotherapists`, { headers, method: 'GET' });
      if (!resp.ok) throw new Error(`Status ${resp.status}: ${resp.statusText}`);
      const data = await resp.json();
      return data;
    } catch (err) {
      console.error('[ReportService] Erro ao buscar fisioterapeutas:', err);
      throw err;
    }
  }

  // Agenda endpoints
  async fetchAgendaEvents() {
    try {
      const token = localStorage.getItem('jwtToken');
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const base = this.getBase() || `${this.legacy.apiBaseUrl}`;
      const resp = await fetch(`${base}/api/agenda/eventos`, { headers, method: 'GET' });
      if (!resp.ok) throw new Error(`Status ${resp.status}: ${resp.statusText}`);
      return await resp.json();
    } catch (err) {
      console.error('[ReportService] Erro ao buscar eventos da agenda:', err);
      throw err;
    }
  }

  async postAgendaEvent(payload: { title: string; description?: string; eventDate: string }) {
    try {
      const token = localStorage.getItem('jwtToken');
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const base = this.getBase() || `${this.legacy.apiBaseUrl}`;
      const resp = await fetch(`${base}/api/agenda/eventos`, { headers, method: 'POST', body: JSON.stringify(payload) });
      if (!resp.ok) {
        let errorDetails = `Status ${resp.status}: ${resp.statusText}`;
        try { const ct = resp.headers.get('content-type') || ''; if (ct.includes('application/json')) { const b = await resp.json(); errorDetails += ` | ${JSON.stringify(b)}`; } else { const t = await resp.text(); errorDetails += ` | ${t}`; } } catch(_) {}
        throw new Error(errorDetails);
      }
      return await resp.json();
    } catch (err) {
      console.error('[ReportService] Erro ao criar evento da agenda:', err);
      throw err;
    }
  }

  async postPhysiotherapist(payload: any) {
    try {
      const token = localStorage.getItem('jwtToken');
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      // Enviar apenas os campos necessários (não enviar `id` para evitar conflitos no backend)
      const bodyPayload: any = {
        name: payload?.name || payload?.nome || '',
        crefito: payload?.crefito || payload?.CREFITO || ''
      };

      const resp = await fetch(`${this.legacy.apiBaseUrl}/physiotherapists`, { 
        headers,
        method: 'POST',
        body: JSON.stringify(bodyPayload)
      });

      if (!resp.ok) {
        let errorDetails = `Status ${resp.status}: ${resp.statusText}`;
        try {
          const contentType = resp.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorBody = await resp.json();
            errorDetails += ` | ${JSON.stringify(errorBody)}`;
          } else {
            const errorText = await resp.text();
            errorDetails += ` | ${errorText}`;
          }
        } catch (_) { /* ignore */ }
        throw new Error(errorDetails);
      }

      const data = await resp.json();
      return data;
    } catch (err) {
      console.error('[ReportService] Erro ao cadastrar fisioterapeuta:', err);
      throw err;
    }
  }

  // AEP specific endpoints
  async postAepReport(payload: any) {
    try {
      const token = localStorage.getItem('jwtToken');
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
  const base = this.getBase() || `${this.legacy.apiBaseUrl}`;
  const resp = await fetch(`${base}/aep-reports`, { headers, method: 'POST', body: JSON.stringify(payload) });
      if (!resp.ok) {
        let errorDetails = `Status ${resp.status}: ${resp.statusText}`;
        try { const ct = resp.headers.get('content-type') || ''; if (ct.includes('application/json')) { const b = await resp.json(); errorDetails += ` | ${JSON.stringify(b)}`; } else { const t = await resp.text(); errorDetails += ` | ${t}`; } } catch(_){}
        throw new Error(errorDetails);
      }
      return await resp.json();
    } catch (err) { console.error('[ReportService] Erro ao postar AEP:', err); throw err; }
  }

  async putAepReport(id: any, payload: any) {
    if (!id) throw new Error('id é necessário para atualizar AEP');
    try {
      const token = localStorage.getItem('jwtToken');
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
  const base = this.getBase() || `${this.legacy.apiBaseUrl}`;
  const resp = await fetch(`${base}/aep-reports/${encodeURIComponent(String(id))}`, { headers, method: 'PUT', body: JSON.stringify(payload) });
      if (!resp.ok) {
        let errorDetails = `Status ${resp.status}: ${resp.statusText}`;
        try { const ct = resp.headers.get('content-type') || ''; if (ct.includes('application/json')) { const b = await resp.json(); errorDetails += ` | ${JSON.stringify(b)}`; } else { const t = await resp.text(); errorDetails += ` | ${t}`; } } catch(_){}
        throw new Error(errorDetails);
      }
      return await resp.json();
    } catch (err) { console.error('[ReportService] Erro ao atualizar AEP:', err); throw err; }
  }

  async getAepReport(id: any) {
    if (!id) throw new Error('id é necessário para obter AEP');
    try {
      const token = localStorage.getItem('jwtToken');
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const base = this.getBase() || `${this.legacy.apiBaseUrl}`;
      const resp = await fetch(`${base}/aep-reports/${encodeURIComponent(String(id))}`, { headers, method: 'GET' });
      if (!resp.ok) {
        let errorDetails = `Status ${resp.status}: ${resp.statusText}`;
        try { const ct = resp.headers.get('content-type') || ''; if (ct.includes('application/json')) { const b = await resp.json(); errorDetails += ` | ${JSON.stringify(b)}`; } else { const t = await resp.text(); errorDetails += ` | ${t}`; } } catch(_){ }
        throw new Error(errorDetails);
      }
      return await resp.json();
    } catch (err) { console.error('[ReportService] Erro ao obter AEP:', err); throw err; }
  }

  async postCompany(payload: any) {
    try {
      const token = localStorage.getItem('jwtToken');
      const headers: any = {
        'Content-Type': 'application/json'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const resp = await fetch(`${this.legacy.apiBaseUrl}/companies`, { 
        headers,
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      if (!resp.ok) {
        throw new Error(`Status ${resp.status}: ${resp.statusText}`);
      }
      
      const data = await resp.json();
      return data;
    } catch (err) {
      console.error('[ReportService] Erro ao postar empresa:', err);
      throw err;
    }
  }

  async postTechnicalVisit(payload: any) {
    try {
      const token = localStorage.getItem('jwtToken');
      const headers: any = {
        'Content-Type': 'application/json'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const resp = await fetch(`${this.legacy.apiBaseUrl}/technical-visits`, { 
        headers,
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      if (!resp.ok) {
        // Tentar capturar o erro detalhado do backend
        let errorDetails = `Status ${resp.status}: ${resp.statusText}`;
        let errorBody: any = null;
        try {
          const contentType = resp.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            errorBody = await resp.json();
            errorDetails += ` | ${JSON.stringify(errorBody)}`;
          } else {
            const errorText = await resp.text();
            errorDetails += ` | ${errorText}`;
          }
        } catch (parseErr) {
          console.warn('[ReportService] Não foi possível fazer parse da resposta de erro', parseErr);
        }
        // Lança um objeto com dados estruturados para o frontend poder mostrar mensagens
        const errObj: any = { message: errorDetails, status: resp.status, responseJson: errorBody };
        throw errObj;
      }
      
      const data = await resp.json();
      return data;
    } catch (err) {
      console.error('[ReportService] Erro ao postar visita técnica:', err);
      throw err;
    }
  }

  // For operations that need raw Response (PDF download, DELETE with raw response)
  private getBase() {
    // LegacyService exposes apiBaseUrl ('' on prod) which matches legacy behavior
    return (this.legacy && (this.legacy as any).apiBaseUrl) || '';
  }

  private authHeaders(): Record<string,string> {
    try { return this.legacy.authHeaders(); } catch(_) { return {}; }
  }

  // Tries multiple slugs until a PDF is returned (mirrors legacy.fetchReportPdf)
  async fetchReportPdf(typeSlugOrArray: string[] | string, reportId: string): Promise<Response> {
    if (!reportId) throw new Error('reportId ausente');
    const types = Array.isArray(typeSlugOrArray) ? typeSlugOrArray.map(t => String(t || '')) : [String(typeSlugOrArray || '')];
    const canonical = ['visit','report','checklist','aep'];
    const candidates: string[] = [];
    types.forEach(t => { if (!candidates.includes(t)) candidates.push(t); });
    canonical.forEach(c => { if (!candidates.includes(c)) candidates.push(c); });
    let lastResp: Response | null = null;
    for (const tRaw of candidates) {
      const t = tRaw == null ? '' : String(tRaw);
      try {
        const url = `${this.getBase()}/documents/${encodeURIComponent(t)}/${encodeURIComponent(reportId)}/pdf`;
        const resp = await fetch(url, { headers: this.authHeaders() });
        lastResp = resp;
        if (!resp.ok) continue;
        const ct = (resp.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('pdf')) return resp;
        continue;
      } catch (err) {
        lastResp = null;
        continue;
      }
    }
    if (lastResp) return lastResp;
    throw new Error('Não foi possível obter PDF para os tipos solicitados.');
  }

  async deleteInspectionReport(reportId: string) {
    if (!reportId) throw new Error('reportId ausente');
    const url = `${this.getBase()}/documents/${encodeURIComponent(reportId)}`;
    return fetch(url, { method: 'DELETE', headers: this.authHeaders() });
  }

  async deleteDocument(type: string, id: string) {
    if (!type || !id) throw new Error('type e id são necessários para exclusão do documento');
    const url = `${this.getBase()}/documents/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
    return fetch(url, { method: 'DELETE', headers: this.authHeaders() });
  }

  /**
   * Envia um documento por e-mail
   * @param type - Tipo de documento (visit, risk, checklist, aep)
   * @param id - ID do documento
   * @returns Promise<any> - Resposta do servidor (sucesso ou erro)
   */
  async sendDocumentEmail(type: string, id: string | number): Promise<any> {
    if (!type || !id) {
      throw new Error('type e id são necessários para enviar e-mail');
    }
    
    try {
      const token = localStorage.getItem('jwtToken');
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const url = `${this.legacy.apiBaseUrl}/documents/email/${encodeURIComponent(String(type))}/${encodeURIComponent(String(id))}`;
      
      console.log('[ReportService] 📧 Enviando e-mail para:', url);
      
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({})  // Corpo vazio conforme especificado
      });
      
      if (!resp.ok) {
        let errorDetails = `Status ${resp.status}: ${resp.statusText}`;
        try {
          const contentType = resp.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorBody = await resp.json();
            errorDetails += ` | ${JSON.stringify(errorBody)}`;
            console.error('[ReportService] ❌ Erro ao enviar e-mail:', errorBody);
          } else {
            const errorText = await resp.text();
            errorDetails += ` | ${errorText}`;
            console.error('[ReportService] ❌ Erro ao enviar e-mail (texto):', errorText);
          }
        } catch (parseErr) {
          console.warn('[ReportService] ⚠️ Não foi possível fazer parse da resposta de erro', parseErr);
        }
        throw new Error(errorDetails);
      }
      
      const data = await resp.json();
      console.log('[ReportService] ✅ E-mail enviado com sucesso:', data);
      return data;
    } catch (err) {
      console.error('[ReportService] ❌ ERRO ao enviar e-mail:', err);
      throw err;
    }
  }

  // ---------------------------
  // Draft / offline helpers
  // ---------------------------
  private PENDING_KEY = 'pendingTechnicalVisits';

  // Use IndexedDB via localforage for storing pending drafts (safer for large base64 images)
  async savePendingDraft(draft: any): Promise<void> {
    try {
      const list = (await localforage.getItem(this.PENDING_KEY) as any[]) || [];
      const id = `pending_${Date.now()}`;
      list.push({ id, createdAt: Date.now(), draft });
      await localforage.setItem(this.PENDING_KEY, list);
      console.log('[ReportService] Rascunho salvo localmente com id', id);
    } catch (e) {
      console.error('[ReportService] Falha ao salvar rascunho localmente', e);
      // Fallback: try to use localStorage if IndexedDB unavailable
      try {
        const raw = localStorage.getItem(this.PENDING_KEY) || '[]';
        const list = JSON.parse(raw);
        const id = `pending_${Date.now()}`;
        list.push({ id, createdAt: Date.now(), draft });
        localStorage.setItem(this.PENDING_KEY, JSON.stringify(list));
        console.log('[ReportService] Rascunho salvo em localStorage (fallback) id', id);
      } catch (e2) {
        console.error('[ReportService] Falha ao salvar rascunho em localStorage (fallback)', e2);
      }
    }
  }

  async getPendingDrafts(): Promise<Array<any>> {
    try {
      const list = (await localforage.getItem(this.PENDING_KEY) as any[]) || [];
      return list;
    } catch (e) {
      try {
        const raw = localStorage.getItem(this.PENDING_KEY) || '[]';
        return JSON.parse(raw);
      } catch (_) {
        return [];
      }
    }
  }

  async removePendingDraft(id: string): Promise<void> {
    try {
      const list = (await this.getPendingDrafts()) || [];
      const filtered = list.filter((i: any) => i.id !== id);
      await localforage.setItem(this.PENDING_KEY, filtered);
      console.log('[ReportService] Rascunho removido:', id);
    } catch (e) {
      console.error('[ReportService] Falha ao remover rascunho', e);
      try {
        const raw = localStorage.getItem(this.PENDING_KEY) || '[]';
        const list = JSON.parse(raw).filter((i: any) => i.id !== id);
        localStorage.setItem(this.PENDING_KEY, JSON.stringify(list));
      } catch (_) {}
    }
  }

  /**
   * Tenta reenviar rascunhos pendentes para o backend.
   * Remove os que forem enviados com sucesso.
   * Retorna informações sobre o resultado.
   */
  async retryPendingDrafts(): Promise<{ success: number; failed: number }> {
    const pending = await this.getPendingDrafts();
    if (!pending || pending.length === 0) return { success: 0, failed: 0 };
    
    let success = 0, failed = 0;
    console.log('[ReportService] Tentando reenviar', pending.length, 'rascunhos pendentes');
    
    for (const item of pending) {
      try {
        // **IMPORTANTE: Validar que o rascunho tem clientCompanyId antes de tentar reenviar**
        if (!item.draft || !item.draft.clientCompanyId) {
          console.warn('[ReportService] Rascunho sem clientCompanyId, removendo:', item.id);
          await this.removePendingDraft(item.id);
          failed++;
          continue;
        }

        // postTechnicalVisit espera o payload original
        await this.postTechnicalVisit(item.draft);
        await this.removePendingDraft(item.id);
        console.log('[ReportService] Rascunho reenviado com sucesso:', item.id);
        success++;
      } catch (e) {
        console.warn('[ReportService] Falha ao reenviar rascunho:', item.id, e);
        failed++;
        // continuar para o próximo, não remover
        continue;
      }
    }
    
    return { success, failed };
  }

  
}
