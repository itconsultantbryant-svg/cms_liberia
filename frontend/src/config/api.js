/**
 * Frontend API base URL.
 * - Local CRA: leave unset and use package.json "proxy"
 * - Vercel multi-service (same domain /api → backend): leave unset
 * - Split host (Render API): set REACT_APP_API_URL to that origin (no trailing slash)
 */
import axios from 'axios';

const raw = (process.env.REACT_APP_API_URL || '').trim().replace(/\/$/, '');

export const API_BASE_URL = raw;

/** Resolve API-relative asset paths for <img>, favicon, CSS backgrounds. */
export function assetUrl(url) {
  if (!url) return null;
  const value = String(url);
  if (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('data:') ||
    value.startsWith('blob:')
  ) {
    return value;
  }
  if (API_BASE_URL && value.startsWith('/')) {
    return `${API_BASE_URL}${value}`;
  }
  return value;
}

export function configureApiClient() {
  if (API_BASE_URL) {
    axios.defaults.baseURL = API_BASE_URL;
  }
}

export default configureApiClient;
