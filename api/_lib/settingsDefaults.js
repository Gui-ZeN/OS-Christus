export const DEFAULT_SETTINGS = {
  emailTemplates: {
    items: {
      'EMAIL-NOVA-OS': {
        trigger: 'EMAIL-NOVA-OS',
        subject: '[Nova OS] {{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

Sua Ordem de Serviço foi registrada com sucesso.

Número: {{ticket.id}}
Assunto: {{ticket.subject}}
Status atual: {{ticket.status}}

Acompanhe pelo link: {{tracking.url}}

Atenciosamente,
Gestão de Manutenção`,
      },
      'EMAIL-TRIAGEM-EM-ANDAMENTO': {
        trigger: 'EMAIL-TRIAGEM-EM-ANDAMENTO',
        subject: '[Triagem] {{ticket.id}} em análise',
        body: `Olá {{requester.name}},

Sua OS {{ticket.id}} entrou em triagem com a equipe de manutenção.

Assunto: {{ticket.subject}}
Status atual: {{ticket.status}}

Assim que houver avanço de parecer técnico, você receberá nova atualização.

Acompanhe: {{tracking.url}}`,
      },
      'EMAIL-PARECER-TECNICO': {
        trigger: 'EMAIL-PARECER-TECNICO',
        subject: '[Parecer Técnico] {{ticket.id}} pronta para solução',
        body: `Olá {{requester.name}},

A OS {{ticket.id}} recebeu parecer técnico e seguiu para definição da solução.

Assunto: {{ticket.subject}}
Status atual: {{ticket.status}}

Acompanhe: {{tracking.url}}`,
      },
      'EMAIL-AGUARDANDO-ORCAMENTO': {
        trigger: 'EMAIL-AGUARDANDO-ORCAMENTO',
        subject: '[Orçamento] {{ticket.id}} em cotação',
        body: `Olá {{requester.name}},

A OS {{ticket.id}} entrou na etapa de orçamento e comparação com fornecedores.

Assunto: {{ticket.subject}}
Status atual: {{ticket.status}}

Acompanhe: {{tracking.url}}`,
      },
      'EMAIL-EM-APROVACAO': {
        trigger: 'EMAIL-EM-APROVACAO',
        subject: '[Aprovação] {{ticket.id}} em validação',
        body: `Olá {{requester.name}},

A OS {{ticket.id}} avançou para a etapa de aprovação.

Assunto: {{ticket.subject}}
Status atual: {{ticket.status}}

Você será avisado assim que a aprovação for concluída.

Acompanhe: {{tracking.url}}`,
      },
      'EMAIL-ACOES-PRELIMINARES': {
        trigger: 'EMAIL-ACOES-PRELIMINARES',
        subject: '[Planejamento] {{ticket.id}} em ações preliminares',
        body: `Olá {{requester.name}},

A OS {{ticket.id}} teve orçamento e contrato encaminhados e entrou em ações preliminares.

Assunto: {{ticket.subject}}
Status atual: {{ticket.status}}

Acompanhe: {{tracking.url}}`,
      },
      'EMAIL-EXECUCAO-INICIADA': {
        trigger: 'EMAIL-EXECUCAO-INICIADA',
        subject: '[Execução] {{ticket.id}} em andamento',
        body: `Olá {{requester.name}},

A execução da OS {{ticket.id}} foi iniciada.

Assunto: {{ticket.subject}}
Status atual: {{ticket.status}}

Acompanhe: {{tracking.url}}`,
      },
      'EMAIL-VALIDACAO-SOLICITANTE': {
        trigger: 'EMAIL-VALIDACAO-SOLICITANTE',
        subject: '[Validação] {{ticket.id}} aguardando sua confirmação',
        body: `Olá {{requester.name}},

A manutenção da OS {{ticket.id}} foi concluída pela equipe e agora aguarda sua validação.

Assunto: {{ticket.subject}}
Status atual: {{ticket.status}}

Acesse para revisar e responder: {{tracking.url}}`,
      },
      'EMAIL-AGUARDANDO-PAGAMENTO': {
        trigger: 'EMAIL-AGUARDANDO-PAGAMENTO',
        subject: '[Pagamento] {{ticket.id}} em finalização financeira',
        body: `Olá {{requester.name}},

A OS {{ticket.id}} foi validada e entrou na etapa de pagamento e encerramento.

Assunto: {{ticket.subject}}
Status atual: {{ticket.status}}

Acompanhe: {{tracking.url}}`,
      },
      'EMAIL-OS-ENCERRADA': {
        trigger: 'EMAIL-OS-ENCERRADA',
        subject: '[Encerrada] {{ticket.id}} concluída',
        body: `Olá {{requester.name}},

A OS {{ticket.id}} foi encerrada com sucesso.

Assunto: {{ticket.subject}}
Status final: {{ticket.status}}
Garantia: {{guarantee.summary}}

Histórico completo: {{tracking.url}}

Atenciosamente,
Gestão de Manutenção`,
      },
      'EMAIL-OS-CANCELADA': {
        trigger: 'EMAIL-OS-CANCELADA',
        subject: '[Cancelada] {{ticket.id}}',
        body: `Olá {{requester.name}},

A OS {{ticket.id}} foi cancelada.

Assunto: {{ticket.subject}}
Status atual: {{ticket.status}}
Motivo ou observação: {{message.body}}

Acompanhe: {{tracking.url}}`,
      },
      'EMAIL-NOVA-MENSAGEM': {
        trigger: 'EMAIL-NOVA-MENSAGEM',
        subject: '[Mensagem] {{ticket.id}} recebeu uma atualização',
        body: `Olá {{requester.name}},

{{message.sender}} enviou uma nova atualização na OS {{ticket.id}}.

Mensagem:
{{message.body}}

Acompanhe: {{tracking.url}}`,
      },
    },
  },
  dailyDigest: {
    default: {
      enabled: true,
      time: '08:00',
      recipients: 'rafael@empresa.com, diretoria@empresa.com',
      subject: '[Resumo Diário] Manutenção - {{data}} | {{novas_os_ontem}} novas OS · {{slas_vencendo_hoje}} SLAs hoje',
    },
  },
  sla: {
    default: {
      rules: [
        { priority: 'Urgente', prazo: '24h' },
        { priority: 'Alta', prazo: '72h' },
        { priority: 'Normal', prazo: '5 dias úteis' },
        { priority: 'Trivial', prazo: '10 dias úteis' },
      ],
    },
  },
};
