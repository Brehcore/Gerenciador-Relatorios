import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { LegacyService } from '../../../services/legacy.service';

@Component({
  standalone: true,
  selector: 'app-navbar',
  imports: [CommonModule],
  template: `
  <nav class="top-nav" [class.open]="navOpen">
    <div class="nav-left">
  <div class="brand" aria-label="Aplicação"></div>

      <!-- menu sempre horizontal; hamburger removido -->

      <ul class="nav-links">
        <li>
          <a href="#" (click)="navigate('group', $event)" data-nav="group" aria-label="Início">
            <!-- home icon (roof + square) -->
            <svg class="nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M3 11.5L12 4l9 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <rect x="6" y="11.5" width="12" height="8" rx="1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span class="nav-text">Início</span>
          </a>
        </li>
        <li>
          <a href="#" (click)="navigate('dashboard', $event)" data-nav="dashboard" aria-label="Dashboard">
            <!-- bars chart -->
            <svg class="nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect x="3" y="10" width="3" height="9" rx="0.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <rect x="9" y="6" width="3" height="13" rx="0.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <rect x="15" y="3" width="3" height="16" rx="0.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span class="nav-text">Dashboard</span>
          </a>
        </li>
        <li>
          <a href="#" (click)="navigate('agenda', $event)" data-nav="agenda" aria-label="Agenda">
            <!-- calendar with rounded corners and two dots -->
            <svg class="nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M16 2v4M8 2v4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <circle cx="8.5" cy="12.5" r="0.8" fill="currentColor" />
              <circle cx="15.5" cy="12.5" r="0.8" fill="currentColor" />
            </svg>
            <span class="nav-text">Agenda</span>
          </a>
        </li>
        <li>
          <a href="#" (click)="navigate('documents', $event)" data-nav="documents" aria-label="Documentos">
            <!-- sheet with folded corner -->
            <svg class="nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M14 3v6h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span class="nav-text">Documentos</span>
          </a>
        </li>
        <li *ngIf="isUser">
          <a href="#" (click)="navigate('cadastros', $event)" data-nav="cadastros" aria-label="Cadastros">
            <!-- user add / register icon -->
            <svg class="nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M6 20c0-3 4-5 6-5s6 2 6 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M19 8v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M22 11h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span class="nav-text">Cadastros</span>
          </a>
        </li>
        <li class="admin-only" *ngIf="isAdmin">
          <a href="#" (click)="navigate('admin', $event)" data-nav="admin" aria-label="Administrador">
            <!-- gear with 6 teeth (simplified) -->
            <svg class="nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06A2 2 0 0 1 2.28 16.9l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09c.66 0 1.22-.4 1.51-1a1.65 1.65 0 0 0-.33-1.82L4.3 4.28A2 2 0 0 1 7.13 1.45l.06.06c.59.59 1.53.59 2.12 0 .59-.59.59-1.53 0-2.12L9.88.39A2 2 0 0 1 12 3.21l.06-.06c.59-.59 1.53-.59 2.12 0 .59.59.59 1.53 0 2.12l.06.06a2 2 0 0 1 2.83 2.83l-.06.06c-.59.59-.59 1.53 0 2.12.59.59 1.53.59 2.12 0l.06-.06A2 2 0 0 1 22 8.87l-.06.06c-.59.59-.59 1.53 0 2.12.59.59 1.53.59 2.12 0l.06-.06A2 2 0 0 1 19.4 15z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span class="nav-text">Administrador</span>
          </a>
        </li>
      </ul>
    </div>
    <div class="nav-right">
      <div class="user-dropdown" id="userDropdown">
        <button class="user-trigger" id="userTrigger" aria-haspopup="true" [attr.aria-expanded]="userMenuOpen" (click)="toggleUserMenu($event)">
          <span class="mini-initials">{{ initials }}</span>
          <div class="mini-info">
            <span class="mini-name">{{ name }}</span>
            <span class="mini-role">{{ role }}</span>
          </div>
          <span class="chevron">▾</span>
        </button>
        <div class="user-menu" role="menu" [attr.aria-hidden]="!userMenuOpen">
          <button class="user-menu-item" (click)="goto('profile')">Meu Perfil</button>
          <button class="user-menu-item" (click)="goto('certificado-digital')">Certificado Digital</button>
                    <button class="user-menu-item" (click)="logout()">Sair</button>
        </div>
      </div>
    </div>
  </nav>
  <div class="nav-backdrop" [class.show]="navOpen" (click)="toggleNav($event)" *ngIf="false"></div>
  `,
  styleUrls: ['./navbar.component.css']
})
export class NavbarComponent implements OnInit, OnDestroy {
  name = '--';
  role = '--';
  initials = '--';
  isAdmin = false;
  isUser = false;
  userMenuOpen = false;
  navOpen = false;
  
  private closeHandlerUserMenu: (() => void) | null = null;
  private closeHandlerNav: (() => void) | null = null;
  private pendingTimeouts: number[] = [];

  constructor(private legacy: LegacyService, private router: Router) {}

  async ngOnInit() {
    const me = await this.legacy.fetchUserProfile().catch(()=>null);
    if (me) {
      this.name = me.name || '';
      this.role = me.especialidade || me.role || '';
      this.initials = (me.name || '?').split(/\s+/).slice(0,2).map((p:any)=>p[0]?.toUpperCase()||'').join('');
      const upperRole = String(me.role || '').toUpperCase();
      // Aceitar AMBOS os formatos
      this.isAdmin = upperRole === 'ADMIN' || upperRole === 'ROLE_ADMIN';
      this.isUser = upperRole === 'USER' || upperRole === 'ROLE_USER';
    } else {
      const r = this.legacy.getUserRole() || localStorage.getItem('userRole') || '';
      this.role = r || '';
      const candidate = localStorage.getItem('loggedInUserEmail') || '';
      this.name = candidate || '--';
      this.initials = (this.name || '?').split(/\s+/).slice(0,2).map((p:any)=>p[0]?.toUpperCase()||'').join('');
      const upperR = String(r).toUpperCase();
      // Aceitar AMBOS os formatos
      this.isAdmin = upperR === 'ADMIN' || upperR === 'ROLE_ADMIN';
      this.isUser = upperR === 'USER' || upperR === 'ROLE_USER';
    }
  }

  ngOnDestroy(): void {
    // Limpar todos os timeouts pendentes
    this.pendingTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    this.pendingTimeouts = [];
    
    // Remover listeners de evento
    if (this.closeHandlerUserMenu) {
      document.removeEventListener('click', this.closeHandlerUserMenu);
      this.closeHandlerUserMenu = null;
    }
    if (this.closeHandlerNav) {
      document.removeEventListener('click', this.closeHandlerNav);
      this.closeHandlerNav = null;
    }
    
    // Resetar menus
    this.userMenuOpen = false;
    this.navOpen = false;
  }

  async navigate(key: string, ev?: Event) {
    try { if (ev && typeof ev.preventDefault === 'function') ev.preventDefault(); } catch(_) {}

    const map: any = {
      group: ['/group'],
      dashboard: ['/dashboard'],
      documents: ['/documents'],
      admin: ['/admin'],
      profile: ['/profile'],
      login: ['/login']
    };
    const route = map[key] || ['/' + key];
    let navigated = false;
    try {
      // tenta navegar via Router padrão do Angular
      navigated = await this.router.navigate(route);
    } catch (e) {
      navigated = false;
    }

    // Se a navegação via Router não ocorreu, tentar fallback: se houver loadComponent (legacy), usá-lo,
    // caso contrário usar window.location
    if (!navigated) {
      try {
        if (typeof (window as any).loadComponent === 'function') {
          try { (window as any).loadComponent('mainContent', key + 'Page'); } catch(_) {}
        } else {
          try { window.location.href = (route && route.length) ? route[0] : ('/' + key); } catch(_) {}
        }
      } catch (_) {}
    }
    // fechar menu mobile se aberto
    if (this.navOpen) this.navOpen = false;
  }

  toggleUserMenu(ev?: Event) {
    ev && ev.stopPropagation();
    
    // Remover listener anterior se existir
    if (this.closeHandlerUserMenu) {
      document.removeEventListener('click', this.closeHandlerUserMenu);
      this.closeHandlerUserMenu = null;
    }
    
    this.userMenuOpen = !this.userMenuOpen;
    if (this.userMenuOpen) {
      this.closeHandlerUserMenu = () => { 
        this.userMenuOpen = false;
        if (this.closeHandlerUserMenu) {
          document.removeEventListener('click', this.closeHandlerUserMenu);
          this.closeHandlerUserMenu = null;
        }
      };
      // fecha ao clicar fora
      const timeoutId = window.setTimeout(() => {
        document.addEventListener('click', this.closeHandlerUserMenu!);
        this.pendingTimeouts = this.pendingTimeouts.filter(t => t !== timeoutId);
      }, 0);
      this.pendingTimeouts.push(timeoutId);
    }
  }

  toggleNav(ev?: Event) {
    ev && ev.stopPropagation();
    
    // Remover listener anterior se existir
    if (this.closeHandlerNav) {
      document.removeEventListener('click', this.closeHandlerNav);
      this.closeHandlerNav = null;
    }
    
    this.navOpen = !this.navOpen;
    if (this.navOpen) {
      // fecha menu ao clicar fora (apenas em mobile)
      this.closeHandlerNav = (ev?: Event) => { 
        this.navOpen = false;
        if (this.closeHandlerNav) {
          document.removeEventListener('click', this.closeHandlerNav);
          this.closeHandlerNav = null;
        }
      };
      const timeoutId = window.setTimeout(() => {
        document.addEventListener('click', this.closeHandlerNav!);
        this.pendingTimeouts = this.pendingTimeouts.filter(t => t !== timeoutId);
      }, 0);
      this.pendingTimeouts.push(timeoutId);
    }
  }

  goto(page: string) { this.navigate(page); }

  logout() {
    this.legacy.performLogout && (this.legacy.performLogout as any)();
    this.navigate('login');
  }
}
