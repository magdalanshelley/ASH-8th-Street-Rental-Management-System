import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  FaHome,
  FaDoorOpen,
  FaUsers,
  FaCalendarAlt,
  FaMoneyBillWave,
  FaEnvelope,
  FaChartBar,
  FaBars,
  FaUserCircle,
  FaSignOutAlt
} from 'react-icons/fa'
import './Sidebar.css'

const MENU = [
  { name: 'Dashboard', to: '/', icon: FaHome },
  { name: 'Rental Units', to: '/rooms', icon: FaDoorOpen },
  { name: 'Tenants', to: '/tenants', icon: FaUsers },
  { name: 'Reservations', to: '/reservations', icon: FaCalendarAlt },
  { name: 'Payments', to: '/payments', icon: FaMoneyBillWave },
  { name: 'Inquiries', to: '/inquiries', icon: FaEnvelope },
  { name: 'Reports', to: '/reports', icon: FaChartBar }
]

function Sidebar({ collapsed = false, onToggle = () => {}, user, onLogout = () => {} }) {
  const handleLogout = () => {
    const confirmLogout = window.confirm('Are you sure you want to sign out of 8th Street RMS?')
    if (confirmLogout) {
      onLogout()
    }
  }

  return (
    <motion.aside
      className={`sidebar ${collapsed ? 'collapsed' : ''}`}
      initial={false}
      animate={{ width: collapsed ? 80 : 280 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
    >
      <div className="sidebar-inner">
        <button className="hamburger" onClick={onToggle} aria-label="Toggle sidebar">
          <FaBars />
        </button>

        <div className="brand">
          <div className="logo" />
          <div className="brand-copy">
            <span className="brand-name">8th Street RMS</span>
          </div>
        </div>

        <nav className="menu" aria-label="Primary navigation">
          {MENU.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={item.name}
                className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
              >
                <motion.div
                  className="icon-wrap"
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                >
                  <Icon className="icon" />
                </motion.div>
                <span className="label">{item.name}</span>
                <motion.span
                  layout
                  className="active-indicator"
                  transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                />
              </NavLink>
            )
          })}
        </nav>

        <div className="sidebar-spacer" />

        <div className="profile-card">
          <div className="profile-main">
            <div className="avatar"><FaUserCircle /></div>
            <div className="profile-info">
              <div className="name">Administrator</div>
              <div className="role">{user?.email ?? 'admin@example.com'}</div>
            </div>
          </div>
          <button className="signout" title="Logout" onClick={handleLogout}>
            <FaSignOutAlt />
            <span className="signout-text">Logout</span>
          </button>
        </div>

        <div className="sidebar-footer">
          <span>© 2026</span>
          <span>8th Street RMS</span>
        </div>
      </div>
    </motion.aside>
  )
}

export default Sidebar
