import { describe, expect, it } from 'vitest';
import { detectBounce } from '../../api/_lib/bounce.js';

/**
 * Formatos reais de devolução do Gmail — os mesmos que produziram 261 bounces em
 * produção sem UM destinatário extraído.
 */
const DAEMON = 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>';

const BLOQUEADO_HTML = {
  from: DAEMON,
  subject: 'Message blocked',
  html: `<div dir="ltr"><b>** Message blocked **</b><br><br>Your message to <a href="mailto:oprtacional11@px.com.br">oprtacional11@px.com.br</a> has been blocked. See technical details below.<br><br>The response was:<br>Message rejected. For more information, go to https://support.google.com/mail/answer/69585</div>`,
};

const NAO_ENCONTRADO_HTML = {
  from: DAEMON,
  subject: 'Address not found',
  html: `<div><b>** Address not found **</b><p>Your message wasn't delivered to <a href="mailto:oprtacional11@px.com.br">oprtacional11@px.com.br</a> because the address couldn't be found.</p><p>550 5.1.1 The email account that you tried to reach does not exist.</p></div>`,
};

const DSN_TEXTO = {
  from: DAEMON,
  subject: 'Delivery Status Notification (Failure)',
  text: [
    'Delivery to the following recipient failed permanently:',
    '',
    'Final-Recipient: rfc822; ana@px.com.br',
    'Final-Recipient: rfc822; bruno@px.com.br',
    'Diagnostic-Code: smtp; 550 5.7.1 Message rejected by policy',
  ].join('\n'),
};

const PORTUGUES = {
  from: DAEMON,
  subject: 'Mensagem não foi entregue',
  html: `<div>Sua mensagem para <a href="mailto:thais@px.com.br">thais@px.com.br</a> foi bloqueada.<br>Message rejected. For more information, go to https://support.google.com/mail/answer/69585</div>`,
};

describe('detectBounce — quem não recebeu', () => {
  it('🐛 NDR do Gmail em HTML: o endereço está dentro de um <a>, e era isso que se perdia', () => {
    const r = detectBounce(BLOQUEADO_HTML);
    expect(r?.recipients).toEqual(['oprtacional11@px.com.br']);
    expect(r?.reason).toContain('Message rejected');
  });

  it('"Address not found" — a conta que não existe', () => {
    expect(detectBounce(NAO_ENCONTRADO_HTML)?.recipients).toEqual(['oprtacional11@px.com.br']);
  });

  it('DSN lista VÁRIOS destinatários — avisar só o primeiro seria mentira parcial', () => {
    expect(detectBounce(DSN_TEXTO)?.recipients).toEqual(['ana@px.com.br', 'bruno@px.com.br']);
  });

  it('mesma coisa em português', () => {
    expect(detectBounce(PORTUGUES)?.recipients).toEqual(['thais@px.com.br']);
  });
});

describe('detectBounce — o que NÃO é bounce', () => {
  it('mensagem normal de gente passa direto', () => {
    expect(
      detectBounce({ from: 'Ana <ana@px.com.br>', subject: 'Re: [ALD] Goteira', text: 'Bom dia, resolvido.' })
    ).toBeNull();
  });

  it('🩹 From sem endereço parseável não derruba o processamento', () => {
    // O remetente nulo (`<>`) é o padrão de um bounce: `firstEmail` devolve null e o
    // `.toLowerCase()` direto lançava TypeError, matando a mensagem inteira.
    expect(() => detectBounce({ from: '<>', subject: 'Delivery Status Notification (Failure)' })).not.toThrow();
    expect(() => detectBounce({})).not.toThrow();
    expect(detectBounce({})).toBeNull();
  });

  it('bounce sem endereço no corpo devolve lista vazia em vez de inventar', () => {
    const r = detectBounce({ from: DAEMON, subject: 'Undeliverable', text: 'A mensagem não pôde ser entregue.' });
    expect(r?.recipients).toEqual([]);
    expect(r?.reason).toBeTruthy();
  });
});
