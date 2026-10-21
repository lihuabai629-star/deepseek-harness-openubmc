/** Official releases qualified through the installed-package protocol tests. @module */

/** Full prerelease versions; unqualified releases fail closed at plugin load. */
export const qualifiedHostVersions: readonly string[] = ['0.1.7-rc.2', '0.2.0-rc.2', '0.2.1-rc.2']

/**
 * Reject versions without installed-package evidence.
 * @param version - Host package's validated complete release version.
 */
export function assertQualifiedHost(version: string): void {
  if (!qualifiedHostVersions.includes(version)) {
    throw new Error(`openUBMC supports qualified DSH versions ${qualifiedHostVersions.join(', ')}. Select a qualified Host version.`)
  }
}
