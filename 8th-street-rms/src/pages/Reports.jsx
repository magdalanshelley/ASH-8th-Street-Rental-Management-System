import { useEffect, useMemo, useState } from 'react'
import {
  FaBuilding,
  FaChartPie,
  FaDoorOpen,
  FaMoneyBillWave,
  FaStore,
  FaUsers
} from 'react-icons/fa'
import DashboardCard from '../components/DashboardCard'
import { supabase } from '../supabase'
import { formatCurrency, getUnitTypeLabel } from '../utils/rentalUnits'
import './Dashboard.css'

function Reports() {
  const [rooms, setRooms] = useState([])
  const [tenants, setTenants] = useState([])
  const [payments, setPayments] = useState([])

  useEffect(() => {
    loadReports()
  }, [])

  async function loadReports() {
    const { data: roomsData } = await supabase.from('rooms').select('*')
    const { data: tenantsData } = await supabase.from('tenants').select('*')
    const { data: paymentsData } = await supabase.from('payments').select('*')

    setRooms(roomsData || [])
    setTenants(tenantsData || [])
    setPayments(paymentsData || [])
  }

  const analytics = useMemo(() => {
    const totalUnits = rooms.length
    const occupiedUnits = rooms.filter((unit) => unit.status === 'Occupied').length
    const reservedUnits = rooms.filter((unit) => unit.status === 'Reserved').length
    const occupancyRate = totalUnits ? Math.round((occupiedUnits / totalUnits) * 100) : 0

    const unitById = new Map(rooms.map((unit) => [String(unit.id), unit]))
    const tenantById = new Map(tenants.map((tenant) => [String(tenant.id), tenant]))

    const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount_paid || p.amount || 0), 0)

    const revenueByUnitType = payments.reduce((totals, payment) => {
      const tenant = tenantById.get(String(payment.tenant_id))
      const unit = unitById.get(String(tenant?.assigned_room_id))
      const type = getUnitTypeLabel(unit?.room_type)
      const amount = Number(payment.amount_paid || payment.amount || 0)

      return {
        ...totals,
        [type]: (totals[type] || 0) + amount
      }
    }, {})

    const boardingUnits = rooms.filter((unit) => getUnitTypeLabel(unit.room_type) === 'Single Room')
    const rentalSpaces = rooms.filter((unit) => getUnitTypeLabel(unit.room_type) === 'Rental Space')
    const boardingOccupied = boardingUnits.filter((unit) => unit.status === 'Occupied').length
    const rentalSpaceOccupied = rentalSpaces.filter((unit) => unit.status === 'Occupied').length

    return {
      totalUnits,
      occupiedUnits,
      reservedUnits,
      occupancyRate,
      totalRevenue,
      revenueByUnitType,
      boardingTotal: boardingUnits.length,
      boardingOccupied,
      rentalSpaceTotal: rentalSpaces.length,
      rentalSpaceOccupied
    }
  }, [payments, rooms, tenants])

  const cards = [
    { title: 'Total Rental Units', value: analytics.totalUnits, icon: FaDoorOpen, accent: 'var(--primary)' },
    { title: 'Occupancy Rate', value: `${analytics.occupancyRate}%`, icon: FaChartPie, accent: 'var(--success)' },
    { title: 'Reserved Units', value: analytics.reservedUnits, icon: FaBuilding, accent: 'var(--warning)' },
    {
      title: 'Rental Space Occupancy',
      value: `${analytics.rentalSpaceOccupied}/${analytics.rentalSpaceTotal}`,
      icon: FaStore,
      accent: 'var(--info)'
    },
    {
      title: 'Boarding House Occupancy',
      value: `${analytics.boardingOccupied}/${analytics.boardingTotal}`,
      icon: FaUsers,
      accent: 'var(--primary)'
    },
    {
      title: 'Total Revenue',
      value: formatCurrency(analytics.totalRevenue),
      icon: FaMoneyBillWave,
      accent: 'var(--success)'
    }
  ]

  return (
    <div className="dashboard-page">
      <header className="dash-header">
        <h2>Reports</h2>
        <p className="sub">Analytics for 8TH Street rental units, occupancy, and revenue.</p>
      </header>

      <section className="cards-grid">
        {cards.map((card) => (
          <DashboardCard key={card.title} {...card} />
        ))}
      </section>

      <section className="lower-grid">
        <div className="white-card">
          <h3>Revenue by Unit Type</h3>
          <div className="report-list">
            {['Single Room', 'Rental Space'].map((type) => (
              <div className="report-row" key={type}>
                <span>{type}</span>
                <strong>{formatCurrency(analytics.revenueByUnitType[type] || 0)}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="white-card">
          <h3>Unit Status Summary</h3>
          <div className="report-list">
            <div className="report-row">
              <span>Occupied Units</span>
              <strong>{analytics.occupiedUnits}</strong>
            </div>
            <div className="report-row">
              <span>Reserved Units</span>
              <strong>{analytics.reservedUnits}</strong>
            </div>
            <div className="report-row">
              <span>Available Units</span>
              <strong>{analytics.totalUnits - analytics.occupiedUnits - analytics.reservedUnits}</strong>
            </div>
          </div>
        </div>
      </section>

      <div className="white-card report-wide">
        <h3>8TH Street Unit Inventory</h3>
        <div className="table-scroll">
          <table className="modern-table">
            <thead>
              <tr>
                <th>Unit Number</th>
                <th>Unit Type</th>
                <th>Monthly Rent</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((unit) => (
                <tr key={unit.id}>
                  <td>{unit.room_number}</td>
                  <td>{getUnitTypeLabel(unit.room_type)}</td>
                  <td>{formatCurrency(unit.monthly_rent)}</td>
                  <td>
                    <span className={`status-badge status-${String(unit.status || '').toLowerCase()}`}>
                      {unit.status || 'Available'}
                    </span>
                  </td>
                </tr>
              ))}

              {rooms.length === 0 && (
                <tr>
                  <td className="empty-state" colSpan="4">No rental units found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default Reports