import { useState, useEffect } from 'react';
import { useAdminStore } from '../../stores/adminStore.js';
import { useI18n } from '../../i18n/index.js';
import { AdminEffectBuilder } from './AdminEffectBuilder.js';
import { AdminCardPreview } from './AdminCardPreview.js';

const CARD_TYPES = [
  { value: 'world_era1', label: 'world_era1' },
  { value: 'world_era2', label: 'world_era2' },
  { value: 'world_era3', label: 'world_era3' },
  { value: 'era1', label: 'era1' },
  { value: 'era2', label: 'era2' },
  { value: 'era3', label: 'era3' },
  { value: 'relic', label: 'relic' },
];

export function AdminCardEditor() {
  const editingCard = useAdminStore(s => s.editingCard);
  const isNewCard = useAdminStore(s => s.isNewCard);
  const loading = useAdminStore(s => s.loading);
  const error = useAdminStore(s => s.error);
  const success = useAdminStore(s => s.success);
  const saveCard = useAdminStore(s => s.saveCard);
  const clearEditor = useAdminStore(s => s.clearEditor);
  const clearMessages = useAdminStore(s => s.clearMessages);
  const t = useI18n(s => s.t);

  const [langTab, setLangTab] = useState<'es' | 'en'>('es');
  const [form, setForm] = useState({
    card_type: 'era1',
    name: '',
    name_en: '',
    flavor_text: '',
    flavor_text_en: '',
    mechanical_text: '',
    mechanical_text_en: '',
    effects: '[]',
    sort_order: 0,
    active: 1,
  });

  useEffect(() => {
    if (editingCard) {
      setForm({
        card_type: editingCard.card_type,
        name: editingCard.name,
        name_en: editingCard.name_en,
        flavor_text: editingCard.flavor_text,
        flavor_text_en: editingCard.flavor_text_en,
        mechanical_text: editingCard.mechanical_text,
        mechanical_text_en: editingCard.mechanical_text_en,
        effects: editingCard.effects || '[]',
        sort_order: editingCard.sort_order,
        active: editingCard.active,
      });
    }
  }, [editingCard]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearMessages();
    saveCard(form);
  }

  function updateField(field: string, value: string | number) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  const parsedEffects = (() => {
    try {
      return JSON.parse(form.effects) as Array<Record<string, unknown>>;
    } catch {
      return [];
    }
  })();

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={clearEditor}
          className="p-1.5 rounded-lg hover:bg-game-surface text-text-muted hover:text-text-primary transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>
        <h1 className="text-2xl font-bold text-text-primary">
          {isNewCard ? t.admin.createCard : t.admin.editCard}
        </h1>
      </div>

      {/* Messages */}
      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-2 rounded-lg text-sm mb-4">
          {(t.admin as Record<string, string>)[success] ?? success}
        </div>
      )}
      {error && (
        <div className="bg-error-bg text-error-text px-4 py-2 rounded-lg text-sm mb-4">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form — 2 cols */}
        <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-5">
          {/* Card type + sort order + active */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-text-muted text-xs font-medium mb-1.5">{t.admin.cardType}</label>
              <select
                value={form.card_type}
                onChange={e => updateField('card_type', e.target.value)}
                className="w-full bg-game-surface/50 border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:border-game-gold/30 focus:outline-none"
              >
                {CARD_TYPES.map(ct => (
                  <option key={ct.value} value={ct.value}>
                    {(t.admin as Record<string, string>)[ct.label] ?? ct.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-text-muted text-xs font-medium mb-1.5">{t.admin.sortOrder}</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={e => updateField('sort_order', parseInt(e.target.value) || 0)}
                className="w-full bg-game-surface/50 border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:border-game-gold/30 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-text-muted text-xs font-medium mb-1.5">{t.admin.active}</label>
              <button
                type="button"
                onClick={() => updateField('active', form.active ? 0 : 1)}
                className={`w-full px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  form.active
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/10 border-red-500/20 text-red-400'
                }`}
              >
                {form.active ? t.admin.active : t.admin.inactive}
              </button>
            </div>
          </div>

          {/* Language tabs */}
          <div className="flex items-center gap-1 bg-game-surface/30 rounded-lg p-0.5 w-fit">
            <button
              type="button"
              onClick={() => setLangTab('es')}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
                langTab === 'es' ? 'bg-game-surface text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {t.admin.spanish}
            </button>
            <button
              type="button"
              onClick={() => setLangTab('en')}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
                langTab === 'en' ? 'bg-game-surface text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {t.admin.english}
            </button>
          </div>

          {/* Name */}
          <div>
            <label className="block text-text-muted text-xs font-medium mb-1.5">
              {langTab === 'es' ? t.admin.cardName : t.admin.cardNameEn}
            </label>
            <input
              type="text"
              value={langTab === 'es' ? form.name : form.name_en}
              onChange={e => updateField(langTab === 'es' ? 'name' : 'name_en', e.target.value)}
              className="w-full bg-game-surface/50 border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:border-game-gold/30 focus:outline-none"
            />
          </div>

          {/* Flavor text */}
          <div>
            <label className="block text-text-muted text-xs font-medium mb-1.5">
              {langTab === 'es' ? t.admin.flavorText : t.admin.flavorTextEn}
            </label>
            <textarea
              value={langTab === 'es' ? form.flavor_text : form.flavor_text_en}
              onChange={e => updateField(langTab === 'es' ? 'flavor_text' : 'flavor_text_en', e.target.value)}
              rows={2}
              className="w-full bg-game-surface/50 border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:border-game-gold/30 focus:outline-none resize-none"
            />
          </div>

          {/* Mechanical text */}
          <div>
            <label className="block text-text-muted text-xs font-medium mb-1.5">
              {langTab === 'es' ? t.admin.mechanicalText : t.admin.mechanicalTextEn}
            </label>
            <textarea
              value={langTab === 'es' ? form.mechanical_text : form.mechanical_text_en}
              onChange={e => updateField(langTab === 'es' ? 'mechanical_text' : 'mechanical_text_en', e.target.value)}
              rows={2}
              className="w-full bg-game-surface/50 border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:border-game-gold/30 focus:outline-none resize-none"
            />
          </div>

          {/* Effects builder */}
          <AdminEffectBuilder
            effects={parsedEffects}
            onChange={effects => updateField('effects', JSON.stringify(effects))}
          />

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || !form.name}
              className="bg-game-gold text-game-bg font-bold text-sm px-6 py-2.5 rounded-lg hover:brightness-110 transition-all disabled:opacity-40"
            >
              {isNewCard ? t.admin.createCard : t.admin.saveCard}
            </button>
            <button
              type="button"
              onClick={clearEditor}
              className="text-text-muted hover:text-text-primary text-sm font-medium px-4 py-2.5 transition-colors"
            >
              {t.admin.cancel}
            </button>
          </div>
        </form>

        {/* Preview — 1 col */}
        <div className="lg:col-span-1">
          <div className="sticky top-6">
            <h3 className="text-text-muted text-xs font-medium uppercase tracking-wider mb-3">{t.admin.preview}</h3>
            <AdminCardPreview
              cardType={form.card_type}
              name={form.name}
              nameEn={form.name_en}
              flavorText={form.flavor_text}
              flavorTextEn={form.flavor_text_en}
              mechanicalText={form.mechanical_text}
              mechanicalTextEn={form.mechanical_text_en}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
