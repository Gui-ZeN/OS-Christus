import React from 'react';
import { createPortal } from 'react-dom';
import { Bar, BarChart, CartesianGrid, LabelList, Legend, XAxis, YAxis } from 'recharts';

/**
 * Relatório gerencial de OS pronto pra impressão / "Salvar como PDF" — pensado pra
 * diretoria/gerência. Layout editorial premium (serifada + ouro + brasão), sempre em
 * tema claro, gráficos de tamanho fixo e SEM animação (renderizam na hora).
 *
 * Renderizado num portal em document.body: fora da tela via `position:absolute`
 * enquanto não imprime (pro recharts medir); no `@media print` (index.css) o `#root`
 * some e o relatório vira `position:static` — assim PAGINA de verdade (absoluto
 * clipava em 1 página).
 */

const C = {
  ink: '#241f1b',
  body: '#4a4038',
  sub: '#8a7f74',
  gold: '#a67c3d',
  goldDeep: '#7d5c28',
  green: '#4a7a5c',
  line: '#e5ddd0',
  soft: '#faf7f2',
};
const SERIF = "'Source Serif 4', Georgia, serif";
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

function Stat({ label, value, hint, first }: { label: string; value: string | number; hint?: string; first?: boolean }) {
  return (
    <div style={{ flex: 1, padding: '12px 16px', borderLeft: first ? 'none' : `1px solid ${C.line}` }}>
      <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.sub, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 600, color: C.ink, lineHeight: 1.05, marginTop: 4 }}>
        {value}
      </div>
      {hint ? <div style={{ fontSize: 9.5, color: C.sub, marginTop: 2 }}>{hint}</div> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 22, breakInside: 'avoid' }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontFamily: SERIF, fontSize: 14, fontWeight: 600, color: C.ink }}>
        <span style={{ width: 16, height: 2.5, background: C.gold, display: 'inline-block' }} />
        {title}
      </h2>
      <div style={{ borderBottom: `1px solid ${C.line}`, marginTop: 6, marginBottom: 12 }} />
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
                padding: '5px 10px',
                borderBottom: `1.5px solid ${C.goldDeep}`,
                color: C.goldDeep,
                fontWeight: 700,
                fontSize: 9.5,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
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
            <td colSpan={cols.length} style={{ padding: '8px 10px', color: C.sub, fontStyle: 'italic' }}>
              Sem dados no período/filtro.
            </td>
          </tr>
        ) : (
          rows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 ? C.soft : 'transparent' }}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    textAlign: ci === 0 ? 'left' : 'right',
                    padding: '5px 10px',
                    borderBottom: `1px solid ${C.line}`,
                    color: ci === 0 ? C.ink : C.body,
                    fontWeight: ci === 0 ? 500 : 400,
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

const axis = { tick: { fontSize: 10, fill: C.body }, stroke: C.line } as const;
const labelStyle = { fontSize: 9, fill: C.sub, fontWeight: 600 } as const;

export function KpiReport({ data }: { data: KpiReportData }) {
  if (typeof document === 'undefined') return null;

  const highlights = [
    `${data.totalOs} OS no período`,
    `${data.abertas} em aberto`,
    `${data.urgentesAbertas} urgentes/altas`,
    data.osMaisAntigaDias != null ? `mais antiga há ${data.osMaisAntigaDias} dias` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

  const content = (
    <div
      className="kpi-report-print"
      style={{ background: '#ffffff', color: C.body, fontFamily: 'Manrope, Segoe UI, sans-serif' }}
    >
      {/* Masthead */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/serv3-selo.svg" alt="" style={{ height: 46, width: 'auto' }} />
          <div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.22em', color: C.gold, fontWeight: 700 }}>
              Grupo Christus · Manutenção
            </div>
            <h1 style={{ margin: '3px 0 0', fontFamily: SERIF, fontSize: 23, fontWeight: 600, color: C.ink, letterSpacing: '-0.01em' }}>
              Relatório Gerencial de Ordens de Serviço
            </h1>
          </div>
        </div>
        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <span
            style={{
              display: 'inline-block',
              border: `1px solid ${C.gold}`,
              color: C.goldDeep,
              fontSize: 8.5,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              padding: '2px 8px',
              borderRadius: 3,
            }}
          >
            Confidencial
          </span>
          <div style={{ fontSize: 9.5, color: C.sub, marginTop: 6 }}>
            Gerado em <span style={{ color: C.ink, fontWeight: 600 }}>{data.geradoEm}</span>
          </div>
        </div>
      </div>
      <div style={{ height: 2.5, background: C.gold, marginTop: 12 }} />

      {/* Recorte aplicado */}
      <div style={{ marginTop: 10, fontSize: 11, color: C.body, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {[
          ['Período', data.periodoLabel],
          ['Sede', data.sedeLabel],
          ['Região', data.regiaoLabel],
        ].map(([k, v], i) => (
          <span key={k}>
            {i > 0 ? <span style={{ color: C.line, margin: '0 8px' }}>|</span> : null}
            <span style={{ color: C.sub }}>{k}: </span>
            <span style={{ color: C.ink, fontWeight: 600 }}>{v}</span>
          </span>
        ))}
      </div>

      {/* Leitura rápida */}
      <div
        style={{
          marginTop: 12,
          padding: '9px 14px',
          background: C.soft,
          borderLeft: `3px solid ${C.gold}`,
          fontFamily: SERIF,
          fontStyle: 'italic',
          fontSize: 11.5,
          color: C.body,
        }}
      >
        <span style={{ color: C.goldDeep, fontWeight: 700, fontStyle: 'normal' }}>Leitura rápida — </span>
        {highlights}.
      </div>

      {/* Banda de indicadores */}
      <div style={{ display: 'flex', marginTop: 16, borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
        <Stat first label="Total de OS" value={data.totalOs} />
        <Stat label="Em aberto" value={data.abertas} />
        <Stat label="Encerradas" value={data.encerradas} />
        <Stat label="Urgentes / Altas" value={data.urgentesAbertas} hint="em aberto" />
        <Stat label="OS mais antiga" value={data.osMaisAntigaDias == null ? '—' : `${data.osMaisAntigaDias}d`} hint={data.osMaisAntigaDias == null ? undefined : 'em aberto'} />
      </div>

      {/* OS por sede */}
      <Section title="OS por Sede">
        <BarChart width={CHART_W} height={220} data={data.osPorSede} margin={{ top: 14, right: 8, left: -14, bottom: 4 }}>
          <CartesianGrid strokeDasharray="2 4" stroke={C.line} vertical={false} />
          <XAxis dataKey="name" {...axis} interval={0} angle={-18} textAnchor="end" height={48} />
          <YAxis allowDecimals={false} {...axis} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="abertas" name="Abertas" fill={C.gold} radius={[3, 3, 0, 0]} isAnimationActive={false}>
            <LabelList dataKey="abertas" position="top" style={labelStyle} />
          </Bar>
          <Bar dataKey="fechadas" name="Encerradas" fill={C.green} radius={[3, 3, 0, 0]} isAnimationActive={false}>
            <LabelList dataKey="fechadas" position="top" style={labelStyle} />
          </Bar>
        </BarChart>
        <Table
          cols={['Sede', 'Abertas', 'Encerradas', 'Total']}
          rows={data.osPorSede.map(s => [s.name, s.abertas, s.fechadas, s.abertas + s.fechadas])}
        />
      </Section>

      {/* Backlog por etapa */}
      <Section title="Backlog por Etapa (OS na fila)">
        <BarChart width={CHART_W} height={200} data={data.backlogPorEtapa} margin={{ top: 14, right: 8, left: -14, bottom: 4 }}>
          <CartesianGrid strokeDasharray="2 4" stroke={C.line} vertical={false} />
          <XAxis dataKey="name" {...axis} interval={0} angle={-18} textAnchor="end" height={44} />
          <YAxis allowDecimals={false} {...axis} />
          <Bar dataKey="total" name="OS" fill={C.gold} radius={[3, 3, 0, 0]} isAnimationActive={false}>
            <LabelList dataKey="total" position="top" style={labelStyle} />
          </Bar>
        </BarChart>
        <Table cols={['Etapa', 'OS na fila']} rows={data.backlogPorEtapa.map(e => [e.name, e.total])} />
      </Section>

      {/* Tendência mensal */}
      <Section title="Tendência Mensal (abertas × encerradas)">
        <BarChart width={CHART_W} height={200} data={data.tendenciaMensal} margin={{ top: 14, right: 8, left: -14, bottom: 4 }}>
          <CartesianGrid strokeDasharray="2 4" stroke={C.line} vertical={false} />
          <XAxis dataKey="name" {...axis} interval={0} />
          <YAxis allowDecimals={false} {...axis} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="abertas" name="Abertas" fill={C.gold} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="encerradas" name="Encerradas" fill={C.green} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </Section>

      {/* Tabelas pareadas */}
      <div style={{ display: 'flex', gap: 20, marginTop: 22, breakInside: 'avoid' }}>
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

      <div style={{ display: 'flex', gap: 20, marginTop: 4, breakInside: 'avoid' }}>
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
      <footer
        style={{
          marginTop: 26,
          paddingTop: 8,
          borderTop: `2px solid ${C.gold}`,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 9,
          color: C.sub,
        }}
      >
        <span style={{ fontWeight: 600, color: C.body }}>Grupo Christus · Serv3 — Gestão de Manutenção</span>
        <span>Relatório gerencial · sem dados financeiros · {data.geradoEm}</span>
      </footer>
    </div>
  );

  return createPortal(content, document.body);
}
