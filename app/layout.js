import React from 'react'
import './style.css'
import { Cairo } from 'next/font/google'
import { GlobalStateProvider } from '../globalState'
import { ThemeProvider } from '../components/ThemeProvider'

const cairo = Cairo({
  subsets: ['latin', 'arabic'],
  weight:['400','700'],
  display:'swap'
})

export const metadata = {
  title: "SAFE",
  description: "Iraqi transportation super app",
};


// Sets the saved (or system) theme before first paint to avoid a light flash
const themeScript = `(function(){try{var t=localStorage.getItem('dashboardTheme');if(t!=='dark'&&t!=='light'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function RootLayout({children}) {
  return (
    <html lang="en" className={cairo.className} suppressHydrationWarning>
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
