import { describe, expect, it } from 'vitest';
import { dedupeQuotedChain, parseQuotedChain } from '../../api/_lib/quotedChain.js';

/**
 * O caso real: a OS-0345 nasceu de um e-mail cujo corpo tinha 24 caracteres
 * ("Bom dia, Serv 3 em cópia.") e trazia 18 mensagens citadas atrás dele.
 */
describe('corrente citada', () => {
  const corrente = [
    'Bom dia,',
    'Serv 3 em cópia.',
    '',
    'Em qua., 12 de ago. de 2026 às 09:34, Thiers Cezar <operacional07@px.com.br> escreveu:',
    'Bom dia Murilo,',
    'Apresentamos o orçamento já.',
    '',
    'Em sáb., 1 de ago. de 2026 às 05:54, Caroline Rocha <caroline.rocha@christus.com.br> escreveu:',
    'Rafael,',
    'E no refeitório? É o local mais problemático.',
  ].join('\n');

  it('separa cada mensagem citada com autor, e-mail e data', () => {
    const mensagens = parseQuotedChain(corrente);
    expect(mensagens).toHaveLength(2);
    expect(mensagens[0].sender).toBe('Caroline Rocha');
    expect(mensagens[0].email).toBe('caroline.rocha@christus.com.br');
    expect(mensagens[1].sender).toBe('Thiers Cezar');
  });

  it('devolve da mais antiga para a mais recente — é assim que a OS lê', () => {
    const mensagens = parseQuotedChain(corrente);
    expect(mensagens[0].time.getTime()).toBeLessThan(mensagens[1].time.getTime());
  });

  it('lê a data no fuso de Fortaleza, não em UTC', () => {
    const [primeira] = parseQuotedChain(corrente);
    // 01/08 05:54 em Fortaleza (-03:00) é 08:54Z.
    expect(primeira.time.toISOString()).toBe('2026-08-01T08:54:00.000Z');
  });

  it('dia da semana acentuado não engole a mensagem', () => {
    // "sáb." tem acento: com `\w+` no marcador, esta mensagem sumia e o corpo
    // dela era grudado na anterior.
    const mensagens = parseQuotedChain(corrente);
    expect(mensagens.map(m => m.sender)).toContain('Caroline Rocha');
    expect(mensagens[1].text).not.toContain('refeitório');
  });

  it('junta o cabeçalho que o Gmail quebrou em duas linhas', () => {
    const quebrado = [
      'Ciente.',
      'Em qua., 12 de ago. de 2026 às 09:34, Deladier Davi Pessoa Silva',
      '<pcm04@px.com.br> escreveu:',
      'Bom dia.',
    ].join('\n');
    const mensagens = parseQuotedChain(quebrado);
    expect(mensagens).toHaveLength(1);
    expect(mensagens[0].email).toBe('pcm04@px.com.br');
  });

  it('tira os sinais de citação do corpo', () => {
    const comSinais = [
      'Em qua., 12 de ago. de 2026 às 09:34, A B <a@x.com> escreveu:',
      '> Primeira linha',
      '>> Segunda linha',
    ].join('\n');
    expect(parseQuotedChain(comSinais)[0].text).toBe('Primeira linha\nSegunda linha');
  });

  it('aceita a data sem "às" — o Gmail alterna os dois formatos no mesmo e-mail', () => {
    const semAs = [
      'Ciente!',
      'Em ter., 11 de ago. de 2026, 10:02, Thiers Cezar <operacional07@px.com.br> escreveu:',
      'Bom dia.',
    ].join('\n');
    const mensagens = parseQuotedChain(semAs);
    expect(mensagens).toHaveLength(1);
    expect(mensagens[0].text).toBe('Bom dia.');
  });

  it('descarta o que não tem data — chutar data em auditoria é pior que não importar', () => {
    const semData = 'Em algum momento, Fulano <f@x.com> escreveu:\nOi.';
    expect(parseQuotedChain(semData)).toHaveLength(0);
  });

  it('não inventa mensagem onde não há citação', () => {
    expect(parseQuotedChain('Bom dia, segue a solicitação.')).toHaveLength(0);
  });

  it('colapsa a corrente repetida — a exportação do Gmail traz duas cópias', () => {
    const mensagens = parseQuotedChain(corrente);
    expect(dedupeQuotedChain([...mensagens, ...mensagens])).toHaveLength(2);
  });

  it('entre duas versões da mesma mensagem, fica com a que não engoliu a citação', () => {
    // O caso da OS-0210: em text/plain o cabeçalho aninhado casou e o corpo saiu
    // limpo; no HTML não casou e o corpo arrastou a citação inteira atrás.
    const quando = new Date('2026-06-06T03:33:00.000Z');
    const engolida = { time: quando, sender: 'Murilo Brasil', email: 'm@x.com', text: 'Rafael, Aguardar. Em sex., 5 de jun...' };
    const limpa = { time: quando, sender: 'Murilo Brasil', email: 'm@x.com', text: 'Rafael, Aguardar.' };
    expect(dedupeQuotedChain([engolida, limpa])).toEqual([limpa]);
    expect(dedupeQuotedChain([limpa, engolida])).toEqual([limpa]);
  });
});
