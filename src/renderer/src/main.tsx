import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { applyTheme, getStoredTheme } from './hooks/useTheme'
import './styles.css'

// Ap dung theme TRUOC khi render de tranh nhay sang roi moi toi luc mo app.
// Khong dung script inline trong index.html vi CSP script-src 'self' se chan.
applyTheme(getStoredTheme())

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
