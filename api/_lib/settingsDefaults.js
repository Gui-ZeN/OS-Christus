export const DEFAULT_SETTINGS = {
  emailTemplates: {
    items: {
      'EMAIL-NOVA-OS': {
        trigger: 'EMAIL-NOVA-OS',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

Recebemos sua solicitação e ela já entrou na fila de triagem.

Sede: {{ticket.sede}}`,
      },
      'EMAIL-TRIAGEM-EM-ANDAMENTO': {
        trigger: 'EMAIL-TRIAGEM-EM-ANDAMENTO',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

Sua solicitação está em triagem com a equipe de manutenção.`,
      },
      'EMAIL-PARECER-TECNICO': {
        trigger: 'EMAIL-PARECER-TECNICO',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

O parecer técnico foi concluído e a solicitação seguiu para definição da solução.`,
      },
      'EMAIL-AGUARDANDO-ORCAMENTO': {
        trigger: 'EMAIL-AGUARDANDO-ORCAMENTO',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

Sua solicitação entrou na etapa de orçamento e comparação com fornecedores.`,
      },
      'EMAIL-EM-APROVACAO': {
        trigger: 'EMAIL-EM-APROVACAO',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

Sua solicitação avançou para a etapa de aprovação.`,
      },
      'EMAIL-ACOES-PRELIMINARES': {
        trigger: 'EMAIL-ACOES-PRELIMINARES',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

Sua solicitação entrou em ações preliminares.`,
      },
      'EMAIL-EXECUCAO-INICIADA': {
        trigger: 'EMAIL-EXECUCAO-INICIADA',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

A execução do serviço foi iniciada.`,
      },
      'EMAIL-VALIDACAO-SOLICITANTE': {
        trigger: 'EMAIL-VALIDACAO-SOLICITANTE',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

A execução foi concluída e agora depende da sua validação para seguir com o encerramento.`,
      },
      'EMAIL-AGUARDANDO-PAGAMENTO': {
        trigger: 'EMAIL-AGUARDANDO-PAGAMENTO',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

Sua validação foi registrada. A OS seguiu para pagamento e encerramento.`,
      },
      'EMAIL-OS-ENCERRADA': {
        trigger: 'EMAIL-OS-ENCERRADA',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

A {{ticket.id}} foi encerrada com sucesso.

Garantia: {{guarantee.summary}}`,
      },
      'EMAIL-OS-CANCELADA': {
        trigger: 'EMAIL-OS-CANCELADA',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

A {{ticket.id}} foi cancelada.

Motivo:
{{message.body}}`,
      },
      'EMAIL-NOVA-MENSAGEM': {
        trigger: 'EMAIL-NOVA-MENSAGEM',
        subject: '{{ticket.id}} - {{ticket.subject}}',
        body: `Olá {{requester.name}},

{{message.sender}} enviou uma nova mensagem.

{{message.body}}`,
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
