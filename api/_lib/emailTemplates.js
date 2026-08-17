// Regras visuais do e-mail, num lugar só. Antes havia DOIS desenhos: este e o de
// `src/utils/emailTemplatePreview.ts`. Eram diferentes — quem editava um modelo nas
// Configurações via uma prévia que ninguém recebia. Agora a prévia chama daqui.
//
// A régua do desenho, depois de medir o que saía: nada de caixa dentro de caixa.
// O e-mail anterior empilhava quatro níveis (cartão → bloco "Mensagem" → cartão de
// métrica → linha com borda), e três dos textos ficavam abaixo de 4,5:1 — os
// rotulinhos de 10px em maiúscula espaçada davam 3,85. Aqui: uma moldura só, filete
// para separar, rótulo legível. Peso vem do conteúdo, não da borda.

const FONTE_TITULO = "Georgia,'Times New Roman',serif";
// Dado (valor, rótulo, número) vai em sans: o Georgia usa algarismos de altura
// variável, e "R$ 12.480,00" saía cambaleando numa tabela de dinheiro.
const FONTE_DADO = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const COR = {
  fundo: '#efe8de',
  papel: '#ffffff',
  cabecalho: '#1f1a15',
  cabecalhoTexto: '#f8f2e9',
  texto: '#2d241d',
  prosa: '#4a4038',
  rotulo: '#5f5347', // 7,46:1 no branco — o antigo #8a7a67 dava 3,85
  discreto: '#6b5f52',
  filete: '#e7ded1',
  moldura: '#ddd2c0',
  link: '#7a4f18',
};

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
  if (token.includes('encerrada')) return { eyebrow: 'Conclusão', label: 'OS encerrada' };
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
          .map(item => `<li style="margin:0 0 6px;">${styleMentions(linkifyEscaped(esc(item)))}</li>`)
          .join('');
        return `<ul style="margin:0 0 14px 20px;padding:0;color:${COR.prosa};font-family:${FONTE_TITULO};font-size:15px;line-height:1.6;">${items}</ul>`;
      }

      // Quebra simples vira quebra de verdade. O envio juntava as linhas com espaço,
      // e o aviso de nova OS — que manda assunto, solicitante, sede e região, uma por
      // linha — chegava como um parágrafo corrido: "Assunto: ... Sede: ALD Região: ...".
      const corpo = lines.map(line => styleMentions(linkifyEscaped(esc(line)))).join('<br/>');
      return `<p style="margin:0 0 14px;color:${COR.prosa};font-family:${FONTE_TITULO};font-size:15px;line-height:1.65;">${corpo}</p>`;
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

// Rótulo à esquerda, valor à direita, filete entre as linhas. Substitui os cartões
// com borda e fundo próprios: com quatro valores em cartão, ninguém percebia que
// bruto menos imposto dava o valor a pagar. Em linha, a conta fica à vista.
//
// A ÚLTIMA linha sai em destaque — é onde quem monta a mensagem põe a conclusão
// (o "Valor a pagar" vem depois de bruto e imposto).
function renderValores(metricRows) {
  const items = limparPares(metricRows);
  if (items.length === 0) return '';

  const linhas = items
    .map((item, indice) => {
      const ultima = indice === items.length - 1;
      const destaque = ultima && items.length > 1;
      const borda = indice === 0 ? '' : `border-top:1px solid ${COR.filete};`;
      return `
        <tr>
          <td style="${borda}padding:9px 0;font-family:${FONTE_DADO};font-size:13px;color:${COR.rotulo};">${esc(item.label)}</td>
          <td align="right" style="${borda}padding:9px 0;font-family:${FONTE_DADO};font-size:${destaque ? '17px' : '15px'};${destaque ? 'font-weight:600;' : ''}color:${COR.texto};font-variant-numeric:tabular-nums;white-space:nowrap;">${esc(item.value)}</td>
        </tr>`;
    })
    .join('');

  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border-collapse:collapse;">${linhas}</table>`;
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
          (row, indice) => `
            <tr>
              <td width="38%" valign="top" style="${indice === 0 ? '' : `border-top:1px solid ${COR.filete};`}padding:8px 12px 8px 0;font-family:${FONTE_DADO};font-size:13px;color:${COR.rotulo};">${esc(row.label)}</td>
              <td valign="top" style="${indice === 0 ? '' : `border-top:1px solid ${COR.filete};`}padding:8px 0;font-family:${FONTE_DADO};font-size:14px;line-height:1.5;color:${COR.texto};">${esc(row.value)}</td>
            </tr>`,
        )
        .join('');

      return `
        <div style="margin:0 0 22px;">
          <div style="margin:0 0 6px;font-family:${FONTE_DADO};font-size:13px;font-weight:600;color:${COR.texto};">${esc(card.title)}</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${linhas}</table>
        </div>`;
    })
    .join('');
}

function renderBotao(ctaUrl, ctaLabel) {
  if (!ctaUrl) return '';
  // O "Link completo: https://..." que vinha aqui repetia o mesmo endereço do botão,
  // esticava o e-mail e tinha cara de phishing. Em cliente que não pinta o botão, o
  // href continua clicável; em cliente sem HTML, a URL já vai na versão em texto.
  return `
    <div style="margin:26px 0 0;">
      <a href="${esc(ctaUrl)}" style="display:inline-block;background:${COR.cabecalho};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-family:${FONTE_DADO};font-size:14px;font-weight:600;">${esc(ctaLabel)}</a>
    </div>`;
}

// Moldura comum: cabeçalho escuro curto, conteúdo no papel, rodapé de uma linha.
function renderMoldura({ eyebrow, title, subtitle, conteudo }) {
  return `
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px 12px;background:${COR.fundo};color:${COR.texto};">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:${COR.fundo};">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${COR.papel};border:1px solid ${COR.moldura};">
            <tr>
              <td style="padding:20px 28px;background:${COR.cabecalho};color:${COR.cabecalhoTexto};">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-family:${FONTE_DADO};font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.7;">Serv3</td>
                    <td align="right" style="font-family:${FONTE_DADO};font-size:11px;letter-spacing:1px;text-transform:uppercase;opacity:0.7;">${esc(eyebrow)}</td>
                  </tr>
                </table>
                <div style="margin-top:12px;font-family:${FONTE_TITULO};font-size:23px;line-height:1.3;">${esc(title)}</div>
                ${subtitle ? `<div style="margin-top:7px;font-family:${FONTE_DADO};font-size:13px;opacity:0.78;">${esc(subtitle)}</div>` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding:26px 28px 30px;">${conteudo}</td>
            </tr>
            <tr>
              <td style="padding:14px 28px;border-top:1px solid ${COR.filete};font-family:${FONTE_DADO};font-size:12px;color:${COR.discreto};">
                Comunicado automático do Serv3.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
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
      `<p style="margin:0;color:${COR.prosa};font-family:${FONTE_TITULO};font-size:15px;line-height:1.65;">Atualização registrada na OS.</p>`,
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

export function buildAccessEmailTemplate({
  title = '',
  intro = '',
  recipientName = '',
  ctaUrl = '',
  ctaLabel = 'Criar senha',
}) {
  const tituloFinal = title || 'Defina sua senha de acesso';
  const introFinal = intro || 'Use o botão abaixo para definir sua senha de acesso ao sistema.';
  const saudacao = recipientName ? `Olá ${esc(recipientName)},` : 'Olá,';
  const prosa = `font-family:${FONTE_TITULO};font-size:15px;line-height:1.65;color:${COR.prosa};`;

  const conteudo = `
    <p style="margin:0 0 14px;${prosa}">${saudacao}</p>
    <p style="margin:0 0 14px;${prosa}">${esc(introFinal)}</p>
    <p style="margin:0;font-family:${FONTE_DADO};font-size:13px;line-height:1.6;color:${COR.rotulo};">Por segurança, este link expira automaticamente após um período.</p>
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
