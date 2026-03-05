export const DEFAULT_SETTINGS = {
  emailTemplates: {
    default: {
      trigger: 'EMAIL-NOVA-OS',
      subject: '[Nova OS] {{ticket.id}} - {{ticket.subject}}',
      body:
        'Olá {{requester.name}},\n\nSua Ordem de Serviço foi registrada com sucesso.\n\nNúmero: {{ticket.id}}\nAssunto: {{ticket.subject}}\n\nNossa equipe fará a triagem em breve.\n\nAtenciosamente,\nGestão de Manutenção',
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