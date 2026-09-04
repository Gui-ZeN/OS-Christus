import { describe, expect, it } from 'vitest';
import {
  GRUPO_NAO_DEFINIDO,
  getTicketGroupLabel,
  getTicketRegionLabel,
  rotuloDoGrupo,
} from '../../src/utils/ticketTerritory';
import type { CatalogRegion, CatalogSite } from '../../src/services/catalogApi';
import type { Ticket } from '../../src/types';

/**
 * COLÉGIO E UNIVERSIDADE — o degrau acima da região.
 *
 * `region.group` existe no catálogo desde o começo e nunca tinha sido usado. Medido
 * em produção em 04/09/2026: as cinco regiões do colégio têm `operacao` e a
 * Universidade tem `universidade` — 209 OS de um lado e 15 do outro. Os Indicadores
 * só ofereciam uma região por vez, então "todas as OS do Colégio" não tinha como ser
 * perguntado.
 */
const regions = [
  { id: 'regiao-sul', code: 'RSU', name: 'Região Sul', group: 'operacao' },
  { id: 'regiao-benfica', code: 'RBN', name: 'Região Benfica', group: 'operacao' },
  { id: 'universidade', code: 'UNI', name: 'Universidade', group: 'universidade' },
  { id: 'sem-grupo', code: 'SG', name: 'Região Nova', group: '' },
] as unknown as CatalogRegion[];

const sites = [
  { id: 'sul1', code: 'SUL1', name: 'SUL1', regionId: 'regiao-sul' },
  { id: 'dl', code: 'DL', name: 'Dom Luís (DL)', regionId: 'universidade' },
  { id: 'bn', code: 'BN', name: 'BN', regionId: 'regiao-benfica' },
  { id: 'bn-uni', code: 'BN', name: 'Benfica (BN)', regionId: 'universidade' },
] as unknown as CatalogSite[];

const os = (over: Partial<Ticket> = {}): Ticket => ({ id: 'OS-0001', ...over }) as Ticket;

describe('rotuloDoGrupo', () => {
  it('traduz os dois grupos que existem', () => {
    expect(rotuloDoGrupo('operacao')).toBe('Colégio');
    expect(rotuloDoGrupo('universidade')).toBe('Universidade');
  });

  it('grupo desconhecido devolve o PRÓPRIO valor, não um rótulo genérico', () => {
    // Mesma regra do `etapaDe` com status fora do mapa: quem cadastrar um grupo novo
    // precisa VER que ele apareceu estranho, em vez de encontrá-lo somado a Colégio.
    expect(rotuloDoGrupo('hospital')).toBe('hospital');
  });

  it('vazio, nulo e ausente viram "Não definida"', () => {
    expect(rotuloDoGrupo('')).toBe(GRUPO_NAO_DEFINIDO);
    expect(rotuloDoGrupo(null)).toBe(GRUPO_NAO_DEFINIDO);
    expect(rotuloDoGrupo(undefined)).toBe(GRUPO_NAO_DEFINIDO);
    expect(rotuloDoGrupo('   ')).toBe(GRUPO_NAO_DEFINIDO);
  });
});

describe('getTicketGroupLabel', () => {
  it('a OS de uma região do colégio é do Colégio', () => {
    expect(getTicketGroupLabel(os({ regionId: 'regiao-sul' }), regions, sites)).toBe('Colégio');
  });

  it('a OS da universidade é da Universidade', () => {
    expect(getTicketGroupLabel(os({ regionId: 'universidade' }), regions, sites)).toBe('Universidade');
  });

  it('chega ao grupo pela SEDE quando a OS não tem região', () => {
    // 181 OS nasceram por e-mail e nem sempre trazem `regionId`; a sede resolve.
    expect(getTicketGroupLabel(os({ siteId: 'dl' }), regions, sites)).toBe('Universidade');
    expect(getTicketGroupLabel(os({ siteId: 'sul1' }), regions, sites)).toBe('Colégio');
  });

  it('BN duplicado: a sede é que decide de qual lado a OS cai', () => {
    // `bn` e `bn-uni` são o MESMO lugar em duas regiões — duplicação intencional do
    // catálogo. Sem `regionId`, quem separa é o id da sede.
    expect(getTicketGroupLabel(os({ siteId: 'bn' }), regions, sites)).toBe('Colégio');
    expect(getTicketGroupLabel(os({ siteId: 'bn-uni' }), regions, sites)).toBe('Universidade');
  });

  it('região sem grupo não é chutada para Colégio só porque é a maioria', () => {
    expect(getTicketGroupLabel(os({ regionId: 'sem-grupo' }), regions, sites)).toBe(GRUPO_NAO_DEFINIDO);
  });

  it('OS que não resolve região nenhuma fica sem grupo', () => {
    const solta = os({ region: 'Região que não existe', sede: 'XPTO' });
    expect(getTicketGroupLabel(solta, regions, sites)).toBe(GRUPO_NAO_DEFINIDO);
    // O rótulo de região continua caindo no texto cru da OS — comportamento antigo,
    // preservado: some da agregação por grupo, não da tela.
    expect(getTicketRegionLabel(solta, regions, sites)).toBe('Região que não existe');
  });

  it('o grupo soma as regiões: é o que a tela não conseguia perguntar', () => {
    const carteira = [
      os({ regionId: 'regiao-sul' }),
      os({ regionId: 'regiao-benfica' }),
      os({ siteId: 'sul1' }),
      os({ regionId: 'universidade' }),
    ];
    const doColegio = carteira.filter(t => getTicketGroupLabel(t, regions, sites) === 'Colégio');
    expect(doColegio).toHaveLength(3);
  });
});
