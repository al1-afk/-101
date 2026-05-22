import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Landing() {
  const navigate = useNavigate()

  useEffect(() => {
    document.title = 'www.tagparamedic.com'
    const prev = document.body.style.background
    document.body.style.background = '#fff'
    return () => { document.body.style.background = prev }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'l') navigate('/auth')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#fff',
        color: '#202124',
        fontFamily: '"Google Sans","Roboto","Helvetica Neue",Arial,sans-serif',
        WebkitFontSmoothing: 'antialiased',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          maxWidth: 600,
          margin: '0 auto',
          padding: '156px 40px 0',
        }}
      >
        <svg
          onDoubleClick={() => navigate('/auth')}
          xmlns="http://www.w3.org/2000/svg"
          width="72"
          height="72"
          viewBox="0 0 72 72"
          style={{ marginBottom: 40, cursor: 'default' }}
          aria-hidden="true"
        >
          <path
            fill="#bdc1c6"
            d="M52 18.5 41.5 8H20a4 4 0 0 0-4 4v48a4 4 0 0 0 4 4h32a4 4 0 0 0 4-4V22.5L52 18.5zM40 10.5 53.5 24H42a2 2 0 0 1-2-2V10.5z"
          />
          <path
            fill="#fff"
            d="M40 10.5V22a2 2 0 0 0 2 2h11.5L40 10.5z"
          />
          <circle cx="29" cy="40" r="2" fill="#fff" />
          <circle cx="43" cy="40" r="2" fill="#fff" />
          <path
            d="M28 51c2-3 5-4 8-4s6 1 8 4"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>

        <h1
          style={{
            fontSize: 28,
            fontWeight: 400,
            lineHeight: 1.3,
            margin: 0,
            color: '#202124',
          }}
        >
          Ce site est inaccessible
        </h1>

        <p
          style={{
            marginTop: 24,
            fontSize: 15,
            lineHeight: 1.5,
            color: '#5f6368',
          }}
        >
          Vérifiez si l'adresse <strong style={{ color: '#202124', fontWeight: 500 }}>www.tagparamedic.com</strong> est correcte.
        </p>

        <p
          style={{
            marginTop: 64,
            fontSize: 11,
            letterSpacing: '0.4px',
            color: '#5f6368',
            textTransform: 'uppercase',
          }}
        >
          DNS_PROBE_FINISHED_NXDOMAIN
        </p>
      </div>

      <button
        onClick={() => window.location.reload()}
        style={{
          position: 'fixed',
          right: 40,
          bottom: 32,
          background: '#1a73e8',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          padding: '10px 22px',
          fontSize: 14,
          fontFamily: 'inherit',
          fontWeight: 500,
          cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(60,64,67,.3),0 1px 3px 1px rgba(60,64,67,.15)',
        }}
        onMouseOver={(e) => (e.currentTarget.style.background = '#1765cc')}
        onMouseOut={(e) => (e.currentTarget.style.background = '#1a73e8')}
      >
        Actualiser
      </button>
    </div>
  )
}
