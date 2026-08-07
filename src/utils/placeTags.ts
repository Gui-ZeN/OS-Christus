import type { Ticket } from '../types';

/**
 * ONDE, extraído do texto do pedido.
 *
 * O campo `location` existe desde sempre e está inutilizável: em **214 das 270 OS**
 * ele diz "E-mail" — a triagem pergunta o local e a pessoa responde com o canal por
 * onde a mensagem chegou. Enquanto isso o lugar está escrito no assunto:
 * "GOTEIRAS TELHADO TEATRO", "Infiltração Biblioteca 5º Andar", "Portaria 01".
 *
 * Duas decisões que valem explicação:
 *
 * 1. **Etiqueta canônica, não texto livre.** Extrair "o teto do Hall do 4º andar"
 *    como frase não agrupa com "Hall 4 andar". O objetivo é justamente contar
 *    repetição, e para contar é preciso que o mesmo lugar tenha o mesmo nome.
 *
 * 2. **Derivado na leitura, não gravado.** É função pura do assunto: gravar criaria
 *    uma segunda verdade que envelhece toda vez que o vocabulário melhorar. Com ~270
 *    OS em memória, calcular na hora não custa nada.
 *
 * Cobertura medida em produção: 157 das 270 OS (58%). O resto não tem lugar
 * reconhecível no assunto — e aí a resposta certa é "não sei", não um palpite.
 */

/** Vocabulário tirado das palavras que mais aparecem nos assuntos reais. */
const LUGARES: Array<[string, RegExp]> = [
  ['telhado', /telhado|telhas?\b|cobertura|coberta\b/],
  ['laje', /\blaje/],
  ['patio', /\bpatio/],
  ['quadra', /\bquadra/],
  ['refeitorio', /refeitorio|cantina|copa\b/],
  ['banheiro', /banheiro|vestiario|sanitario/],
  ['biblioteca', /biblioteca/],
  ['recepcao', /recepcao|acolhida/],
  ['portaria', /portaria/],
  ['portao', /portao|portoes/],
  ['elevador', /elevador/],
  ['estacionamento', /estacionamento|garagem/],
  ['teatro', /teatro|auditorio/],
  ['laboratorio', /laboratorio|\blab\b/],
  ['sala', /\bsalas?\b/],
  ['corredor', /corredor|\bhall\b|passagem/],
  ['escada', /escada/],
  ['parquinho', /parquinho|playground/],
  ['piscina', /piscina/],
  ['almoxarifado', /almoxarifado|deposito/],
  ['secretaria', /secretaria/],
  ['bosque', /bosque|jardim|arvore/],
  ['clinica', /clinica|odontologia|enfermaria/],
  ['muro', /\bmuro/],
  ['fachada', /fachada|letreiro/],
  ['caixa-dagua', /caixa d.agua|reservatorio|cisterna|\bpoco\b/],
];

export const PLACE_LABEL: Record<string, string> = {
  telhado: 'Telhado/cobertura',
  laje: 'Laje',
  patio: 'Pátio',
  quadra: 'Quadra',
  refeitorio: 'Refeitório/cantina',
  banheiro: 'Banheiro/vestiário',
  biblioteca: 'Biblioteca',
  recepcao: 'Recepção',
  portaria: 'Portaria',
  portao: 'Portão',
  elevador: 'Elevador',
  estacionamento: 'Estacionamento',
  teatro: 'Teatro/auditório',
  laboratorio: 'Laboratório',
  sala: 'Sala',
  corredor: 'Corredor/hall',
  escada: 'Escada',
  parquinho: 'Parquinho',
  piscina: 'Piscina',
  almoxarifado: 'Almoxarifado',
  secretaria: 'Secretaria',
  bosque: 'Bosque/área verde',
  clinica: 'Clínica',
  muro: 'Muro',
  fachada: 'Fachada',
  'caixa-dagua': 'Caixa d’água',
};

/**
 * Andar, quando dito: "4º andar", "térreo", "subsolo".
 *
 * A classe de caracteres tem cinco variantes do indicador ordinal porque o dado real
 * traz "4⁰ andar" com ZERO SOBRESCRITO (U+2070) — quem digitou não usou o "º".
 */
const ANDAR = /(\d{1,2})\s*[oa°ºª⁰]?\s*andar|\bterreo\b|\bsubsolo\b|\bmezanino\b/;

function normalizar(texto: string): string {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Tira só o colchete CURTO do código de sede ("[PQL 02]"). Muitos assuntos vêm
    // inteiros dentro de colchetes — apagar todos apagaria o texto todo.
    .replace(/\[[a-z0-9 ./-]{1,12}\]/g, ' ');
}

export interface PlaceHint {
  tags: string[];
  floor: string | null;
}

export function placeHintOf(subject: string | undefined | null): PlaceHint {
  const texto = normalizar(subject || '');
  if (!texto) return { tags: [], floor: null };

  const tags = LUGARES.filter(([, rx]) => rx.test(texto)).map(([tag]) => tag);
  const m = texto.match(ANDAR);
  const floor = m ? (m[1] ? `${m[1]}º andar` : m[0].trim()) : null;
  return { tags, floor };
}

export interface RecurrentPlace {
  sede: string;
  tag: string;
  ticketIds: string[];
}

/**
 * Lugares que repetem dentro de um recorte de OS.
 *
 * Serve para a pergunta que o sistema tinha os dados para responder e não respondia:
 * *"esta é a terceira goteira no mesmo telhado"*. Sem `sede` não dá para agrupar —
 * "telhado" sozinho não é lugar nenhum.
 */
export function recurrentPlaces(tickets: Ticket[], minimo = 2): RecurrentPlace[] {
  const grupos = new Map<string, RecurrentPlace>();

  for (const ticket of tickets) {
    const sede = (ticket.sede || '').trim();
    if (!sede) continue;
    for (const tag of placeHintOf(ticket.subject).tags) {
      const chave = `${sede}::${tag}`;
      const atual = grupos.get(chave) || { sede, tag, ticketIds: [] };
      atual.ticketIds.push(ticket.id);
      grupos.set(chave, atual);
    }
  }

  return [...grupos.values()]
    .filter(g => g.ticketIds.length >= minimo)
    .sort((a, b) => b.ticketIds.length - a.ticketIds.length);
}
