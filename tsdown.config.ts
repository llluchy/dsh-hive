import { clientBundle } from '../../client/tsdown.client.ts'

// Host-only package: emit the node library during the Host pass. The client
// entry is omitted (this package has no browser half).
export default clientBundle('@deepseek-ai/dsh-hive', ['lib/types/index.js', 'lib/types/invariant.js'], { hostPhase: true })
