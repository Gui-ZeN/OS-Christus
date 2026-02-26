import React, { useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, LineChart, CartesianGrid, XAxis, YAxis, Line, BarChart, Bar, Legend } from 'recharts';
import { Calendar, DollarSign, Briefcase, Clock, TrendingUp, TrendingDown } from 'lucide-react';

export function KpiView() {
  const [period, setPeriod] = useState<'month' | 'semester' | 'custom'>('month');

  // Mock Data for Z3 Features
  const osPorRegiao = [
    { name: 'Dionísio Torres', abertas: 12, fechadas: 33 },
    { name: 'Aldeota', abertas: 8, fechadas: 22 },
    { name: 'Parquelândia', abertas: 5, fechadas: 20 },
    { name: 'Sul', abertas: 10, fechadas: 25 },
    { name: 'Benfica', abertas: 3, fechadas: 12 },
    { name: 'Universidade', abertas: 6, fechadas: 14 },
  ];

  const tempoPorEtapa = [
    { name: 'Triagem', dias: 0.5 },
    { name: 'Orçamento', dias: 2.1 },
    { name: 'Aprovação', dias: 1.2 },
    { name: 'Execução', dias: 4.5 },
    { name: 'Pagamento', dias: 3.0 },
  ];

  const topFornecedor = {
    name: 'Refrigeração Polar Ltda',
    contratos: 12,
    valorTotal: 45600
  };

  const maiorCusto = {
    id: 'OS-0032',
    subject: 'Reforma do Telhado do Galpão',
    valor: 28500,
    sede: 'SUL1'
  };

  const custoPorSede = [
    { name: 'DT1', custo: 12500 },
    { name: 'BS', custo: 8400 },
    { name: 'SUL1', custo: 15200 },
    { name: 'PQL1', custo: 6300 },
    { name: 'ALD', custo: 9100 },
  ];

  const COLORS = ['#1a1a1a', '#525252', '#737373', '#a3a3a3', '#d4d4d4', '#e5e5e5'];

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 border-b border-roman-border pb-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Dashboard Gerencial</h1>
            <p className="text-roman-text-sub font-serif italic">Visão estratégica de custos, prazos e fornecedores.</p>
          </div>
          
          {/* Period Selector (Z3) */}
          <div className="flex bg-roman-surface border border-roman-border rounded-sm p-1">
            <button 
              onClick={() => setPeriod('month')}
              className={`px-4 py-1.5 text-sm font-medium rounded-sm transition-colors ${period === 'month' ? 'bg-roman-primary text-white shadow-sm' : 'text-roman-text-sub hover:text-roman-text-main hover:bg-roman-bg'}`}
            >
              Este Mês
            </button>
            <button 
              onClick={() => setPeriod('semester')}
              className={`px-4 py-1.5 text-sm font-medium rounded-sm transition-colors ${period === 'semester' ? 'bg-roman-primary text-white shadow-sm' : 'text-roman-text-sub hover:text-roman-text-main hover:bg-roman-bg'}`}
            >
              Este Semestre
            </button>
            <button 
              onClick={() => setPeriod('custom')}
              className={`px-4 py-1.5 text-sm font-medium rounded-sm transition-colors ${period === 'custom' ? 'bg-roman-primary text-white shadow-sm' : 'text-roman-text-sub hover:text-roman-text-main hover:bg-roman-bg'}`}
            >
              Personalizado
            </button>
          </div>
        </header>

        {/* Highlights Cards (Z3) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Maior Custo */}
          <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <DollarSign size={64} />
            </div>
            <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Maior Custo do Período</h3>
            <div className="text-2xl font-medium text-roman-text-main mb-1">R$ {maiorCusto.valor.toLocaleString('pt-BR')}</div>
            <div className="text-sm text-roman-text-sub truncate mb-4" title={maiorCusto.subject}>{maiorCusto.subject}</div>
            <div className="flex items-center gap-2 text-xs font-medium text-red-600 bg-red-50 w-fit px-2 py-1 rounded-sm border border-red-100">
              <TrendingUp size={12} /> Impacto de 15% no budget
            </div>
          </div>

          {/* Top Fornecedor */}
          <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Briefcase size={64} />
            </div>
            <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Top Fornecedor</h3>
            <div className="text-xl font-medium text-roman-text-main mb-1 truncate" title={topFornecedor.name}>{topFornecedor.name}</div>
            <div className="text-sm text-roman-text-sub mb-4">{topFornecedor.contratos} contratos fechados</div>
            <div className="flex items-center gap-2 text-xs font-medium text-roman-text-main bg-roman-bg w-fit px-2 py-1 rounded-sm border border-roman-border">
              Total: R$ {topFornecedor.valorTotal.toLocaleString('pt-BR')}
            </div>
          </div>

          {/* Tempo Médio Geral */}
          <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Clock size={64} />
            </div>
            <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">SLA Médio de Resolução</h3>
            <div className="text-2xl font-medium text-roman-text-main mb-1">4.2 Dias</div>
            <div className="text-sm text-roman-text-sub mb-4">Média de todas as etapas</div>
            <div className="flex items-center gap-2 text-xs font-medium text-green-700 bg-green-50 w-fit px-2 py-1 rounded-sm border border-green-100">
              <TrendingDown size={12} /> -0.5 dias vs. mês anterior
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* OS Abertas vs Fechadas (Z3) */}
          <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
            <h2 className="font-serif text-lg font-medium text-roman-text-main mb-6">Volume de OS: Abertas vs. Fechadas</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={osPorRegiao} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} dx={-10} />
                  <Tooltip 
                    cursor={{ fill: '#f5f5f5' }}
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '2px', fontSize: '12px' }}
                    itemStyle={{ color: '#1a1a1a' }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar dataKey="abertas" name="Em Aberto" stackId="a" fill="#a3a3a3" barSize={40} />
                  <Bar dataKey="fechadas" name="Concluídas" stackId="a" fill="#1a1a1a" radius={[2, 2, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tempo Médio por Etapa (Z3) */}
          <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
            <h2 className="font-serif text-lg font-medium text-roman-text-main mb-6">Tempo Médio por Etapa (Dias)</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tempoPorEtapa} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e5e5" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} width={80} />
                  <Tooltip 
                    cursor={{ fill: '#f5f5f5' }}
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '2px', fontSize: '12px' }}
                    itemStyle={{ color: '#1a1a1a' }}
                    formatter={(value: number) => [`${value} dias`, 'Duração']}
                  />
                  <Bar dataKey="dias" fill="#525252" radius={[0, 2, 2, 0]} barSize={20} />
                </BarChart>
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
