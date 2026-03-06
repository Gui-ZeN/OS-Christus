export const DEFAULT_QUOTES = {
  'OS-0046': [
    {
      id: 'quote-1',
      vendor: 'Decor Interiores',
      value: 'R$ 12.400,00',
      recommended: true,
      status: 'pending',
      items: [
        { id: 'item-1', description: 'Fornecimento e instalação de carpete', unit: 'm²', quantity: 80, unitPrice: 'R$ 120,00', totalPrice: 'R$ 9.600,00' },
        { id: 'item-2', description: 'Rodapé e acabamento', unit: 'vb', quantity: 1, unitPrice: 'R$ 2.800,00', totalPrice: 'R$ 2.800,00' },
      ],
    },
    {
      id: 'quote-2',
      vendor: 'Ambientes & Cia',
      value: 'R$ 14.200,00',
      recommended: false,
      status: 'pending',
      items: [
        { id: 'item-1', description: 'Carpete modular premium', unit: 'm²', quantity: 80, unitPrice: 'R$ 142,50', totalPrice: 'R$ 11.400,00' },
        { id: 'item-2', description: 'Acabamentos e instalação', unit: 'vb', quantity: 1, unitPrice: 'R$ 2.800,00', totalPrice: 'R$ 2.800,00' },
      ],
    },
    {
      id: 'quote-3',
      vendor: 'Reforma Facil LTDA',
      value: 'R$ 15.800,00',
      recommended: false,
      status: 'pending',
      items: [
        { id: 'item-1', description: 'Carpete em manta', unit: 'm²', quantity: 80, unitPrice: 'R$ 150,00', totalPrice: 'R$ 12.000,00' },
        { id: 'item-2', description: 'Remoção e descarte', unit: 'vb', quantity: 1, unitPrice: 'R$ 3.800,00', totalPrice: 'R$ 3.800,00' },
      ],
    },
  ],
};

export const DEFAULT_CONTRACTS = {
  'OS-0045': {
    id: 'contract-1',
    vendor: 'PowerTech Geradores',
    value: 'R$ 8.500,00',
    status: 'pending_signature',
    viewingBy: 'Diretor Pedro',
  },
};

export const DEFAULT_PAYMENTS = {
  'OS-0041': [
    {
      id: 'payment-1',
      vendor: 'Limpeza das Alturas Ltda.',
      value: 'R$ 1.600,00',
      label: 'Parcela 1/2',
      installmentNumber: 1,
      totalInstallments: 2,
      releasedPercent: 50,
      status: 'paid',
    },
    {
      id: 'payment-2',
      vendor: 'Limpeza das Alturas Ltda.',
      value: 'R$ 1.600,00',
      label: 'Parcela 2/2',
      installmentNumber: 2,
      totalInstallments: 2,
      releasedPercent: 50,
      status: 'pending',
    },
  ],
  'OS-0042': [
    {
      id: 'payment-1',
      vendor: 'Serralheria Forte',
      value: 'R$ 480,00',
      label: 'Pagamento à vista',
      installmentNumber: 1,
      totalInstallments: 1,
      releasedPercent: 100,
      status: 'pending',
    },
  ],
};

export const DEFAULT_MEASUREMENTS = {
  'OS-0041': [
    {
      id: 'measurement-1',
      label: 'Medição 50%',
      progressPercent: 50,
      releasePercent: 50,
      status: 'paid',
      notes: 'Primeira etapa concluída com limpeza total das calhas principais.',
    },
  ],
  'OS-0042': [
    {
      id: 'measurement-1',
      label: 'Medição final',
      progressPercent: 100,
      releasePercent: 100,
      status: 'approved',
      notes: 'Serviço concluído e validado pelo solicitante.',
    },
  ],
};
