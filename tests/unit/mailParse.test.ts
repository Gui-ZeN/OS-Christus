import { describe, it, expect } from 'vitest';
import {
  parseNewTicketSubject,
  parseTicketId,
  isLikelyThreadReply,
  stripReplyForwardPrefixes,
} from '../../api/mail.js';

describe('parseNewTicketSubject', () => {
  it('extrai [SEDE] no início, com e sem separador', () => {
    expect(parseNewTicketSubject('[PE] Vazamento')).toEqual({ siteCode: 'PE', subject: 'Vazamento' });
    expect(parseNewTicketSubject('[PE] - Vazamento')).toEqual({ siteCode: 'PE', subject: 'Vazamento' });
    expect(parseNewTicketSubject('[SUL 2] Conserto de azulejo')).toEqual({ siteCode: 'SUL 2', subject: 'Conserto de azulejo' });
  });

  it('remove prefixos Re:/Fwd: antes do colchete', () => {
    expect(parseNewTicketSubject('Re: [PE] problema')?.siteCode).toBe('PE');
    expect(parseNewTicketSubject('Fwd: [DT2] porta')?.siteCode).toBe('DT2');
  });

  it('remove o rótulo "Título:/Assunto:" antes do [SEDE] (fix do inbound)', () => {
    expect(parseNewTicketSubject('Título: [BS] TAMPAS DA CAIXA')?.siteCode).toBe('BS');
    expect(parseNewTicketSubject('Titulo: [PE] vazamento')?.siteCode).toBe('PE');
    expect(parseNewTicketSubject('Assunto: [DT2] porta')?.siteCode).toBe('DT2');
  });

  it('lida com Re: e Título: em qualquer ordem', () => {
    expect(parseNewTicketSubject('Re: Título: [BS] x')?.siteCode).toBe('BS');
    expect(parseNewTicketSubject('Título: Re: [ALD] x')?.siteCode).toBe('ALD');
  });

  it('preserva o traço interno do assunto', () => {
    expect(parseNewTicketSubject('[PE] texto - com traço')).toEqual({ siteCode: 'PE', subject: 'texto - com traço' });
  });

  it('retorna null quando não há colchete', () => {
    expect(parseNewTicketSubject('Reforma do parquinho.')).toBeNull();
    expect(parseNewTicketSubject('Assunto importante sobre goteira')).toBeNull();
    expect(parseNewTicketSubject('')).toBeNull();
    expect(parseNewTicketSubject(null as unknown as string)).toBeNull();
  });
});

describe('parseTicketId', () => {
  it('extrai OS-#### (>=3 dígitos), case-insensitive', () => {
    expect(parseTicketId('Re: assunto - OS-000123')).toBe('OS-000123');
    expect(parseTicketId('os-045 minúsculo')).toBe('OS-045');
  });
  it('ignora IDs curtos e ausência', () => {
    expect(parseTicketId('OS-45')).toBeNull(); // 2 dígitos
    expect(parseTicketId('sem id aqui')).toBeNull();
    expect(parseTicketId('')).toBeNull();
  });
});

describe('isLikelyThreadReply', () => {
  it('detecta prefixo de resposta/encaminhamento', () => {
    expect(isLikelyThreadReply({ subject: 'Re: [PE] x' })).toBe(true);
    expect(isLikelyThreadReply({ subject: 'RES: algo' })).toBe(true);
    expect(isLikelyThreadReply({ subject: 'Fwd: algo' })).toBe(true);
  });
  it('detecta headers de thread', () => {
    expect(isLikelyThreadReply({ subject: '[PE] x', inReplyTo: '<abc@mail>' })).toBe(true);
    expect(isLikelyThreadReply({ subject: '[PE] x', references: ['<a@m>'] })).toBe(true);
    expect(isLikelyThreadReply({ subject: '[PE] x', references: '<a@m> <b@m>' })).toBe(true);
  });
  it('assunto novo, sem headers, não é resposta', () => {
    expect(isLikelyThreadReply({ subject: '[PE] Vazamento novo' })).toBe(false);
    expect(isLikelyThreadReply({ subject: '[PE] x', references: [] })).toBe(false);
  });
});

describe('stripReplyForwardPrefixes', () => {
  it('remove prefixos repetidos e aninhados', () => {
    expect(stripReplyForwardPrefixes('Re: Re: Fwd: assunto')).toBe('assunto');
    expect(stripReplyForwardPrefixes('assunto normal')).toBe('assunto normal');
  });
});

