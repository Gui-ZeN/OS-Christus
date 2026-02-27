import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';

type UserStatus = 'Ativo' | 'Pendente' | 'Inativo';

interface UserData {
  id: number;
  name: string;
  role: string;
  email: string;
  status: UserStatus;
}

const INITIAL_USERS: UserData[] = [
  { id: 1, name: 'Rafael', role: 'Gestor de OS', email: 'rafael@empresa.com', status: 'Ativo' },
  { id: 2, name: 'Leonardo', role: 'Diretor', email: 'leonardo@empresa.com', status: 'Ativo' },
  { id: 3, name: 'Murilo', role: 'Diretor', email: 'murilo@empresa.com', status: 'Ativo' },
  { id: 4, name: 'Pedro', role: 'Diretor', email: 'pedro@empresa.com', status: 'Ativo' },
  { id: 5, name: 'Fernando', role: 'Aprovador Contratos', email: 'fernando@empresa.com', status: 'Ativo' },
  { id: 6, name: 'Geovana', role: 'Financeiro', email: 'geovana@empresa.com', status: 'Ativo' },
  { id: 7, name: 'Equipe Climatização', role: 'Técnico (Interno)', email: 'clima@empresa.com', status: 'Ativo' },
  { id: 8, name: 'Elétrica José', role: 'Terceirizado', email: 'contato@eletricajose.com.br', status: 'Pendente' },
];

const EMPTY_FORM: Omit<UserData, 'id'> = { name: '', role: '', email: '', status: 'Ativo' };

export function UsersView() {
  const [users, setUsers] = useState<UserData[]>(INITIAL_USERS);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (user: UserData) => {
    setEditingId(user.id);
    setForm({ name: user.name, role: user.role, email: user.email, status: user.status });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.email.trim()) return;
    if (editingId !== null) {
      setUsers(prev => prev.map(u => u.id === editingId ? { ...u, ...form } : u));
    } else {
      const newId = Math.max(0, ...users.map(u => u.id)) + 1;
      setUsers(prev => [...prev, { id: newId, ...form }]);
    }
    setModalOpen(false);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
      <div className="max-w-5xl mx-auto">
        <header className="flex justify-between items-end mb-8 border-b border-roman-border pb-4">
          <div>
            <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Usuários e Equipes</h1>
            <p className="text-roman-text-sub font-serif italic">Gestão de colaboradores, diretores e equipes terceirizadas.</p>
          </div>
          <button onClick={openNew} className="bg-roman-sidebar hover:bg-stone-900 text-white px-4 py-2 rounded-sm font-medium transition-colors flex items-center gap-2">
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
                    <span className={`px-2 py-1 rounded-sm text-xs font-medium ${
                      u.status === 'Ativo'
                        ? 'bg-green-100 text-green-800 border border-green-200'
                        : u.status === 'Pendente'
                        ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                        : 'bg-stone-100 text-stone-600 border border-stone-200'
                    }`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button onClick={() => openEdit(u)} className="text-roman-primary hover:underline font-medium text-sm">
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-roman-surface border border-roman-border rounded-sm shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-roman-border bg-roman-bg">
              <h3 className="font-serif text-lg text-roman-text-main font-medium">
                {editingId !== null ? 'Editar Usuário' : 'Novo Usuário'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-roman-text-sub hover:text-roman-text-main">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Nome</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: João Silva"
                  className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-sm text-roman-text-main outline-none focus:border-roman-primary"
                />
              </div>
              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Papel (Role)</label>
                <input
                  type="text"
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  placeholder="Ex: Técnico (Interno)"
                  className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-sm text-roman-text-main outline-none focus:border-roman-primary"
                />
              </div>
              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">E-mail</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="usuario@empresa.com"
                  className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-sm text-roman-text-main outline-none focus:border-roman-primary"
                />
              </div>
              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as UserStatus }))}
                  className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-sm text-roman-text-main outline-none focus:border-roman-primary"
                >
                  <option value="Ativo">Ativo</option>
                  <option value="Pendente">Pendente</option>
                  <option value="Inativo">Inativo</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-roman-border bg-roman-bg">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 border border-roman-border text-roman-text-main hover:bg-roman-surface rounded-sm font-medium transition-colors text-sm">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || !form.email.trim()}
                className="px-6 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingId !== null ? 'Salvar Alterações' : 'Criar Usuário'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
