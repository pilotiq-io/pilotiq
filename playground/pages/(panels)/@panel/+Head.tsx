import { usePageContext } from 'vike-react/usePageContext'
import type { PanelNavigationMeta } from '@pilotiq/panels'

// Fontshare hosts Satoshi (Pilotiq brand font). Google Fonts is the fallback
// for any other family configured via Panel.theme({ fonts }).
const FONTSHARE_FAMILIES: Record<string, string> = {
  Satoshi: 'https://api.fontshare.com/v2/css?f[]=satoshi@300,500,700&display=swap',
}

export default function PanelHead() {
  let fontFamilies: string[] = []

  try {
    const ctx = usePageContext() as { data?: { panelMeta?: PanelNavigationMeta } }
    const fonts = ctx.data?.panelMeta?.theme?.fonts
    if (fonts) {
      const seen = new Set<string>()
      if (fonts.body)    seen.add(fonts.body)
      if (fonts.heading && !seen.has(fonts.heading)) seen.add(fonts.heading)
      fontFamilies = [...seen]
    }
  } catch {
    // pageContext may not be available in all render contexts
  }

  const fontshareLinks: string[] = []
  const googleFamilies: string[] = []
  for (const family of fontFamilies) {
    const fsHref = FONTSHARE_FAMILIES[family]
    if (fsHref) fontshareLinks.push(fsHref)
    else        googleFamilies.push(family)
  }

  const googleHref = googleFamilies.length > 0
    ? `https://fonts.googleapis.com/css2?${googleFamilies.map(f => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700`).join('&')}&display=swap`
    : null

  return (
    <>
      {fontshareLinks.length > 0 && (
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
      )}
      {fontshareLinks.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      {googleHref && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link rel="stylesheet" href={googleHref} />
        </>
      )}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem('panels-theme');if(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
        }}
      />
    </>
  )
}
