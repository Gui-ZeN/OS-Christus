import { describe, expect, it } from 'vitest';
import {
  buildAccessEmailTemplate,
  buildConversationHtmlEmail,
  buildNoticeEmailTemplate,
  buildTicketEmailTemplate,
} from '../../api/_lib/emailTemplates.js';
import { buildEmailPreviewHtml } from '../../src/utils/emailTemplatePreview';

const PAGAMENTO = {
  trigger: 'EMAIL-FINANCEIRO-PAGAMENTO',
  title: 'Lançamento de pagamento',
  ticketId: 'OS-2418',
  status: 'Aguardando pagamento',
  ctaUrl: 'https://serv3.vercel.app/?tracking=abc123&view=financeiro',
  ctaLabel: 'Abrir financeiro',
  bodyText: 'Nota fiscal 4471 anexada.',
  metricRows: [
    { label: 'Valor bruto', value: 'R$ 12.480,00' },
    { label: 'Imposto', value: 'R$ 1.372,80' },
    { label: 'Valor a pagar', value: 'R$ 11.107,20' },
  ],
  detailCards: [
    { title: 'Fornecedor', rows: [{ label: 'CNPJ', value: '12.345.678/0001-90' }] },
  ],
};

function contarOcorrencias(texto: string, alvo: string) {
  return texto.split(alvo).length - 1;
}

describe('o e-mail não empilha caixa dentro de caixa', () => {
  it('usa uma moldura só — o desenho antigo aninhava quatro níveis', () => {
    const { html } = buildTicketEmailTemplate(PAGAMENTO);
    // Cada `border:1px solid` era uma caixa: a externa, o bloco "Mensagem", um por
    // cartão de métrica e um por cartão de detalhe. Sobra a externa.
    expect(contarOcorrencias(html, 'border:1px solid')).toBe(1);
  });

  it('não repete a OS no cabeçalho', () => {
    const { html } = buildTicketEmailTemplate(PAGAMENTO);
    const cabecalho = html.slice(0, html.indexOf('Valor bruto'));
    expect(contarOcorrencias(cabecalho, 'OS-2418')).toBe(1);
  });

  it('não repete o endereço do botão como "link completo"', () => {
    const { html } = buildTicketEmailTemplate(PAGAMENTO);
    expect(contarOcorrencias(html, 'tracking=abc123')).toBe(1);
    expect(html).not.toContain('Link completo');
  });

  it('mas a versão em texto continua levando o endereço', () => {
    const { text } = buildTicketEmailTemplate(PAGAMENTO);
    expect(text).toContain('https://serv3.vercel.app/?tracking=abc123&view=financeiro');
  });
});

describe('os valores viram tabela, e a conclusão fica em destaque', () => {
  it('destaca a última linha — é onde vai o valor a pagar', () => {
    const { html } = buildTicketEmailTemplate(PAGAMENTO);
    const posBruto = html.indexOf('R$ 12.480,00');
    const posPagar = html.indexOf('R$ 11.107,20');
    // O trecho do "valor a pagar" carrega o peso; o do "valor bruto", não.
    expect(html.slice(posPagar - 220, posPagar)).toContain('font-weight:600');
    expect(html.slice(posBruto - 220, posBruto)).not.toContain('font-weight:600');
  });

  it('com um valor só, não inventa destaque', () => {
    const { html } = buildTicketEmailTemplate({
      ...PAGAMENTO,
      metricRows: [{ label: 'Total', value: 'R$ 90,00' }],
      detailCards: [],
    });
    const pos = html.indexOf('R$ 90,00');
    expect(html.slice(pos - 220, pos)).not.toContain('font-weight:600');
  });

  it('alinha número à direita, para a coluna de dinheiro comparar', () => {
    const { html } = buildTicketEmailTemplate(PAGAMENTO);
    expect(html).toContain('font-variant-numeric:tabular-nums');
  });
});

describe('nenhum texto do e-mail cai abaixo de 4,5:1', () => {
  const luminancia = (hex: string) => {
    const canais = (hex.match(/\w\w/g) as string[])
      .map(par => parseInt(par, 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
  };
  const contraste = (a: string, b: string) => {
    const [x, y] = [luminancia(a), luminancia(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };

  it('todo `color:#xxxxxx` do corpo passa sobre o papel branco', () => {
    const { html } = buildTicketEmailTemplate(PAGAMENTO);
    const corpo = html.slice(html.indexOf('padding:26px 28px 30px'));
    const cores = [...new Set(corpo.match(/color:#[0-9a-f]{6}/g) || [])]
      .map(t => t.replace('color:', ''))
      // O branco é texto sobre o botão escuro, não sobre o papel.
      .filter(cor => cor !== '#ffffff');

    expect(cores.length).toBeGreaterThan(0);
    for (const cor of cores) {
      expect(contraste(cor, '#ffffff'), `${cor} sobre o papel`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('a prévia das Configurações mostra o e-mail que sai de verdade', () => {
  const modelo = {
    trigger: 'EMAIL-APROVACAO',
    subject: 'OS {{ticket.id}} aguardando aprovação',
    body: 'Olá {{requester.name}}, o chamado seguiu para aprovação.',
  } as never;

  it('renderiza pela mesma moldura do envio', () => {
    const previa = buildEmailPreviewHtml(modelo);
    const enviado = buildTicketEmailTemplate(PAGAMENTO).html;
    // Antes a prévia terminava em "Prévia visual do e-mail institucional" e o envio
    // em "comunicado automático" — eram dois desenhos diferentes.
    const rodape = 'Comunicado automático do Serv3.';
    expect(previa).toContain(rodape);
    expect(enviado).toContain(rodape);
    expect(contarOcorrencias(previa, 'border:1px solid')).toBe(1);
  });

  it('substitui as variáveis do modelo', () => {
    const previa = buildEmailPreviewHtml(modelo);
    expect(previa).toContain('OS OS-0051 aguardando aprovação');
    expect(previa).toContain('Olá Solicitante');
    expect(previa).not.toContain('{{');
  });
});

describe('a resposta da conversa continua sem moldura, mas com tipografia', () => {
  it('não vira cartão — cai na thread do solicitante', () => {
    const html = buildConversationHtmlEmail('Bom dia, o técnico passa amanhã.');
    expect(html).not.toContain('<!doctype html>');
    expect(html).not.toContain('Comunicado automático');
    expect(html).not.toContain('Serv3');
  });

  it('define fonte, tamanho e cor — antes saía no padrão de cada cliente', () => {
    const html = buildConversationHtmlEmail('Bom dia.');
    expect(html).toContain('font-family:');
    expect(html).toContain('font-size:15px');
  });

  it('ganha link e @menção, como já acontecia pelo cartão', () => {
    const html = buildConversationHtmlEmail('Foto em https://drive.google.com/x — @Ana Paula vê.');
    expect(html).toContain('<a href="https://drive.google.com/x"');
    expect(html).toContain('<strong');
  });

  it('mantém parágrafo, quebra simples e escape', () => {
    expect(buildConversationHtmlEmail('linha 1\nlinha 2\n\npar 2')).toContain('linha 1<br/>linha 2');
    expect(buildConversationHtmlEmail('<script>alert(1)</script>')).toContain('&lt;script&gt;');
    expect(buildConversationHtmlEmail('')).toBe('<p></p>');
  });
});

describe('o aviso de chuva deixou de sair em texto puro', () => {
  const sinal = {
    source: 'posto',
    detalhe: 'chuva agora (0.6 mm na leitura)',
    fontes: {
      posto: { detalhe: 'chuva agora (0.6 mm na leitura)' },
      aeroporto: { detalhe: 'sem chuva no aeroporto', speci: false },
    },
  };

  it('usa a mesma moldura dos outros e-mails', () => {
    const { html } = buildNoticeEmailTemplate({
      eyebrow: 'Clima',
      title: 'Começou a chover em Fortaleza',
      detailCards: [{ title: 'Fontes', rows: [{ label: 'Pluviômetros', value: sinal.fontes.posto.detalhe }] }],
    });
    expect(html).toContain('Comunicado automático do Serv3.');
    expect(contarOcorrencias(html, 'border:1px solid')).toBe(1);
  });

  it('o disparo de teste se identifica na tarja — a única caixa colorida que sobrou', () => {
    const comTeste = buildNoticeEmailTemplate({
      title: 'Começou a chover',
      alerta: { titulo: 'Teste — não é chuva de verdade', detalhe: 'Disparo simulado.' },
    }).html;
    const semTeste = buildNoticeEmailTemplate({ title: 'Começou a chover' }).html;

    expect(comTeste).toContain('Teste — não é chuva de verdade');
    expect(comTeste).toContain('border-left:4px solid');
    expect(semTeste).not.toContain('border-left:4px solid');
  });
});

describe('o que já funcionava continua funcionando', () => {
  it('corta assinatura colada no fim da mensagem', () => {
    const { text } = buildTicketEmailTemplate({
      ...PAGAMENTO,
      bodyText: 'Segue o parecer.\n\nAtenciosamente,\nJoão\n(85) 99999-9999',
    });
    expect(text).toContain('Segue o parecer.');
    expect(text).not.toContain('99999-9999');
  });

  it('transforma URL solta do corpo em link e destaca @menção', () => {
    const { html } = buildTicketEmailTemplate({
      ...PAGAMENTO,
      bodyText: 'Foto em https://drive.google.com/abc — @Ana Paula confere.',
    });
    expect(html).toContain('<a href="https://drive.google.com/abc"');
    expect(html).toContain('<strong style="color:#7a4f18;">@Ana Paula</strong>');
  });

  it('quebra de linha simples continua sendo quebra', () => {
    const { html } = buildTicketEmailTemplate({
      ...PAGAMENTO,
      bodyText: 'Primeira linha\nSegunda linha',
    });
    expect(html).toContain('Primeira linha<br/>Segunda linha');
  });

  it('escapa HTML vindo de e-mail de fora', () => {
    const { html } = buildTicketEmailTemplate({
      ...PAGAMENTO,
      bodyText: '<script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('o e-mail de acesso usa a mesma moldura', () => {
    const { html, text } = buildAccessEmailTemplate({
      recipientName: 'Marcos',
      ctaUrl: 'https://serv3.vercel.app/?senha=xyz',
    });
    expect(html).toContain('Olá Marcos,');
    expect(html).toContain('Comunicado automático do Serv3.');
    expect(contarOcorrencias(html, 'border:1px solid')).toBe(1);
    expect(text).toContain('https://serv3.vercel.app/?senha=xyz');
  });
});
