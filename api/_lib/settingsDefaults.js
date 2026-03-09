export const DEFAULT_SETTINGS = {
  emailTemplates: {
    items: {
      'EMAIL-NOVA-OS': {
        trigger: 'EMAIL-NOVA-OS',
        subject: '[Nova OS] {{ticket.id}} - {{ticket.subject}}',
        body: `Ol\u00e1 {{requester.name}},

Sua Ordem de Servi\u00e7o foi registrada com sucesso.

N\u00famero: {{ticket.id}}
Assunto: {{ticket.subject}}
Status atual: {{ticket.status}}
Regi\u00e3o: {{ticket.region}}
Sede: {{ticket.sede}}

Acompanhe pelo link: {{tracking.url}}

Atenciosamente,
Gest\u00e3o de Manuten\u00e7\u00e3o`,
      },
      'EMAIL-TRIAGEM-EM-ANDAMENTO': {
        trigger: 'EMAIL-TRIAGEM-EM-ANDAMENTO',
        subject: '[Triagem] {{ticket.id}} em an\u00e1lise',
        body: `Ol\u00e1 {{requester.name}},

Sua OS {{ticket.id}} entrou em triagem com a equipe de manuten\u00e7\u00e3o.

Assunto: {{ticket.subject}}
Status atual: {{ticket.status}}
Regi\u00e3o: {{ticket.region}}
Sede: {{ticket.sede}}

Assim que houver avan\u00e7o de parecer t\u00e9cnico, voc\u00ea receber\u00e1 nova atualiza\u00e7\u00e3o.

Acompanhe: {{tracking.url}}`,
      },
      'EMAIL-PARECER-TECNICO': {
        trigger: 'EMAIL-PARECER-TECNICO',
        subject: '[Parecer T\u00e9cnico] {{ticket.id}} pronta para solu\u00e7\u00e3o',
        body: `Ol\u00e1 {{requester.name}},

A OS {{ticket.id}} recebeu parecer t\u00e9cnico e seguiu para defini\u00e7\u00e3o da solu\u00e7\u00e3o.

Assunto: {{ticket.subject}}
Status atual: {{ticket.status}}
Regi\u00e3o: {{ticket.region}}
Sede: {{ticket.sede}}

Acompanhe: {{tracking.url}}`,
      },
      'EMAIL-AGUARDANDO-ORCAMENTO': {
        trigger: 'EMAIL-AGUARDANDO-ORCAMENTO',
        subject: '[Or\u00e7amento] {{ticket.id}} em cota\u00e7\u00e3o',
        body: `Ol\u00e1 {{requester.name}},

A OS {{ticket.id}} entrou na etapa de or\u00e7amento e compara\u00e7\u00e3o com fornecedores.

Assunto: {{ticket.subject}}
Status atual: {{ticket.status}}
Regi\u00e3o: {{ticket.region}}
Sede: {{ticket.sede}}

Acompanhe: {{tracking.url}}`,
      },
      'EMAIL-EM-APROVACAO': {
        trigger: 'EMAIL-EM-APROVACAO',
        subject: '[Aprova\u00e7\u00e3o] {{ticket.id}} em valida\u00e7\u00e3o',
        body: `Ol\u00e1 {{requester.name}},

A OS {{ticket.id}} avan\u00e7ou para a etapa de aprova\u00e7\u00e3o.

Assunto: {{ticket.subject}}
Status atual: {{ticket.status}}
Regi\u00e3o: {{ticket.region}}
Sede: {{ticket.sede}}

Voc\u00ea ser\u00e1 avisado assim que a aprova\u00e7\u00e3o for conclu\u00edda.

Acompanhe: {{tracking.url}}`,
      },
      'EMAIL-ACOES-PRELIMINARES': {
        trigger: 'EMAIL-ACOES-PRELIMINARES',
        subject: '[Planejamento] {{ticket.id}} em a\u00e7\u00f5es preliminares',
        body: `Ol\u00e1 {{requester.name}},

A OS {{ticket.id}} teve or\u00e7amento e contrato encaminhados e entrou em a\u00e7\u00f5es preliminares.

Assunto: {{ticket.subject}}
Status atual: {{ticket.status}}
Regi\u00e3o: {{ticket.region}}
Sede: {{ticket.sede}}

Acompanhe: {{tracking.url}}`,
      },
      'EMAIL-EXECUCAO-INICIADA': {
        trigger: 'EMAIL-EXECUCAO-INICIADA',
        subject: '[Execu\u00e7\u00e3o] {{ticket.id}} em andamento',
        body: `Ol\u00e1 {{requester.name}},

A execu\u00e7\u00e3o da OS {{ticket.id}} foi iniciada.

Assunto: {{ticket.subject}}
Status atual: {{ticket.status}}
Regi\u00e3o: {{ticket.region}}
Sede: {{ticket.sede}}

Acompanhe: {{tracking.url}}`,
      },
      'EMAIL-VALIDACAO-SOLICITANTE': {
        trigger: 'EMAIL-VALIDACAO-SOLICITANTE',
        subject: '[Valida\u00e7\u00e3o] {{ticket.id}} aguardando sua confirma\u00e7\u00e3o',
        body: `Ol\u00e1 {{requester.name}},

A manuten\u00e7\u00e3o da OS {{ticket.id}} foi conclu\u00edda pela equipe e agora aguarda sua valida\u00e7\u00e3o.

Assunto: {{ticket.subject}}
Status atual: {{ticket.status}}
Regi\u00e3o: {{ticket.region}}
Sede: {{ticket.sede}}

Acesse para revisar e responder: {{tracking.url}}`,
      },
      'EMAIL-AGUARDANDO-PAGAMENTO': {
        trigger: 'EMAIL-AGUARDANDO-PAGAMENTO',
        subject: '[Pagamento] {{ticket.id}} em finaliza\u00e7\u00e3o financeira',
        body: `Ol\u00e1 {{requester.name}},

A OS {{ticket.id}} foi validada e entrou na etapa de pagamento e encerramento.

Assunto: {{ticket.subject}}
Status atual: {{ticket.status}}
Regi\u00e3o: {{ticket.region}}
Sede: {{ticket.sede}}

Acompanhe: {{tracking.url}}`,
      },
      'EMAIL-OS-ENCERRADA': {
        trigger: 'EMAIL-OS-ENCERRADA',
        subject: '[Encerrada] {{ticket.id}} conclu\u00edda',
        body: `Ol\u00e1 {{requester.name}},

A OS {{ticket.id}} foi encerrada com sucesso.

Assunto: {{ticket.subject}}
Status final: {{ticket.status}}
Regi\u00e3o: {{ticket.region}}
Sede: {{ticket.sede}}
Garantia: {{guarantee.summary}}

Hist\u00f3rico completo: {{tracking.url}}

Atenciosamente,
Gest\u00e3o de Manuten\u00e7\u00e3o`,
      },
      'EMAIL-OS-CANCELADA': {
        trigger: 'EMAIL-OS-CANCELADA',
        subject: '[Cancelada] {{ticket.id}}',
        body: `Ol\u00e1 {{requester.name}},

A OS {{ticket.id}} foi cancelada.

Assunto: {{ticket.subject}}
Status atual: {{ticket.status}}
Regi\u00e3o: {{ticket.region}}
Sede: {{ticket.sede}}
Motivo ou observa\u00e7\u00e3o: {{message.body}}

Acompanhe: {{tracking.url}}`,
      },
      'EMAIL-NOVA-MENSAGEM': {
        trigger: 'EMAIL-NOVA-MENSAGEM',
        subject: '[Mensagem] {{ticket.id}} recebeu uma atualiza\u00e7\u00e3o',
        body: `Ol\u00e1 {{requester.name}},

{{message.sender}} enviou uma nova atualiza\u00e7\u00e3o na OS {{ticket.id}}.

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
      subject: '[Resumo Di\u00e1rio] Manuten\u00e7\u00e3o - {{data}} | {{novas_os_ontem}} novas OS \u00b7 {{slas_vencendo_hoje}} SLAs hoje',
    },
  },
  sla: {
    default: {
      rules: [
        { priority: 'Urgente', prazo: '24h' },
        { priority: 'Alta', prazo: '72h' },
        { priority: 'Normal', prazo: '5 dias \u00fateis' },
        { priority: 'Trivial', prazo: '10 dias \u00fateis' },
      ],
    },
  },
};
