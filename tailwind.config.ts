import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './node_modules/@tremor/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ivory: {
          50: '#FAF9F5',
          100: '#F4F3EE',
        },
      },
    },
  },
  plugins: [],
}

export default config
