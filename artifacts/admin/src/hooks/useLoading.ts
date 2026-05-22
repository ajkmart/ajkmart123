/**
 * Aggregates multiple loading boolean flags into a single boolean.
 * Returns true if any of the provided values is truthy.
 *
 * Usage:
 *   const isLoading = useLoading(usersQuery.isLoading, statsQuery.isLoading);
 */
export function useLoading(...flags: boolean[]): boolean {
  return flags.some(Boolean);
}
