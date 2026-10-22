import React from 'react'
import './style.css'
import '@fontsource/cairo/latin-400.css'
import '@fontsource/cairo/latin-700.css'
import '@fontsource/cairo/arabic-400.css'
import '@fontsource/cairo/arabic-700.css'
import { GlobalStateProvider } from '../globalState'
import { ThemeProvider } from '../components/ThemeProvider'

const cairoStyle = { fontFamily: "'Cairo', sans-serif" }

export const metadata = {
  title: "SAFE",
  description: "Iraqi transportation super app",
};


// Sets the saved (or system) theme before first paint to avoid a light flash
const themeScript = `(function(){try{var t=localStorage.getItem('dashboardTheme');if(t!=='dark'&&t!=='light'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function RootLayout({children}) {
  return (
    <html lang="en" style={cairoStyle} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body id='app-container'>
        <ThemeProvider>
          <GlobalStateProvider>
            {children}
          </GlobalStateProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
