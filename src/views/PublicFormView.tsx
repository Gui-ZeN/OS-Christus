import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Landmark, ArrowRight, ArrowLeft, Loader2, CheckCircle, FileText, ImageIcon, X, ChevronDown } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Ticket, HistoryItem } from '../types';
import { TICKET_STATUS } from '../constants/ticketStatus';
import { notifyTicketCreated } from '../services/ticketEmail';
import {
  CatalogMacroService,
  CatalogRegion,
  CatalogServiceItem,
  CatalogSite,
  fetchCatalog,
} from '../services/catalogApi';
import { mensagemDeErro } from '../utils/errorMessage';
import {
  getPublicFormSubmitError,
  parseEmailList,
  selecionarImagens,
} from './publicForm/regras';
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
    interestedEmails: '',
    subject: '',
    description: '',
    type: '',
    macroServiceId: '',
    serviceCatalogId: '',
    sector: '',
    location: '',
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
  // Sem isto a falha do catálogo era MUDA: os selects de região/sede ficavam vazios,
  // o usuário preenchia tudo e só recebia "Selecione a região" — sem nada para
  // selecionar e sem entender o porquê.
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogReloadKey, setCatalogReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    (async () => {
      try {
        const catalog = await fetchCatalog();
        if (!cancelled) {
          setCatalogRegions(catalog.regions);
          setCatalogSites(catalog.sites);
          setCatalogMacroServices(catalog.macroServices);
          setCatalogServiceItems(catalog.serviceCatalog);
          setCatalogFailed(false);
        }
      } catch {
        if (!cancelled) {
          setCatalogRegions([]);
          setCatalogSites([]);
          setCatalogMacroServices([]);
          setCatalogServiceItems([]);
          setCatalogFailed(true);
        }
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [catalogReloadKey]);

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

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Nome é obrigatório';
    if (!formData.email.trim()) newErrors.email = 'E-mail é obrigatório';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'E-mail inválido';
    const invalidInterestedEmail = parseEmailList(formData.interestedEmails).invalid[0];
    if (invalidInterestedEmail) newErrors.interestedEmails = `E-mail inválido: ${invalidInterestedEmail}`;
    if (!formData.subject.trim()) newErrors.subject = 'Assunto é obrigatório';
    if (!formData.description.trim()) newErrors.description = 'Descrição é obrigatória';
    if (!formData.sector.trim()) newErrors.sector = 'Local é obrigatório';
    if (!formData.location.trim()) newErrors.location = 'Detalhe do local é obrigatório';
    if (!formData.region) newErrors.region = 'Selecione a região';
    if (!formData.sede) newErrors.sede = 'Selecione a sede';
    setErrors(newErrors);
    const firstInvalidField = Object.keys(newErrors)[0];
    if (firstInvalidField) {
      const fieldId: Record<string, string> = {
        name: 'pf-name',
        email: 'pf-email',
        interestedEmails: 'pf-interested-emails',
        subject: 'pf-subject',
        description: 'pf-description',
        sector: 'pf-sector',
        location: 'pf-location',
        region: 'pf-region',
        sede: 'pf-sede',
      };
      requestAnimationFrame(() => document.getElementById(fieldId[firstInvalidField])?.focus());
    }
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (!validateForm()) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const now = new Date();
      const selectedRegion = catalogRegions.find(region => region.name === formData.region) || null;
      const selectedSite = availableSites.find(site => site.code === formData.sede) || null;
      const interestedEmails = parseEmailList(formData.interestedEmails).valid
        .filter(email => email !== formData.email.trim().toLowerCase());
      const draftTicket: Ticket = {
        id: '',
        trackingToken: '',
        subject: formData.subject,
        requester: formData.name,
        requesterEmail: formData.email,
        requesterCcEmails: interestedEmails,
        time: now,
        status: TICKET_STATUS.NEW,
        type: formData.type || 'Não informado',
        macroServiceId: selectedMacroService?.id,
        macroServiceName: selectedMacroService?.name,
        serviceCatalogId: selectedServiceItem?.id,
        serviceCatalogName: selectedServiceItem?.name,
        regionId: selectedRegion?.id,
        region: formData.region,
        siteId: selectedSite?.id,
        sede: formData.sede,
        sector: formData.sector,
        location: formData.location,
        priority: 'Trivial',
        history: [
          { id: crypto.randomUUID(), type: 'customer', sender: formData.name, time: now, text: formData.description },
          { id: crypto.randomUUID(), type: 'system', sender: 'Sistema', time: now, text: 'Solicitação registrada via formulário público. Aguardando triagem.' },
        ] as HistoryItem[],
      };
      const createdTicket = await addTicket(draftTicket, files);
      void notifyTicketCreated(createdTicket);
      setCreatedId(createdTicket.id);
      setCreatedToken(createdTicket.trackingToken);
      setIsSubmitting(false);
      setIsSubmitted(true);
      setFormData({
        name: '',
        email: '',
        interestedEmails: '',
        subject: '',
        description: '',
        type: '',
        macroServiceId: '',
        serviceCatalogId: '',
        sector: '',
        location: '',
        region: '',
        sede: '',
      });
      setFiles([]);
    } catch (error) {
      setSubmitError(getPublicFormSubmitError(mensagemDeErro(error, '')));
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

  const addFiles = (incoming: File[]) => {
    // A regra mora em `publicForm/regras`: dentro daqui ela só era alcançável
    // clicando na tela, e por isso as cinco condições dela não tinham teste.
    const { aceitas, erro: fileError } = selecionarImagens(files, incoming);
    const accepted = aceitas as File[];

    if (accepted.length > 0) setFiles(current => [...current, ...accepted]);
    setErrors(current => {
      const updated = { ...current };
      if (fileError) updated.files = fileError;
      else delete updated.files;
      return updated;
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files || []));
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(current => current.filter((_, currentIndex) => currentIndex !== index));
    setErrors(current => {
      const updated = { ...current };
      delete updated.files;
      return updated;
    });
  };

  return (
    <div className="h-screen w-full bg-roman-surface overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-10 md:py-12">
        <div className="mb-10">
          <button
            onClick={onBack}
            className="mb-8 flex min-h-11 items-center gap-2 text-sm text-roman-text-sub transition-colors hover:text-roman-text-main group"
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
            <div className="w-16 h-16 bg-roman-success/12 text-roman-success rounded-full flex items-center justify-center mx-auto mb-6">
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
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => {
                  setIsSubmitted(false);
                  setCreatedId('');
                  setCreatedToken('');
                }}
                className="min-h-11 flex-1 bg-roman-sidebar hover:bg-roman-sidebar-light text-white py-3 rounded-sm font-medium transition-colors"
              >
                Abrir Nova OS
              </button>
              <button
                onClick={onBack}
                className="min-h-11 flex-1 border border-roman-border hover:bg-roman-bg text-roman-text-main py-3 rounded-sm font-medium transition-colors"
              >
                Página Inicial
              </button>
            </div>
          </div>
        ) : (
          <form
            className="[&_input]:min-h-11 [&_select]:min-h-11 [&_textarea]:min-h-11"
            onSubmit={event => {
              event.preventDefault();
              void handleSubmit();
            }}
            noValidate
          >
          <div className="space-y-8">
            {catalogFailed && (
              <div
                role="alert"
                className="rounded-xl border border-roman-primary/35 bg-roman-primary/12 px-4 py-3 text-sm text-roman-text-main"
              >
                <p className="font-medium">Não foi possível carregar a lista de unidades.</p>
                <p className="mt-1 text-xs">
                  Sem ela não dá para escolher região e sede. Verifique sua conexão e tente de novo — o
                  que você já preencheu será mantido.
                </p>
                <button
                  type="button"
                  onClick={() => setCatalogReloadKey(key => key + 1)}
                  disabled={catalogLoading}
                  className="mt-2 inline-flex min-h-11 items-center rounded-sm border border-roman-primary/35 px-4 text-sm font-medium text-roman-text-main hover:bg-roman-primary/12 disabled:opacity-60"
                >
                  {catalogLoading ? 'Carregando…' : 'Tentar novamente'}
                </button>
              </div>
            )}
            <div className="pb-6 border-b border-roman-border">
              <h3 className="font-serif text-lg text-roman-text-main mb-4">Sua Identificação</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="pf-name" className="block text-[11px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Seu Nome</label>
                  <input
                    id="pf-name"
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="Ex: João Silva"
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? 'pf-name-error' : undefined}
                    className={`w-full border rounded-sm px-3 py-2 bg-roman-bg text-sm font-medium text-roman-text-main outline-none focus:border-roman-primary ${errors.name ? 'border-roman-danger/35' : 'border-roman-border'}`}
                  />
                  {errors.name && <span id="pf-name-error" role="alert" className="text-xs text-roman-danger mt-1 block">{errors.name}</span>}
                </div>
                <div>
                  <label htmlFor="pf-email" className="block text-[11px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Seu E-mail (Para receber o link)</label>
                  <input
                    id="pf-email"
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="nome@dominio.com"
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? 'pf-email-error' : undefined}
                    className={`w-full border rounded-sm px-3 py-2 bg-roman-bg text-sm font-medium text-roman-text-main outline-none focus:border-roman-primary ${errors.email ? 'border-roman-danger/35' : 'border-roman-border'}`}
                  />
                  {errors.email && <span id="pf-email-error" role="alert" className="text-xs text-roman-danger mt-1 block">{errors.email}</span>}
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="pf-interested-emails" className="block text-[11px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Pessoas interessadas na OS (opcional)</label>
                  <textarea
                    id="pf-interested-emails"
                    name="interestedEmails"
                    value={formData.interestedEmails}
                    onChange={handleInputChange}
                    placeholder={`email1@dominio.com, email2@dominio.com\nou um e-mail por linha`}
                    aria-invalid={Boolean(errors.interestedEmails)}
                    aria-describedby="pf-interested-emails-help"
                    className={`w-full h-20 border rounded-sm px-3 py-2 bg-roman-bg text-sm font-medium text-roman-text-main outline-none focus:border-roman-primary resize-none ${errors.interestedEmails ? 'border-roman-danger/35' : 'border-roman-border'}`}
                  />
                  {errors.interestedEmails ? (
                    <span id="pf-interested-emails-help" role="alert" className="text-xs text-roman-danger mt-1 block">{errors.interestedEmails}</span>
                  ) : (
                    <span id="pf-interested-emails-help" className="mt-1 block text-xs text-roman-text-sub">Separe por vírgula ou coloque um e-mail por linha. Essas pessoas receberão as atualizações públicas junto com o solicitante.</span>
                  )}
                </div>
              </div>
            </div>

            <div className="pb-6 border-b border-roman-border space-y-4">
              <h3 className="font-serif text-lg text-roman-text-main mb-4">Dados do Problema</h3>

              <div>
                <label htmlFor="pf-subject" className="block text-[11px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Assunto (Apenas 1 problema por formulário)</label>
                <input
                  id="pf-subject"
                  type="text"
                  name="subject"
                  value={formData.subject}
                  onChange={handleInputChange}
                  placeholder="Ex: Lâmpada queimada na recepção"
                  aria-invalid={Boolean(errors.subject)}
                  aria-describedby={errors.subject ? 'pf-subject-error' : undefined}
                  className={`w-full border rounded-sm px-3 py-2 bg-roman-bg text-sm font-medium text-roman-text-main outline-none focus:border-roman-primary ${errors.subject ? 'border-roman-danger/35' : 'border-roman-border'}`}
                />
                {errors.subject && <span id="pf-subject-error" role="alert" className="text-xs text-roman-danger mt-1 block">{errors.subject}</span>}
              </div>

              <div>
                <label htmlFor="pf-description" className="block text-[11px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Descrição Curta</label>
                <textarea
                  id="pf-description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Resuma o problema brevemente..."
                  aria-invalid={Boolean(errors.description)}
                  aria-describedby={errors.description ? 'pf-description-error' : undefined}
                  className={`w-full h-20 border rounded-sm px-3 py-2 bg-roman-bg text-sm font-medium text-roman-text-main outline-none focus:border-roman-primary resize-none ${errors.description ? 'border-roman-danger/35' : 'border-roman-border'}`}
                />
                {errors.description && <span id="pf-description-error" role="alert" className="text-xs text-roman-danger mt-1 block">{errors.description}</span>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="pf-sector" className="block text-[11px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Local</label>
                  <input
                    id="pf-sector"
                    type="text"
                    name="sector"
                    value={formData.sector}
                    onChange={handleInputChange}
                    placeholder="Ex: Recepção, Infantil, Coordenação"
                    aria-invalid={Boolean(errors.sector)}
                    aria-describedby={errors.sector ? 'pf-sector-error' : undefined}
                    className={`w-full border rounded-sm px-3 py-2 bg-roman-bg text-sm font-medium text-roman-text-main outline-none focus:border-roman-primary ${errors.sector ? 'border-roman-danger/35' : 'border-roman-border'}`}
                  />
                  {errors.sector && <span id="pf-sector-error" role="alert" className="text-xs text-roman-danger mt-1 block">{errors.sector}</span>}
                </div>
                <div>
                  <label htmlFor="pf-location" className="block text-[11px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Detalhe do local</label>
                  <input
                    id="pf-location"
                    type="text"
                    name="location"
                    value={formData.location}
                    onChange={handleInputChange}
                    placeholder="Ex: Bloco A, sala 12, corredor"
                    aria-invalid={Boolean(errors.location)}
                    aria-describedby={errors.location ? 'pf-location-error' : undefined}
                    className={`w-full border rounded-sm px-3 py-2 bg-roman-bg text-sm font-medium text-roman-text-main outline-none focus:border-roman-primary ${errors.location ? 'border-roman-danger/35' : 'border-roman-border'}`}
                  />
                  {errors.location && <span id="pf-location-error" role="alert" className="text-xs text-roman-danger mt-1 block">{errors.location}</span>}
                </div>
                <div>
                  <label htmlFor="pf-region" className="block text-[11px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Região</label>
                  <select
                    id="pf-region"
                    name="region"
                    value={formData.region}
                    onChange={handleInputChange}
                    aria-invalid={Boolean(errors.region)}
                    aria-describedby={errors.region ? 'pf-region-error' : undefined}
                    className={`w-full border rounded-sm px-3 py-2 bg-roman-bg text-sm font-medium text-roman-text-main outline-none focus:border-roman-primary ${errors.region ? 'border-roman-danger/35' : 'border-roman-border'}`}
                  >
                    <option value="">Selecione...</option>
                    {catalogRegions.map(region => (
                      <option key={region.id} value={region.name}>{region.name}</option>
                    ))}
                  </select>
                  {errors.region && <span id="pf-region-error" role="alert" className="text-xs text-roman-danger mt-1 block">{errors.region}</span>}
                </div>
                <div>
                  <label htmlFor="pf-sede" className="block text-[11px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Sede</label>
                  <select
                    id="pf-sede"
                    name="sede"
                    value={formData.sede}
                    onChange={handleInputChange}
                    disabled={!formData.region}
                    aria-invalid={Boolean(errors.sede)}
                    aria-describedby={errors.sede ? 'pf-sede-error' : undefined}
                    className={`w-full border rounded-sm px-3 py-2 bg-roman-bg text-sm font-medium text-roman-text-main outline-none focus:border-roman-primary disabled:opacity-60 ${errors.sede ? 'border-roman-danger/35' : 'border-roman-border'}`}
                  >
                    <option value="">Selecione...</option>
                    {availableSites.map(site => (
                      <option key={site.id} value={site.code}>{site.name}</option>
                    ))}
                  </select>
                  {errors.sede && <span id="pf-sede-error" role="alert" className="text-xs text-roman-danger mt-1 block">{errors.sede}</span>}
                </div>
              </div>

              <details className="group rounded-sm border border-roman-border bg-roman-bg">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium text-roman-text-main">
                  Classificação opcional
                  <ChevronDown size={16} className="shrink-0 text-roman-text-sub transition-transform group-open:rotate-180" />
                </summary>
                <div className="grid grid-cols-1 gap-4 border-t border-roman-border px-4 py-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="pf-type" className="block text-[11px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Tipo de manutenção</label>
                    <select
                      id="pf-type"
                      name="type"
                      value={formData.type}
                      onChange={handleInputChange}
                      className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-surface text-sm font-medium text-roman-text-main outline-none focus:border-roman-primary"
                    >
                      <option value="">Não sei informar</option>
                      <option value="Corretiva">Corretiva (Conserto)</option>
                      <option value="Preventiva">Preventiva</option>
                      <option value="Melhoria">Melhoria</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="pf-macroservice" className="block text-[11px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Macroserviço</label>
                    <select
                      id="pf-macroservice"
                      name="macroServiceId"
                      value={formData.macroServiceId}
                      onChange={handleInputChange}
                      className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-surface text-sm font-medium text-roman-text-main outline-none focus:border-roman-primary"
                    >
                      <option value="">Não sei informar</option>
                      {catalogMacroServices.map(item => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor="pf-service" className="block text-[11px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Serviço</label>
                    <select
                      id="pf-service"
                      name="serviceCatalogId"
                      value={formData.serviceCatalogId}
                      onChange={handleInputChange}
                      disabled={!formData.macroServiceId}
                      className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-surface text-sm font-medium text-roman-text-main outline-none focus:border-roman-primary disabled:opacity-60"
                    >
                      <option value="">Não sei informar</option>
                      {availableServiceItems.map(item => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </details>
            </div>

            <div className="pb-6">
              <h3 className="font-serif text-lg text-roman-text-main mb-2">Fotos do Problema</h3>
              <p className="text-xs text-roman-text-sub mb-4">
                Se possível, envie uma foto de perto e outra de longe. Máximo de 10 imagens, 10 MB cada e 25 MB no total.
              </p>
              <button
                type="button"
                className="w-full border-2 border-dashed border-roman-border rounded-sm p-8 text-center bg-roman-bg hover:bg-roman-border-light transition-colors cursor-pointer relative"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={event => event.preventDefault()}
                onDrop={event => {
                  event.preventDefault();
                  addFiles(Array.from(event.dataTransfer.files || []));
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                aria-label="Selecionar ou soltar fotos do problema"
              >
                <input
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.webp,.heic,.heif"
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
              </button>
              {files.length > 0 && (
                <div className="mt-2 space-y-1">
                  {files.map((file, index) => (
                    <div key={`${file.name}-${file.lastModified}-${index}`} className="flex min-h-11 items-center gap-2 rounded-sm border border-roman-border bg-roman-bg px-3 text-xs text-roman-text-sub">
                      <FileText size={14} className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center text-roman-text-sub hover:text-roman-danger"
                        title={`Remover ${file.name}`}
                        aria-label={`Remover ${file.name}`}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {errors.files && <span role="alert" className="mt-2 block text-xs text-roman-danger">{errors.files}</span>}
            </div>

            {submitError && (
              <div role="alert" className="rounded-sm border border-roman-danger/35 bg-roman-danger/12 px-4 py-3 text-sm text-roman-danger">
                {submitError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-roman-primary hover:bg-roman-primary-hover text-roman-on-primary py-4 rounded-sm font-serif tracking-wide text-base transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {isSubmitting
                ? <Loader2 size={20} className="animate-spin" />
                : <>Registrar Ordem de Serviço <ArrowRight size={20} /></>}
            </button>
          </div>
          </form>
        )}
      </div>
    </div>
  );
}
