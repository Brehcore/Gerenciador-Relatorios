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
// Forms and ChangePassword pages are not yet migrated; remove their imports for now


export const routes: Routes = [
    { path: '', redirectTo: 'login', pathMatch: 'full' },
    { path: 'login', component: LoginComponent },
    { path: 'reset-senha-obrigatoria', component: ResetSenhaObrigatóriaComponent },
	{ path: 'dashboard', component: DashboardComponent },
	{ path: 'group', component: GroupComponent },
	{ path: 'report', component: ReportComponent },
	{ path: 'agenda', component: AgendaComponent },
	{ path: 'documents', component: DocumentsComponent },
	{ path: 'profile', component: ProfileComponent },
	{ path: 'certificado-digital', component: CertificateComponent },
	// rotas forms/change-password removidas temporariamente até migração completa
	{ path: 'admin', component: AdminComponent, canActivate: [AdminGuard] },
	{ path: 'cadastros', component: CadastrosComponent, canActivate: [UserGuard] },
	{ path: 'aep', component: AepComponent },
	{ path: 'checklist', component: ChecklistComponent },
	{ path: 'checklist/edit/:id', component: ChecklistComponent },
	{ path: 'change-password', component: ChangePasswordComponent },
	{ path: '**', redirectTo: '' }
];
