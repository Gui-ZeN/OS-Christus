import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Plus, X } from 'lucide-react';
import { fetchCatalog, type CatalogRegion, type CatalogSite } from '../services/catalogApi';
import { createUser, DirectoryUser, fetchUsers, updateUser } from '../services/directoryApi';

type UserStatus = 'Ativo' | 'Inativo';
type UserRole = 'Diretor' | 'Supervisor' | 'Admin' | 'Usuario';

type UserForm = {
  id?: string;
  name: string;
  role: UserRole;
  email: string;
  status: UserStatus;
  regionIds: string[];
  siteIds: string[];
};

const ROLE_OPTIONS: Array<{ value: UserRole; label: string; description: string }> = [
  { value: 'Diretor', label: 'Diretor', description: 'Acompanha e aprova demandas da sua estrutura.' },
  { value: 'Supervisor', label: 'Supervisor', description: 'Opera e visualiza somente as sedes vinculadas.' },
  { value: 'Admin', label: 'Admin', description: 'Acesso administrativo amplo ao sistema.' },
  { value: 'Usuario', label: 'Usuario', description: 'Acesso operacional restrito as sedes vinculadas.' },
];

const EMPTY_FORM: UserForm = {
  name: '',
  role: 'Usuario',
  email: '',
  status: 'Ativo',
  regionIds: [],
  siteIds: [],
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
  };
}

export function UsersView() {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [regions, setRegions] = useState<CatalogRegion[]>([]);
  const [sites, setSites] = useState<CatalogSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);

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
      const nextRegionIds = hasRegion
        ? current.regionIds.filter(id => id !== regionId)
        : [...current.regionIds, regionId];
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
      const nextRegionIds = current.regionIds.includes(site.regionId)
        ? current.regionIds
        : [...current.regionIds, site.regionId];
      return { ...current, regionIds: nextRegionIds, siteIds: nextSiteIds };
    });
  };

  const handleSave = async () => {
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
    try {
      if (editingId) {
        await updateUser(editingId, payload);
        setUsers(prev => prev.map(user => (user.id === editingId ? { ...user, ...payload } : user)));
      } else {
        await createUser(payload);
        setUsers(prev => [...prev, payload].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-end mb-8 border-b border-roman-border pb-4 gap-4">
          <div>
            <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Usuarios</h1>
            <p className="text-roman-text-sub font-serif italic">Gestao de acesso por papel, regiao e sede.</p>
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
                  <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold">Nome</th>
                  <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold">Papel</th>
                  <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold">E-mail</th>
                  <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold">Regiao / Sedes</th>
                  <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold">Status</th>
                  <th className="p-4 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-semibold text-right">Acoes</th>
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
                        <span className={`px-2 py-1 rounded-sm text-xs font-medium ${
                          user.status === 'Ativo'
                            ? 'bg-green-100 text-green-800 border border-green-200'
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
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-roman-surface border border-roman-border rounded-sm shadow-xl w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-roman-border bg-roman-bg">
              <h3 className="font-serif text-lg text-roman-text-main font-medium">{editingId ? 'Editar Usuario' : 'Novo Usuario'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-roman-text-sub hover:text-roman-text-main">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Nome</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={event => setForm(current => ({ ...current, name: event.target.value }))}
                    className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-sm text-roman-text-main outline-none focus:border-roman-primary"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">E-mail</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={event => setForm(current => ({ ...current, email: event.target.value }))}
                    className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-sm text-roman-text-main outline-none focus:border-roman-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Papel</label>
                  <select
                    value={form.role}
                    onChange={event => setForm(current => ({ ...current, role: event.target.value as UserRole }))}
                    className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-sm text-roman-text-main outline-none focus:border-roman-primary"
                  >
                    {ROLE_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-roman-text-sub font-serif italic">
                    {ROLE_OPTIONS.find(option => option.value === form.role)?.description}
                  </p>
                </div>
                <div>
                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Status</label>
                  <select
                    value={form.status}
                    onChange={event => setForm(current => ({ ...current, status: event.target.value as UserStatus }))}
                    className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-sm text-roman-text-main outline-none focus:border-roman-primary"
                  >
                    <option value="Ativo">Ativo</option>
                    <option value="Inativo">Inativo</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2">Regioes</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {regions.map(region => {
                    const checked = form.regionIds.includes(region.id);
                    return (
                      <button
                        key={region.id}
                        type="button"
                        onClick={() => toggleRegion(region.id)}
                        className={`border rounded-sm px-3 py-3 text-left transition-colors ${checked ? 'border-roman-primary bg-roman-primary/10' : 'border-roman-border bg-roman-bg hover:border-roman-primary/50'}`}
                      >
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
                  <div className="border border-dashed border-roman-border rounded-sm p-4 text-sm text-roman-text-sub font-serif italic">
                    Selecione ao menos uma regiao para vincular as sedes.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredSites.map(site => {
                      const checked = form.siteIds.includes(site.id);
                      return (
                        <button
                          key={site.id}
                          type="button"
                          onClick={() => toggleSite(site.id)}
                          className={`border rounded-sm px-3 py-3 text-left transition-colors ${checked ? 'border-roman-primary bg-roman-primary/10' : 'border-roman-border bg-roman-bg hover:border-roman-primary/50'}`}
                        >
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

            <div className="flex justify-end gap-3 p-4 border-t border-roman-border bg-roman-bg">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 border border-roman-border text-roman-text-main hover:bg-roman-surface rounded-sm font-medium transition-colors text-sm">
                Cancelar
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saving || !form.name.trim() || !form.email.trim() || !form.role.trim()}
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