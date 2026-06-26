import { useEffect, useState } from 'react'
import Modal from '../components/Modal'
import { supabase } from '../supabase'

const BILL_TYPES = ['Electricity', 'Water', 'Internet', 'Garbage', 'Association Dues', 'Other']
const BILL_STATUSES = ['Unpaid', 'Paid', 'Overdue']

const emptyForm = {
  tenant_id: '',
  bill_type: 'Electricity',
  amount: '',
  billing_month: '',
  due_date: '',
  paid_date: '',
  status: 'Unpaid',
  notes: ''
}

function statusClass(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'paid') return 'paid'
  if (s === 'overdue') return 'pending'
  return 'partial'
}

function Bills() {
  const [bills, setBills] = useState([])
  const [tenants, setTenants] = useState([])
  const [formData, setFormData] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterMonth, setFilterMonth] = useState('')

  useEffect(() => {
    fetchTenants()
    fetchBills()
  }, [])

  async function fetchTenants() {
    const { data } = await supabase.from('tenants').select('*').order('full_name')
    setTenants(data || [])
  }

  async function fetchBills() {
    const { data, error } = await supabase
      .from('bills')
      .select('*')
      .order('due_date', { ascending: false })

    if (error) { console.error(error); return }
    setBills(data || [])
  }

  function findTenant(tenantId) {
    return tenants.find((t) => String(t.id) === String(tenantId))
  }

  function handleChange(e) {
    const { name, value } = e.target
    // auto-set overdue if unpaid and due_date is in the past
    setFormData((cur) => {
      const updated = { ...cur, [name]: value }
      if ((name === 'due_date' || name === 'status') && updated.status === 'Unpaid') {
        if (updated.due_date && new Date(updated.due_date) < new Date()) {
          updated.status = 'Overdue'
        }
      }
      return updated
    })
  }

  function openAddModal() {
    setEditingId(null)
    setFormData({ ...emptyForm, billing_month: new Date().toISOString().slice(0, 7) })
    setIsModalOpen(true)
  }

  function openEditModal(bill) {
    setEditingId(bill.id)
    setFormData({
      tenant_id: bill.tenant_id || '',
      bill_type: bill.bill_type || 'Electricity',
      amount: bill.amount != null ? String(bill.amount) : '',
      billing_month: bill.billing_month || '',
      due_date: bill.due_date || '',
      paid_date: bill.paid_date || '',
      status: bill.status || 'Unpaid',
      notes: bill.notes || ''
    })
    setIsModalOpen(true)
  }

  function closeModal() { setIsModalOpen(false) }

  async function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      tenant_id: formData.tenant_id,
      bill_type: formData.bill_type,
      amount: Number(formData.amount),
      billing_month: formData.billing_month || null,
      due_date: formData.due_date || null,
      paid_date: formData.paid_date || null,
      status: formData.status,
      notes: formData.notes || null
    }

    const { error } = editingId
      ? await supabase.from('bills').update(payload).eq('id', editingId)
      : await supabase.from('bills').insert([payload])

    if (error) { alert(error.message); return }
    closeModal()
    fetchBills()
  }

  async function markPaid(id) {
    const { error } = await supabase
      .from('bills')
      .update({ status: 'Paid', paid_date: new Date().toISOString().split('T')[0] })
      .eq('id', id)

    if (error) { alert(error.message); return }
    fetchBills()
  }

  async function deleteBill(id) {
    if (!window.confirm('Delete this bill?')) return
    const { error } = await supabase.from('bills').delete().eq('id', id)
    if (error) { alert(error.message); return }
    setSelectedIds((cur) => cur.filter((x) => x !== id))
    fetchBills()
  }

  async function deleteSelected() {
    if (selectedIds.length === 0) return
    if (!window.confirm(`Delete ${selectedIds.length} bill(s)?`)) return
    const { error } = await supabase.from('bills').delete().in('id', selectedIds)
    if (error) { alert(error.message); return }
    setSelectedIds([])
    fetchBills()
  }

  function toggleSelectAll(e) {
    setSelectedIds(e.target.checked ? filtered.map((b) => b.id) : [])
  }

  function toggleSelected(id, checked) {
    setSelectedIds((cur) => checked ? [...cur, id] : cur.filter((x) => x !== id))
  }

  const filtered = bills.filter((bill) => {
    const tenant = findTenant(bill.tenant_id)
    const q = searchTerm.toLowerCase()
    const matchSearch = (
      String(tenant?.full_name || '').toLowerCase().includes(q) ||
      String(bill.bill_type || '').toLowerCase().includes(q) ||
      String(bill.status || '').toLowerCase().includes(q)
    )
    const matchMonth = filterMonth ? bill.billing_month === filterMonth : true
    return matchSearch && matchMonth
  })

  const allSelected = filtered.length > 0 && filtered.every((b) => selectedIds.includes(b.id))

  const totalUnpaid = bills.filter((b) => b.status !== 'Paid').reduce((s, b) => s + Number(b.amount || 0), 0)
  const overdue = bills.filter((b) => b.status === 'Overdue').length
  const paidCount = bills.filter((b) => b.status === 'Paid').length

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>Bills Management</h1>
          <p className="page-kicker">Track electricity, water, and other monthly bills per tenant.</p>
        </div>
        <button className="btn-add" type="button" onClick={openAddModal}>+ Add Bill</button>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {[
          { label: 'Overdue Bills', value: overdue, color: 'var(--danger)' },
          { label: 'Paid This Cycle', value: paidCount, color: 'var(--success)' },
          { label: 'Total Unpaid', value: `₱${totalUnpaid.toLocaleString()}`, color: 'var(--warning)' }
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

        <div className="table-toolbar" style={{ display: 'flex', gap: 12 }}>
          <input
            className="table-search"
            placeholder="Search bills..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <input
            className="form-input"
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            style={{ maxWidth: 180 }}
            title="Filter by billing month"
          />
          {filterMonth && (
            <button className="btn-secondary" type="button" onClick={() => setFilterMonth('')} style={{ whiteSpace: 'nowrap' }}>
              Clear Filter
            </button>
          )}
        </div>

        <div className="table-scroll">
          <table className="modern-table">
            <thead>
              <tr>
                <th className="select-column">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                </th>
                <th>Tenant</th>
                <th>Bill Type</th>
                <th>Amount</th>
                <th>Billing Month</th>
                <th>Due Date</th>
                <th>Paid Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((bill) => {
                const tenant = findTenant(bill.tenant_id)
                return (
                  <tr key={bill.id}>
                    <td className="select-column">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(bill.id)}
                        onChange={(e) => toggleSelected(bill.id, e.target.checked)}
                      />
                    </td>
                    <td>{tenant?.full_name || '—'}</td>
                    <td>{bill.bill_type}</td>
                    <td>₱{Number(bill.amount || 0).toLocaleString()}</td>
                    <td>{bill.billing_month || '—'}</td>
                    <td>{bill.due_date || '—'}</td>
                    <td>{bill.paid_date || '—'}</td>
                    <td>
                      <span className={`status-badge status-${statusClass(bill.status)}`}>
                        {bill.status}
                      </span>
                    </td>
                    <td>
                      <div className="action-group">
                        <button className="action-btn btn-edit" type="button" onClick={() => openEditModal(bill)}>Edit</button>
                        {bill.status !== 'Paid' && (
                          <button className="action-btn btn-resolve" type="button" onClick={() => markPaid(bill.id)}>
                            Mark Paid
                          </button>
                        )}
                        <button className="action-btn btn-delete" type="button" onClick={() => deleteBill(bill.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td className="empty-state" colSpan="9">No bills found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} title={editingId ? 'Edit Bill' : 'Add Bill'} onClose={closeModal}>
        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="form-group">
              <span className="form-label">Tenant</span>
              <select className="form-input" name="tenant_id" value={formData.tenant_id} onChange={handleChange} required>
                <option value="">Select Tenant</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>{t.full_name}</option>
                ))}
              </select>
            </label>

            <label className="form-group">
              <span className="form-label">Bill Type</span>
              <select className="form-input" name="bill_type" value={formData.bill_type} onChange={handleChange}>
                {BILL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>

            <label className="form-group">
              <span className="form-label">Amount (₱)</span>
              <input className="form-input" type="number" min="0" name="amount" value={formData.amount} onChange={handleChange} required />
            </label>

            <label className="form-group">
              <span className="form-label">Billing Month</span>
              <input className="form-input" type="month" name="billing_month" value={formData.billing_month} onChange={handleChange} required />
            </label>

            <label className="form-group">
              <span className="form-label">Due Date</span>
              <input className="form-input" type="date" name="due_date" value={formData.due_date} onChange={handleChange} required />
            </label>

            <label className="form-group">
              <span className="form-label">Paid Date</span>
              <input className="form-input" type="date" name="paid_date" value={formData.paid_date} onChange={handleChange} />
            </label>

            <label className="form-group">
              <span className="form-label">Status</span>
              <select className="form-input" name="status" value={formData.status} onChange={handleChange}>
                {BILL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>

            <label className="form-group full-width">
              <span className="form-label">Notes</span>
              <input className="form-input" name="notes" value={formData.notes} onChange={handleChange} placeholder="Optional" />
            </label>
          </div>

          <div className="form-actions">
            <button className="btn-secondary" type="button" onClick={closeModal}>Cancel</button>
            <button className="btn-primary" type="submit">Save Bill</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default Bills