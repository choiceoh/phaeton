'use client'

import React from 'react'

const AdminBackLink: React.FC = () => {
  return (
    <a
      href="/projects"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 16px',
        margin: '8px 16px',
        fontSize: '14px',
        color: '#3b82f6',
        textDecoration: 'none',
        borderRadius: '4px',
        border: '1px solid #3b82f6',
        textAlign: 'center',
        justifyContent: 'center',
      }}
    >
      ← 프로젝트 뷰로 이동
    </a>
  )
}

export default AdminBackLink
