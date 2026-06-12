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

function TenantAccount() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tenant, setTenant] = useState(null)
  const [rooms, setRooms] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
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
      const [{ data: tenantData, error: tenantError }, { data: paymentData, error: paymentError }] = await Promise.all([
        supabase.from('tenants').select('*').eq('id', id).single(),
        supabase.from('payments').select('*').eq('tenant_id', id).order('payment_date', { ascending: false })
      ])

      if (tenantError) throw tenantError
      if (paymentError) throw paymentError

      const roomData = await ensureDefaultUnits(supabase)

      setTenant(tenantData)
      setPayments(paymentData || [])
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
    const totalAmount = payments.reduce((sum, payment) => sum + Number(payment.amount_paid || 0), 0)

    return {
      totalPayments: payments.length,
      totalAmountPaid: totalAmount,
      latestPaymentDate: payments.length ? payments[0].payment_date : null
    }
  }, [payments])

  const selectedAmount = paymentForm.amount_option === 'custom'
    ? Number(paymentForm.custom_amount || 0)
    : Number(paymentForm.amount_option || 0)
  const calculatedStatus = getPaymentStatus(selectedAmount, monthlyRent)

  function openModal() {
    setSuccessMessage('')
    setPaymentForm({
      amount_option: '',
      custom_amount: '',
      payment_date: '',
      payment_method: 'Cash'
    })
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
  }

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
      const { error: insertError } = await supabase.from('payments').insert([
        {
  tenant_id: id,
  amount_paid: selectedAmount,
  payment_date: paymentForm.payment_date,
  payment_method: paymentForm.payment_method,
  payment_status: calculatedStatus,
  remaining_balance: remainingBalance
}
      ])

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

  if (loading) {
    return (
      <div className="page-shell">
        <div className="page-loading">Loading tenant account...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page-shell">
        <div className="page-error">{error}</div>
      </div>
    )
  }

  if (!tenant) {
    return (
      <div className="page-shell">
        <div className="page-error">Tenant not found.</div>
      </div>
    )
  }

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

      <div className="tenant-grid">
        <section className="tenant-card">
          <h2>Tenant Details</h2>
          <dl className="tenant-details">
            <div>
              <dt>Name</dt>
              <dd>{tenant.full_name}</dd>
            </div>
            <div>
              <dt>Contact Number</dt>
              <dd>{tenant.contact_number || '-'}</dd>
            </div>
            <div>
              <dt>Assigned Unit</dt>
              <dd>{formatUnitLabel(assignedRoom)}</dd>
            </div>
            <div>
              <dt>Monthly Rent</dt>
              <dd>{formatCurrency(monthlyRent)}</dd>
            </div>
            <div>
              <dt>Check In Date</dt>
              <dd>{tenant.check_in_date || '-'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{tenant.status || 'Unknown'}</dd>
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
          <button className="btn-primary btn-block" type="button" onClick={openModal}>
            + Add Payment
          </button>
        </section>
      </div>

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
                  <tr>
                    <td className="empty-state" colSpan="5">
                      No payment ledger entries found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

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
            <button type="button" className="btn-secondary" onClick={closeModal}>
              Cancel
            </button>
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
