import { describe, expect, it } from 'vitest';
import { renderTemplateString } from '../../api/_lib/emailTemplates.js';

/**
 * A SUBSTITUIÇÃO DE `{{variavel}}` — agora uma só, para prévia e envio.
 *
 * Ela existia em dois lugares: `api/mail.js`, que monta o e-mail que sai, e
 * `emailTemplatePreview.ts`, que monta a prévia das Configurações. Estavam
 * idênticas — e é justamente por isso que valia unificar, porque a próxima correção
 * entraria numa e não na outra.
 *
 * O custo dessa divergência já foi pago uma vez neste projeto, e está escrito no
 * topo do módulo da prévia: "quem ajustava um modelo aqui aprovava uma coisa e o
 * destinatário recebia outra". Aquilo era o DESENHO em dois lugares; isto era a
 * mesma armadilha um degrau abaixo.
 *
 * Quem edita modelo é a gestora, na tela de Configurações. Um erro aqui não quebra
 * nada visível: manda um e-mail torto para uma sede.
 */

const dados = {
  requester: { name: 'Josy Coelho', email: 'josy@px.com.br' },
  ticket: { id: 'OS-0332', subject: 'Portão da recepção', sede: 'ALD' },
};

describe('o que o modelo substitui', () => {
  it('troca a variável pelo valor, inclusive em caminho aninhado', () => {
    expect(renderTemplateString('Olá {{requester.name}}, sobre a {{ticket.id}}.', dados)).toBe(
      'Olá Josy Coelho, sobre a OS-0332.'
    );
  });

  it('tolera espaço dentro das chaves', () => {
    // Quem digita o modelo escreve `{{ ticket.id }}` metade das vezes.
    expect(renderTemplateString('{{ ticket.id }} e {{ticket.sede}}', dados)).toBe('OS-0332 e ALD');
  });

  it('a mesma variável duas vezes é trocada nas duas', () => {
    expect(renderTemplateString('{{ticket.id}} / {{ticket.id}}', dados)).toBe('OS-0332 / OS-0332');
  });
});

describe('o que ele faz quando o dado não existe — e é aqui que ele protege', () => {
  it('variável inexistente vira VAZIO, não a própria chave', () => {
    // Deixar a chave aparecer mandaria "Prezado {{requester.nome}}" para a sede:
    // pior que um espaço, porque denuncia o modelo em vez de omitir o dado.
    expect(renderTemplateString('Prezado {{requester.nome}},', dados)).toBe('Prezado ,');
    expect(renderTemplateString('{{nao.existe.nada}}', dados)).toBe('');
  });

  it('null e undefined também viram vazio', () => {
    const comBuraco = { ticket: { id: null, subject: undefined } };
    expect(renderTemplateString('[{{ticket.id}}][{{ticket.subject}}]', comBuraco)).toBe('[][]');
  });

  it('atravessar um valor que não é objeto não explode', () => {
    // `ticket` é string aqui: `ticket.id` não existe, e pedir isso não pode derrubar
    // o envio de um e-mail.
    expect(() => renderTemplateString('{{ticket.id}}', { ticket: 'texto' })).not.toThrow();
    expect(renderTemplateString('{{ticket.id}}', { ticket: 'texto' })).toBe('');
  });

  it('zero e falso NÃO são tratados como ausência', () => {
    // `== null` e não `!value`: um contador em zero é informação.
    expect(renderTemplateString('{{n.dias}} dias', { n: { dias: 0 } })).toBe('0 dias');
    expect(renderTemplateString('{{a.b}}', { a: { b: false } })).toBe('false');
  });

  it('modelo vazio ou nulo devolve string, não quebra', () => {
    expect(renderTemplateString('', dados)).toBe('');
    expect(renderTemplateString(null as unknown as string, dados)).toBe('');
  });
});

describe('o que ele deliberadamente NÃO faz', () => {
  it('não escapa HTML — quem escapa é quem monta a página', () => {
    /**
     * Escapar aqui escaparia DUAS vezes: `buildTicketEmailTemplate` aplica `esc()`
     * em tudo que entra no corpo, e o destinatário receberia `&amp;lt;` na tela.
     *
     * Conferido no caminho real: o assunto da OS vem de e-mail recebido — texto de
     * fora — e chega ao HTML já escapado pelo montador. Este teste existe para
     * ninguém "consertar" a falta de escape aqui sem olhar o outro lado.
     */
    expect(renderTemplateString('{{t.s}}', { t: { s: '<b>oi</b>' } })).toBe('<b>oi</b>');
  });

  it('não entende chave com traço ou espaço — só letra, número, ponto e sublinhado', () => {
    const cru = '{{ticket-id}} {{ticket id}}';
    expect(renderTemplateString(cru, dados)).toBe(cru);
  });
});
