import { describe, expect, it } from 'vitest';
import {
  displayNameFromEmail,
  extractForwardedMessageBody,
  extractInboundMessageBody,
  hasWaterIssueSignal,
  stripHtml,
  stripQuotedReply,
  stripSignature,
} from '../../api/_lib/inboundBody.js';

describe('stripQuotedReply', () => {
  it('corta o histórico citado e mantém só a resposta nova', () => {
    const email = [
      'Bom dia, pode seguir com o orçamento.',
      '',
      'Em 12 de março de 2026, Fulano <fulano@px.com.br> escreveu:',
      '> Segue a cotação em anexo',
      '> Aguardo retorno',
    ].join('\n');
    expect(stripQuotedReply(email)).toBe('Bom dia, pode seguir com o orçamento.');
  });

  it('reconhece o marcador em inglês e o do Outlook', () => {
    expect(stripQuotedReply('Ok\n\nOn Mar 12, 2026, John wrote:\n> antigo')).toBe('Ok');
    expect(stripQuotedReply('Ok\n\n-----Original Message-----\nDe: alguem')).toBe('Ok');
  });

  it('corta a citação inline (quando o cliente não quebra a linha)', () => {
    const inline = 'Autorizado. Em 12/03 Fulano <f@px.com.br> escreveu: coisa antiga';
    expect(stripQuotedReply(inline)).toBe('Autorizado.');
  });

  // Guard `match.index > 0`: se o marcador abre a mensagem, cortar deixaria a OS
  // sem texto nenhum. Preferimos devolver sujo a devolver vazio.
  it('não corta quando o marcador abre a mensagem (evita esvaziar a OS)', () => {
    expect(stripQuotedReply('Em 12/03 Fulano escreveu:\n> só citação')).toBe(
      'Em 12/03 Fulano escreveu:'
    );
  });

  it('remove linhas citadas soltas mesmo sem marcador', () => {
    expect(stripQuotedReply('resposta\n> citado\nfim')).toBe('resposta\nfim');
  });
});

describe('stripSignature', () => {
  it('corta a partir do marcador de despedida', () => {
    const email = ['Segue autorizado.', '', 'Atenciosamente,', 'Fulano de Tal', 'Gerente'].join('\n');
    expect(stripSignature(email)).toBe('Segue autorizado.');
  });

  it('corta no separador -- padrão de assinatura', () => {
    expect(stripSignature('conteúdo\n\n--\nFulano')).toBe('conteúdo');
  });

  it('remove telefone, e-mail, endereço e imagem de assinatura em linhas soltas', () => {
    const email = [
      'Preciso de um eletricista.',
      'fulano@px.com.br',
      '(85) 99999-8888',
      'Av. Santos Dumont, 1000',
      '[image: logo.png]',
    ].join('\n');
    expect(stripSignature(email)).toBe('Preciso de um eletricista.');
  });

  // Mesmo guard do stripQuotedReply: marcador na posição 0 não corta.
  it('não engole tudo quando a mensagem começa pela despedida', () => {
    expect(stripSignature('Atenciosamente,\nFulano')).toBe('Atenciosamente,\nFulano');
  });
});

describe('extractForwardedMessageBody', () => {
  it('devolve vazio quando não há encaminhamento', () => {
    expect(extractForwardedMessageBody('mensagem simples')).toBe('');
  });

  it('pula os cabeçalhos e devolve o corpo encaminhado junto do prefácio', () => {
    const email = [
      'Segue abaixo o chamado.',
      '',
      '---------- Mensagem encaminhada ----------',
      'De: Fulano <fulano@px.com.br>',
      'Data: 12 de março de 2026',
      'Assunto: Ar condicionado',
      'Para: manutencao@px.com.br',
      '',
      'O ar da sala 3 parou de gelar.',
    ].join('\n');
    expect(extractForwardedMessageBody(email)).toBe(
      'Segue abaixo o chamado.\n\nO ar da sala 3 parou de gelar.'
    );
  });

  it('aceita o marcador em inglês', () => {
    const email = ['---------- Forwarded message ----------', 'From: a@b.com', '', 'corpo real'].join(
      '\n'
    );
    expect(extractForwardedMessageBody(email)).toBe('corpo real');
  });
});

describe('extractInboundMessageBody', () => {
  it('prefere o texto puro, já limpo de citação e assinatura', () => {
    const texto = 'Lâmpada queimada na recepção.\n\nAtenciosamente,\nFulano';
    expect(extractInboundMessageBody(texto, '<p>ignorado</p>')).toBe('Lâmpada queimada na recepção.');
  });

  it('cai para o HTML quando não veio texto puro', () => {
    expect(extractInboundMessageBody('', '<p>Vazamento no <b>banheiro</b></p>')).toBe(
      'Vazamento no banheiro'
    );
  });

  it('o corpo encaminhado vence a citação (chamado repassado não vira vazio)', () => {
    const email = [
      '---------- Mensagem encaminhada ----------',
      'De: Fulano <f@px.com.br>',
      '',
      'Torneira pingando no refeitório.',
    ].join('\n');
    expect(extractInboundMessageBody(email, '')).toBe('Torneira pingando no refeitório.');
  });

  it('sem conteúdo aproveitável devolve vazio', () => {
    expect(extractInboundMessageBody('', '')).toBe('');
  });
});

describe('stripHtml', () => {
  it('descarta script e style junto com as tags', () => {
    expect(stripHtml('<style>p{color:red}</style><p>oi</p><script>alert(1)</script>')).toBe('oi');
  });
});

describe('displayNameFromEmail', () => {
  it('usa o nome antes do endereço', () => {
    expect(displayNameFromEmail('"Fulano de Tal" <fulano@px.com.br>')).toBe('Fulano de Tal');
    expect(displayNameFromEmail('Fulano de Tal <fulano@px.com.br>')).toBe('Fulano de Tal');
  });

  it('sem nome, monta a partir do endereço', () => {
    expect(displayNameFromEmail('<joao.silva@px.com.br>')).toBe('Joao Silva');
    expect(displayNameFromEmail('maria_souza@px.com.br')).toBe('Maria Souza');
  });

  it('cai no rótulo genérico quando não dá para identificar', () => {
    expect(displayNameFromEmail('')).toBe('Solicitante por e-mail');
  });
});

describe('hasWaterIssueSignal', () => {
  it('detecta goteira/infiltração independente de acento e caixa', () => {
    expect(hasWaterIssueSignal('Tem uma INFILTRAÇÃO na parede')).toBe(true);
    expect(hasWaterIssueSignal('goteira no teto')).toBe(true);
  });

  it('não dispara em texto sem relação', () => {
    expect(hasWaterIssueSignal('trocar lâmpada')).toBe(false);
    expect(hasWaterIssueSignal('')).toBe(false);
  });
});
