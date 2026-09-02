import { afterEach, describe, expect, it, vi } from 'vitest';
import { enviarParaDiscord } from '../../api/_lib/discord.js';
import { enviarParaTelegram } from '../../api/_lib/telegram.js';

/**
 * DISCORD E TELEGRAM — só a forma da chamada HTTP, sem rede de verdade.
 *
 * Não há como testar contra o serviço real sem um webhook/bot de verdade — o que
 * se prova aqui é o contrato: qual URL, qual corpo, e principalmente o que acontece
 * quando o canal RECUSA. Um envio que falha em silêncio (sem lançar) seria pior que
 * o e-mail nunca chegar: ninguém saberia que faltou.
 */
describe('enviarParaDiscord', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('manda o texto como `content`, no webhook exato', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await enviarParaDiscord('https://discord.com/api/webhooks/1/abc', 'Começou a chover.');

    expect(fetchMock).toHaveBeenCalledWith('https://discord.com/api/webhooks/1/abc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Começou a chover.' }),
    });
  });

  it('webhook recusado (404, URL revogada) LANÇA — não falha em silêncio', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => 'Unknown Webhook' }));
    await expect(enviarParaDiscord('https://discord.com/api/webhooks/morto', 'x')).rejects.toThrow(/404/);
  });
});

describe('enviarParaTelegram', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('chama a Bot API com o token na URL e o chat_id no corpo', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await enviarParaTelegram('12345:AAAtoken', '-100987', 'Começou a chover.');

    expect(fetchMock).toHaveBeenCalledWith('https://api.telegram.org/bot12345:AAAtoken/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: '-100987', text: 'Começou a chover.' }),
    });
  });

  it('sem parse_mode — texto puro, não dá para o Markdown do Telegram rejeitar pontuação', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await enviarParaTelegram('t', 'c', 'x');
    const corpo = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(corpo.parse_mode).toBeUndefined();
  });

  it('chat_id errado ("chat not found") LANÇA — não falha em silêncio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => '{"description":"Bad Request: chat not found"}' })
    );
    await expect(enviarParaTelegram('t', 'chat-errado', 'x')).rejects.toThrow(/chat not found/);
  });
});
