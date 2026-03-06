import React, { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis, BarChart, Bar, Legend } from 'recharts';
import { Briefcase, Clock, DollarSign, TrendingDown, TrendingUp } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EmptyState } from '../components/ui/EmptyState';
import { fetchProcurementData } from '../services/procurementApi';
import type { ContractRecord, PaymentRecord } from '../types';
import { TICKET_STATUS } from '../constants/ticketStatus';

function parseCurrency(value: string) {
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function daysBetween(start: Date, end: Date) {
  return Math.max(0, (end.getTime() - start.getTime()) / 86400000);
}

function resolveItemValue(
  item: { totalPrice?: string | null; unitPrice?: string | null; quantity?: number | null },
  fallbackValue = 0
) {
  const totalPrice = parseCurrency(item.totalPrice || '');
  if (totalPrice > 0) return totalPrice;

  const unitPrice = parseCurrency(item.unitPrice || '');
  const quantity = item.quantity ?? 0;
  if (unitPrice > 0 && quantity > 0) return unitPrice * quantity;

  return fallbackValue;
}

export function KpiView() {
  const { currentUser, tickets } = useApp();
  const canAccess = currentUser?.role === 'Admin' || currentUser?.role === 'Diretor';
  const [period, setPeriod] = useState<'month' | 'semester' | 'custom'>('month');
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedSite, setSelectedSite] = useState('all');
  const [selectedVendor, setSelectedVendor] = useState('all');
  const [contractsByTicket, setContractsByTicket] = useState<Record<string, ContractRecord>>({});
  const [paymentsByTicket, setPaymentsByTicket] = useState<Record<string, PaymentRecord[]>>({});

  if (!canAccess) {
    return (
      <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
        <div className="max-w-4xl mx-auto min-h-[60vh]">
          <EmptyState
            icon={TrendingUp}
            title="Acesso restrito"
            description="Os indicadores gerenciais estão disponíveis apenas para Diretor e Admin."
          />
        </div>
      </div>
    );
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchProcurementData();
        if (!cancelled) {
          setContractsByTicket(data.contractsByTicket);
          setPaymentsByTicket(data.paymentsByTicket);
        }
      } catch {
        if (!cancelled) {
          setContractsByTicket({});
          setPaymentsByTicket({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const periodTickets = useMemo(() => {
    const now = Date.now();
    const rangeDays = period === 'month' ? 30 : period === 'semester' ? 180 : 365;
    return tickets.filter(ticket => now - ticket.time.getTime() <= rangeDays * 86400000);
  }, [period, tickets]);

  const regionOptions = useMemo(
    () => {
      const values: string[] = periodTickets.map(ticket => ticket.region).filter((value): value is string => Boolean(value));
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    },
    [periodTickets]
  );

  const siteOptions = useMemo(
    () => {
      const values: string[] = periodTickets
        .filter(ticket => selectedRegion === 'all' || ticket.region === selectedRegion)
        .map(ticket => ticket.sede)
        .filter((value): value is string => Boolean(value));
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    },
    [periodTickets, selectedRegion]
  );

  const vendorOptions = useMemo(
    () => {
      const values: string[] = periodTickets
        .map(ticket => contractsByTicket[ticket.id]?.vendor || '')
        .filter((value): value is string => Boolean(value));
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    },
    [contractsByTicket, periodTickets]
  );

  useEffect(() => {
    if (selectedRegion !== 'all' && !regionOptions.includes(selectedRegion)) {
      setSelectedRegion('all');
    }
  }, [regionOptions, selectedRegion]);

  useEffect(() => {
    if (selectedSite !== 'all' && !siteOptions.includes(selectedSite)) {
      setSelectedSite('all');
    }
  }, [selectedSite, siteOptions]);

  useEffect(() => {
    if (selectedVendor !== 'all' && !vendorOptions.includes(selectedVendor)) {
      setSelectedVendor('all');
    }
  }, [selectedVendor, vendorOptions]);

  const filteredTickets = useMemo(() => {
    return periodTickets.filter(ticket => {
      if (selectedRegion !== 'all' && ticket.region !== selectedRegion) return false;
      if (selectedSite !== 'all' && ticket.sede !== selectedSite) return false;
      if (selectedVendor !== 'all') {
        const vendor = contractsByTicket[ticket.id]?.vendor || '';
        if (vendor !== selectedVendor) return false;
      }
      return true;
    });
  }, [contractsByTicket, periodTickets, selectedRegion, selectedSite, selectedVendor]);

  const osPorRegiao = useMemo(() => {
    const grouped = new Map<string, { name: string; abertas: number; fechadas: number }>();
    for (const ticket of filteredTickets) {
      if (!grouped.has(ticket.region)) {
        grouped.set(ticket.region, { name: ticket.region, abertas: 0, fechadas: 0 });
      }
      const current = grouped.get(ticket.region)!;
      if (ticket.status === TICKET_STATUS.CLOSED) current.fechadas += 1;
      else current.abertas += 1;
    }
    return [...grouped.values()].sort((a, b) => b.abertas + b.fechadas - (a.abertas + a.fechadas));
  }, [filteredTickets]);

  const tempoPorEtapa = useMemo(() => {
    const groups = [
      { name: 'Triagem', filter: (status: string) => status === TICKET_STATUS.NEW || status === TICKET_STATUS.WAITING_TECH_OPINION },
      { name: 'Orçamento', filter: (status: string) => status === TICKET_STATUS.WAITING_BUDGET || status === TICKET_STATUS.WAITING_BUDGET_APPROVAL },
      { name: 'Aprovação', filter: (status: string) => status === TICKET_STATUS.WAITING_SOLUTION_APPROVAL || status === TICKET_STATUS.WAITING_CONTRACT_APPROVAL },
      { name: 'Execução', filter: (status: string) => status === TICKET_STATUS.WAITING_PRELIM_ACTIONS || status === TICKET_STATUS.IN_PROGRESS || status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL },
      { name: 'Pagamento', filter: (status: string) => status === TICKET_STATUS.WAITING_PAYMENT },
    ];

    return groups.map(group => {
      const durations = filteredTickets
        .filter(ticket => group.filter(ticket.status))
        .map(ticket => daysBetween(ticket.time, new Date()));

      return {
        name: group.name,
        dias: Number(average(durations).toFixed(1)),
      };
    });
  }, [filteredTickets]);

  const contractValues = useMemo(() => {
    return filteredTickets.map(ticket => {
      const contract = contractsByTicket[ticket.id];
      const paymentSum = (paymentsByTicket[ticket.id] || []).reduce((total, payment) => total + parseCurrency(payment.value), 0);
      const paidSum = (paymentsByTicket[ticket.id] || [])
        .filter(payment => payment.status === 'paid')
        .reduce((total, payment) => total + parseCurrency(payment.value), 0);
      return {
        ticket,
        contractValue: parseCurrency(contract?.value || ''),
        plannedValue: paymentSum,
        paidValue: paidSum,
        value: parseCurrency(contract?.value || '') || paymentSum,
      };
    });
  }, [contractsByTicket, filteredTickets, paymentsByTicket]);

  const topFornecedor = useMemo(() => {
    const grouped = new Map<string, { name: string; contratos: number; valorTotal: number }>();
    for (const [ticketId, contract] of Object.entries(contractsByTicket) as Array<[string, ContractRecord]>) {
      if (!filteredTickets.some(ticket => ticket.id === ticketId)) continue;
      const name = contract.vendor || 'Fornecedor não informado';
      if (!grouped.has(name)) {
        grouped.set(name, { name, contratos: 0, valorTotal: 0 });
      }
      const current = grouped.get(name)!;
      current.contratos += 1;
      current.valorTotal += parseCurrency(contract.value);
    }
    return [...grouped.values()].sort((a, b) => b.valorTotal - a.valorTotal)[0] || { name: 'Sem contratos', contratos: 0, valorTotal: 0 };
  }, [contractsByTicket, filteredTickets]);

  const maiorCusto = useMemo(() => {
    const target = [...contractValues].sort((a, b) => b.value - a.value)[0];
    if (!target) {
      return { id: '-', subject: 'Sem contratos no período', valor: 0, sede: '-' };
    }
    return {
      id: target.ticket.id,
      subject: target.ticket.subject,
      valor: target.value,
      sede: target.ticket.sede,
    };
  }, [contractValues]);

  const custoPorSede = useMemo(() => {
    const grouped = new Map<string, { name: string; custo: number }>();
    for (const entry of contractValues) {
      if (!grouped.has(entry.ticket.sede)) {
        grouped.set(entry.ticket.sede, { name: entry.ticket.sede, custo: 0 });
      }
      grouped.get(entry.ticket.sede)!.custo += entry.value;
    }
    return [...grouped.values()].sort((a, b) => b.custo - a.custo);
  }, [contractValues]);

  const custoPorServico = useMemo(() => {
    const grouped = new Map<string, { name: string; custo: number; contratos: number }>();

    for (const ticket of filteredTickets) {
      const contract = contractsByTicket[ticket.id];
      if (!contract) continue;

      const serviceName =
        ticket.serviceCatalogName ||
        ticket.macroServiceName ||
        contract.classification?.serviceCatalogName ||
        contract.classification?.macroServiceName ||
        'Não classificado';

      if (!grouped.has(serviceName)) {
        grouped.set(serviceName, { name: serviceName, custo: 0, contratos: 0 });
      }

      const current = grouped.get(serviceName)!;
      current.custo += parseCurrency(contract.value);
      current.contratos += 1;
    }

    return [...grouped.values()].sort((a, b) => b.custo - a.custo).slice(0, 8);
  }, [contractsByTicket, filteredTickets]);

  const custoPorMaterial = useMemo(() => {
    const grouped = new Map<string, { name: string; custo: number; usos: number; unit?: string | null }>();

    for (const ticket of filteredTickets) {
      const contract = contractsByTicket[ticket.id];
      if (!contract?.items?.length) continue;

      for (const item of contract.items) {
        const materialName = item.materialName || item.description || 'Material não identificado';
        if (!grouped.has(materialName)) {
          grouped.set(materialName, { name: materialName, custo: 0, usos: 0, unit: item.unit || null });
        }

        const current = grouped.get(materialName)!;
        current.custo += resolveItemValue(item);
        current.usos += 1;
        if (!current.unit && item.unit) current.unit = item.unit;
      }
    }

    return [...grouped.values()].sort((a, b) => b.custo - a.custo).slice(0, 10);
  }, [contractsByTicket, filteredTickets]);

  const averageResolutionDays = useMemo(() => {
    const closed = filteredTickets.filter(ticket => ticket.status === TICKET_STATUS.CLOSED);
    const durations = closed.map(ticket => {
      const closedAt = ticket.closureChecklist?.closedAt || ticket.guarantee?.startAt;
      return closedAt ? daysBetween(ticket.time, closedAt) : daysBetween(ticket.time, new Date());
    });
    return average(durations);
  }, [filteredTickets]);

  const pendingPaymentsCount = useMemo(
    () => filteredTickets.filter(ticket => ticket.status === TICKET_STATUS.WAITING_PAYMENT).length,
    [filteredTickets]
  );

  const financialOverview = useMemo(() => {
    return contractValues.reduce(
      (acc, entry) => {
        acc.contracted += entry.contractValue;
        acc.planned += entry.plannedValue > 0 ? entry.plannedValue : entry.contractValue;
        acc.paid += entry.paidValue;
        return acc;
      },
      { contracted: 0, planned: 0, paid: 0 }
    );
  }, [contractValues]);

  const financialBalance = Math.max(0, financialOverview.planned - financialOverview.paid);

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 border-b border-roman-border pb-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Dashboard Gerencial</h1>
            <p className="text-roman-text-sub font-serif italic">Indicadores reais de volume, custos, prazos, serviços e materiais.</p>
          </div>

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
              Últimos 12 Meses
            </button>
          </div>
        </header>

        <div className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            value={selectedRegion}
            onChange={event => {
              setSelectedRegion(event.target.value);
              setSelectedSite('all');
            }}
            className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-surface text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
          >
            <option value="all">Todas as regiões</option>
            {regionOptions.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>

          <select
            value={selectedSite}
            onChange={event => setSelectedSite(event.target.value)}
            className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-surface text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
          >
            <option value="all">Todas as sedes</option>
            {siteOptions.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>

          <select
            value={selectedVendor}
            onChange={event => setSelectedVendor(event.target.value)}
            className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-surface text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
          >
            <option value="all">Todos os fornecedores</option>
            {vendorOptions.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setSelectedRegion('all');
              setSelectedSite('all');
              setSelectedVendor('all');
            }}
            className="px-4 py-2 border border-roman-border rounded-sm text-sm font-medium text-roman-text-main hover:border-roman-primary hover:bg-roman-surface"
          >
            Limpar filtros
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <DollarSign size={64} />
            </div>
            <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Maior Custo do Período</h3>
            <div className="text-2xl font-medium text-roman-text-main mb-1">R$ {maiorCusto.valor.toLocaleString('pt-BR')}</div>
            <div className="text-sm text-roman-text-sub truncate mb-4" title={maiorCusto.subject}>{maiorCusto.subject}</div>
            <div className="flex items-center gap-2 text-xs font-medium text-red-600 bg-red-50 w-fit px-2 py-1 rounded-sm border border-red-100">
              <TrendingUp size={12} /> {maiorCusto.id} • {maiorCusto.sede}
            </div>
          </div>

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

          <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Clock size={64} />
            </div>
            <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">SLA Médio de Resolução</h3>
            <div className="text-2xl font-medium text-roman-text-main mb-1">{averageResolutionDays.toFixed(1)} dias</div>
            <div className="text-sm text-roman-text-sub mb-4">{pendingPaymentsCount} OS aguardando pagamento</div>
            <div className="flex items-center gap-2 text-xs font-medium text-green-700 bg-green-50 w-fit px-2 py-1 rounded-sm border border-green-100">
              <TrendingDown size={12} /> visão baseada nas OS do período
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
            <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Serviço com Maior Custo</h3>
            <div className="text-xl font-medium text-roman-text-main mb-1">{custoPorServico[0]?.name || 'Sem dados'}</div>
            <div className="text-sm text-roman-text-sub mb-4">{custoPorServico[0]?.contratos || 0} contrato(s)</div>
            <div className="flex items-center gap-2 text-xs font-medium text-roman-text-main bg-roman-bg w-fit px-2 py-1 rounded-sm border border-roman-border">
              Total: R$ {(custoPorServico[0]?.custo || 0).toLocaleString('pt-BR')}
            </div>
          </div>

          <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
            <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Material com Maior Custo</h3>
            <div className="text-xl font-medium text-roman-text-main mb-1">{custoPorMaterial[0]?.name || 'Sem dados'}</div>
            <div className="text-sm text-roman-text-sub mb-4">{custoPorMaterial[0]?.usos || 0} ocorrência(s) no escopo contratado</div>
            <div className="flex items-center gap-2 text-xs font-medium text-roman-text-main bg-roman-bg w-fit px-2 py-1 rounded-sm border border-roman-border">
              Total: R$ {(custoPorMaterial[0]?.custo || 0).toLocaleString('pt-BR')}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
            <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Previsto no Período</h3>
            <div className="text-2xl font-medium text-roman-text-main mb-1">R$ {financialOverview.planned.toLocaleString('pt-BR')}</div>
            <div className="text-sm text-roman-text-sub">Parcelas geradas ou valor contratado como referência</div>
          </div>

          <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
            <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Pago no Período</h3>
            <div className="text-2xl font-medium text-roman-text-main mb-1">R$ {financialOverview.paid.toLocaleString('pt-BR')}</div>
            <div className="text-sm text-roman-text-sub">Somatório das parcelas efetivamente quitadas</div>
          </div>

          <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
            <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Saldo Financeiro</h3>
            <div className="text-2xl font-medium text-roman-text-main mb-1">R$ {financialBalance.toLocaleString('pt-BR')}</div>
            <div className="text-sm text-roman-text-sub">Diferença entre previsto e pago no período</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm min-w-0">
            <h2 className="font-serif text-lg font-medium text-roman-text-main mb-6">Volume de OS: abertas vs. fechadas</h2>
            <div className="h-72 min-w-0 min-h-[18rem]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={osPorRegiao} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} dx={-10} />
                  <Tooltip cursor={{ fill: '#f5f5f5' }} contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '2px', fontSize: '12px' }} itemStyle={{ color: '#1a1a1a' }} />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar dataKey="abertas" name="Em aberto" stackId="a" fill="#a3a3a3" barSize={40} />
                  <Bar dataKey="fechadas" name="Concluídas" stackId="a" fill="#1a1a1a" radius={[2, 2, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm min-w-0">
            <h2 className="font-serif text-lg font-medium text-roman-text-main mb-6">Tempo médio por etapa</h2>
            <div className="h-72 min-w-0 min-h-[18rem]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={tempoPorEtapa} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e5e5" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} width={90} />
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm min-w-0">
            <h2 className="font-serif text-lg font-medium text-roman-text-main mb-6">Custo total por sede</h2>
            <div className="h-72 min-w-0 min-h-[18rem]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={custoPorSede} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} dx={-10} tickFormatter={value => `R$ ${value / 1000}k`} />
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

          <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm min-w-0">
            <h2 className="font-serif text-lg font-medium text-roman-text-main mb-6">Custo por serviço (top 8)</h2>
            <div className="h-72 min-w-0 min-h-[18rem]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={custoPorServico} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e5e5" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} tickFormatter={value => `R$ ${Math.round(value / 1000)}k`} />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} width={130} />
                  <Tooltip
                    cursor={{ fill: '#f5f5f5' }}
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '2px', fontSize: '12px' }}
                    itemStyle={{ color: '#1a1a1a' }}
                    formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Custo']}
                  />
                  <Bar dataKey="custo" fill="#525252" radius={[0, 2, 2, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4 mb-6">
            <h2 className="font-serif text-lg font-medium text-roman-text-main">Materiais com maior custo</h2>
            <div className="text-xs text-roman-text-sub">Baseada no escopo contratado das OS do período</div>
          </div>
          {custoPorMaterial.length === 0 ? (
            <div className="border border-dashed border-roman-border rounded-sm p-6 bg-roman-bg text-sm text-roman-text-sub">
              Ainda não há itens de contrato suficientes para consolidar custo por material.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {custoPorMaterial.map(item => (
                <div key={item.name} className="border border-roman-border rounded-sm bg-roman-bg px-4 py-3">
                  <div className="text-sm font-medium text-roman-text-main">{item.name}</div>
                  <div className="text-[11px] text-roman-text-sub">
                    {item.usos} ocorrência(s){item.unit ? ` • ${item.unit}` : ''}
                  </div>
                  <div className="mt-2 text-lg font-serif text-roman-text-main">R$ {item.custo.toLocaleString('pt-BR')}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
