import React from 'react';
import { Plus } from 'lucide-react';

export function UsersView() {
  const users = [
    { id: 1, name: 'Rafael', role: 'Gestor de OS', email: 'rafael@empresa.com', status: 'Ativo' },
    { id: 2, name: 'Leonardo', role: 'Diretor', email: 'leonardo@empresa.com', status: 'Ativo' },
    { id: 3, name: 'Murilo', role: 'Diretor', email: 'murilo@empresa.com', status: 'Ativo' },
    { id: 4, name: 'Pedro', role: 'Diretor', email: 'pedro@empresa.com', status: 'Ativo' },
    { id: 5, name: 'Fernando', role: 'Aprovador Contratos', email: 'fernando@empresa.com', status: 'Ativo' },
    { id: 6, name: 'Geovana', role: 'Financeiro', email: 'geovana@empresa.com', status: 'Ativo' },
    { id: 7, name: 'Equipe Climatização', role: 'Técnico (Interno)', email: 'clima@empresa.com', status: 'Ativo' },
    { id: 8, name: 'Elétrica José', role: 'Terceirizado', email: 'contato@eletricajose.com.br', status: 'Pendente' },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
      <div className="max-w-5xl mx-auto">
        <header className="flex justify-between items-end mb-8 border-b border-roman-border pb-4">
          <div>
            <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Usuários e Equipes</h1>
            <p className="text-roman-text-sub font-serif italic">Gestão de colaboradores, diretores e equipes terceirizadas.</p>
          </div>
          <button className="bg-roman-sidebar hover:bg-stone-900 text-white px-4 py-2 rounded-sm font-medium transition-colors flex items-center gap-2">
            <Plus size={16} /> Novo Usuário
          </button>
        </header>

        <div className="bg-roman-surface border border-roman-border rounded-sm overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-roman-bg/50 border-b border-roman-border">
                <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold">Nome / Equipe</th>
                <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold">Papel (Role)</th>
                <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold">E-mail</th>
                <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold">Status</th>
                <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-roman-border hover:bg-roman-bg/50 transition-colors">
                  <td className="p-4 font-medium text-roman-text-main">{u.name}</td>
                  <td className="p-4 text-roman-text-sub">{u.role}</td>
                  <td className="p-4 text-roman-text-sub">{u.email}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-sm text-xs font-medium ${u.status === 'Ativo' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-yellow-100 text-yellow-800 border border-yellow-200'}`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button className="text-roman-primary hover:underline font-medium">Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
