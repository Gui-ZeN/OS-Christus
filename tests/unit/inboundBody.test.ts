import { describe, expect, it } from 'vitest';
import {
  displayNameFromEmail,
  dropContactNoiseLines,
  extractForwardedMessageBody,
  extractInboundMessageBody,
  hasWaterIssueSignal,
  stripHtml,
  stripLeadingForwardHeader,
  stripQuotedReply,
  stripSignature,
  stripSystemEcho,
  tidyInboundText,
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

describe('e-mail encaminhado do mundo real (OS-0268)', () => {
  // Caso reportado: o corpo da OS trazia o cabeçalho do encaminhamento, a
  // assinatura e o e-mail AUTOMÁTICO do próprio Serv3 achatado em texto.
  const emailReal = [
    'Para: PSC;',
    'supald01@unichristus.edu.br , Catarina Alencar <operacional17@px.com.br>,',
    'Matheus Melo <soe10@px.com.br>, Yuri Frota <soe14@px.com.br>',
    '',
    'Pedro, boa tarde!',
    '',
    'Você consegue me ajudar com essa demanda, por favor?',
    '',
    'A botoeira utilizada para liberação da saída do setor de imagem, não está funcionando. Tme já tentou verificar e não identificou o problema.',
    '',
    'Abs;',
    '',
    'Serv3',
    'Recebimento',
    'OS-0268 registrada',
    'Ticket',
    'OS-0268',
    'Mensagem',
    'Olá Josy,',
    'Recebemos sua solicitação e ela já entrou na fila de triagem.',
    'Sede: ALD',
    'Acompanhar OS <https://serv3.vercel.app/?tracking=trk_1a4fac00b89e4d27>',
    'Link completo: https://serv3.vercel.app/?tracking=trk_1a4fac00b89e4d27',
    'Este é um comunicado automático do sistema Serv3.',
  ].join('\n');

  const limpo = extractInboundMessageBody(emailReal, '');

  it('mantém as três linhas que a pessoa realmente escreveu', () => {
    expect(limpo).toBe(
      [
        'Pedro, boa tarde!',
        '',
        'Você consegue me ajudar com essa demanda, por favor?',
        '',
        'A botoeira utilizada para liberação da saída do setor de imagem, não está funcionando. Tme já tentou verificar e não identificou o problema.',
      ].join('\n')
    );
  });

  it('não vaza endereço de e-mail de ninguém', () => {
    expect(limpo).not.toMatch(/@/);
  });

  it('não traz de volta o e-mail automático do próprio Serv3', () => {
    expect(limpo).not.toContain('comunicado automático');
    expect(limpo).not.toContain('fila de triagem');
    expect(limpo).not.toContain('tracking=');
  });
});

describe('conversa encaminhada do mundo real (OS-0289 — "Tapumes salas de aula")', () => {
  // Caso reportado: a OS nasceu com QUATRO linhas de protocolo ("Bom dia, Serv3 em
  // cópia") e perdeu a conversa inteira — o problema, as fotos e seis meses de
  // decisões. Dois defeitos empilhados:
  //   1. o Gmail escreve "Forwarded Conversation" ao encaminhar uma THREAD, e só
  //      "forwarded message" era reconhecido;
  //   2. o bloco vem DENTRO da citação (prefixo ">"), então caía no filtro de
  //      citação junto com o resto.
  const emailReal = [
    'Bom dia,',
    '',
    'Serv3 em cópia.',
    '',
    'Atenciosamente,',
    '',
    'Em seg., 8 de jun. de 2026 às 15:53, Rafael Oliveira <',
    'operacional02@px.com.br> escreveu:',
    '',
    '> Deladier em cópia.',
    '>',
    '> ---------- Forwarded Conversation',
    '> Subject: Re: [BS] Tapumes salas de aula',
    '> ------------------------',
    '>',
    '> De: Fernando Vianna <operacional07@px.com.br>',
    '> Date: qua., 4 de fev. de 2026 às 14:49',
    '>',
    '> Pedro, há algum projeto para ca?',
    '>',
    '> Em qua., 14 de jan. de 2026 às 15:06, Maiara Gomes escreveu:',
    '>> Estamos com vários tapumes nas salas de aula estragados (os mesmo estão',
    '>> de desfazendo) podemos realizar a troca?',
  ].join('\n');

  const limpo = extractInboundMessageBody(emailReal, '');

  it('preserva o pedido original, que é a razão de a OS existir', () => {
    expect(limpo).toContain('tapumes nas salas de aula estragados');
    expect(limpo).toContain('podemos realizar a troca?');
  });

  it('preserva o histórico de decisão dentro da thread', () => {
    expect(limpo).toContain('há algum projeto para ca?');
  });

  it('mantém a atribuição de quem falou', () => {
    expect(limpo).toContain('Fernando Vianna');
    expect(limpo).toContain('Maiara Gomes');
  });

  it('não vaza endereço de e-mail de ninguém', () => {
    expect(limpo).not.toMatch(/@/);
  });

  it('não vaza a lista de destinatários quebrada em várias linhas', () => {
    // Regressão de produção: o Gmail quebra a lista em linhas SEM rótulo ("Para:"),
    // e a continuação escapava da redação — endereço de todo mundo entrava na OS.
    const comListaQuebrada = [
      '---------- Forwarded Conversation',
      'De: Fernando Vianna <operacional07@px.com.br>',
      'To: Pedro Rocha <pedro.rocha@px.com.br>, Rafael Oliveira <',
      'operacional02@px.com.br>, Ilom Alves de Oliveira Filho <soe01@px.com.br>',
      '',
      'Pedro, há algum projeto para ca?',
    ].join('\n');
    const saida = extractInboundMessageBody(comListaQuebrada, '');
    expect(saida).toContain('há algum projeto para ca?');
    expect(saida).not.toMatch(/@/);
    expect(saida).not.toContain('operacional02');
  });

  it('não vaza endereço pelo PREFÁCIO (a metade de baixo do cabeçalho quebrado)', () => {
    // Regressão de produção: 60 das primeiras entradas reparadas vazaram endereço
    // por esta porta. O prefácio passava só por citação/assinatura, sem redação —
    // e sem despedida para cortar, a linha "…@px.com.br> escreveu:" sobrevivia.
    const semDespedida = [
      'Bom dia,',
      '',
      'Em seg., 8 de jun. de 2026 às 15:53, Rafael Oliveira <',
      'operacional02@px.com.br> escreveu:',
      '',
      '> ---------- Forwarded Conversation',
      '> Subject: Tapumes',
      '>',
      '> Porta emperrada na sala 12.',
    ].join('\n');
    const saida = extractInboundMessageBody(semDespedida, '');
    expect(saida).toContain('Porta emperrada na sala 12.');
    expect(saida).not.toMatch(/@/);
    expect(saida).not.toContain('operacional02');
  });

  it('não sobra marca de citação', () => {
    expect(limpo).not.toMatch(/^\s*>/m);
  });

  it('o comportamento antigo (só a citação) devolveria quase nada', () => {
    // Guarda contra regressão: era ISTO que ia para a OS antes do conserto.
    expect(stripQuotedReply(emailReal)).not.toContain('tapumes');
    expect(limpo.length).toBeGreaterThan(stripQuotedReply(emailReal).length);
  });
});

describe('endereço nunca entra na OS — nem sem encaminhamento', () => {
  it('redige a citação inline de um e-mail comum (sem marcador de encaminhamento)', () => {
    // Este caminho nunca redigia nada: 17 entradas em produção seguiam com
    // endereço depois do primeiro mutirão de reparo por causa dele.
    const email = [
      'Pode seguir com o orçamento.',
      '',
      'Em 12 de março de 2026, Fulano <fulano@px.com.br>',
      'escreveu:',
    ].join('\n');
    const saida = extractInboundMessageBody(email, '');
    expect(saida).toContain('Pode seguir com o orçamento.');
    expect(saida).not.toMatch(/@/);
  });
});

describe('tidyInboundText — acabamento final', () => {
  it('tira o asterisco do negrito achatado pelo Gmail', () => {
    expect(tidyInboundText('*Fernando Guimarães Vianna*\nCoordenador *| *Infraestrutura')).toBe(
      'Fernando Guimarães Vianna\nCoordenador | Infraestrutura'
    );
  });

  it('preserva marcador de lista no início da linha', () => {
    expect(tidyInboundText('* trocar o tapume\n* pintar a parede')).toBe(
      '* trocar o tapume\n* pintar a parede'
    );
  });

  it('tira o marcador de imagem inline (o anexo real já vem separado)', () => {
    const saida = tidyInboundText('Segue abaixo\n[image: WhatsApp Image 2026-01-14.jpeg]\nAtt');
    expect(saida).not.toContain('[image:');
    expect(saida).toContain('Segue abaixo');
    expect(saida).toContain('Att');
  });

  it('junta o cabeçalho de citação quebrado em duas linhas', () => {
    expect(tidyInboundText('Em qua., 14 de jan., Maiara Gomes\nescreveu:')).toBe(
      'Em qua., 14 de jan., Maiara Gomes escreveu:'
    );
  });

  it('não deixa três linhas em branco seguidas', () => {
    expect(tidyInboundText('um\n\n\n\ndois')).toBe('um\n\ndois');
  });
});

describe('extractForwardedMessageBody — variações do marcador', () => {
  const corpo = (marcador: string) =>
    [marcador, 'De: Fulano <f@px.com.br>', '', 'Porta emperrada na sala 12.'].join('\n');

  it.each([
    '---------- Forwarded message ----------',
    '---------- Forwarded Conversation',
    '---------- Mensagem encaminhada ----------',
    'Conversa encaminhada',
  ])('reconhece %s', marcador => {
    expect(extractForwardedMessageBody(corpo(marcador))).toContain('Porta emperrada na sala 12.');
  });

  it('reconhece o marcador mesmo citado com ">"', () => {
    const citado = corpo('---------- Forwarded Conversation')
      .split('\n')
      .map(linha => `> ${linha}`)
      .join('\n');
    expect(extractForwardedMessageBody(citado)).toContain('Porta emperrada na sala 12.');
  });
});

describe('dropContactNoiseLines', () => {
  it('tira contato solto sem cortar na despedida (o encaminhado depende disso)', () => {
    const texto = ['Atenciosamente,', 'Fernando', 'fernando@px.com.br', '(85) 9128-9836', 'Segue o pedido.'].join('\n');
    const saida = dropContactNoiseLines(texto);
    expect(saida).toContain('Segue o pedido.');
    expect(saida).toContain('Atenciosamente,');
    expect(saida).not.toMatch(/@/);
    expect(saida).not.toContain('9128');
  });

  it('pega o telefone mesmo com o negrito do Gmail achatado em asterisco', () => {
    // Visto em produção na OS-0289: `*(85) 9 9128-9836*` escapava do filtro.
    const saida = dropContactNoiseLines(['*(85) 9 9128-9836*', 'Trocar o tapume.'].join('\n'));
    expect(saida).toContain('Trocar o tapume.');
    expect(saida).not.toContain('9128');
  });

  it('não confunde número de OS nem valor com telefone', () => {
    const saida = dropContactNoiseLines(['OS-0289', 'R$ 1.250,00', 'Sala 12'].join('\n'));
    expect(saida).toContain('OS-0289');
    expect(saida).toContain('R$ 1.250,00');
    expect(saida).toContain('Sala 12');
  });
});

describe('stripSignature — despedidas com ; e :', () => {
  it('corta "Abs;" (era o caso da OS-0268)', () => {
    expect(stripSignature('conteúdo\n\nAbs;\nJosy')).toBe('conteúdo');
  });

  it('corta as demais variantes de pontuação', () => {
    for (const despedida of ['Abs;', 'Abs:', 'Atenciosamente:', 'Cordialmente;', 'Abraços,', 'Obrigada!']) {
      expect(stripSignature(`texto útil\n\n${despedida}\nFulano`)).toBe('texto útil');
    }
  });

  it('não corta quando a palavra faz parte de uma frase', () => {
    const frase = 'Preciso de abraços de verdade nesse setor';
    expect(stripSignature(frase)).toBe(frase);
  });
});

describe('stripLeadingForwardHeader', () => {
  it('remove o cabeçalho e a lista de destinatários quebrada em linhas', () => {
    const texto = [
      'Para: PSC;',
      'a@x.com , Fulano <b@x.com>,',
      'Beltrano <c@x.com>',
      '',
      'Conteúdo real aqui.',
    ].join('\n');
    expect(stripLeadingForwardHeader(texto)).toBe('Conteúdo real aqui.');
  });

  it('não toca em e-mail citado no MEIO do texto', () => {
    const texto = 'Favor contatar Fulano <fulano@px.com.br> sobre o reparo.';
    expect(stripLeadingForwardHeader(texto)).toBe(texto);
  });

  it('sem cabeçalho, devolve o texto intacto', () => {
    expect(stripLeadingForwardHeader('Só o conteúdo.')).toBe('Só o conteúdo.');
  });
});

describe('stripSystemEcho', () => {
  it('corta a partir do rodapé do próprio sistema', () => {
    const texto = 'Minha dúvida.\n\nEste é um comunicado automático do sistema Serv3.';
    expect(stripSystemEcho(texto)).toBe('Minha dúvida.');
  });

  it('corta também pelo link de acompanhamento', () => {
    const texto = 'Minha dúvida.\n\nLink completo: https://serv3.vercel.app/?tracking=abc';
    expect(stripSystemEcho(texto)).toBe('Minha dúvida.');
  });

  it('mensagem que é SÓ o eco não vira vazia', () => {
    const texto = 'Este é um comunicado automático do sistema Serv3.';
    expect(stripSystemEcho(texto)).toBe(texto);
  });
});
