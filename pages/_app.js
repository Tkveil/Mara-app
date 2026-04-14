import '../styles/globals.css'
import { useEffect } from 'react'

export default function App({ Component, pageProps }) {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('Mara SW registered:', reg.scope);
        })
        .catch((err) => {
          console.log('Mara SW failed:', err);
        });
    }
  }, []);

  return <Component {...pageProps} />
}
