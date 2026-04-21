import type { Configuration } from 'electron-builder'

const config: Configuration = {
  appId: 'ai.nexusmind.app',
  productName: 'NexusMind',
  directories: {
    output: 'dist'
  },
  files: [
    'out/**/*'
  ],
  mac: {
    target: ['dmg', 'zip']
  },
  win: {
    target: ['nsis', 'zip']
  },
  linux: {
    target: ['AppImage', 'deb', 'rpm']
  }
}

export default config
