// Centralised query key factory. Every useQuery / useMutation in the app
// derives its key from here so cache invalidation stays consistent.
//
// Pattern from https://tkdodo.eu/blog/effective-react-query-keys.

export const queryKeys = {
  auth: {
    all: ['auth'] as const,
    me: () => [...queryKeys.auth.all, 'me'] as const,
    users: () => [...queryKeys.auth.all, 'users'] as const,
  },

  subsidiaries: {
    all: ['subsidiaries'] as const,
    list: () => [...queryKeys.subsidiaries.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.subsidiaries.all, 'detail', id] as const,
  },

  departments: {
    all: ['departments'] as const,
    list: () => [...queryKeys.departments.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.departments.all, 'detail', id] as const,
  },

  collections: {
    all: ['collections'] as const,
    list: () => [...queryKeys.collections.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.collections.all, 'detail', id] as const,
    bySlug: (slug: string) => [...queryKeys.collections.all, 'bySlug', slug] as const,
  },

  entries: {
    all: ['entries'] as const,
    list: (slug: string, query?: Record<string, unknown>) =>
      [...queryKeys.entries.all, slug, 'list', query ?? {}] as const,
    detail: (slug: string, id: string) =>
      [...queryKeys.entries.all, slug, 'detail', id] as const,
  },

  process: {
    all: ['process'] as const,
    detail: (collectionId: string) =>
      [...queryKeys.process.all, collectionId] as const,
  },

  comments: {
    all: ['comments'] as const,
    list: (slug: string, recordId: string) =>
      [...queryKeys.comments.all, slug, recordId] as const,
  },

  notifications: {
    all: ['notifications'] as const,
    list: () => [...queryKeys.notifications.all, 'list'] as const,
    unreadCount: () => [...queryKeys.notifications.all, 'unread'] as const,
  },

  members: {
    all: ['members'] as const,
    list: (collectionId: string) => [...queryKeys.members.all, 'list', collectionId] as const,
  },

  history: {
    all: ['history'] as const,
    record: (slug: string, recordId: string) =>
      [...queryKeys.history.all, slug, recordId] as const,
  },

  views: {
    all: ['views'] as const,
    list: (collectionId: string) =>
      [...queryKeys.views.all, collectionId, 'list'] as const,
  },

  savedViews: {
    all: ['savedViews'] as const,
    list: (collectionId: string) =>
      [...queryKeys.savedViews.all, collectionId, 'list'] as const,
  },

  migrations: {
    all: ['migrations'] as const,
    history: (collectionId?: string) =>
      [...queryKeys.migrations.all, 'history', collectionId ?? 'all'] as const,
  },

  automations: {
    all: ['automations'] as const,
    list: (collectionId: string) =>
      [...queryKeys.automations.all, 'list', collectionId] as const,
    detail: (id: string) =>
      [...queryKeys.automations.all, 'detail', id] as const,
    runs: (id: string) =>
      [...queryKeys.automations.all, 'runs', id] as const,
  },
} as const
