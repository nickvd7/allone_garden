/**
 * GradendexPanel — in-game hub: wiki, plant recognition, gradendex reference
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import GradendexView from './GradendexView';
import ContentWikiPage from './ContentWikiPage';
import PlantRecognitionModal from './PlantRecognitionModal';

function GradendexPanel({ token = null, onClose, onPlantIdentified }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('wiki');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const tabs = [
    { id: 'wiki', label: t('gardendex_hub.wiki'), icon: '📚' },
    { id: 'recognize', label: t('gardendex_hub.recognize'), icon: '📷' },
    { id: 'dex', label: t('gardendex_hub.dex'), icon: '📖' },
  ];

  return (
    <div
      className="gardendex-hub-overlay"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={t('gardendex_hub.title')}
    >
      <div className="gardendex-hub-panel">
        <div className="gardendex-hub-panel__header">
          <div className="gardendex-hub-panel__title">
            <span aria-hidden>🌿</span>
            <span>{t('gardendex_hub.title')}</span>
          </div>
          <div className="gardendex-hub-panel__header-actions">
            <a
              href="/gradendex"
              target="_blank"
              rel="noopener noreferrer"
              className="gardendex-hub-panel__link"
              title={t('gradendex.page.open_full_title', { defaultValue: 'Open full page' })}
            >
              {t('gradendex.page.open_full', { defaultValue: '↗ Full page' })}
            </a>
            <button type="button" className="gardendex-hub-panel__close" onClick={onClose} aria-label={t('gradendex.page.close', { defaultValue: 'Close' })}>
              ✕
            </button>
          </div>
        </div>

        <div className="gardendex-hub-tabs" role="tablist">
          {tabs.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`gardendex-hub-tab${tab === id ? ' gardendex-hub-tab--active' : ''}`}
              onClick={() => setTab(id)}
            >
              <span aria-hidden>{icon}</span> {label}
            </button>
          ))}
        </div>

        <div className="gardendex-hub-panel__body">
          <div className="gardendex-hub-tab-panels">
            <div className="gardendex-hub-tab-panel" hidden={tab !== 'wiki'} aria-hidden={tab !== 'wiki'}>
              <ContentWikiPage />
            </div>
            <div className="gardendex-hub-tab-panel" hidden={tab !== 'recognize'} aria-hidden={tab !== 'recognize'}>
              <PlantRecognitionModal
                embedded
                onClose={onClose}
                onPlantIdentified={(slug) => {
                  onPlantIdentified?.(slug);
                  onClose();
                }}
              />
            </div>
            <div className="gardendex-hub-tab-panel" hidden={tab !== 'dex'} aria-hidden={tab !== 'dex'}>
              <GradendexView token={token} compact />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GradendexPanel;
