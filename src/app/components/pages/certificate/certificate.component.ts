import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LegacyService } from '../../../services/legacy.service';

@Component({
  standalone: true,
  selector: 'app-certificate',
  imports: [CommonModule, FormsModule],
  templateUrl: './certificate.component.html',
  styleUrls: ['./certificate.component.css']
})
export class CertificateComponent {
  file: File | null = null;
  password = '';
  uploading = false;
  message: string | null = null;
  hasCertificate = false;
  certificateValidity: string | null = null;

  constructor(private legacy: LegacyService) {}

  async ngOnInit(): Promise<void> {
    await this.loadUserCertificate();
  }

  onFileChange(ev: Event) {
    const input = ev.target as HTMLInputElement;
    if (input.files && input.files.length) this.file = input.files[0];
    else this.file = null;
  }

  async submit() {
    this.message = null;
    if (!this.file) { this.message = 'Selecione um arquivo .pfx ou .p12'; return; }
    if (!this.password) { this.message = 'Informe a senha do certificado'; return; }

    this.uploading = true;
    try {
      const fd = new FormData();
      fd.append('file', this.file as Blob, this.file!.name);
      fd.append('password', this.password);

      const headers: any = {};
      const auth = this.legacy.authHeaders();
      if (auth && auth.Authorization) headers['Authorization'] = auth.Authorization;

      const resp = await fetch(`${this.legacy.getBase()}/users/me/certificate`, { method: 'POST', body: fd, headers });
      if (!resp.ok) {
        const err = await resp.json().catch(()=>({ error: 'Erro' }));
        this.message = err && err.error ? (err.error as string) : `Erro ao enviar: ${resp.status}`;
      } else {
        const data = await resp.json().catch(()=>null);
        this.message = 'Certificado enviado com sucesso.';
      }
    } catch (e:any) {
      this.message = 'Erro ao enviar certificado: ' + (e?.message || e);
    } finally {
      this.uploading = false;
      // reload certificate info after upload
      void this.loadUserCertificate();
    }
  }

  private async loadUserCertificate(): Promise<void> {
    try {
      const me = await this.legacy.fetchUserProfile(true);
      if (!me) { this.hasCertificate = false; this.certificateValidity = null; return; }

      // Use explicit fields added to UserResponseDTO
      this.hasCertificate = !!me.hasCertificate;
      this.certificateValidity = me.certificateValidity || null;
    } catch (e) {
      console.warn('[Certificate] loadUserCertificate error', e);
      this.hasCertificate = false;
      this.certificateValidity = null;
    }
  }

  async deleteCertificate(): Promise<void> {
    const ok = window.confirm('Deseja remover o certificado digital enviado? Esta ação não pode ser desfeita.');
    if (!ok) return;
    try {
      const resp = await fetch(`${this.legacy.getBase()}/users/me/certificate`, { method: 'DELETE', headers: this.legacy.authHeaders() });
      if (!resp.ok) {
        const err = await resp.json().catch(()=>({ error: 'Erro' }));
        this.message = err.error || 'Erro ao remover certificado';
        return;
      }
      this.message = 'Certificado removido com sucesso.';
      this.hasCertificate = false;
      this.certificateValidity = null;
      // refresh cached profile
      await this.legacy.fetchUserProfile(true);
    } catch (e:any) {
      console.error('[Certificate] delete error', e);
      this.message = 'Erro ao remover certificado: ' + (e?.message || e);
    }
  }
}
