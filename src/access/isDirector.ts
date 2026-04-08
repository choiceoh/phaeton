import type { Access } from 'payload'

export const isDirector: Access = ({ req }) => req.user?.role === 'director'
