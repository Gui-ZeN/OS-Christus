import { describe, expect, it } from 'vitest';
import {
  MAX_PUBLIC_FILES,
  getPublicFormSubmitError,
  isSupportedPublicImage,
  parseEmailList,
  selecionarImagens,
  type ArquivoDoFormulario,
} from '../../src/views/publicForm/regras';

/**
 * O FORMULÁRIO PÚBLICO — a única tela que qualquer pessoa alcança sem login.
 *
 * Eram 705 linhas sem teste nenhum, e é por ela que a OS entra vinda de fora: a
 * sede, o professor, o terceiro que passou no corredor. As regras estavam dentro do
 * componente, alcançáveis só clicando na tela — daí não terem cobertura.
 */

const arquivo = (extra: Partial<ArquivoDoFormulario> = {}): ArquivoDoFormulario => ({
  name: 'foto.jpg',
  size: 1024,
  type: 'image/jpeg',
  lastModified: 1_700_000_000,
  ...extra,
});

const MB = 1024 * 1024;

describe('a lista de interessados aceita o que a pessoa cola', () => {
  it('separa por vírgula, ponto e vírgula e espaço', () => {
    // Cada um vem de um lugar: vírgula do Outlook, ponto e vírgula do Excel, quebra
    // de linha do bloco de notas. Exigir um formato só devolveria erro para quem
    // colou certo do lugar errado.
    const r = parseEmailList('a@x.com.br, b@x.com.br; c@x.com.br\nd@x.com.br');
    expect(r.valid).toEqual(['a@x.com.br', 'b@x.com.br', 'c@x.com.br', 'd@x.com.br']);
    expect(r.invalid).toEqual([]);
  });

  it('normaliza caixa e remove repetido', () => {
    // O mesmo endereço em duas grafias viraria duas cópias do mesmo e-mail.
    const r = parseEmailList('Ana@X.com.br, ana@x.com.br, ANA@X.COM.BR');
    expect(r.valid).toEqual(['ana@x.com.br']);
  });

  it('devolve os inválidos em vez de engoli-los', () => {
    // Descartar em silêncio faria a pessoa achar que avisou alguém que nunca soube.
    const r = parseEmailList('bom@x.com.br, sem-arroba, torto@');
    expect(r.valid).toEqual(['bom@x.com.br']);
    expect(r.invalid).toEqual(['sem-arroba', 'torto@']);
  });

  it('campo vazio não é erro', () => {
    expect(parseEmailList('')).toEqual({ valid: [], invalid: [] });
    expect(parseEmailList('   ,  ; ')).toEqual({ valid: [], invalid: [] });
  });
});

describe('que imagem entra', () => {
  it('aceita os formatos de câmera de celular', () => {
    for (const nome of ['foto.jpg', 'foto.JPEG', 'print.png', 'imagem.webp', 'ios.heic', 'ios.HEIF']) {
      expect(isSupportedPublicImage(arquivo({ name: nome, type: 'image/jpeg' })), nome).toBe(true);
    }
  });

  it('recusa GIF mesmo com o nome trocado para .png', () => {
    // A extensão é texto que qualquer um renomeia; o `type` vem do sistema e
    // denuncia o conteúdo. Testar só um dos dois deixaria o outro passar.
    expect(isSupportedPublicImage(arquivo({ name: 'animado.png', type: 'image/gif' }))).toBe(false);
    expect(isSupportedPublicImage(arquivo({ name: 'animado.gif', type: 'image/gif' }))).toBe(false);
  });

  it('recusa o que não é imagem', () => {
    expect(isSupportedPublicImage(arquivo({ name: 'orcamento.pdf', type: 'application/pdf' }))).toBe(false);
    expect(isSupportedPublicImage(arquivo({ name: 'script.js', type: 'text/javascript' }))).toBe(false);
    expect(isSupportedPublicImage(arquivo({ name: 'foto', type: 'image/jpeg' }))).toBe(false);
  });
});

describe('anexar imagens — recusar UMA não pode derrubar as outras', () => {
  it('o arquivo errado sai e os certos entram', () => {
    // Quem anexa cinco fotos e uma é GIF espera perder o GIF, não as outras quatro.
    const { aceitas, erro } = selecionarImagens(
      [],
      [
        arquivo({ name: 'a.jpg' }),
        arquivo({ name: 'b.gif', type: 'image/gif' }),
        arquivo({ name: 'c.png', type: 'image/png' }),
      ]
    );
    expect(aceitas.map(a => a.name)).toEqual(['a.jpg', 'c.png']);
    expect(erro).toContain('GIF');
  });

  it('arquivo grande demais sai sozinho, os outros seguem', () => {
    const { aceitas, erro } = selecionarImagens(
      [],
      [arquivo({ name: 'enorme.jpg', size: 11 * MB }), arquivo({ name: 'ok.jpg', size: 1 * MB })]
    );
    expect(aceitas.map(a => a.name)).toEqual(['ok.jpg']);
    expect(erro).toContain('enorme.jpg');
  });

  it('mas estourar o TOTAL para de aceitar — o limite é do conjunto', () => {
    // Aqui `break` e não `continue`: passado o teto de 25 MB, tentar os próximos
    // não faz sentido nenhum.
    const { aceitas, erro } = selecionarImagens(
      [arquivo({ name: 'ja.jpg', size: 24 * MB })],
      [arquivo({ name: 'estoura.jpg', size: 2 * MB }), arquivo({ name: 'pequena.jpg', size: 1024 })]
    );
    expect(aceitas).toEqual([]);
    expect(erro).toContain('25 MB');
  });

  it('e passar de dez também para', () => {
    const cheio = Array.from({ length: MAX_PUBLIC_FILES }, (_, i) => arquivo({ name: `f${i}.jpg` }));
    const { aceitas, erro } = selecionarImagens(cheio, [arquivo({ name: 'mais-uma.jpg' })]);
    expect(aceitas).toEqual([]);
    expect(erro).toContain('10 imagens');
  });

  it('a mesma foto duas vezes entra uma só, e em silêncio', () => {
    // Clicar duas vezes é engano óbvio, não erro que mereça mensagem.
    const foto = arquivo({ name: 'foto.jpg', size: 2048, lastModified: 42 });
    const { aceitas, erro } = selecionarImagens([foto], [foto]);
    expect(aceitas).toEqual([]);
    expect(erro).toBe('');
  });

  it('mesmo nome com tamanho diferente NÃO é duplicata', () => {
    // "IMG_0001.jpg" é o nome que toda câmera dá: recusar pelo nome perderia foto.
    const { aceitas } = selecionarImagens(
      [arquivo({ name: 'IMG_0001.jpg', size: 2048, lastModified: 1 })],
      [arquivo({ name: 'IMG_0001.jpg', size: 4096, lastModified: 2 })]
    );
    expect(aceitas).toHaveLength(1);
  });

  it('sem nada para anexar, nada acontece', () => {
    expect(selecionarImagens([], [])).toEqual({ aceitas: [], erro: '' });
  });
});

describe('a mensagem de falha diz o que fazer', () => {
  it('falha de anexo vira instrução, não jargão', () => {
    const texto = getPublicFormSubmitError('Falha ao criar ticket na API.');
    expect(texto).toContain('imagem menor');
    expect(texto).not.toContain('API');
  });

  it('erro sem mensagem tem texto próprio', () => {
    expect(getPublicFormSubmitError('')).toContain('Tente novamente');
  });

  it('mensagem que já explica passa inteira', () => {
    expect(getPublicFormSubmitError('Sede não encontrada no catálogo.')).toBe(
      'Sede não encontrada no catálogo.'
    );
  });
});
