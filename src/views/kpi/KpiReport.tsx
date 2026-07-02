import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';

/**
 * Relatório gerencial de OS pronto pra impressão / "Salvar como PDF" (só números
 * gerenciais — sem financeiro). Layout dedicado, sempre em tema claro (independe do
 * tema do app), gráficos de tamanho fixo e SEM animação pra renderizar na hora da
 * impressão. Renderizado fora da tela pelo KpiView; o CSS de `@media print` (em
 * index.css) esconde o app e mostra só `.kpi-report-print`.
 */

const C = {
  ink: '#171513',
  sub: '#465563',
  gold: '#b08d57',
  green: '#5f8468',
  line: '#d8cec0',
  softline: '#ebe3d8',
  soft: '#faf8f4',
};

const CHART_W = 655;

export interface KpiReportData {
  periodoLabel: string;
  sedeLabel: string;
  regiaoLabel: string;
  geradoEm: string;
  totalOs: number;
  abertas: number;
  encerradas: number;
  canceladas: number;
  urgentesAbertas: number;
  osMaisAntigaDias: number | null;
  osPorSede: Array<{ name: string; abertas: number; fechadas: number }>;
  backlogPorEtapa: Array<{ name: string; total: number }>;
  agingBuckets: Array<{ name: string; total: number }>;
  tempoPorEtapa: Array<{ name: string; dias: number }>;
  tendenciaMensal: Array<{ name: string; abertas: number; encerradas: number }>;
  distribuicaoUrgencia: Array<{ name: string; total: number }>;
  backlogPorEquipe: Array<{ name: string; total: number }>;
}

function Card({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        border: `1px solid ${C.softline}`,
        borderRadius: 8,
        padding: '10px 12px',
        background: C.soft,
      }}
    >
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.sub }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 600, color: C.ink, lineHeight: 1.1, marginTop: 2 }}>{value}</div>
      {hint ? <div style={{ fontSize: 10, color: C.sub, marginTop: 2 }}>{hint}</div> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 20, breakInside: 'avoid' }}>
      <h2
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: C.ink,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          borderBottom: `2px solid ${C.gold}`,
          paddingBottom: 4,
          marginBottom: 10,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Table({ cols, rows }: { cols: string[]; rows: Array<Array<string | number>> }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
      <thead>
        <tr>
          {cols.map((col, i) => (
            <th
              key={col}
              style={{
                textAlign: i === 0 ? 'left' : 'right',
                padding: '5px 8px',
                borderBottom: `1px solid ${C.line}`,
                color: C.sub,
                fontWeight: 600,
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={cols.length} style={{ padding: '8px', color: C.sub, fontStyle: 'italic' }}>
              Sem dados no período/filtro.
            </td>
          </tr>
        ) : (
          rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    textAlign: ci === 0 ? 'left' : 'right',
                    padding: '5px 8px',
                    borderBottom: `1px solid ${C.softline}`,
                    color: ci === 0 ? C.ink : C.sub,
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

const axisProps = { tick: { fontSize: 10, fill: C.sub }, stroke: C.line } as const;

export function KpiReport({ data }: { data: KpiReportData }) {
  return (
    <div
      className="kpi-report-print"
      style={{
        background: '#ffffff',
        color: C.ink,
        fontFamily: 'Manrope, Segoe UI, sans-serif',
        padding: 8,
        boxSizing: 'border-box',
      }}
    >
      {/* Cabeçalho */}
      <header style={{ borderBottom: `2px solid ${C.ink}`, paddingBottom: 10, marginBottom: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold, fontWeight: 700 }}>
              Grupo Christus · Serv3
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: C.ink, margin: '2px 0 0' }}>
              Relatório Gerencial de Ordens de Serviço
            </h1>
          </div>
          <div style={{ textAlign: 'right', fontSize: 10, color: C.sub, whiteSpace: 'nowrap' }}>
            Gerado em<br />
            <span style={{ color: C.ink, fontWeight: 600 }}>{data.geradoEm}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {[
            ['Período', data.periodoLabel],
            ['Sede', data.sedeLabel],
            ['Região', data.regiaoLabel],
          ].map(([k, v]) => (
            <span
              key={k}
              style={{
                fontSize: 11,
                border: `1px solid ${C.line}`,
                borderRadius: 999,
                padding: '3px 10px',
                background: C.soft,
              }}
            >
              <span style={{ color: C.sub }}>{k}: </span>
              <span style={{ color: C.ink, fontWeight: 600 }}>{v}</span>
            </span>
          ))}
        </div>
      </header>

      {/* Cards de resumo */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <Card label="Total de OS" value={data.totalOs} />
        <Card label="Abertas" value={data.abertas} />
        <Card label="Encerradas" value={data.encerradas} />
        <Card label="Urgentes/Altas abertas" value={data.urgentesAbertas} />
        <Card
          label="OS aberta mais antiga"
          value={data.osMaisAntigaDias == null ? '—' : `${data.osMaisAntigaDias}d`}
          hint={data.osMaisAntigaDias == null ? undefined : 'em aberto'}
        />
      </div>

      {/* OS por sede */}
      <Section title="OS por Sede">
        <BarChart width={CHART_W} height={220} data={data.osPorSede} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.softline} vertical={false} />
          <XAxis dataKey="name" {...axisProps} interval={0} angle={-18} textAnchor="end" height={48} />
          <YAxis allowDecimals={false} {...axisProps} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="abertas" name="Abertas" fill={C.gold} isAnimationActive={false} />
          <Bar dataKey="fechadas" name="Encerradas" fill={C.green} isAnimationActive={false} />
        </BarChart>
        <Table
          cols={['Sede', 'Abertas', 'Encerradas', 'Total']}
          rows={data.osPorSede.map(s => [s.name, s.abertas, s.fechadas, s.abertas + s.fechadas])}
        />
      </Section>

      {/* Backlog por etapa */}
      <Section title="Backlog por Etapa (OS na fila)">
        <BarChart width={CHART_W} height={200} data={data.backlogPorEtapa} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.softline} vertical={false} />
          <XAxis dataKey="name" {...axisProps} interval={0} angle={-18} textAnchor="end" height={44} />
          <YAxis allowDecimals={false} {...axisProps} />
          <Bar dataKey="total" name="OS" fill={C.gold} isAnimationActive={false} />
        </BarChart>
        <Table cols={['Etapa', 'OS na fila']} rows={data.backlogPorEtapa.map(e => [e.name, e.total])} />
      </Section>

      {/* Tendência mensal */}
      <Section title="Tendência Mensal (abertas × encerradas)">
        <BarChart width={CHART_W} height={200} data={data.tendenciaMensal} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.softline} vertical={false} />
          <XAxis dataKey="name" {...axisProps} interval={0} />
          <YAxis allowDecimals={false} {...axisProps} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="abertas" name="Abertas" fill={C.gold} isAnimationActive={false} />
          <Bar dataKey="encerradas" name="Encerradas" fill={C.green} isAnimationActive={false} />
        </BarChart>
      </Section>

      {/* Tabelas lado a lado */}
      <div style={{ display: 'flex', gap: 18, marginTop: 20, breakInside: 'avoid' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Section title="Idade do backlog">
            <Table cols={['Faixa', 'OS abertas']} rows={data.agingBuckets.map(a => [a.name, a.total])} />
          </Section>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Section title="Tempo médio por etapa">
            <Table cols={['Etapa', 'Dias (méd.)']} rows={data.tempoPorEtapa.map(t => [t.name, t.dias])} />
          </Section>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 18, marginTop: 4, breakInside: 'avoid' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Section title="Distribuição por prioridade">
            <Table cols={['Prioridade', 'OS']} rows={data.distribuicaoUrgencia.map(p => [p.name, p.total])} />
          </Section>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Section title="Backlog por equipe">
            <Table cols={['Equipe', 'OS na fila']} rows={data.backlogPorEquipe.map(t => [t.name, t.total])} />
          </Section>
        </div>
      </div>

      {/* Rodapé */}
      <footer style={{ marginTop: 22, paddingTop: 8, borderTop: `1px solid ${C.line}`, fontSize: 10, color: C.sub, display: 'flex', justifyContent: 'space-between' }}>
        <span>Serv3 — Gestão de OS · Grupo Christus</span>
        <span>Relatório gerencial (sem dados financeiros)</span>
      </footer>
    </div>
  );
}
