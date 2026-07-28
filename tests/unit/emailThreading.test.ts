import { describe, expect, it } from 'vitest';
import {
  buildConversationSubject,
  buildInboundHistoryId,
  buildReplySubject,
  buildSimpleHtmlEmail,
  buildThreadRootMessageId,
  escapeHtml,
  isTicketConversationSubject,
  normalizeMessageIdToken,
  parseMessageIdCandidates,
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

  it('raiz da thread é estável e segura para a OS', () => {
    expect(buildThreadRootMessageId('OS-0100')).toBe('<os-thread-os-0100@serv3>');
    expect(buildThreadRootMessageId('OS-0100')).toBe(buildThreadRootMessageId('OS-0100'));
    // caracteres estranhos não vazam para o header
    expect(buildThreadRootMessageId('OS/01 00')).toBe('<os-thread-os-01-00@serv3>');
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

  it('converte parágrafos e quebras, escapando o conteúdo', () => {
    expect(buildSimpleHtmlEmail('linha 1\nlinha 2\n\npar 2')).toBe(
      '<p>linha 1<br>linha 2</p><p>par 2</p>'
    );
    expect(buildSimpleHtmlEmail('<script>alert(1)</script>')).toContain('&lt;script&gt;');
    expect(buildSimpleHtmlEmail('')).toBe('<p></p>');
  });
});
