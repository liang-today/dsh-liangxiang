export interface DeployTarget {
  role: 'standby' | 'production'
  remote: string
  host: string
  port: string
  expectedHostname: string
  healthUrl: string
  healthResolve: string
}
export function readDeployEnv(env: Record<string, string | undefined>, filename: string): Record<string, string>
export function resolveDeployTarget(env: Record<string, string | undefined>, resolveHost?: (host: string, options: { all: true }) => Promise<Array<{ address: string }>>): Promise<DeployTarget>
export function verifyHostname(expected: string, actual: string): void
export function verifyReceipt(receipt: string, sha: string, build: string): void
export function verifyHealth(value: unknown, version: string, build: string): void
