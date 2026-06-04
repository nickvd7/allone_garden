/**
 * HelpPanel — simple help for young players (6–8) and parents.
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const TAB_IDS = ['start', 'plants', 'garden', 'village', 'tips'];

function renderText(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part
  );
}

function HelpPanel({ onClose, onStartTour }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('start');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const sections = t(`helpPanel.sections.${activeTab}`, { returnObjects: true }) || [];

  return (
    <div style={S.backdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={S.panel} role="dialog" aria-modal="true" aria-label={t('helpPanel.title')}>
        <div style={S.header}>
          <span style={S.headerTitle}>{t('helpPanel.title')}</span>
          <button
            type="button"
            onClick={onClose}
            style={S.closeBtn}
            aria-label={t('helpPanel.closeAria')}
          >
            ✕
          </button>
        </div>

        <div style={S.tabBar}>
          {TAB_IDS.map((id) => (
            <button
              key={id}
              type="button"
              style={{ ...S.tab, ...(activeTab === id ? S.tabActive : {}) }}
              onClick={() => setActiveTab(id)}
            >
              {t(`helpPanel.tabs.${id}`)}
            </button>
          ))}
        </div>

        <div style={S.body}>
          {Array.isArray(sections) && sections.map((section) => (
            <div key={section.heading} style={S.section}>
              <h4 style={S.sectionHeading}>{section.heading}</h4>
              <ul style={S.list}>
                {section.items.map((item, i) => (
                  <li key={i} style={S.listItem}>{renderText(item)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={S.footer}>
          <button type="button" style={S.tourBtn} onClick={onStartTour}>
            {t('helpPanel.tourAgain')}
          </button>
        </div>
      </div>
    </div>
  );
}

const S = {
  backdrop: {
    position:        'fixed',
    inset:             0,
    background:        'rgba(0,0,0,0.45)',
    zIndex:            7000,
    display:           'flex',
    alignItems:        'flex-start',
    justifyContent:    'center',
    overflowY:         'auto',
    WebkitOverflowScrolling: 'touch',
    padding:           'max(4.5rem, calc(env(safe-area-inset-top) + 1rem)) 1rem 1rem',
  },
  panel: {
    background:    'white',
    borderRadius:  16,
    width:         '100%',
    maxWidth:      660,
    maxHeight:     'min(90vh, calc(100vh - 5.5rem))',
    display:       'flex',
    flexDirection: 'column',
    boxShadow:     '0 16px 64px rgba(0,0,0,0.25)',
    overflow:      'hidden',
    flexShrink:    0,
  },
  header: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    padding:        '1rem 1.25rem 0.75rem',
    borderBottom:   '1px solid #f0f0f0',
    flexShrink:     0,
    background:     'white',
  },
  headerTitle: {
    fontWeight: 700,
    fontSize:   '1.1rem',
    color:      '#2e7d32',
  },
  closeBtn: {
    border:       'none',
    background:   'rgba(0,0,0,0.06)',
    borderRadius: 6,
    padding:      '0.45rem 0.75rem',
    cursor:       'pointer',
    fontSize:     '1rem',
    color:        '#555',
    lineHeight:   1,
    flexShrink:   0,
  },
  tabBar: {
    display:      'flex',
    overflowX:    'auto',
    padding:      '0.5rem 1rem 0',
    gap:          4,
    borderBottom: '2px solid #e8f5e9',
    flexShrink:   0,
    background:   'white',
  },
  tab: {
    padding:      '0.45rem 0.85rem',
    borderTop:    'none',
    borderLeft:   'none',
    borderRight:  'none',
    borderBottom: '2px solid transparent',
    background:   'none',
    borderRadius: '6px 6px 0 0',
    cursor:       'pointer',
    fontSize:     '0.82rem',
    fontWeight:   600,
    color:        '#777',
    whiteSpace:   'nowrap',
    transition:   'all 0.15s',
  },
  tabActive: {
    background:   '#e8f5e9',
    color:        '#2e7d32',
    borderBottom: '2px solid #4caf50',
  },
  body: {
    overflowY: 'auto',
    padding:   '1rem 1.25rem',
    flex:      1,
    minHeight: 0,
  },
  section: {
    marginBottom: '1.25rem',
  },
  sectionHeading: {
    margin:     '0 0 0.5rem',
    fontSize:   '0.92rem',
    color:      '#2e7d32',
    fontWeight: 700,
  },
  list: {
    margin:      0,
    paddingLeft: '1.2rem',
  },
  listItem: {
    fontSize:     '0.85rem',
    color:        '#444',
    lineHeight:   1.7,
    marginBottom: '0.2rem',
  },
  footer: {
    borderTop:      '1px solid #f0f0f0',
    padding:        '0.75rem 1.25rem',
    display:        'flex',
    justifyContent: 'flex-end',
    flexShrink:     0,
    background:     'white',
  },
  tourBtn: {
    padding:      '0.5rem 1.1rem',
    background:   '#e8f5e9',
    color:        '#2e7d32',
    border:       '1.5px solid #a5d6a7',
    borderRadius: 8,
    cursor:       'pointer',
    fontWeight:   600,
    fontSize:     '0.88rem',
  },
};

export default HelpPanel;
