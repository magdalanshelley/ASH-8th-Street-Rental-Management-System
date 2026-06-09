import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FaEnvelope, FaLock, FaBuilding, FaChartLine, FaCalendarCheck, FaUserFriends } from 'react-icons/fa'
import { supabase } from '../supabase'
import './Login.css'

const SYSTEM_VERSION = 'v1.0'

function Login({ user, onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentTime, setCurrentTime] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (user) {
      navigate('/')
    }
  }, [user, navigate])

  useEffect(() => {
    const updateClock = () => {
      const now = new Date()
      setCurrentTime(now.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }))
    }

    updateClock()
    const timer = window.setInterval(updateClock, 1000)
    return () => window.clearInterval(timer)
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!email || !password) {
      setError('Please enter both email and password.')
      return
    }

    setLoading(true)

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    setLoading(false)

    if (authError) {
      setError(authError.message || 'Unable to sign in. Please check your credentials.')
      return
    }

    if (data?.user) {
      onLogin(data.user)
      navigate('/')
    }
  }

  return (
    <div className="login-page">
      <div className="login-backdrop">
        <span className="blob blob-1" />
        <span className="blob blob-2" />
        <span className="blob blob-3" />
        <span className="blob blob-4" />
        <span className="particle particle-1" />
        <span className="particle particle-2" />
        <span className="particle particle-3" />
        <span className="particle particle-4" />
      </div>

      <div className="login-shell">
        <motion.section
          className="login-hero"
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          <div className="hero-copy">
            <div className="hero-branding">
              <div className="hero-logo">8th Street RMS</div>
              <span>Property Management SaaS</span>
            </div>
            <h1>Manage Properties, Tenants, Payments and Reports in One Platform</h1>
            <p>
              Streamline rental operations with 8th Street RMS. A premium admin experience for modern
              rental portfolios, teams, and property owners.
            </p>
            <div className="hero-stat-bar">
              <div>
                <strong>{currentTime}</strong>
                <span>Current system snapshot</span>
              </div>
              <div>
                <strong>{SYSTEM_VERSION}</strong>
                <span>Release version</span>
              </div>
            </div>
          </div>

          <div className="hero-visual">
            <div className="visual-card">
              <div className="visual-top">
                <span>Portfolio overview</span>
                <strong>Operational insights</strong>
              </div>
              <div className="visual-chart">
                <div className="chart-bar chart-bar-large" />
                <div className="chart-bar chart-bar-medium" />
                <div className="chart-bar chart-bar-small" />
                <div className="chart-bar chart-bar-medium-2" />
              </div>
              <div className="visual-lowlights">
                <div className="highlight-card">
                  <FaCalendarCheck />
                  <div>
                    <span>16 Reservations</span>
                    <strong>Today</strong>
                  </div>
                </div>
                <div className="highlight-card">
                  <FaUserFriends />
                  <div>
                    <span>124 Tenants</span>
                    <strong>Active</strong>
                  </div>
                </div>
              </div>
            </div>
            <div className="hero-building">
              <FaBuilding />
            </div>
          </div>
        </motion.section>

        <motion.div
          className="login-panel"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
        >
          <div className="glass-card">
            <div className="glass-pill">Administrator Login</div>
            <div className="panel-head">
              <div>
                <p className="panel-label">Welcome Back</p>
                <h2>Access Dashboard</h2>
              </div>
              <span className="panel-badge">8th Street RMS</span>
            </div>

            <form className="login-form" onSubmit={handleSubmit}>
              {error && <div className="login-error">{error}</div>}

              <div className="input-group">
                <span className="input-icon">
                  <FaEnvelope />
                </span>
                <div className="input-stack">
                  <input
                    type="email"
                    className={`form-input ${email ? 'filled' : ''}`}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                  <label className={`floating-label ${email ? 'filled' : ''}`}>Email address</label>
                </div>
              </div>

              <div className="input-group">
                <span className="input-icon">
                  <FaLock />
                </span>
                <div className="input-stack">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className={`form-input ${password ? 'filled' : ''}`}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  <label className={`floating-label ${password ? 'filled' : ''}`}>Password</label>
                </div>
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>

              <div className="login-actions">
                <label className="login-remember">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                  />
                  <span>Remember session</span>
                </label>
              </div>

              <button className="login-submit" type="submit" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign in to RMS'}
              </button>
            </form>

            <div className="login-footer">
              <span>© 2026 8th Street Rental Management System</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default Login
