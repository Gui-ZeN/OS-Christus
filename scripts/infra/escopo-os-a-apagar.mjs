/**
 * QUEM ENTRA NA EXCLUSÃO — um módulo só, lido pelo backup E pelo apagador.
 *
 * Separado de propósito: se cada script tivesse a sua cópia do critério, bastaria
 * um ajuste num deles para o backup salvar um conjunto e a exclusão apagar outro —
 * e o erro só apareceria na hora de restaurar, quando já não há o que restaurar.
 */
const semAcento = v =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

// Catálogo real: api/_lib/catalogDefaults.js.
const SITES_UNIVERSIDADE = new Set(['dl', 'pe', 'eus', 'pql3', 'bn-uni', 'ald']);

export const ehUniversidade = t =>
  semAcento(t.regionId) === 'universidade' || SITES_UNIVERSIDADE.has(semAcento(t.siteId));

// `bn` e `bn-uni` são o MESMO lugar em duas regiões do catálogo — duplicação
// intencional, então Benfica pega os dois.
export const ehBenfica = t =>
  semAcento(t.regionId).includes('benfica') ||
  semAcento(t.siteId) === 'bn' ||
  semAcento(t.siteId) === 'bn-uni';

/** "Thais escrito nas mensagens" — texto e remetente do histórico, só isso. */
export const temThaisNasMensagens = historico =>
  historico.some(h => /thais/.test(semAcento(h?.text)) || /thais/.test(semAcento(h?.sender)));

/**
 * NUNCA apagar — decisão explícita de quem pediu a exclusão (12/08/2026).
 *
 * São as duas OS que casavam só por "Thais" e que ficam de FORA por serem de outras
 * sedes: ela aparece nelas apenas por estar em cópia na thread. A OS-0192 é laudo de
 * trinca em viga estrutural do BS. Ficam aqui, e não só implícitas no filtro de
 * território, porque um ajuste futuro no critério não pode ressuscitá-las no alvo.
 */
export const PRESERVAR = new Set(['OS-0192', 'OS-0301']);

export const ESCOPOS = {
  territorio: 'universidade + Benfica inteiros (ignora o critério Thais)',
  'uni-thais': 'universidade inteira + qualquer OS com Thais nas mensagens',
  tudo: 'universidade + Benfica inteiros + qualquer OS com Thais nas mensagens',
};

/**
 * Lê a base e devolve as OS-alvo já classificadas. NÃO escreve nada.
 * @returns {Promise<{alvo: Array, todas: Array, escopo: string}>}
 */
export async function selecionarOs(db, escopo) {
  if (!ESCOPOS[escopo]) {
    throw new Error(`escopo inválido: ${escopo}. Use: ${Object.keys(ESCOPOS).join(' | ')}`);
  }

  // Histórico mora na subcoleção nas OS já migradas, e em history[] nas antigas.
  const historicoPorOs = new Map();
  (await db.collectionGroup('historyEntries').get()).forEach(doc => {
    const id = doc.ref.parent.parent?.id;
    if (!id) return;
    if (!historicoPorOs.has(id)) historicoPorOs.set(id, []);
    historicoPorOs.get(id).push(doc.data());
  });

  const snap = await db.collection('tickets').get();
  const todas = snap.docs.map(doc => {
    const t = doc.data() || {};
    const historico = [
      ...(Array.isArray(t.history) ? t.history : []),
      ...(historicoPorOs.get(doc.id) || []),
    ];
    const uni = ehUniversidade(t);
    const bn = ehBenfica(t);
    const thais = temThaisNasMensagens(historico);
    const motivos = [uni && 'universidade', bn && 'benfica', thais && 'thais'].filter(Boolean);
    return {
      id: doc.id,
      ref: doc.ref,
      dados: t,
      sede: t.sede || '—',
      status: t.status || '—',
      assunto: String(t.subject || ''),
      uni,
      bn,
      thais,
      motivos,
      viva: !/encerrad|cancelad/i.test(semAcento(t.status)),
    };
  });

  const filtros = {
    territorio: o => o.uni || o.bn,
    'uni-thais': o => o.uni || o.thais,
    tudo: o => o.uni || o.bn || o.thais,
  };

  const alvo = todas.filter(o => filtros[escopo](o) && !PRESERVAR.has(o.id));
  const preservadas = todas.filter(o => filtros[escopo](o) && PRESERVAR.has(o.id));
  return { alvo, todas, preservadas, escopo };
}
