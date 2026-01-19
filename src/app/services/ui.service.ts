import { Injectable, OnDestroy } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UiService implements OnDestroy {
  private pendingToasts: Array<{ element: HTMLElement; timeoutId: number }> = [];

  // Compat: aceita tanto (message, duration:number) quanto (message, type:string)
  showToast(message: string, typeOrDuration: string | number = 'info', duration = 3000) {
    // Se o segundo arguemento for número, é o duration
    if (typeof typeOrDuration === 'number') {
      duration = typeOrDuration;
    }
    // Caso seja string (tipo), podemos usar para styling no futuro — por enquanto ignoramos
    // Simple toast fallback — replace with a global component later
    const div = document.createElement('div');
    div.textContent = message;
    // place toast centered at top, below navbar area
    div.style.position = 'fixed';
    div.style.left = '50%';
    div.style.top = '72px';
    div.style.transform = 'translateX(-50%)';
    // let the background size to fit the text while capping maximum width
    div.style.display = 'inline-block';
    div.style.maxWidth = '92%';
    div.style.minWidth = '120px';
    div.style.boxSizing = 'border-box';
    // smaller, less intrusive visual
    div.style.background = 'rgba(0,0,0,0.75)';
    div.style.color = 'white';
    div.style.padding = '6px 10px';
    div.style.borderRadius = '6px';
    div.style.fontSize = '0.92rem';
    div.style.lineHeight = '1.2';
    div.style.textAlign = 'center';
    div.style.zIndex = '120000';
    div.setAttribute('role', 'status');
    div.setAttribute('aria-live', 'polite');
    document.body.appendChild(div);
    
    const timeoutId = window.setTimeout(() => {
      div.remove();
      // Remover do array de toasts pendentes
      this.pendingToasts = this.pendingToasts.filter(t => t.element !== div);
    }, duration);
    
    // Rastrear o toast pendente
    this.pendingToasts.push({ element: div, timeoutId });
  }

  async confirm(message: string) {
    return confirm(message);
  }

  ngOnDestroy(): void {
    // Limpar todos os toasts pendentes
    this.pendingToasts.forEach(({ element, timeoutId }) => {
      clearTimeout(timeoutId);
      if (element.parentNode) {
        element.remove();
      }
    });
    this.pendingToasts = [];
  }
}
