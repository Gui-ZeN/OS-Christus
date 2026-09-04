// Regras visuais do e-mail, num lugar só. Antes havia DOIS desenhos: este e o de
// `src/utils/emailTemplatePreview.ts`. Eram diferentes — quem editava um modelo nas
// Configurações via uma prévia que ninguém recebia. Agora a prévia chama daqui.
//
// ⚠️ O DESENHO ENCOLHEU (03/09/2026), a pedido de quem recebe. O anterior tinha
// tarja escura com "SERV3" em maiúscula espaçada, cartão de 600px com borda sobre
// fundo bege, título serifado de 23px e botão preto — moldura pesada para, na maior
// parte dos e-mails, três linhas de recado. Agora: sem cartão, sem fundo, sem tarja,
// uma família de fonte só, link no lugar do botão e a assinatura reduzida a "Serv3".
//
// O que NÃO encolheu, de propósito: as tabelas de valores e de detalhes (são o dado,
// não o enfeite), a tarja do disparo de teste (existe justamente para ser notada) e
// a régua de contraste — todo texto continua acima de 4,5:1 no branco.

const FONTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const COR = {
  texto: '#1f2328',
  prosa: '#32383f',
  rotulo: '#5a626b', // 6,19:1 no branco
  discreto: '#5a626b',
  filete: '#e6e8eb',
  link: '#0b5cad', // 6,31:1 no branco
};

/**
 * A SUBSTITUIÇÃO DE `{{variavel}}` NO MODELO — uma só, para os dois lados.
 *
 * Ela existia duas vezes: uma em `api/mail.js`, que monta o e-mail que sai, e outra
 * em `src/utils/emailTemplatePreview.ts`, que monta a prévia das Configurações.
 * Idênticas quando conferi, e é justamente por isso que valia unificar: enquanto
 * forem duas, a próxima correção entra numa e não na outra.
 *
 * O custo da divergência já foi pago uma vez e está escrito no topo da prévia —
 * "quem ajustava um modelo aqui aprovava uma coisa e o destinatário recebia outra".
 * Aquilo era o DESENHO estando em dois lugares; isto aqui é a mesma armadilha um
 * degrau abaixo.
 *
 * ⚠️ VARIÁVEL QUE NÃO EXISTE VIRA VAZIO, e não `{{ela mesma}}`. Deixar a chave
 * aparecer mandaria "Prezado {{requester.name}}" para a sede — pior que um espaço,
 * porque denuncia o modelo em vez de omitir o dado.
 *
 * Não escapa HTML de propósito: quem escapa é `buildTicketEmailTemplate`, no
 * momento de montar a página. Escapar aqui escaparia duas vezes e o e-mail sairia
 * com `&amp;lt;`.
 */
function readPathValue(source, path) {
  return String(path || '')
    .split('.')
    .filter(Boolean)
    .reduce((current, key) => (current && typeof current === 'object' ? current[key] : undefined), source);
}

export function renderTemplateString(template, variables) {
  return String(template || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const value = readPathValue(variables, path);
    return value == null ? '' : String(value);
  });
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Converte URLs http(s) (já escapadas por esc) em links clicáveis. Usado para
// que as fotos inseridas no corpo virem links de fato em qualquer cliente.
function linkifyEscaped(escapedText) {
  return String(escapedText || '').replace(
    /https?:\/\/[^\s<]+/g,
    url => `<a href="${url.replace(/&amp;/g, '&')}" style="color:${COR.link};word-break:break-all;">${url}</a>`
  );
}

// Destaca @menções (@Nome com palavras capitalizadas) como o Gmail marca pessoas.
function styleMentions(text) {
  return String(text || '').replace(
    /@\p{Lu}[\p{L}.'-]*(?:\s\p{Lu}[\p{L}.'-]*){0,2}/gu,
    match => `<strong style="color:${COR.link};">${match}</strong>`
  );
}

function normalizeToken(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

// O `accent` que existia aqui nunca chegou a pintar nada neste template — eram 13
// cores calculadas e jogadas fora. A prévia usava a dela. Ficou só o que aparece.
export function getStageMeta(trigger, status) {
  const token = normalizeToken(trigger || status);

  if (token.includes('nova-os') || token.includes('nova os')) {
    return { eyebrow: 'Recebimento', label: 'Nova solicitação' };
  }
  if (token.includes('triagem')) return { eyebrow: 'Andamento', label: 'Triagem em andamento' };
  if (token.includes('parecer')) return { eyebrow: 'Andamento', label: 'Parecer técnico' };
  if (token.includes('orcamento') || token.includes('cotacao')) {
    return { eyebrow: 'Comercial', label: 'Orçamentação' };
  }
  if (token.includes('diretoria-solucao') || token.includes('diretoria solucao')) {
    return { eyebrow: 'Diretoria', label: 'Avaliação da solução' };
  }
  if (token.includes('diretoria-aprovacao') || token.includes('diretoria aprovacao')) {
    return { eyebrow: 'Diretoria', label: 'Aprovação da diretoria' };
  }
  if (token.includes('aprovacao')) return { eyebrow: 'Governança', label: 'Em aprovação' };
  if (token.includes('preliminar')) return { eyebrow: 'Planejamento', label: 'Ações preliminares' };
  if (token.includes('execucao') || token.includes('andamento')) {
    return { eyebrow: 'Operação', label: 'Execução iniciada' };
  }
  if (token.includes('validacao')) return { eyebrow: 'Validação', label: 'Confirmação do solicitante' };
  if (token.includes('financeiro-pagamento') || token.includes('financeiro pagamento')) {
    return { eyebrow: 'Financeiro', label: 'Pagamento pendente' };
  }
  if (token.includes('pagamento')) return { eyebrow: 'Financeiro', label: 'Aguardando pagamento' };
  if (token.includes('encerrada') || token.includes('concluida')) {
    // "Encerrada" virou "Concluída": o banco ainda grava o antigo, a pessoa lê o novo.
    return { eyebrow: 'Conclusão', label: 'OS concluída' };
  }
  if (token.includes('cancelada')) return { eyebrow: 'Atenção', label: 'OS cancelada' };
  if (token.includes('mensagem')) return { eyebrow: 'Comunicação', label: 'Nova mensagem registrada' };

  return { eyebrow: 'Atualização', label: 'Atualização da OS' };
}

function stripSignature(value) {
  const text = String(value || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';

  const markers = [
    /^\s*--\s*$/m,
    /^\s*__+\s*$/m,
    /^\s*Atenciosamente[,!.\s]*$/im,
    /^\s*Cordialmente[,!.\s]*$/im,
    /^\s*Abs[,!.\s]*$/im,
    /^\s*Assinatura[:\s]*$/im,
    /^\s*\[image:.*\]\s*$/im,
  ];

  let next = text;
  for (const marker of markers) {
    const match = marker.exec(next);
    if (match?.index != null && match.index > 0) {
      next = next.slice(0, match.index).trim();
      break;
    }
  }

  return next
    .split('\n')
    .filter(line => {
      const normalized = line.trim();
      if (!normalized) return true;
      if (/^\[image:.*\]$/i.test(normalized)) return false;
      if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(normalized)) return false;
      if (/^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/.test(normalized.replace(/\s+/g, ' '))) return false;
      if (/^(R\.|Av\.|Rua|Avenida)\s/i.test(normalized)) return false;
      return true;
    })
    .join('\n')
    .trim();
}

function renderBodyText(text) {
  const blocks = String(text || '')
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean);

  return blocks
    .map(block => {
      const lines = block
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
      const isList = lines.length > 1 && lines.every(line => line.startsWith('- ') || line.startsWith('• '));

      if (isList) {
        const items = lines
          .map(line => line.replace(/^[-•]\s*/, '').trim())
          .filter(Boolean)
          .map(item => `<li style="margin:0 0 5px;">${styleMentions(linkifyEscaped(esc(item)))}</li>`)
          .join('');
        return `<ul style="margin:0 0 12px 20px;padding:0;color:${COR.prosa};font-size:15px;line-height:1.6;">${items}</ul>`;
      }

      // Quebra simples vira quebra de verdade. O envio juntava as linhas com espaço,
      // e o aviso de nova OS — que manda assunto, solicitante, sede e região, uma por
      // linha — chegava como um parágrafo corrido: "Assunto: ... Sede: ALD Região: ...".
      const corpo = lines.map(line => styleMentions(linkifyEscaped(esc(line)))).join('<br/>');
      return `<p style="margin:0 0 12px;color:${COR.prosa};font-size:15px;line-height:1.6;">${corpo}</p>`;
    })
    .join('');
}

function limparPares(lista) {
  return Array.isArray(lista)
    ? lista
        .map(item => ({
          label: String(item?.label || '').trim(),
          value: String(item?.value || '').trim(),
        }))
        .filter(item => item.label && item.value)
    : [];
}

// Rótulo à esquerda, valor à direita. Substitui os cartões com borda e fundo
// próprios: com quatro valores em cartão, ninguém percebia que bruto menos imposto
// dava o valor a pagar. Em linha, a conta fica à vista.
//
// O filete entre as linhas saiu junto com o resto da moldura: com o espaçamento
// dando o mesmo recado, ele era só mais um traço.
//
// A ÚLTIMA linha sai em destaque — é onde quem monta a mensagem põe a conclusão
// (o "Valor a pagar" vem depois de bruto e imposto).
function renderValores(metricRows) {
  const items = limparPares(metricRows);
  if (items.length === 0) return '';

  const linhas = items
    .map((item, indice) => {
      const destaque = indice === items.length - 1 && items.length > 1;
      return `
        <tr>
          <td style="padding:4px 0;font-size:14px;color:${COR.rotulo};">${esc(item.label)}</td>
          <td align="right" style="padding:4px 0;font-size:${destaque ? '16px' : '14px'};${destaque ? 'font-weight:600;' : ''}color:${COR.texto};font-variant-numeric:tabular-nums;white-space:nowrap;">${esc(item.value)}</td>
        </tr>`;
    })
    .join('');

  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-collapse:collapse;">${linhas}</table>`;
}

function renderDetalhes(detailCards) {
  const cards = Array.isArray(detailCards)
    ? detailCards
        .map(card => ({ title: String(card?.title || '').trim(), rows: limparPares(card?.rows) }))
        .filter(card => card.title && card.rows.length > 0)
    : [];

  if (cards.length === 0) return '';

  return cards
    .map(card => {
      const linhas = card.rows
        .map(
          row => `
            <tr>
              <td width="38%" valign="top" style="padding:4px 12px 4px 0;font-size:14px;color:${COR.rotulo};">${esc(row.label)}</td>
              <td valign="top" style="padding:4px 0;font-size:14px;line-height:1.5;color:${COR.texto};">${esc(row.value)}</td>
            </tr>`,
        )
        .join('');

      return `
        <div style="margin:0 0 18px;">
          <div style="margin:0 0 4px;font-size:13px;font-weight:600;color:${COR.texto};">${esc(card.title)}</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${linhas}</table>
        </div>`;
    })
    .join('');
}

// Link, não botão. O botão preto de 24px de respiro era o objeto mais pesado da
// página inteira, num e-mail que costuma ter três linhas de texto.
//
// O "Link completo: https://..." que vinha aqui repetia o mesmo endereço, esticava
// o e-mail e tinha cara de phishing. Em cliente sem HTML, a URL já vai no texto.
function renderBotao(ctaUrl, ctaLabel) {
  if (!ctaUrl) return '';
  return `
    <p style="margin:18px 0 0;font-size:14px;">
      <a href="${esc(ctaUrl)}" style="color:${COR.link};">${esc(ctaLabel)}</a>
    </p>`;
}

// A ÚNICA caixa colorida do sistema, e ela fica. Existe porque um e-mail de teste
// que chega numa caixa real sem se identificar faz alguém sair correndo atrás de
// goteira que não existe — num desenho quieto, ela é o único lugar onde o peso é o
// recado.
//
// A barra lateral de 4px saiu com o resto da moldura: num e-mail que agora é uma
// folha branca, a faixa amarela inteira já é o que salta. A barra era peso repetido.
function renderAlerta(alerta) {
  if (!alerta) return '';
  return `
    <div style="margin:0 0 18px;padding:12px 14px;background:#fdf3d7;font-size:13px;line-height:1.5;color:#5b4310;">
      <strong>${esc(alerta.titulo)}</strong>${alerta.detalhe ? `<br/>${esc(alerta.detalhe)}` : ''}
    </div>`;
}

// Moldura comum: rótulo, título, conteúdo, filete e assinatura. Sem cartão, sem
// fundo e sem tarja — a largura máxima é o que resta de "moldura", e existe só para
// a linha não atravessar um monitor inteiro.
function renderMoldura({ eyebrow, title, subtitle, conteudo }) {
  const rotulo = String(eyebrow || '').trim();
  return `
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:20px 16px;background:#ffffff;color:${COR.texto};font-family:${FONTE};">
    <div style="max-width:560px;">
      ${rotulo ? `<div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:${COR.rotulo};">${esc(rotulo)}</div>` : ''}
      <div style="margin:${rotulo ? '6px' : '0'} 0 0;font-size:18px;font-weight:600;line-height:1.35;">${esc(title)}</div>
      ${subtitle ? `<div style="margin:3px 0 0;font-size:13px;color:${COR.rotulo};">${esc(subtitle)}</div>` : ''}
      <div style="margin:18px 0 0;">${conteudo}</div>
      <div style="margin:24px 0 0;padding:10px 0 0;border-top:1px solid ${COR.filete};font-size:12px;color:${COR.discreto};">Serv3</div>
    </div>
  </body>
</html>`;
}

// Os padrões não são enfeite: sem eles o TypeScript trata todo campo como
// obrigatório quando a prévia (que é .ts) importa este módulo .js.
export function buildTicketEmailTemplate({
  trigger = '',
  title = '',
  intro = '',
  ticketId = '',
  status = '',
  ctaUrl = '',
  ctaLabel = 'Acompanhar OS',
  bodyText = '',
  metricRows = [],
  detailCards = [],
}) {
  const stage = getStageMeta(trigger, status);
  const cleanedBody = stripSignature(bodyText);
  const messageHtml = renderBodyText(cleanedBody || intro || '');

  // A OS e o estado dela numa linha só, embaixo do título. Antes a OS aparecia
  // duas vezes — no título e num quadro à direita —, e o quadro espremia o título
  // a ponto de quebrá-lo em duas linhas.
  const subtitle = [ticketId, status].map(v => String(v || '').trim()).filter(Boolean).join(' · ');

  const conteudo = [
    renderValores(metricRows),
    renderDetalhes(detailCards),
    messageHtml ||
      `<p style="margin:0;color:${COR.prosa};font-size:15px;line-height:1.6;">Atualização registrada na OS.</p>`,
    renderBotao(ctaUrl, ctaLabel),
  ]
    .filter(Boolean)
    .join('\n');

  const html = renderMoldura({ eyebrow: stage.eyebrow, title: title || stage.label, subtitle, conteudo });

  const text = [
    title || stage.label,
    subtitle,
    '',
    ...limparPares(metricRows).map(item => `${item.label}: ${item.value}`),
    ...(limparPares(metricRows).length > 0 ? [''] : []),
    ...(Array.isArray(detailCards)
      ? detailCards.flatMap(card => {
          const tituloCard = String(card?.title || '').trim();
          const rows = limparPares(card?.rows).map(row => `${row.label}: ${row.value}`);
          return tituloCard && rows.length > 0 ? [tituloCard, ...rows, ''] : [];
        })
      : []),
    cleanedBody || intro || '',
    '',
    ctaUrl ? `${ctaLabel}: ${ctaUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return { html, text };
}

/**
 * Lista de itens com ação própria — a agenda do dia da sede.
 *
 * Cada item tem os seus botões porque a resposta é por visita: numa sede com dois
 * serviços marcados, um fornecedor pode aparecer e o outro não. Um botão só no fim
 * do e-mail obrigaria a pessoa a responder pelos dois de uma vez.
 */
function renderItens(itens) {
  const lista = Array.isArray(itens) ? itens.filter(item => item && item.titulo) : [];
  if (lista.length === 0) return '';

  // O respiro no fim é do BLOCO, não de cada item: sem ele, o link de ação do último
  // item encosta na tabela seguinte — foi o que apareceu na prévia do aviso de chuva.
  const itensHtml = lista
    .map(
      (item, indice) => `
        <div style="${indice === 0 ? '' : `margin-top:16px;padding-top:16px;border-top:1px solid ${COR.filete};`}">
          <div style="font-size:13px;color:${COR.rotulo};">${esc(item.quando || '')}</div>
          <div style="margin-top:2px;font-size:15px;font-weight:600;color:${COR.texto};">${esc(item.titulo)}</div>
          ${item.detalhe ? `<div style="margin-top:2px;font-size:13px;color:${COR.rotulo};">${esc(item.detalhe)}</div>` : ''}
          ${
            Array.isArray(item.acoes) && item.acoes.length > 0
              ? `<div style="margin-top:8px;font-size:14px;">${item.acoes
                  .map(acao => `<a href="${esc(acao.url)}" style="color:${COR.link};">${esc(acao.rotulo)}</a>`)
                  .join(`<span style="color:${COR.rotulo};"> &middot; </span>`)}</div>`
              : ''
          }
        </div>`
    )
    .join('');

  return `<div style="margin:0 0 18px;">${itensHtml}</div>`;
}

/**
 * Aviso que não é de OS — hoje, a chuva. Ele saía em TEXTO PURO: chegava com a
 * fonte de máquina de escrever do cliente, sem hierarquia, e as duas fontes de
 * medição empilhadas em linhas indentadas com espaço. Mesma moldura dos outros.
 */
export function buildNoticeEmailTemplate({
  eyebrow = 'Aviso',
  title = '',
  subtitle = '',
  alerta = null,
  bodyText = '',
  itens = [],
  detailCards = [],
  rodape = '',
  ctaUrl = '',
  ctaLabel = 'Abrir o Serv3',
}) {
  const conteudo = [
    renderAlerta(alerta),
    renderBodyText(bodyText),
    renderItens(itens),
    renderDetalhes(detailCards),
    rodape ? `<p style="margin:0;font-size:12px;line-height:1.6;color:${COR.discreto};">${esc(rodape)}</p>` : '',
    renderBotao(ctaUrl, ctaLabel),
  ]
    .filter(Boolean)
    .join('\n');

  return { html: renderMoldura({ eyebrow, title, subtitle, conteudo }) };
}

export function buildAccessEmailTemplate({
  title = '',
  intro = '',
  recipientName = '',
  ctaUrl = '',
  ctaLabel = 'Criar senha',
}) {
  const tituloFinal = title || 'Defina sua senha de acesso';
  const introFinal = intro || 'Use o link abaixo para definir sua senha de acesso ao sistema.';
  const saudacao = recipientName ? `Olá ${esc(recipientName)},` : 'Olá,';
  const prosa = `font-size:15px;line-height:1.6;color:${COR.prosa};`;

  const conteudo = `
    <p style="margin:0 0 12px;${prosa}">${saudacao}</p>
    <p style="margin:0 0 12px;${prosa}">${esc(introFinal)}</p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:${COR.rotulo};">Por segurança, este link expira automaticamente após um período.</p>
    ${renderBotao(ctaUrl, ctaLabel)}`;

  const html = renderMoldura({ eyebrow: 'Acesso', title: tituloFinal, subtitle: '', conteudo });

  const text = [
    tituloFinal,
    '',
    recipientName ? `Olá ${recipientName},` : 'Olá,',
    introFinal,
    '',
    ctaUrl ? `Link para criar senha: ${ctaUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return { html, text };
}
