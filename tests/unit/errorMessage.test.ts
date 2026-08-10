import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UserFacingError, explicaErroTecnico, mensagemDeErro } from '../../src/utils/errorMessage';
import { ApiError } from '../../src/services/apiClient';

describe('mensagemDeErro', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it('mostra o que a nossa API respondeu', () => {
    expect(mensagemDeErro(new ApiError('Esta OS já foi encerrada.', 409), 'Falha ao salvar.')).toBe(
      'Esta OS já foi encerrada.'
    );
  });

  it('mostra mensagem escrita para gente, mesmo sem vir da API', () => {
    expect(mensagemDeErro(new UserFacingError('E-mail ou senha incorretos.'), 'Falha no login.')).toBe(
      'E-mail ou senha incorretos.'
    );
  });

  // O motivo de tudo isto existir: erro do navegador/SDK aparecia cru, em inglês,
  // no meio de uma tela em português.
  it('NÃO mostra erro cru de biblioteca — usa o texto do chamador', () => {
    expect(mensagemDeErro(new TypeError('Failed to fetch'), 'Não foi possível salvar agora.')).toBe(
      'Não foi possível salvar agora.'
    );
    expect(
      mensagemDeErro(new Error('Firebase: Error (auth/id-token-expired)'), 'Sua sessão expirou.')
    ).toBe('Sua sessão expirou.');
  });

  it('o erro técnico não some: vai para o console', () => {
    const bruto = new TypeError('Failed to fetch');
    mensagemDeErro(bruto, 'Falhou.');
    expect(console.error).toHaveBeenCalledWith('[erro]', bruto);
  });

  it('aceita qualquer coisa lançada, não só Error', () => {
    expect(mensagemDeErro('string solta', 'Falhou.')).toBe('Falhou.');
    expect(mensagemDeErro(null, 'Falhou.')).toBe('Falhou.');
    expect(mensagemDeErro(undefined, 'Falhou.')).toBe('Falhou.');
  });

  it('mensagem nossa em branco cai no fallback', () => {
    expect(mensagemDeErro(new UserFacingError('   '), 'Falhou.')).toBe('Falhou.');
  });
});

describe('explicaErroTecnico', () => {
  it('explica o erro que apareceu 44 vezes desde 01/08', () => {
    const bruto =
      'Firebase ID token has expired. Get a fresh ID token from your client app and try again (auth/id-token-expired).';
    expect(explicaErroTecnico(bruto)).toMatch(/sessão .* expirou/i);
  });

  it('explica recusa do provedor e endereço inexistente', () => {
    expect(explicaErroTecnico('550 Message blocked')).toMatch(/recusou a mensagem/i);
    expect(explicaErroTecnico('Address not found')).toMatch(/não existe/i);
  });

  // Inventar explicação para erro desconhecido é pior que mostrar o texto cru:
  // a pessoa acredita na explicação errada.
  it('devolve null quando não reconhece', () => {
    expect(explicaErroTecnico('KABOOM 42')).toBeNull();
    expect(explicaErroTecnico('')).toBeNull();
    expect(explicaErroTecnico(null)).toBeNull();
  });
});
