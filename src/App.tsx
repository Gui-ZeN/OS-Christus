import React, { useState } from 'react';
import { Home, Inbox, Users, BarChart2, Settings, Search, Plus, ChevronDown, MoreHorizontal, Paperclip, Bold, Italic, List, Lock, Landmark, CheckCircle, Clock, Mail, LogOut, ArrowRight, Activity, Shield, FileText, ExternalLink, UploadCloud, ArrowLeft, Loader2, X, DollarSign, Play, CheckSquare, AlertTriangle, Bell, Filter, Image as ImageIcon } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';

type ViewState = 'login' | 'home' | 'inbox' | 'users' | 'kpi' | 'settings' | 'tracking' | 'public-form' | 'approvals' | 'finance';

export const MOCK_TICKETS = [
  {
    id: 'OS-0050',
    subject: 'Infiltração Crítica no Teto do Refeitório',
    requester: 'Marcos Silva (Facilities)',
    time: '08:30',
    status: 'Nova OS',
    type: 'Corretiva',
    region: 'Região Dionísio Torres',
    sede: 'DT1',
    sector: 'Refeitório Principal',
    priority: 'Urgente',
    history: [
      { type: 'customer', sender: 'Marcos Silva (Facilities)', time: 'Hoje, 08:30', text: 'Identificamos uma infiltração severa no teto do refeitório, próximo à área de cocção. Há risco de gotejamento nos equipamentos elétricos. Solicitamos intervenção imediata.' },
      { type: 'system', sender: 'Sistema', time: 'Hoje, 08:35', text: 'OS-0050 registrada. Aguardando análise e categorização.' }
    ]
  },
  {
    id: 'OS-0049',
    subject: 'Substituição de Lâmpadas Queimadas',
    requester: 'Recepção',
    time: 'Ontem',
    status: 'Aguardando Parecer Técnico',
    type: 'Corretiva',
    region: 'Região Sul',
    sede: 'SUL1',
    sector: 'Recepção Principal',
    priority: 'Trivial',
    history: [
      { type: 'customer', sender: 'Recepção', time: 'Ontem, 10:00', text: 'Três lâmpadas do hall de entrada estão queimadas.' },
      { type: 'system', sender: 'Sistema', time: 'Ontem, 10:05', text: 'OS-0049 registrada. Aguardando análise e categorização.' },
      { type: 'system', sender: 'Rafael', time: 'Ontem, 10:30', text: 'Análise e categorização concluída. OS aprovada na triagem para prosseguimento.' },
      { type: 'system', sender: 'Rafael', time: 'Ontem, 10:45', text: 'Rafael solicitou visita técnica para avaliar o modelo das lâmpadas e reatores.' }
    ]
  },
  {
    id: 'OS-0048',
    subject: 'Modernização do Controle de Acesso',
    requester: 'Ana Paula (Segurança)',
    time: 'Ontem',
    status: 'Aguardando Aprovação da Solução',
    type: 'Melhoria',
    region: 'Região Aldeota',
    sede: 'BS',
    sector: 'Portaria Principal',
    priority: 'Alta',
    history: [
      { type: 'customer', sender: 'Ana Paula (Segurança)', time: 'Ontem, 09:15', text: 'As catracas atuais estão apresentando lentidão. Solicitamos a modernização.' },
      { type: 'system', sender: 'Sistema', time: 'Ontem, 09:20', text: 'OS-0048 registrada. Aguardando análise e categorização.' },
      { type: 'system', sender: 'Rafael', time: 'Ontem, 09:45', text: 'Análise e categorização concluída. OS aprovada na triagem para prosseguimento.' },
      { type: 'system', sender: 'Rafael', time: 'Ontem, 10:00', text: 'Rafael solicitou visita técnica para avaliar o problema.' },
      { type: 'tech', sender: 'Equipe TI', time: 'Ontem, 14:00', text: 'Parecer: Substituir por catracas com biometria facial.' },
      { type: 'system', sender: 'Rafael', time: 'Ontem, 14:30', text: 'Parecer enviado para aprovação da Diretoria.' }
    ]
  },
  {
    id: 'OS-0047',
    subject: 'Pintura da Fachada',
    requester: 'Diretoria',
    time: '2 dias atrás',
    status: 'Aguardando Orçamento',
    type: 'Melhoria',
    region: 'Região Dionísio Torres',
    sede: 'DT1',
    sector: 'Fachada',
    priority: 'Alta',
    history: [
      { type: 'customer', sender: 'Diretoria', time: '2 dias atrás, 09:00', text: 'Solicito orçamento para pintura completa da fachada.' },
      { type: 'system', sender: 'Sistema', time: '2 dias atrás, 09:05', text: 'OS-0047 registrada. Aguardando análise e categorização.' },
      { type: 'system', sender: 'Rafael', time: '2 dias atrás, 09:30', text: 'Análise e categorização concluída. OS aprovada na triagem para prosseguimento.' },
      { type: 'system', sender: 'Rafael', time: '2 dias atrás, 10:00', text: 'Rafael solicitou visita técnica para avaliar o problema.' },
      { type: 'tech', sender: 'Equipe Manutenção', time: '2 dias atrás, 14:00', text: 'Parecer: Pintura necessária devido ao desgaste do tempo.' },
      { type: 'system', sender: 'Rafael', time: '2 dias atrás, 14:30', text: 'Parecer enviado para aprovação da Diretoria.' },
      { type: 'system', sender: 'Diretoria', time: 'Ontem, 10:00', text: 'Solução aprovada pela Diretoria. Rafael iniciou cotação com fornecedores.' }
    ]
  },
  {
    id: 'OS-0046',
    subject: 'Troca do Carpete (Sala de Reuniões)',
    requester: 'RH',
    time: '3 dias atrás',
    status: 'Aguardando Aprovação do Orçamento',
    type: 'Melhoria',
    region: 'Região Sul',
    sede: 'SUL1',
    sector: 'Sala de Reuniões 2',
    priority: 'Trivial',
    history: [
      { type: 'customer', sender: 'RH', time: '3 dias atrás, 10:00', text: 'Carpete manchado e rasgado.' },
      { type: 'system', sender: 'Sistema', time: '3 dias atrás, 10:05', text: 'OS-0046 registrada. Aguardando análise e categorização.' },
      { type: 'system', sender: 'Rafael', time: '3 dias atrás, 10:30', text: 'Análise e categorização concluída. OS aprovada na triagem para prosseguimento.' },
      { type: 'system', sender: 'Rafael', time: '3 dias atrás, 11:00', text: 'Rafael solicitou visita técnica para avaliar o problema.' },
      { type: 'tech', sender: 'Equipe Manutenção', time: '3 dias atrás, 15:00', text: 'Parecer: Necessária a troca completa do carpete da sala.' },
      { type: 'system', sender: 'Rafael', time: '3 dias atrás, 15:30', text: 'Parecer enviado para aprovação da Diretoria.' },
      { type: 'system', sender: 'Diretoria', time: '2 dias atrás, 09:00', text: 'Solução aprovada pela Diretoria. Rafael iniciou cotação com fornecedores.' },
      { type: 'system', sender: 'Rafael', time: 'Ontem, 16:00', text: 'Orçamentos anexados. Aguardando aprovação da Diretoria.' }
    ]
  },
  {
    id: 'OS-0045',
    subject: 'Manutenção Preventiva dos Geradores',
    requester: 'Engenharia Predial',
    time: 'Segunda',
    status: 'Aguardando aprovação do contrato',
    type: 'Preventiva',
    region: 'Região Sul',
    sede: 'SUL1',
    sector: 'Casa de Máquinas',
    priority: 'Alta',
    history: [
      { type: 'customer', sender: 'Engenharia Predial', time: 'Segunda, 10:00', text: 'Manutenção preventiva semestral.' },
      { type: 'system', sender: 'Sistema', time: 'Segunda, 10:05', text: 'OS-0045 registrada. Aguardando análise e categorização.' },
      { type: 'system', sender: 'Rafael', time: 'Segunda, 10:30', text: 'Análise e categorização concluída. OS aprovada na triagem para prosseguimento.' },
      { type: 'system', sender: 'Rafael', time: 'Segunda, 11:00', text: 'Rafael solicitou visita técnica para avaliar o problema.' },
      { type: 'tech', sender: 'Equipe Manutenção', time: 'Segunda, 14:00', text: 'Parecer: Realizar manutenção padrão conforme manual do fabricante.' },
      { type: 'system', sender: 'Rafael', time: 'Segunda, 14:30', text: 'Parecer enviado para aprovação da Diretoria.' },
      { type: 'system', sender: 'Diretoria', time: 'Terça, 09:00', text: 'Solução aprovada pela Diretoria. Rafael iniciou cotação com fornecedores.' },
      { type: 'system', sender: 'Rafael', time: 'Quarta, 16:00', text: 'Orçamentos anexados. Aguardando aprovação da Diretoria.' },
      { type: 'system', sender: 'Diretoria', time: 'Quinta, 10:00', text: 'Orçamento aprovado pela Diretoria (R$ 8.500,00 - PowerTech Geradores). Aguardando Pedro assinar o contrato.' }
    ]
  },
  {
    id: 'OS-0044',
    subject: 'Instalação de Ar Condicionado',
    requester: 'TI',
    time: 'Semana passada',
    status: 'Aguardando Ações Preliminares',
    type: 'Melhoria',
    region: 'Região Benfica',
    sede: 'BEN1',
    sector: 'Sala de Servidores',
    priority: 'Urgente',
    history: [
      { type: 'customer', sender: 'TI', time: 'Semana passada, 09:00', text: 'Necessário novo ar condicionado para o rack extra.' },
      { type: 'system', sender: 'Sistema', time: 'Semana passada, 09:05', text: 'OS-0044 registrada. Aguardando análise e categorização.' },
      { type: 'system', sender: 'Rafael', time: 'Semana passada, 09:30', text: 'Análise e categorização concluída. OS aprovada na triagem para prosseguimento.' },
      { type: 'system', sender: 'Rafael', time: 'Semana passada, 10:00', text: 'Rafael solicitou visita técnica para avaliar o problema.' },
      { type: 'tech', sender: 'Equipe Climatização', time: 'Semana passada, 14:00', text: 'Parecer: Instalar split de 12.000 BTUs.' },
      { type: 'system', sender: 'Rafael', time: 'Semana passada, 14:30', text: 'Parecer enviado para aprovação da Diretoria.' },
      { type: 'system', sender: 'Diretoria', time: 'Semana passada, 16:00', text: 'Solução aprovada pela Diretoria. Rafael iniciou cotação com fornecedores.' },
      { type: 'system', sender: 'Rafael', time: 'Semana passada, 10:00', text: 'Orçamentos anexados. Aguardando aprovação da Diretoria.' },
      { type: 'system', sender: 'Diretoria', time: 'Semana passada, 14:00', text: 'Orçamento aprovado pela Diretoria.' },
      { type: 'system', sender: 'Pedro', time: 'Semana passada, 16:00', text: 'Contrato assinado pelo Diretor Pedro. Aguardando Rafael comprar materiais e agendar.' }
    ]
  },
  {
    id: 'OS-0043',
    subject: 'Reparo Vazamento Banheiro',
    requester: 'Limpeza',
    time: 'Semana passada',
    status: 'Em andamento',
    type: 'Corretiva',
    region: 'Região Parquelândia',
    sede: 'PQL1',
    sector: 'Banheiro Masculino 2º Andar',
    priority: 'Alta',
    history: [
      { type: 'customer', sender: 'Limpeza', time: 'Semana passada, 08:00', text: 'Vazamento forte na pia.' },
      { type: 'system', sender: 'Sistema', time: 'Semana passada, 08:05', text: 'OS-0043 registrada. Aguardando análise e categorização.' },
      { type: 'system', sender: 'Rafael', time: 'Semana passada, 08:30', text: 'Análise e categorização concluída. OS aprovada na triagem para prosseguimento.' },
      { type: 'system', sender: 'Rafael', time: 'Semana passada, 09:00', text: 'Rafael solicitou visita técnica para avaliar o problema.' },
      { type: 'tech', sender: 'Equipe Hidráulica', time: 'Semana passada, 11:00', text: 'Parecer: Trocar sifão e vedação.' },
      { type: 'system', sender: 'Rafael', time: 'Semana passada, 11:30', text: 'Parecer enviado para aprovação da Diretoria.' },
      { type: 'system', sender: 'Diretoria', time: 'Semana passada, 14:00', text: 'Solução aprovada pela Diretoria. Rafael iniciou cotação com fornecedores.' },
      { type: 'system', sender: 'Rafael', time: 'Semana passada, 16:00', text: 'Orçamentos anexados. Aguardando aprovação da Diretoria.' },
      { type: 'system', sender: 'Diretoria', time: 'Semana passada, 10:00', text: 'Orçamento aprovado pela Diretoria.' },
      { type: 'system', sender: 'Pedro', time: 'Semana passada, 14:00', text: 'Contrato assinado pelo Diretor Pedro.' },
      { type: 'system', sender: 'Rafael', time: 'Semana passada, 16:00', text: 'Ações preliminares concluídas.' },
      { type: 'system', sender: 'Sistema', time: 'Hoje, 09:00', text: 'Equipe de encanadores no local realizando o reparo.' }
    ]
  },
  {
    id: 'OS-0042',
    subject: 'Troca de Fechadura',
    requester: 'Recepção',
    time: 'Semana passada',
    status: 'Aguardando aprovação da manutenção',
    type: 'Corretiva',
    region: 'Região Aldeota',
    sede: 'BS',
    sector: 'Porta Lateral',
    priority: 'Trivial',
    history: [
      { type: 'customer', sender: 'Recepção', time: 'Semana passada, 10:00', text: 'Fechadura emperrando.' },
      { type: 'system', sender: 'Sistema', time: 'Semana passada, 10:05', text: 'OS-0042 registrada. Aguardando análise e categorização.' },
      { type: 'system', sender: 'Rafael', time: 'Semana passada, 10:30', text: 'Análise e categorização concluída. OS aprovada na triagem para prosseguimento.' },
      { type: 'system', sender: 'Rafael', time: 'Semana passada, 11:00', text: 'Rafael solicitou visita técnica para avaliar o problema.' },
      { type: 'tech', sender: 'Equipe Manutenção', time: 'Semana passada, 14:00', text: 'Parecer: Substituição do miolo da fechadura.' },
      { type: 'system', sender: 'Rafael', time: 'Semana passada, 14:30', text: 'Parecer enviado para aprovação da Diretoria.' },
      { type: 'system', sender: 'Diretoria', time: 'Semana passada, 16:00', text: 'Solução aprovada pela Diretoria. Rafael iniciou cotação com fornecedores.' },
      { type: 'system', sender: 'Rafael', time: 'Semana passada, 10:00', text: 'Orçamentos anexados. Aguardando aprovação da Diretoria.' },
      { type: 'system', sender: 'Diretoria', time: 'Semana passada, 14:00', text: 'Orçamento aprovado pela Diretoria.' },
      { type: 'system', sender: 'Pedro', time: 'Semana passada, 16:00', text: 'Contrato assinado pelo Diretor Pedro.' },
      { type: 'system', sender: 'Rafael', time: 'Ontem, 09:00', text: 'Ações preliminares concluídas.' },
      { type: 'system', sender: 'Sistema', time: 'Ontem, 14:00', text: 'Serviço em andamento.' },
      { type: 'tech', sender: 'Rafael', time: 'Hoje, 09:00', text: 'Fechadura trocada. Aguardando solicitante validar.' }
    ]
  },
  {
    id: 'OS-0041',
    subject: 'Limpeza de Calhas',
    requester: 'Facilities',
    time: 'Mês passado',
    status: 'Aguardando pagamento',
    type: 'Preventiva',
    region: 'Região Dionísio Torres',
    sede: 'DT1',
    sector: 'Telhado',
    priority: 'Alta',
    history: [
      { type: 'customer', sender: 'Facilities', time: 'Mês passado, 08:00', text: 'Limpeza anual antes das chuvas.' },
      { type: 'system', sender: 'Sistema', time: 'Mês passado, 08:05', text: 'OS-0041 registrada. Aguardando análise e categorização.' },
      { type: 'system', sender: 'Rafael', time: 'Mês passado, 08:30', text: 'Análise e categorização concluída. OS aprovada na triagem para prosseguimento.' },
      { type: 'system', sender: 'Rafael', time: 'Mês passado, 09:00', text: 'Rafael solicitou visita técnica para avaliar o problema.' },
      { type: 'tech', sender: 'Equipe Manutenção', time: 'Mês passado, 14:00', text: 'Parecer: Limpeza padrão das calhas do telhado.' },
      { type: 'system', sender: 'Rafael', time: 'Mês passado, 14:30', text: 'Parecer enviado para aprovação da Diretoria.' },
      { type: 'system', sender: 'Diretoria', time: 'Mês passado, 16:00', text: 'Solução aprovada pela Diretoria. Rafael iniciou cotação com fornecedores.' },
      { type: 'system', sender: 'Rafael', time: 'Mês passado, 10:00', text: 'Orçamentos anexados. Aguardando aprovação da Diretoria.' },
      { type: 'system', sender: 'Diretoria', time: 'Mês passado, 14:00', text: 'Orçamento aprovado pela Diretoria.' },
      { type: 'system', sender: 'Pedro', time: 'Mês passado, 16:00', text: 'Contrato assinado pelo Diretor Pedro.' },
      { type: 'system', sender: 'Rafael', time: 'Mês passado, 09:00', text: 'Ações preliminares concluídas.' },
      { type: 'system', sender: 'Sistema', time: 'Mês passado, 10:00', text: 'Serviço em andamento.' },
      { type: 'tech', sender: 'Equipe Manutenção', time: 'Mês passado, 16:00', text: 'Limpeza concluída. Aguardando solicitante validar.' },
      { type: 'system', sender: 'Facilities', time: 'Mês passado, 17:00', text: 'Manutenção aprovada pelo solicitante. Aguardando Geovana realizar o pagamento.' }
    ]
  },
  {
    id: 'OS-0040',
    subject: 'Conserto de Cadeira',
    requester: 'RH',
    time: 'Mês passado',
    status: 'Encerrada',
    type: 'Corretiva',
    region: 'Região Sul',
    sede: 'SUL1',
    sector: 'RH',
    priority: 'Trivial',
    history: [
      { type: 'customer', sender: 'RH', time: 'Mês passado, 10:00', text: 'Roda da cadeira quebrou.' },
      { type: 'system', sender: 'Sistema', time: 'Mês passado, 10:05', text: 'OS-0040 registrada. Aguardando análise e categorização.' },
      { type: 'system', sender: 'Rafael', time: 'Mês passado, 10:30', text: 'Análise e categorização concluída. OS aprovada na triagem para prosseguimento.' },
      { type: 'system', sender: 'Rafael', time: 'Mês passado, 11:00', text: 'Rafael solicitou visita técnica para avaliar o problema.' },
      { type: 'tech', sender: 'Equipe Manutenção', time: 'Mês passado, 14:00', text: 'Parecer: Substituição do rodízio.' },
      { type: 'system', sender: 'Rafael', time: 'Mês passado, 14:30', text: 'Parecer enviado para aprovação da Diretoria.' },
      { type: 'system', sender: 'Diretoria', time: 'Mês passado, 16:00', text: 'Solução aprovada pela Diretoria. Rafael iniciou cotação com fornecedores.' },
      { type: 'system', sender: 'Rafael', time: 'Mês passado, 10:00', text: 'Orçamentos anexados. Aguardando aprovação da Diretoria.' },
      { type: 'system', sender: 'Diretoria', time: 'Mês passado, 14:00', text: 'Orçamento aprovado pela Diretoria.' },
      { type: 'system', sender: 'Pedro', time: 'Mês passado, 16:00', text: 'Contrato assinado pelo Diretor Pedro.' },
      { type: 'system', sender: 'Rafael', time: 'Mês passado, 09:00', text: 'Ações preliminares concluídas.' },
      { type: 'system', sender: 'Sistema', time: 'Mês passado, 10:00', text: 'Serviço em andamento.' },
      { type: 'tech', sender: 'Equipe Manutenção', time: 'Mês passado, 14:00', text: 'Rodízio trocado. Aguardando solicitante validar.' },
      { type: 'system', sender: 'RH', time: 'Mês passado, 15:00', text: 'Manutenção aprovada pelo solicitante. Aguardando Geovana realizar o pagamento.' },
      { type: 'system', sender: 'Geovana', time: 'Mês passado, 16:00', text: 'Pagamento realizado. OS encerrada.' }
    ]
  }
];

export default function App() {
  const [currentView, setCurrentView] = useState<ViewState>('public-form');
  const [trackingTicketId, setTrackingTicketId] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [attachmentModal, setAttachmentModal] = useState<{isOpen: boolean, title: string, type: 'image' | 'pdf'}>({isOpen: false, title: '', type: 'image'});

  const openAttachment = (title: string, type: 'image' | 'pdf') => {
    setAttachmentModal({isOpen: true, title, type});
  };

  if (currentView === 'login') {
    return <LoginView onLogin={() => setCurrentView('home')} onOpenPublicForm={() => setCurrentView('public-form')} />;
  }

  if (currentView === 'tracking') {
    return <TrackingView ticketId={trackingTicketId || 'OS-0042'} onBack={() => setCurrentView('inbox')} />;
  }

  if (currentView === 'public-form') {
    return <PublicFormView onAdminLogin={() => setCurrentView('login')} />;
  }

  return (
    <div className="flex h-screen bg-roman-bg text-roman-text-main font-sans text-[13px]">
      {/* Narrow Sidebar (Dark Stone) */}
      <aside className="w-14 bg-roman-sidebar flex flex-col items-center py-4 z-20 border-r border-stone-900">
        <div className="w-8 h-8 flex items-center justify-center mb-6 text-roman-primary">
          <Landmark size={24} />
        </div>
        <nav className="flex flex-col gap-4 w-full">
          <SidebarIcon icon={<Home size={20} />} active={currentView === 'home'} onClick={() => setCurrentView('home')} />
          <SidebarIcon icon={<Inbox size={20} />} active={currentView === 'inbox'} onClick={() => setCurrentView('inbox')} />
          <SidebarIcon icon={<Shield size={20} />} active={currentView === 'approvals'} onClick={() => setCurrentView('approvals')} title="Painel da Diretoria" />
          <SidebarIcon icon={<DollarSign size={20} />} active={currentView === 'finance'} onClick={() => setCurrentView('finance')} title="Financeiro" />
          <SidebarIcon icon={<Users size={20} />} active={currentView === 'users'} onClick={() => setCurrentView('users')} />
          <SidebarIcon icon={<BarChart2 size={20} />} active={currentView === 'kpi'} onClick={() => setCurrentView('kpi')} />
          <SidebarIcon icon={<Settings size={20} />} active={currentView === 'settings'} onClick={() => setCurrentView('settings')} />
        </nav>
        <div className="mt-auto flex flex-col gap-4 items-center">
          <div className="relative">
            <button onClick={() => setShowNotifications(!showNotifications)} className={`transition-colors ${showNotifications ? 'text-roman-primary' : 'text-white/40 hover:text-white/80'}`} title="Notificações">
              <Bell size={18} />
            </button>
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-roman-primary rounded-full"></span>
          </div>
          <button onClick={() => setCurrentView('login')} className="text-white/40 hover:text-white/80 transition-colors" title="Sair">
            <LogOut size={18} />
          </button>
          <div className="w-8 h-8 rounded-full bg-roman-sidebar-light border border-roman-primary/30 overflow-hidden" title="Logado como: Rafael">
             <img src="https://picsum.photos/seed/rafael/100/100" alt="Rafael" referrerPolicy="no-referrer" className="grayscale opacity-80" />
          </div>
        </div>
      </aside>

      {/* Notifications Panel */}
      {showNotifications && (
        <div className="absolute left-14 top-0 bottom-0 w-80 bg-roman-surface border-r border-roman-border shadow-2xl z-30 animate-in slide-in-from-left-4 flex flex-col">
          <div className="p-4 border-b border-roman-border flex justify-between items-center bg-roman-bg">
            <h3 className="font-serif text-lg text-roman-text-main">Notificações</h3>
            <button onClick={() => setShowNotifications(false)} className="text-roman-text-sub hover:text-roman-text-main"><X size={18}/></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="p-3 bg-roman-primary/5 border border-roman-primary/20 rounded-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-roman-primary animate-pulse"></span>
                <span className="text-xs font-serif italic text-roman-text-sub">Agora mesmo</span>
              </div>
              <p className="text-sm text-roman-text-main font-medium">OS-0045 Validada</p>
              <p className="text-xs text-roman-text-sub mt-1">O solicitante aprovou a manutenção dos geradores. Pronta para pagamento.</p>
            </div>
            <div className="p-3 bg-roman-bg border border-roman-border rounded-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-serif italic text-roman-text-sub">Há 2 horas</span>
              </div>
              <p className="text-sm text-roman-text-main font-medium">Orçamento Aprovado</p>
              <p className="text-xs text-roman-text-sub mt-1">Diretor Murilo aprovou o orçamento da OS-0048.</p>
            </div>
            <div className="p-3 bg-roman-bg border border-roman-border rounded-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-serif italic text-roman-text-sub">Ontem</span>
              </div>
              <p className="text-sm text-roman-text-main font-medium">Nova OS Registrada</p>
              <p className="text-xs text-roman-text-sub mt-1">Infiltração Crítica no Teto do Refeitório (OS-0050).</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {currentView === 'home' && <HomeView onNavigate={setCurrentView} />}
        {currentView === 'inbox' && <InboxView onNavigate={setCurrentView} onOpenAttachment={openAttachment} onOpenTracking={(id) => { setTrackingTicketId(id); setCurrentView('tracking'); }} />}
        {currentView === 'approvals' && <ApprovalsView onOpenAttachment={openAttachment} />}
        {currentView === 'finance' && <FinanceView onOpenAttachment={openAttachment} />}
        {currentView === 'users' && <UsersView />}
        {currentView === 'kpi' && <KpiView />}
        {currentView === 'settings' && <SettingsView />}
      </main>

      {/* Attachment Modal */}
      {attachmentModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-8 animate-in fade-in">
          <div className="bg-roman-surface w-full max-w-4xl h-[80vh] rounded-sm shadow-2xl flex flex-col overflow-hidden border border-stone-700">
            <div className="flex justify-between items-center p-4 border-b border-roman-border bg-stone-900 text-white">
              <div className="flex items-center gap-3">
                {attachmentModal.type === 'pdf' ? <FileText size={20} className="text-roman-primary" /> : <ImageIcon size={20} className="text-roman-primary" />}
                <h3 className="font-serif text-lg font-medium">{attachmentModal.title}</h3>
              </div>
              <button onClick={() => setAttachmentModal({isOpen: false, title: '', type: 'image'})} className="text-stone-400 hover:text-white transition-colors"><X size={24} /></button>
            </div>
            <div className="flex-1 bg-stone-100 flex items-center justify-center p-8 overflow-auto">
              {attachmentModal.type === 'image' ? (
                <img src="https://picsum.photos/seed/facilities/800/600" alt="Anexo" className="max-w-full max-h-full object-contain shadow-md border border-stone-300" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full max-w-2xl h-full bg-white shadow-lg border border-stone-300 p-12 flex flex-col">
                  <div className="border-b-2 border-stone-800 pb-4 mb-8 flex justify-between items-end">
                    <h1 className="text-3xl font-serif font-bold text-stone-800">ORÇAMENTO COMERCIAL</h1>
                    <span className="text-stone-500 font-mono">#DOC-2026</span>
                  </div>
                  <div className="space-y-4 flex-1">
                    <div className="h-4 bg-stone-200 w-3/4 rounded"></div>
                    <div className="h-4 bg-stone-200 w-full rounded"></div>
                    <div className="h-4 bg-stone-200 w-5/6 rounded"></div>
                    <div className="h-4 bg-stone-200 w-full rounded mt-8"></div>
                    <div className="h-32 bg-stone-100 border border-stone-200 w-full rounded mt-4 flex items-center justify-center text-stone-400 font-serif italic">Tabela de Custos Simulada</div>
                  </div>
                  <div className="mt-8 pt-8 border-t border-stone-200 flex justify-between items-center">
                    <div className="w-48 h-px bg-stone-800 relative"><span className="absolute -bottom-6 left-0 right-0 text-center text-xs text-stone-500">Assinatura do Fornecedor</span></div>
                    <div className="text-2xl font-serif font-bold text-stone-800">R$ --.---,--</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarIcon({ icon, active, onClick, title }: { icon: React.ReactNode, active?: boolean, onClick: () => void, title?: string }) {
  return (
    <div onClick={onClick} title={title} className={`w-full flex justify-center py-3 cursor-pointer relative transition-colors ${active ? 'text-roman-primary' : 'text-white/40 hover:text-white/80'}`}>
      {active && <div className="absolute left-0 top-0 bottom-0 w-1 bg-roman-primary"></div>}
      {icon}
    </div>
  );
}

// --- VIEWS ---

function LoginView({ onLogin, onOpenPublicForm }: { onLogin: () => void, onOpenPublicForm: () => void }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = () => {
    setIsLoading(true);
    setTimeout(onLogin, 1500);
  };

  return (
    <div className="h-screen w-full bg-roman-bg flex items-center justify-center relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-0 left-0 w-full h-1 bg-roman-primary"></div>
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-roman-surface rounded-full border border-roman-border opacity-50"></div>
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-roman-surface rounded-full border border-roman-border opacity-50"></div>

      <div className="w-full max-w-md bg-roman-surface border border-roman-border p-10 rounded-sm shadow-xl relative z-10">
        <div className="flex justify-center mb-6 text-roman-primary">
          <Landmark size={48} strokeWidth={1.5} />
        </div>
        <h1 className="text-3xl font-serif text-center text-roman-text-main mb-2">Sistema de Gestão</h1>
        <p className="text-center text-roman-text-sub font-serif italic mb-8">Acesso Restrito aos Gestores</p>

        <div className="space-y-5">
          <div>
            <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Identificação (E-mail)</label>
            <input type="email" defaultValue="rafael@empresa.com" className="w-full border border-roman-border rounded-sm px-4 py-3 bg-roman-bg text-[14px] font-medium text-roman-text-main outline-none focus:border-roman-primary transition-colors" />
          </div>
          <div>
            <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Código de Acesso (Senha)</label>
            <input type="password" defaultValue="••••••••" className="w-full border border-roman-border rounded-sm px-4 py-3 bg-roman-bg text-[14px] font-medium text-roman-text-main outline-none focus:border-roman-primary transition-colors" />
          </div>
          <button onClick={handleLogin} disabled={isLoading} className="w-full bg-roman-sidebar hover:bg-stone-900 text-white py-3 rounded-sm font-serif tracking-wide text-base transition-colors flex items-center justify-center gap-2 mt-4 disabled:opacity-70">
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <>Acessar o Sistema <ArrowRight size={18} /></>}
          </button>
        </div>

        {/* Public Form Link */}
        <div className="mt-8 pt-6 border-t border-roman-border text-center">
          <p className="text-roman-text-sub text-xs font-serif italic mb-3">É um colaborador e precisa solicitar manutenção?</p>
          <button onClick={onOpenPublicForm} className="text-roman-primary hover:text-roman-primary/80 font-medium text-[13px] transition-colors flex items-center justify-center gap-2 w-full border border-roman-primary/30 py-2 rounded-sm bg-roman-primary/5">
            <ArrowLeft size={16} /> Voltar para o Formulário Público
          </button>
        </div>
      </div>
    </div>
  );
}

// --- PUBLIC FORM VIEW ---
function PublicFormView({ onAdminLogin }: { onAdminLogin: () => void }) {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSubmitted(true);
    }, 2000);
  };

  if (isSubmitted) {
    return (
      <div className="h-screen w-full bg-roman-bg flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-roman-surface border border-roman-border p-10 rounded-sm shadow-sm text-center">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={32} />
          </div>
          <h2 className="text-2xl font-serif text-roman-text-main mb-2">OS Registrada com Sucesso!</h2>
          <p className="text-roman-text-sub mb-6 leading-relaxed">
            Sua solicitação foi enviada para a equipe de triagem. O número da sua OS é <strong className="text-roman-text-main">#OS-0043</strong>.
          </p>
          <div className="bg-roman-bg border border-roman-border p-4 rounded-sm mb-8 text-left">
            <p className="text-xs text-roman-text-sub font-serif italic mb-2">Enviamos um link de acompanhamento para o seu e-mail. Você também pode acessar por aqui:</p>
            <div className="text-roman-primary font-mono text-xs break-all bg-roman-primary/5 p-2 border border-roman-primary/20 rounded-sm">
              sistema.com/acompanhar/a7b2c9...
            </div>
          </div>
          <button onClick={() => setIsSubmitted(false)} className="w-full bg-roman-sidebar hover:bg-stone-900 text-white py-3 rounded-sm font-medium transition-colors">
            Abrir Nova OS
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-roman-bg overflow-y-auto py-12 px-4 relative">
      <button onClick={onAdminLogin} className="absolute top-6 right-6 flex items-center gap-2 text-roman-text-sub hover:text-roman-text-main font-medium transition-colors text-sm">
        <Lock size={14} /> Acesso Restrito
      </button>

      <div className="max-w-2xl mx-auto bg-roman-surface border border-roman-border rounded-sm shadow-sm overflow-hidden">
        <div className="bg-roman-sidebar p-8 text-center border-b border-stone-900">
          <div className="flex justify-center mb-4 text-roman-primary">
            <Landmark size={36} strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-serif text-white mb-1">Nova Ordem de Serviço</h1>
          <p className="text-white/60 font-serif italic">Preencha os dados abaixo para solicitar uma manutenção.</p>
        </div>

        <div className="p-8 space-y-6">
          {/* Identificação */}
          <div className="pb-6 border-b border-roman-border">
            <h3 className="font-serif text-lg text-roman-text-main mb-4">Sua Identificação</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Seu Nome</label>
                <input type="text" placeholder="Ex: João Silva" className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary" />
              </div>
              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Seu E-mail (Para receber o link)</label>
                <input type="email" placeholder="joao@empresa.com" className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary" />
              </div>
            </div>
          </div>

          {/* Dados do Problema */}
          <div className="pb-6 border-b border-roman-border space-y-4">
            <h3 className="font-serif text-lg text-roman-text-main mb-4">Dados do Problema</h3>
            
            <div>
              <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Assunto (Apenas 1 problema por formulário)</label>
              <input type="text" placeholder="Ex: Lâmpada queimada na recepção" className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary" />
            </div>

            <div>
              <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Descrição Curta (Até 10 palavras)</label>
              <textarea placeholder="Resuma o problema brevemente..." className="w-full h-20 border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary resize-none"></textarea>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Tipo de Manutenção</label>
                <select className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary">
                  <option>Selecione...</option>
                  <option>Corretiva (Conserto)</option>
                  <option>Preventiva</option>
                  <option>Melhoria</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Setor / Local exato</label>
                <input type="text" placeholder="Ex: Recepção principal" className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary" />
              </div>
              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Região</label>
                <select className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary">
                  <option>Selecione...</option>
                  <option>Região Dionísio Torres</option>
                  <option>Região Aldeota</option>
                  <option>Região Parquelândia</option>
                  <option>Região Sul</option>
                  <option>Região Benfica</option>
                  <option>Universidade</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Sede</label>
                <select className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary">
                  <option>Selecione...</option>
                  <option>DT1</option>
                  <option>DT2</option>
                  <option>PDT</option>
                  <option>IDIOMAS</option>
                  <option>BS</option>
                  <option>SP</option>
                  <option>PNV</option>
                  <option>PQL1</option>
                  <option>PQL2</option>
                  <option>PJV</option>
                  <option>SUL1</option>
                  <option>SUL2</option>
                  <option>SUL3</option>
                  <option>PSUL</option>
                  <option>BN</option>
                  <option>ALD</option>
                  <option>PQL3</option>
                  <option>EUS</option>
                  <option>DL</option>
                </select>
              </div>
            </div>
          </div>

          {/* Fotos */}
          <div>
            <h3 className="font-serif text-lg text-roman-text-main mb-2">Fotos do Problema</h3>
            <p className="text-xs text-roman-text-sub mb-4">Por favor, anexe as 3 imagens solicitadas para facilitar a triagem.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-dashed border-roman-border hover:border-roman-primary bg-roman-bg rounded-sm p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-colors h-32">
                <UploadCloud size={24} className="text-roman-primary mb-2" />
                <span className="text-xs font-medium text-roman-text-main">1. Foto de Perto</span>
                <span className="text-[10px] text-roman-text-sub mt-1">Detalhe do problema</span>
              </div>
              <div className="border border-dashed border-roman-border hover:border-roman-primary bg-roman-bg rounded-sm p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-colors h-32">
                <UploadCloud size={24} className="text-roman-primary mb-2" />
                <span className="text-xs font-medium text-roman-text-main">2. Foto de Longe</span>
                <span className="text-[10px] text-roman-text-sub mt-1">Mostrando o local</span>
              </div>
              <div className="border border-dashed border-roman-border hover:border-roman-primary bg-roman-bg rounded-sm p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-colors h-32">
                <UploadCloud size={24} className="text-roman-primary mb-2" />
                <span className="text-xs font-medium text-roman-text-main">3. Foto Adicional</span>
                <span className="text-[10px] text-roman-text-sub mt-1">Qualquer imagem pertinente</span>
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="pt-6 border-t border-roman-border flex justify-end">
            <button 
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="bg-roman-primary hover:bg-roman-primary-hover text-white px-8 py-3 rounded-sm font-serif tracking-wide text-base transition-colors flex items-center gap-2 disabled:opacity-70"
            >
              {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <>Registrar Ordem de Serviço <ArrowRight size={18} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- APPROVALS VIEW (DIRECTORS) ---
function ApprovalsView({ onOpenAttachment }: { onOpenAttachment: (title: string, type: 'image' | 'pdf') => void }) {
  const [activeTab, setActiveTab] = useState<'new_os' | 'solutions' | 'budgets' | 'contracts'>('new_os');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [attachContractModalId, setAttachContractModalId] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);

  const handleApprove = (id: string) => {
    setProcessingId(id);
    setTimeout(() => {
      setProcessingId(null);
      setCompletedIds(prev => [...prev, id]);
    }, 1500);
  };

  const handleReject = () => {
    if (!rejectModalId) return;
    setProcessingId(rejectModalId);
    setRejectModalId(null);
    setTimeout(() => {
      setProcessingId(null);
      setCompletedIds(prev => [...prev, rejectModalId]);
      setRejectReason('');
    }, 1500);
  };

  const handleAttachContract = () => {
    if (!attachContractModalId) return;
    setProcessingId(attachContractModalId);
    setAttachContractModalId(null);
    setTimeout(() => {
      setProcessingId(null);
      setCompletedIds(prev => [...prev, attachContractModalId]);
      setAttachedFile(null);
    }, 1500);
  };

  const newOSList = [
    { id: 'OS-0050', subject: 'Infiltração Crítica no Teto do Refeitório', requester: 'Marcos Silva (Facilities)', date: 'Hoje, 08:15', description: 'Identificamos uma infiltração severa no teto do refeitório, próximo à área de cocção. Há risco de gotejamento nos equipamentos elétricos. Solicitamos intervenção imediata para evitar curtos-circuitos.', viewingBy: null }
  ];

  const solutions = [
    { id: 'OS-0049', subject: 'Substituição do No-Break Principal (Data Center)', requester: 'Ana Paula (TI)', date: 'Hoje, 10:15', technicalOpinion: 'Análise Técnica: As baterias do banco principal esgotaram sua vida útil (5 anos). O equipamento atual está descontinuado pelo fabricante. Recomendamos a substituição completa por um modelo modular de 40kVA. Risco de indisponibilidade em caso de queda de energia.', viewingBy: null }
  ];

  const budgets = [
    { 
      id: 'OS-0048', 
      subject: 'Modernização do Controle de Acesso (Catracas)', 
      requester: 'Carlos (Segurança Corporativa)', 
      date: 'Ontem, 14:30',
      viewingBy: null,
      quotes: [
        { id: 1, vendor: 'SecureTech Soluções', value: 'R$ 42.500,00', recommended: true },
        { id: 2, vendor: 'Acesso Fácil LTDA', value: 'R$ 45.100,00', recommended: false },
        { id: 3, vendor: 'Gama Security', value: 'R$ 48.200,00', recommended: false },
      ]
    },
    { 
      id: 'OS-0047', 
      subject: 'Impermeabilização da Laje Superior', 
      requester: 'Engenharia Predial', 
      date: 'Ontem, 16:45',
      viewingBy: 'Diretor Murilo',
      quotes: [
        { id: 1, vendor: 'Vedação & Cia', value: 'R$ 28.200,00', recommended: true },
        { id: 2, vendor: 'Construtora Alfa', value: 'R$ 31.500,00', recommended: false },
        { id: 3, vendor: 'Impermeabiliza Brasil', value: 'R$ 33.000,00', recommended: false },
      ]
    },
  ];

  const contracts = [
    { id: 'OS-0043', subject: 'Modernização dos Elevadores (Torre A)', requester: 'Administração', value: 'R$ 245.000,00', vendor: 'Atlas Schindler', date: '22/05/2026', viewingBy: 'Diretor Pedro' },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8 border-b border-roman-border pb-4 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Painel da Diretoria</h1>
            <p className="text-roman-text-sub font-serif italic">Aprovações rápidas de orçamentos e assinaturas de contratos.</p>
          </div>
          <div className="flex bg-roman-surface border border-roman-border rounded-sm p-1 shadow-sm overflow-x-auto hide-scrollbar">
            <button 
              onClick={() => setActiveTab('new_os')}
              className={`px-4 py-2 text-sm font-medium rounded-sm transition-colors whitespace-nowrap ${activeTab === 'new_os' ? 'bg-roman-primary/10 text-roman-primary' : 'text-roman-text-sub hover:text-roman-text-main'}`}
            >
              Novas OS ({newOSList.length})
            </button>
            <button 
              onClick={() => setActiveTab('solutions')}
              className={`px-4 py-2 text-sm font-medium rounded-sm transition-colors whitespace-nowrap ${activeTab === 'solutions' ? 'bg-roman-primary/10 text-roman-primary' : 'text-roman-text-sub hover:text-roman-text-main'}`}
            >
              Soluções ({solutions.length})
            </button>
            <button 
              onClick={() => setActiveTab('budgets')}
              className={`px-4 py-2 text-sm font-medium rounded-sm transition-colors whitespace-nowrap ${activeTab === 'budgets' ? 'bg-roman-primary/10 text-roman-primary' : 'text-roman-text-sub hover:text-roman-text-main'}`}
            >
              Orçamentos ({budgets.length})
            </button>
            <button 
              onClick={() => setActiveTab('contracts')}
              className={`px-4 py-2 text-sm font-medium rounded-sm transition-colors whitespace-nowrap ${activeTab === 'contracts' ? 'bg-roman-primary/10 text-roman-primary' : 'text-roman-text-sub hover:text-roman-text-main'}`}
            >
              Contratos ({contracts.length})
            </button>
          </div>
        </header>

        <div className="space-y-6">
          {activeTab === 'new_os' && newOSList.map((os) => {
            if (completedIds.includes(os.id)) {
              return (
                <div key={os.id} className="bg-green-50 border border-green-200 rounded-sm p-6 flex items-center justify-center gap-3 text-green-700 shadow-sm animate-in fade-in duration-500">
                  <CheckCircle size={24} />
                  <span className="font-medium text-lg font-serif">Ação concluída para a {os.id}</span>
                </div>
              );
            }

            return (
              <div key={os.id} className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm hover:border-roman-primary/30 transition-colors relative overflow-hidden">
                {processingId === os.id && (
                  <div className="absolute inset-0 bg-roman-surface/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-sm">
                    <Loader2 size={32} className="text-roman-primary animate-spin mb-4" />
                    <span className="font-serif text-roman-text-main font-medium">Processando decisão...</span>
                  </div>
                )}
                <div className="flex items-center justify-between mb-4 border-b border-roman-border pb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-roman-primary font-serif italic text-sm">{os.id}</span>
                      <span className="text-xs text-roman-text-sub font-medium px-2 py-0.5 bg-roman-bg border border-roman-border rounded-sm">Aguardando Triagem (Diretoria)</span>
                    </div>
                    <h3 className="text-xl font-serif text-roman-text-main">{os.subject}</h3>
                    <p className="text-sm text-roman-text-sub">Solicitante: {os.requester} • Enviado: {os.date}</p>
                  </div>
                </div>
                <div className="bg-roman-bg border border-roman-border rounded-sm p-4 mb-6">
                  <h4 className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2 font-bold flex items-center gap-2"><FileText size={14}/> Descrição do Problema</h4>
                  <p className="text-sm text-roman-text-main leading-relaxed">{os.description}</p>
                  <button onClick={() => onOpenAttachment(`Fotos: ${os.subject}`, 'image')} className="mt-3 flex items-center gap-2 text-roman-primary hover:underline text-xs font-medium">
                    <ImageIcon size={14} /> Ver Fotos Anexadas
                  </button>
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setRejectModalId(os.id)} className="px-6 py-2 border border-red-200 text-red-700 hover:bg-red-50 rounded-sm font-medium transition-colors text-sm">
                    Reprovar (Cancelar OS)
                  </button>
                  <button onClick={() => handleApprove(os.id)} className="px-6 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm flex items-center gap-2">
                    <CheckCircle size={16} /> Aprovar (Enviar para Rafael)
                  </button>
                </div>
              </div>
            );
          })}

          {activeTab === 'solutions' && solutions.map((s) => {
            if (completedIds.includes(s.id)) {
              return (
                <div key={s.id} className="bg-green-50 border border-green-200 rounded-sm p-6 flex items-center justify-center gap-3 text-green-700 shadow-sm animate-in fade-in duration-500">
                  <CheckCircle size={24} />
                  <span className="font-medium text-lg font-serif">Solução aprovada para a {s.id}</span>
                </div>
              );
            }

            return (
              <div key={s.id} className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm hover:border-roman-primary/30 transition-colors relative overflow-hidden">
                {processingId === s.id && (
                  <div className="absolute inset-0 bg-roman-surface/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-sm">
                    <Loader2 size={32} className="text-roman-primary animate-spin mb-4" />
                    <span className="font-serif text-roman-text-main font-medium">Processando decisão...</span>
                  </div>
                )}
                <div className="flex items-center justify-between mb-4 border-b border-roman-border pb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-roman-primary font-serif italic text-sm">{s.id}</span>
                      <span className="text-xs text-roman-text-sub font-medium px-2 py-0.5 bg-roman-bg border border-roman-border rounded-sm">Aguardando Aprovação da Solução</span>
                    </div>
                    <h3 className="text-xl font-serif text-roman-text-main">{s.subject}</h3>
                    <p className="text-sm text-roman-text-sub">Solicitante: {s.requester} • Parecer emitido: {s.date}</p>
                  </div>
                </div>
                <div className="bg-roman-bg border border-roman-border rounded-sm p-4 mb-6">
                  <h4 className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2 font-bold flex items-center gap-2"><FileText size={14}/> Parecer Técnico</h4>
                  <p className="text-sm text-roman-text-main leading-relaxed">{s.technicalOpinion}</p>
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setRejectModalId(s.id)} className="px-6 py-2 border border-red-200 text-red-700 hover:bg-red-50 rounded-sm font-medium transition-colors text-sm">
                    Reprovar Solução (Arquivar)
                  </button>
                  <button onClick={() => handleApprove(s.id)} className="px-6 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm flex items-center gap-2">
                    <CheckCircle size={16} /> Aprovar (Ir para Cotação)
                  </button>
                </div>
              </div>
            );
          })}

          {activeTab === 'budgets' && budgets.map((b) => {
            if (completedIds.includes(b.id)) {
              return (
                <div key={b.id} className="bg-green-50 border border-green-200 rounded-sm p-6 flex items-center justify-center gap-3 text-green-700 shadow-sm animate-in fade-in duration-500">
                  <CheckCircle size={24} />
                  <span className="font-medium text-lg font-serif">Ação concluída para a {b.id}</span>
                </div>
              );
            }

            return (
            <div key={b.id} className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm hover:border-roman-primary/30 transition-colors relative overflow-hidden">
              {processingId === b.id && (
                <div className="absolute inset-0 bg-roman-surface/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-sm">
                  <Loader2 size={32} className="text-roman-primary animate-spin mb-4" />
                  <span className="font-serif text-roman-text-main font-medium">Processando decisão...</span>
                </div>
              )}
              <div className="flex items-center justify-between mb-4 border-b border-roman-border pb-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-roman-primary font-serif italic text-sm">{b.id}</span>
                    <span className="text-xs text-roman-text-sub font-medium px-2 py-0.5 bg-roman-bg border border-roman-border rounded-sm">Aguardando Aprovação</span>
                    {b.viewingBy && (
                      <span className="text-xs font-medium px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-sm flex items-center gap-1.5 shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                        Em análise por {b.viewingBy}
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-serif text-roman-text-main">{b.subject}</h3>
                  <p className="text-sm text-roman-text-sub">Solicitante: {b.requester} • Enviado: {b.date}</p>
                </div>
                <button onClick={() => setRejectModalId(b.id)} className="px-4 py-2 border border-red-200 text-red-700 hover:bg-red-50 rounded-sm font-medium transition-colors text-sm flex items-center gap-2">
                  Reprovar Todas (Nova Cotação)
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {b.quotes.map((q) => (
                  <div key={q.id} className={`border rounded-sm p-4 flex flex-col ${q.recommended ? 'border-roman-primary bg-roman-primary/5' : 'border-roman-border bg-roman-bg'}`}>
                    {q.recommended && <div className="text-[10px] font-serif uppercase tracking-widest text-roman-primary mb-2 font-bold flex items-center gap-1"><CheckCircle size={12}/> Recomendado pelo Gestor</div>}
                    <div className="text-sm text-roman-text-sub mb-1">{q.vendor}</div>
                    <div className="text-2xl font-serif text-roman-text-main mb-4">{q.value}</div>
                    
                    <div className="mt-auto flex flex-col gap-2">
                      <button onClick={() => onOpenAttachment(`Orçamento: ${q.vendor}`, 'pdf')} className="flex items-center justify-center gap-2 text-roman-text-sub hover:text-roman-text-main text-xs font-medium border border-roman-border bg-roman-surface py-1.5 rounded-sm transition-colors">
                        <FileText size={14} /> Ver PDF
                      </button>
                      <button onClick={() => handleApprove(b.id)} className="w-full py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm">
                        Aprovar Esta Opção
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )})}

          {activeTab === 'contracts' && contracts.map((c) => {
            if (completedIds.includes(c.id)) {
              return (
                <div key={c.id} className="bg-green-50 border border-green-200 rounded-sm p-6 flex items-center justify-center gap-3 text-green-700 shadow-sm animate-in fade-in duration-500">
                  <CheckCircle size={24} />
                  <span className="font-medium text-lg font-serif">Contrato assinado e anexado com sucesso para a {c.id}</span>
                </div>
              );
            }
            return (
            <div key={c.id} className="bg-roman-parchment border border-roman-parchment-border rounded-sm p-6 flex flex-col md:flex-row gap-6 items-start md:items-center shadow-sm relative overflow-hidden">
              {processingId === c.id && (
                <div className="absolute inset-0 bg-roman-parchment/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-sm">
                  <Loader2 size={32} className="text-roman-primary animate-spin mb-4" />
                  <span className="font-serif text-roman-text-main font-medium">Processando assinatura...</span>
                </div>
              )}
              {c.viewingBy && (
                <div className="absolute top-0 left-0 w-1 h-full bg-amber-400"></div>
              )}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-stone-800 font-serif italic text-sm">{c.id}</span>
                  <span className="text-xs text-stone-600 font-medium px-2 py-0.5 bg-white/50 border border-stone-300 rounded-sm">Aguardando Assinatura</span>
                  {c.viewingBy && (
                    <span className="text-xs font-medium px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded-sm flex items-center gap-1.5 shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                      Sendo revisado por {c.viewingBy}
                    </span>
                  )}
                  <span className="text-xs text-stone-500 ml-auto">{c.date}</span>
                </div>
                <h3 className="text-xl font-serif text-stone-900 mb-1">{c.subject}</h3>
                <p className="text-sm text-stone-600 mb-4">Solicitante: {c.requester} • Contratada: {c.vendor}</p>
                
                <button onClick={() => onOpenAttachment(`Minuta: ${c.vendor}`, 'pdf')} className="flex items-center gap-2 text-stone-800 hover:underline text-sm font-medium">
                  <FileText size={16} /> Ler Minuta do Contrato (PDF)
                </button>
              </div>
              
              <div className="w-full md:w-auto flex flex-col items-end gap-4 border-t md:border-t-0 md:border-l border-stone-300 pt-4 md:pt-0 md:pl-6">
                <div className="text-right">
                  <div className="text-[10px] font-serif uppercase tracking-widest text-stone-500 mb-1">Valor do Contrato</div>
                  <div className="text-2xl font-serif text-stone-900">{c.value}</div>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                  <button className="flex-1 md:flex-none px-4 py-2 border border-stone-300 text-stone-700 hover:bg-white/50 rounded-sm font-medium transition-colors text-sm">
                    Revisar
                  </button>
                  <button onClick={() => setAttachContractModalId(c.id)} className="flex-1 md:flex-none px-6 py-2 bg-roman-primary hover:bg-roman-primary-hover text-white rounded-sm font-medium transition-colors text-sm flex items-center justify-center gap-2">
                    <Shield size={16} /> Assinar Contrato
                  </button>
                </div>
              </div>
            </div>
          )})}

          {activeTab === 'contracts' && contracts.length === 0 && (
            <div className="text-center py-12 border border-dashed border-roman-border rounded-sm">
              <Shield size={32} className="mx-auto text-roman-border mb-4" />
              <p className="text-roman-text-sub font-serif italic">Nenhum contrato pendente de assinatura no momento.</p>
            </div>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      {rejectModalId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-roman-surface border border-roman-border rounded-sm shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-roman-border bg-roman-bg">
              <h3 className="font-serif text-lg text-roman-text-main font-medium">Reprovar Orçamentos</h3>
              <button onClick={() => setRejectModalId(null)} className="text-roman-text-sub hover:text-roman-text-main"><X size={20} /></button>
            </div>
            <div className="p-6">
              <p className="text-sm text-roman-text-sub mb-4">Por favor, informe o motivo da reprovação para que o gestor possa buscar novas opções adequadas.</p>
              <textarea 
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Ex: Valores acima do teto estipulado para este trimestre..."
                className="w-full h-32 border border-roman-border rounded-sm p-3 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-red-400 resize-none mb-6"
              ></textarea>
              <div className="flex justify-end gap-3">
                <button onClick={() => setRejectModalId(null)} className="px-4 py-2 border border-roman-border text-roman-text-main hover:bg-roman-bg rounded-sm font-medium transition-colors text-sm">
                  Cancelar
                </button>
                <button 
                  onClick={handleReject}
                  disabled={!rejectReason.trim()}
                  className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-sm font-medium transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Confirmar Reprovação
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Attach Contract Modal */}
      {attachContractModalId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-roman-surface border border-roman-border rounded-sm shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-roman-border bg-roman-bg">
              <h3 className="font-serif text-lg text-roman-text-main font-medium">Anexar Contrato Assinado</h3>
              <button onClick={() => setAttachContractModalId(null)} className="text-roman-text-sub hover:text-roman-text-main"><X size={20} /></button>
            </div>
            <div className="p-6">
              <p className="text-sm text-roman-text-sub mb-4">Faça o upload do contrato devidamente assinado para prosseguir com a OS.</p>
              
              <div className="border-2 border-dashed border-roman-border rounded-sm p-8 text-center bg-roman-bg mb-6 relative hover:bg-roman-border-light transition-colors cursor-pointer">
                <input 
                  type="file" 
                  accept=".pdf" 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      setAttachedFile(e.target.files[0]);
                    }
                  }}
                />
                <FileText size={32} className="mx-auto text-roman-primary mb-3" />
                {attachedFile ? (
                  <div className="text-roman-text-main font-medium text-sm">{attachedFile.name}</div>
                ) : (
                  <>
                    <div className="text-roman-text-main font-medium text-sm mb-1">Clique para selecionar ou arraste o arquivo</div>
                    <div className="text-xs text-roman-text-sub">Apenas arquivos PDF</div>
                  </>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={() => setAttachContractModalId(null)} className="px-4 py-2 border border-roman-border text-roman-text-main hover:bg-roman-bg rounded-sm font-medium transition-colors text-sm">
                  Cancelar
                </button>
                <button 
                  onClick={handleAttachContract}
                  disabled={!attachedFile}
                  className="px-6 py-2 bg-roman-primary hover:bg-roman-primary-hover text-white rounded-sm font-medium transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <CheckCircle size={16} /> Confirmar e Assinar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- FINANCE VIEW (GEOVANA) ---
function FinanceView({ onOpenAttachment }: { onOpenAttachment: (title: string, type: 'image' | 'pdf') => void }) {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<string[]>([]);

  const payments = [
    { id: 'OS-0040', subject: 'Troca do Carpete (Sala de Reuniões)', vendor: 'Decor Interiores', value: 'R$ 12.400,00', date: 'Aprovado hoje, 09:00' },
    { id: 'OS-0039', subject: 'Pintura Epóxi do Estacionamento Subsolo', vendor: 'Tintas Industriais S.A.', value: 'R$ 38.500,00', date: 'Ontem, 14:20' }
  ];

  const handlePay = (id: string) => {
    setProcessingId(id);
    setTimeout(() => {
      setProcessingId(null);
      setCompletedIds(prev => [...prev, id]);
    }, 1500);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8 border-b border-roman-border pb-4">
          <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Painel Financeiro</h1>
          <p className="text-roman-text-sub font-serif italic">Gestão de pagamentos de Ordens de Serviço concluídas e validadas.</p>
        </header>

        <div className="space-y-4">
          {payments.map(p => {
            if (completedIds.includes(p.id)) {
              return (
                <div key={p.id} className="bg-green-50 border border-green-200 rounded-sm p-6 flex items-center justify-center gap-3 text-green-700 shadow-sm animate-in fade-in duration-500">
                  <CheckCircle size={24} />
                  <span className="font-medium text-lg font-serif">Pagamento confirmado para a {p.id}</span>
                </div>
              );
            }

            return (
              <div key={p.id} className="bg-roman-surface border border-roman-border rounded-sm p-6 flex flex-col md:flex-row gap-6 items-start md:items-center shadow-sm relative overflow-hidden hover:border-roman-primary/30 transition-colors">
                {processingId === p.id && (
                  <div className="absolute inset-0 bg-roman-surface/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-sm">
                    <Loader2 size={32} className="text-roman-primary animate-spin mb-4" />
                    <span className="font-serif text-roman-text-main font-medium">Processando pagamento...</span>
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-roman-primary font-serif italic text-sm">{p.id}</span>
                    <span className="text-xs text-roman-text-sub font-medium px-2 py-0.5 bg-roman-bg border border-roman-border rounded-sm">Aguardando Pagamento</span>
                  </div>
                  <h3 className="text-xl font-serif text-roman-text-main mb-1">{p.subject}</h3>
                  <p className="text-sm text-roman-text-sub mb-4">Fornecedor: {p.vendor} • Validação: {p.date}</p>
                  
                  <button onClick={() => onOpenAttachment(`Nota Fiscal: ${p.vendor}`, 'pdf')} className="flex items-center gap-2 text-roman-primary hover:underline text-sm font-medium">
                    <FileText size={16} /> Ver Nota Fiscal / Recibo
                  </button>
                </div>
                
                <div className="w-full md:w-auto flex flex-col items-end gap-4 border-t md:border-t-0 md:border-l border-roman-border pt-4 md:pt-0 md:pl-6">
                  <div className="text-right">
                    <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Valor a Pagar</div>
                    <div className="text-2xl font-serif text-roman-text-main">{p.value}</div>
                  </div>
                  <button onClick={() => handlePay(p.id)} className="w-full px-6 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm flex items-center justify-center gap-2">
                    <DollarSign size={16} /> Confirmar Pagamento
                  </button>
                </div>
              </div>
            );
          })}
          {payments.length === 0 && (
            <div className="text-center py-12 border border-dashed border-roman-border rounded-sm">
              <CheckCircle size={32} className="mx-auto text-roman-border mb-4" />
              <p className="text-roman-text-sub font-serif italic">Nenhum pagamento pendente no momento.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- OTHER VIEWS ---

function HomeView({ onNavigate }: { onNavigate: (view: ViewState) => void }) {
  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Olá, Rafael</h1>
          <p className="text-roman-text-sub font-serif italic">Aqui está o resumo das suas responsabilidades de hoje.</p>
        </header>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <StatCard title="Novas OS" value="3" highlight onClick={() => onNavigate('inbox')} />
          <StatCard title="Aguardando Orçamento" value="5" />
          <StatCard title="Aguardando Aprovação" value="2" />
          <StatCard title="OS Concluídas (Mês)" value="42" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Activity */}
          <div className="lg:col-span-2 bg-roman-surface border border-roman-border rounded-sm p-6">
            <h2 className="font-serif text-lg font-medium text-roman-text-main mb-4 border-b border-roman-border pb-2">Atividade Recente</h2>
            <div className="space-y-4">
              <ActivityItem time="10:42" title="Nova OS Registrada" desc="Vazamento no Ar Condicionado (João)" />
              <ActivityItem time="09:15" title="Orçamento Aprovado" desc="Diretor Leonardo aprovou orçamento da OS-0038" />
              <ActivityItem time="Ontem" title="Parecer Técnico Recebido" desc="Equipe Elétrica respondeu sobre a OS-0041" />
              <ActivityItem time="Ontem" title="Pagamento Confirmado" desc="Geovana confirmou pagamento da OS-0035" />
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-roman-surface border border-roman-border rounded-sm p-6">
            <h2 className="font-serif text-lg font-medium text-roman-text-main mb-4 border-b border-roman-border pb-2">Ações Rápidas</h2>
            <div className="space-y-3">
              <button onClick={() => onNavigate('inbox')} className="w-full text-left px-4 py-3 border border-roman-border rounded-sm hover:border-roman-primary hover:bg-roman-primary/5 transition-colors flex items-center gap-3">
                <Plus size={18} className="text-roman-primary" />
                <span className="font-medium">Registrar Nova OS</span>
              </button>
              <button onClick={() => onNavigate('users')} className="w-full text-left px-4 py-3 border border-roman-border rounded-sm hover:border-roman-primary hover:bg-roman-primary/5 transition-colors flex items-center gap-3">
                <Users size={18} className="text-roman-primary" />
                <span className="font-medium">Gerenciar Equipes</span>
              </button>
              <button onClick={() => onNavigate('kpi')} className="w-full text-left px-4 py-3 border border-roman-border rounded-sm hover:border-roman-primary hover:bg-roman-primary/5 transition-colors flex items-center gap-3">
                <BarChart2 size={18} className="text-roman-primary" />
                <span className="font-medium">Ver Relatórios</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, highlight, onClick }: { title: string, value: string, highlight?: boolean, onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`p-5 border rounded-sm cursor-pointer transition-colors ${highlight ? 'bg-roman-primary/5 border-roman-primary' : 'bg-roman-surface border-roman-border hover:border-roman-primary/50'}`}>
      <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2">{title}</div>
      <div className={`text-3xl font-serif ${highlight ? 'text-roman-primary' : 'text-roman-text-main'}`}>{value}</div>
    </div>
  );
}

function ActivityItem({ time, title, desc }: { time: string, title: string, desc: string }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="text-xs text-roman-text-sub font-serif italic w-12 pt-1">{time}</div>
      <div className="flex-1 pb-4 border-b border-roman-border/50">
        <div className="font-medium text-roman-text-main">{title}</div>
        <div className="text-sm text-roman-text-sub">{desc}</div>
      </div>
    </div>
  );
}

function UsersView() {
  const users = [
    { id: 1, name: 'Rafael', role: 'Gestor de OS', email: 'rafael@empresa.com', status: 'Ativo' },
    { id: 2, name: 'Leonardo', role: 'Diretor', email: 'leonardo@empresa.com', status: 'Ativo' },
    { id: 3, name: 'Murilo', role: 'Diretor', email: 'murilo@empresa.com', status: 'Ativo' },
    { id: 4, name: 'Pedro', role: 'Diretor', email: 'pedro@empresa.com', status: 'Ativo' },
    { id: 5, name: 'Fernando', role: 'Aprovador Contratos', email: 'fernando@empresa.com', status: 'Ativo' },
    { id: 6, name: 'Geovana', role: 'Financeiro', email: 'geovana@empresa.com', status: 'Ativo' },
    { id: 7, name: 'Equipe Climatização', role: 'Técnico (Interno)', email: 'clima@empresa.com', status: 'Ativo' },
    { id: 8, name: 'Elétrica José', role: 'Terceirizado', email: 'contato@eletricajose.com.br', status: 'Pendente' },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
      <div className="max-w-5xl mx-auto">
        <header className="flex justify-between items-end mb-8 border-b border-roman-border pb-4">
          <div>
            <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Usuários e Equipes</h1>
            <p className="text-roman-text-sub font-serif italic">Gestão de colaboradores, diretores e equipes terceirizadas.</p>
          </div>
          <button className="bg-roman-sidebar hover:bg-stone-900 text-white px-4 py-2 rounded-sm font-medium transition-colors flex items-center gap-2">
            <Plus size={16} /> Novo Usuário
          </button>
        </header>

        <div className="bg-roman-surface border border-roman-border rounded-sm overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-roman-bg/50 border-b border-roman-border">
                <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold">Nome / Equipe</th>
                <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold">Papel (Role)</th>
                <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold">E-mail</th>
                <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold">Status</th>
                <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-roman-border hover:bg-roman-bg/50 transition-colors">
                  <td className="p-4 font-medium text-roman-text-main">{u.name}</td>
                  <td className="p-4 text-roman-text-sub">{u.role}</td>
                  <td className="p-4 text-roman-text-sub">{u.email}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-sm text-xs font-medium ${u.status === 'Ativo' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-yellow-100 text-yellow-800 border border-yellow-200'}`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button className="text-roman-primary hover:underline font-medium">Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiView() {
  const osPorRegiao = [
    { name: 'Dionísio Torres', value: 45 },
    { name: 'Aldeota', value: 30 },
    { name: 'Parquelândia', value: 25 },
    { name: 'Sul', value: 35 },
    { name: 'Benfica', value: 15 },
    { name: 'Universidade', value: 20 },
  ];

  const tempoResolucao = [
    { name: 'Jan', dias: 4.2 },
    { name: 'Fev', dias: 3.8 },
    { name: 'Mar', dias: 3.5 },
    { name: 'Abr', dias: 3.1 },
    { name: 'Mai', dias: 2.8 },
    { name: 'Jun', dias: 2.5 },
  ];

  const custoPorSede = [
    { name: 'DT1', custo: 12500 },
    { name: 'BS', custo: 8400 },
    { name: 'SUL1', custo: 15200 },
    { name: 'PQL1', custo: 6300 },
    { name: 'ALD', custo: 9100 },
  ];

  const COLORS = ['#1a1a1a', '#4a4a4a', '#7a7a7a', '#a3a3a3', '#d4d4d4', '#e5e5e5'];

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8 border-b border-roman-border pb-4">
          <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Indicadores (KPIs)</h1>
          <p className="text-roman-text-sub font-serif italic">Métricas de desempenho e volume de Ordens de Serviço.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
            <h2 className="font-serif text-lg font-medium text-roman-text-main mb-6">Volume de OS por Região</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={osPorRegiao}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    fill="#8884d8"
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {osPorRegiao.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '2px', fontSize: '12px' }}
                    itemStyle={{ color: '#1a1a1a' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
            <h2 className="font-serif text-lg font-medium text-roman-text-main mb-6">Tempo Médio de Resolução (Dias)</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={tempoResolucao}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} dx={-10} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '2px', fontSize: '12px' }}
                    itemStyle={{ color: '#1a1a1a' }}
                  />
                  <Line type="monotone" dataKey="dias" stroke="#1a1a1a" strokeWidth={2} dot={{ r: 4, fill: '#1a1a1a' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
          <h2 className="font-serif text-lg font-medium text-roman-text-main mb-6">Custo Total de Manutenção por Sede (R$)</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={custoPorSede} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} dx={-10} tickFormatter={(value) => `R$ ${value/1000}k`} />
                <Tooltip 
                  cursor={{ fill: '#f5f5f5' }}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '2px', fontSize: '12px' }}
                  itemStyle={{ color: '#1a1a1a' }}
                  formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Custo']}
                />
                <Bar dataKey="custo" fill="#1a1a1a" radius={[2, 2, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsView() {
  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 border-b border-roman-border pb-4">
          <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Configurações do Sistema</h1>
          <p className="text-roman-text-sub font-serif italic">Ajustes de e-mail, templates e regras de negócio.</p>
        </header>

        <div className="flex gap-8">
          {/* Settings Nav */}
          <div className="w-64 shrink-0 space-y-2">
            <button className="w-full text-left px-4 py-2 bg-roman-primary/10 text-roman-primary border-l-2 border-roman-primary font-medium">Templates de E-mail</button>
            <button className="w-full text-left px-4 py-2 text-roman-text-sub hover:bg-roman-surface border-l-2 border-transparent hover:border-roman-border transition-colors">Regras de SLA</button>
            <button className="w-full text-left px-4 py-2 text-roman-text-sub hover:bg-roman-surface border-l-2 border-transparent hover:border-roman-border transition-colors">Integrações (Drive)</button>
          </div>

          {/* Settings Content */}
          <div className="flex-1 bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
            <h2 className="font-serif text-xl font-medium text-roman-text-main mb-6">Templates de Comunicação</h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Gatilho</label>
                <select className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary">
                  <option>EMAIL-NOVA-OS (Abertura)</option>
                  <option>EMAIL-VISITEC-PENDENTE (Solicitação Técnico)</option>
                  <option>EMAIL-APROV-ORCAMENTO (Para Diretoria)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Assunto do E-mail</label>
                <input type="text" defaultValue="[Nova OS] {{ticket.id}} - {{ticket.subject}}" className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary" />
              </div>

              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Corpo do E-mail (HTML/Texto)</label>
                <textarea className="w-full h-40 border border-roman-border rounded-sm p-3 bg-roman-bg text-[13px] font-mono text-roman-text-sub outline-none focus:border-roman-primary" defaultValue={`Olá {{requester.name}},\n\nSua Ordem de Serviço foi registrada com sucesso.\n\nNúmero: {{ticket.id}}\nAssunto: {{ticket.subject}}\n\nNossa equipe fará a triagem em breve.\n\nAtenciosamente,\nGestão de Manutenção`}></textarea>
              </div>

              <div className="flex justify-end">
                <button className="bg-roman-sidebar hover:bg-stone-900 text-white px-6 py-2 rounded-sm font-medium transition-colors">
                  Salvar Template
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- TRACKING VIEW (GUEST PORTAL) ---
function TrackingView({ ticketId, onBack }: { ticketId: string, onBack: () => void }) {
  const ticket = MOCK_TICKETS.find(t => t.id === ticketId) || MOCK_TICKETS[0];
  const [status, setStatus] = useState(ticket.status);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleValidate = (approved: boolean) => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setStatus(approved ? 'Aguardando pagamento' : 'Em andamento');
      if(approved) alert("Obrigado! A OS foi aprovada e seguirá para pagamento/encerramento.");
      else alert("A equipe técnica foi notificada para revisar o serviço.");
    }, 1500);
  };

  return (
    <div className="h-screen w-full bg-roman-bg overflow-y-auto flex flex-col items-center py-12 px-4 relative">
      {/* Back Button (Just for preview purposes) */}
      <button onClick={onBack} className="absolute top-6 left-6 flex items-center gap-2 text-roman-text-sub hover:text-roman-text-main font-medium transition-colors">
        <ArrowRight size={16} className="rotate-180" /> Voltar ao Sistema Interno
      </button>

      <div className="max-w-3xl w-full">
        {/* Header */}
        <div className="bg-roman-surface border border-roman-border p-8 rounded-sm shadow-sm mb-6">
          <div className="flex justify-between items-start mb-8 border-b border-roman-border pb-6">
            <div>
              <div className="text-roman-primary mb-4"><Landmark size={36} strokeWidth={1.5} /></div>
              <h1 className="text-2xl font-serif text-roman-text-main font-medium mb-1">Acompanhamento de OS</h1>
              <p className="text-roman-text-sub font-serif italic">Portal do Solicitante</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-serif text-roman-text-main font-medium">#{ticket.id}</div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-roman-primary/10 text-roman-primary border border-roman-primary/20 rounded-sm text-sm font-medium mt-2">
                <span className="w-2 h-2 rounded-full bg-roman-primary animate-pulse"></span> {status}
              </div>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-serif text-roman-text-main mb-2">{ticket.subject}</h2>
            <p className="text-roman-text-sub">Solicitado por: {ticket.requester} • Setor: {ticket.sector} ({ticket.sede})</p>
          </div>

          {/* Validation Call to Action */}
          {status === 'Aguardando aprovação da manutenção' && (
            <div className="bg-roman-primary/10 border border-roman-primary/30 p-6 rounded-sm shadow-sm mb-8 animate-in fade-in slide-in-from-bottom-4">
              <h3 className="font-serif text-lg font-medium text-roman-primary mb-2 flex items-center gap-2">
                <CheckSquare size={20} /> Validação da Manutenção
              </h3>
              <p className="text-sm text-roman-text-main mb-6">A equipe técnica informou que o serviço foi concluído. Por favor, verifique o local e confirme se o serviço está aprovado.</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button onClick={() => handleValidate(false)} disabled={isProcessing} className="px-6 py-2 border border-red-200 text-red-700 hover:bg-red-50 rounded-sm font-medium transition-colors text-sm disabled:opacity-50">
                  Ainda com pendências (Reprovar)
                </button>
                <button onClick={() => handleValidate(true)} disabled={isProcessing} className="px-6 py-2 bg-roman-primary hover:bg-roman-primary-hover text-white rounded-sm font-medium transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                  Serviço Aprovado (Encerrar)
                </button>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div>
            <h3 className="font-serif text-lg font-medium text-roman-text-main mb-6">Histórico</h3>
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-roman-border before:to-transparent">
              {ticket.history.map((item, index) => (
                <div key={index} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-roman-surface text-roman-primary shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                    {item.type === 'customer' ? <Users size={16} /> : item.type === 'tech' ? <Activity size={16} /> : <CheckCircle size={16} />}
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-roman-surface border border-roman-border p-4 rounded-sm shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-serif font-medium text-roman-text-main">{item.sender || 'Sistema'}</div>
                      {item.time && <div className="text-xs text-roman-text-sub font-serif italic">{item.time}</div>}
                    </div>
                    <div className="text-sm text-roman-text-main leading-relaxed">{item.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- INBOX VIEW (The previous main screen) ---

function InboxView({ onNavigate, onOpenAttachment, onOpenTracking }: { onNavigate: (view: ViewState) => void, onOpenAttachment: (title: string, type: 'image' | 'pdf') => void, onOpenTracking: (id: string) => void }) {
  const [activeTicketId, setActiveTicketId] = useState('OS-0050');
  const [replyMode, setReplyMode] = useState<'public' | 'internal'>('internal');
  const [techTeam, setTechTeam] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [activeFilter, setActiveFilter] = useState('Todas');
  const [toast, setToast] = useState<string | null>(null);

  const filteredTickets = MOCK_TICKETS.filter(t => activeFilter === 'Todas' || t.status === activeFilter);
  const activeTicket = MOCK_TICKETS.find(t => t.id === activeTicketId) || MOCK_TICKETS[0];

  let internalTabLabel = "Nota Interna";
  let internalPlaceholder = "Adicione uma nota interna...";
  let internalButtonText = "Salvar Nota";
  let internalActionText = "Ação: Registrar nota no histórico";

  if (activeTicket.status === 'Nova OS' || activeTicket.status.includes('Aprovada na Triagem')) {
    internalTabLabel = "Solicitar Parecer Técnico";
    internalPlaceholder = "Descreva a solicitação para a equipe técnica...";
    internalButtonText = "Avançar: Aguardando Parecer";
    internalActionText = `Ação: Disparar e-mail para ${techTeam === 'Terceirizada' && customEmail ? customEmail : (techTeam || 'Equipe Técnica')}`;
  } else if (activeTicket.status.includes('Cotação')) {
    internalTabLabel = "Anotação de Cotação";
    internalPlaceholder = "Registre detalhes das negociações com fornecedores...";
    internalButtonText = "Salvar Anotação";
    internalActionText = "Ação: Registrar no histórico interno";
  } else if (activeTicket.status.includes('Validação') || activeTicket.status.includes('Execução')) {
    internalTabLabel = "Diário de Obra";
    internalPlaceholder = "Registre o andamento da execução...";
    internalButtonText = "Salvar Registro";
    internalActionText = "Ação: Registrar no histórico interno";
  }

  const handleSendToDirector = () => {
    setIsSending(true);
    setTimeout(() => {
      setIsSending(false);
      setToast('Orçamentos enviados para a Diretoria com sucesso!');
      setTimeout(() => setToast(null), 3000);
    }, 1500);
  };

  return (
    <div className="flex-1 flex overflow-hidden relative">
      {/* Toast Notification */}
      {toast && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-green-800 text-white px-6 py-3 rounded-sm shadow-lg flex items-center gap-3 z-50 animate-in slide-in-from-top-4 fade-in">
          <CheckCircle size={18} />
          <span className="font-medium text-sm">{toast}</span>
        </div>
      )}

      {/* Ticket List Pane (Views) */}
      <div className="w-80 bg-roman-surface border-r border-roman-border flex flex-col z-10 shadow-[1px_0_5px_rgba(0,0,0,0.02)]">
        {/* View Header */}
        <div className="h-14 border-b border-roman-border flex items-center justify-between px-4 hover:bg-roman-bg cursor-pointer">
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-[16px] font-semibold tracking-wide">Minhas Filas (Rafael)</h2>
            <ChevronDown size={16} className="text-roman-text-sub" />
          </div>
          <span className="text-roman-text-sub font-serif italic text-sm">14</span>
        </div>
        
        {/* Toolbar */}
        <div className="p-2 border-b border-roman-border flex gap-2 bg-roman-bg/50 overflow-x-auto hide-scrollbar">
          <button onClick={() => setActiveFilter('Nova OS')} className={`border rounded px-3 py-1.5 text-center transition-colors font-medium whitespace-nowrap ${activeFilter === 'Nova OS' ? 'border-roman-primary/50 bg-roman-primary/10 text-roman-primary' : 'border-roman-border hover:bg-roman-border-light text-roman-text-sub'}`}>
            Novas OS ({MOCK_TICKETS.filter(t => t.status === 'Nova OS').length})
          </button>
          <button onClick={() => setActiveFilter('Aguardando Orçamento')} className={`border rounded px-3 py-1.5 text-center transition-colors font-medium whitespace-nowrap ${activeFilter === 'Aguardando Orçamento' ? 'border-roman-primary/50 bg-roman-primary/10 text-roman-primary' : 'border-roman-border hover:bg-roman-border-light text-roman-text-sub'}`}>
            Aguard. Orçamento ({MOCK_TICKETS.filter(t => t.status === 'Aguardando Orçamento').length})
          </button>
          <button onClick={() => setActiveFilter('Em andamento')} className={`border rounded px-3 py-1.5 text-center transition-colors font-medium whitespace-nowrap ${activeFilter === 'Em andamento' ? 'border-roman-primary/50 bg-roman-primary/10 text-roman-primary' : 'border-roman-border hover:bg-roman-border-light text-roman-text-sub'}`}>
            Em Execução ({MOCK_TICKETS.filter(t => t.status === 'Em andamento').length})
          </button>
          <button onClick={() => setActiveFilter('Todas')} className={`border rounded px-3 py-1.5 text-center transition-colors font-medium whitespace-nowrap ${activeFilter === 'Todas' ? 'border-roman-primary/50 bg-roman-primary/10 text-roman-primary' : 'border-roman-border hover:bg-roman-border-light text-roman-text-sub'}`}>
            Limpar Filtros
          </button>
        </div>

        {/* Ticket List */}
        <div className="flex-1 overflow-y-auto">
          {filteredTickets.length === 0 ? (
            <div className="p-8 text-center text-roman-text-sub font-serif italic">Nenhuma OS encontrada para este filtro.</div>
          ) : (
            filteredTickets.map(ticket => (
              <TicketListItem 
                key={ticket.id}
                id={ticket.id} 
                subject={ticket.subject} 
                requester={ticket.requester} 
                time={ticket.time} 
                status={ticket.status}
                active={activeTicketId === ticket.id}
                onClick={() => setActiveTicketId(ticket.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Main Ticket Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navigation / Tabs */}
        <header className="h-12 bg-roman-surface border-b border-roman-border flex items-center px-2">
          <div className="flex h-full">
            <div className="h-full px-4 border-r border-roman-border flex items-center gap-2 bg-roman-bg border-t-2 border-t-roman-primary font-medium">
              <span className="w-2 h-2 rounded-full bg-roman-primary"></span>
              <span className="font-serif italic text-roman-text-sub mr-1">#{activeTicket.id}</span> {activeTicket.subject.substring(0, 20)}...
            </div>
            <div className="h-full px-4 border-r border-roman-border flex items-center gap-2 hover:bg-roman-bg cursor-pointer text-roman-text-sub">
              <Plus size={16} />
              <span className="font-serif">Nova OS</span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3 px-4 relative">
            <button onClick={() => setShowFilterMenu(!showFilterMenu)} className={`transition-colors ${showFilterMenu || activeFilter !== 'Todas' ? 'text-roman-primary' : 'text-roman-text-sub hover:text-roman-text-main'}`} title="Filtrar">
              <Filter size={18} />
            </button>
            {showFilterMenu && (
              <div className="absolute top-8 right-10 w-48 bg-roman-surface border border-roman-border shadow-xl rounded-sm z-20 py-2">
                <div className="px-4 py-2 text-xs font-serif italic text-roman-text-sub border-b border-roman-border mb-1">Filtrar por Status</div>
                {['Todas', 'Nova OS', 'Aguardando Parecer Técnico', 'Aguardando Aprovação da Solução', 'Aguardando Orçamento', 'Aguardando Aprovação do Orçamento', 'Aguardando aprovação do contrato', 'Aguardando Ações Preliminares', 'Em andamento', 'Aguardando aprovação da manutenção', 'Aguardando pagamento', 'Encerrada'].map(filter => (
                  <button 
                    key={filter}
                    onClick={() => { setActiveFilter(filter); setShowFilterMenu(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-roman-bg transition-colors ${activeFilter === filter ? 'text-roman-primary font-medium' : 'text-roman-text-main'}`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            )}
            <Search size={18} className="text-roman-text-sub" />
          </div>
        </header>

        {/* Ticket Content Area */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Conversation Thread */}
          <div className="flex-1 flex flex-col bg-roman-bg overflow-y-auto">
            
            {/* Ticket Header */}
            <div className="bg-roman-surface p-6 border-b border-roman-border">
              <div className="flex items-start justify-between mb-4">
                <h1 className="text-3xl font-serif font-medium text-roman-text-main">{activeTicket.subject}</h1>
                <button className="text-roman-text-sub hover:text-roman-text-main"><MoreHorizontal size={20} /></button>
              </div>
              <div className="flex items-center gap-4 text-roman-text-sub font-serif italic text-sm">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-roman-primary"></span> {activeTicket.status}</span>
                <span>via Formulário do Sistema</span>
                <span>{activeTicket.time}</span>
                <button onClick={() => onOpenAttachment(`Fotos: ${activeTicket.subject}`, 'image')} className="ml-auto text-roman-primary hover:underline flex items-center gap-1 not-italic font-medium text-xs">
                  <ImageIcon size={14} /> Ver Fotos Anexadas
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="p-6 space-y-6 flex-1">
              {activeTicket.history.map((item, index) => {
                if (item.type === 'system') {
                  return (
                    <div key={index} className="flex gap-4 justify-center">
                      <div className="bg-roman-border-light/50 border border-roman-border rounded-full px-4 py-1 text-xs text-roman-text-sub font-serif italic flex items-center gap-2">
                        <Clock size={12} /> {item.text}
                      </div>
                    </div>
                  );
                }
                
                return (
                  <div key={index} className="flex gap-4">
                    <div className="w-10 h-10 rounded-sm bg-roman-border-light text-roman-text-main border border-roman-border flex items-center justify-center font-serif text-lg shrink-0">
                      {item.sender?.charAt(0) || 'U'}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="font-semibold text-[14px]">{item.sender}</span>
                        <span className="text-roman-text-sub text-xs font-serif italic">{item.time}</span>
                      </div>
                      <div className="bg-roman-surface border border-roman-border rounded-sm p-5 text-[14px] leading-relaxed shadow-sm">
                        {item.text}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reply Box (Ação do Rafael) */}
            <div className="p-6 pt-0 mt-auto">
              <div className={`border rounded-sm overflow-hidden shadow-sm transition-colors ${replyMode === 'internal' ? 'border-roman-parchment-border bg-roman-parchment' : 'border-roman-border bg-roman-surface'}`}>
                {/* Reply Tabs */}
                <div className="flex border-b border-roman-border bg-roman-bg/50">
                  <button 
                    onClick={() => setReplyMode('internal')}
                    className={`px-4 py-2 font-serif text-base tracking-wide flex items-center gap-2 ${replyMode === 'internal' ? 'bg-roman-parchment text-roman-text-main border-t-2 border-t-stone-800' : 'text-roman-text-sub hover:bg-roman-surface/50'}`}
                  >
                    <Lock size={14} /> {internalTabLabel}
                  </button>
                  <button 
                    onClick={() => setReplyMode('public')}
                    className={`px-4 py-2 font-serif text-base tracking-wide ${replyMode === 'public' ? 'bg-roman-surface text-roman-text-main border-t-2 border-t-roman-primary' : 'text-roman-text-sub hover:bg-roman-surface/50'}`}
                  >
                    Mensagem ao Solicitante
                  </button>
                </div>
                
                {/* Formatting Toolbar */}
                <div className="flex items-center gap-2 p-2 border-b border-roman-border/50 text-roman-text-sub">
                  <button className="p-1 hover:bg-black/5 rounded"><Bold size={16} /></button>
                  <button className="p-1 hover:bg-black/5 rounded"><Italic size={16} /></button>
                  <button className="p-1 hover:bg-black/5 rounded"><List size={16} /></button>
                  <div className="w-px h-4 bg-roman-border mx-1"></div>
                  <button className="p-1 hover:bg-black/5 rounded"><Paperclip size={16} /></button>
                </div>

                {/* Textarea */}
                <textarea 
                  className="w-full h-24 p-4 outline-none resize-none bg-transparent font-sans"
                  placeholder={replyMode === 'internal' ? internalPlaceholder : "Mensagem para o solicitante..."}
                ></textarea>

                {/* Footer Actions */}
                <div className="p-3 border-t border-roman-border/50 flex justify-between items-center bg-black/5">
                  <div className="text-xs text-roman-text-sub font-serif italic">
                    {replyMode === 'internal' ? internalActionText : "Ação: Notificar solicitante por e-mail"}
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="px-4 py-1.5 text-roman-text-sub hover:bg-black/5 rounded font-medium transition-colors">
                      Cancelar
                    </button>
                    <div className="flex rounded-sm overflow-hidden shadow-sm">
                      <button className="bg-roman-sidebar hover:bg-stone-900 text-white px-4 py-1.5 font-medium transition-colors tracking-wide flex items-center gap-2">
                        <CheckCircle size={16} />
                        {replyMode === 'internal' ? internalButtonText : "Enviar Mensagem"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Context Panel (Right Sidebar) */}
          <aside className="w-80 bg-roman-surface border-l border-roman-border flex flex-col">
            <div className="h-12 border-b border-roman-border flex items-center px-4 font-serif text-sm tracking-widest uppercase font-semibold text-roman-text-main">
              Dados da OS
            </div>
            <div className="p-4 space-y-5 overflow-y-auto">
              <PropertyField label="Status Atual" value={activeTicket.status} highlight />
              
              {/* PUBLIC LINK BUTTON */}
              <button 
                onClick={() => onOpenTracking(activeTicket.id)}
                className="w-full flex items-center justify-between px-3 py-2 bg-roman-bg border border-roman-border rounded-sm hover:border-roman-primary/50 transition-colors group"
                title="Copiar link seguro para o solicitante"
              >
                <div className="flex items-center gap-2 text-roman-text-main font-medium text-[13px]">
                  <ExternalLink size={14} className="text-roman-primary" />
                  Link do Solicitante
                </div>
                <span className="text-[10px] text-roman-text-sub font-serif italic group-hover:text-roman-primary">Visualizar</span>
              </button>

              <PropertyField label="Tipo de Manutenção" value={activeTicket.type} />
              <PropertyField label="Região" value={activeTicket.region} />
              <PropertyField label="Sede" value={activeTicket.sede} />
              <PropertyField label="Setor" value={activeTicket.sector} />
              
              <div className="pt-4 border-t border-roman-border">
                <div className="mb-4">
                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Responsável (Técnico)</label>
                  <select 
                    value={techTeam}
                    onChange={(e) => setTechTeam(e.target.value)}
                    className="w-full border border-roman-primary/50 rounded-sm px-3 py-2 bg-roman-primary/5 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                  >
                    <option value="">Selecione a Equipe...</option>
                    <option value="Construtora">Construtora</option>
                    <option value="Informática">Informática</option>
                    <option value="Infra - Compras">Infra - Compras</option>
                    <option value="Infra - Cordenação">Infra - Cordenação</option>
                    <option value="Infra - Sede">Infra - Sede</option>
                    <option value="JY">JY</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Metalúrgica">Metalúrgica</option>
                    <option value="Não especificado">Não especificado</option>
                    <option value="Redes">Redes</option>
                    <option value="Refrigeração">Refrigeração</option>
                    <option value="Terceirizada">Terceirizada</option>
                  </select>
                </div>

                {techTeam === 'Terceirizada' && (
                  <div className="mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">E-mail do Fornecedor</label>
                    <input 
                      type="email" 
                      value={customEmail}
                      onChange={(e) => setCustomEmail(e.target.value)}
                      placeholder="fornecedor@email.com" 
                      className="w-full border border-roman-primary/50 rounded-sm px-3 py-2 bg-roman-primary/5 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary" 
                    />
                  </div>
                )}
              </div>

              {/* BUDGETS SECTION (3 QUOTES) */}
              {activeTicket.status.includes('Cotação') && (
                <div className="pt-4 border-t border-roman-border">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-bold">Gestão de Orçamentos</h4>
                    <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-sm font-medium">Rodada 1</span>
                  </div>

                  <div className="space-y-3">
                    {/* Quote 1 */}
                    <div className="border border-roman-border rounded-sm p-3 bg-roman-bg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-medium text-roman-text-main">Cotação 1</span>
                        <button className="text-[10px] text-roman-primary hover:underline">Anexar PDF</button>
                      </div>
                      <input type="text" placeholder="Nome do Fornecedor" className="w-full text-xs p-1.5 border border-roman-border rounded-sm mb-2 bg-roman-surface outline-none" />
                      <input type="text" placeholder="R$ 0,00" className="w-full text-xs p-1.5 border border-roman-border rounded-sm bg-roman-surface outline-none" />
                    </div>

                    {/* Quote 2 */}
                    <div className="border border-roman-border rounded-sm p-3 bg-roman-bg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-medium text-roman-text-main">Cotação 2</span>
                        <button className="text-[10px] text-roman-primary hover:underline">Anexar PDF</button>
                      </div>
                      <input type="text" placeholder="Nome do Fornecedor" className="w-full text-xs p-1.5 border border-roman-border rounded-sm mb-2 bg-roman-surface outline-none" />
                      <input type="text" placeholder="R$ 0,00" className="w-full text-xs p-1.5 border border-roman-border rounded-sm bg-roman-surface outline-none" />
                    </div>

                    {/* Quote 3 */}
                    <div className="border border-roman-border rounded-sm p-3 bg-roman-bg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-medium text-roman-text-main">Cotação 3</span>
                        <button className="text-[10px] text-roman-primary hover:underline">Anexar PDF</button>
                      </div>
                      <input type="text" placeholder="Nome do Fornecedor" className="w-full text-xs p-1.5 border border-roman-border rounded-sm mb-2 bg-roman-surface outline-none" />
                      <input type="text" placeholder="R$ 0,00" className="w-full text-xs p-1.5 border border-roman-border rounded-sm bg-roman-surface outline-none" />
                    </div>
                  </div>

                  <button 
                    onClick={handleSendToDirector}
                    disabled={isSending}
                    className="w-full mt-4 bg-roman-sidebar hover:bg-stone-900 text-white py-2 rounded-sm font-medium transition-colors text-xs flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                    {isSending ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
                    {isSending ? 'Enviando...' : 'Enviar para Diretoria'}
                  </button>
                </div>
              )}

              {/* EXECUTION CONTROL */}
              <div className="pt-4 border-t border-roman-border">
                <h4 className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-bold mb-3">Controle de Execução</h4>
                <div className="space-y-2">
                  <button className="w-full bg-roman-bg border border-roman-border hover:border-roman-primary text-roman-text-main py-2 rounded-sm font-medium transition-colors text-xs flex items-center justify-center gap-2">
                    <List size={14} /> Ações Preliminares (Compras)
                  </button>
                  <button className="w-full bg-roman-bg border border-roman-border hover:border-roman-primary text-roman-text-main py-2 rounded-sm font-medium transition-colors text-xs flex items-center justify-center gap-2">
                    <Play size={14} /> Iniciar Execução da Obra
                  </button>
                  <button className="w-full bg-roman-sidebar hover:bg-stone-900 text-white py-2 rounded-sm font-medium transition-colors text-xs flex items-center justify-center gap-2">
                    <CheckSquare size={14} /> Enviar para Validação (Solicitante)
                  </button>
                  <button className="w-full bg-green-700 hover:bg-green-800 text-white py-2 rounded-sm font-medium transition-colors text-xs flex items-center justify-center gap-2 mt-4">
                    <CheckCircle size={14} /> Encerrar OS (Paga)
                  </button>
                </div>
              </div>

            </div>
          </aside>

        </div>
      </div>
    </div>
  );
}

function TicketListItem({ id, subject, requester, time, status, active, onClick }: any) {
  return (
    <div 
      onClick={onClick}
      className={`p-4 border-b border-roman-border cursor-pointer transition-colors ${active ? 'bg-roman-bg border-l-2 border-l-roman-primary' : 'hover:bg-roman-bg border-l-2 border-l-transparent'}`}
    >
      <div className="flex justify-between items-start mb-1">
        <span className="font-semibold text-roman-text-main truncate pr-2">{requester}</span>
        <span className="text-xs text-roman-text-sub font-serif italic whitespace-nowrap">{time}</span>
      </div>
      <div className="text-roman-text-main font-medium truncate mb-2">{subject}</div>
      <div className="flex items-center gap-2 text-xs text-roman-text-sub font-serif">
        <span className={`w-1.5 h-1.5 rounded-full ${status === 'Nova OS' ? 'bg-roman-primary' : 'bg-stone-400'}`}></span>
        {id} • {status}
      </div>
    </div>
  );
}

function PropertyField({ label, value, highlight }: { label: string, value: string, highlight?: boolean }) {
  return (
    <div>
      <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">{label}</label>
      <div className={`w-full border rounded-sm px-3 py-2 cursor-pointer transition-colors flex justify-between items-center ${highlight ? 'border-roman-primary bg-roman-primary/5 text-roman-primary' : 'border-roman-border bg-roman-bg hover:border-roman-primary/50 text-roman-text-main'}`}>
        <span className="text-[13px] font-medium">{value}</span>
      </div>
    </div>
  );
}
