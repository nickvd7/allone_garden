'use strict';
/**
 * proposalStore.js — in-memory store for community content proposals.
 *
 * A proposal is a request from any logged-in user to add or override a
 * game-content item (plant / structure / tool / weather).
 *
 * Admins review proposals and either approve (→ item goes live),
 * reject (→ item rejected, note explains why), or request revision
 * (→ proposal returns to pending with feedback, proposer can re-submit).
 *
 * Shape of a proposal:
 * {
 *   id:            string (uuid-like, generated here)
 *   type:          'plants' | 'structures' | 'tools' | 'weather'
 *   item:          object  (the proposed content item)
 *   submittedBy:   number  (userId)
 *   submittedByName: string
 *   status:        'pending' | 'approved' | 'rejected' | 'revision_requested'
 *   note:          string  (admin note visible to proposer)
 *   createdAt:     string  (ISO timestamp)
 *   reviewedAt:    string | null
 *   revisionCount: number  (how many times revision was requested)
 * }
 */

let proposals = [];
let nextId = 1;

function makeId() {
  return `prop_${Date.now()}_${nextId++}`;
}

module.exports = {
  /** Add a new proposal; returns the created proposal */
  add({ type, item, submittedBy, submittedByName }) {
    const proposal = {
      id:              makeId(),
      type,
      item,
      submittedBy,
      submittedByName: submittedByName || 'unknown',
      status:          'pending',
      note:            '',
      createdAt:       new Date().toISOString(),
      reviewedAt:      null,
      revisionCount:   0,
    };
    proposals.push(proposal);
    return proposal;
  },

  /** All proposals (optionally filtered by status) */
  list(status = null) {
    return status ? proposals.filter((p) => p.status === status) : [...proposals];
  },

  /** Single proposal by id */
  get(id) {
    return proposals.find((p) => p.id === id) || null;
  },

  /** Update a proposal's status + optional note; returns updated or null */
  setStatus(id, status, note = '') {
    const p = proposals.find((prop) => prop.id === id);
    if (!p) return null;
    p.status     = status;
    p.note       = note;
    p.reviewedAt = new Date().toISOString();
    if (status === 'revision_requested') {
      p.revisionCount = (p.revisionCount || 0) + 1;
    }
    return p;
  },

  /**
   * Update a proposal's item and reset it to pending status.
   * Used when a proposer re-submits after revision was requested.
   */
  update(id, { item }) {
    const p = proposals.find((prop) => prop.id === id);
    if (!p) return null;
    p.item       = item;
    p.status     = 'pending';
    p.note       = '';
    p.reviewedAt = null;
    return p;
  },

  /** Reset (used in tests) */
  clear() {
    proposals = [];
    nextId    = 1;
  },

  /** Seed from DB rows on startup */
  seed(rows) {
    proposals = rows.map((r) => ({
      revisionCount: 0,
      ...r,
    }));
    // Set nextId beyond any existing numeric suffix
    const nums = rows.map((r) => {
      const m = String(r.id).match(/_(\d+)$/);
      return m ? parseInt(m[1]) : 0;
    });
    nextId = Math.max(1, ...nums) + 1;
  },
};
