import { useEffect, useState } from 'react'
import Modal from '../components/Modal'
import { supabase } from '../supabase'
import { ensureDefaultUnits } from '../utils/rentalUnits'

const MAINTENANCE_STATUSES = ['Pending', 'In Progress', 'Completed', 'Cancelled']
const MAINTENANCE_TYPES = ['Electrical', 'Plumbing', 'Structural', 'Appliance', 'Cleaning', 'Other']

const emptyForm = {
  room_id: '',
  type: 'Electrical',
  description: '',
  reported_date: '',
  resolved_date: '',
  cost: '',
  status: 'Pending'
}

function statusClass(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'completed') return 'paid'
  if (s === 'in progress') return 'partial'
  if (s === 'pending') return 'pending'
  return 'inactive'
}

function Maintenance() {
  const [logs, setLogs] = useState([])
  const [rooms, setRooms] = useState([])
  const [formData, setFormData] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchRooms()
    fetchLogs()
  }, [])

  async function fetchRooms() {
    try {
      const data = await ensureDefaultUnits(supabase)
      setRooms(data || [])
    } catch (err) {
      console.error(err)
    }
  }

  async function fetchLogs() {
    const { data, error } = await supabase
      .from('maintenance_logs')
      .select('*')
      .order('reported_date', { ascending: false })

    if (error) {
      console.error(error)
      return
    }
    setLogs(data || [])
  }

  function findRoom(roomId) {
    return rooms.find((r) => String(r.id) === String(roomId))
  }

  function handleChange(e) {
    const { name, value } = e.target
    setFormData((cur) => ({ ...cur, [name]: value }))
  }

  function openAddModal() {
    setEditingId(null)
    setFormData({ ...emptyForm, reported_date: new Date().toISOString().split('T')[0] })
    setIsModalOpen(true)
  }

  function openEditModal(log) {
    setEditingId(log.id)
    setFormData({
      room_id: log.room_id || '',
      type: log.type || 'Other',
      description: log.description || '',
      reported_date: log.reported_date || '',
      resolved_date: log.resolved_date || '',
      cost: log.cost != null ? String(log.cost) : '',
      status: log.status || 'Pending'
    })
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      room_id: formData.room_id || null,
      type: formData.type,
      description: formData.description,
      reported_date: formData.reported_date || null,
      resolved_date: formData.resolved_date || null,
      cost: formData.cost !== '' ? Number(formData.cost) : null,
      status: formData.status
    }

    const { error } = editingId
      ? await supabase.from('maintenance_logs').update(payload).eq('id', editingId)
      : await supabase.from('maintenance_logs').insert([payload])

    if (error) {
      alert(error.message)
      return
    }

    closeModal()
    fetchLogs()
  }

  async function markComplete(id) {
    const { error } = await supabase
      .from('maintenance_logs')
      .update({ status: 'Completed', resolved_date: new Date().toISOString().split('T')[0] })
      .eq('id', id)

    if (error) {
      alert(error.message)
      return
    }
    fetchLogs()
  }

  async function deleteLog(id) {
    if (!window.confirm('Delete this maintenance log?')) return
    const { error } = await supabase.from('maintenance_logs').delete().eq('id', id)
    if (error) { alert(error.message); return }
    setSelectedIds((cur) => cur.filter((x) => x !== id))
    fetchLogs()
  }

  async function deleteSelected() {
    if (selectedIds.length === 0) return
    if (!window.confirm(`Delete ${selectedIds.length} log(s)?`)) return
    const { error } = await supabase.from('maintenance_logs').delete().in('id', selectedIds)
    if (error) { alert(error.message); return }
    setSelectedIds([])
    fetchLogs()
  }

  function toggleSelectAll(e) {
    setSelectedIds(e.target.checked ? filtered.map((l) => l.id) : [])
  }

  function toggleSelected(id, checked) {
    setSelectedIds((cur) => checked ? [...cur, id] : cur.filter((x) => x !== id))
  }

  const filtered = logs.filter((log) => {
    const room = findRoom(log.room_id)
    const q = searchTerm.toLowerCase()
    return (
      String(room?.room_number || '').toLowerCase().includes(q) ||
      String(log.type || '').toLowerCase().includes(q) ||
      String(log.description || '').toLowerCase().includes(q) ||
      String(log.status || '').toLowerCase().includes(q)
    )
  })

  const allSelected = filtered.length > 0 && filtered.every((l) => selectedIds.includes(l.id))

  const totalCost = logs
    .filter((l) => l.status !== 'Cancelled')
    .reduce((sum, l) => sum + Number(l.cost || 0), 0)

  const pending = logs.filter((l) => l.status === 'Pending').length
  const inProgress = logs.filter((l) => l.status === 'In Progress').length

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>Maintenance Log</h1>
          <p className="page-kicker">Track repairs, maintenance costs, and room status by unit.</p>
        </div>
        <button className="btn-add" type="button" onClick={openAddModal}>
          + Add Log
        </button>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {[
          { label: 'Pending', value: pending, color: 'var(--warning)' },
          { label: 'In Progress', value: inProgress, color: 'var(--primary)' },
          { label: 'Total Cost', value: `₱${totalCost.toLocaleString()}`, color: 'var(--danger)' }
        ].map(({ label, value, color }) => (
          <div key={label} className="table-card" style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ color: 'var(--text)', fontSize: '0.88rem' }}>{label}</span>
            <strong style={{ fontSize: '1.5rem', color }}>{value}</strong>
          </div>
        ))}
      </div>

      <div className="table-card">
        {selectedIds.length > 0 && (
          <div className="bulk-toolbar">
            <span>{selectedIds.length} selected</span>
            <button className="action-btn btn-delete" type="button" onClick={deleteSelected}>Delete Selected</button>
          </div>
        )}

        <div className="table-toolbar">
          <input
            className="table-search"
            placeholder="Search maintenance logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="table-scroll">
          <table className="modern-table">
            <thead>
              <tr>
                <th className="select-column">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                </th>
                <th>Unit</th>
                <th>Type</th>
                <th>Description</th>
                <th>Reported</th>
                <th>Resolved</th>
                <th>Cost</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => {
                const room = findRoom(log.room_id)
                return (
                  <tr key={log.id}>
                    <td className="select-column">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(log.id)}
                        onChange={(e) => toggleSelected(log.id, e.target.checked)}
                      />
                    </td>
                    <td>{room?.room_number || '—'}</td>
                    <td>{log.type}</td>
                    <td style={{ maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {log.description}
                    </td>
                    <td>{log.reported_date || '—'}</td>
                    <td>{log.resolved_date || '—'}</td>
                    <td>{log.cost != null ? `₱${Number(log.cost).toLocaleString()}` : '—'}</td>
                    <td>
                      <span className={`status-badge status-${statusClass(log.status)}`}>
                        {log.status}
                      </span>
                    </td>
                    <td>
                      <div className="action-group">
                        <button className="action-btn btn-edit" type="button" onClick={() => openEditModal(log)}>Edit</button>
                        {log.status !== 'Completed' && (
                          <button className="action-btn btn-resolve" type="button" onClick={() => markComplete(log.id)}>
                            Complete
                          </button>
                        )}
                        <button className="action-btn btn-delete" type="button" onClick={() => deleteLog(log.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td className="empty-state" colSpan="9">No maintenance logs found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} title={editingId ? 'Edit Log' : 'Add Maintenance Log'} onClose={closeModal}>
        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="form-group">
              <span className="form-label">Unit</span>
              <select className="form-input" name="room_id" value={formData.room_id} onChange={handleChange} required>
                <option value="">Select Unit</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.room_number}</option>
                ))}
              </select>
            </label>

            <label className="form-group">
              <span className="form-label">Type</span>
              <select className="form-input" name="type" value={formData.type} onChange={handleChange}>
                {MAINTENANCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>

            <label className="form-group full-width">
              <span className="form-label">Description</span>
              <textarea className="form-input" name="description" value={formData.description} onChange={handleChange} required rows={3} />
            </label>

            <label className="form-group">
              <span className="form-label">Reported Date</span>
              <input className="form-input" type="date" name="reported_date" value={formData.reported_date} onChange={handleChange} required />
            </label>

            <label className="form-group">
              <span className="form-label">Resolved Date</span>
              <input className="form-input" type="date" name="resolved_date" value={formData.resolved_date} onChange={handleChange} />
            </label>

            <label className="form-group">
              <span className="form-label">Cost (₱)</span>
              <input className="form-input" type="number" min="0" name="cost" value={formData.cost} onChange={handleChange} placeholder="0" />
            </label>

            <label className="form-group">
              <span className="form-label">Status</span>
              <select className="form-input" name="status" value={formData.status} onChange={handleChange}>
                {MAINTENANCE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>

          <div className="form-actions">
            <button className="btn-secondary" type="button" onClick={closeModal}>Cancel</button>
            <button className="btn-primary" type="submit">Save Log</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default Maintenance