import React from 'react';
import { useTranslation } from 'react-i18next';
import { PUBLIC_CONTACT_EMAIL } from '../siteMode';
import appLogo from '../assets/allone-garden-logo-transparent.png';
import './UnderConstruction.css';

function UnderConstruction() {
  const { t } = useTranslation();

  return (
    <div className="auth-backdrop">
      <div className="auth-card construction-card">
        <a href="/home" className="construction-logo-link">
          <img src={appLogo} alt={t('app_title')} className="construction-logo" />
        </a>
        <p className="construction-kicker">Under construction</p>
        <h1 className="construction-title">{t('construction.title')}</h1>
        <p className="construction-body">{t('construction.body')}</p>
        <p className="construction-login">
          {t('construction.login_label')}
          {' '}
          <a href={`mailto:${PUBLIC_CONTACT_EMAIL}`}>{PUBLIC_CONTACT_EMAIL}</a>
        </p>
        <a className="construction-back" href="/home">{t('construction.back_home')}</a>
      </div>
    </div>
  );
}

export default UnderConstruction;
