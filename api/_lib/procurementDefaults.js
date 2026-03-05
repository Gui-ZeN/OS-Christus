export const DEFAULT_QUOTES = {
  'OS-0046': [
    { id: 'quote-1', vendor: 'Decor Interiores', value: 'R$ 12.400,00', recommended: true, status: 'pending' },
    { id: 'quote-2', vendor: 'Ambientes & Cia', value: 'R$ 14.200,00', recommended: false, status: 'pending' },
    { id: 'quote-3', vendor: 'Reforma Facil LTDA', value: 'R$ 15.800,00', recommended: false, status: 'pending' },
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
  'OS-0041': {
    id: 'payment-1',
    vendor: 'Limpeza das Alturas Ltda.',
    value: 'R$ 3.200,00',
    status: 'pending',
  },
  'OS-0042': {
    id: 'payment-2',
    vendor: 'Serralheria Forte',
    value: 'R$ 480,00',
    status: 'pending',
  },
};
