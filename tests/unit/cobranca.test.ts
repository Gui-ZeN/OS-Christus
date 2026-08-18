import { describe, expect, it } from 'vitest';
import {
  DESFECHO,
  cobrancaPendente,
  cobrancasConcluidas,
  linkDaConversa,
  mensagemDeCobranca,
  podeCobrar,
  telefoneUtilizavel,
  tentativasDe,
  validarDesfecho,
} from '../../api/_lib/cobranca.js';

describe('o telefone sai de um cadastro que é texto livre', () => {
  it('pega o número mesmo com nome e sujeira em volta', () => {
    expect(telefoneUtilizavel('(85) 99999-8888')).toBe('5585999998888');
    expect(telefoneUtilizavel('falar com a Ana (85) 3232-1010')).toBe('558532321010');
    expect(telefoneUtilizavel('+55 85 99999-8888')).toBe('5585999998888');
    expect(telefoneUtilizavel('85999998888')).toBe('5585999998888');
  });

  it('sem DDD, não há link — é o caso do cadastro real', () => {
    // "O contato deste fornecedor está cadastrado como *falar com o João
    // 99999-8888* — sem DDD, o link não monta. Cobre como cobra hoje."
    expect(telefoneUtilizavel('falar com o João 99999-8888')).toBeNull();
    expect(telefoneUtilizavel('99999-8888')).toBeNull();
  });

  it('não inventa número juntando dígitos soltos do endereço', () => {
    // Juntar todos os dígitos transformaria isto num telefone que não existe.
    expect(telefoneUtilizavel('Rua 5, casa 12')).toBeNull();
    expect(telefoneUtilizavel('Rua 5, casa 12 — (85) 99999-8888')).toBe('5585999998888');
  });

  it('cadastro vazio ou sem número não trava nada', () => {
    expect(telefoneUtilizavel('')).toBeNull();
    expect(telefoneUtilizavel(null)).toBeNull();
    expect(telefoneUtilizavel('procurar no portão')).toBeNull();
  });

  it('DDD inválido é recusado', () => {
    expect(telefoneUtilizavel('(01) 99999-8888')).toBeNull();
  });
});

describe('o sistema escreve a mensagem, a pessoa não redige', () => {
  const base = {
    quemCobra: 'Larissa',
    ordens: ['OS-0184'],
    servico: 'troca de disjuntor',
    local: 'Bloco C, Benfica',
    quando: 'hoje às 10h',
  };

  it('monta a cobrança com tudo que a conversa precisa', () => {
    const m = mensagemDeCobranca(base);
    expect(m).toContain('Larissa');
    expect(m).toContain('Grupo Christus');
    expect(m).toContain('OS-0184');
    expect(m).toContain('troca de disjuntor');
    expect(m).toContain('hoje às 10h');
    expect(m).toContain('não compareceu');
    expect(m).toContain('nova data');
  });

  it('a segunda tentativa diz que já houve uma antes', () => {
    expect(mensagemDeCobranca({ ...base, segundaTentativa: true })).toContain('Já tentamos contato antes');
  });

  it('com dado faltando, ainda sai uma mensagem que se sustenta', () => {
    const m = mensagemDeCobranca({ ordens: ['OS-1'] });
    expect(m).toContain('OS-1');
    expect(m).toContain('não compareceu');
    expect(m).not.toContain('undefined');
    expect(m).not.toContain('  ');
  });
});

describe('o link só existe quando dá para abrir a conversa', () => {
  it('monta o wa.me com a mensagem embutida', () => {
    const link = linkDaConversa('(85) 99999-8888', 'Olá, tudo bem?');
    expect(link).toContain('https://wa.me/5585999998888');
    expect(link).toContain(encodeURIComponent('Olá, tudo bem?'));
  });

  it('sem telefone utilizável, o botão fica sem link — apagado, não quebrado', () => {
    expect(linkDaConversa('falar com o João 99999-8888', 'oi')).toBeNull();
  });
});

describe('só se cobra falta CONFIRMADA', () => {
  it('falta confirmada pode ser cobrada', () => {
    expect(podeCobrar({ state: 'faltou' })).toBe(true);
  });

  it('silêncio da sede não autoriza cobrança', () => {
    // Cobrar quem talvez tenha ido é o erro que o sistema inteiro foi desenhado
    // para não cometer.
    expect(podeCobrar({ state: 'sem-confirmacao' })).toBe(false);
    expect(podeCobrar({ state: 'agendado' })).toBe(false);
    expect(podeCobrar({ state: 'compareceu' })).toBe(false);
  });
});

describe('clique não conta como cobrança concluída', () => {
  const tentativa = { em: new Date('2026-08-17T13:00:00Z'), por: 'larissa@px.com.br', desfecho: null };

  it('tentativa sem desfecho NÃO entra na contagem de atuação', () => {
    // É a contagem inflada que a auditoria pegou: registra, abre o WhatsApp, é
    // interrompido — e o sistema contabilizava atuação que não houve.
    const c = { cobrancas: [tentativa] };
    expect(tentativasDe(c)).toBe(1);
    expect(cobrancasConcluidas(c)).toHaveLength(0);
  });

  it('com desfecho, aí sim conta', () => {
    const c = { cobrancas: [{ ...tentativa, desfecho: DESFECHO.NAO_RESPONDEU }] };
    expect(cobrancasConcluidas(c)).toHaveLength(1);
  });

  it('aponta a tentativa pendente mais recente', () => {
    const c = { cobrancas: [{ ...tentativa, desfecho: DESFECHO.RESPONDEU }, tentativa] };
    expect(cobrancaPendente(c)?.indice).toBe(1);
  });

  it('sem nenhuma pendente, não há o que desfechar', () => {
    expect(cobrancaPendente({ cobrancas: [{ ...tentativa, desfecho: DESFECHO.RESPONDEU }] })).toBeNull();
    expect(cobrancaPendente({})).toBeNull();
  });
});

describe('o desfecho', () => {
  const comPendente = { cobrancas: [{ em: new Date(), por: 'x', desfecho: null }] };

  it('aceita os três do plano', () => {
    for (const d of ['respondeu', 'nao-respondeu', 'nova-data']) {
      expect(validarDesfecho(comPendente, d).ok, d).toBe(true);
    }
  });

  it('recusa desfecho inventado', () => {
    expect(validarDesfecho(comPendente, 'resolvido').ok).toBe(false);
  });

  it('recusa desfecho sem tentativa pendente', () => {
    expect(validarDesfecho({ cobrancas: [] }, 'respondeu').ok).toBe(false);
  });
});
