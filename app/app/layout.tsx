import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Blueprint3D — 3D Floor Planner',
  description: 'An open-source interactive 3D floor planner powered by Three.js'
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){function n(v){if(v==null)return false;if(typeof v==="object")return n(v.message)||n(v.stack);var t=String(v);return t.indexOf("MetaMask")!==-1||t.indexOf("chrome-extension://")!==-1||t.indexOf("moz-extension://")!==-1||t.indexOf("safari-web-extension://")!==-1}if(window.__ignoreExtensionErrorsInstalled)return;window.__ignoreExtensionErrorsInstalled=true;window.addEventListener("error",function(e){if(n(e.error)||n(e.message)||(e.filename&&e.filename.indexOf("extension://")!==-1)){e.preventDefault();e.stopImmediatePropagation()}},true);window.addEventListener("unhandledrejection",function(e){if(n(e.reason)){e.preventDefault();e.stopImmediatePropagation()}},true);var c=console.error.bind(console);console.error=function(){for(var i=0;i<arguments.length;i++)if(n(arguments[i]))return;c.apply(console,arguments)}})();`
          }}
        />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
