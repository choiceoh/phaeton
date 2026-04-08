import type { Access } from 'payload'

export const isProjectMember: Access = ({ req }) =>
  ['director', 'pm', 'engineer'].includes(req.user?.role as string)
