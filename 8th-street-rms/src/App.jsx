import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { FaMoon, FaSun } from 'react-icons/fa'

import Sidebar from './components/Sidebar'
import ProtectedRoute from './components/ProtectedRoute'
import './styles/forms.css'
import './styles/table.css'

import Dashboard from './pages/Dashboard'
import Rooms from './pages/Rooms'
import Tenants from './pages/Tenants'
import Reservations from './pages/Reservations'
import Payments from './pages/Payments'
import Inquiries from './pages/Inquiries'
import Reports from './pages/Reports'
import TenantAccount from './pages/TenantAccount'
import Login from './pages/Login'
import { supabase } from './supabase'

function App() {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('rms-theme') || 'light')
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  const isLoginPage = location.pathname === '/login'
  const handleToggle = () => setCollapsed((v) => !v)
  const toggleTheme = () => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))

  useEffect(() => {
    localStorage.setItem('rms-theme', theme)
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    const initAuth = async () => {
      const {
        data: { session }
      } = await supabase.auth.getSession()

      setUser(session?.user ?? null)
      setAuthLoading(false)
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
    })

    initAuth()

    return () => {
      authListener?.subscription?.unsubscribe()
    }
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    window.location.href = '/login'
  }

  return (
      <div className="app-shell">
        {user && <Sidebar collapsed={collapsed} onToggle={handleToggle} user={user} onLogout={handleLogout} />}

        <main
          className="app-content"
          style={{
            marginLeft: user ? (collapsed ? '112px' : '282px') : 0,
            padding: isLoginPage ? 0 : '24px'
          }}
        >
          {!isLoginPage && (
            <div className="app-toolbar">
              <button className="theme-toggle" type="button" onClick={toggleTheme}>
                {theme === 'dark' ? <FaSun /> : <FaMoon />}
                <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
              </button>
            </div>
          )}

          <Routes>
            <Route path="/login" element={<Login user={user} onLogin={setUser} />} />

            <Route element={<ProtectedRoute user={user} loading={authLoading} />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/rooms" element={<Rooms />} />
              <Route path="/tenants" element={<Tenants />} />
              <Route path="/tenant-account/:id" element={<TenantAccount />} />
              <Route path="/reservations" element={<Reservations />} />
              <Route path="/payments" element={<Payments />} />
              <Route path="/inquiries" element={<Inquiries />} />
              <Route path="/reports" element={<Reports />} />
            </Route>

            <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
          </Routes>
        </main>
      </div>
  )
}

export default App
