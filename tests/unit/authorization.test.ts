import { describe, expect, it } from 'vitest';
import { detectAuthorization } from '../../api/_lib/authorization.js';
import { extractInboundMessageBody } from '../../api/_lib/inboundBody.js';

const CHEFE = ['murilobcr@gmail.com'];
const de = (text: string, from = 'Murilo <murilobcr@gmail.com>') => ({ from, text });

describe('detectAuthorization — quem pode autorizar', () => {
  it('desligado enquanto ninguém for configurado', () => {
    // Lista vazia = recurso inerte. Nada é detectado até alguém dizer quem pode.
    expect(detectAuthorization(de('Autorizado, pode seguir.'), [])).toBeNull();
  });

  it('só a palavra de quem está na lista conta', () => {
    expect(detectAuthorization(de('Autorizado.'), CHEFE)).not.toBeNull();
    expect(detectAuthorization(de('Autorizado.', 'fulano@px.com.br'), CHEFE)).toBeNull();
  });

  it('reconhece o endereço dentro de "Nome <email>"', () => {
    expect(detectAuthorization(de('Aprovado.', 'Murilo B <MuriloBCR@gmail.com>'), CHEFE)?.email).toBe(
      'murilobcr@gmail.com'
    );
  });
});

describe('detectAuthorization — o que é autorização', () => {
  it.each([
    'Autorizado.',
    'Autorizo o serviço.',
    'Aprovado, podem executar.',
    'Pode seguir com o fornecedor.',
    'De acordo.',
    'Ok. Segue autorizado.',
  ])('reconhece %j', texto => {
    expect(detectAuthorization(de(texto), CHEFE)).not.toBeNull();
  });

  it('devolve a frase original, com acento e caixa', () => {
    // Quem for conferir precisa ler o que a pessoa escreveu, não a versão normalizada.
    const r = detectAuthorization(de('Pode seguir com a execução do serviço.'), CHEFE);
    expect(r?.quote).toBe('Pode seguir com a execução do serviço.');
  });
});

describe('detectAuthorization — o que NÃO é autorização', () => {
  it.each([
    'Ainda não está autorizado.',
    'Não autorizado.',
    'Isso não foi aprovado pela diretoria.',
    'Assim que for autorizado eu aviso.',
    'Preciso que seja autorizado antes de contratar.',
    'Aguardando autorização da reitoria.',
    'Favor autorizar com o setor responsável.',
    'Quando estiver aprovado, me avisem.',
  ])('🚨 recusa %j', texto => {
    // O erro mais caro possível: pendência virando aprovação. Autorização errada
    // move dinheiro.
    expect(detectAuthorization(de(texto), CHEFE)).toBeNull();
  });

  it('pergunta não é decisão', () => {
    expect(detectAuthorization(de('Pode seguir?'), CHEFE)).toBeNull();
    expect(detectAuthorization(de('Já está autorizado?'), CHEFE)).toBeNull();
  });

  it('mensagem comum do chefe não vira autorização', () => {
    expect(detectAuthorization(de('Bom dia, alguma novidade sobre a goteira?'), CHEFE)).toBeNull();
    expect(detectAuthorization(de('Vamos conversar amanhã sobre isso.'), CHEFE)).toBeNull();
    expect(detectAuthorization(de(''), CHEFE)).toBeNull();
  });

  it('🎯 a negação de UMA frase não contamina a autorização de outra', () => {
    // "Não gostei do primeiro orçamento. Autorizado o segundo." — são duas decisões
    // diferentes na mesma mensagem, e a segunda vale.
    const r = detectAuthorization(
      de('Não gostei do primeiro orçamento. Autorizado o segundo.'),
      CHEFE
    );
    expect(r?.quote).toBe('Autorizado o segundo.');
  });

  it('e a negação colada continua bloqueando', () => {
    expect(
      detectAuthorization(de('Recebi a proposta. Ainda não autorizo esse valor.'), CHEFE)
    ).toBeNull();
  });
});

describe('🔁 a citação da thread não pode re-registrar a mesma autorização', () => {
  const respostaComCitacao = [
    'Bom dia, vou verificar com a equipe e retorno.',
    '',
    'Em qua., 5 de ago. de 2026 às 14:32, Murilo <murilobcr@gmail.com> escreveu:',
    '> Autorizado, pode seguir com o fornecedor.',
    '>',
    '> Em ter., 4 de ago., Thais escreveu:',
    '>> Segue o orçamento para aprovação.',
  ].join('\n');

  it('o corpo lido é só o que a pessoa escreveu AGORA', () => {
    expect(extractInboundMessageBody(respostaComCitacao, '')).toBe(
      'Bom dia, vou verificar com a equipe e retorno.'
    );
  });

  it('e por isso a resposta seguinte do próprio chefe não vira autorização nova', () => {
    // Sem isto, toda mensagem da thread — para sempre — carregaria o "Autorizado"
    // citado embaixo e o sistema registraria a mesma decisão dezenas de vezes.
    const corpo = extractInboundMessageBody(respostaComCitacao, '');
    expect(detectAuthorization({ from: 'Murilo <murilobcr@gmail.com>', text: corpo }, CHEFE)).toBeNull();
  });

  it('mas o texto NOVO continua sendo lido', () => {
    const nova = extractInboundMessageBody(
      ['Autorizado, pode seguir.', '', 'Em ter., 4 de ago., Thais escreveu:', '> Segue o orçamento.'].join('\n'),
      ''
    );
    expect(detectAuthorization({ from: 'Murilo <murilobcr@gmail.com>', text: nova }, CHEFE)?.quote).toContain(
      'Autorizado'
    );
  });
});
