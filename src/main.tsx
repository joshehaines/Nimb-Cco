import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// VITE_ROUTER=hash is used for static hosts that cannot rewrite deep links (e.g. artifact hosting).
const useHash = import.meta.env.VITE_ROUTER === 'hash'
const base = import.meta.env.BASE_URL.replace(/\/$/, '')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {useHash ? (
      <HashRouter>
        <App />
      </HashRouter>
    ) : (
      <BrowserRouter basename={base.startsWith('/') ? base : ''}>
        <App />
      </BrowserRouter>
    )}
  </React.StrictMode>,
)
