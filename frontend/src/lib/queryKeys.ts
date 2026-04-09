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

  migrations: {
    all: ['migrations'] as const,
    history: (collectionId?: string) =>
      [...queryKeys.migrations.all, 'history', collectionId ?? 'all'] as const,
  },
} as const
