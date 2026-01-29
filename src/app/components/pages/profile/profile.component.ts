import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LegacyService } from '../../../services/legacy.service';

@Component({
  standalone: true,
  selector: 'app-profile',
  imports: [CommonModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
  private legacy = inject(LegacyService);

  // dados do perfil
  profile: any = null;
  hasCertificate = false;
  certificateValidity: string | null = null;

  async ngOnInit(): Promise<void> {
    this.profile = await this.legacy.fetchUserProfile().catch(()=>null) || {};
    // Load certificate info
    this.hasCertificate = !!this.profile?.hasCertificate;
    this.certificateValidity = this.profile?.certificateValidity || null;
  }

  initials(): string {
    if (!this.profile) return '';
    if (this.profile.initials) return this.profile.initials;
    const name = this.profile.name || '';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].slice(0,2).toUpperCase();
    return (parts[0][0] + (parts[1][0] || '')).toUpperCase();
  }

  formatDate(d: string|undefined|null): string {
    if (!d) return '-';
    try {
      // Tenta converter diferentes formatos: YYYY-MM-DD, DD/MM/YYYY, etc
      let dateStr = d.trim();
      
      // Se contém apenas números e caracteres de separação
      if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        // Formato ISO: YYYY-MM-DD
        const [year, month, day] = dateStr.split('-');
        return `${day}/${month}/${year}`;
      } else if (/^\d{2}\/\d{2}\/\d{4}/.test(dateStr)) {
        // Já está em DD/MM/YYYY
        return dateStr;
      } else {
        // Tenta como Date object
        const dt = new Date(dateStr);
        if (isNaN(dt.getTime())) {
          return dateStr;
        }
        // Formata como DD/MM/YYYY
        const day = String(dt.getDate()).padStart(2, '0');
        const month = String(dt.getMonth() + 1).padStart(2, '0');
        const year = dt.getFullYear();
        return `${day}/${month}/${year}`;
      }
    } catch {
      return d as string;
    }
  }
}
