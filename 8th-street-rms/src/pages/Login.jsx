import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FaEnvelope, FaLock } from 'react-icons/fa'
import { supabase } from '../supabase'
import './Login.css'
import logo from '../assets/logo.jpg'

function Login({ user, onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (user) {
      navigate('/')
    }
  }, [user, navigate])

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
    <div className="auth-page">
      <div className="auth-backdrop">
        <span className="glow glow-1" />
        <span className="glow glow-2" />
        <span className="glow glow-3" />
      </div>

      <div className="auth-layout">
        <motion.main
          className="auth-card"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        >
          <div className="auth-header">
            {/* ── Logo ── */}
            <img
              src={logo}
              alt="8th Street RMS Logo"
              className="auth-logo-img"
            />
            <div className="auth-copy">
              <p className="auth-system">8th Street RMS</p>
              <h1>Welcome Back</h1>
              <p className="auth-subtitle">
                Sign in to access your rental management dashboard
              </p>
            </div>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <div className="auth-error">{error}</div>}

            <label className="field-group">
              <span>Email address</span>
              <div className="field-input">
                <FaEnvelope className="field-icon" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Enter your email"
                  required
                />
              </div>
            </label>

            <label className="field-group">
              <span>Password</span>
              <div className="field-input">
                <FaLock className="field-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  className="toggle-password"
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            <div className="actions-row">
              <label className="remember-label">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                />
                Remember session
              </label>
            </div>

            <button className="auth-button" type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in to RMS'}
            </button>
          </form>

          <div className="auth-footer">
            <div className="auth-footer-item">Manage Properties</div>
            <div className="auth-footer-item">Manage Tenants</div>
            <div className="auth-footer-item">Track Payments</div>
            <div className="auth-footer-item">Generate Reports</div>
          </div>

          <p className="auth-note">© 2026 8th Street Rental Management System</p>
        </motion.main>
      </div>
    </div>
  )
}

export default Login