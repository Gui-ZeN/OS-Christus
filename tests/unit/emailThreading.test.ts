import { describe, expect, it } from 'vitest';
import {
  buildConversationSubject,
  buildInboundHistoryId,
  buildReplySubject,
  escapeHtml,
  isTicketConversationSubject,
  normalizeMessageIdToken,
  parseMessageIdCandidates,
  limitarReferencias,
} from '../../api/_lib/emailThreading.js';

describe('buildConversationSubject', () => {
  it('prefixa OS e sede', () => {
    expect(buildConversationSubject('OS-0100', 'Lâmpada queimada', '', 'PQL3')).toBe(
      'OS-0100 - PQL3 - Lâmpada queimada'
    );
  });

  it('sem sede mantém só o id da OS', () => {
    expect(buildConversationSubject('OS-0100', 'Vazamento', '', '')).toBe('OS-0100 - Vazamento');
  });

  it('NÃO duplica o prefixo em respostas sucessivas (idempotente)', () => {
    const primeiro = buildConversationSubject('OS-0100', 'Lâmpada', '', 'PQL3');
    expect(buildConversationSubject('OS-0100', primeiro, '', 'PQL3')).toBe(primeiro);
    // também reconhece o formato antigo, sem sede
    expect(buildConversationSubject('OS-0100', 'OS-0100 - Lâmpada', '', 'PQL3')).toBe(
      'OS-0100 - Lâmpada'
    );
  });

  it('cai no fallback quando não há assunto', () => {
    expect(buildConversationSubject('OS-0100', '', '', '')).toBe('OS-0100 - Atualização da OS');
    expect(buildConversationSubject('', '', 'Assunto solto', '')).toBe('Assunto solto');
  });
});

describe('buildReplySubject', () => {
  it('acrescenta Re: uma única vez', () => {
    expect(buildReplySubject('OS-0100 - Lâmpada')).toBe('Re: OS-0100 - Lâmpada');
    expect(buildReplySubject('Re: OS-0100 - Lâmpada')).toBe('Re: OS-0100 - Lâmpada');
  });

  it('reconhece variantes de encaminhamento sem duplicar', () => {
    for (const prefixo of ['RES:', 'Fw:', 'FWD:', 're :']) {
      const assunto = `${prefixo} algo`;
      expect(buildReplySubject(assunto)).toBe(assunto);
    }
  });

  it('assunto vazio devolve vazio', () => {
    expect(buildReplySubject('')).toBe('');
  });
});

describe('isTicketConversationSubject', () => {
  it('só casa o prefixo da própria OS', () => {
    expect(isTicketConversationSubject('OS-0100', 'OS-0100 - algo')).toBe(true);
    expect(isTicketConversationSubject('OS-0100', 'os-0100 - algo')).toBe(true);
    expect(isTicketConversationSubject('OS-0100', 'OS-0101 - algo')).toBe(false);
    expect(isTicketConversationSubject('', 'qualquer')).toBe(false);
  });
});

describe('Message-Id', () => {
  it('normaliza sempre entre < >', () => {
    expect(normalizeMessageIdToken('abc@x')).toBe('<abc@x>');
    expect(normalizeMessageIdToken('<abc@x>')).toBe('<abc@x>');
    expect(normalizeMessageIdToken('  ')).toBeNull();
  });

  it('candidatos combinam In-Reply-To e References sem repetir', () => {
    const candidatos = parseMessageIdCandidates('<a@x>', '<a@x> <b@x>  <c@x>');
    expect(candidatos).toEqual(['<a@x>', '<b@x>', '<c@x>']);
  });
});

describe('buildInboundHistoryId', () => {
  it('é determinístico pelo messageId (reprocessar não duplica entrada)', () => {
    expect(buildInboundHistoryId('<abc@mail>', 'x')).toBe(buildInboundHistoryId('<abc@mail>', 'y'));
    expect(buildInboundHistoryId('<abc@mail>')).toBe('mail-abc-mail');
  });
});

describe('HTML seguro', () => {
  it('escapa o que quebraria a marcação', () => {
    expect(escapeHtml('<b>"x"&y</b>')).toBe('&lt;b&gt;&quot;x&quot;&amp;y&lt;/b&gt;');
  });

});

describe('o corte da corrente não pode derrubar a raiz', () => {
  /**
   * ⚠️ O DEFEITO: era `.slice(-20)`, que guarda as ÚLTIMAS 20 — e a raiz é a
   * PRIMEIRA da lista. Passando de 20 mensagens, a âncora da conversa era a
   * primeira coisa a cair, e o encadeamento se rompia numa OS longa: exatamente
   * quando a conversa mais importa.
   *
   * Não dava erro nenhum. Referência faltando não falha — só deixa de agrupar.
   */
  const raiz = '<raiz@real>';
  const corrente = (quantas: number) =>
    Array.from({ length: quantas }, (_, i) => `<m${i}@x>`);

  it('a raiz sobrevive ao corte', () => {
    const cortada = limitarReferencias([raiz, ...corrente(30)]);
    expect(cortada[0]).toBe(raiz);
  });

  it('e as mais RECENTES também — o meio é que sai', () => {
    const cortada = limitarReferencias([raiz, ...corrente(30)]);
    expect(cortada).toHaveLength(20);
    expect(cortada[cortada.length - 1]).toBe('<m29@x>');
    // O meio foi descartado: é o que o RFC manda cortar.
    expect(cortada).not.toContain('<m5@x>');
  });

  it('corrente curta passa inteira', () => {
    const curta = [raiz, '<a@x>', '<b@x>'];
    expect(limitarReferencias(curta)).toEqual(curta);
  });

  it('exatamente no teto não corta nada', () => {
    const noLimite = [raiz, ...corrente(19)];
    expect(limitarReferencias(noLimite)).toHaveLength(20);
    expect(limitarReferencias(noLimite)[0]).toBe(raiz);
  });

  it('repetido vira um só, e a ordem da primeira aparição manda', () => {
    expect(limitarReferencias([raiz, '<a@x>', raiz, '<b@x>'])).toEqual([raiz, '<a@x>', '<b@x>']);
  });

  it('vazio, nulo e não-lista não explodem', () => {
    expect(limitarReferencias([])).toEqual([]);
    expect(limitarReferencias(null as never)).toEqual([]);
    expect(limitarReferencias([null, undefined, ''] as never)).toEqual([]);
  });
});
