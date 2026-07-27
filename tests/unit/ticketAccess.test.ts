import { describe, expect, it } from 'vitest';
import { isDirectorAssignedToTicket } from '../../api/_lib/ticketAccess.js';

describe('isDirectorAssignedToTicket', () => {
  const director = {
    id: 'director-1',
    email: 'diretor@empresa.com.br',
    role: 'Diretor',
  };

  it('aceita diretor selecionado por id ou e-mail', () => {
    expect(isDirectorAssignedToTicket(director, {
      directorIds: ['director-1'],
    })).toBe(true);
    expect(isDirectorAssignedToTicket(director, {
      directorEmails: ['DIRETOR@EMPRESA.COM.BR'],
    })).toBe(true);
  });

  it('nega diretor não selecionado e outros papéis', () => {
    expect(isDirectorAssignedToTicket(director, {
      directorIds: ['director-2'],
      directorEmails: ['outro@empresa.com.br'],
    })).toBe(false);
    expect(isDirectorAssignedToTicket(
      { ...director, role: 'Gestor' },
      { directorIds: ['director-1'] }
    )).toBe(false);
  });
});
