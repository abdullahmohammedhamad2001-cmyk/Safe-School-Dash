"use client"
import React,{useState} from 'react'
import '../style.css'
import { useRouter } from 'next/navigation'
import { supabase, emailFor, loadSession, clearSessionCache } from '../../supabaseClient'
import ClipLoader from "react-spinners/ClipLoader"
import Image from 'next/image'
import logo_image from '../../images/notification-icon.png'

const Login = () => {
  const [username,setUsername] = useState('')
  const [password,setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading,setLoading] = useState(false)

  const router = useRouter()

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // School accounts first, then Safe Team accounts
      let signIn = await supabase.auth.signInWithPassword({
        email: emailFor('school_admin', username),
        password,
      })

      if (signIn.error) {
        signIn = await supabase.auth.signInWithPassword({
          email: emailFor('team', username),
          password,
        })
      }

      if (signIn.error) throw new Error('invalid')

      // Only school admins and Safe Team may use this dashboard (not teachers or drivers)
      const session = await loadSession()

      if (!session) {
        await supabase.auth.signOut()
        clearSessionCache()
        throw new Error('invalid')
      }

      router.push("/")
    } catch (err) {
      setError('يرجى التثبت من المعلومات المدرجة')
    } finally {
      setLoading(false)
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <Image
            src={logo_image}
            width={88}
            height={88}
            alt="شعار لوحة تحكم المدارس"
            priority
          />
        </div>

        <h2 className="login-title">تسجيل الدخول</h2>

        {error && <p className="login-error">{error}</p>}

        <form className="login-form" onSubmit={handleLogin}>
          <input
            placeholder="اسم المستخدم"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <input
            placeholder="كلمة المرور"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {loading ? (
            <div className="login-btn loading">
              <ClipLoader size={14} color="#fff" />
            </div>
          ) : (
            <button type="submit" className="login-btn">
             دخول
            </button>
          )}
        </form>
      </div>

      {loading && (
        <div className="page-loading-overlay">
          <ClipLoader size={40} color="#b8862a" />
          <p>جاري تسجيل الدخول...</p>
        </div>
      )}
    </div>
  );
}

export default Login