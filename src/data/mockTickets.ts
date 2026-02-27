import { Ticket } from '../types';

const now = new Date();
const subMinutes = (date: Date, minutes: number) => new Date(date.getTime() - minutes * 60000);
const subHours = (date: Date, hours: number) => new Date(date.getTime() - hours * 3600000);
const subDays = (date: Date, days: number) => new Date(date.getTime() - days * 86400000);

let _seq = 0;
const sid = () => `mid-${++_seq}`;

export const MOCK_TICKETS: Ticket[] = [
  {
    id: 'OS-0050',
    trackingToken: 'trk-0050',
    subject: 'Infiltração Crítica no Teto do Refeitório',
    requester: 'Marcos Silva (Facilities)',
    time: subMinutes(now, 30),
    status: 'Nova OS',
    type: 'Corretiva',
    region: 'Região Dionísio Torres',
    sede: 'DT1',
    sector: 'Refeitório Principal',
    priority: 'Urgente',
    sla: { dueAt: subHours(now, -4), status: 'on_time' },
    history: [
      { id: sid(), type: 'customer', sender: 'Marcos Silva (Facilities)', time: subMinutes(now, 30), text: 'Identificamos uma infiltração severa no teto do refeitório, próximo à área de cocção. Há risco de gotejamento nos equipamentos elétricos. Solicitamos intervenção imediata.' },
      { id: sid(), type: 'system', sender: 'Sistema', time: subMinutes(now, 25), text: 'OS-0050 registrada. Aguardando análise e categorização.' },
      { id: sid(), type: 'field_change', sender: 'Sistema', time: subMinutes(now, 25), field: 'status', from: 'Rascunho', to: 'Nova OS' }
    ]
  },
  {
    id: 'OS-0049',
    trackingToken: 'trk-0049',
    subject: 'Substituição de Lâmpadas Queimadas',
    requester: 'Recepção',
    time: subDays(now, 1),
    status: 'Aguardando Parecer Técnico',
    viewingBy: { name: 'Rafael', at: subMinutes(now, 5) },
    type: 'Corretiva',
    region: 'Região Sul',
    sede: 'SUL1',
    sector: 'Recepção Principal',
    priority: 'Trivial',
    sla: { dueAt: subDays(now, -2), status: 'on_time' },
    history: [
      { id: sid(), type: 'customer', sender: 'Recepção', time: subDays(now, 1), text: 'Três lâmpadas do hall de entrada estão queimadas.' },
      { id: sid(), type: 'system', sender: 'Sistema', time: subDays(now, 1), text: 'OS-0049 registrada. Aguardando análise e categorização.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 1), text: 'Análise e categorização concluída. OS aprovada na triagem para prosseguimento.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 1), text: 'Rafael solicitou visita técnica para avaliar o modelo das lâmpadas e reatores.' }
    ]
  },
  {
    id: 'OS-0048',
    trackingToken: 'trk-0048',
    subject: 'Modernização do Controle de Acesso',
    requester: 'Ana Paula (Segurança)',
    time: subDays(now, 1),
    status: 'Aguardando Aprovação da Solução',
    type: 'Melhoria',
    region: 'Região Aldeota',
    sede: 'BS',
    sector: 'Portaria Principal',
    priority: 'Alta',
    history: [
      { id: sid(), type: 'customer', sender: 'Ana Paula (Segurança)', time: subDays(now, 1), text: 'As catracas atuais estão apresentando lentidão. Solicitamos a modernização.' },
      { id: sid(), type: 'system', sender: 'Sistema', time: subDays(now, 1), text: 'OS-0048 registrada. Aguardando análise e categorização.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 1), text: 'Análise e categorização concluída. OS aprovada na triagem para prosseguimento.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 1), text: 'Rafael solicitou visita técnica para avaliar o problema.' },
      { id: sid(), type: 'tech', sender: 'Equipe TI', time: subDays(now, 1), text: 'Parecer: Substituir por catracas com biometria facial. Equipamento atual descontinuado pelo fabricante. Recomendamos modelo modular com integração ao sistema de RH.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 1), text: 'Parecer enviado para aprovação da Diretoria.' }
    ]
  },
  {
    id: 'OS-0047',
    trackingToken: 'trk-0047',
    subject: 'Pintura da Fachada',
    requester: 'Diretoria',
    time: subDays(now, 2),
    status: 'Aguardando Orçamento',
    type: 'Melhoria',
    region: 'Região Dionísio Torres',
    sede: 'DT1',
    sector: 'Fachada',
    priority: 'Alta',
    history: [
      { id: sid(), type: 'customer', sender: 'Diretoria', time: subDays(now, 2), text: 'Solicito orçamento para pintura completa da fachada.' },
      { id: sid(), type: 'system', sender: 'Sistema', time: subDays(now, 2), text: 'OS-0047 registrada. Aguardando análise e categorização.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 2), text: 'Análise e categorização concluída. OS aprovada na triagem para prosseguimento.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 2), text: 'Rafael solicitou visita técnica para avaliar o problema.' },
      { id: sid(), type: 'tech', sender: 'Equipe Manutenção', time: subDays(now, 2), text: 'Parecer: Pintura necessária devido ao desgaste do tempo.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 2), text: 'Parecer enviado para aprovação da Diretoria.' },
      { id: sid(), type: 'system', sender: 'Diretoria', time: subDays(now, 1), text: 'Solução aprovada pela Diretoria. Rafael iniciou cotação com fornecedores.' }
    ]
  },
  {
    id: 'OS-0046',
    trackingToken: 'trk-0046',
    subject: 'Troca do Carpete (Sala de Reuniões)',
    requester: 'RH',
    time: subDays(now, 3),
    status: 'Aguardando Aprovação do Orçamento',
    type: 'Melhoria',
    region: 'Região Sul',
    sede: 'SUL1',
    sector: 'Sala de Reuniões 2',
    priority: 'Trivial',
    history: [
      { id: sid(), type: 'customer', sender: 'RH', time: subDays(now, 3), text: 'Carpete manchado e rasgado.' },
      { id: sid(), type: 'system', sender: 'Sistema', time: subDays(now, 3), text: 'OS-0046 registrada. Aguardando análise e categorização.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 3), text: 'Análise e categorização concluída. OS aprovada na triagem para prosseguimento.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 3), text: 'Rafael solicitou visita técnica para avaliar o problema.' },
      { id: sid(), type: 'tech', sender: 'Equipe Manutenção', time: subDays(now, 3), text: 'Parecer: Necessária a troca completa do carpete da sala.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 3), text: 'Parecer enviado para aprovação da Diretoria.' },
      { id: sid(), type: 'system', sender: 'Diretoria', time: subDays(now, 2), text: 'Solução aprovada pela Diretoria. Rafael iniciou cotação com fornecedores.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 1), text: 'Orçamentos anexados. Aguardando aprovação da Diretoria.' }
    ]
  },
  {
    id: 'OS-0045',
    trackingToken: 'trk-0045',
    subject: 'Manutenção Preventiva dos Geradores',
    requester: 'Engenharia Predial',
    time: subDays(now, 4),
    status: 'Aguardando aprovação do contrato',
    type: 'Preventiva',
    region: 'Região Sul',
    sede: 'SUL1',
    sector: 'Casa de Máquinas',
    priority: 'Alta',
    history: [
      { id: sid(), type: 'customer', sender: 'Engenharia Predial', time: subDays(now, 4), text: 'Manutenção preventiva semestral.' },
      { id: sid(), type: 'system', sender: 'Sistema', time: subDays(now, 4), text: 'OS-0045 registrada. Aguardando análise e categorização.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 4), text: 'Análise e categorização concluída. OS aprovada na triagem para prosseguimento.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 4), text: 'Rafael solicitou visita técnica para avaliar o problema.' },
      { id: sid(), type: 'tech', sender: 'Equipe Manutenção', time: subDays(now, 4), text: 'Parecer: Realizar manutenção padrão conforme manual do fabricante.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 4), text: 'Parecer enviado para aprovação da Diretoria.' },
      { id: sid(), type: 'system', sender: 'Diretoria', time: subDays(now, 3), text: 'Solução aprovada pela Diretoria. Rafael iniciou cotação com fornecedores.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 2), text: 'Orçamentos anexados. Aguardando aprovação da Diretoria.' },
      { id: sid(), type: 'system', sender: 'Diretoria', time: subDays(now, 1), text: 'Orçamento aprovado pela Diretoria (R$ 8.500,00 - PowerTech Geradores). Aguardando Pedro assinar o contrato.' }
    ]
  },
  {
    id: 'OS-0044',
    trackingToken: 'trk-0044',
    subject: 'Instalação de Ar Condicionado',
    requester: 'TI',
    time: subDays(now, 7),
    status: 'Aguardando Ações Preliminares',
    type: 'Melhoria',
    region: 'Região Benfica',
    sede: 'BEN1',
    sector: 'Sala de Servidores',
    priority: 'Urgente',
    sla: { dueAt: subDays(now, 1), status: 'overdue' },
    history: [
      { id: sid(), type: 'customer', sender: 'TI', time: subDays(now, 7), text: 'Necessário novo ar condicionado para o rack extra.' },
      { id: sid(), type: 'system', sender: 'Sistema', time: subDays(now, 7), text: 'OS-0044 registrada. Aguardando análise e categorização.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 7), text: 'Análise e categorização concluída. OS aprovada na triagem para prosseguimento.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 7), text: 'Rafael solicitou visita técnica para avaliar o problema.' },
      { id: sid(), type: 'tech', sender: 'Equipe Climatização', time: subDays(now, 7), text: 'Parecer: Instalar split de 12.000 BTUs.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 7), text: 'Parecer enviado para aprovação da Diretoria.' },
      { id: sid(), type: 'system', sender: 'Diretoria', time: subDays(now, 7), text: 'Solução aprovada pela Diretoria. Rafael iniciou cotação com fornecedores.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 7), text: 'Orçamentos anexados. Aguardando aprovação da Diretoria.' },
      { id: sid(), type: 'system', sender: 'Diretoria', time: subDays(now, 7), text: 'Orçamento aprovado pela Diretoria.' },
      { id: sid(), type: 'system', sender: 'Pedro', time: subDays(now, 7), text: 'Contrato assinado pelo Diretor Pedro. Aguardando Rafael comprar materiais e agendar.' }
    ]
  },
  {
    id: 'OS-0043',
    trackingToken: 'trk-0043',
    subject: 'Reparo Vazamento Banheiro',
    requester: 'Limpeza',
    time: subDays(now, 7),
    status: 'Em andamento',
    type: 'Corretiva',
    region: 'Região Parquelândia',
    sede: 'PQL1',
    sector: 'Banheiro Masculino 2º Andar',
    priority: 'Alta',
    history: [
      { id: sid(), type: 'customer', sender: 'Limpeza', time: subDays(now, 7), text: 'Vazamento forte na pia.' },
      { id: sid(), type: 'system', sender: 'Sistema', time: subDays(now, 7), text: 'OS-0043 registrada. Aguardando análise e categorização.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 7), text: 'Análise e categorização concluída. OS aprovada na triagem para prosseguimento.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 7), text: 'Rafael solicitou visita técnica para avaliar o problema.' },
      { id: sid(), type: 'tech', sender: 'Equipe Hidráulica', time: subDays(now, 7), text: 'Parecer: Trocar sifão e vedação.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 7), text: 'Parecer enviado para aprovação da Diretoria.' },
      { id: sid(), type: 'system', sender: 'Diretoria', time: subDays(now, 7), text: 'Solução aprovada pela Diretoria. Rafael iniciou cotação com fornecedores.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 7), text: 'Orçamentos anexados. Aguardando aprovação da Diretoria.' },
      { id: sid(), type: 'system', sender: 'Diretoria', time: subDays(now, 7), text: 'Orçamento aprovado pela Diretoria.' },
      { id: sid(), type: 'system', sender: 'Pedro', time: subDays(now, 7), text: 'Contrato assinado pelo Diretor Pedro.' },
      { id: sid(), type: 'system', sender: 'Sistema', time: subHours(now, 1), text: 'Equipe de encanadores no local realizando o reparo.' }
    ]
  },
  {
    id: 'OS-0042',
    trackingToken: 'trk-0042',
    subject: 'Troca de Fechadura',
    requester: 'Recepção',
    time: subDays(now, 7),
    status: 'Aguardando aprovação da manutenção',
    type: 'Corretiva',
    region: 'Região Aldeota',
    sede: 'BS',
    sector: 'Porta Lateral',
    priority: 'Trivial',
    history: [
      { id: sid(), type: 'customer', sender: 'Recepção', time: subDays(now, 7), text: 'Fechadura emperrando.' },
      { id: sid(), type: 'system', sender: 'Sistema', time: subDays(now, 7), text: 'OS-0042 registrada. Aguardando análise e categorização.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 7), text: 'Análise e categorização concluída. OS aprovada na triagem para prosseguimento.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 7), text: 'Rafael solicitou visita técnica para avaliar o problema.' },
      { id: sid(), type: 'tech', sender: 'Equipe Manutenção', time: subDays(now, 7), text: 'Parecer: Substituição do miolo da fechadura.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 7), text: 'Parecer enviado para aprovação da Diretoria.' },
      { id: sid(), type: 'system', sender: 'Diretoria', time: subDays(now, 7), text: 'Solução aprovada pela Diretoria. Rafael iniciou cotação com fornecedores.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 7), text: 'Orçamentos anexados. Aguardando aprovação da Diretoria.' },
      { id: sid(), type: 'system', sender: 'Diretoria', time: subDays(now, 7), text: 'Orçamento aprovado pela Diretoria.' },
      { id: sid(), type: 'system', sender: 'Pedro', time: subDays(now, 7), text: 'Contrato assinado pelo Diretor Pedro.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 1), text: 'Ações preliminares concluídas.' },
      { id: sid(), type: 'system', sender: 'Sistema', time: subDays(now, 1), text: 'Serviço em andamento.' },
      { id: sid(), type: 'tech', sender: 'Rafael', time: subHours(now, 1), text: 'Fechadura trocada. Aguardando solicitante validar.' }
    ]
  },
  {
    id: 'OS-0041',
    trackingToken: 'trk-0041',
    subject: 'Limpeza de Calhas',
    requester: 'Facilities',
    time: subDays(now, 30),
    status: 'Aguardando pagamento',
    type: 'Preventiva',
    region: 'Região Dionísio Torres',
    sede: 'DT1',
    sector: 'Telhado',
    priority: 'Alta',
    history: [
      { id: sid(), type: 'customer', sender: 'Facilities', time: subDays(now, 30), text: 'Limpeza anual antes das chuvas.' },
      { id: sid(), type: 'system', sender: 'Sistema', time: subDays(now, 30), text: 'OS-0041 registrada. Aguardando análise e categorização.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 30), text: 'Análise e categorização concluída. OS aprovada na triagem para prosseguimento.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 30), text: 'Rafael solicitou visita técnica para avaliar o problema.' },
      { id: sid(), type: 'tech', sender: 'Equipe Manutenção', time: subDays(now, 30), text: 'Parecer: Limpeza padrão das calhas do telhado.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 30), text: 'Parecer enviado para aprovação da Diretoria.' },
      { id: sid(), type: 'system', sender: 'Diretoria', time: subDays(now, 30), text: 'Solução aprovada pela Diretoria. Rafael iniciou cotação com fornecedores.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 30), text: 'Orçamentos anexados. Aguardando aprovação da Diretoria.' },
      { id: sid(), type: 'system', sender: 'Diretoria', time: subDays(now, 30), text: 'Orçamento aprovado pela Diretoria.' },
      { id: sid(), type: 'system', sender: 'Pedro', time: subDays(now, 30), text: 'Contrato assinado pelo Diretor Pedro.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 30), text: 'Ações preliminares concluídas.' },
      { id: sid(), type: 'system', sender: 'Sistema', time: subDays(now, 30), text: 'Serviço em andamento.' },
      { id: sid(), type: 'tech', sender: 'Equipe Manutenção', time: subDays(now, 30), text: 'Limpeza concluída. Aguardando solicitante validar.' },
      { id: sid(), type: 'system', sender: 'Facilities', time: subDays(now, 28), text: 'Manutenção aprovada pelo solicitante. Aguardando Geovana realizar o pagamento.' }
    ]
  },
  {
    id: 'OS-0040',
    trackingToken: 'trk-0040',
    subject: 'Conserto de Cadeira',
    requester: 'RH',
    time: subDays(now, 30),
    status: 'Encerrada',
    type: 'Corretiva',
    region: 'Região Sul',
    sede: 'SUL1',
    sector: 'RH',
    priority: 'Trivial',
    history: [
      { id: sid(), type: 'customer', sender: 'RH', time: subDays(now, 30), text: 'Roda da cadeira quebrou.' },
      { id: sid(), type: 'system', sender: 'Sistema', time: subDays(now, 30), text: 'OS-0040 registrada. Aguardando análise e categorização.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 30), text: 'Análise e categorização concluída. OS aprovada na triagem para prosseguimento.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 30), text: 'Rafael solicitou visita técnica para avaliar o problema.' },
      { id: sid(), type: 'tech', sender: 'Equipe Manutenção', time: subDays(now, 30), text: 'Parecer: Substituição do rodízio.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 30), text: 'Parecer enviado para aprovação da Diretoria.' },
      { id: sid(), type: 'system', sender: 'Diretoria', time: subDays(now, 30), text: 'Solução aprovada pela Diretoria. Rafael iniciou cotação com fornecedores.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 30), text: 'Orçamentos anexados. Aguardando aprovação da Diretoria.' },
      { id: sid(), type: 'system', sender: 'Diretoria', time: subDays(now, 30), text: 'Orçamento aprovado pela Diretoria.' },
      { id: sid(), type: 'system', sender: 'Pedro', time: subDays(now, 30), text: 'Contrato assinado pelo Diretor Pedro.' },
      { id: sid(), type: 'system', sender: 'Rafael', time: subDays(now, 30), text: 'Ações preliminares concluídas.' },
      { id: sid(), type: 'system', sender: 'Sistema', time: subDays(now, 30), text: 'Serviço em andamento.' },
      { id: sid(), type: 'tech', sender: 'Equipe Manutenção', time: subDays(now, 30), text: 'Rodízio trocado. Aguardando solicitante validar.' },
      { id: sid(), type: 'system', sender: 'RH', time: subDays(now, 30), text: 'Manutenção aprovada pelo solicitante. Aguardando Geovana realizar o pagamento.' },
      { id: sid(), type: 'system', sender: 'Geovana', time: subDays(now, 30), text: 'Pagamento realizado. OS encerrada.' }
    ]
  }
];
