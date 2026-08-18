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
