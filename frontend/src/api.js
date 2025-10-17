const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');

async function jsonOrThrow(res, label) {
  let data = null;
  try {
    data = await res.json();
  } catch {
    // ignore
  }
  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      `${label}: ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data;
}

export async function getHealth() {
  const res = await fetch(`${API_URL}/health`);
  return jsonOrThrow(res, 'GET /health failed');
}

export async function postImportExcelStub() {
  // Appel sans fichier (mode stub)
  const res = await fetch(`${API_URL}/imports/excel`, { method: 'POST' });
  return jsonOrThrow(res, 'POST /imports/excel (stub) failed');
}

export async function postImportExcelFile(file) {
  // Upload réel en multipart
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_URL}/imports/excel`, { method: 'POST', body: fd });
  return jsonOrThrow(res, 'POST /imports/excel (upload) failed');
}

export async function getImportReport(id) {
  const res = await fetch(`${API_URL}/imports/${encodeURIComponent(id)}`);
  return jsonOrThrow(res, `GET /imports/${id} failed`);
}

export async function getAccounts() {
  const res = await fetch(`${API_URL}/accounts`);
  return jsonOrThrow(res, 'GET /accounts failed');
}

export async function getCategories(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.append(key, value);
    }
  });
  const query = search.toString();
  const res = await fetch(`${API_URL}/categories${query ? `?${query}` : ''}`);
  return jsonOrThrow(res, 'GET /categories failed');
}

export async function getTransactions(params = {}, options = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.append(key, value);
    }
  });
  const query = search.toString();
  const res = await fetch(`${API_URL}/transactions${query ? `?${query}` : ''}`, {
    signal: options.signal,
  });
  return jsonOrThrow(res, 'GET /transactions failed');
}
