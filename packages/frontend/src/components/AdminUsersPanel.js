import React, { useState, useEffect, useCallback } from 'react';
import api from '../hooks/useApi';

const LANGS = [
  { code: 'nl', label: 'NL' },
  { code: 'en', label: 'EN' },
  { code: 'de', label: 'DE' },
  { code: 'fr', label: 'FR' },
  { code: 'es', label: 'ES' },
];

const emptyForm = {
  username: '',
  email: '',
  password: '',
  level: 1,
  language: 'nl',
  sendWelcomeEmail: true,
};

function AdminUsersPanel() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ level: 1, language: 'nl', coins: 0, xp: 0 });

  const load = useCallback(async (q = search) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (q.trim()) params.set('q', q.trim());
      const data = await api.get(`/api/admin/users?${params}`);
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message || 'Kon gebruikers niet laden');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3500);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/api/admin/users', form);
      setShowCreate(false);
      setForm(emptyForm);
      flash('Gebruiker aangemaakt — welkomstmail verstuurd.');
      load();
    } catch (err) {
      setError(err.message || 'Aanmaken mislukt');
    }
  };

  const startEdit = (user) => {
    setEditId(user.id);
    setEditForm({
      level: user.level,
      language: user.preferred_language || 'nl',
      coins: user.coins,
      xp: user.xp,
    });
  };

  const saveEdit = async () => {
    try {
      await api.patch(`/api/admin/users/${editId}`, {
        level: editForm.level,
        language: editForm.language,
        coins: editForm.coins,
        xp: editForm.xp,
      });
      setEditId(null);
      flash('Gebruiker bijgewerkt.');
      load();
    } catch (err) {
      setError(err.message || 'Opslaan mislukt');
    }
  };

  const sendReset = async (userId) => {
    try {
      const r = await api.post(`/api/admin/users/${userId}/send-reset`);
      flash(r.emailSent ? 'Resetmail verstuurd.' : 'Reset aangemaakt (e-mail niet geconfigureerd).');
    } catch (err) {
      setError(err.message || 'Resetmail mislukt');
    }
  };

  const toggleAdmin = async (user) => {
    const nextLevel = user.isAdmin || user.level >= 99 ? 1 : 99;
    try {
      await api.patch(`/api/admin/users/${user.id}`, { level: nextLevel });
      flash(nextLevel >= 99 ? 'Adminrechten toegekend.' : 'Adminrechten ingetrokken.');
      load();
    } catch (err) {
      setError(err.message || 'Kon rechten niet wijzigen');
    }
  };

  const removeUser = async (user) => {
    if (!window.confirm(`Gebruiker "${user.username}" definitief verwijderen?`)) return;
    try {
      await api.delete(`/api/admin/users/${user.id}`);
      flash('Gebruiker verwijderd.');
      load();
    } catch (err) {
      setError(err.message || 'Verwijderen mislukt');
    }
  };

  return (
    <div className="admin-users">
      <div className="admin-users__toolbar">
        <input
          className="admin-users__search"
          type="search"
          placeholder="Zoek op naam of e-mail…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') load(e.target.value); }}
        />
        <button type="button" className="btn btn-secondary" onClick={() => load()} disabled={loading}>
          Zoeken
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + Nieuwe gebruiker
        </button>
        <span className="admin-users__count">{total} gebruikers</span>
      </div>

      {notice && <div className="admin-users__notice" role="status">{notice}</div>}
      {error && <div className="admin-users__error" role="alert">{error}</div>}
      {loading && <div className="admin-users__loading">Laden…</div>}

      {showCreate && (
        <form className="admin-users__form card" onSubmit={handleCreate}>
          <h4>Nieuwe gebruiker</h4>
          <div className="admin-users__form-grid">
            <input required placeholder="Gebruikersnaam" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
            <input required type="email" placeholder="E-mail" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            <input required type="password" placeholder="Wachtwoord" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            <select value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}>
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            <label className="admin-users__checkbox">
              <input type="checkbox" checked={form.sendWelcomeEmail} onChange={(e) => setForm((f) => ({ ...f, sendWelcomeEmail: e.target.checked }))} />
              Welkomstmail met wachtwoord-link
            </label>
          </div>
          <div className="admin-users__form-actions">
            <button type="submit" className="btn btn-primary">Aanmaken</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Annuleren</button>
          </div>
        </form>
      )}

      {!loading && users.length === 0 && (
        <div className="admin-users__empty">Geen gebruikers gevonden.</div>
      )}

      {users.length > 0 && (
        <div className="admin-users__table-wrap">
          <table className="admin-users__table">
            <thead>
              <tr>
                {['ID', 'Gebruiker', 'E-mail', 'Taal', 'Level', 'Laatste login', 'Acties'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>
                    <strong>{u.username}</strong>
                    {(u.isAdmin || u.level >= 99) && <span className="admin-users__badge">admin</span>}
                  </td>
                  <td>{u.email}</td>
                  <td>{u.preferred_language || 'nl'}</td>
                  <td>
                    {editId === u.id ? (
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={editForm.level}
                        onChange={(e) => setEditForm((f) => ({ ...f, level: Number(e.target.value) }))}
                        style={{ width: 56 }}
                      />
                    ) : (
                      <>⭐ {u.level}</>
                    )}
                  </td>
                  <td>{u.last_login ? new Date(u.last_login).toLocaleString() : '—'}</td>
                  <td className="admin-users__actions">
                    {editId === u.id ? (
                      <>
                        <button type="button" className="btn btn-primary btn--xs" onClick={saveEdit}>Opslaan</button>
                        <button type="button" className="btn btn-secondary btn--xs" onClick={() => setEditId(null)}>Annuleer</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="btn btn-secondary btn--xs" onClick={() => startEdit(u)}>Bewerk</button>
                        <button type="button" className="btn btn-secondary btn--xs" onClick={() => toggleAdmin(u)}>
                          {(u.isAdmin || u.level >= 99) ? 'Degradeer' : 'Maak admin'}
                        </button>
                        <button type="button" className="btn btn-secondary btn--xs" onClick={() => sendReset(u.id)}>Resetmail</button>
                        <button type="button" className="btn btn-secondary btn--xs admin-users__danger" onClick={() => removeUser(u)}>Verwijder</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AdminUsersPanel;
