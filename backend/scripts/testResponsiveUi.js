/**
 * Phase 29 responsive UI structural checks (no browser required).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../frontend/src');

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function run() {
  console.log('Phase 29 responsive UI checks\n');

  const layoutJs = read('components/Layout.js');
  const layoutCss = read('components/Layout.css');
  const perms = read('config/permissions.js');

  assert(layoutJs.includes('sidebarCollapsed'), 'Collapsible sidebar state');
  assert(layoutJs.includes('mobileOpen'), 'Mobile drawer state');
  assert(layoutJs.includes('breadcrumbs'), 'Breadcrumbs in layout');
  assert(layoutJs.includes('global-search') || layoutJs.includes('Search modules'), 'Global search');
  assert(layoutJs.includes('branch-selector') || layoutJs.includes('Branch selector'), 'Branch selector');
  assert(layoutJs.includes('notification'), 'Notifications');
  assert(layoutJs.includes('profile'), 'User profile menu');
  assert(layoutJs.includes('Church website') || layoutJs.includes('churchWebsite'), 'Church website link');
  assert(layoutJs.includes('Logout') || layoutJs.includes('handleLogout'), 'Logout');
  assert(layoutJs.includes('canShowSidebarItem'), 'Permission-filtered sidebar');
  assert(layoutJs.includes('sidebar-backdrop'), 'Mobile backdrop');

  assert(layoutCss.includes('layout--collapsed'), 'Collapsed layout CSS');
  assert(layoutCss.includes('layout--mobile-open'), 'Mobile-open layout CSS');
  assert(layoutCss.includes('@media (max-width: 768px)'), 'Mobile breakpoint');
  assert(layoutCss.includes('@media (max-width: 1024px)'), 'Tablet breakpoint');
  assert(layoutCss.includes('min-height: 44px'), 'Touch-friendly targets');
  assert(layoutCss.includes('sidebar-backdrop'), 'Drawer backdrop styles');

  assert(perms.includes('canShowSidebarItem'), 'canShowSidebarItem exported');
  assert(perms.includes('SIDEBAR_SECTIONS'), 'Sidebar sections config');

  // Ensure filter hides (no "disabled" menu pattern in Layout)
  assert(!/sidebar-link[^>]*disabled/.test(layoutJs), 'Does not render disabled menu items');

  console.log('\nAll Phase 29 UI checks passed.');
}

run();
