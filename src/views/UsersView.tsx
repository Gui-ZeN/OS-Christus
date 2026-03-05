import React, { useEffect, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { createUser, DirectoryUser, fetchUsers, updateUser } from '../services/directoryApi';

type UserStatus = 'Ativo' | 'Pendente' | 'Inativo';

type UserForm = {
  id?: string;
  name: string;
  role: string;
  email: string;
  status: UserStatus;
};

const EMPTY_FORM: UserForm = { name: '', role: '', email: '', status: 'Ativo' };

export function UsersView() {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remoteUsers = await fetchUsers();
        if (!cancelled) {
          setUsers(remoteUsers);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (user: DirectoryUser) => {
    setEditingId(user.id);
    setForm({
      id: user.id,
      name: user.name,
      role: user.role,
      email: user.email,
      status: user.status,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) return;

    const payload: DirectoryUser = {
      id: form.id || form.email.split('@')[0].toLowerCase(),
      name: form.name.trim(),
      role: form.role.trim(),
      email: form.email.trim().toLowerCase(),
      status: form.status,
      active: true,
    };

    setSaving(true);
    try {
      if (editingId) {
        await updateUser(editingId, payload);
        setUsers(prev => prev.map(user => (user.id === editingId ? { ...user, ...payload } : user)));
      } else {
        await createUser(payload);
        setUsers(prev =>
          [...prev, payload].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        );
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
      <div className="max-w-5xl mx-auto">
        <header className="flex justify-between items-end mb-8 border-b border-roman-border pb-4">
          <div>
            <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Usuarios e Equipes</h1>
            <p className="text-roman-text-sub font-serif italic">Gestao de colaboradores, diretores e equipes terceirizadas.</p>
          </div>
          <button onClick={openNew} className="bg-roman-sidebar hover:bg-stone-900 text-white px-4 py-2 rounded-sm font-medium transition-colors flex items-center gap-2">
            <Plus size={16} /> Novo Usuario
          </button>
        </header>

        <div className="bg-roman-surface border border-roman-border rounded-sm overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-10 text-center text-roman-text-sub flex items-center justify-center gap-3">
              <Loader2 size={18} className="animate-spin" />
              Carregando usuarios...
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-roman-bg/50 border-b border-roman-border">
                  <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold">Nome / Equipe</th>
                  <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold">Papel</th>
                  <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold">E-mail</th>
                  <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold">Status</th>
                  <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold text-right">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id} className="border-b border-roman-border hover:bg-roman-bg/50 transition-colors">
                    <td className="p-4 font-medium text-roman-text-main">{user.name}</td>
                    <td className="p-4 text-roman-text-sub">{user.role || '-'}</td>
                    <td className="p-4 text-roman-text-sub">{user.email}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-sm text-xs font-medium ${
                        user.status === 'Ativo'
                          ? 'bg-green-100 text-green-800 border border-green-200'
                          : user.status === 'Pendente'
                            ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                            : 'bg-stone-100 text-stone-600 border border-stone-200'
                      }`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button onClick={() => openEdit(user)} className="text-roman-primary hover:underline font-medium text-sm">
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-roman-surface border border-roman-border rounded-sm shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-roman-border bg-roman-bg">
              <h3 className="font-serif text-lg text-roman-text-main font-medium">
                {editingId ? 'Editar Usuario' : 'Novo Usuario'}
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
                  onChange={e => setForm(current => ({ ...current, name: e.target.value }))}
                  className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-sm text-roman-text-main outline-none focus:border-roman-primary"
                />
              </div>
              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Papel</label>
                <input
                  type="text"
                  value={form.role}
                  onChange={e => setForm(current => ({ ...current, role: e.target.value }))}
                  className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-sm text-roman-text-main outline-none focus:border-roman-primary"
                />
              </div>
              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">E-mail</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(current => ({ ...current, email: e.target.value }))}
                  className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-sm text-roman-text-main outline-none focus:border-roman-primary"
                />
              </div>
              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm(current => ({ ...current, status: e.target.value as UserStatus }))}
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
                onClick={() => void handleSave()}
                disabled={saving || !form.name.trim() || !form.email.trim()}
                className="px-6 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                {editingId ? 'Salvar Alteracoes' : 'Criar Usuario'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
