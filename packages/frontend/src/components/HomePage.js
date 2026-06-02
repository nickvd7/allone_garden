import React from 'react';
import { useTranslation } from 'react-i18next';
import appLogo from '../assets/allone-garden-logo-transparent.png';
import './HomePage.css';

function HomePage() {
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];

  // Build the one-line installer command from whatever host serves this page,
  // so it always points at the right server (no hard-coded domain, no GitHub).
  const origin =
    typeof window !== 'undefined' && window.location && window.location.origin
      ? window.location.origin
      : 'https://allone.garden';
  const installCmd = `curl -fsSL ${origin}/install.sh | sudo bash`;
  const [copied, setCopied] = React.useState(false);
  const copyInstall = async () => {
    try {
      await navigator.clipboard.writeText(installCmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {
      /* clipboard unavailable — user can select the text manually */
    }
  };

  return (
    <div className="landing-page-scroll-root">
    <div className="landing-page">
      <nav className="lp-nav">
        <a className="lp-nav-logo" href="/home">
          <img src={appLogo} alt={t('app_title')} className="lp-nav-logo-img" />
        </a>
        <ul className="lp-nav-links">
          <li><a href="#features">{t('home.nav.features', { defaultValue: 'Features' })}</a></li>
          <li><a href="#game-preview">{t('home.nav.preview', { defaultValue: 'Preview' })}</a></li>
          <li><a href="#federation">{t('home.nav.federation', { defaultValue: 'Federation' })}</a></li>
          <li><a href="#community-tools">{t('home.nav.community', { defaultValue: 'Community' })}</a></li>
          <li><a href="/content-wiki">{t('home.nav.content_wiki', { defaultValue: 'Content Wiki' })}</a></li>
          <li><a href="/plugins">{t('home.nav.plugins', { defaultValue: 'Plugins' })}</a></li>
          <li><a href="#setup">{t('home.nav.setup', { defaultValue: 'Setup' })}</a></li>
          <li><a href="#open-source">{t('home.nav.open_source', { defaultValue: 'Open Source' })}</a></li>
        </ul>
        <div className="lp-nav-right">
          <select
            className="lp-lang-select"
            value={currentLang}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
            aria-label="Language"
          >
            <option value="en">EN</option>
            <option value="nl">NL</option>
          </select>
          <a className="lp-nav-cta" href="/login">{t('home.nav.get_started', { defaultValue: 'Login / Register' })}</a>
        </div>
      </nav>

      <section className="lp-hero">
        <div className="lp-hero-badge">{t('home.hero.badge', { defaultValue: 'Open Source · Decentralized · Community Owned' })}</div>
        <h1>{t('home.hero.title_line1', { defaultValue: 'Grow Together,' })}<br /><span>{t('home.hero.title_line2', { defaultValue: 'Own Your World' })}</span></h1>
        <p>
          {t('home.hero.body', { defaultValue: 'AllOne Garden is a multiplayer gardening game you can self-host on any device - Raspberry Pi, Mac, Windows PC, Linux server, or Android phone. No central server. No subscriptions. Just community, plants, and good soil.' })}
        </p>
        <div className="lp-hero-actions">
          <a className="lp-btn-primary" href="/login">{t('home.hero.login_primary', { defaultValue: 'Login / Register' })}</a>
          <a className="lp-btn-secondary" href="#setup">{t('home.hero.cta_primary', { defaultValue: 'Plant your server' })}</a>
        </div>
        <div className="lp-garden-preview" aria-hidden="true">
          <div className="lp-plot lp-plot-tilled">🌱</div>
          <div className="lp-plot lp-plot-grown">🍅</div>
          <div className="lp-plot lp-plot-grown">🥕</div>
          <div className="lp-plot lp-plot-water">💧</div>
          <div className="lp-plot lp-plot-grown">🥬</div>
          <div className="lp-plot lp-plot-tilled">🌾</div>
          <div className="lp-plot lp-plot-soil">🟫</div>
          <div className="lp-plot lp-plot-grown">🌽</div>
        </div>
      </section>

      <section id="features" className="lp-section lp-section-alt">
        <div className="lp-container">
          <p className="lp-label">Why AllOne Garden</p>
          <h2 className="lp-title">{t('home.features.title_line1', { defaultValue: 'Everything you need,' })}<br />{t('home.features.title_line2', { defaultValue: 'nothing you do not' })}</h2>
          <p className="lp-subtitle">
            {t('home.features.subtitle', { defaultValue: 'Designed from the ground up for community servers - private, fast, and fully under your control.' })}
          </p>
          <div className="lp-grid lp-grid-3x2">
            <div className="lp-card"><h3>🌍 {t('home.features.cards.decentralized.title', { defaultValue: 'Decentralized by design' })}</h3><p>{t('home.features.cards.decentralized.body', { defaultValue: 'Every server is independent. Connect with other gardens through P2P federation.' })}</p></div>
            <div className="lp-card"><h3>🔒 {t('home.features.cards.privacy.title', { defaultValue: 'Privacy first' })}</h3><p>{t('home.features.cards.privacy.body', { defaultValue: 'Your data lives on your own hardware without cloud lock-in.' })}</p></div>
            <div className="lp-card"><h3>🔌 {t('home.features.cards.plugins.title', { defaultValue: 'Plugin system' })}</h3><p>{t('home.features.cards.plugins.body', { defaultValue: 'Extend the game with community plugins - sandboxed and safe.' })}</p></div>
            <div className="lp-card"><h3>📱 {t('home.features.cards.mobile.title', { defaultValue: 'Mobile ready' })}</h3><p>{t('home.features.cards.mobile.body', { defaultValue: 'Play on iOS and Android as a Progressive Web App.' })}</p></div>
            <div className="lp-card"><h3>🌦️ {t('home.features.cards.seasons.title', { defaultValue: 'Real seasons' })}</h3><p>{t('home.features.cards.seasons.body', { defaultValue: 'Weather changes daily and affects strategy and growth.' })}</p></div>
            <div className="lp-card"><h3>🤝 {t('home.features.cards.multiplayer.title', { defaultValue: 'True multiplayer' })}</h3><p>{t('home.features.cards.multiplayer.body', { defaultValue: 'Visit neighbours, trade crops, and help with daily tasks.' })}</p></div>
          </div>
        </div>
      </section>

      <section id="game-preview" className="lp-section">
        <div className="lp-container">
          <p className="lp-label">Game Preview</p>
          <h2 className="lp-title">{t('home.preview.title_line1', { defaultValue: 'Simple to play,' })}<br />{t('home.preview.title_line2', { defaultValue: 'deep to explore' })}</h2>
          <p className="lp-subtitle">
            {t('home.preview.subtitle', { defaultValue: 'A clean web UI that feels at home in the browser, on mobile, or on a community kiosk screen.' })}
          </p>
          <div className="lp-preview">
            <div className="lp-preview-titlebar">
              <span className="lp-dot lp-dot-red" />
              <span className="lp-dot lp-dot-amber" />
              <span className="lp-dot lp-dot-green" />
              <span className="lp-preview-title-text">{t('home.preview.window_title', { defaultValue: 'AllOne Garden - Alice\'s Server · 12 players online' })}</span>
            </div>
            <div className="lp-preview-body">
              <div className="lp-preview-header">🌱 AllOne Garden</div>
              <div className="lp-preview-stats">
                <span>⭐ 420 XP</span>
                <span>🪙 350</span>
                <span>Lv 5</span>
                <span>{t('home.preview.day_weather', { defaultValue: '☁️ Day 14 - Cloudy' })}</span>
              </div>
              <div className="lp-preview-layout">
                <div className="lp-preview-garden">{t('home.preview.garden_area', { defaultValue: 'Garden area with plots and tools' })}</div>
                <div className="lp-preview-sidebar">
                  <div className="lp-mini-card">💬 {t('home.preview.chat', { defaultValue: 'Chat' })}</div>
                  <div className="lp-mini-card">🏆 {t('home.preview.leaderboard', { defaultValue: 'Leaderboard' })}</div>
                  <div className="lp-mini-card">🎒 {t('home.preview.inventory', { defaultValue: 'Inventory' })}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="federation" className="lp-section">
        <div className="lp-container">
          <p className="lp-label">P2P Federation</p>
          <h2 className="lp-title">{t('home.federation.title_line1', { defaultValue: 'Your server,' })}<br />{t('home.federation.title_line2', { defaultValue: 'connected to the world' })}</h2>
          <p className="lp-subtitle">
            {t('home.federation.subtitle', { defaultValue: 'AllOne Garden servers discover each other over the network without a central registry.' })}
          </p>
          <div className="lp-federation-visual">
            <div className="lp-server-node"><span>🏠</span>{t('home.federation.nodes.your_server', { defaultValue: 'Your Server' })}</div>
            <div className="lp-connector">⇄</div>
            <div className="lp-server-node"><span>🏫</span>{t('home.federation.nodes.school_server', { defaultValue: 'School Server' })}</div>
            <div className="lp-connector">⇄</div>
            <div className="lp-server-node"><span>🏢</span>{t('home.federation.nodes.community_hub', { defaultValue: 'Community Hub' })}</div>
            <div className="lp-connector">⇄</div>
            <div className="lp-server-node"><span>🌍</span>{t('home.federation.nodes.any_server', { defaultValue: 'Any other server' })}</div>
          </div>
          <div className="lp-grid">
            <div className="lp-card"><h3>🌐 {t('home.federation.cards.chat.title', { defaultValue: 'Cross-server chat' })}</h3><p>{t('home.federation.cards.chat.body', { defaultValue: 'Federated chat messages can be shown with source context.' })}</p></div>
            <div className="lp-card"><h3>🚜 {t('home.federation.cards.visits.title', { defaultValue: 'Garden visits' })}</h3><p>{t('home.federation.cards.visits.body', { defaultValue: 'Visit gardens on other servers and help with crops.' })}</p></div>
            <div className="lp-card"><h3>🔒 {t('home.federation.cards.optin.title', { defaultValue: 'Opt-in only' })}</h3><p>{t('home.federation.cards.optin.body', { defaultValue: 'Federation remains optional and under server-owner control.' })}</p></div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="lp-section lp-section-alt">
        <div className="lp-container">
          <p className="lp-label">Get Started</p>
          <h2 className="lp-title">{t('home.get_started.title_line1', { defaultValue: 'Up and growing' })}<br />{t('home.get_started.title_line2', { defaultValue: 'in minutes' })}</h2>
          <div className="lp-grid">
            <div className="lp-card"><h3>{t('home.get_started.cards.step1.title', { defaultValue: '1. Pick your server device' })}</h3><p>{t('home.get_started.cards.step1.body', { defaultValue: 'Pi, spare laptop, Mac, Windows PC, or Android phone.' })}</p></div>
            <div className="lp-card"><h3>{t('home.get_started.cards.step2.title', { defaultValue: '2. Run the installer' })}</h3><p>{t('home.get_started.cards.step2.body', { defaultValue: 'One script setup for Node and related dependencies.' })}</p></div>
            <div className="lp-card"><h3>{t('home.get_started.cards.step3.title', { defaultValue: '3. Invite your friends' })}</h3><p>{t('home.get_started.cards.step3.body', { defaultValue: 'Share your URL and start planting together quickly.' })}</p></div>
            <div className="lp-card"><h3>{t('home.get_started.cards.step4.title', { defaultValue: '4. Extend with plugins' })}</h3><p>{t('home.get_started.cards.step4.body', { defaultValue: 'Community plugins can be added and managed safely.' })}</p></div>
          </div>
        </div>
      </section>

      <section id="setup" className="lp-section lp-install">
        <div className="lp-container">
          <p className="lp-label">{t('home.setup.label', { defaultValue: 'Setup & Mobile' })}</p>
          <h2 className="lp-title">{t('home.setup.title', { defaultValue: 'Install once, play everywhere' })}</h2>
          <p className="lp-subtitle">
            {t('home.setup.subtitle', { defaultValue: 'Start your server on any platform, then join instantly from desktop or phone.' })}
          </p>
          <h3 className="lp-subgroup-title">{t('home.setup.host_title', { defaultValue: 'Host your own server' })}</h3>
          <p className="lp-install-intro">
            {t('home.setup.install_intro', { defaultValue: 'One command installs a full server on a Raspberry Pi, Linux box, or Mac. It can run standalone or join this main server as an extra node.' })}
          </p>
          <div className="lp-install-cmd">
            <code>{installCmd}</code>
            <button type="button" className="lp-install-copy" onClick={copyInstall}>
              {copied
                ? t('home.setup.copied', { defaultValue: 'Copied!' })
                : t('home.setup.copy', { defaultValue: 'Copy' })}
            </button>
          </div>
          <p className="lp-install-note">
            {t('home.setup.install_note', { defaultValue: 'Requires a Debian/Ubuntu-based system (Raspberry Pi OS, Ubuntu, Debian) or macOS with Homebrew. The installer sets up HTTPS, the database, and a reverse proxy automatically.' })}
          </p>
          <div className="lp-grid lp-grid-setup">
            <div className="lp-card">
              <h3>🫐 {t('home.setup.cards.pi.title', { defaultValue: 'Raspberry Pi / Linux' })}</h3>
              <p>{t('home.setup.cards.pi.body', { defaultValue: 'Run the command above for a production-ready server with HTTPS and auto-renewing SSL.' })}</p>
            </div>
            <div className="lp-card">
              <h3>🍎 {t('home.setup.cards.macos.title', { defaultValue: 'macOS' })}</h3>
              <p>{t('home.setup.cards.macos.body', { defaultValue: 'Same one-line installer — works on macOS with Homebrew installed.' })}</p>
            </div>
            <div className="lp-card">
              <h3>🔗 {t('home.setup.cards.extra.title', { defaultValue: 'Extra server (join main)' })}</h3>
              <p>{t('home.setup.cards.extra.body', { defaultValue: 'Enable federation in the installed .env (P2P_ENABLED=true) to connect your node to this main server.' })}</p>
            </div>
            <div className="lp-card lp-card-highlight">
              <h3>💻 {t('home.setup.cards.desktop.title', { defaultValue: 'Windows / Mac desktop app' })}</h3>
              <p>{t('home.setup.cards.desktop.body', { defaultValue: 'No download needed — open this site in your browser and choose “Install app” (address-bar icon or browser menu) to get a desktop app.' })}</p>
            </div>
          </div>
          <h3 className="lp-subgroup-title">{t('home.setup.mobile_title', { defaultValue: 'Join from mobile' })}</h3>
          <div className="lp-grid lp-grid-setup-mobile">
            <div className="lp-card">
              <h3>🍎 {t('home.setup.mobile_cards.ios.title', { defaultValue: 'iOS - Safari (PWA)' })}</h3>
              <p>{t('home.setup.mobile_cards.ios.body', { defaultValue: 'Open in Safari, use Share, and choose Add to Home Screen.' })}</p>
            </div>
            <div className="lp-card">
              <h3>🤖 {t('home.setup.mobile_cards.android.title', { defaultValue: 'Android - Chrome (PWA)' })}</h3>
              <p>{t('home.setup.mobile_cards.android.body', { defaultValue: 'Use Add to Home screen or Install app from the browser menu.' })}</p>
            </div>
            <div className="lp-card lp-card-highlight">
              <h3>⚡ {t('home.setup.mobile_cards.benefits.title', { defaultValue: 'What you get' })}</h3>
              <p>{t('home.setup.mobile_cards.benefits.body', { defaultValue: 'Single setup flow, full-screen mobile UX, quick launch, and auto updates.' })}</p>
            </div>
          </div>
        </div>
      </section>

      <section id="community-tools" className="lp-section">
        <div className="lp-container">
          <p className="lp-label">{t('home.community.label', { defaultValue: 'Community & Creators' })}</p>
          <h2 className="lp-title">{t('home.community.title', { defaultValue: 'Tools outside the in-game HUD' })}</h2>
          <p className="lp-subtitle">{t('home.community.subtitle', { defaultValue: 'Content Wiki and Plugins live on the homepage, not inside the in-game header menu.' })}</p>
          <div className="lp-grid">
            <a className="lp-card" href="/gradendex">
              <h3>📖 {t('home.community.gradendex_title', { defaultValue: 'Gardendex' })}</h3>
              <p>{t('home.community.gradendex_body', { defaultValue: 'Gardendex bundles reference and wiki-like content in one place.' })}</p>
            </a>
            <a className="lp-card" href="/plugins">
              <h3>🔌 {t('home.community.plugins_title', { defaultValue: 'Plugins' })}</h3>
              <p>{t('home.community.plugins_body', { defaultValue: 'Build the online world together: create tools, plants, and features with drag-and-drop building flows.' })}</p>
            </a>
            <a className="lp-card" href="https://github.com/nickvd7/allone_garden/blob/main/README.md" target="_blank" rel="noopener noreferrer">
              <h3>🛠️ {t('home.community.docs_title', { defaultValue: 'Maker docs' })}</h3>
              <p>{t('home.community.docs_body', { defaultValue: 'Program along: clear docs to build plugins, extend gameplay, and contribute code.' })}</p>
            </a>
          </div>
        </div>
      </section>

      <section id="open-source" className="lp-section lp-section-alt">
        <div className="lp-container">
          <p className="lp-label">Open Source</p>
          <h2 className="lp-title">{t('home.opensource.title_line1', { defaultValue: 'Built in the open,' })}<br />{t('home.opensource.title_line2', { defaultValue: 'for everyone' })}</h2>
          <div className="lp-grid lp-grid-3x2">
            <div className="lp-card"><h3>⚛️ {t('home.opensource.cards.frontend.title', { defaultValue: 'React 18 Frontend' })}</h3><p>{t('home.opensource.cards.frontend.body', { defaultValue: 'Socket.IO and i18n powered UI.' })}</p></div>
            <div className="lp-card"><h3>🟩 {t('home.opensource.cards.backend.title', { defaultValue: 'Node.js Backend' })}</h3><p>{t('home.opensource.cards.backend.body', { defaultValue: 'Express API with multiplayer services.' })}</p></div>
            <div className="lp-card"><h3>🔌 {t('home.opensource.cards.plugin_api.title', { defaultValue: 'Plugin API' })}</h3><p>{t('home.opensource.cards.plugin_api.body', { defaultValue: 'Sandboxed extension architecture.' })}</p></div>
            <div className="lp-card"><h3>📱 {t('home.opensource.cards.mobile.title', { defaultValue: 'Mobile (PWA)' })}</h3><p>{t('home.opensource.cards.mobile.body', { defaultValue: 'Installable on iOS and Android.' })}</p></div>
            <div className="lp-card"><h3>🌐 {t('home.opensource.cards.federation.title', { defaultValue: 'P2P Federation' })}</h3><p>{t('home.opensource.cards.federation.body', { defaultValue: 'Community networking across servers.' })}</p></div>
            <div className="lp-card"><h3>🛡️ {t('home.opensource.cards.security.title', { defaultValue: 'Security hardened' })}</h3><p>{t('home.opensource.cards.security.body', { defaultValue: 'Rate limits, headers, and secure defaults.' })}</p></div>
          </div>
        </div>
      </section>

      <section className="lp-cta">
        <div className="lp-container">
          <h2>{t('home.cta.title', { defaultValue: 'Ready to start growing?' })}</h2>
          <p>{t('home.cta.body', { defaultValue: 'Your server, your rules, your community. No subscriptions, no central authority.' })}</p>
          <div className="lp-hero-actions">
            <a className="lp-btn-primary" href="https://github.com/nickvd7/allone_garden" target="_blank" rel="noopener noreferrer">{t('home.cta.primary', { defaultValue: 'Plant your server' })}</a>
            <a className="lp-btn-secondary" href="https://github.com/nickvd7/allone_garden/blob/main/INSTALL.md" target="_blank" rel="noopener noreferrer">{t('home.cta.secondary', { defaultValue: 'Read the docs' })}</a>
          </div>
          <div className="lp-back-wrap">
            <a href="/login" className="lp-back-link">{t('home.cta.back_login', { defaultValue: '← Back to Login' })}</a>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div>
          <a href="/home" className="lp-footer-brand">AllOne Garden</a>
          <span>{t('home.footer.community_project', { defaultValue: '© 2026 — Community project' })}</span>
        </div>
        <div className="lp-footer-links">
          <a href="https://github.com/nickvd7/allone_garden" target="_blank" rel="noopener noreferrer">{t('home.footer.github', { defaultValue: 'GitHub' })}</a>
          <a href="https://github.com/nickvd7/allone_garden/blob/main/INSTALL.md" target="_blank" rel="noopener noreferrer">{t('home.footer.docs', { defaultValue: 'Docs' })}</a>
          <a href="https://github.com/nickvd7/allone_garden/blob/main/CODE_OF_CONDUCT.md" target="_blank" rel="noopener noreferrer">{t('home.footer.code_of_conduct', { defaultValue: 'Code of Conduct' })}</a>
          <a href="https://github.com/nickvd7/allone_garden/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer">{t('home.footer.contributing', { defaultValue: 'Contributing' })}</a>
        </div>
        <div className="lp-footer-license-wrap">
          <span className="lp-footer-license">{t('home.footer.frontend_license', { defaultValue: 'Frontend: MIT' })}</span>
          <span className="lp-footer-license">{t('home.footer.backend_license', { defaultValue: 'Backend: GPL-3.0' })}</span>
        </div>
      </footer>
    </div>
    </div>
  );
}

export default HomePage;
