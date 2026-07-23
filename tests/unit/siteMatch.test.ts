import { describe, it, expect } from 'vitest';
import { matchSiteCode, SITE_ALIASES, tightKey } from '../../api/_lib/siteMatch.js';

// Catálogo-mock espelhando a produção (só os campos que o matcher usa).
const SITES = [
  { id: 'ald', code: 'ALD', name: 'Aldeota (ALD)' },
  { id: 'bn', code: 'BN', name: 'Benfica (BN)' },
  { id: 'dl', code: 'DL', name: 'Dom Luís (DL)' },
  { id: 'eus', code: 'EUS', name: 'Eusébio (EUS)' },
  { id: 'pe', code: 'PE', name: 'Parque Ecológico (PE)' },
  { id: 'pql3', code: 'PQL3', name: 'Parquelândia (PQL3)' },
  { id: 'psul', code: 'PSUL', name: 'PSUL' },
  { id: 'sul1', code: 'SUL1', name: 'SUL1' },
  { id: 'sul2', code: 'SUL2', name: 'SUL2' },
  { id: 'dt', code: 'DT', name: 'DT' },
  { id: 'dt2', code: 'DT2', name: 'DT2' },
  { id: 'pjf', code: 'PJF', name: 'PJF' },
  { id: 'pql1', code: 'PQL1', name: 'PQL1' },
  { id: 'pql2', code: 'PQL2', name: 'PQL2' },
  { id: 'pnv', code: 'PNV', name: 'PNV' },
];
const code = (siteCode: string) => matchSiteCode(siteCode, SITES)?.code ?? null;

describe('matchSiteCode — casamento exato / apertado', () => {
  it('casa código exato', () => {
    expect(code('PE')).toBe('PE');
    expect(code('DT2')).toBe('DT2');
  });
  it('casamento apertado ignora espaço/pontuação e leading zeros', () => {
    expect(code('SUL 2')).toBe('SUL2');
    expect(code('PQL 3')).toBe('PQL3');
    expect(code('PQL03')).toBe('PQL3');
    expect(code('D.L')).toBe('DL');
  });
});

describe('matchSiteCode — apelidos (os que quebraram no inbound)', () => {
  it.each([
    ['CESIU', 'ALD'],
    ['CVU', 'ALD'],
    ['PRÉ SUL', 'PSUL'],
    ['PRE SUL', 'PSUL'],
    ['PRÉ NUNES', 'PNV'],
    ['DT1', 'DT'],
    ['DT 1', 'DT'],
    ['SUL', 'SUL1'],
    ['JV', 'PJF'],
    ['PRÉ-JOVITA', 'PJF'],
    ['PQL 2/3', 'PQL3'],
  ])('%s → %s', (input, expected) => {
    expect(code(input)).toBe(expected);
  });
});

describe('matchSiteCode — fallback por substring e não-casamento', () => {
  it('casa por nome parcial/completo', () => {
    expect(code('Aldeota')).toBe('ALD');
    expect(code('ald')).toBe('ALD');
  });
  it('ruído não casa nenhuma sede', () => {
    expect(code('NotaQuest')).toBeNull();
    expect(code('GitHub')).toBeNull();
    expect(code('')).toBeNull();
    expect(code('TESTE')).toBeNull();
  });
  it('lida com sites inválido/ausente', () => {
    expect(matchSiteCode('PE', null as unknown as [])).toBeNull();
    expect(matchSiteCode('PE', [])).toBeNull();
  });
});

describe('tightKey', () => {
  it('normaliza acento, pontuação e leading zeros', () => {
    expect(tightKey('PQL 03')).toBe('pql3');
    expect(tightKey('D.L')).toBe('dl');
    expect(tightKey('PRÉ-JOVITA')).toBe('prejovita');
  });
});

describe('SITE_ALIASES', () => {
  it('mapa dos apelidos confirmados pelo time', () => {
    expect(SITE_ALIASES).toMatchObject({
      cesiu: 'ALD', cvu: 'ALD', presul: 'PSUL', prenunes: 'PNV',
      dt1: 'DT', sul: 'SUL1', jv: 'PJF', prejovita: 'PJF', pql23: 'PQL3',
    });
  });
});
