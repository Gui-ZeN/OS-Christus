import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Plus, Trash2 } from 'lucide-react';
import { fetchCatalog, type CatalogRegion, type CatalogSite } from '../services/catalogApi';
import { createUser, deleteUser, type DirectoryUser, fetchUsers, updateUser } from '../services/directoryApi';
import { useApp } from '../context/AppContext';
import { EmptyState } from '../components/ui/EmptyState';
import { ModalShell } from '../components/ui/ModalShell';

type UserStatus = 'Ativo' | 'Inativo';
type UserRole = 'Diretor' | 'Admin' | 'Usuario';

type UserForm = {
  id?: string;
  name: string;
  role: UserRole;
  email: string;
  status: UserStatus;
  regionIds: string[];
  siteIds: string[];
  password: string;
};

const ROLE_OPTIONS: Array<{ value: UserRole; label: string; description: string }> = [
  { value: 'Diretor', label: 'Diretor', description: 'Acompanha e aprova demandas da sua estrutura.' },
  { value: 'Admin', label: 'Admin', description: 'Acesso administrativo amplo ao sistema.' },
  { value: 'Usuario', label: 'Usuário', description: 'Acesso operacional restrito às sedes vinculadas.' },
];

const EMPTY_FORM: UserForm = {
  name: '',
  role: 'Usuario',
  email: '',
  status: 'Ativo',
  regionIds: [],
  siteIds: [],
  password: '',
};

function normalizeUserForm(user: DirectoryUser): UserForm {
  return {
    id: user.id,
    name: user.name,
    role: (ROLE_OPTIONS.some(option => option.value === user.role) ? user.role : 'Usuario') as UserRole,
    email: user.email,
    status: user.status === 'Inativo' ? 'Inativo' : 'Ativo',
    regionIds: user.regionIds || [],
    siteIds: user.siteIds || [],
    password: '',
  };
}

export function UsersView({ embedded = false }: { embedded?: boolean }) {
  const { currentUser } = useApp();
  const canAccess = currentUser?.role === 'Admin';
  const canManageUsers = canAccess;
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [regions, setRegions] = useState<CatalogRegion[]>([]);
  const [sites, setSites] = useState<CatalogSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [pendingDeleteUser, setPendingDeleteUser] = useState<DirectoryUser | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [remoteUsers, catalog] = await Promise.all([fetchUsers(), fetchCatalog()]);
        if (!cancelled) {
          setUsers(remoteUsers);
          setRegions(catalog.regions);
          setSites(catalog.sites);
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

  const regionMap = useMemo(() => new Map(regions.map(region => [region.id, region])), [regions]);
  const siteMap = useMemo(() => new Map(sites.map(site => [site.id, site])), [sites]);
  const userStats = useMemo(
    () => ({
      total: users.length,
      active: users.filter(user => user.status === 'Ativo').length,
      inactive: users.filter(user => user.status === 'Inativo').length,
      multiSite: users.filter(user => (user.siteIds || []).length > 1).length,
    }),
    [users]
  );

  const filteredSites = useMemo(() => {
    if (form.regionIds.length === 0) return [];
    return sites.filter(site => form.regionIds.includes(site.regionId));
  }, [form.regionIds, sites]);

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (user: DirectoryUser) => {
    setEditingId(user.id);
    setForm(normalizeUserForm(user));
    setModalOpen(true);
  };

  const toggleRegion = (regionId: string) => {
    setForm(current => {
      const hasRegion = current.regionIds.includes(regionId);
      const nextRegionIds = hasRegion ? current.regionIds.filter(id => id !== regionId) : [...current.regionIds, regionId];
      const nextSiteIds = current.siteIds.filter(siteId => {
        const site = siteMap.get(siteId);
        return site ? nextRegionIds.includes(site.regionId) : false;
      });
      return { ...current, regionIds: nextRegionIds, siteIds: nextSiteIds };
    });
  };

  const toggleSite = (siteId: string) => {
    setForm(current => {
      const site = siteMap.get(siteId);
      if (!site) return current;
      const hasSite = current.siteIds.includes(siteId);
      const nextSiteIds = hasSite ? current.siteIds.filter(id => id !== siteId) : [...current.siteIds, siteId];
      const nextRegionIds = current.regionIds.includes(site.regionId) ? current.regionIds : [...current.regionIds, site.regionId];
      return { ...current, regionIds: nextRegionIds, siteIds: nextSiteIds };
    });
  };

  const handleSave = async () => {
    if (!canManageUsers) return;
    if (!form.name.trim() || !form.email.trim() || !form.role.trim()) return;

    const payload: DirectoryUser = {
      id: form.id || form.email.split('@')[0].toLowerCase(),
      name: form.name.trim(),
      role: form.role,
      email: form.email.trim().toLowerCase(),
      status: form.status,
      regionIds: form.regionIds,
      siteIds: form.siteIds,
      active: form.status === 'Ativo',
    };

    setSaving(true);
    setFeedback(null);
    try {
      if (editingId) {
        const result = await updateUser(editingId, payload, form.password.trim() || undefined);
        if (result?.authUid) payload.authUid = result.authUid as string;
        setUsers(prev => prev.map(user => (user.id === editingId ? { ...user, ...payload } : user)));
        setFeedback({ type: 'success', text: 'Usuário atualizado com sucesso.' });
      } else {
        const result = await createUser(payload, form.password.trim() || undefined);
        if (result?.authUid) payload.authUid = result.authUid as string;
        setUsers(prev => [...prev, payload].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
        if (result?.passwordEmailSent) {
          setFeedback({
            type: 'success',
            text: 'Usuário criado. E-mail para criação/redefinição de senha enviado.',
          });
        } else if (payload.status === 'Ativo') {
          setFeedback({
            type: 'warning',
            text: `Usuário criado, mas o e-mail de senha não foi enviado: ${result?.passwordEmailError || 'falha desconhecida'}`,
          });
        } else {
          setFeedback({
            type: 'warning',
            text: 'Usuário criado como inativo. O e-mail de criação de senha não foi enviado.',
          });
        }
      }
      setModalOpen(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível salvar o usuário.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user: DirectoryUser) => {
    if (!canManageUsers) return;
    setSaving(true);
    try {
      await deleteUser(user.id);
      setUsers(prev => prev.filter(item => item.id !== user.id));
      if (editingId === user.id) {
        setModalOpen(false);
        setEditingId(null);
        setForm(EMPTY_FORM);
      }
    } finally {
      setSaving(false);
      setPendingDeleteUser(null);
    }
  };

  if (!canAccess) {
    return (
      <div className={embedded ? '' : 'flex-1 overflow-y-auto bg-roman-bg p-4 md:p-5 xl:p-8'}>
        <div className={embedded ? '' : 'max-w-4xl mx-auto min-h-[60vh]'}>
          <EmptyState icon={Plus} title="Acesso restrito" description="A administração de usuários está disponível apenas para perfis Admin." />
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? '' : 'flex-1 overflow-y-auto bg-roman-bg p-4 md:p-5 xl:p-8'}>
      <div className={embedded ? '' : 'max-w-6xl mx-auto'}>
        <header className="mb-8 flex flex-col gap-4 border-b border-roman-border pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className={`${embedded ? 'text-2xl' : 'text-3xl'} font-serif font-medium text-roman-text-main mb-2`}>Usuários</h1>
            <p className="text-roman-text-sub font-serif italic">Controle de acesso por perfil, região e sede vinculada.</p>
          </div>
          <button onClick={openNew} disabled={!canManageUsers} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
            <Plus size={16} /> Novo Usuário
          </button>
        </header>
        {feedback && (
          <div
            className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
              feedback.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : feedback.type === 'warning'
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-red-200 bg-red-50 text-red-900'
            }`}
          >
            {feedback.text}
          </div>
        )}

        <div className={`bg-roman-surface border border-roman-border overflow-hidden ${embedded ? 'rounded-[1.5rem] shadow-[0_24px_80px_rgba(15,23,42,0.08)]' : 'rounded-sm shadow-sm'}`}>
          {loading ? (
            <div className="p-10 text-center text-roman-text-sub flex items-center justify-center gap-3">
              <Loader2 size={18} className="animate-spin" />
              Carregando usuários...
            </div>
          ) : (
            embedded ? (
              <div className="space-y-5 bg-stone-50/70 p-6">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-roman-text-sub">Total</div>
                    <div className="mt-2 text-2xl font-serif text-roman-text-main">{userStats.total}</div>
                  </div>
                  <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-4">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-emerald-700">Ativos</div>
                    <div className="mt-2 text-2xl font-serif text-emerald-900">{userStats.active}</div>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-stone-600">Inativos</div>
                    <div className="mt-2 text-2xl font-serif text-stone-800">{userStats.inactive}</div>
                  </div>
                  <div className="rounded-2xl border border-sky-200 bg-white px-4 py-4">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-sky-700">Multissede</div>
                    <div className="mt-2 text-2xl font-serif text-sky-900">{userStats.multiSite}</div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-[1.5rem] border border-stone-200 bg-white">
                  <div className="flex items-center justify-between gap-4 border-b border-stone-200 px-5 py-4">
                    <div>
                      <div className="text-sm font-medium text-roman-text-main">Base de acessos</div>
                      <div className="mt-1 text-xs text-roman-text-sub">Lista administrativa com vínculo territorial e status operacional.</div>
                    </div>
                    <div className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-roman-text-sub">
                      {users.length} registro(s)
                    </div>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1.5fr)_140px_minmax(0,1.2fr)_150px_160px] gap-4 border-b border-stone-200 bg-stone-50/80 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-roman-text-sub">
                    <div>Usuário</div>
                    <div>Papel</div>
                    <div>Região / Sedes</div>
                    <div>Status</div>
                    <div className="text-right">Ações</div>
                  </div>
                  <div className="divide-y divide-stone-200">
                  {users.length === 0 && (
                    <div className="px-5 py-10 text-center text-sm text-roman-text-sub">
                      Nenhum usuário cadastrado até o momento.
                    </div>
                  )}
                  {users.map(user => {
                    const userRegions = (user.regionIds || []).map(regionId => regionMap.get(regionId)?.code || regionId).filter(Boolean);
                    const userSites = (user.siteIds || []).map(siteId => siteMap.get(siteId)?.code || siteId).filter(Boolean);
                    return (
                      <div key={user.id} className="grid grid-cols-[minmax(0,1.5fr)_140px_minmax(0,1.2fr)_150px_160px] gap-4 px-5 py-4 text-sm hover:bg-stone-50/70">
                        <div className="min-w-0">
                          <div className="font-semibold text-roman-text-main">{user.name}</div>
                          <p className="mt-1 break-all text-roman-text-sub">{user.email}</p>
                        </div>
                        <div className="flex items-start">
                          <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-roman-text-main">{user.role || '-'}</span>
                        </div>
                        <div className="text-roman-text-sub">
                          <div>{userRegions.length > 0 ? userRegions.join(', ') : 'Sem região vinculada'}</div>
                          <div className="mt-1 text-xs">{userSites.length > 0 ? userSites.join(', ') : 'Nenhuma sede vinculada'}</div>
                        </div>
                        <div className="flex items-start">
                          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${user.status === 'Ativo' ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'}`}>
                            {user.status}
                          </span>
                        </div>
                        <div className="flex items-start justify-end gap-3">
                          <button onClick={() => openEdit(user)} disabled={!canManageUsers} className="text-sm font-medium text-roman-primary hover:underline disabled:opacity-50 disabled:no-underline">
                            Editar
                          </button>
                          <button onClick={() => setPendingDeleteUser(user)} disabled={!canManageUsers || saving} className="inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:text-red-900 disabled:opacity-50">
                            <Trash2 size={14} />
                            Excluir
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-left">
                  <thead>
                    <tr className="bg-roman-bg/50 border-b border-roman-border">
                      <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold">Nome</th>
                      <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold">Papel</th>
                      <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold">E-mail</th>
                      <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold">Região / Sedes</th>
                      <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold">Status</th>
                      <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(user => {
                      const userRegions = (user.regionIds || []).map(regionId => regionMap.get(regionId)?.code || regionId).filter(Boolean);
                      const userSites = (user.siteIds || []).map(siteId => siteMap.get(siteId)?.code || siteId).filter(Boolean);
                      return (
                        <tr key={user.id} className="border-b border-roman-border hover:bg-roman-bg/50 transition-colors align-top">
                          <td className="p-4 font-medium text-roman-text-main">{user.name}</td>
                          <td className="p-4 text-roman-text-sub">{user.role || '-'}</td>
                          <td className="p-4 text-roman-text-sub">{user.email}</td>
                          <td className="p-4 text-roman-text-sub">
                            <div className="space-y-1">
                              <div>{userRegions.length > 0 ? userRegions.join(', ') : '-'}</div>
                              <div className="text-xs text-roman-text-sub/80">{userSites.length > 0 ? userSites.join(', ') : 'Nenhuma sede vinculada'}</div>
                            </div>
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded-sm text-xs font-medium ${user.status === 'Ativo' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-stone-100 text-stone-600 border border-stone-200'}`}>
                              {user.status}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <div className="inline-flex items-center gap-3">
                              <button onClick={() => openEdit(user)} disabled={!canManageUsers} className="text-roman-primary hover:underline font-medium text-sm disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed">
                                Editar
                              </button>
                              <button onClick={() => void handleDelete(user)} disabled={!canManageUsers || saving} className="inline-flex items-center gap-1 text-red-700 hover:text-red-900 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                                <Trash2 size={14} />
                                Excluir
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </div>

      {modalOpen && (
        <ModalShell
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingId ? 'Editar usuário' : 'Novo usuário'}
          description={editingId ? 'Atualize papel, escopo territorial e credenciais de acesso.' : 'Cadastre o usuário com papel e escopo territorial. O sistema enviará e-mail para criar/redefinir a senha.'}
          maxWidthClass="max-w-3xl"
          footer={(
            <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
              <button onClick={() => setModalOpen(false)} className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-roman-text-main transition-colors hover:bg-white">
                Cancelar
              </button>
              <button onClick={() => void handleSave()} disabled={saving || !form.name.trim() || !form.email.trim() || !form.role.trim()} className="flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                {editingId ? 'Salvar alterações' : 'Criar usuário'}
              </button>
            </div>
          )}
        >
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Nome</label>
                  <input type="text" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-roman-text-main outline-none focus:border-roman-primary" />
                </div>
                <div>
                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">E-mail</label>
                  <input type="email" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-roman-text-main outline-none focus:border-roman-primary" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">{editingId ? 'Nova senha (opcional)' : 'Senha manual (opcional)'}</label>
                <input type="password" value={form.password} onChange={event => setForm(current => ({ ...current, password: event.target.value }))} placeholder={editingId ? 'Preencha apenas para redefinir' : 'Se vazio, usuário define por e-mail'} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-roman-text-main outline-none focus:border-roman-primary" />
                <p className="mt-2 text-xs text-roman-text-sub font-serif italic">{editingId ? 'Se preenchida, atualiza a senha no Firebase Auth.' : 'Se não preencher, o sistema envia e-mail para o usuário criar a senha.'}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Papel</label>
                  <select value={form.role} onChange={event => setForm(current => ({ ...current, role: event.target.value as UserRole }))} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-roman-text-main outline-none focus:border-roman-primary">
                    {ROLE_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-roman-text-sub font-serif italic">{ROLE_OPTIONS.find(option => option.value === form.role)?.description}</p>
                </div>
                <div>
                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Status</label>
                  <select value={form.status} onChange={event => setForm(current => ({ ...current, status: event.target.value as UserStatus }))} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-roman-text-main outline-none focus:border-roman-primary">
                    <option value="Ativo">Ativo</option>
                    <option value="Inativo">Inativo</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2">Regiões</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {regions.map(region => {
                    const checked = form.regionIds.includes(region.id);
                    return (
                      <button key={region.id} type="button" onClick={() => toggleRegion(region.id)} className={`border rounded-sm px-3 py-3 text-left transition-colors ${checked ? 'border-roman-primary bg-roman-primary/10' : 'border-roman-border bg-roman-bg hover:border-roman-primary/50'}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-roman-text-main">{region.name}</div>
                            <div className="text-xs text-roman-text-sub">{region.code}</div>
                          </div>
                          {checked && <Check size={16} className="text-roman-primary" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2">Sedes</label>
                {form.regionIds.length === 0 ? (
                  <div className="border border-dashed border-roman-border rounded-sm p-4 text-sm text-roman-text-sub font-serif italic">Selecione ao menos uma região para vincular as sedes.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredSites.map(site => {
                      const checked = form.siteIds.includes(site.id);
                      return (
                        <button key={site.id} type="button" onClick={() => toggleSite(site.id)} className={`border rounded-sm px-3 py-3 text-left transition-colors ${checked ? 'border-roman-primary bg-roman-primary/10' : 'border-roman-border bg-roman-bg hover:border-roman-primary/50'}`}>
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-roman-text-main">{site.name}</div>
                              <div className="text-xs text-roman-text-sub">{site.code} · {regionMap.get(site.regionId)?.code || site.regionId}</div>
                            </div>
                            {checked && <Check size={16} className="text-roman-primary" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
        </ModalShell>
      )}

      {pendingDeleteUser && (
        <ModalShell
          isOpen={!!pendingDeleteUser}
          onClose={() => setPendingDeleteUser(null)}
          title="Excluir usuário"
          description={`Essa ação remove o cadastro de ${pendingDeleteUser.name} e também tenta remover o acesso no Firebase Auth.`}
          maxWidthClass="max-w-lg"
          footer={(
            <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
              <button onClick={() => setPendingDeleteUser(null)} className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-roman-text-main hover:bg-stone-50">
                Cancelar
              </button>
              <button onClick={() => void handleDelete(pendingDeleteUser)} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-red-700 px-5 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Excluir usuário
              </button>
            </div>
          )}
        >
          <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-roman-text-sub">
            <div><strong>Nome:</strong> {pendingDeleteUser.name}</div>
            <div><strong>E-mail:</strong> {pendingDeleteUser.email}</div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
