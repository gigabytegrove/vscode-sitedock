'use strict';
const posix = require('node:path').posix;

function normalizeRoot(raw) {
  if (typeof raw !== 'string' || raw.includes('\\') || /[\x00-\x1f\x7f]/.test(raw)) throw new Error('Invalid remote directory.');
  const root = raw.trim() || '/';
  if (!root.startsWith('/')) throw new Error('Remote directory must start with /.');
  if (root.split('/').includes('..')) throw new Error('Remote directory cannot include .. segments.');
  return posix.normalize(root);
}
function remotePath(site, virtualPath) {
  if (typeof virtualPath !== 'string' || !virtualPath.startsWith('/') || /[\x00-\x1f\x7f\\]/.test(virtualPath)) throw new Error('Invalid remote path.');
  const segments = virtualPath.split('/');
  if (segments.includes('..') || segments.includes('.')) throw new Error('Parent and dot segments are not allowed.');
  const root = normalizeRoot(site.root);
  const joined = posix.normalize(posix.join(root, virtualPath));
  const path = joined.length > 1 ? joined.replace(/\/+$/, '') : joined;
  if (root !== '/' && path !== root && !path.startsWith(root + '/')) throw new Error('Remote path is outside the selected site root.');
  return path;
}
function validName(name) {
  if (typeof name !== 'string' || !name.trim() || name === '.' || name === '..' || name.includes('/') || name.includes('\\') || /[\x00-\x1f\x7f]/.test(name)) throw new Error('Use a filename without slashes or control characters.');
  return name;
}
function safeChildPath(parent, name) { return posix.join(parent, validName(name)); }
module.exports = {normalizeRoot, remotePath, validName, safeChildPath};
