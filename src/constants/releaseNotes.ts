import type { ComponentType } from 'react';
import {
  ArrowRightLeft,
  Hourglass,
  Inbox,
  Search,
  Sparkles,
  TriangleAlert,
  UserRound,
} from 'lucide-react';

export interface ReleaseNoteItem {
  Icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  body: string;
}

export interface ReleaseNote {
  /** Bump a cada nova leva de novidades — controla quem já viu (uma vez por versão). */
  version: string;
  title: string;
  subtitle: string;
  /**
   * Aviso em destaque, acima da lista. Existe para esta leva: não é "mais uma
   * atualização", é uma reforma que muda o jeito de usar — e avisar isso em letra
   * miúda, no meio de seis itens, seria o mesmo que não avisar.
   */
  highlight?: { title: string; body: string };
  items: ReleaseNoteItem[];
}

/**
 * Notas da versão atual, exibidas uma vez para Admin/Gestor.
 * Para anunciar uma nova leva: troque `version` e atualize `items`.
 */
export const CURRENT_RELEASE: ReleaseNote = {
  version: '2026.08.2',
  title: 'O Serv3 está mudando',
  subtitle: 'O que mudou nesta semana — e o que o sistema passou a fazer por você',
  highlight: {
    title: 'Leia antes de continuar',
    body:
      'O Serv3 está deixando de ser um sistema de ETAPAS para virar um sistema de ' +
      'ACOMPANHAMENTO. Ele responde "o que está parado e sem resposta", não "em que ' +
      'fase está esta OS". E ele REGISTRA — não cobra ninguém, não fala com ' +
      'fornecedor, não decide por você. A ideia é ajudar a tocar o dia, e nada além ' +
      'disso. Se algo parecer errado ou atrapalhar, avise: é para isso que está sendo ' +
      'feito em etapas.',
  },
  items: [
    {
      Icon: ArrowRightLeft,
      title: 'A Gestão virou o lugar de trabalho',
      body:
        'Ver a conversa, responder, trocar a etapa e definir o responsável agora acontecem na ' +
        'própria tela de Gestão, sem abrir a OS inteira. Trocar etapa é 85% do que se faz por ' +
        'aqui, e para isso ninguém precisa atravessar a tela toda. A OS completa continua a um ' +
        'clique, para quando ela for mesmo necessária.',
    },
    {
      Icon: UserRound,
      title: 'Cada OS pode ter um responsável',
      body:
        'Não é quem executa — para isso já existe a equipe, preenchida em quase todas. É quem ' +
        'responde por ela não parar. A diferença apareceu no número: 180 OS tinham equipe e ' +
        'mesmo assim 155 estavam paradas há mais de um mês. Dá para filtrar por "sem ' +
        'responsável" e ver o que ninguém assumiu.',
    },
    {
      Icon: Sparkles,
      title: 'O sistema mostra o que parou — e só isso',
      body:
        'Ele aponta o que está sem resposta, sem responsável ou sem andamento, e diz por que ' +
        'apareceu. São constatações, não ordens: quem decide o que fazer, e quem cobra quem, ' +
        'continua sendo você. Se a proposta não fizer sentido, um clique ajusta ou dispensa.',
    },
    {
      Icon: TriangleAlert,
      title: 'O que trava uma OS ficou visível',
      body:
        'Havia 88 OS que não avançavam por falta da classificação do serviço — e o aviso só ' +
        'aparecia para quem tentasse avançar, então ninguém sabia. Agora o bloqueio aparece na ' +
        'lista, e dá para classificar e avançar na mesma ação.',
    },
    {
      Icon: Hourglass,
      title: 'Aguardando retorno',
      body:
        'Pediu algo a alguém e está esperando? Registre na conversa da OS. O sistema guarda a ' +
        'data e devolve a OS para você em três dias úteis. Ele não manda e-mail nem cobra ' +
        'ninguém: quem faz isso é você, do jeito que já faz.',
    },
    {
      Icon: Inbox,
      title: 'Nenhum e-mail se perde mais',
      body:
        'Mensagens que chegavam e não casavam com nenhuma OS sumiam em silêncio — 23 delas, ' +
        'sobre goteira e portão, com quem escreveu achando que tinha avisado. Agora ficam numa ' +
        'fila na Inbox, para vincular a uma OS ou abrir uma nova. E o assunto com a sede fora ' +
        'do começo (“…COMPRA [BS]”) deixou de ser descartado.',
    },
    {
      Icon: Search,
      title: 'Buscar colando o título do e-mail funciona',
      body:
        'Antes não achava: o sistema remove o “Re:” e o “[SEDE]” ao criar a OS, então o texto ' +
        'colado nunca batia. Agora a busca entende palavras soltas, ignora acento e procura ' +
        'também pela sede. E as mensagens de erro que apareciam em inglês passaram a explicar ' +
        'em português o que houve.',
    },
  ],
};

const STORAGE_PREFIX = 'os-christus-release-seen:';

export function hasSeenRelease(version: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}${version}`) === '1';
  } catch {
    return false;
  }
}

export function markReleaseSeen(version: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${version}`, '1');
  } catch {
    /* ignore */
  }
}
