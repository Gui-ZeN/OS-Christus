import React from 'react';
import { Plus, Users, BarChart2 } from 'lucide-react';
import { StatCard } from '../components/ui/StatCard';
import { ActivityItem } from '../components/ui/ActivityItem';
import { useApp } from '../context/AppContext';

export function HomeView() {
  const { navigateTo } = useApp();

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Olá, Rafael</h1>
          <p className="text-roman-text-sub font-serif italic">Aqui está o resumo das suas responsabilidades de hoje.</p>
        </header>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <StatCard title="Novas OS" value="3" highlight onClick={() => navigateTo('inbox')} />
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
              <button onClick={() => navigateTo('inbox')} className="w-full text-left px-4 py-3 border border-roman-border rounded-sm hover:border-roman-primary hover:bg-roman-primary/5 transition-colors flex items-center gap-3">
                <Plus size={18} className="text-roman-primary" />
                <span className="font-medium">Registrar Nova OS</span>
              </button>
              <button onClick={() => navigateTo('users')} className="w-full text-left px-4 py-3 border border-roman-border rounded-sm hover:border-roman-primary hover:bg-roman-primary/5 transition-colors flex items-center gap-3">
                <Users size={18} className="text-roman-primary" />
                <span className="font-medium">Gerenciar Equipes</span>
              </button>
              <button onClick={() => navigateTo('kpi')} className="w-full text-left px-4 py-3 border border-roman-border rounded-sm hover:border-roman-primary hover:bg-roman-primary/5 transition-colors flex items-center gap-3">
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
