import { describe, expect, it } from 'vitest';
import { avaliarChuva, montarEmail, selecionarPontosDeGoteira, sinalSimulado } from '../../api/_lib/rainAlert.js';

/**
 * O AVISO DE CHUVA — 122 linhas sem teste até agora, e o único e-mail do sistema
 * que chega de madrugada.
 *
 * Ele combina DUAS fontes que discordam por natureza: o pluviômetro do CEMADEN (por
 * bairro, preciso, lento) e o METAR do aeroporto (um ponto só, a 15 km, rápido).
 * "Quem chegar primeiro vale" é a regra, e este arquivo prende as consequências
 * dela — inclusive a mais importante, que é o que acontece quando as duas calam.
 */

const agora = new Date(2026, 7, 20, 9, 0, 0);
const minutos = m => new Date(agora.getTime() - m * 60 * 1000);

/** Um posto do CEMADEN como a API dele devolve. */
const posto = (extra = {}) => ({
  cidade: 'FORTALEZA',
  nomeestacao: 'Edson Queiroz',
  ultimovalor: 0,
  datahoraUltimovalor: null,
  acc1hr: '-',
  acc24hr: '-',
  ...extra,
});

/** O carimbo do CEMADEN é `dd/mm/aa hh:mm`, em UTC. */
const carimbo = d =>
  `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(
    d.getUTCFullYear() % 100
  ).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;

/**
 * A idade da observação sai de `obsTime`, em EPOCH DE SEGUNDOS — não de
 * `reportTime`. Errei isso na primeira versão e as duas asserções do aeroporto
 * viraram "desconhecido": sem hora legível, a leitura é descartada por idade antes
 * de alguém olhar o conteúdo.
 */
const metar = (raw, quandoMin = 10) => ({
  rawOb: raw,
  obsTime: Math.floor(minutos(quandoMin).getTime() / 1000),
  icaoId: 'SBFZ',
});

const SECO = 'METAR SBFZ 201200Z 14012KT 9999 SCT030 28/21 Q1017';
const CHUVA = 'METAR SBFZ 201200Z 14012KT 4000 -RA BR BKN017 25/24 Q1016';

describe('duas fontes, e quem chegar primeiro vale', () => {
  it('o pluviômetro molhado basta, mesmo com o aeroporto seco', () => {
    // Chuva convectiva em Fortaleza é local: pode chover na Aldeota e não no
    // aeroporto, a 15 km. Exigir as duas concordando perderia a maioria dos casos.
    const sinal = avaliarChuva({
      lista: [posto({ ultimovalor: 0.6, datahoraUltimovalor: carimbo(minutos(10)) })],
      metar: metar(SECO),
      now: agora,
    });
    expect(sinal.state).toBe('chovendo');
    expect(sinal.source).toBe('posto');
  });

  it('o aeroporto molhado basta, mesmo com os postos secos', () => {
    const sinal = avaliarChuva({
      lista: [posto({ ultimovalor: 0, datahoraUltimovalor: carimbo(minutos(10)) })],
      metar: metar(CHUVA),
      now: agora,
    });
    expect(sinal.state).toBe('chovendo');
    expect(sinal.source).toBe('aeroporto');
    expect(sinal.detalhe).toContain('15 km');
  });

  it('com as duas secas, não está chovendo', () => {
    const sinal = avaliarChuva({
      lista: [posto({ datahoraUltimovalor: carimbo(minutos(10)) })],
      metar: metar(SECO),
      now: agora,
    });
    expect(sinal.state).toBe('nao-chovendo');
    expect(sinal.raining).toBe(false);
  });

  it('o e-mail mostra SEMPRE as duas fontes, não só a que disparou', () => {
    // Se uma errar, quem lê enxerga a outra e decide. Mostrar só a vencedora
    // esconderia justamente a informação que permite duvidar do aviso.
    const sinal = avaliarChuva({
      lista: [posto({ ultimovalor: 0.6, datahoraUltimovalor: carimbo(minutos(10)) })],
      metar: metar(SECO),
      now: agora,
    });
    const email = montarEmail(sinal, '20/08/2026 09:00');
    expect(email.text).toContain('pluviômetros:');
    expect(email.text).toContain('aeroporto:');
  });
});

describe('o silêncio das fontes NÃO vira "não está chovendo"', () => {
  /**
   * ⚠️ É a regra mais importante do módulo, e a mais fácil de quebrar sem perceber.
   *
   * Afirmar ausência de chuva a partir de fonte muda é inventar. E o custo dos dois
   * erros não é simétrico numa operação de manutenção predial: alerta a mais custa
   * um e-mail ignorado; alerta a menos custa uma goteira que ninguém foi ver.
   */
  it('sem posto vivo e sem METAR, o estado é DESCONHECIDO', () => {
    const sinal = avaliarChuva({ lista: [], metar: null, now: agora });
    expect(sinal.state).toBe('desconhecido');
    expect(sinal.raining).toBe(false);
  });

  it('posto com leitura VELHA não conta como seco', () => {
    // Posto que parou de transmitir congela o último valor: sem corte por idade,
    // ele reportaria o mesmo número para sempre.
    const sinal = avaliarChuva({
      lista: [posto({ ultimovalor: 0, datahoraUltimovalor: carimbo(minutos(600)) })],
      metar: null,
      now: agora,
    });
    expect(sinal.state).toBe('desconhecido');
  });

  it('mas basta UMA fonte viva dizendo "seco" para o estado ser nao-chovendo', () => {
    const sinal = avaliarChuva({ lista: [], metar: metar(SECO), now: agora });
    expect(sinal.state).toBe('nao-chovendo');
  });

  it('e o estado das duas fontes sai junto, sempre', () => {
    // A rota devolve isso no log do Actions: é por ele que se diagnostica um aviso
    // que não saiu, sem acesso ao banco.
    const sinal = avaliarChuva({ lista: [], metar: null, now: agora });
    expect(sinal.fontes.posto.state).toBe('desconhecido');
    expect(sinal.fontes.aeroporto.state).toBe('desconhecido');
  });
});

describe('o e-mail de teste tem que se identificar como teste', () => {
  const real = () =>
    avaliarChuva({
      lista: [posto({ datahoraUltimovalor: carimbo(minutos(10)) })],
      metar: metar(SECO),
      now: agora,
    });

  it('a simulação de chuva monta uma leitura COERENTE', () => {
    /**
     * Sem isto o e-mail de teste sai contraditório: cabeçalho dizendo "começou a
     * chover" e corpo dizendo "sem chuva" nas duas fontes. Um teste que não se
     * parece com o real não valida nada — quem o aprova não viu o que vai chegar.
     */
    const sinal = sinalSimulado(real(), 'chovendo');
    expect(sinal.state).toBe('chovendo');
    expect(sinal.raining).toBe(true);
    expect(sinal.fontes.posto.state).toBe('chovendo');
    expect(sinal.simulado).toBe(true);
  });

  it('o assunto avisa [TESTE] e o corpo abre avisando', () => {
    // E-mail de teste que chega numa caixa real sem se identificar é o jeito mais
    // rápido de alguém sair correndo atrás de goteira que não existe.
    const email = montarEmail(sinalSimulado(real(), 'chovendo'), '20/08/2026 09:00');
    expect(email.subject).toContain('[TESTE]');
    expect(email.text.split('\n')[0]).toContain('TESTE');
    expect(email.html).toContain('não é chuva de verdade');
  });

  it('o aviso REAL não carrega marca de teste nenhuma', () => {
    const sinal = avaliarChuva({
      lista: [posto({ ultimovalor: 0.6, datahoraUltimovalor: carimbo(minutos(10)) })],
      metar: metar(SECO),
      now: agora,
    });
    const email = montarEmail(sinal, '20/08/2026 09:00');
    expect(email.subject).not.toContain('TESTE');
    expect(email.text).not.toContain('TESTE');
  });

  it('simular "nao-chovendo" preserva a leitura real por baixo', () => {
    const sinal = sinalSimulado(real(), 'nao-chovendo');
    expect(sinal.state).toBe('nao-chovendo');
    expect(sinal.simulado).toBe(true);
    expect(sinal.fontes).toBeDefined();
  });
});

describe('o e-mail diz onde, e para quem lê às 3h da manhã', () => {
  const chovendo = () =>
    avaliarChuva({
      lista: [posto({ ultimovalor: 0.6, datahoraUltimovalor: carimbo(minutos(10)) })],
      metar: metar(SECO),
      now: agora,
    });

  it('sem sede, fala da cidade', () => {
    const email = montarEmail(chovendo(), '20/08/2026 09:00');
    expect(email.subject).toContain('em Fortaleza');
  });

  it('com sede, nomeia a sede — é o que decide quem vai olhar o telhado', () => {
    const email = montarEmail(chovendo(), '20/08/2026 09:00', 'ALD');
    expect(email.subject).toContain('na sede ALD');
    expect(email.text).toContain('na sede ALD');
  });

  it('o assunto diz o que fazer, não só o que aconteceu', () => {
    expect(montarEmail(chovendo(), '20/08/2026 09:00').subject).toContain('verificar pontos de goteira');
  });

  it('e sai em texto E em HTML — o texto é a versão de referência', () => {
    // É o que chega em cliente sem HTML e o que o log guarda.
    const email = montarEmail(chovendo(), '20/08/2026 09:00');
    expect(email.text.length).toBeGreaterThan(50);
    expect(email.html).toContain('Começou a chover');
  });
});

/**
 * A LISTA DE GOTEIRA — o que estava marcado como placeholder ("a lista da Thaís
 * ainda não existe") até esta OS existir de verdade.
 *
 * ⚠️ AUSÊNCIA É DITA, NÃO OMITIDA. `montarEmail` é puro: quem busca as OS é a rota
 * (`listarPontosDeGoteira`, em `api/mail.js`, com Firestore — fora do alcance de um
 * teste unitário). Aqui se testa só a montagem do texto a partir da lista já pronta,
 * e a lista vazia é o caso que mais importa provar: sem isto, "nenhuma marcada" e
 * "a busca falhou silenciosamente" pareceriam a mesma coisa.
 */
describe('a lista de goteira no corpo do e-mail', () => {
  const chovendo = () =>
    avaliarChuva({
      lista: [posto({ ultimovalor: 0.6, datahoraUltimovalor: carimbo(minutos(10)) })],
      metar: metar(SECO),
      now: agora,
    });

  it('sem nenhuma OS marcada, o e-mail diz isso — não fica em branco', () => {
    const email = montarEmail(chovendo(), '20/08/2026 09:00');
    expect(email.text).toContain('Nenhuma OS marcada com risco de goteira no momento.');
    expect(email.html).toContain('Nenhuma OS marcada com risco de goteira no momento.');
  });

  it('aviso da CIDADE — cada linha mostra a sede, porque o leitor não sabe de onde é', () => {
    const goteiras = [
      { id: 'OS-0144', sede: 'SUL1', assunto: 'Troca da base dos toldos das salinhas' },
      { id: 'OS-0271', sede: 'ALD', assunto: 'Goteira no telhado do refeitório' },
    ];
    const email = montarEmail(chovendo(), '20/08/2026 09:00', null, goteiras);
    expect(email.text).toContain('OS-0144 · SUL1 · Troca da base dos toldos das salinhas');
    expect(email.text).toContain('OS-0271 · ALD · Goteira no telhado do refeitório');
    expect(email.html).toContain('OS-0144');
    expect(email.html).toContain('SUL1');
  });

  it('aviso de UMA SEDE — a sede não se repete em cada linha, quem lê já sabe onde está', () => {
    const goteiras = [{ id: 'OS-0144', sede: 'SUL1', assunto: 'Troca da base dos toldos das salinhas' }];
    const email = montarEmail(chovendo(), '20/08/2026 09:00', 'SUL1', goteiras);
    expect(email.text).toContain('OS-0144 · Troca da base dos toldos das salinhas');
    expect(email.text).not.toContain('OS-0144 · SUL1 ·');
  });

  it('sede não informada não vira linha em branco', () => {
    const email = montarEmail(chovendo(), '20/08/2026 09:00', null, [
      { id: 'OS-0999', sede: null, assunto: 'Chamado migrado sem sede' },
    ]);
    expect(email.text).toContain('OS-0999 · sede não informada · Chamado migrado sem sede');
  });
});

/**
 * QUEM ENTRA NA LISTA — a decisão em si, sem Firestore.
 *
 * A rota já filtrou por `waterIssue === true` na consulta; o que resta decidir aqui é
 * se a OS ainda está em aberto e se pertence à sede do aviso — e é exatamente isto
 * que se testa com objetos soltos, sem precisar do emulador de pé.
 */
describe('selecionarPontosDeGoteira — quem entra na lista', () => {
  const os = (over: Partial<{ id: string; status: string; sede: string; subject: string }>) => ({
    id: 'OS-0001',
    status: 'Em andamento',
    sede: 'SUL1',
    subject: 'Goteira no telhado',
    ...over,
  });

  it('OS encerrada ou cancelada não entra — a goteira já foi resolvida ou nunca era desta OS', () => {
    const tickets = [os({ id: 'OS-0001', status: 'Encerrada' }), os({ id: 'OS-0002', status: 'Cancelada' })];
    expect(selecionarPontosDeGoteira(tickets)).toEqual([]);
  });

  it('OS aberta entra, e carrega sede e assunto', () => {
    const tickets = [os({ id: 'OS-0001', sede: 'SUL1', subject: 'Goteira no vestiário' })];
    expect(selecionarPontosDeGoteira(tickets)).toEqual([{ id: 'OS-0001', sede: 'SUL1', assunto: 'Goteira no vestiário' }]);
  });

  it('sem sede no aviso (cidade inteira), traz de TODAS as sedes', () => {
    const tickets = [os({ id: 'OS-0001', sede: 'SUL1' }), os({ id: 'OS-0002', sede: 'ALD' })];
    expect(selecionarPontosDeGoteira(tickets, null).map(g => g.id)).toEqual(['OS-0002', 'OS-0001']);
  });

  it('com sede no aviso, só as OS dessa sede — as outras não são o problema de quem vai olhar o telhado ali', () => {
    const tickets = [os({ id: 'OS-0001', sede: 'SUL1' }), os({ id: 'OS-0002', sede: 'ALD' })];
    expect(selecionarPontosDeGoteira(tickets, 'SUL1')).toEqual([{ id: 'OS-0001', sede: 'SUL1', assunto: 'Goteira no telhado' }]);
  });

  it('assunto ausente não vira célula vazia', () => {
    const tickets = [os({ id: 'OS-0001', subject: '' })];
    expect(selecionarPontosDeGoteira(tickets)[0].assunto).toBe('(sem assunto)');
  });

  it('ordena por sede e depois por id — quem lê de manhã varre uma sede de cada vez', () => {
    const tickets = [
      os({ id: 'OS-0003', sede: 'SUL1' }),
      os({ id: 'OS-0001', sede: 'ALD' }),
      os({ id: 'OS-0001', sede: 'SUL1' }),
    ];
    expect(selecionarPontosDeGoteira(tickets).map(g => `${g.sede}/${g.id}`)).toEqual([
      'ALD/OS-0001',
      'SUL1/OS-0001',
      'SUL1/OS-0003',
    ]);
  });
});
