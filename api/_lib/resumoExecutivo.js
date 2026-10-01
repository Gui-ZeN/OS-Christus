/**
 * RESUMO EXECUTIVO — números agregados por sede para o Chromos (hub da Infraestrutura).
 *
 * `GET /api/resumo-executivo?mes=AAAA-MM[&de=AAAA-MM&ate=AAAA-MM]` (rewrite para
 * `/api/tickets?route=resumo-executivo`). Com `de`/`ate`, os contadores "NoMes" e a
 * mediana valem para o período inteiro, os dois meses inclusive; sem eles, é o mês.
 * Só leitura, só contadores: nenhum nome, e-mail, descrição, id de OS, solicitante ou
 * responsável sai daqui. Quem consome é outro sistema, com token próprio
 * (`RESUMO_EXECUTIVO_TOKEN`) — não é usuário do Serv3, então não passa pelo login.
 *
 * ⚠️ NENHUMA CONTA NOVA. Cada número reusa a regra que os Indicadores já mostram
 * (`api/_lib/indicadores.js`, reexportada por `src/views/kpi/calculos.ts`). Se o
 * Chromos e a tela divergirem, é porque alguém duplicou uma regra — não deixe.
 *
 * Definições (29/09/2026, confirmadas com o dono):
 *  - abertas: `isTicketOpen` agora. Cancelada e Encerrada não contam.
 *  - urgentesAbertas: abertas com `priority === 'Urgente'`.
 *  - travadas: `filaTravada` com `bloqueioParaAvancar`, igual ao painel.
 *  - abertasNoMes: `volumeDoPeriodo(...).total` das OS criadas no mês.
 *  - encerradasNoMes: FECHADAS no mês (`fechadasNoPeriodo`) com status Encerrada.
 *    Cancelada NÃO conta. (A regra do `volumeDoPeriodo` contaria as abertas no mês
 *    que já estão encerradas — um mês antigo mudaria de número conforme as OS dele
 *    fecham. O dono escolheu "fechadas no mês".)
 *  - resolucaoMedianaDias: `tempoDeResolucao` sobre `fechadasNoPeriodo`, IGUAL ao
 *    painel — e isso inclui Cancelada, porque cancelar também grava `closedAt`. Vem
 *    arredondada para dia inteiro (é o que `tempoDeResolucao` devolve). `null` sem
 *    OS fechada, nunca 0.
 *  - `excludedFromMetrics` fica fora de tudo, como no painel.
 *
 * ⚠️ MEDIANA NÃO SE SOMA: `porGrupo` e `geral` são calculados sobre o conjunto
 * inteiro do grupo, nunca como média das sedes.
 */

import { toDateOrNull } from './dates.js';
import { secretsMatch } from './authz.js';
import { getAdminDb } from './firebaseAdmin.js';
import { sendError, sendJson } from './http.js';
import { getCachedRegions, getCachedSites } from './refCache.js';
import { TICKET_STATUS, isTicketOpen } from './statusFlow.js';
import {
  bloqueioParaAvancar,
  fechadasNoPeriodo,
  filaTravada,
  tempoDeResolucao,
  volumeDoPeriodo,
} from './indicadores.js';
import { resolveTicketRegion, resolveTicketSite } from './territorioDaOs.js';

export const VERSAO = 1;

// Fortaleza é UTC-3 o ano inteiro (sem horário de verão desde 2019 no Brasil).
const FUSO_MS = 3 * 60 * 60 * 1000;
const CACHE_MS = 5 * 60 * 1000;
const MES_VALIDO = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * Só os campos que alguma conta usa. `select` não barateia a leitura (continua 1 por
 * doc), mas garante que dado pessoal nem entra na memória desta rota.
 */
const CAMPOS = [
  'status',
  'priority',
  'time',
  'closedAt',
  'excludedFromMetrics',
  'siteId',
  'sede',
  'regionId',
  'region',
  'macroServiceId',
  'serviceCatalogId',
];

export function mesCorrenteEmFortaleza(agora = new Date()) {
  return new Date(agora.getTime() - FUSO_MS).toISOString().slice(0, 7);
}

/** Início e fim do mês em Fortaleza, como instantes UTC. */
export function limitesDoMes(mes) {
  const [, ano, mesNum] = MES_VALIDO.exec(mes);
  const inicio = new Date(Date.UTC(Number(ano), Number(mesNum) - 1, 1) + FUSO_MS);
  const fim = new Date(Date.UTC(Number(ano), Number(mesNum), 1) + FUSO_MS - 1);
  return { inicio, fim };
}

/** Do primeiro instante de `de` ao último de `ate` — os dois meses entram. */
export function limitesDoPeriodo(de, ate) {
  return { inicio: limitesDoMes(de).inicio, fim: limitesDoMes(ate).fim };
}

function carimboDeFortaleza(agora) {
  return `${new Date(agora.getTime() - FUSO_MS).toISOString().slice(0, 19)}-03:00`;
}

function contadores(tickets, inicio, fim) {
  const abertas = tickets.filter(ticket => isTicketOpen(ticket.status));
  const criadasNoMes = tickets.filter(ticket => {
    const quando = ticket.time?.getTime();
    return quando !== undefined && quando >= inicio.getTime() && quando <= fim.getTime();
  });
  const fechadas = fechadasNoPeriodo(tickets, inicio, fim);
  return {
    abertas: abertas.length,
    urgentesAbertas: abertas.filter(ticket => ticket.priority === 'Urgente').length,
    travadas: filaTravada(tickets, bloqueioParaAvancar).travadas,
    abertasNoMes: volumeDoPeriodo(criadasNoMes).total,
    encerradasNoMes: fechadas.filter(ticket => ticket.status === TICKET_STATUS.CLOSED).length,
    resolucaoMedianaDias: tempoDeResolucao(fechadas).mediana,
  };
}

/**
 * O corpo da resposta, a partir das OS cruas do Firestore e do catálogo. Pura:
 * é o que os testes exercitam sem banco.
 */
export function montarResumo({ tickets, regions, sites, mes, de = mes, ate = mes, agora = new Date() }) {
  const { inicio, fim } = limitesDoPeriodo(de, ate);
  const validas = tickets
    .filter(ticket => !ticket.excludedFromMetrics)
    .map(ticket => ({ ...ticket, time: toDateOrNull(ticket.time), closedAt: toDateOrNull(ticket.closedAt) }));

  const porSede = new Map();
  const porGrupo = new Map();
  const semSede = [];

  for (const ticket of validas) {
    const site = resolveTicketSite(ticket, sites);
    if (site) {
      // O código como está no catálogo. `BN` repetido é intencional (mesmo local)
      // e soma numa linha só.
      const sede = site.code || site.id;
      if (!porSede.has(sede)) {
        const regiaoDaSede = regions.find(region => region.id === site.regionId);
        porSede.set(sede, { grupo: regiaoDaSede?.group || null, tickets: [] });
      }
      porSede.get(sede).tickets.push(ticket);
    } else {
      semSede.push(ticket);
    }

    // Grupo pela região da OS, como `getTicketGroupLabel`. Sem região, fica só no
    // `geral` — chutar "operacao" por ser a maioria é o erro que o painel evita.
    const grupo = resolveTicketRegion(ticket, regions, sites)?.group;
    if (grupo) {
      if (!porGrupo.has(grupo)) porGrupo.set(grupo, []);
      porGrupo.get(grupo).push(ticket);
    }
  }

  return {
    versao: VERSAO,
    geradoEm: carimboDeFortaleza(agora),
    // `mes` = `ate`, por compatibilidade. O Chromos só dá o período por contado
    // quando `de` e `ate` vêm na resposta — e vêm sempre, mesmo no pedido de um
    // mês só (aí de = ate = mes), porque é verdade: foi esse o período contado.
    mes: ate,
    de,
    ate,
    porSede: [...porSede.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
      .map(([sede, { grupo, tickets: daSede }]) => ({ sede, grupo, ...contadores(daSede, inicio, fim) })),
    porGrupo: Object.fromEntries(
      [...porGrupo.entries()].map(([grupo, doGrupo]) => [grupo, contadores(doGrupo, inicio, fim)])
    ),
    geral: contadores(validas, inicio, fim),
    semSede: contadores(semSede, inicio, fim),
  };
}

const cache = new Map();

/** Para testes: zera o cache por mês. */
export function limparCacheDoResumo() {
  cache.clear();
}

async function lerTickets(db) {
  const snap = await db.collection('tickets').select(...CAMPOS).get();
  return snap.docs.map(doc => doc.data());
}

/**
 * @param {any} req
 * @param {any} res
 * @param {{ db?: any, agora?: Date }} [opcoes]  `db` e `agora` injetáveis para teste.
 */
export async function handleResumoExecutivo(req, res, { db, agora = new Date() } = {}) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
  }

  // Sem a variável, FECHADO: um token vazio não pode casar com cabeçalho vazio.
  const esperado = process.env.RESUMO_EXECUTIVO_TOKEN;
  if (!esperado) {
    return sendJson(res, 503, { ok: false, error: 'Resumo executivo não configurado.' });
  }
  const header = String(req.headers?.authorization || '');
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!secretsMatch(bearer, esperado)) {
    return sendJson(res, 401, { ok: false, error: 'Não autorizado.' });
  }

  const mesPedido = req.query?.mes ? String(req.query.mes).trim() : '';
  if (mesPedido && !MES_VALIDO.test(mesPedido)) {
    return sendJson(res, 400, { ok: false, error: 'mes deve ser AAAA-MM.' });
  }

  // PERÍODO (01/10/2026): `de` e `ate` chegam juntos ou não chegam. Um só é pedido
  // malformado, não "período aberto" — adivinhar a outra ponta contaria um período
  // que ninguém pediu. Sem os dois, é o mês de sempre (de = ate = mes).
  const dePedido = req.query?.de ? String(req.query.de).trim() : '';
  const atePedido = req.query?.ate ? String(req.query.ate).trim() : '';
  let de;
  let ate;
  if (dePedido || atePedido) {
    if (!MES_VALIDO.test(dePedido) || !MES_VALIDO.test(atePedido)) {
      return sendJson(res, 400, { ok: false, error: 'de e ate devem vir juntos, como AAAA-MM.' });
    }
    // AAAA-MM ordena como texto na mesma ordem que no calendário.
    if (dePedido > atePedido) {
      return sendJson(res, 400, { ok: false, error: 'de não pode ser depois de ate.' });
    }
    de = dePedido;
    ate = atePedido;
  } else {
    de = ate = mesPedido || mesCorrenteEmFortaleza(agora);
  }

  // ~5 min por período: cada geração relê a coleção de OS inteira, e a cota do
  // Firestore já apertou uma vez (CHANGELOG de 25/09/2026).
  const chave = `${de}..${ate}`;
  const guardado = cache.get(chave);
  if (guardado && guardado.expiraEm > agora.getTime()) {
    return sendJson(res, 200, guardado.corpo);
  }

  try {
    const banco = db || getAdminDb();
    const [tickets, regions, sites] = await Promise.all([
      lerTickets(banco),
      getCachedRegions(banco),
      getCachedSites(banco),
    ]);
    const corpo = montarResumo({ tickets, regions, sites, de, ate, agora });
    // Com período, as chaves possíveis se multiplicam: o vencido sai na hora de
    // guardar, para o Map não crescer enquanto a instância vive.
    for (const [k, v] of cache) if (v.expiraEm <= agora.getTime()) cache.delete(k);
    cache.set(chave, { corpo, expiraEm: agora.getTime() + CACHE_MS });
    return sendJson(res, 200, corpo);
  } catch (error) {
    return sendError(res, error, 'Falha ao montar o resumo executivo.');
  }
}
