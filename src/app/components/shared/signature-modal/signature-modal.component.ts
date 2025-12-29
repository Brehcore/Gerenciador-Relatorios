import { Component, OnInit, ElementRef, ViewChild, inject, Output, EventEmitter, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SignatureService } from '../../../services/signature.service';
import { UiService } from '../../../services/ui.service';
import { LegacyService } from '../../../services/legacy.service';

@Component({
  selector: 'app-signature-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-overlay" [class.hidden-modal]="!isOpen">
      <div class="modal" role="dialog" aria-label="Modal de Assinaturas">
        <div class="modal-header">
          <div class="header-content">
            <h2 class="modal-title">{{ techOnly ? '✍️ Assinatura do Técnico' : '✍️ Assinaturas' }}</h2>
            <p class="modal-subtitle">{{ techOnly ? 'Colete sua assinatura' : 'Colete as assinaturas do Técnico e Cliente' }}</p>
            <div class="modal-warning">
              <p>⚠️ <strong>Importante:</strong> Para retornar ao relatório sem perder os dados preenchidos, use o botão <strong>&times;</strong> ou o botão <strong>Cancelar</strong>. Não use o botão voltar do navegador.</p>
            </div>
          </div>
          <button type="button" class="close-btn" (click)="cancel()" aria-label="Fechar">&times;</button>
        </div>

        <div class="modal-body">
          <!-- TÉCNICO -->
          <div class="sign-section">
            <div class="section-header">
              <h3>👨‍💼 Técnico</h3>
            </div>
            <div class="form-group">
              <label for="techName">Nome do Técnico *</label>
              <input type="text" id="techName" class="form-control" [(ngModel)]="techName" readonly />
            </div>
            <div class="form-group">
              <label class="canvas-label">Assinatura do Técnico *</label>
              <div class="canvas-container">
                <canvas
                  #techSignatureCanvas
                  id="techSignatureCanvas"
                  width="600"
                  height="150"
                  class="signature-canvas"
                ></canvas>
                <div class="canvas-hint">Assine aqui</div>
              </div>
              <button type="button" (click)="clearTechSignature()" class="btn-clear-sig">
                🗑️ Limpar
              </button>
            </div>
          </div>

          <!-- CLIENTE -->
          <div class="sign-section" *ngIf="!techOnly">
            <div class="divider"></div>
            <div class="section-header">
              <h3>👤 Responsável pela Empresa</h3>
            </div>
            <div class="form-group">
              <label for="clientName">Nome do Responsável *</label>
              <input type="text" id="clientName" class="form-control" [(ngModel)]="clientName" placeholder="Digite o nome..." />
            </div>
            <div class="form-group">
              <label class="canvas-label">Assinatura do Cliente *</label>
              <div class="canvas-container">
                <canvas
                  #clientSignatureCanvas
                  id="clientSignatureCanvas"
                  width="600"
                  height="150"
                  class="signature-canvas"
                ></canvas>
                <div class="canvas-hint">Assine aqui</div>
              </div>
              <button type="button" (click)="clearClientSignature()" class="btn-clear-sig">
                🗑️ Limpar
              </button>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" (click)="clearAll()" class="btn btn-secondary">
            🔄 Limpar Tudo
          </button>
          <button type="button" (click)="confirm()" class="btn btn-primary">
            ✓ Confirmar e Salvar
          </button>
          <button type="button" (click)="cancel()" class="btn btn-secondary">
            ✕ Cancelar
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        --primary-color: #4CAF50;
        --danger-color: #f44336;
        --warning-color: #ff9800;
        --secondary-color: #2196F3;
        --border-radius: 12px;
        --shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      }

      .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.6) 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 12px;
        opacity: 1;
        visibility: visible;
        transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .modal-overlay.hidden-modal {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
      }

      .modal {
        background: white;
        border-radius: var(--border-radius);
        width: 100%;
        max-width: 850px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: var(--shadow);
        animation: slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      }

      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(30px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .modal-header {
        padding: 24px;
        border-bottom: 1px solid #f0f0f0;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
      }

      .header-content {
        flex: 1;
      }

      .modal-title {
        margin: 0 0 6px 0;
        font-size: 1.75rem;
        font-weight: 700;
        color: #1a1a1a;
        letter-spacing: -0.5px;
      }

      .modal-subtitle {
        margin: 0;
        font-size: 0.95rem;
        color: #666;
        font-weight: 400;
      }

      .modal-warning {
        margin-top: 12px;
        padding: 12px 14px;
        background-color: #fff3cd;
        border-left: 4px solid #ffc107;
        border-radius: 4px;
        font-size: 0.9rem;
        color: #856404;
      }

      .modal-warning p {
        margin: 0;
        line-height: 1.5;
      }

      .modal-warning strong {
        color: #ff6b35;
        font-weight: 600;
      }

      .close-btn {
        background: rgba(255, 255, 255, 0.8);
        border: 2px solid #ddd;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        font-size: 24px;
        cursor: pointer;
        color: #666;
        transition: all 0.25s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin-left: 16px;
        flex-shrink: 0;
      }

      .close-btn:hover {
        background: white;
        border-color: #999;
        color: #333;
        transform: rotate(90deg);
      }

      .modal-body {
        padding: 28px 24px;
        overflow-y: auto;
        max-height: calc(90vh - 180px);
      }

      .sign-section {
        margin-bottom: 24px;
      }

      .section-header {
        margin-bottom: 18px;
      }

      .section-header h3 {
        margin: 0;
        font-size: 1.3rem;
        color: #1a1a1a;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .divider {
        height: 2px;
        background: linear-gradient(to right, transparent, #ddd, transparent);
        margin: 28px 0;
      }

      .form-group {
        margin-bottom: 20px;
      }

      label {
        display: block;
        font-weight: 600;
        margin-bottom: 8px;
        color: #333;
        font-size: 0.95rem;
      }

      .canvas-label {
        color: #2c3e50;
      }

      .form-control {
        width: 100%;
        padding: 12px 14px;
        border: 2px solid #e0e0e0;
        border-radius: 8px;
        font-size: 0.95rem;
        transition: all 0.25s ease;
        background: white;
        box-sizing: border-box;
      }

      .form-control:focus {
        outline: none;
        border-color: var(--secondary-color);
        box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
        background: #f8fbff;
      }

      .form-control:disabled {
        background-color: #f5f5f5;
        color: #999;
      }

      .canvas-container {
        position: relative;
        background: white;
        border: 3px dashed #ddd;
        border-radius: 10px;
        padding: 8px;
        overflow: hidden;
        transition: all 0.25s ease;
      }

      .canvas-container:hover {
        border-color: var(--secondary-color);
        box-shadow: 0 4px 12px rgba(33, 150, 243, 0.1);
      }

      .signature-canvas {
        display: block;
        background-color: white;
        cursor: crosshair;
        border-radius: 6px;
        touch-action: none;
      }

      .canvas-hint {
        position: absolute;
        top: 12px;
        left: 12px;
        font-size: 0.8rem;
        color: #ccc;
        font-weight: 500;
        pointer-events: none;
        text-transform: uppercase;
        letter-spacing: 1px;
      }

      .btn-clear-sig {
        margin-top: 10px;
        padding: 8px 16px;
        background-color: #f5f5f5;
        border: 1px solid #ddd;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.85rem;
        font-weight: 500;
        color: #666;
        transition: all 0.25s ease;
        display: inline-block;
      }

      .btn-clear-sig:hover {
        background-color: #ffe6e6;
        border-color: var(--danger-color);
        color: var(--danger-color);
      }

      .modal-footer {
        padding: 16px 24px;
        border-top: 1px solid #f0f0f0;
        display: flex;
        justify-content: center;
        gap: 12px;
        background-color: #fafafa;
        flex-wrap: wrap;
      }

      .btn {
        padding: 11px 24px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 0.95rem;
        font-weight: 600;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        display: inline-flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
      }

      .btn-primary {
        background: linear-gradient(135deg, var(--primary-color) 0%, #45a049 100%);
        color: white;
        box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
      }

      .btn-primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(76, 175, 80, 0.4);
      }

      .btn-primary:active {
        transform: translateY(0);
      }

      .btn-secondary {
        background-color: #e65f3c;
        color: white;
        box-shadow: 0 4px 12px rgba(230, 95, 60, 0.2);
      }

      .btn-secondary:hover {
        background-color: #d94d2e;
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(230, 95, 60, 0.3);
      }

      .btn-secondary:active {
        transform: translateY(0);
      }

      /* RESPONSIVO - TABLET */
      @media (max-width: 768px) {
        .modal {
          width: calc(100% - 24px);
        }

        .modal-header {
          padding: 18px;
          flex-direction: column;
          gap: 12px;
        }

        .header-content {
          width: 100%;
        }

        .modal-title {
          font-size: 1.4rem;
        }

        .modal-subtitle {
          font-size: 0.85rem;
        }

        .close-btn {
          margin-left: 0;
          align-self: flex-end;
        }

        .modal-body {
          padding: 20px 16px;
          max-height: calc(90vh - 150px);
        }

        .signature-canvas {
          height: 160px;
        }

        .modal-footer {
          flex-direction: column;
          gap: 10px;
        }

        .btn {
          width: 100%;
          justify-content: center;
        }
      }

      /* RESPONSIVO - MOBILE */
      @media (max-width: 480px) {
        .modal-overlay {
          padding: 8px;
        }

        .modal {
          max-height: 95vh;
        }

        .modal-header {
          padding: 14px;
        }

        .modal-title {
          font-size: 1.2rem;
        }

        .modal-subtitle {
          font-size: 0.8rem;
        }

        .close-btn {
          width: 36px;
          height: 36px;
          font-size: 20px;
        }

        .modal-body {
          padding: 16px 12px;
          max-height: calc(95vh - 120px);
        }

        .section-header h3 {
          font-size: 1.1rem;
        }

        label {
          font-size: 0.9rem;
        }

        .form-control {
          padding: 10px 12px;
          font-size: 0.9rem;
        }

        .canvas-container {
          padding: 6px;
        }

        .signature-canvas {
          height: 120px;
        }

        .btn {
          padding: 10px 16px;
          font-size: 0.85rem;
        }

        .modal-footer {
          padding: 12px;
        }
      }

      /* Scrollbar styling */
      .modal-body::-webkit-scrollbar {
        width: 8px;
      }

      .modal-body::-webkit-scrollbar-track {
        background: #f1f1f1;
        border-radius: 10px;
      }

      .modal-body::-webkit-scrollbar-thumb {
        background: #ccc;
        border-radius: 10px;
      }

      .modal-body::-webkit-scrollbar-thumb:hover {
        background: #999;
      }
    `,
  ],
})
export class SignatureModalComponent implements OnInit {
  @ViewChild('techSignatureCanvas', { static: false }) techCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('clientSignatureCanvas', { static: false }) clientCanvas!: ElementRef<HTMLCanvasElement>;

  @Output() confirmSignatures = new EventEmitter<{
    techName: string;
    techSignature: string;
    clientName: string;
    clientSignature: string;
    geolocation?: { latitude: number | null; longitude: number | null } | null;
  }>();

  isOpen = false;
  techName = '';
  clientName = '';
  geolocation: { latitude: number | null; longitude: number | null } | null = null;
  @Input() techOnly: boolean = false;

  private signatureService = inject(SignatureService);
  private ui = inject(UiService);
  private legacy = inject(LegacyService);

  private techPad: any;
  private clientPad: any;

  // Recorta o canvas removendo margens transparentes
  private cropCanvas(sourceCanvas: HTMLCanvasElement, alphaThreshold: number = 10): HTMLCanvasElement {
    try {
      const w = sourceCanvas.width;
      const h = sourceCanvas.height;
      const ctx = sourceCanvas.getContext('2d');
      if (!ctx) return sourceCanvas;

      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      let minX = w, minY = h, maxX = 0, maxY = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const alpha = data[idx + 3];
          if (alpha > alphaThreshold) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }

      // se não encontrou pixels opacos, retorna o original
      if (maxX < minX || maxY < minY) return sourceCanvas;

      const cropW = maxX - minX + 1;
      const cropH = maxY - minY + 1;
      const out = document.createElement('canvas');
      out.width = cropW;
      out.height = cropH;
      const outCtx = out.getContext('2d');
      if (!outCtx) return sourceCanvas;
      outCtx.drawImage(sourceCanvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
      return out;
    } catch (e) {
      return sourceCanvas;
    }
  }

  // Exporta base64 a partir do canvas, aplicando crop e redimensionamento opcional
  private exportCroppedDataUrl(sourceCanvas: HTMLCanvasElement, type: string = 'image/png', maxWidth: number | null = 1200): string {
    try {
      const cropped = this.cropCanvas(sourceCanvas);
      if (maxWidth && cropped.width > maxWidth) {
        const scale = maxWidth / cropped.width;
        const resized = document.createElement('canvas');
        resized.width = Math.round(cropped.width * scale);
        resized.height = Math.round(cropped.height * scale);
        const rctx = resized.getContext('2d');
        if (rctx) rctx.drawImage(cropped, 0, 0, resized.width, resized.height);
        return resized.toDataURL(type);
      }
      return cropped.toDataURL(type);
    } catch (e) {
      try { return sourceCanvas.toDataURL(type); } catch (_) { return '';}
    }
  }

  async ngOnInit() {
    // Inicializar signature pads após a view estar pronta
  }

  async open() {
    // Carregar o nome do técnico primeiro, antes de abrir o modal
    try {
      await this.loadTechnicianName();
    } catch (_) {}
    
    this.isOpen = true;
    
    // Aguardar que a view seja renderizada e inicializar os pads
    setTimeout(async () => {
      try {
        this.initSignaturePads();
      } catch (_) {}
      // tentar obter geolocalização do dispositivo (se permitido pelo usuário)
      try {
        if (navigator && typeof navigator.geolocation !== 'undefined' && navigator.geolocation.getCurrentPosition) {
          navigator.geolocation.getCurrentPosition(
            pos => {
              try {
                this.geolocation = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
              } catch (_) { this.geolocation = { latitude: null, longitude: null }; }
            },
            err => {
              // se o usuário negar ou houver erro, armazenar nulls
              this.geolocation = { latitude: null, longitude: null };
            },
            { enableHighAccuracy: false, timeout: 5000 }
          );
        } else {
          this.geolocation = { latitude: null, longitude: null };
        }
      } catch (e) {
        this.geolocation = { latitude: null, longitude: null };
      }
    }, 0);
  }

  private async loadTechnicianName(): Promise<void> {
    try {
      const me = await this.legacy.fetchUserProfile();
      console.log('[SignatureModal] Perfil do usuário carregado:', me);
      
      if (!me) {
        console.warn('[SignatureModal] Perfil do usuário é vazio');
        return;
      }
      
      const name = me.name || me.fullName || me.nome || me.usuario || '';
      if (name) {
        this.techName = String(name).trim();
        console.log('[SignatureModal] Nome do técnico carregado:', this.techName);
      } else {
        console.warn('[SignatureModal] Nenhum nome encontrado no perfil');
      }
    } catch (e) {
      console.error('[SignatureModal] Erro ao carregar nome do técnico:', e);
      // ignore failures to avoid blocking modal
    }
  }

  private async initSignaturePads() {
    try {
      const techEl = this.techCanvas && this.techCanvas.nativeElement ? this.techCanvas.nativeElement : document.createElement('canvas');
      const clientEl = (this.clientCanvas && this.clientCanvas.nativeElement) ? this.clientCanvas.nativeElement : document.createElement('canvas');
      // garantir dimensões mínimas para o canvas de fallback
      if (!clientEl.width) { clientEl.width = 600; clientEl.height = 150; }
      const pads = await this.signatureService.initSignaturePads(
        techEl,
        clientEl,
        this.signatureService.getDefaultPadOptions()
      );
      this.techPad = pads.tech;
      // se modo somente técnico, manter clientPad como null para evitar validações e uso
      this.clientPad = this.techOnly ? null : pads.client;
    } catch (err) {
      console.error('Erro ao inicializar signature pads:', err);
      this.ui.showToast('Erro ao carregar canvas de assinatura', 'error', 5000);
    }
  }

  clearTechSignature() {
    if (this.techPad) this.techPad.clear();
  }

  clearClientSignature() {
    if (this.clientPad) this.clientPad.clear();
  }

  clearAll() {
    this.clearTechSignature();
    this.clearClientSignature();
    this.techName = '';
    this.clientName = '';
  }

  confirm() {
    // Validar preenchimento
    if (!this.techName.trim()) {
      this.ui.showToast('Por favor, preencha o nome do Técnico', 'warning', 3000);
      return;
    }
    if (!this.techPad || this.techPad.isEmpty()) {
      this.ui.showToast('Por favor, colete a assinatura do Técnico', 'warning', 3000);
      return;
    }
    if (!this.techOnly) {
      if (!this.clientName.trim()) {
        this.ui.showToast('Por favor, preencha o nome do Cliente', 'warning', 3000);
        return;
      }
      if (!this.clientPad || this.clientPad.isEmpty()) {
        this.ui.showToast('Por favor, colete a assinatura do Cliente', 'warning', 3000);
        return;
      }
    }

    // Emitir evento com as assinaturas - PRIORIDADE AO SIGNATURE PAD
    const techDataUrl = (this.techPad && typeof this.techPad.toDataURL === 'function') ? this.techPad.toDataURL() : '';
    const clientDataUrl = (!this.techOnly && this.clientPad && typeof this.clientPad.toDataURL === 'function') ? this.clientPad.toDataURL() : '';

    this.confirmSignatures.emit({
      techName: this.techName.trim(),
      techSignature: techDataUrl,
      clientName: this.techOnly ? '' : this.clientName.trim(),
      clientSignature: this.techOnly ? '' : clientDataUrl,
      geolocation: this.geolocation || null
    });

    this.close();
  }

  cancel() {
    this.close();
  }

  private close() {
    this.isOpen = false;
    this.clearAll();
  }
}
