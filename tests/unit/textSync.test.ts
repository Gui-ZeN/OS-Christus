import { describe, expect, it } from 'vitest';
import { repairMojibake as repairFront } from '../../src/utils/text';
import { repairMojibake as repairBack } from '../../api/_lib/text.js';

/**
 * `repairMojibake` existe DUAS vezes, com decodificadores diferentes: o front usa
 * `TextDecoder`, o backend usa `Buffer.from(..., 'latin1')`. Não dá para juntar sem
 * arrastar código de Node para o navegador.
 *
 * O problema é que o MESMO texto passa pelas duas: o corpo do e-mail é consertado no
 * backend ao entrar e de novo no navegador ao ser exibido. Se as duas divergirem, o
 * assunto da OS aparece de um jeito no painel e de outro no e-mail — e ninguém
 * descobre por qual das duas.
 *
 * Este teste é a trava: as duas precisam concordar, caractere por caractere.
 */
const CORPUS = [
  // Mojibake real, do acervo de e-mails que já entraram no sistema.
  'ManutenÃ§Ã£o preventiva',
  'RefeitÃ³rio do 2Âº andar',
  'Ar-condicionado nÃ£o gela',
  'ThaÃ­s',
  'InstalaÃ§Ã£o elÃ©trica',
  'Ã¡gua no corredor',
  // Dupla codificação (passou duas vezes pelo erro).
  'ManutenÃÂ§ÃÂ£o',
  // Texto são: precisa voltar intacto.
  'Manutenção preventiva',
  'Refeitório do 2º andar',
  'Troca de disjuntor',
  '',
  'ASCII puro sem acento',
  // Casos de borda.
  'â€œaspas curvasâ€',
  'ð',
];

describe('repairMojibake — front e back precisam concordar', () => {
  it.each(CORPUS)('mesmo resultado para %j', entrada => {
    expect(repairFront(entrada)).toBe(repairBack(entrada));
  });

  it('conserta o que veio quebrado', () => {
    expect(repairFront('ManutenÃ§Ã£o')).toBe('Manutenção');
    expect(repairBack('ManutenÃ§Ã£o')).toBe('Manutenção');
  });

  it('⚠️ divergem no falsy que NÃO é vazio — diferença conhecida, sem impacto real', () => {
    // O front usa `?? ''` e o back `|| ''`. Para `0` ou `false` o front devolve "0"
    // e o back devolve "". Nenhum campo de OS é numérico ou booleano nesse caminho
    // (assunto, corpo, remetente são sempre string), então fica registrado em vez de
    // "corrigido" — mudar o back mexeria em toda a entrada de e-mail por um caso que
    // não acontece.
    expect(repairFront(0 as unknown as string)).toBe('0');
    expect(repairBack(0)).toBe('');
  });

  it('não estraga texto que já está certo', () => {
    expect(repairFront('Manutenção preventiva')).toBe('Manutenção preventiva');
    expect(repairBack('Manutenção preventiva')).toBe('Manutenção preventiva');
  });
});
