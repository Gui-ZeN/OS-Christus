import { describe, expect, it } from 'vitest';
import {
  buildAccessEmailTemplate,
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
  it('não tem caixa nenhuma — nem a externa, que era a última que restava', () => {
    const { html } = buildTicketEmailTemplate(PAGAMENTO);
    // Cada `border:1px solid` era uma caixa: a externa, o bloco "Mensagem", um por
    // cartão de métrica e um por cartão de detalhe. Foram todas.
    expect(contarOcorrencias(html, 'border:1px solid')).toBe(0);
  });

  it('não tem tarja escura, fundo colorido nem botão preenchido', () => {
    const { html } = buildTicketEmailTemplate(PAGAMENTO);
    // O desenho antigo abria com uma faixa #1f1a15 sobre um papel #ffffff dentro de
    // um fundo bege, e fechava num botão preto. Só o branco sobrou.
    expect(html).not.toContain('#1f1a15');
    expect(html).not.toContain('#efe8de');
    // Sobra um `background:` no arquivo inteiro: o branco do corpo.
    expect(contarOcorrencias(html, 'background:')).toBe(1);
    expect(html).toContain('background:#ffffff');
  });

  it('usa uma família de fonte só — o serifado do título saiu junto', () => {
    const { html } = buildTicketEmailTemplate(PAGAMENTO);
    expect(html).not.toContain('Georgia');
    expect(contarOcorrencias(html, 'font-family:')).toBe(1);
  });

  it('assina com "Serv3" e nada mais', () => {
    const { html } = buildTicketEmailTemplate(PAGAMENTO);
    expect(html).not.toContain('Comunicado automático');
    expect(html).toContain('>Serv3</div>');
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
    // O e-mail inteiro é branco agora — não há mais um trecho escuro para recortar
    // fora, então a régua vale para o arquivo todo.
    const cores = [...new Set(html.match(/color:#[0-9a-f]{6}/g) || [])]
      .map(t => t.replace('color:', ''))
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
    const rodape = '>Serv3</div>';
    expect(previa).toContain(rodape);
    expect(enviado).toContain(rodape);
    expect(contarOcorrencias(previa, 'border:1px solid')).toBe(0);
  });

  it('substitui as variáveis do modelo', () => {
    const previa = buildEmailPreviewHtml(modelo);
    expect(previa).toContain('OS OS-0051 aguardando aprovação');
    expect(previa).toContain('Olá Solicitante');
    expect(previa).not.toContain('{{');
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
    expect(html).toContain('>Serv3</div>');
    expect(contarOcorrencias(html, 'border:1px solid')).toBe(0);
  });

  it('o disparo de teste se identifica na tarja — a única caixa colorida que sobrou', () => {
    const comTeste = buildNoticeEmailTemplate({
      title: 'Começou a chover',
      alerta: { titulo: 'Teste — não é chuva de verdade', detalhe: 'Disparo simulado.' },
    }).html;
    const semTeste = buildNoticeEmailTemplate({ title: 'Começou a chover' }).html;

    // A faixa amarela é o sinal, e ela só existe no disparo de teste — o e-mail de
    // chuva de verdade não tem cor nenhuma além do texto.
    expect(comTeste).toContain('Teste — não é chuva de verdade');
    expect(comTeste).toContain('background:#fdf3d7');
    expect(semTeste).not.toContain('#fdf3d7');
  });
});

describe('`intro` é reserva do corpo, não um segundo parágrafo', () => {
  /*
   * A ARMADILHA QUE JÁ MORDEU. `renderBodyText(cleanedBody || intro)` usa `intro`
   * SÓ quando não há corpo. Quem lê a assinatura de `buildTicketEmailTemplate` vê
   * dois campos de texto e supõe que os dois saem — foi o que aconteceu com a
   * mensagem à Diretoria, que montava `"${sender} enviou uma atualização interna"`
   * num `intro` que nunca foi renderizado. O nome do autor sumia do e-mail.
   *
   * O teste não conserta a assinatura; ele garante que o próximo a supor isso veja
   * a regra escrita em vez de descobrir por um e-mail que saiu errado.
   */
  it('com corpo, o intro NÃO aparece — informação posta ali se perde', () => {
    const { html, text } = buildTicketEmailTemplate({
      ...PAGAMENTO,
      intro: 'Guilherme enviou uma atualização.',
      bodyText: 'A metalúrgica confirmou a visita.',
    });
    expect(html).toContain('A metalúrgica confirmou a visita.');
    expect(html).not.toContain('Guilherme enviou uma atualização.');
    expect(text).not.toContain('Guilherme enviou uma atualização.');
  });

  it('sem corpo, o intro assume', () => {
    const { html } = buildTicketEmailTemplate({
      ...PAGAMENTO,
      intro: 'Guilherme enviou uma atualização.',
      bodyText: '',
    });
    expect(html).toContain('Guilherme enviou uma atualização.');
  });

  it('o título atravessa: é por onde o autor chega ao leitor', () => {
    const { html } = buildTicketEmailTemplate({
      ...PAGAMENTO,
      title: 'Guilherme enviou uma nova mensagem',
      bodyText: 'A metalúrgica confirmou a visita.',
    });
    expect(html).toContain('Guilherme enviou uma nova mensagem');
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
    expect(html).toContain('<strong style="color:#0b5cad;">@Ana Paula</strong>');
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
    expect(html).toContain('>Serv3</div>');
    expect(contarOcorrencias(html, 'border:1px solid')).toBe(0);
    expect(text).toContain('https://serv3.vercel.app/?senha=xyz');
  });
});
