import type { ComponentType } from 'react';
import { CalendarCheck, Droplets, Inbox, Mail, Sparkles, Stamp } from 'lucide-react';

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
  version: '2026.08.1',
  title: 'O Serv3 está mudando',
  subtitle: 'Uma reforma grande, em etapas — o que já mudou e o que vem',
  highlight: {
    title: 'Leia antes de continuar',
    body:
      'O Serv3 está deixando de ser um sistema de ETAPAS para virar um sistema de ' +
      'ACOMPANHAMENTO. A pergunta que ele responde deixa de ser "em que fase está esta ' +
      'OS" e passa a ser "o que precisa acontecer, e o que ficou sem resposta". As ' +
      'mudanças chegam aos poucos, e algumas telas vão mudar de lugar ou sumir. Se ' +
      'algo parecer errado ou atrapalhar seu trabalho, avise — é para isso que está ' +
      'sendo feito em etapas.',
  },
  items: [
    {
      Icon: CalendarCheck,
      title: 'Uma tela nova: Hoje',
      body:
        'Em vez de percorrer a lista procurando o que fazer, a tela mostra o que exige ação hoje, ' +
        'o que está atrasado, o que está esperando a sede responder e — principalmente — o que ' +
        'ninguém está tocando.',
    },
    {
      Icon: Sparkles,
      title: 'O sistema sugere; você corrige',
      body:
        'Você não precisa preencher o que fazer em cada OS. O sistema propõe a partir do que já ' +
        'aconteceu (chegou mensagem, alguém prometeu vir, a suspensão venceu) e diz por que ' +
        'sugeriu. Se errar, um clique ajusta ou dispensa.',
    },
    {
      Icon: Inbox,
      title: 'Nenhum e-mail se perde mais',
      body:
        'Mensagens que chegavam e não casavam com nenhuma OS sumiam em silêncio — 23 delas, ' +
        'sobre goteira e portão, com quem escreveu achando que tinha avisado. Agora elas ficam ' +
        'numa fila na Inbox, para vincular a uma OS ou abrir uma nova.',
    },
    {
      Icon: Stamp,
      title: 'Aprovação da diretoria saiu da esteira',
      body:
        'Não havia diretor cadastrado, e a aprovação real sempre aconteceu por e-mail. Agora, ' +
        'quando alguém autorizado responde "autorizado" ou "pode seguir", o sistema registra na ' +
        'OS com a frase exata. Ele apenas registra — quem decide o que fazer continua sendo você.',
    },
    {
      Icon: Droplets,
      title: 'Goteira e local saem do texto',
      body:
        'Problema de água e o lugar (telhado, pátio, biblioteca) passam a ser reconhecidos no ' +
        'próprio pedido, sem ninguém marcar caixinha. Com isso o sistema começa a mostrar ' +
        'reincidência: "a terceira goteira no mesmo telhado".',
    },
    {
      Icon: Mail,
      title: 'A Inbox ficou focada na conversa',
      body:
        'Cotação, contrato, medição e pagamento saíram da Inbox e seguem nas telas de Financeiro. ' +
        'A Inbox fica com o que ela realmente é no dia a dia: a conversa e a triagem.',
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
