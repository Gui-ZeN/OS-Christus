import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Landmark, ArrowRight, ArrowLeft, Loader2, CheckCircle, FileText, ImageIcon } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Ticket, HistoryItem } from '../types';
import { TICKET_STATUS } from '../constants/ticketStatus';
import { notifyTicketCreated } from '../services/ticketEmail';
import {
  CatalogMacroService,
  CatalogMaterial,
  CatalogRegion,
  CatalogServiceItem,
  CatalogSite,
  fetchCatalog,
} from '../services/catalogApi';

interface PublicFormViewProps {
  onBack: () => void;
}

export function PublicFormView({ onBack }: PublicFormViewProps) {
  const { addTicket } = useApp();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState('');
  const [createdToken, setCreatedToken] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    description: '',
    type: '',
    macroServiceId: '',
    serviceCatalogId: '',
    sector: '',
    region: '',
    sede: '',
  });
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [catalogRegions, setCatalogRegions] = useState<CatalogRegion[]>([]);
  const [catalogSites, setCatalogSites] = useState<CatalogSite[]>([]);
  const [catalogMacroServices, setCatalogMacroServices] = useState<CatalogMacroService[]>([]);
  const [catalogServiceItems, setCatalogServiceItems] = useState<CatalogServiceItem[]>([]);
  const [catalogMaterials, setCatalogMaterials] = useState<CatalogMaterial[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const catalog = await fetchCatalog();
        if (!cancelled) {
          setCatalogRegions(catalog.regions);
          setCatalogSites(catalog.sites);
          setCatalogMacroServices(catalog.macroServices);
          setCatalogServiceItems(catalog.serviceCatalog);
          setCatalogMaterials(catalog.materials);
        }
      } catch {
        if (!cancelled) {
          setCatalogRegions([]);
          setCatalogSites([]);
          setCatalogMacroServices([]);
          setCatalogServiceItems([]);
          setCatalogMaterials([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedRegion = useMemo(
    () => catalogRegions.find(region => region.name === formData.region),
    [catalogRegions, formData.region]
  );

  const availableSites = useMemo(() => {
    if (!selectedRegion) return [];
    return catalogSites.filter(site => site.regionId === selectedRegion.id);
  }, [catalogSites, selectedRegion]);

  const availableServiceItems = useMemo(() => {
    if (!formData.macroServiceId) return [];
    return catalogServiceItems.filter(item => item.macroServiceId === formData.macroServiceId);
  }, [catalogServiceItems, formData.macroServiceId]);

  const selectedMacroService = useMemo(
    () => catalogMacroServices.find(item => item.id === formData.macroServiceId) || null,
    [catalogMacroServices, formData.macroServiceId]
  );

  const selectedServiceItem = useMemo(
    () => catalogServiceItems.find(item => item.id === formData.serviceCatalogId) || null,
    [catalogServiceItems, formData.serviceCatalogId]
  );

  const suggestedMaterials = useMemo(() => {
    if (!selectedServiceItem?.suggestedMaterialIds?.length) return [];
    return selectedServiceItem.suggestedMaterialIds
      .map(materialId => catalogMaterials.find(material => material.id === materialId))
      .filter((value): value is CatalogMaterial => Boolean(value));
  }, [catalogMaterials, selectedServiceItem]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Nome é obrigatório';
    if (!formData.email.trim()) newErrors.email = 'E-mail é obrigatório';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'E-mail inválido';
    if (!formData.subject.trim()) newErrors.subject = 'Assunto é obrigatório';
    if (!formData.description.trim()) newErrors.description = 'Descrição é obrigatória';
    if (!formData.type) newErrors.type = 'Selecione o tipo';
    if (!formData.macroServiceId) newErrors.macroServiceId = 'Selecione o macroserviço';
    if (!formData.serviceCatalogId) newErrors.serviceCatalogId = 'Selecione o serviço';
    if (!formData.sector.trim()) newErrors.sector = 'Setor é obrigatório';
    if (!formData.region) newErrors.region = 'Selecione a região';
    if (!formData.sede) newErrors.sede = 'Selecione a sede';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const now = new Date();
      const selectedRegion = catalogRegions.find(region => region.name === formData.region) || null;
      const selectedSite = availableSites.find(site => site.code === formData.sede) || null;
      const draftTicket: Ticket = {
        id: '',
        trackingToken: '',
        subject: formData.subject,
        requester: formData.name,
        requesterEmail: formData.email,
        time: now,
        status: TICKET_STATUS.NEW,
        type: formData.type,
        macroServiceId: selectedMacroService?.id,
        macroServiceName: selectedMacroService?.name,
        serviceCatalogId: selectedServiceItem?.id,
        serviceCatalogName: selectedServiceItem?.name,
        regionId: selectedRegion?.id,
        region: formData.region,
        siteId: selectedSite?.id,
        sede: formData.sede,
        sector: formData.sector,
        priority: 'Normal',
        history: [
          { id: crypto.randomUUID(), type: 'customer', sender: formData.name, time: now, text: formData.description },
          { id: crypto.randomUUID(), type: 'system', sender: 'Sistema', time: now, text: 'Solicitação registrada via formulário público. Aguardando triagem.' },
        ] as HistoryItem[],
      };
      const createdTicket = await addTicket(draftTicket);
      void notifyTicketCreated(createdTicket);
      setCreatedId(createdTicket.id);
      setCreatedToken(createdTicket.trackingToken);
      setIsSubmitting(false);
      setIsSubmitted(true);
      setFormData({
        name: '',
        email: '',
        subject: '',
        description: '',
        type: '',
        macroServiceId: '',
        serviceCatalogId: '',
        sector: '',
        region: '',
        sede: '',
      });
      setFiles([]);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Não foi possível registrar a OS agora.');
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      if (name === 'region') {
        return { ...prev, region: value, sede: '' };
      }
      if (name === 'macroServiceId') {
        return { ...prev, macroServiceId: value, serviceCatalogId: '' };
      }
      return { ...prev, [name]: value };
    });
    if (errors[name]) {
      setErrors(prev => {
        const n = { ...prev };
        delete n[name];
        return n;
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(Array.from(e.target.files));
  };

  return (
    <div className="h-screen w-full bg-roman-surface overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-10">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-roman-text-sub hover:text-roman-text-main text-sm mb-8 transition-colors group"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
            Voltar
          </button>
          <div className="flex items-center gap-3 text-roman-primary mb-3">
            <Landmark size={28} strokeWidth={1.5} />
            <h1 className="text-2xl font-serif text-roman-text-main">Nova Ordem de Serviço</h1>
          </div>
          <p className="text-roman-text-sub font-serif italic">
            Preencha os dados abaixo para solicitar uma manutenção.
          </p>
        </div>

        {isSubmitted ? (
          <div className="bg-roman-bg border border-roman-border p-10 rounded-sm shadow-sm text-center animate-in fade-in">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={32} />
            </div>
            <h2 className="text-2xl font-serif text-roman-text-main mb-2">OS Registrada com Sucesso!</h2>
            <p className="text-roman-text-sub mb-6 leading-relaxed">
              Sua solicitação foi enviada para a equipe de triagem. O número da sua OS é{' '}
              <strong className="text-roman-text-main">#{createdId}</strong>.
            </p>
            <div className="bg-roman-surface border border-roman-border p-4 rounded-sm mb-8 text-left">
              <p className="text-xs text-roman-text-sub font-serif italic mb-2">
                Enviamos um link de acompanhamento para o seu e-mail. Você também pode acessar por aqui:
              </p>
              <div className="text-roman-primary font-mono text-xs break-all bg-roman-primary/5 p-2 border border-roman-primary/20 rounded-sm">
                {window.location.origin}/?tracking={createdToken}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setIsSubmitted(false);
                  setCreatedId('');
                  setCreatedToken('');
                }}
                className="flex-1 bg-roman-sidebar hover:bg-stone-900 text-white py-3 rounded-sm font-medium transition-colors"
              >
                Abrir Nova OS
              </button>
              <button
                onClick={onBack}
                className="flex-1 border border-roman-border hover:bg-roman-bg text-roman-text-main py-3 rounded-sm font-medium transition-colors"
              >
                Página Inicial
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="pb-6 border-b border-roman-border">
              <h3 className="font-serif text-lg text-roman-text-main mb-4">Sua Identificação</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Seu Nome</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="Ex: João Silva"
                    className={`w-full border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary ${errors.name ? 'border-red-500' : 'border-roman-border'}`}
                  />
                  {errors.name && <span className="text-xs text-red-500 mt-1 block">{errors.name}</span>}
                </div>
                <div>
                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Seu E-mail (Para receber o link)</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="nome@dominio.com"
                    className={`w-full border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary ${errors.email ? 'border-red-500' : 'border-roman-border'}`}
                  />
                  {errors.email && <span className="text-xs text-red-500 mt-1 block">{errors.email}</span>}
                </div>
              </div>
            </div>

            <div className="pb-6 border-b border-roman-border space-y-4">
              <h3 className="font-serif text-lg text-roman-text-main mb-4">Dados do Problema</h3>

              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Assunto (Apenas 1 problema por formulário)</label>
                <input
                  type="text"
                  name="subject"
                  value={formData.subject}
                  onChange={handleInputChange}
                  placeholder="Ex: Lâmpada queimada na recepção"
                  className={`w-full border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary ${errors.subject ? 'border-red-500' : 'border-roman-border'}`}
                />
                {errors.subject && <span className="text-xs text-red-500 mt-1 block">{errors.subject}</span>}
              </div>

              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Descrição Curta</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Resuma o problema brevemente..."
                  className={`w-full h-20 border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary resize-none ${errors.description ? 'border-red-500' : 'border-roman-border'}`}
                />
                {errors.description && <span className="text-xs text-red-500 mt-1 block">{errors.description}</span>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Tipo de Manutenção</label>
                  <select
                    name="type"
                    value={formData.type}
                    onChange={handleInputChange}
                    className={`w-full border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary ${errors.type ? 'border-red-500' : 'border-roman-border'}`}
                  >
                    <option value="">Selecione...</option>
                    <option value="Corretiva">Corretiva (Conserto)</option>
                    <option value="Preventiva">Preventiva</option>
                    <option value="Melhoria">Melhoria</option>
                  </select>
                  {errors.type && <span className="text-xs text-red-500 mt-1 block">{errors.type}</span>}
                </div>
                <div>
                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Macroserviço</label>
                  <select
                    name="macroServiceId"
                    value={formData.macroServiceId}
                    onChange={handleInputChange}
                    className={`w-full border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary ${errors.macroServiceId ? 'border-red-500' : 'border-roman-border'}`}
                  >
                    <option value="">Selecione...</option>
                    {catalogMacroServices.map(item => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                  {errors.macroServiceId && <span className="text-xs text-red-500 mt-1 block">{errors.macroServiceId}</span>}
                </div>
                <div>
                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Serviço</label>
                  <select
                    name="serviceCatalogId"
                    value={formData.serviceCatalogId}
                    onChange={handleInputChange}
                    disabled={!formData.macroServiceId}
                    className={`w-full border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary disabled:opacity-60 ${errors.serviceCatalogId ? 'border-red-500' : 'border-roman-border'}`}
                  >
                    <option value="">Selecione...</option>
                    {availableServiceItems.map(item => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                  {errors.serviceCatalogId && <span className="text-xs text-red-500 mt-1 block">{errors.serviceCatalogId}</span>}
                </div>
                <div>
                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Setor / Local exato</label>
                  <input
                    type="text"
                    name="sector"
                    value={formData.sector}
                    onChange={handleInputChange}
                    placeholder="Ex: Recepção principal"
                    className={`w-full border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary ${errors.sector ? 'border-red-500' : 'border-roman-border'}`}
                  />
                  {errors.sector && <span className="text-xs text-red-500 mt-1 block">{errors.sector}</span>}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Materiais de referência</label>
                  <div className="min-h-11 w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] text-roman-text-main">
                    {selectedServiceItem ? (
                      suggestedMaterials.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {suggestedMaterials.map(material => (
                            <span key={material.id} className="rounded-sm border border-roman-primary/20 bg-roman-primary/5 px-2 py-1 text-xs font-medium text-roman-primary">
                              {material.name}{material.unit ? ` · ${material.unit}` : ''}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-roman-text-sub">Este serviço ainda não tem materiais sugeridos cadastrados.</span>
                      )
                    ) : (
                      <span className="text-roman-text-sub">Selecione um serviço para ver materiais de apoio e padronização.</span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Região</label>
                  <select
                    name="region"
                    value={formData.region}
                    onChange={handleInputChange}
                    className={`w-full border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary ${errors.region ? 'border-red-500' : 'border-roman-border'}`}
                  >
                    <option value="">Selecione...</option>
                    {catalogRegions.map(region => (
                      <option key={region.id} value={region.name}>{region.name}</option>
                    ))}
                  </select>
                  {errors.region && <span className="text-xs text-red-500 mt-1 block">{errors.region}</span>}
                </div>
                <div>
                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Sede</label>
                  <select
                    name="sede"
                    value={formData.sede}
                    onChange={handleInputChange}
                    disabled={!formData.region}
                    className={`w-full border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary disabled:opacity-60 ${errors.sede ? 'border-red-500' : 'border-roman-border'}`}
                  >
                    <option value="">Selecione...</option>
                    {availableSites.map(site => (
                      <option key={site.id} value={site.code}>{site.name}</option>
                    ))}
                  </select>
                  {errors.sede && <span className="text-xs text-red-500 mt-1 block">{errors.sede}</span>}
                </div>
              </div>
            </div>

            <div className="pb-6">
              <h3 className="font-serif text-lg text-roman-text-main mb-2">Fotos do Problema</h3>
              <p className="text-xs text-roman-text-sub mb-4">
                Anexe pelo menos uma foto de perto e uma de longe para facilitar a identificação.
              </p>
              <div
                className="border-2 border-dashed border-roman-border rounded-sm p-8 text-center bg-roman-bg hover:bg-roman-border-light transition-colors cursor-pointer relative"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />
                <ImageIcon size={32} className="mx-auto text-roman-primary mb-3" />
                {files.length > 0 ? (
                  <div className="text-roman-text-main font-medium text-sm mb-1">
                    {files.length} arquivo(s) selecionado(s)
                  </div>
                ) : (
                  <>
                    <div className="text-roman-text-main font-medium text-sm mb-1">
                      Clique para selecionar ou arraste as fotos
                    </div>
                    <div className="text-xs text-roman-text-sub">Apenas arquivos de imagem (JPG, PNG)</div>
                  </>
                )}
              </div>
              {files.length > 0 && (
                <div className="mt-2 space-y-1">
                  {files.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 text-xs text-roman-text-sub">
                      <FileText size={12} /> {file.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {submitError && (
              <div className="rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {submitError}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full bg-roman-primary hover:bg-roman-primary-hover text-white py-4 rounded-sm font-serif tracking-wide text-base transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {isSubmitting
                ? <Loader2 size={20} className="animate-spin" />
                : <>Registrar Ordem de Serviço <ArrowRight size={20} /></>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
