export const DEFAULT_SETTINGS = {
  emailTemplates: {
    items: {
      'EMAIL-NOVA-OS': {
        trigger: 'EMAIL-NOVA-OS',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

Recebemos sua solicitação e ela já entrou na fila de triagem.

Sede: {{ticket.sede}}`,
        recipients: '',
      },
      'EMAIL-TRIAGEM-EM-ANDAMENTO': {
        trigger: 'EMAIL-TRIAGEM-EM-ANDAMENTO',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

Sua solicitação foi aceita para atendimento e seguirá para o plano técnico.`,
        recipients: '',
      },
      'EMAIL-PARECER-TECNICO': {
        trigger: 'EMAIL-PARECER-TECNICO',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

O plano técnico foi definido e autorizado para seguir com a execução.`,
        recipients: '',
      },
      'EMAIL-AGUARDANDO-ORCAMENTO': {
        trigger: 'EMAIL-AGUARDANDO-ORCAMENTO',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

Sua OS está em planejamento administrativo para execução.`,
        recipients: '',
      },
      'EMAIL-EM-APROVACAO': {
        trigger: 'EMAIL-EM-APROVACAO',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

Sua OS está em preparação administrativa para execução.`,
        recipients: '',
      },
      'EMAIL-DIRETORIA-SOLUCAO': {
        trigger: 'EMAIL-DIRETORIA-SOLUCAO',
        subject: '{{ticket.id}} - Avaliação da Diretoria',
        body: `Olá Diretoria,

A OS {{ticket.id}} entrou na etapa de solução e requer acompanhamento.

Status atual: {{ticket.status}}`,
        recipients: '',
      },
      'EMAIL-DIRETORIA-APROVACAO': {
        trigger: 'EMAIL-DIRETORIA-APROVACAO',
        subject: '{{ticket.id}} - Aprovação da Diretoria',
        body: `Olá Diretoria,

A OS {{ticket.id}} está em aprovação e aguarda decisão.

Status atual: {{ticket.status}}`,
        recipients: '',
      },
      'EMAIL-ACOES-PRELIMINARES': {
        trigger: 'EMAIL-ACOES-PRELIMINARES',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

Sua obra entrou na etapa de preparação da execução.`,
        recipients: '',
      },
      'EMAIL-EXECUCAO-INICIADA': {
        trigger: 'EMAIL-EXECUCAO-INICIADA',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

A execução da obra foi iniciada.`,
        recipients: '',
      },
      'EMAIL-VALIDACAO-SOLICITANTE': {
        trigger: 'EMAIL-VALIDACAO-SOLICITANTE',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

A execução da obra foi concluída. Confirme a entrega no link de acompanhamento.`,
        recipients: '',
      },
      'EMAIL-AGUARDANDO-PAGAMENTO': {
        trigger: 'EMAIL-AGUARDANDO-PAGAMENTO',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

Sua validação foi registrada. A OS seguiu para pagamento e encerramento.`,
        recipients: '',
      },
      'EMAIL-FINANCEIRO-PAGAMENTO': {
        trigger: 'EMAIL-FINANCEIRO-PAGAMENTO',
        subject: '{{ticket.id}} - Pagamento pendente',
        body: `Olá Time Financeiro,

A OS {{ticket.id}} entrou em etapa de pagamento e precisa de tratativa.

Status atual: {{ticket.status}}`,
        recipients: '',
      },
      'EMAIL-OS-ENCERRADA': {
        trigger: 'EMAIL-OS-ENCERRADA',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

A {{ticket.id}} foi encerrada com sucesso.

Garantia: {{guarantee.summary}}`,
        recipients: '',
      },
      'EMAIL-OS-CANCELADA': {
        trigger: 'EMAIL-OS-CANCELADA',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

A {{ticket.id}} foi cancelada.

Motivo:
{{message.body}}`,
        recipients: '',
      },
      'EMAIL-NOVA-MENSAGEM': {
        trigger: 'EMAIL-NOVA-MENSAGEM',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

{{message.sender}} enviou uma nova mensagem.

{{message.body}}`,
        recipients: '',
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
        { priority: 'Urgente', prazo: 'Sem medição de tempo' },
        { priority: 'Alta', prazo: 'Sem medição de tempo' },
        { priority: 'Trivial', prazo: 'Sem medição de tempo' },
      ],
    },
  },
  thirdPartyTags: {
    default: {
      tags: [],
    },
  },
};
