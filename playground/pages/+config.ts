import type { Config } from 'vike/types'
import vikeReact from 'vike-react/config'

// `as unknown as Config` is intentional and durable. vike@0.4.250+
// tightened `Config.extends` to expect an `ImportString` template
// literal (e.g. `import:vike-react/config:default`), but vike-react's
// `vike-react/config` default export is still the runtime config object
// (`{ name, require, Loading, onRenderHtml, … }`). The runtime works;
// the type rejects the object form. Drop the cast when vike-react ships
// an `import:` sentinel export from `vike-react/config`.
export default {
  extends: [vikeReact],
} as unknown as Config
