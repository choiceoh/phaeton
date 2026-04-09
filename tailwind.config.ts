import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx}', './node_modules/@tremor/**/*.{js,ts,jsx,tsx}'],
  safelist: [
    // 프로젝트 유형·상태 색상 — Tremor color prop으로 동적 사용
    { pattern: /bg-(amber|sky|emerald|violet|green|blue|red|gray)-(50|100|200|300|400|500|600|700)/ },
    { pattern: /text-(amber|sky|emerald|violet|green|blue|red|gray)-(50|100|200|300|400|500|600|700|800|900)/ },
    { pattern: /border-(amber|sky|emerald|violet|green|blue|red|gray)-(200|300|400|500)/ },
    { pattern: /ring-(amber|sky|emerald|violet|green|blue|red|gray)-(200|300|400|500)/ },
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Pretendard Variable"',
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'Roboto',
          'sans-serif',
        ],
      },
      colors: {
        ivory: {
          50: '#FAF9F5',
          100: '#F4F3EE',
        },
        // Tremor 시맨틱 색상 오버라이드 — 웜톤 통일
        tremor: {
          background: {
            DEFAULT: '#FAF9F5',
            muted: '#F4F3EE',
            subtle: '#E7E5E0',
            emphasis: '#57534E',
          },
          border: {
            DEFAULT: '#D6D3D1',
          },
          ring: {
            DEFAULT: '#D6D3D1',
          },
          content: {
            DEFAULT: '#78716C',
            subtle: '#A8A29E',
            emphasis: '#292524',
            strong: '#1C1917',
            inverted: '#FAF9F5',
          },
          brand: {
            DEFAULT: '#57534E',
            muted: '#D6D3D1',
            subtle: '#A8A29E',
            emphasis: '#44403C',
            inverted: '#FAF9F5',
            faint: '#F4F3EE',
          },
        },
      },
    },
  },
  plugins: [],
}

export default config
