import { Routes } from '@angular/router';
import { LoginComponent } from './components/pages/login/login.component';
import { DashboardComponent } from './components/pages/dashboard/dashboard.component';
// Checklist components removed from project
import { ReportComponent } from './components/pages/report/report.component';
import { AdminComponent } from './components/pages/admin/admin.component';
import { CadastrosComponent } from './components/pages/cadastros/cadastros.component';
import { UserGuard } from './guards/user.guard';
import { AepComponent } from './components/pages/aep/aep.component';
import { AgendaComponent } from './components/pages/agenda/agenda.component';
import { GroupComponent } from './components/pages/group/group.component';
import { ChecklistComponent } from './components/pages/checklist/checklist.component';
import { DocumentsComponent } from './components/pages/documents/documents.component';
import { ProfileComponent } from './components/pages/profile/profile.component';
import { CertificateComponent } from './components/pages/certificate/certificate.component';
import { ChangePasswordComponent } from './components/pages/change-password/change-password.component';
import { AdminGuard } from './guards/admin.guard';
import { ResetSenhaObrigatóriaComponent } from './components/pages/reset-senha-obrigatoria/reset-senha-obrigatoria.component';
import { requirePasswordResetGuard, blockUntilPasswordResetGuard } from './guards/password-reset.guard';
// Forms and ChangePassword pages are not yet migrated; remove their imports for now


export const routes: Routes = [
    { path: '', redirectTo: 'login', pathMatch: 'full' },
    { path: 'login', component: LoginComponent },
    { path: 'reset-senha-obrigatoria', component: ResetSenhaObrigatóriaComponent, canActivate: [requirePasswordResetGuard] },
	{ path: 'dashboard', component: DashboardComponent, canActivate: [blockUntilPasswordResetGuard] },
	{ path: 'group', component: GroupComponent, canActivate: [blockUntilPasswordResetGuard] },
	{ path: 'report', component: ReportComponent, canActivate: [blockUntilPasswordResetGuard] },
	{ path: 'agenda', component: AgendaComponent, canActivate: [blockUntilPasswordResetGuard] },
	{ path: 'documents', component: DocumentsComponent, canActivate: [blockUntilPasswordResetGuard] },
	{ path: 'profile', component: ProfileComponent, canActivate: [blockUntilPasswordResetGuard] },
	{ path: 'certificado-digital', component: CertificateComponent, canActivate: [blockUntilPasswordResetGuard] },
	// rotas forms/change-password removidas temporariamente até migração completa
	{ path: 'admin', component: AdminComponent, canActivate: [blockUntilPasswordResetGuard, AdminGuard] },
	{ path: 'cadastros', component: CadastrosComponent, canActivate: [UserGuard, blockUntilPasswordResetGuard] },
	{ path: 'aep', component: AepComponent, canActivate: [blockUntilPasswordResetGuard] },
	{ path: 'checklist', component: ChecklistComponent, canActivate: [blockUntilPasswordResetGuard] },
	{ path: 'checklist/edit/:id', component: ChecklistComponent, canActivate: [blockUntilPasswordResetGuard] },
	{ path: 'change-password', component: ChangePasswordComponent, canActivate: [blockUntilPasswordResetGuard] },
	{ path: '**', redirectTo: '' }
];
