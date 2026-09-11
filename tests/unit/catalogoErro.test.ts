import { describe, expect, it } from 'vitest';
import { erroDoCatalogo } from '../../src/services/catalogApi';
import { mensagemDeErro } from '../../src/utils/errorMessage';

/**
 * O QUE A TELA DO CATÁLOGO MOSTRA QUANDO A EXCLUSÃO É RECUSADA.
 *
 * ⚠️ A tela dizia só "Falha ao excluir item do catálogo.". Reproduzido contra o
 * emulador em 11/09/2026: apagar um macroserviço com serviços vinculados devolvia o
 * motivo por extenso, e o cliente jogava fora — `mensagemDeErro` só deixa passar
 * `UserFacingError`, e o serviço lançava `Error` cru. Quem tentava via "falhou" sem
 * saber que bastava tirar os serviços primeiro.
 *
 * O teste é do PAR: não adianta o serviço marcar se `mensagemDeErro` engole, nem o
 * contrário. Por isso cada caso passa pelos dois.
 */

const naTela = (status: number, doServidor: string) =>
  mensagemDeErro(erroDoCatalogo(status, { ok: false, error: doServidor }, 'Falha ao excluir item do catálogo.'), 'Falha ao excluir item do catálogo.');

describe('o motivo da recusa chega na tela', () => {
  it('409 é recusa deliberada: o motivo aparece', () => {
    expect(naTela(409, 'Não dá para excluir o macroserviço enquanto houver serviços vinculados a ele.'))
      .toBe('Não dá para excluir o macroserviço enquanto houver serviços vinculados a ele.');
  });

  it('404 também: "sumiu" é informação, não falha genérica', () => {
    expect(naTela(404, 'Este item do catálogo não existe mais. Atualize a tela.'))
      .toBe('Este item do catálogo não existe mais. Atualize a tela.');
  });
});

describe('o que NÃO pode vazar para a tela', () => {
  it('⚠️ erro de infraestrutura cai no texto de quem chamou', () => {
    /*
     * O `catch` do handler devolve `error.message` de QUALQUER erro — inclusive os do
     * SDK do Firestore, em inglês. Mostrar todos reabriria o buraco que o
     * `UserFacingError` fechou: "5 NOT_FOUND: no entity to update" no meio de uma
     * tela em português.
     */
    expect(naTela(500, '5 NOT_FOUND: no entity to update: app_engine_apis'))
      .toBe('Falha ao excluir item do catálogo.');
  });

  it('403 do gate de papel também não vaza', () => {
    // A frase do authz é para o log, não para a tela do catálogo.
    expect(naTela(403, 'Permissão insuficiente.')).toBe('Falha ao excluir item do catálogo.');
  });

  it('sem mensagem no corpo, sobra o texto de quem chamou', () => {
    expect(mensagemDeErro(erroDoCatalogo(409, {}, 'Falha ao excluir item do catálogo.'), 'Falha ao excluir item do catálogo.'))
      .toBe('Falha ao excluir item do catálogo.');
  });
});
