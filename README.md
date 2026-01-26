# Gerenciados - Relatórios (Frontend)

Frontend da aplicação de Gerenciamento de Relatórios e Documentos, desenvolvido com Angular 20.

##  Descrição

Aplicação web moderna para gestão de:
- **Relatórios e Documentos**: Criação, upload, visualização e assinatura de documentos
- **Agendamentos**: Sistema de agenda com validação de disponibilidade
- **Checklists**: Gestão de checklists operacionais
- **Perfis de Usuário**: Administração de usuários com controle de acesso por perfil
- **Painéis de Controle**: Dashboards para visualização de dados operacionais
- **Calendário de Disponibilidade**: Gerenciamento de turnos e disponibilidade

##  Stack Tecnológico

- **Angular**: 20.3.0
- **TypeScript**: Linguagem principal
- **Angular Material**: Componentes UI
- **RxJS**: Gerenciamento reativo de estado
- **FullCalendar**: Componente de calendário avançado
- **Playwright**: Testes E2E

##  Início Rápido

### Pré-requisitos
- Node.js 20+
- npm ou yarn

### Instalação

```bash
npm install
```

### Servidor de Desenvolvimento

```bash
npm start
```

Acesse http://localhost:4200/ no navegador. A aplicação recarrega automaticamente ao detectar mudanças nos arquivos.

##  Comandos Disponíveis

| Comando | Descrição |
|---------|-----------|
| 
pm start | Inicia servidor de desenvolvimento |
| 
pm run build | Compila para produção |
| 
pm run watch | Build em modo watch (desenvolvimento) |
| 
pm test | Executa testes unitários |
| 
pm run test:e2e | Executa testes E2E com Playwright |
| 
pm run serve:ssr:frontend | Serve aplicação com SSR |

##  Estrutura do Projeto

```
src/
 app/
    components/        # Componentes Angular
       pages/        # Páginas da aplicação
          admin/
          agenda/
          checklist/
          dashboard/
          documents/
          login/
          profile/
          report/
       shared/       # Componentes reutilizáveis
           header/
           navbar/
           footer/
           modais/
    services/         # Serviços de API e lógica
    guards/           # Guards de rota
    interceptors/     # Interceptores HTTP
    pipes/            # Pipes customizados
    models/           # Interfaces e modelos
    utils/            # Funções utilitárias
 assets/               # Arquivos estáticos
 environments/         # Configurações de ambiente
```

##  Autenticação e Autorização

- **Auth Service**: Gerencia autenticação e tokens JWT
- **Guards**: Proteção de rotas baseada em perfil de usuário
  - AdminGuard: Acesso apenas para administradores
  - PasswordResetGuard: Validação de reset de senha

##  Testes

### Testes Unitários

```bash
npm test
```

Executa testes com Karma. Cobre serviços, pipes e componentes.

### Testes E2E

```bash
npm run test:e2e
```

Testes de integração com Playwright. Valida fluxos completos da aplicação.

##  Docker

Aplicação incluída em container Docker:

```bash
docker build -t relatorios-frontend .
docker run -p 80:80 relatorios-frontend
```

##  Licença

**Propriedade Intelectual Protegida**

Copyright (c) 2026 Brena Bispo Soares

Todos os direitos reservados. Este software é propriedade exclusiva e sua distribuição, modificação ou uso é estritamente proibido sem autorização prévia por escrito. A Go-Tree Consultoria possui licença de uso conforme acordado entre as partes.

Para informações detalhadas, consulte o arquivo [LICENSE](./LICENSE).

## 👤 Autoria

Desenvolvido por **Brena Bispo Soares**

Projeto desenvolvido e mantido como parte das soluções da Go-Tree Consultoria.
