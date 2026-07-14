// tools/music-bake/deploy-assets.test.mjs — RED for sw6-1, AC-8 (UPLOAD).
//
// ⚠ CI TRAP, DELIBERATELY AVOIDED. AC-8's deliverable lives in the ORCHESTRATOR
// repo (`just deploy-assets`, or the manual step written into docs/ops/hosting.md),
// not in star-wars. star-wars is an independent repo whose CI checks it out ALONE —
// so a test that unconditionally reads `../justfile` would go red in star-wars CI
// for a file that repo does not and should not contain.
//
// So: assert when the orchestrator is checked out around us (the dev machine, and
// wherever this story is reviewed), skip with a reason when it is not. The story's
// real acceptance for AC-8 is a live 200, checked in the browser (AC-9).
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const starWars = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const orchestrator = join(starWars, '..')

// We are a subrepo of `arcade` only when the orchestrator's own files sit above us.
const inOrchestrator =
  existsSync(join(orchestrator, 'justfile')) && existsSync(join(orchestrator, '.pennyfarthing'))

describe.skipIf(!inOrchestrator)('sw6-1 AC-8 — there is a way to get the .wav onto R2', () => {
  // There is no automated upload path for the arcade-assets bucket today: CI
  // deploys each app's dist/ only, and the existing sfx/ and speech/ appear to
  // have been placed by hand. A story that bakes four beautiful .wav files and
  // never uploads them leaves the game exactly as silent as it is now.
  it('either ships a deploy-assets recipe, or documents the manual step', () => {
    const justfile = readFileSync(join(orchestrator, 'justfile'), 'utf8')
    const hasRecipe = /^deploy-assets\b/m.test(justfile)

    const hostingPath = join(orchestrator, 'docs', 'ops', 'hosting.md')
    const hosting = existsSync(hostingPath) ? readFileSync(hostingPath, 'utf8') : ''
    const documented = /arcade-assets/.test(hosting) && /music/i.test(hosting)

    expect(
      hasRecipe || documented,
      'AC-8: add a `just deploy-assets` recipe or document the arcade-assets music upload in docs/ops/hosting.md',
    ).toBe(true)
  })

  it('names the music prefix the game actually fetches from', () => {
    // src/shell/audio.ts fetches from .../star-wars/music/ — whatever the upload
    // path is, it has to put the files THERE.
    const audio = readFileSync(join(starWars, 'src', 'shell', 'audio.ts'), 'utf8')
    expect(audio).toMatch(/arcade-assets\.slabgorb\.com\/star-wars\/music\//)

    const justfile = readFileSync(join(orchestrator, 'justfile'), 'utf8')
    const hostingPath = join(orchestrator, 'docs', 'ops', 'hosting.md')
    const hosting = existsSync(hostingPath) ? readFileSync(hostingPath, 'utf8') : ''

    expect(
      /star-wars\/music/.test(justfile) || /star-wars\/music/.test(hosting),
      'AC-8: the upload path must target star-wars/music/ in the arcade-assets bucket',
    ).toBe(true)
  })
})
