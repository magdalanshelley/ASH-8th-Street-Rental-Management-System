import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import Modal from '../components/Modal'
import { ensureDefaultUnits, formatCurrency, formatUnitLabel } from '../utils/rentalUnits'
import {
  buildTenantLedger,
  getPaymentAmountOptions,
  getPaymentStatus,
  getTenantMonthlyRent,
  statusClass
} from '../utils/rmsBusiness'
import { dispatchRmsRefresh } from '../utils/rmsEvents'
import './TenantAccount.css'

// ── Contract helpers ──────────────────────────────────────────────────────────
function getContractInfo(tenant) {
  if (!tenant?.check_in_date || !tenant?.contract_duration) return null
  const checkIn = new Date(tenant.check_in_date)
  const endDate = new Date(checkIn)
  endDate.setMonth(endDate.getMonth() + Number(tenant.contract_duration))
  const today = new Date()
  const diffMs = endDate - today
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  const isExpired = daysLeft < 0
  const isExpiringSoon = daysLeft >= 0 && daysLeft <= 30
  return {
    endDate,
    daysLeft,
    isExpired,
    isExpiringSoon,
    endLabel: endDate.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
  }
}

// ── Rent due helper ───────────────────────────────────────────────────────────
function getRentDueInfo(tenant, payments) {
  if (!tenant || tenant.status !== 'Active') return null
  const today = new Date()
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const hasPaidThisMonth = payments.some(
    (p) => p.payment_date && p.payment_date.startsWith(thisMonth)
  )
  if (hasPaidThisMonth) return null

  const dueDay = 5
  let dueDate = new Date(today.getFullYear(), today.getMonth(), dueDay)
  if (today > dueDate) {
    dueDate = new Date(today.getFullYear(), today.getMonth() + 1, dueDay)
  }
  const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24))
  return {
    daysUntilDue,
    isOverdue: daysUntilDue < 0,
    isDueThisWeek: daysUntilDue >= 0 && daysUntilDue <= 7,
    dueDateLabel: dueDate.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
  }
}

// ── Payer rating ──────────────────────────────────────────────────────────────
function getPayerRating(payments, monthlyRent) {
  if (!payments.length) return { label: 'No History', color: 'var(--text)', emoji: '—' }
  const total = payments.length
  const paid = payments.filter((p) => Number(p.amount_paid || 0) >= monthlyRent).length
  const ratio = paid / total
  if (ratio >= 0.9) return { label: 'Good Payer', color: '#6ee7b7', emoji: '⭐' }
  if (ratio >= 0.6) return { label: 'Average Payer', color: '#facc15', emoji: '🔶' }
  return { label: 'Late / Partial Payer', color: '#fda4af', emoji: '⚠️' }
}

function TenantAccount() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tenant, setTenant] = useState(null)
  const [rooms, setRooms] = useState([])
  const [payments, setPayments] = useState([])
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [activeTab, setActiveTab] = useState('ledger') // 'ledger' | 'history' | 'bills'
  const [paymentForm, setPaymentForm] = useState({
    amount_option: '',
    custom_amount: '',
    payment_date: '',
    payment_method: 'Cash'
  })

  async function fetchData() {
    setLoading(true)
    setError('')

    try {
      const [
        { data: tenantData, error: tenantError },
        { data: paymentData, error: paymentError },
        { data: billData, error: billError }
      ] = await Promise.all([
        supabase.from('tenants').select('*').eq('id', id).single(),
        supabase.from('payments').select('*').eq('tenant_id', id).order('payment_date', { ascending: false }),
        supabase.from('bills').select('*').eq('tenant_id', id).order('due_date', { ascending: false })
      ])

      if (tenantError) throw tenantError
      if (paymentError) throw paymentError
      // bills error is soft — table might not exist yet
      if (billError) console.warn('bills fetch:', billError.message)

      const roomData = await ensureDefaultUnits(supabase)

      setTenant(tenantData)
      setPayments(paymentData || [])
      setBills(billData || [])
      setRooms(roomData || [])
    } catch (fetchError) {
      console.error(fetchError)
      setError(fetchError.message || 'Unable to load tenant account.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!id) return
    fetchData()
  }, [id])

  const assignedRoom = rooms.find((room) => String(room.id) === String(tenant?.assigned_room_id))
  const monthlyRent = getTenantMonthlyRent(tenant, rooms)
  const ledger = useMemo(() => buildTenantLedger(tenant, payments, rooms), [tenant, payments, rooms])

  const summary = useMemo(() => {
    const totalAmount = payments.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0)
    return {
      totalPayments: payments.length,
      totalAmountPaid: totalAmount,
      latestPaymentDate: payments.length ? payments[0].payment_date : null
    }
  }, [payments])

  const contractInfo = useMemo(() => getContractInfo(tenant), [tenant])
  const rentDueInfo = useMemo(() => getRentDueInfo(tenant, payments), [tenant, payments])
  const payerRating = useMemo(() => getPayerRating(payments, monthlyRent), [payments, monthlyRent])

  const selectedAmount = paymentForm.amount_option === 'custom'
    ? Number(paymentForm.custom_amount || 0)
    : Number(paymentForm.amount_option || 0)
  const calculatedStatus = getPaymentStatus(selectedAmount, monthlyRent)

  const totalBillsUnpaid = bills.filter((b) => b.status !== 'Paid').reduce((s, b) => s + Number(b.amount || 0), 0)

  function openModal() {
    setSuccessMessage('')
    setPaymentForm({ amount_option: '', custom_amount: '', payment_date: '', payment_method: 'Cash' })
    setIsModalOpen(true)
  }

  function closeModal() { setIsModalOpen(false) }

  function handlePaymentChange(event) {
    const { name, value } = event.target
    setPaymentForm((current) => ({ ...current, [name]: value }))
  }

  async function handleSavePayment(event) {
    event.preventDefault()
    setError('')

    if (!paymentForm.amount_option || !paymentForm.payment_date) {
      setError('Please fill out amount and date.')
      return
    }

    if (Number.isNaN(selectedAmount) || selectedAmount < 0) {
      setError('Payment amount cannot be negative.')
      return
    }

    setSaving(true)
    try {
      const remainingBalance = Math.max(monthlyRent - selectedAmount, 0)
      const { error: insertError } = await supabase.from('payments').insert([{
        tenant_id: id,
        amount_paid: selectedAmount,
        payment_date: paymentForm.payment_date,
        payment_method: paymentForm.payment_method,
        payment_status: calculatedStatus,
        remaining_balance: remainingBalance
      }])

      if (insertError) throw insertError

      setSuccessMessage('Payment recorded successfully.')
      closeModal()
      await reloadPayments()
      dispatchRmsRefresh()
    } catch (saveError) {
      console.error(saveError)
      setError(saveError.message || 'Unable to save payment.')
    } finally {
      setSaving(false)
    }
  }

  async function reloadPayments() {
    try {
      const { data: paymentData, error: paymentError } = await supabase
        .from('payments')
        .select('*')
        .eq('tenant_id', id)
        .order('payment_date', { ascending: false })

      if (paymentError) throw paymentError
      setPayments(paymentData || [])
    } catch (loadError) {
      console.error(loadError)
    }
  }

  async function markBillPaid(billId) {
    const { error: err } = await supabase
      .from('bills')
      .update({ status: 'Paid', paid_date: new Date().toISOString().split('T')[0] })
      .eq('id', billId)
    if (err) { alert(err.message); return }
    fetchData()
  }

  function billStatusClass(status) {
    if (status === 'Paid') return 'paid'
    if (status === 'Overdue') return 'pending'
    return 'partial'
  }

  if (loading) return <div className="page-shell"><div className="page-loading">Loading tenant account...</div></div>
  if (error) return <div className="page-shell"><div className="page-error">{error}</div></div>
  if (!tenant) return <div className="page-shell"><div className="page-error">Tenant not found.</div></div>

  return (
    <div className="page-shell">
      <div className="page-header tenant-header">
        <div>
          <h1>Tenant Account</h1>
          <p className="page-kicker">Ledger, payments and account details for {tenant.full_name}.</p>
        </div>
        <button className="btn-secondary" type="button" onClick={() => navigate(-1)}>
          Back to Tenants
        </button>
      </div>

      {/* ── Rent due reminder ── */}
      {rentDueInfo && (
        <div style={{
          background: rentDueInfo.isOverdue ? 'rgba(248,113,113,0.1)' : 'rgba(250,204,21,0.08)',
          border: `1px solid ${rentDueInfo.isOverdue ? 'rgba(248,113,113,0.3)' : 'rgba(250,204,21,0.25)'}`,
          borderRadius: 16,
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          <span style={{ fontSize: '1.3rem' }}>{rentDueInfo.isOverdue ? '🔴' : '⏰'}</span>
          <div>
            <strong style={{ color: rentDueInfo.isOverdue ? '#fda4af' : '#facc15' }}>
              {rentDueInfo.isOverdue
                ? 'Rent is overdue!'
                : rentDueInfo.isDueThisWeek
                  ? `Rent due in ${rentDueInfo.daysUntilDue} day${rentDueInfo.daysUntilDue !== 1 ? 's' : ''}`
                  : `Next rent due: ${rentDueInfo.dueDateLabel}`}
            </strong>
            <div style={{ color: 'var(--text)', fontSize: '0.88rem', marginTop: 2 }}>
              No payment recorded for this month · Amount due: {formatCurrency(monthlyRent)}
            </div>
          </div>
        </div>
      )}

      {/* ── Contract expiry reminder ── */}
      {contractInfo && (contractInfo.isExpired || contractInfo.isExpiringSoon) && (
        <div style={{
          background: contractInfo.isExpired ? 'rgba(248,113,113,0.1)' : 'rgba(250,204,21,0.08)',
          border: `1px solid ${contractInfo.isExpired ? 'rgba(248,113,113,0.3)' : 'rgba(250,204,21,0.25)'}`,
          borderRadius: 16,
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          <span style={{ fontSize: '1.3rem' }}>{contractInfo.isExpired ? '📋❌' : '📋⚠️'}</span>
          <div>
            <strong style={{ color: contractInfo.isExpired ? '#fda4af' : '#facc15' }}>
              {contractInfo.isExpired
                ? `Lease contract expired on ${contractInfo.endLabel}`
                : `Lease expires in ${contractInfo.daysLeft} day${contractInfo.daysLeft !== 1 ? 's' : ''} — ${contractInfo.endLabel}`}
            </strong>
            <div style={{ color: 'var(--text)', fontSize: '0.88rem', marginTop: 2 }}>
              Contract duration: {tenant.contract_duration} month{tenant.contract_duration !== 1 ? 's' : ''} · Check-in: {tenant.check_in_date}
            </div>
          </div>
        </div>
      )}

      <div className="tenant-grid">
        <section className="tenant-card">
          <h2>Tenant Details</h2>
          <dl className="tenant-details">
            <div><dt>Name</dt><dd>{tenant.full_name}</dd></div>
            <div><dt>Contact Number</dt><dd>{tenant.contact_number || '-'}</dd></div>
            <div><dt>Address</dt><dd>{tenant.address || '-'}</dd></div>
            <div><dt>Assigned Unit</dt><dd>{formatUnitLabel(assignedRoom)}</dd></div>
            <div><dt>Monthly Rent</dt><dd>{formatCurrency(monthlyRent)}</dd></div>
            <div><dt>Check In Date</dt><dd>{tenant.check_in_date || '-'}</dd></div>
            <div>
              <dt>Contract Duration</dt>
              <dd>
                {tenant.contract_duration
                  ? `${tenant.contract_duration} month${tenant.contract_duration !== 1 ? 's' : ''}`
                  : '-'}
                {contractInfo && (
                  <span style={{
                    marginLeft: 8,
                    fontSize: '0.82rem',
                    color: contractInfo.isExpired ? '#fda4af' : contractInfo.isExpiringSoon ? '#facc15' : '#6ee7b7',
                    fontWeight: 600
                  }}>
                    {contractInfo.isExpired ? '(Expired)' : `(${contractInfo.daysLeft}d left)`}
                  </span>
                )}
              </dd>
            </div>
            <div><dt>Lease End Date</dt><dd>{contractInfo ? contractInfo.endLabel : '-'}</dd></div>
            <div><dt>Status</dt><dd>{tenant.status || 'Unknown'}</dd></div>
            <div>
              <dt>Payer Rating</dt>
              <dd style={{ color: payerRating.color, fontWeight: 700 }}>
                {payerRating.emoji} {payerRating.label}
              </dd>
            </div>
          </dl>
        </section>

        <section className="summary-panel">
          <div className="summary-card">
            <span>Total Payments</span>
            <strong>{summary.totalPayments}</strong>
          </div>
          <div className="summary-card">
            <span>Total Amount Paid</span>
            <strong>{formatCurrency(summary.totalAmountPaid)}</strong>
          </div>
          <div className="summary-card">
            <span>Latest Payment</span>
            <strong>{summary.latestPaymentDate || 'No payments yet'}</strong>
          </div>
          <div className="summary-card">
            <span>Unpaid Bills</span>
            <strong style={{ color: totalBillsUnpaid > 0 ? '#fda4af' : '#6ee7b7' }}>
              {formatCurrency(totalBillsUnpaid)}
            </strong>
          </div>
          <button className="btn-primary btn-block" type="button" onClick={openModal}>
            + Add Payment
          </button>
        </section>
      </div>

      {/* ── Tab switcher ── */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {[
          { key: 'ledger', label: 'Payment Ledger' },
          { key: 'history', label: 'Payment History' },
          { key: 'bills', label: `Bills ${bills.filter(b => b.status !== 'Paid').length > 0 ? `(${bills.filter(b => b.status !== 'Paid').length} unpaid)` : ''}` }
        ].map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderBottom: activeTab === key ? '2px solid var(--primary)' : '2px solid transparent',
              background: 'none',
              color: activeTab === key ? 'var(--primary)' : 'var(--text)',
              fontWeight: activeTab === key ? 700 : 400,
              cursor: 'pointer',
              fontSize: '0.95rem',
              borderRadius: '8px 8px 0 0'
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Payment Ledger tab ── */}
      {activeTab === 'ledger' && (
        <section className="payments-section">
          <div className="section-header">
            <div>
              <h2>Payment Ledger</h2>
              <p>Monthly rent, payments made, balance, and payment status.</p>
            </div>
            <span>{ledger.length} month(s)</span>
          </div>

          <div className="table-card">
            <div className="table-scroll">
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Rent Due</th>
                    <th>Payments Made</th>
                    <th>Outstanding Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((entry) => (
                    <tr key={entry.monthKey}>
                      <td>{entry.monthLabel}</td>
                      <td>{formatCurrency(entry.rentDue)}</td>
                      <td>{formatCurrency(entry.paymentsMade)}</td>
                      <td>{formatCurrency(entry.outstandingBalance)}</td>
                      <td>
                        <span className={`status-badge status-${statusClass(entry.status)}`}>
                          {entry.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {ledger.length === 0 && (
                    <tr><td className="empty-state" colSpan="5">No ledger entries found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ── Payment History tab ── */}
      {activeTab === 'history' && (
        <section className="payments-section">
          <div className="section-header">
            <div>
              <h2>Payment History</h2>
              <p>All recorded payments for this tenant, newest first.</p>
            </div>
            <span>{payments.length} payment(s)</span>
          </div>

          <div className="table-card">
            <div className="table-scroll">
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Date</th>
                    <th>Amount Paid</th>
                    <th>Method</th>
                    <th>Remaining Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p, i) => (
                    <tr key={p.id}>
                      <td>{payments.length - i}</td>
                      <td>{p.payment_date}</td>
                      <td>{formatCurrency(p.amount_paid)}</td>
                      <td>{p.payment_method || '—'}</td>
                      <td>{formatCurrency(p.remaining_balance)}</td>
                      <td>
                        <span className={`status-badge status-${statusClass(p.payment_status)}`}>
                          {p.payment_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                    <tr><td className="empty-state" colSpan="6">No payment history.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ── Bills tab ── */}
      {activeTab === 'bills' && (
        <section className="payments-section">
          <div className="section-header">
            <div>
              <h2>Bills</h2>
              <p>Electricity, water, and other monthly charges.</p>
            </div>
            <span style={{ color: totalBillsUnpaid > 0 ? '#fda4af' : 'var(--text)' }}>
              Unpaid: {formatCurrency(totalBillsUnpaid)}
            </span>
          </div>

          <div className="table-card">
            <div className="table-scroll">
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>Billing Month</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Due Date</th>
                    <th>Paid Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((bill) => (
                    <tr key={bill.id}>
                      <td>{bill.billing_month || '—'}</td>
                      <td>{bill.bill_type}</td>
                      <td>₱{Number(bill.amount || 0).toLocaleString()}</td>
                      <td>{bill.due_date || '—'}</td>
                      <td>{bill.paid_date || '—'}</td>
                      <td>
                        <span className={`status-badge status-${billStatusClass(bill.status)}`}>
                          {bill.status}
                        </span>
                      </td>
                      <td>
                        {bill.status !== 'Paid' && (
                          <button
                            className="action-btn btn-resolve"
                            type="button"
                            onClick={() => markBillPaid(bill.id)}
                          >
                            Mark Paid
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {bills.length === 0 && (
                    <tr>
                      <td className="empty-state" colSpan="7">
                        No bills found. Add bills from the Bills module.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <Modal isOpen={isModalOpen} title="Add Payment" onClose={closeModal}>
        <form className="modal-form" onSubmit={handleSavePayment}>
          <div className="form-grid">
            <label className="form-group full-width">
              <span className="form-label">Payment Amount</span>
              <select
                className="form-input"
                name="amount_option"
                value={paymentForm.amount_option}
                onChange={handlePaymentChange}
                required
              >
                <option value="">Select Amount</option>
                {getPaymentAmountOptions(monthlyRent).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
                <option value="custom">Custom Amount</option>
              </select>
            </label>

            {paymentForm.amount_option === 'custom' && (
              <label className="form-group full-width">
                <span className="form-label">Custom Amount</span>
                <input
                  className="form-input"
                  name="custom_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={paymentForm.custom_amount}
                  onChange={handlePaymentChange}
                  required
                />
              </label>
            )}

            <label className="form-group full-width">
              <span className="form-label">Payment Date</span>
              <input
                className="form-input"
                name="payment_date"
                type="date"
                value={paymentForm.payment_date}
                onChange={handlePaymentChange}
                required
              />
            </label>

            <label className="form-group full-width">
              <span className="form-label">Payment Method</span>
              <select
                className="form-input"
                name="payment_method"
                value={paymentForm.payment_method}
                onChange={handlePaymentChange}
              >
                <option value="Cash">Cash</option>
                <option value="GCash">GCash</option>
                <option value="Bank Transfer">Bank Transfer</option>
              </select>
            </label>

            <label className="form-group full-width">
              <span className="form-label">Calculated Status</span>
              <input className="form-input" value={calculatedStatus} disabled />
            </label>
          </div>

          {error && <div className="form-error">{error}</div>}
          {successMessage && <div className="form-success">{successMessage}</div>}

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={closeModal}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Payment'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default TenantAccount