import React, { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis, BarChart, Bar, Legend } from 'recharts';
import { Briefcase, Clock, DollarSign, TrendingDown, TrendingUp } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EmptyState } from '../components/ui/EmptyState';
import { fetchCatalog, type CatalogRegion, type CatalogSite } from '../services/catalogApi';
import { fetchProcurementData } from '../services/procurementApi';
import type { ContractRecord, PaymentRecord } from '../types';
import { TICKET_STATUS } from '../constants/ticketStatus';
import { getTicketRegionLabel, getTicketSiteLabel } from '../utils/ticketTerritory';

function parseCurrency(value: string) {
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrencyBRL(value: number) {
  return `R$ ${value.toLocaleString('pt-BR')}`;
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
  const [perspective, setPerspective] = useState<'managerial' | 'financial'>('managerial');
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedSite, setSelectedSite] = useState('all');
  const [selectedVendor, setSelectedVendor] = useState('all');
  const [contractsByTicket, setContractsByTicket] = useState<Record<string, ContractRecord>>({});
  const [paymentsByTicket, setPaymentsByTicket] = useState<Record<string, PaymentRecord[]>>({});
  const [regions, setRegions] = useState<CatalogRegion[]>([]);
  const [sites, setSites] = useState<CatalogSite[]>([]);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const catalog = await fetchCatalog();
        if (!cancelled) {
          setRegions(catalog.regions);
          setSites(catalog.sites);
        }
      } catch {
        if (!cancelled) {
          setRegions([]);
          setSites([]);
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
      const values: string[] = periodTickets.map(ticket => getTicketRegionLabel(ticket, regions, sites)).filter((value): value is string => Boolean(value));
      const fallbackValues: string[] = regions.map(region => region.name).filter((value): value is string => Boolean(value));
      const source = values.length ? values : fallbackValues;
      return [...new Set(source)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    },
    [periodTickets, regions, sites]
  );

  const selectedRegionId = useMemo(() => {
    if (selectedRegion === 'all') return null;
    return regions.find(region => region.name === selectedRegion)?.id || null;
  }, [regions, selectedRegion]);

  const siteOptions = useMemo(
    () => {
      const values: string[] = periodTickets
        .filter(ticket => selectedRegion === 'all' || getTicketRegionLabel(ticket, regions, sites) === selectedRegion)
        .map(ticket => getTicketSiteLabel(ticket, sites))
        .filter((value): value is string => Boolean(value));
      const fallbackValues: string[] = sites
        .filter(site => selectedRegion === 'all' || !selectedRegionId || site.regionId === selectedRegionId)
        .map(site => site.code || site.name)
        .filter((value): value is string => Boolean(value));
      const source = values.length ? values : fallbackValues;
      return [...new Set(source)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    },
    [periodTickets, selectedRegion, selectedRegionId, regions, sites]
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
      if (selectedRegion !== 'all' && getTicketRegionLabel(ticket, regions, sites) !== selectedRegion) return false;
      if (selectedSite !== 'all' && getTicketSiteLabel(ticket, sites) !== selectedSite) return false;
      if (selectedVendor !== 'all') {
        const vendor = contractsByTicket[ticket.id]?.vendor || '';
        if (vendor !== selectedVendor) return false;
      }
      return true;
    });
  }, [contractsByTicket, periodTickets, regions, selectedRegion, selectedSite, selectedVendor, sites]);

  const osPorSede = useMemo(() => {
    const grouped = new Map<string, { name: string; abertas: number; fechadas: number }>();
    for (const ticket of filteredTickets) {
      const siteLabel = getTicketSiteLabel(ticket, sites);
      if (!grouped.has(siteLabel)) {
        grouped.set(siteLabel, { name: siteLabel, abertas: 0, fechadas: 0 });
      }
      const current = grouped.get(siteLabel)!;
      if (ticket.status === TICKET_STATUS.CLOSED) current.fechadas += 1;
      else current.abertas += 1;
    }
    return [...grouped.values()].sort((a, b) => b.abertas + b.fechadas - (a.abertas + a.fechadas));
  }, [filteredTickets, sites]);

  const backlogPorEtapa = useMemo(() => {
    const grouped = new Map<string, { name: string; abertas: number; fechadas: number }>();
    const buckets = [
      { name: 'Nova OS', match: (status: string) => status === TICKET_STATUS.NEW },
      { name: 'Triagem', match: (status: string) => status === TICKET_STATUS.WAITING_TECH_OPINION || status === TICKET_STATUS.WAITING_SOLUTION_APPROVAL },
      { name: 'Orçamento', match: (status: string) => status === TICKET_STATUS.WAITING_BUDGET || status === TICKET_STATUS.WAITING_BUDGET_APPROVAL || status === TICKET_STATUS.WAITING_CONTRACT_APPROVAL },
      { name: 'Preliminar', match: (status: string) => status === TICKET_STATUS.WAITING_PRELIM_ACTIONS },
      { name: 'Execução', match: (status: string) => status === TICKET_STATUS.IN_PROGRESS },
      { name: 'Validação', match: (status: string) => status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL },
      { name: 'Pagamento', match: (status: string) => status === TICKET_STATUS.WAITING_PAYMENT },
    ];

    return buckets.map(bucket => ({
      name: bucket.name,
      total: filteredTickets.filter(ticket => bucket.match(ticket.status)).length,
    }));
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

  const tendenciaMensal = useMemo(() => {
    const months = new Map<string, { name: string; abertas: number; encerradas: number }>();
    const formatter = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' });

    const ensureBucket = (date: Date) => {
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      if (!months.has(key)) {
        months.set(key, {
          name: formatter.format(date).replace('.', ''),
          abertas: 0,
          encerradas: 0,
        });
      }
      return months.get(key)!;
    };

    for (const ticket of filteredTickets) {
      ensureBucket(ticket.time).abertas += 1;

      const closedAt = ticket.closureChecklist?.closedAt || ticket.guarantee?.startAt;
      if (closedAt instanceof Date) {
        ensureBucket(closedAt).encerradas += 1;
      }
    }

    return [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, value]) => value);
  }, [filteredTickets]);

  const agingBuckets = useMemo(() => {
    const buckets = [
      { name: '0-7 dias', min: 0, max: 7 },
      { name: '8-15 dias', min: 8, max: 15 },
      { name: '16-30 dias', min: 16, max: 30 },
      { name: '31-60 dias', min: 31, max: 60 },
      { name: '60+ dias', min: 61, max: Number.POSITIVE_INFINITY },
    ];

    return buckets.map(bucket => ({
      name: bucket.name,
      total: filteredTickets.filter(ticket => {
        if (ticket.status === TICKET_STATUS.CLOSED || ticket.status === TICKET_STATUS.CANCELED) return false;
        const age = Math.floor(daysBetween(ticket.time, new Date()));
        return age >= bucket.min && age <= bucket.max;
      }).length,
    }));
  }, [filteredTickets]);

  const backlogPorEquipe = useMemo(() => {
    const grouped = new Map<string, { name: string; total: number }>();

    for (const ticket of filteredTickets) {
      if (ticket.status === TICKET_STATUS.CLOSED || ticket.status === TICKET_STATUS.CANCELED) continue;
      const team = ticket.assignedTeam || 'Não atribuído';
      if (!grouped.has(team)) {
        grouped.set(team, { name: team, total: 0 });
      }
      grouped.get(team)!.total += 1;
    }

    return [...grouped.values()].sort((a, b) => b.total - a.total).slice(0, 8);
  }, [filteredTickets]);

  const distribuicaoUrgencia = useMemo(() => {
    const grouped = new Map<string, { name: string; total: number }>();

    for (const ticket of filteredTickets) {
      const priority = ticket.priority || 'Não definida';
      if (!grouped.has(priority)) {
        grouped.set(priority, { name: priority, total: 0 });
      }
      grouped.get(priority)!.total += 1;
    }

    return [...grouped.values()].sort((a, b) => b.total - a.total);
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
      sede: getTicketSiteLabel(target.ticket, sites),
    };
  }, [contractValues, sites]);

  const custoPorSede = useMemo(() => {
    const grouped = new Map<string, { name: string; custo: number }>();
    for (const entry of contractValues) {
      const siteLabel = getTicketSiteLabel(entry.ticket, sites);
      if (!grouped.has(siteLabel)) {
        grouped.set(siteLabel, { name: siteLabel, custo: 0 });
      }
      grouped.get(siteLabel)!.custo += entry.value;
    }
    return [...grouped.values()].sort((a, b) => b.custo - a.custo);
  }, [contractValues, sites]);

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

  const waitingValidationCount = useMemo(
    () => filteredTickets.filter(ticket => ticket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL).length,
    [filteredTickets]
  );

  const urgentOpenCount = useMemo(
    () =>
      filteredTickets.filter(ticket =>
        (ticket.priority === 'Urgente' || ticket.priority === 'Alta') &&
        ticket.status !== TICKET_STATUS.CLOSED &&
        ticket.status !== TICKET_STATUS.CANCELED
      ).length,
    [filteredTickets]
  );

  const ticketsInGuaranteeCount = useMemo(
    () =>
      filteredTickets.filter(ticket =>
        ticket.status === TICKET_STATUS.CLOSED &&
        ticket.guarantee?.endAt instanceof Date &&
        ticket.guarantee.endAt.getTime() >= Date.now()
      ).length,
    [filteredTickets]
  );

  const oldestOpenTicket = useMemo(() => {
    const openTickets = filteredTickets.filter(ticket => ticket.status !== TICKET_STATUS.CLOSED && ticket.status !== TICKET_STATUS.CANCELED);
    const oldest = [...openTickets].sort((a, b) => a.time.getTime() - b.time.getTime())[0];
    if (!oldest) return null;
    return {
      id: oldest.id,
      subject: oldest.subject,
      days: Math.floor(daysBetween(oldest.time, new Date())),
      site: getTicketSiteLabel(oldest, sites),
    };
  }, [filteredTickets, sites]);

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

  const financeiroPorSede = useMemo(() => {
    const grouped = new Map<string, { name: string; previsto: number; pago: number; saldo: number }>();

    for (const entry of contractValues) {
      const siteLabel = getTicketSiteLabel(entry.ticket, sites);
      if (!grouped.has(siteLabel)) {
        grouped.set(siteLabel, { name: siteLabel, previsto: 0, pago: 0, saldo: 0 });
      }
      const current = grouped.get(siteLabel)!;
      const previsto = entry.plannedValue > 0 ? entry.plannedValue : entry.contractValue;
      current.previsto += previsto;
      current.pago += entry.paidValue;
      current.saldo += Math.max(0, previsto - entry.paidValue);
    }

    return [...grouped.values()].sort((a, b) => b.saldo - a.saldo);
  }, [contractValues, sites]);

  const financeiroPorFornecedor = useMemo(() => {
    const grouped = new Map<string, { name: string; contratos: number; previsto: number; pago: number; saldo: number }>();

    for (const entry of contractValues) {
      const vendor = contractsByTicket[entry.ticket.id]?.vendor || 'Fornecedor não informado';
      if (!grouped.has(vendor)) {
        grouped.set(vendor, { name: vendor, contratos: 0, previsto: 0, pago: 0, saldo: 0 });
      }
      const current = grouped.get(vendor)!;
      const previsto = entry.plannedValue > 0 ? entry.plannedValue : entry.contractValue;
      current.contratos += 1;
      current.previsto += previsto;
      current.pago += entry.paidValue;
      current.saldo += Math.max(0, previsto - entry.paidValue);
    }

    return [...grouped.values()].sort((a, b) => b.saldo - a.saldo).slice(0, 8);
  }, [contractValues, contractsByTicket]);

  const calendarioFinanceiro = useMemo(() => {
    const grouped = new Map<string, { name: string; previsto: number; pago: number }>();
    const formatter = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' });

    const ensureBucket = (date: Date) => {
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      if (!grouped.has(key)) {
        grouped.set(key, { name: formatter.format(date).replace('.', ''), previsto: 0, pago: 0 });
      }
      return grouped.get(key)!;
    };

    for (const payments of Object.values(paymentsByTicket) as PaymentRecord[][]) {
      for (const payment of payments) {
        if (payment.dueAt instanceof Date) {
          ensureBucket(payment.dueAt).previsto += parseCurrency(payment.value);
        }
        if (payment.status === 'paid' && payment.paidAt instanceof Date) {
          ensureBucket(payment.paidAt).pago += parseCurrency(payment.value);
        }
      }
    }

    return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, value]) => value);
  }, [paymentsByTicket]);

  const maioresSaldosPendentes = useMemo(() => {
    return contractValues
      .map(entry => {
        const previsto = entry.plannedValue > 0 ? entry.plannedValue : entry.contractValue;
        const saldo = Math.max(0, previsto - entry.paidValue);
        const nextDueDate = (paymentsByTicket[entry.ticket.id] || [])
          .filter(payment => payment.status !== 'paid')
          .sort((a, b) => {
            const aTime = a.dueAt instanceof Date ? a.dueAt.getTime() : Number.POSITIVE_INFINITY;
            const bTime = b.dueAt instanceof Date ? b.dueAt.getTime() : Number.POSITIVE_INFINITY;
            return aTime - bTime;
          })[0]?.dueAt;

        return {
          id: entry.ticket.id,
          subject: entry.ticket.subject,
          site: getTicketSiteLabel(entry.ticket, sites),
          vendor: contractsByTicket[entry.ticket.id]?.vendor || 'Fornecedor não informado',
          saldo,
          nextDueDate,
        };
      })
      .filter(entry => entry.saldo > 0)
      .sort((a, b) => b.saldo - a.saldo)
      .slice(0, 6);
  }, [contractValues, contractsByTicket, paymentsByTicket, sites]);

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 border-b border-roman-border pb-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">
              {perspective === 'managerial' ? 'KPI Gerencial' : 'KPI Financeiro'}
            </h1>
            <p className="text-roman-text-sub font-serif italic">
              {perspective === 'managerial'
                ? 'Operação por sede, tendência, backlog, envelhecimento e capacidade de resposta.'
                : 'Previsto, pago, saldo, concentração de custo e passivo financeiro por recorte.'}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex bg-roman-surface border border-roman-border rounded-sm p-1">
              <button
                onClick={() => setPerspective('managerial')}
                className={`px-4 py-1.5 text-sm font-medium rounded-sm transition-colors ${perspective === 'managerial' ? 'bg-roman-primary text-white shadow-sm' : 'text-roman-text-sub hover:text-roman-text-main hover:bg-roman-bg'}`}
              >
                Visão Gerencial
              </button>
              <button
                onClick={() => setPerspective('financial')}
                className={`px-4 py-1.5 text-sm font-medium rounded-sm transition-colors ${perspective === 'financial' ? 'bg-roman-primary text-white shadow-sm' : 'text-roman-text-sub hover:text-roman-text-main hover:bg-roman-bg'}`}
              >
                Visão Financeira
              </button>
            </div>
            <div className="flex bg-roman-surface border border-roman-border rounded-sm p-1 self-end">
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

        {perspective === 'managerial' ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Briefcase size={64} />
                </div>
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">OS no Período</h3>
                <div className="text-2xl font-medium text-roman-text-main mb-1">{filteredTickets.length}</div>
                <div className="text-sm text-roman-text-sub mb-4">
                  {filteredTickets.filter(ticket => ticket.status !== TICKET_STATUS.CLOSED && ticket.status !== TICKET_STATUS.CANCELED).length} em aberto
                </div>
                <div className="flex items-center gap-2 text-xs font-medium text-roman-text-main bg-roman-bg w-fit px-2 py-1 rounded-sm border border-roman-border">
                  Encerradas: {filteredTickets.filter(ticket => ticket.status === TICKET_STATUS.CLOSED).length}
                </div>
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Clock size={64} />
                </div>
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">SLA Médio de Resolução</h3>
                <div className="text-2xl font-medium text-roman-text-main mb-1">{averageResolutionDays.toFixed(1)} dias</div>
                <div className="text-sm text-roman-text-sub mb-4">{waitingValidationCount} OS aguardando validação do solicitante</div>
                <div className="flex items-center gap-2 text-xs font-medium text-green-700 bg-green-50 w-fit px-2 py-1 rounded-sm border border-green-100">
                  <TrendingDown size={12} /> visão baseada nas OS do período
                </div>
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <TrendingUp size={64} />
                </div>
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Fila Operacional</h3>
                <div className="text-2xl font-medium text-roman-text-main mb-1">
                  {filteredTickets.filter(ticket =>
                    ticket.status === TICKET_STATUS.WAITING_PRELIM_ACTIONS ||
                    ticket.status === TICKET_STATUS.IN_PROGRESS ||
                    ticket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL
                  ).length}
                </div>
                <div className="text-sm text-roman-text-sub mb-4">Em preparação, execução ou validação</div>
                <div className="flex items-center gap-2 text-xs font-medium text-roman-text-main bg-roman-bg w-fit px-2 py-1 rounded-sm border border-roman-border">
                  Urgentes em aberto: {urgentOpenCount}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Aguardando Validação</h3>
                <div className="text-2xl font-medium text-roman-text-main mb-1">{waitingValidationCount}</div>
                <div className="text-sm text-roman-text-sub">OS concluídas aguardando retorno do solicitante</div>
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Urgentes em Aberto</h3>
                <div className="text-2xl font-medium text-roman-text-main mb-1">{urgentOpenCount}</div>
                <div className="text-sm text-roman-text-sub">Prioridade urgente ou alta ainda sem encerramento</div>
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">OS em Garantia</h3>
                <div className="text-2xl font-medium text-roman-text-main mb-1">{ticketsInGuaranteeCount}</div>
                <div className="text-sm text-roman-text-sub">Chamados encerrados ainda dentro do período de garantia</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Mais antiga em aberto</h3>
                <div className="text-2xl font-medium text-roman-text-main mb-1">{oldestOpenTicket ? `${oldestOpenTicket.days} dias` : '0 dia'}</div>
                <div className="text-sm text-roman-text-sub truncate" title={oldestOpenTicket?.subject || ''}>
                  {oldestOpenTicket ? `${oldestOpenTicket.id} · ${oldestOpenTicket.subject}` : 'Nenhuma OS aberta no recorte'}
                </div>
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Times com backlog</h3>
                <div className="text-2xl font-medium text-roman-text-main mb-1">{backlogPorEquipe.length}</div>
                <div className="text-sm text-roman-text-sub">
                  {backlogPorEquipe[0] ? `${backlogPorEquipe[0].name} lidera com ${backlogPorEquipe[0].total} OS` : 'Nenhuma fila ativa'}
                </div>
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Prioridade dominante</h3>
                <div className="text-2xl font-medium text-roman-text-main mb-1">{distribuicaoUrgencia[0]?.name || 'Não definida'}</div>
                <div className="text-sm text-roman-text-sub">
                  {distribuicaoUrgencia[0] ? `${distribuicaoUrgencia[0].total} OS no recorte atual` : 'Sem chamados no período'}
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
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

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Valor Contratado</h3>
                <div className="text-2xl font-medium text-roman-text-main mb-1">{formatCurrencyBRL(financialOverview.contracted)}</div>
                <div className="text-sm text-roman-text-sub">Base consolidada dos contratos fechados no período</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Fornecedores com saldo</h3>
                <div className="text-2xl font-medium text-roman-text-main mb-1">{financeiroPorFornecedor.length}</div>
                <div className="text-sm text-roman-text-sub">
                  {financeiroPorFornecedor[0] ? `${financeiroPorFornecedor[0].name} lidera o saldo em aberto` : 'Sem fornecedores com pendência'}
                </div>
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Maior saldo em aberto</h3>
                <div className="text-2xl font-medium text-roman-text-main mb-1">
                  {maioresSaldosPendentes[0] ? formatCurrencyBRL(maioresSaldosPendentes[0].saldo) : formatCurrencyBRL(0)}
                </div>
                <div className="text-sm text-roman-text-sub truncate" title={maioresSaldosPendentes[0]?.subject || ''}>
                  {maioresSaldosPendentes[0] ? `${maioresSaldosPendentes[0].id} · ${maioresSaldosPendentes[0].subject}` : 'Nenhuma pendência financeira no recorte'}
                </div>
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Parcelas pendentes</h3>
                <div className="text-2xl font-medium text-roman-text-main mb-1">
                  {(Object.values(paymentsByTicket) as PaymentRecord[][]).flat().filter(payment => payment.status !== 'paid').length}
                </div>
                <div className="text-sm text-roman-text-sub">Títulos ainda não quitados no recorte filtrado</div>
              </div>
            </div>
          </>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm min-w-0">
            <h2 className="font-serif text-lg font-medium text-roman-text-main mb-6">
              {perspective === 'managerial' ? 'Volume de OS por sede: abertas vs. fechadas' : 'Custo total por sede'}
            </h2>
            <div className="h-72 min-w-0 min-h-[18rem]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={perspective === 'managerial' ? osPorSede : custoPorSede} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} dy={10} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#737373' }}
                    dx={-10}
                    tickFormatter={perspective === 'managerial' ? undefined : (value => `R$ ${value / 1000}k`)}
                  />
                  <Tooltip
                    cursor={{ fill: '#f5f5f5' }}
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '2px', fontSize: '12px' }}
                    itemStyle={{ color: '#1a1a1a' }}
                    formatter={perspective === 'managerial' ? undefined : ((value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Custo'])}
                  />
                  {perspective === 'managerial' ? (
                    <>
                      <Legend wrapperStyle={{ paddingTop: '20px' }} />
                      <Bar dataKey="abertas" name="Em aberto" stackId="a" fill="#a3a3a3" barSize={40} />
                      <Bar dataKey="fechadas" name="Concluídas" stackId="a" fill="#1a1a1a" radius={[2, 2, 0, 0]} barSize={40} />
                    </>
                  ) : (
                    <Bar dataKey="custo" fill="#1a1a1a" radius={[2, 2, 0, 0]} barSize={40} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm min-w-0">
            <h2 className="font-serif text-lg font-medium text-roman-text-main mb-6">
              {perspective === 'managerial' ? 'Tempo médio por etapa' : 'Custo por serviço (top 8)'}
            </h2>
            <div className="h-72 min-w-0 min-h-[18rem]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={perspective === 'managerial' ? tempoPorEtapa : custoPorServico} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e5e5" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} tickFormatter={perspective === 'managerial' ? undefined : (value => `R$ ${Math.round(value / 1000)}k`)} />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} width={130} />
                  <Tooltip
                    cursor={{ fill: '#f5f5f5' }}
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '2px', fontSize: '12px' }}
                    itemStyle={{ color: '#1a1a1a' }}
                    formatter={perspective === 'managerial' ? ((value: number) => [`${value} dias`, 'Duração']) : ((value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Custo'])}
                  />
                  <Bar dataKey={perspective === 'managerial' ? 'dias' : 'custo'} fill="#525252" radius={[0, 2, 2, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {perspective === 'managerial' && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm min-w-0">
                <h2 className="font-serif text-lg font-medium text-roman-text-main mb-6">Backlog por etapa</h2>
                <div className="h-72 min-w-0 min-h-[18rem]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={backlogPorEtapa} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} dx={-10} allowDecimals={false} />
                      <Tooltip
                        cursor={{ fill: '#f5f5f5' }}
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '2px', fontSize: '12px' }}
                        itemStyle={{ color: '#1a1a1a' }}
                        formatter={(value: number) => [`${value}`, 'OS']}
                      />
                      <Bar dataKey="total" fill="#525252" radius={[2, 2, 0, 0]} barSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm min-w-0">
                <h2 className="font-serif text-lg font-medium text-roman-text-main mb-6">Tendência mensal: abertura x encerramento</h2>
                <div className="h-72 min-w-0 min-h-[18rem]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={tendenciaMensal} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} dx={-10} allowDecimals={false} />
                      <Tooltip
                        cursor={{ fill: '#f5f5f5' }}
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '2px', fontSize: '12px' }}
                        itemStyle={{ color: '#1a1a1a' }}
                        formatter={(value: number, name: string) => [`${value}`, name === 'abertas' ? 'Abertas' : 'Encerradas']}
                      />
                      <Legend wrapperStyle={{ paddingTop: '20px' }} />
                      <Bar dataKey="abertas" name="Abertas" fill="#a3a3a3" radius={[2, 2, 0, 0]} barSize={24} />
                      <Bar dataKey="encerradas" name="Encerradas" fill="#1a1a1a" radius={[2, 2, 0, 0]} barSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm min-w-0">
                <h2 className="font-serif text-lg font-medium text-roman-text-main mb-6">Envelhecimento do backlog</h2>
                <div className="h-72 min-w-0 min-h-[18rem]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={agingBuckets} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} allowDecimals={false} />
                      <Tooltip
                        cursor={{ fill: '#f5f5f5' }}
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '2px', fontSize: '12px' }}
                        itemStyle={{ color: '#1a1a1a' }}
                        formatter={(value: number) => [`${value}`, 'OS em aberto']}
                      />
                      <Bar dataKey="total" fill="#737373" radius={[2, 2, 0, 0]} barSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm min-w-0">
                <h2 className="font-serif text-lg font-medium text-roman-text-main mb-6">Backlog por equipe</h2>
                <div className="h-72 min-w-0 min-h-[18rem]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={backlogPorEquipe} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e5e5" />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} allowDecimals={false} />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} width={120} />
                      <Tooltip
                        cursor={{ fill: '#f5f5f5' }}
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '2px', fontSize: '12px' }}
                        itemStyle={{ color: '#1a1a1a' }}
                        formatter={(value: number) => [`${value}`, 'OS em aberto']}
                      />
                      <Bar dataKey="total" fill="#525252" radius={[0, 2, 2, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm min-w-0">
                <h2 className="font-serif text-lg font-medium text-roman-text-main mb-6">Distribuição por urgência</h2>
                <div className="h-72 min-w-0 min-h-[18rem]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={distribuicaoUrgencia} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} allowDecimals={false} />
                      <Tooltip
                        cursor={{ fill: '#f5f5f5' }}
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '2px', fontSize: '12px' }}
                        itemStyle={{ color: '#1a1a1a' }}
                        formatter={(value: number) => [`${value}`, 'OS']}
                      />
                      <Bar dataKey="total" fill="#1a1a1a" radius={[2, 2, 0, 0]} barSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4 mb-6">
                  <h2 className="font-serif text-lg font-medium text-roman-text-main">Alertas operacionais</h2>
                  <div className="text-xs text-roman-text-sub">Leitura rápida para acompanhamento gerencial</div>
                </div>
                <div className="space-y-3">
                  <div className="border border-roman-border rounded-sm bg-roman-bg px-4 py-3">
                    <div className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-1">OS mais antiga em aberto</div>
                    {oldestOpenTicket ? (
                      <>
                        <div className="text-sm font-medium text-roman-text-main">{oldestOpenTicket.id} · {oldestOpenTicket.subject}</div>
                        <div className="text-xs text-roman-text-sub">{oldestOpenTicket.site} · {oldestOpenTicket.days} dia(s) em aberto</div>
                      </>
                    ) : (
                      <div className="text-sm text-roman-text-sub">Nenhuma OS aberta no recorte atual.</div>
                    )}
                  </div>
                  <div className="border border-roman-border rounded-sm bg-roman-bg px-4 py-3">
                    <div className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-1">Triagem e orçamento</div>
                    <div className="text-sm font-medium text-roman-text-main">
                      {filteredTickets.filter(ticket =>
                        ticket.status === TICKET_STATUS.NEW ||
                        ticket.status === TICKET_STATUS.WAITING_TECH_OPINION ||
                        ticket.status === TICKET_STATUS.WAITING_BUDGET ||
                        ticket.status === TICKET_STATUS.WAITING_BUDGET_APPROVAL
                      ).length} OS aguardando decisão operacional
                    </div>
                  </div>
                  <div className="border border-roman-border rounded-sm bg-roman-bg px-4 py-3">
                    <div className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-1">Pagamento e garantia</div>
                    <div className="text-sm font-medium text-roman-text-main">
                      {pendingPaymentsCount} OS aguardando pagamento · {ticketsInGuaranteeCount} em garantia
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4 mb-6">
                  <h2 className="font-serif text-lg font-medium text-roman-text-main">Resumo operacional por foco</h2>
                  <div className="text-xs text-roman-text-sub">Onde concentrar a gestão agora</div>
                </div>
                <div className="space-y-3">
                  <div className="border border-roman-border rounded-sm bg-roman-bg px-4 py-3">
                    <div className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-1">Validação do solicitante</div>
                    <div className="text-sm font-medium text-roman-text-main">{waitingValidationCount} OS aguardando retorno final</div>
                  </div>
                  <div className="border border-roman-border rounded-sm bg-roman-bg px-4 py-3">
                    <div className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-1">Pressão de urgência</div>
                    <div className="text-sm font-medium text-roman-text-main">{urgentOpenCount} OS com prioridade alta ou urgente em aberto</div>
                  </div>
                  <div className="border border-roman-border rounded-sm bg-roman-bg px-4 py-3">
                    <div className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-1">Capacidade por equipe</div>
                    <div className="text-sm font-medium text-roman-text-main">
                      {backlogPorEquipe[0] ? `${backlogPorEquipe[0].name} concentra ${backlogPorEquipe[0].total} OS` : 'Nenhuma equipe com fila ativa'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {perspective === 'financial' && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm min-w-0">
                <h2 className="font-serif text-lg font-medium text-roman-text-main mb-6">Previsto x pago por sede</h2>
                <div className="h-72 min-w-0 min-h-[18rem]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={financeiroPorSede} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} tickFormatter={value => `R$ ${Math.round(value / 1000)}k`} />
                      <Tooltip
                        cursor={{ fill: '#f5f5f5' }}
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '2px', fontSize: '12px' }}
                        itemStyle={{ color: '#1a1a1a' }}
                        formatter={(value: number, name: string) => [formatCurrencyBRL(value), name === 'previsto' ? 'Previsto' : 'Pago']}
                      />
                      <Legend wrapperStyle={{ paddingTop: '20px' }} />
                      <Bar dataKey="previsto" name="Previsto" fill="#a3a3a3" radius={[2, 2, 0, 0]} barSize={24} />
                      <Bar dataKey="pago" name="Pago" fill="#1a1a1a" radius={[2, 2, 0, 0]} barSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm min-w-0">
                <h2 className="font-serif text-lg font-medium text-roman-text-main mb-6">Saldo por fornecedor</h2>
                <div className="h-72 min-w-0 min-h-[18rem]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={financeiroPorFornecedor} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e5e5" />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} tickFormatter={value => `R$ ${Math.round(value / 1000)}k`} />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} width={130} />
                      <Tooltip
                        cursor={{ fill: '#f5f5f5' }}
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '2px', fontSize: '12px' }}
                        itemStyle={{ color: '#1a1a1a' }}
                        formatter={(value: number) => [formatCurrencyBRL(value), 'Saldo']}
                      />
                      <Bar dataKey="saldo" fill="#525252" radius={[0, 2, 2, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm min-w-0">
                <h2 className="font-serif text-lg font-medium text-roman-text-main mb-6">Calendário financeiro</h2>
                <div className="h-72 min-w-0 min-h-[18rem]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={calendarioFinanceiro} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} tickFormatter={value => `R$ ${Math.round(value / 1000)}k`} />
                      <Tooltip
                        cursor={{ fill: '#f5f5f5' }}
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '2px', fontSize: '12px' }}
                        itemStyle={{ color: '#1a1a1a' }}
                        formatter={(value: number, name: string) => [formatCurrencyBRL(value), name === 'previsto' ? 'Previsto' : 'Pago']}
                      />
                      <Legend wrapperStyle={{ paddingTop: '20px' }} />
                      <Bar dataKey="previsto" name="Previsto" fill="#a3a3a3" radius={[2, 2, 0, 0]} barSize={24} />
                      <Bar dataKey="pago" name="Pago" fill="#1a1a1a" radius={[2, 2, 0, 0]} barSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4 mb-6">
                  <h2 className="font-serif text-lg font-medium text-roman-text-main">Maiores saldos pendentes</h2>
                  <div className="text-xs text-roman-text-sub">Leitura rápida do passivo financeiro atual</div>
                </div>
                <div className="space-y-3">
                  {maioresSaldosPendentes.length === 0 ? (
                    <div className="border border-dashed border-roman-border rounded-sm p-6 bg-roman-bg text-sm text-roman-text-sub">
                      Nenhuma OS com saldo financeiro pendente no recorte atual.
                    </div>
                  ) : (
                    maioresSaldosPendentes.map(item => (
                      <div key={item.id} className="border border-roman-border rounded-sm bg-roman-bg px-4 py-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-sm font-medium text-roman-text-main">{item.id} · {item.subject}</div>
                            <div className="text-xs text-roman-text-sub">{item.site} · {item.vendor}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium text-roman-text-main">{formatCurrencyBRL(item.saldo)}</div>
                            <div className="text-xs text-roman-text-sub">
                              {item.nextDueDate instanceof Date ? `Próx. venc.: ${item.nextDueDate.toLocaleDateString('pt-BR')}` : 'Sem vencimento futuro'}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
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
                      <div className="mt-2 text-lg font-serif text-roman-text-main">{formatCurrencyBRL(item.custo)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}



