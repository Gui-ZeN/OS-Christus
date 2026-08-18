import { describe, expect, it } from 'vitest';
import { chaveDeEnvio, enviarUmaVez, liberarEnvio, reivindicarEnvio } from '../../api/_lib/envioUnico.js';

/**
 * Firestore de mentira, com a única propriedade que importa aqui: `create` falha se
 * o documento já existe. É essa atomicidade que faz a reivindicação valer.
 */
function bancoFalso() {
  const docs = new Set<string>();
  return {
    docs,
    collection: () => ({
      doc: (id: string) => ({
        create: async () => {
          if (docs.has(id)) throw new Error('ALREADY_EXISTS');
          docs.add(id);
        },
        delete: async () => {
          docs.delete(id);
        },
      }),
    }),
  };
}

describe('a chave é determinística — senão duas execuções não colidem', () => {
  it('mesmo evento, mesma chave', () => {
    expect(chaveDeEnvio(['agenda', 'SUL3', 'a@b.com', '2026-08-17'])).toBe(
      chaveDeEnvio(['agenda', 'SUL3', 'a@b.com', '2026-08-17'])
    );
  });

  it('eventos diferentes, chaves diferentes', () => {
    const a = chaveDeEnvio(['agenda', 'SUL3', 'a@b.com', '2026-08-17']);
    expect(a).not.toBe(chaveDeEnvio(['agenda', 'BN', 'a@b.com', '2026-08-17']));
    expect(a).not.toBe(chaveDeEnvio(['agenda', 'SUL3', 'a@b.com', '2026-08-18']));
    expect(a).not.toBe(chaveDeEnvio(['checagem', 'SUL3', 'a@b.com', '2026-08-17']));
  });

  it('normaliza sem colidir coisas diferentes', () => {
    expect(chaveDeEnvio(['Agenda', ' SUL3 '])).toBe(chaveDeEnvio(['agenda', 'sul3']));
    expect(chaveDeEnvio([null, undefined, 'x'])).toBe('x');
  });
});

describe('dois workers concorrentes, um e-mail só', () => {
  it('quem perde a corrida NÃO envia', async () => {
    // É o teste que a auditoria (consulta 12) cobrou: `concurrency` do GitHub
    // Actions serializa execuções agendadas do mesmo workflow e não cobre retry
    // de HTTP, disparo manual junto com o agendado, nem crash entre enviar e
    // gravar a marca.
    const db = bancoFalso();
    const chave = chaveDeEnvio(['agenda', 'SUL3', 'pablo@px.com.br', '2026-08-17']);
    const enviados: string[] = [];

    const [a, b] = await Promise.all([
      enviarUmaVez(db as never, chave, async () => { enviados.push('worker-a'); }),
      enviarUmaVez(db as never, chave, async () => { enviados.push('worker-b'); }),
    ]);

    expect(enviados).toHaveLength(1);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it('dez tentativas do mesmo evento resultam em um envio', async () => {
    const db = bancoFalso();
    const chave = chaveDeEnvio(['falta', 'c-1', 'larissa@px.com.br']);
    const enviados: number[] = [];

    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        enviarUmaVez(db as never, chave, async () => { enviados.push(i); })
      )
    );

    expect(enviados).toHaveLength(1);
  });

  it('eventos diferentes não se atrapalham', async () => {
    const db = bancoFalso();
    const enviados: string[] = [];
    await Promise.all([
      enviarUmaVez(db as never, chaveDeEnvio(['falta', 'c-1']), async () => { enviados.push('c1'); }),
      enviarUmaVez(db as never, chaveDeEnvio(['falta', 'c-2']), async () => { enviados.push('c2'); }),
    ]);
    expect(enviados.sort()).toEqual(['c1', 'c2']);
  });
});

describe('envio que falha libera a vez para a próxima volta', () => {
  it('a chave é devolvida e o erro sobe', async () => {
    // O que não pode acontecer é o contrário: mandar duas vezes. Um e-mail a mais
    // é pior que um a menos — é assim que o destinatário aprende a ignorar.
    const db = bancoFalso();
    const chave = chaveDeEnvio(['checagem', 'SUL3', 'x@y.com', '123']);

    await expect(
      enviarUmaVez(db as never, chave, async () => { throw new Error('Gmail recusou'); })
    ).rejects.toThrow('Gmail recusou');

    expect(db.docs.has(chave)).toBe(false);

    let enviou = false;
    await enviarUmaVez(db as never, chave, async () => { enviou = true; });
    expect(enviou).toBe(true);
  });

  it('reivindicar duas vezes só dá certo na primeira', async () => {
    const db = bancoFalso();
    expect(await reivindicarEnvio(db as never, 'k')).toBe(true);
    expect(await reivindicarEnvio(db as never, 'k')).toBe(false);
    await liberarEnvio(db as never, 'k');
    expect(await reivindicarEnvio(db as never, 'k')).toBe(true);
  });
});

describe('envio suprimido não envenena a chave do envio real', () => {
  it('rodar em modo escuro e depois abrir a torneira ENVIA', async () => {
    // Sem isto o deploy escuro se sabota: a execução em `desligado` reivindicaria a
    // chave do dia, e ao abrir a torneira o envio real seria descartado como
    // duplicata. A operação passaria o primeiro dia sem receber nada.
    const db = bancoFalso();
    const chave = chaveDeEnvio(['agenda', 'SUL3', 'pablo@px.com.br', '2026-08-17']);

    const escuro = await enviarUmaVez(db as never, chave, async () => ({ suprimido: true, motivo: 'envio desligado' }));
    expect(escuro).toBe(false);
    expect(db.docs.has(chave)).toBe(false);

    let entregue = false;
    const real = await enviarUmaVez(db as never, chave, async () => { entregue = true; return { enviado: true }; });
    expect(real).toBe(true);
    expect(entregue).toBe(true);
  });

  it('mas duas entregas de verdade continuam impossíveis', async () => {
    const db = bancoFalso();
    const chave = chaveDeEnvio(['falta', 'c-9']);
    const entregas: number[] = [];
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        enviarUmaVez(db as never, chave, async () => { entregas.push(i); return { enviado: true }; })
      )
    );
    expect(entregas).toHaveLength(1);
  });
});

describe('ensaio da sombra não deixa rastro de estreia', () => {
  it('mensagem desviada para a caixa de teste NÃO consome a chave do dia', async () => {
    // A auditoria (consulta 13) pegou: o desvio seguia o fluxo normal e devolvia
    // sucesso, então as rotas gravavam "já perguntei" e queimavam a chave. Rodar em
    // sombra e abrir a torneira na mesma janela entregaria NADA para as pessoas
    // reais, e o estado diria que já tinha entregue.
    const db = bancoFalso();
    const chave = chaveDeEnvio(['checagem', 'SUL3', 'pablo@px.com.br', '999']);

    const emSombra = await enviarUmaVez(db as never, chave, async () => ({ status: 200, ensaio: true }));
    expect(emSombra).toBe(false);
    expect(db.docs.has(chave)).toBe(false);

    let entregue = false;
    const real = await enviarUmaVez(db as never, chave, async () => { entregue = true; return { status: 200, ensaio: false }; });
    expect(real).toBe(true);
    expect(entregue).toBe(true);
  });
});

describe('falha de infraestrutura NÃO pode passar por duplicata', () => {
  // A versão anterior engolia qualquer erro do `create` como "outro já enviou":
  // permissão negada, Firestore fora do ar, cota estourada. O sistema ficaria em
  // silêncio total dizendo, para si mesmo, que já tinha enviado tudo. (Consulta 13.)
  function bancoQueFalha(erro: Error) {
    return {
      collection: () => ({ doc: () => ({ create: async () => { throw erro; }, delete: async () => {} }) }),
    };
  }

  it('"já existe" continua sendo duplicata — e não envia', async () => {
    const jaExiste = Object.assign(new Error('ALREADY_EXISTS: entity already exists'), { code: 6 });
    expect(await reivindicarEnvio(bancoQueFalha(jaExiste) as never, 'k')).toBe(false);
  });

  it('permissão negada SOBE, para o workflow ficar vermelho', async () => {
    const semPermissao = Object.assign(new Error('PERMISSION_DENIED'), { code: 7 });
    await expect(reivindicarEnvio(bancoQueFalha(semPermissao) as never, 'k')).rejects.toThrow('PERMISSION_DENIED');
  });

  it('banco indisponível SOBE, em vez de virar silêncio', async () => {
    await expect(reivindicarEnvio(bancoQueFalha(new Error('UNAVAILABLE')) as never, 'k')).rejects.toThrow('UNAVAILABLE');
  });
});
