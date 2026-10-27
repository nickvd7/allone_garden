'use strict';

/**
 * Cloudflare Pages collapses a 200 rewrite to /index.html into a redirect to /.
 * Copy the built shell to each client route so /login and /register stay on
 * their own URL and the React app can show the under-construction screen.
 */
const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '..', 'build');
const indexPath = path.join(buildDir, 'index.html');
const indexHtml = fs.readFileSync(indexPath);

const routes = ['login', 'register', 'home', 'plugins', 'content-wiki', 'gradendex', 'admin'];
for (const route of routes) {
  const dir = path.join(buildDir, route);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), indexHtml);
}

const installSrc = path.join(__dirname, '..', '..', '..', 'install.sh');
if (fs.existsSync(installSrc)) {
  fs.copyFileSync(installSrc, path.join(buildDir, 'install.sh'));
}

const redirects = path.join(buildDir, '_redirects');
if (fs.existsSync(redirects)) fs.unlinkSync(redirects);
