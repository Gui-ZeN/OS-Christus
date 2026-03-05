export const DEFAULT_NOTIFICATIONS = [
  {
    id: 'n1',
    type: 'actionable',
    title: 'Aprovação Necessária',
    body: 'Orçamento da OS-0048 excede o limite automático. Requer sua validação.',
    read: false,
    action: { label: 'Revisar Orçamento', view: 'approvals' },
  },
  {
    id: 'n2',
    type: 'info',
    title: 'OS-0045 Validada',
    body: 'O solicitante aprovou a manutenção dos geradores. Pronta para pagamento.',
    read: false,
    action: { label: 'Ver OS', view: 'inbox', ticketId: 'OS-0045' },
  },
  {
    id: 'n3',
    type: 'alert',
    title: 'SLA Vencido: OS-0044',
    body: 'O prazo de resolução para esta OS crítica expirou.',
    read: false,
    action: { label: 'Ver OS Atrasada', view: 'inbox', ticketId: 'OS-0044' },
  },
  {
    id: 'n4',
    type: 'info',
    title: 'Nova OS Registrada',
    body: 'Infiltração crítica no teto do refeitório (OS-0050).',
    read: true,
    action: { label: 'Ver OS', view: 'inbox', ticketId: 'OS-0050' },
  },
];