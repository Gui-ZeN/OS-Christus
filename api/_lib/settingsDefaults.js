export const DEFAULT_SETTINGS = {
  emailTemplates: {
    items: {
      'EMAIL-NOVA-OS': {
        trigger: 'EMAIL-NOVA-OS',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

Recebemos sua solicitação e a {{ticket.id}} já entrou na fila de triagem.

Chamado
{{ticket.subject}}

Local
{{ticket.sede}}

{{tracking.url}}`,
      },
      'EMAIL-TRIAGEM-EM-ANDAMENTO': {
        trigger: 'EMAIL-TRIAGEM-EM-ANDAMENTO',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

Sua solicitação está em triagem com a equipe de manutenção.

Chamado
{{ticket.subject}}

Status
{{ticket.status}}

{{tracking.url}}`,
      },
      'EMAIL-PARECER-TECNICO': {
        trigger: 'EMAIL-PARECER-TECNICO',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

O parecer técnico da {{ticket.id}} foi concluído e a solicitação seguiu para definição da solução.

Chamado
{{ticket.subject}}

Status
{{ticket.status}}

{{tracking.url}}`,
      },
      'EMAIL-AGUARDANDO-ORCAMENTO': {
        trigger: 'EMAIL-AGUARDANDO-ORCAMENTO',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

Sua solicitação entrou na etapa de orçamento e comparação com fornecedores.

Chamado
{{ticket.subject}}

Status
{{ticket.status}}

{{tracking.url}}`,
      },
      'EMAIL-EM-APROVACAO': {
        trigger: 'EMAIL-EM-APROVACAO',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

Sua solicitação avançou para a etapa de aprovação.

Chamado
{{ticket.subject}}

Status
{{ticket.status}}

{{tracking.url}}`,
      },
      'EMAIL-ACOES-PRELIMINARES': {
        trigger: 'EMAIL-ACOES-PRELIMINARES',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

Sua solicitação entrou em ações preliminares.

Chamado
{{ticket.subject}}

Status
{{ticket.status}}

{{tracking.url}}`,
      },
      'EMAIL-EXECUCAO-INICIADA': {
        trigger: 'EMAIL-EXECUCAO-INICIADA',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

A execução do serviço foi iniciada.

Chamado
{{ticket.subject}}

Status
{{ticket.status}}

{{tracking.url}}`,
      },
      'EMAIL-VALIDACAO-SOLICITANTE': {
        trigger: 'EMAIL-VALIDACAO-SOLICITANTE',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

A equipe concluiu a execução da {{ticket.id}} e agora precisa da sua validação.

Chamado
{{ticket.subject}}

Status
{{ticket.status}}

{{tracking.url}}`,
      },
      'EMAIL-AGUARDANDO-PAGAMENTO': {
        trigger: 'EMAIL-AGUARDANDO-PAGAMENTO',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

Sua validação foi registrada e a solicitação entrou na etapa de pagamento e encerramento.

Chamado
{{ticket.subject}}

Status
{{ticket.status}}

{{tracking.url}}`,
      },
      'EMAIL-OS-ENCERRADA': {
        trigger: 'EMAIL-OS-ENCERRADA',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

A {{ticket.id}} foi encerrada com sucesso.

Chamado
{{ticket.subject}}

Status final
{{ticket.status}}

Garantia
{{guarantee.summary}}

{{tracking.url}}`,
      },
      'EMAIL-OS-CANCELADA': {
        trigger: 'EMAIL-OS-CANCELADA',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

A {{ticket.id}} foi cancelada.

Chamado
{{ticket.subject}}

Status
{{ticket.status}}

Motivo
{{message.body}}

{{tracking.url}}`,
      },
      'EMAIL-NOVA-MENSAGEM': {
        trigger: 'EMAIL-NOVA-MENSAGEM',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

{{message.sender}} enviou uma nova mensagem sobre o chamado.

{{message.body}}

{{tracking.url}}`,
      },
    },
  },
  dailyDigest: {
    default: {
      enabled: true,
      time: '08:00',
      recipients: '',
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
