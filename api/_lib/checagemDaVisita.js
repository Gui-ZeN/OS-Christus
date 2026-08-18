import { DEFAULT_TOLERANCE_MINUTES, prazoDaResposta } from './commitments.js';

/**
 * O LAÇO QUE FECHA A CONFIRMAÇÃO.
 *
 * O e-mail das 07h sozinho é aviso solto: quem não abriu de manhã nunca é
 * perguntado, e a visita morre em "sem confirmação" sem ninguém saber. Aqui ficam
 * as duas perguntas que fecham o circuito:
 *
 *  1. passou o horário e a sede não disse nada -> pergunta de novo, à SEDE;
 *  2. a sede disse que não veio -> avisa a manutenção, na hora.
 *
 * A (2) é o ÚNICO alerta individual e imediato do desenho. Todo o resto é
 * agrupado, porque alerta por evento viraria 80 e-mails por dia.
 *
 * ⚠️ Sem I/O e sem relógio próprio: `now` sempre entra por parâmetro, senão não
 * dá para testar "passou 30 minutos" sem esperar 30 minutos.
 */

const ABERTOS = new Set(['agendado', 'sem-confirmacao']);

export function toleranciaEmMinutos(commitment) {
  const valor = Number(commitment?.toleranceMinutes);
  return Number.isFinite(valor) && valor > 0 ? valor : DEFAULT_TOLERANCE_MINUTES;
}

/**
 * Quando a pergunta "chegou?" passa a valer.
 *
 * ⚠️ Delega para `prazoDaResposta`, que é o relógio único do sistema. Ter uma
 * cópia da regra aqui foi o defeito da consulta 13: o scanner esperava até 09h10 e
 * a tela já dizia "sem confirmação" às 08h45.
 */
export function momentoDaChecagem(commitment) {
  return prazoDaResposta(commitment);
}

/**
 * Está na hora de perguntar de novo?
 *
 * `checagemEnviadaEm` é o que impede o reenvio: a varredura roda de poucos em
 * poucos minutos, e sem a marca a sede receberia a mesma pergunta a cada volta —
 * exatamente o ruído que faz o aviso ser arquivado sem ler.
 */
export function precisaDeChecagem(commitment, now = new Date()) {
  if (!ABERTOS.has(String(commitment?.state || ''))) return false;
  if (commitment?.checagemEnviadaEm) return false;
  const momento = momentoDaChecagem(commitment);
  if (!momento) return false;
  return now.getTime() >= momento.getTime();
}

/**
 * A sede disse que não veio e a manutenção ainda não foi avisada?
 *
 * Só `faltou` dispara. `sem-confirmacao` NÃO é falta — a diferença é a que mais
 * importa neste sistema: falta entra no histórico do fornecedor, que é o dado
 * usado para decidir quem continua atendendo. Avisar "faltou" quando ninguém
 * respondeu acusaria fornecedor pelo silêncio da sede.
 */
export function precisaDeAlertaDeFalta(commitment) {
  return String(commitment?.state || '') === 'faltou' && !commitment?.faltaAvisadaEm;
}

/**
 * QUEM RECEBE O ALERTA DE FALTA — uma pessoa, não uma lista.
 *
 * ⚠️ Reescrito pela auditoria (consulta 12). A versão anterior mandava para todo
 * mundo com escopo na sede, e o fallback era "todo Admin sem escopo" — o que faz
 * o Admin receber TODA falta de TODA sede. Admin é permissão de sistema, não papel
 * operacional: mandar para todos dilui responsabilidade, cria destinatário que não
 * pode agir, transforma o alerta mais urgente do desenho em ruído e esconde erro de
 * configuração de escopo.
 *
 * A cadeia é determinística e para no primeiro que existir:
 *
 *   1. responsável explicitamente atribuído à visita ou à OS;
 *   2. gestora com escopo na SEDE;
 *   3. gestora com escopo na REGIÃO;
 *   4. o plantão declarado (`ALERTA_FALTA_PLANTAO`) — e o uso do fallback fica
 *      registrado, porque ele é sintoma de sede sem dono configurado.
 *
 * Devolve também `semDono`, para que sede sem responsável apareça num resumo
 * administrativo em vez de virar e-mail para todo Admin.
 */
export function donoDoAlertaDeFalta(users, { siteId, regiao, responsavelDireto = null, plantao = null }) {
  const ativos = (users || []).filter(
    u => String(u?.status || 'Ativo') === 'Ativo' && String(u?.email || '').trim()
  );
  const acha = email => ativos.find(u => String(u.email).toLowerCase() === String(email || '').toLowerCase());

  const direto = responsavelDireto ? acha(responsavelDireto) : null;
  if (direto) return { dono: direto, origem: 'responsavel-da-os', semDono: false };

  const gestoras = ativos.filter(u => String(u?.role || '') === 'Gestor');
  const sede = String(siteId || '').trim();
  const reg = String(regiao || '').trim();

  const porSede = gestoras.find(
    u => sede && (Array.isArray(u.siteIds) ? u.siteIds.map(String) : []).includes(sede)
  );
  if (porSede) return { dono: porSede, origem: 'escopo-de-sede', semDono: false };

  const porRegiao = gestoras.find(
    u => reg && (Array.isArray(u.regionIds) ? u.regionIds.map(String) : []).includes(reg)
  );
  if (porRegiao) return { dono: porRegiao, origem: 'escopo-de-regiao', semDono: false };

  // Último recurso: falta órfã é pior que falta no lugar errado, mas isto é
  // sintoma, não solução — por isso `semDono` volta verdadeiro mesmo com dono.
  const dePlantao = plantao ? acha(plantao) : null;
  if (dePlantao) return { dono: dePlantao, origem: 'plantao', semDono: true };

  return { dono: null, origem: 'nenhum', semDono: true };
}

/**
 * O escopo desta pessoa alcança esta sede?
 *
 * Serve para decidir sobre uma VISITA, que sabe a sede mas não carrega as OS. Sem
 * isto o filtro caía só em `siteIds`, e quem tem escopo por REGIÃO — que é o caso
 * da gestora que toca uma operação inteira — ficava de fora dos resumos. Foi
 * exatamente o que um teste pegou: a gestora não recebia o "sem confirmação".
 *
 * Para decidir sobre uma OS, continua valendo `canUserAccessTicket`; esta função é
 * o recorte mais grosso, para quando só existe a sede.
 */
export function cobreASede(user, { siteId, regiao }) {
  const sede = String(siteId || '').trim();
  const reg = String(regiao || '').trim();
  const sedes = Array.isArray(user?.siteIds) ? user.siteIds.map(v => String(v || '').trim()).filter(Boolean) : [];
  const regioes = Array.isArray(user?.regionIds) ? user.regionIds.map(v => String(v || '').trim()).filter(Boolean) : [];

  // Admin sem escopo nenhum responde por tudo — é o que o resto do sistema já faz.
  if (String(user?.role || '') === 'Admin' && sedes.length === 0 && regioes.length === 0) return true;
  return (sede !== '' && sedes.includes(sede)) || (reg !== '' && regioes.includes(reg));
}
