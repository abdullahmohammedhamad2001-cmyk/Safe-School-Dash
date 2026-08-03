"use client"
import React,{useState} from 'react'
import '../style.css'
import { useRouter } from 'next/navigation'
import { collection,getDocs,query,where } from "firebase/firestore"
import { DB } from '../../firebaseConfig'
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
    setLoading(true)

    try {
      // Query schoolAdmins first
      const q1 = query(
        collection(DB, "schoolAdmins"),
        where("username", "==", username),
        where("password", "==", password)
      );
      const snap1 = await getDocs(q1);

      if (!snap1.empty) {
        const userData = snap1.docs[0].data()
        localStorage.setItem('adminLoggedIn', true)
        localStorage.setItem('adminDahboardName', userData?.name)
        localStorage.setItem('adminSchoolID', userData?.school_id)
        localStorage.setItem('adminSchoolName', userData?.school)
        localStorage.setItem('schoolLogo', userData?.school_logo)
        localStorage.setItem('schoolCountry', userData?.country)
        localStorage.setItem('adminRole', userData?.role || 'admin')
        setTimeout(() => { router.push("/"); }, 300);
        return;
      }

      // Fallback: check Safe Team admins
      const q2 = query(
        collection(DB, "admins"),
        where("username", "==", username),
        where("password", "==", password)
      );
      const snap2 = await getDocs(q2);

      if (!snap2.empty) {
        const userData = snap2.docs[0].data()
        localStorage.setItem('adminLoggedIn', true)
        localStorage.setItem('adminDahboardName', userData?.dashboard_name)
        localStorage.setItem('adminSchoolID', 'ALL')
        localStorage.setItem('adminSchoolName', 'Safe Team')
        localStorage.setItem('schoolLogo', '')
        localStorage.setItem('schoolCountry', 'iraq')
        localStorage.setItem('adminRole', 'safe_team')
        setTimeout(() => { router.push("/"); }, 300);
        return;
      }

      setError('يرجى التثبت من المعلومات المدرجة')
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
          <ClipLoader size={40} color="#000" />
          <p>جاري تسجيل الدخول...</p>
        </div>
      )}
    </div>
  );
}

export default Login