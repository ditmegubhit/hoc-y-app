import { useQuery } from '@tanstack/react-query'

export function useSearch(keyword: string) {
  return useQuery({
    queryKey: ['search', keyword],
    queryFn: () => window.api.search.query(keyword),
    enabled: keyword.trim().length > 0
  })
}
