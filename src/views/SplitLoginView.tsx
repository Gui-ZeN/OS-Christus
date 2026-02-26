import React, { useState, useRef } from 'react';
import { Landmark, ArrowRight, Loader2, CheckCircle, Lock, FileText, ImageIcon, AlertCircle } from 'lucide-react';

export function SplitLoginView({ onLogin }: { onLogin: () => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Login Form State
  const [loginEmail, setLoginEmail] = useState('rafael@empresa.com');
  const [loginPassword, setLoginPassword] = useState('12345678');

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    description: '',
    type: '',
    sector: '',
    region: '',
    sede: ''
  });
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogin = () => {
    setIsLoading(true);
    setTimeout(onLogin, 1500);
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Nome é obrigatório';
    if (!formData.email.trim()) newErrors.email = 'E-mail é obrigatório';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'E-mail inválido';
    
    if (!formData.subject.trim()) newErrors.subject = 'Assunto é obrigatório';
    if (!formData.description.trim()) newErrors.description = 'Descrição é obrigatória';
    if (!formData.type) newErrors.type = 'Selecione o tipo';
    if (!formData.sector.trim()) newErrors.sector = 'Setor é obrigatório';
    if (!formData.region) newErrors.region = 'Selecione a região';
    if (!formData.sede) newErrors.sede = 'Selecione a sede';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSubmitted(true);
      setFormData({
        name: '',
        email: '',
        subject: '',
        description: '',
        type: '',
        sector: '',
        region: '',
        sede: ''
      });
      setFiles([]);
    }, 2000);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  return (
    <div className="h-screen w-full flex overflow-hidden bg-roman-bg">
      {/* Left Side: Public Form */}
      <div className="w-1/2 h-full overflow-y-auto border-r border-roman-border bg-roman-surface relative">
        <div className="p-12 max-w-2xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center gap-3 text-roman-primary mb-4">
              <Landmark size={32} strokeWidth={1.5} />
              <h1 className="text-2xl font-serif text-roman-text-main">Nova Ordem de Serviço</h1>
            </div>
            <p className="text-roman-text-sub font-serif italic">Preencha os dados abaixo para solicitar uma manutenção.</p>
          </div>

          {isSubmitted ? (
            <div className="bg-roman-bg border border-roman-border p-10 rounded-sm shadow-sm text-center animate-in fade-in">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle size={32} />
              </div>
              <h2 className="text-2xl font-serif text-roman-text-main mb-2">OS Registrada com Sucesso!</h2>
              <p className="text-roman-text-sub mb-6 leading-relaxed">
                Sua solicitação foi enviada para a equipe de triagem. O número da sua OS é <strong className="text-roman-text-main">#OS-0051</strong>.
              </p>
              <div className="bg-roman-surface border border-roman-border p-4 rounded-sm mb-8 text-left">
                <p className="text-xs text-roman-text-sub font-serif italic mb-2">Enviamos um link de acompanhamento para o seu e-mail. Você também pode acessar por aqui:</p>
                <div className="text-roman-primary font-mono text-xs break-all bg-roman-primary/5 p-2 border border-roman-primary/20 rounded-sm">
                  sistema.com/acompanhar/a7b2c9...
                </div>
              </div>
              <button onClick={() => setIsSubmitted(false)} className="w-full bg-roman-sidebar hover:bg-stone-900 text-white py-3 rounded-sm font-medium transition-colors">
                Abrir Nova OS
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Identificação */}
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
                    {errors.name && <span className="text-xs text-red-500 mt-1">{errors.name}</span>}
                  </div>
                  <div>
                    <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Seu E-mail (Para receber o link)</label>
                    <input 
                      type="email" 
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="joao@empresa.com" 
                      className={`w-full border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary ${errors.email ? 'border-red-500' : 'border-roman-border'}`} 
                    />
                    {errors.email && <span className="text-xs text-red-500 mt-1">{errors.email}</span>}
                  </div>
                </div>
              </div>

              {/* Dados do Problema */}
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
                  {errors.subject && <span className="text-xs text-red-500 mt-1">{errors.subject}</span>}
                </div>

                <div>
                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Descrição Curta (Até 10 palavras)</label>
                  <textarea 
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Resuma o problema brevemente..." 
                    className={`w-full h-20 border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary resize-none ${errors.description ? 'border-red-500' : 'border-roman-border'}`}
                  ></textarea>
                  {errors.description && <span className="text-xs text-red-500 mt-1">{errors.description}</span>}
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
                    {errors.type && <span className="text-xs text-red-500 mt-1">{errors.type}</span>}
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
                    {errors.sector && <span className="text-xs text-red-500 mt-1">{errors.sector}</span>}
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
                      <option value="Região Dionísio Torres">Região Dionísio Torres</option>
                      <option value="Região Sul">Região Sul</option>
                      <option value="Região Aldeota">Região Aldeota</option>
                      <option value="Região Benfica">Região Benfica</option>
                      <option value="Região Parquelândia">Região Parquelândia</option>
                    </select>
                    {errors.region && <span className="text-xs text-red-500 mt-1">{errors.region}</span>}
                  </div>
                  <div>
                    <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Sede</label>
                    <select 
                      name="sede"
                      value={formData.sede}
                      onChange={handleInputChange}
                      className={`w-full border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary ${errors.sede ? 'border-red-500' : 'border-roman-border'}`}
                    >
                      <option value="">Selecione...</option>
                      <option value="DT1">DT1</option>
                      <option value="SUL1">SUL1</option>
                      <option value="BS">BS</option>
                      <option value="BEN1">BEN1</option>
                      <option value="PQL1">PQL1</option>
                    </select>
                    {errors.sede && <span className="text-xs text-red-500 mt-1">{errors.sede}</span>}
                  </div>
                </div>
              </div>

              {/* Fotos */}
              <div className="pb-6">
                <h3 className="font-serif text-lg text-roman-text-main mb-4">Fotos do Problema</h3>
                <p className="text-xs text-roman-text-sub mb-4">Anexe pelo menos uma foto de perto e uma de longe para facilitar a identificação.</p>
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
                      <div className="text-roman-text-main font-medium text-sm mb-1">Clique para selecionar ou arraste as fotos</div>
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

              <button 
                onClick={handleSubmit} 
                disabled={isSubmitting}
                className="w-full bg-roman-primary hover:bg-roman-primary-hover text-white py-4 rounded-sm font-serif tracking-wide text-base transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {isSubmitting ? <Loader2 size={20} className="animate-spin" /> : <>Registrar Ordem de Serviço <ArrowRight size={20} /></>}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right Side: Admin Login */}
      <div className="w-1/2 h-full bg-roman-bg flex items-center justify-center relative overflow-hidden">
        {/* Decorative Background Elements */}
        <div className="absolute top-0 left-0 w-full h-1 bg-roman-primary"></div>
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-roman-surface rounded-full border border-roman-border opacity-50"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-roman-surface rounded-full border border-roman-border opacity-50"></div>

        <div className="w-full max-w-md bg-roman-surface border border-roman-border p-10 rounded-sm shadow-xl relative z-10">
          <div className="flex justify-center mb-6 text-roman-primary">
            <Lock size={48} strokeWidth={1.5} />
          </div>
          <h2 className="text-3xl font-serif text-center text-roman-text-main mb-2">Acesso Restrito</h2>
          <p className="text-center text-roman-text-sub font-serif italic mb-8">Painel de Gestão e Triagem</p>

          <div className="space-y-5">
            <div>
              <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Identificação (E-mail)</label>
              <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} className="w-full border border-roman-border rounded-sm px-4 py-3 bg-roman-bg text-[14px] font-medium text-roman-text-main outline-none focus:border-roman-primary transition-colors" />
            </div>
            <div>
              <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Código de Acesso (Senha)</label>
              <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} className="w-full border border-roman-border rounded-sm px-4 py-3 bg-roman-bg text-[14px] font-medium text-roman-text-main outline-none focus:border-roman-primary transition-colors" />
            </div>
            <button onClick={handleLogin} disabled={isLoading} className="w-full bg-roman-sidebar hover:bg-stone-900 text-white py-3 rounded-sm font-serif tracking-wide text-base transition-colors flex items-center justify-center gap-2 mt-4 disabled:opacity-70">
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <>Acessar o Sistema <ArrowRight size={18} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
