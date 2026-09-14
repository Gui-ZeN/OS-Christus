import { describe, expect, it } from 'vitest';
import { idLivre, upsertCatalogEntry } from '../../api/catalog.js';
import { slugify } from '../../api/_lib/text.js';

/**
 * CRIAR ITEM NUNCA CRIAVA QUANDO O NOME JÁ EXISTIA.
 *
 * O id do catálogo vem de `slugify(code || name)`, e a gravação era um
 * `set(merge: true)` direto nele. Como o slug ignora acento, caixa e pontuação, criar
 * "Alvenaria" onde já havia "alvenaria" RENOMEAVA o item antigo em vez de criar um
 * novo: a lista não crescia ("não salvou") e a auditoria registrava a escrita, porque
 * ela de fato aconteceu.
 *
 * Decisão do dono (14/09): criar assim mesmo, com id novo. O nome sai como foi
 * digitado; o sufixo é só do id, que ninguém lê na tela.
 */

/** `db` de mentira: só sabe dizer quais ids já existem. */
function bancoCom(ids: string[]) {
  const existentes = new Set(ids);
  const lidos: string[] = [];
  return {
    lidos,
    collection: () => ({
      doc: (id: string) => ({
        get: async () => {
          lidos.push(id);
          return { exists: existentes.has(id) };
        },
      }),
    }),
  };
}

describe('idLivre — o id de um item novo do catálogo', () => {
  it('id livre sai como veio', async () => {
    const db = bancoCom([]);
    expect(await idLivre(db, 'serviceCatalog', 'alvenaria')).toBe('alvenaria');
  });

  it('id ocupado ganha sufixo em vez de sobrescrever o item de alguém', async () => {
    const db = bancoCom(['alvenaria']);
    expect(await idLivre(db, 'serviceCatalog', 'alvenaria')).toBe('alvenaria-2');
  });

  it('continua contando enquanto houver ocupado — sem pular número', async () => {
    const db = bancoCom(['alvenaria', 'alvenaria-2', 'alvenaria-3']);
    expect(await idLivre(db, 'serviceCatalog', 'alvenaria')).toBe('alvenaria-4');
  });

  /**
   * A colisão real medida em produção não é "mesmo nome": é o slug apagando o acento.
   * Estes cinco jeitos de digitar caíam todos no MESMO documento.
   */
  it('as cinco grafias que colidiam agora recebem ids distintos', async () => {
    const grafias = ['Troca de Lâmpada', 'Troca de lampada', 'TROCA DE LAMPADA', 'Troca  de  Lâmpada!'];
    expect(new Set(grafias.map(slugify)).size).toBe(1);

    const criados: string[] = [];
    for (const nome of grafias) {
      const db = bancoCom(criados);
      criados.push(await idLivre(db, 'serviceCatalog', slugify(nome)));
    }
    expect(criados).toEqual(['troca-de-lampada', 'troca-de-lampada-2', 'troca-de-lampada-3', 'troca-de-lampada-4']);
  });

  // Teto para o caso de alguém repetir o mesmo nome em massa por engano: sem ele, a
  // rota varreria a coleção inteira a cada tentativa.
  it('desiste com 409 depois de 50 tentativas, em vez de varrer sem fim', async () => {
    const ocupados = ['x', ...Array.from({ length: 60 }, (_, i) => `x-${i + 2}`)];
    const db = bancoCom(ocupados);
    await expect(idLivre(db, 'serviceCatalog', 'x')).rejects.toThrow(/50 itens com esse nome/);
    expect(db.lidos.length).toBe(50);
  });
});

/** `db` de mentira com escrita: guarda o que foi gravado e em qual documento. */
function bancoGravavel(documentos: Record<string, Record<string, unknown>>) {
  const escritas: Array<{ id: string; data: Record<string, unknown> }> = [];
  return {
    escritas,
    documentos,
    collection: () => ({
      doc: (id: string) => ({
        id,
        // Cópia, e não referência: o snapshot do Firestore é imutável, e o `before`
        // do log de auditoria é lido DEPOIS da gravação. Com referência viva, o
        // "antes" sairia igual ao "depois" — e o dublê provaria o contrário do real.
        get: async () => {
          const congelado = documentos[id] ? { ...documentos[id] } : undefined;
          return { exists: Boolean(congelado), data: () => congelado };
        },
        set: async (data: Record<string, unknown>) => {
          escritas.push({ id, data });
          documentos[id] = { ...(documentos[id] || {}), ...data };
        },
      }),
    }),
  };
}

describe('upsertCatalogEntry — criar não pode sobrescrever, editar não pode duplicar', () => {
  it('criar sobre um slug ocupado nasce num documento NOVO', async () => {
    const db = bancoGravavel({ alvenaria: { id: 'alvenaria', name: 'Alvenaria antiga', macroServiceId: 'estrutura' } });

    const { before, after } = await upsertCatalogEntry(db, 'serviceCatalog', {
      name: 'Alvenaria',
      macroServiceId: 'estrutura',
    });

    expect(after.id).toBe('alvenaria-2');
    expect(after.name).toBe('Alvenaria');
    // O item de quem já estava lá não foi tocado — era isto que acontecia antes.
    expect(before).toBeNull();
    expect(db.escritas.map(e => e.id)).toEqual(['alvenaria-2']);
    expect(db.documentos.alvenaria.name).toBe('Alvenaria antiga');
  });

  /**
   * ⚠️ O RISCO QUE A CORREÇÃO CRIA. "Editar" na tela de Configurações carrega o item
   * no formulário COM o `id`, e o botão de desativar manda `{ ...item, active }`. Se o
   * id explícito também passasse a procurar id livre, editar um serviço criaria um
   * segundo — e desativar criaria um clone ativo.
   */
  it('editar com id explícito grava no MESMO documento', async () => {
    const db = bancoGravavel({ alvenaria: { id: 'alvenaria', name: 'Alvenaria', macroServiceId: 'estrutura' } });

    const { before, after } = await upsertCatalogEntry(db, 'serviceCatalog', {
      id: 'alvenaria',
      name: 'Alvenaria estrutural',
      macroServiceId: 'estrutura',
    });

    expect(after.id).toBe('alvenaria');
    expect(before?.name).toBe('Alvenaria');
    expect(db.escritas.map(e => e.id)).toEqual(['alvenaria']);
  });

  it('desativar com id explícito não cria clone ativo', async () => {
    const db = bancoGravavel({ alvenaria: { id: 'alvenaria', name: 'Alvenaria', macroServiceId: 'estrutura', active: true } });

    const { after } = await upsertCatalogEntry(db, 'serviceCatalog', {
      id: 'alvenaria',
      name: 'Alvenaria',
      macroServiceId: 'estrutura',
      active: false,
    });

    expect(after.id).toBe('alvenaria');
    expect(after.active).toBe(false);
    expect(db.escritas).toHaveLength(1);
  });
});
