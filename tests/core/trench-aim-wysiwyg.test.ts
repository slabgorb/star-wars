// tests/core/trench-aim-wysiwyg.test.ts
//
// Story sw5-6 — RED, ROUND 2 (O'Brien / TEA). The test that should have existed all along.
//
// == WHY THIS FILE EXISTS =====================================================
//
// Round 1 shipped 1018/1018 green with the trench's entire scoring path dead. The Thought
// Police fired through the REAL aim path and found that every shootable obstacle had become
// unhittable: on `origin/develop` 6 of 7 died when you aimed at them; after the trench was
// pinned, 0 of 7 did.
//
// The cause: sw5-6 raised the pilot's eye to TRENCH_EYE_SEAT (768) and re-anchored the
// furniture to 768/1536 — but player bolts still spawned at `COCKPIT = [0,0,0]`, the trench
// FLOOR. The crosshair ray and the bolt ray came apart by 768 units. Turrets sit at exactly
// eye height, so the crosshair lands dead on them and the bolt sails 768 units beneath.
//
// My suite could not see it, and that is the deeper defect. Every shooting test in this repo
// goes through `boltOn()` (tests/core/trench-obstacles.test.ts), which fabricates the obstacle
// AND the projectile at the same hardcoded position — bolt already on top of target, aim never
// involved. A test like that cannot fail when aiming breaks. It also still uses y=60, the OLD
// eye height, so it does not even describe the object it claims to cover.
//
// **This file fires the gun.** Real `stepGame`, real `input.fire`, real `aimDirection`, real
// station coordinates, crosshair placed exactly where the player would see the target. If what
// you aim at is not what you hit, these fail.
//
// == WHAT THE ROM SAYS ========================================================
//
// The cabinet's gun is ON THE SHIP, and its answer to the exhaust port is not a better shot —
// it is a second weapon.
//
//   WSGUNS.MAC `FRPTGN` ("PLAYERS PROTON TORPEDO GUN") — the torpedo spawns AT THE SHIP:
//       LDA #1 / STA PT.LIV        ;PT IS ALIVE
//       LDD M$TX+M.S1 / ADDD #100  ;JUST A BIT IN FRONT
//       STD PT.X
//       LDD M$TY+M.S1 / STD PT.Y   <- the SHIP's lateral
//       LDD M$TZ+M.S1              <- the SHIP's HEIGHT
//
//   WSLAZR.MAC (the laser/torpedo fork) — the player fires an ordinary aimed LASER; when a
//   laser gets close to the porthole the machine takes over:
//       LDA PT.LZF                 ;PROTON TORP LAZAR FLAG
//       IFGT                       ;?LAZAR GOT CLOSE ENUF TO FIRE PROTON TORPS?
//       JSR FRPTGN                 ;THEN LAUNCH DIRECT HIT PROTON TORPS
//
//   WSGUNS.MAC `MVPTGN` — and the launched torpedo is FUNNELLED into the hole. Each tick it
//   advances (`ADDD #300 ;MOVE FORWARD AHEAD OF SHIP`), is clamped so it never overshoots
//   (`LDD BS.PLC ;THEN STOP ABOVE PORTHOLE`), and both of its offsets are squeezed toward the
//   hole as the forward distance D closes:
//       LDD BS.PLC / SUBD PT.X     ;FORWARD DISTANCE TO HOLE
//       SUBD #1000                 ;GET UPWARD DISTANCE FROM BOTTOM HOLE
//       CMPD PT.Z / IFLT / STD PT.Z    ;WHEN PROTON TORP IS CLOSE, ANGLE INTO HOLE
//       ... JSR ASRD4              ;lateral limit = D/16 — "?DOES GLIDE SLOPE SAY GET CLOSER?"
//
//   The floor is at -0x1000, so `D - 0x1000` is a HEIGHT-ABOVE-FLOOR cap of exactly D: a 45°
//   glide slope. Laterally the cone is D/16. As D → 0 both drive to zero. The torpedo cannot
//   miss — which is why the ROM calls it a DIRECT HIT, and why the cabinet's pilot never has to
//   make the 43.8°-down shot into his own floor that our FOV (60°, so a 30° cone) forbids.
//
// So the acceptance bar, and it is not negotiable:
//   • What you put the crosshair on is what you destroy — at EVERY real station.
//   • The port is winnable from the pilot's seat using only yoke inputs the yoke can produce.
//   • Aiming at empty sky does NOT win the run. (Round 1 hit the port by aiming at NOTHING —
//     the bolt left the floor, ran level down the trench and blundered into a floor plate.)

import { describe, it, expect } from 'vitest'
import { stepGame, enterPhase } from '../../src/core/sim'
import {
  initialState,
  EXHAUST_PORT_DISTANCE,
  PORT_APPROACH_WINDOW,
  type GameState,
  type TrenchObstacle,
} from '../../src/core/state'
import { TRENCH_OBSTACLE_STATIONS } from '../../src/core/trench-obstacles'
import { FOV_Y } from '../../src/core/gameRules'
import type { Vec3 } from '@arcade/shared/math3d'
import type { Input } from '../../src/core/input'

const DT = 1 / 60
const ASPECT = 16 / 9

/**
 * Where a target at world `p` lands on screen, in NDC, seen from the pilot's eye — i.e. exactly
 * where the player puts the crosshair. This inverts the SAME projection the crosshair is drawn
 * under (gameRules: `aimDirection` / `crosshairNdc`), so "aim at it" means what it says.
 *
 * The yoke clamps to [-1, 1]. An |NDC| > 1 therefore means the player CANNOT point at the
 * target at all — the shot is not merely hard, it is unavailable.
 */
function crosshairOn(p: Vec3, eye: Vec3): { aimX: number; aimY: number; reachable: boolean } {
  const f = 1 / Math.tan(FOV_Y / 2)
  const [dx, dy, dz] = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]]
  const depth = -dz
  const aimX = (f * dx) / depth / ASPECT
  const aimY = (f * dy) / depth
  return { aimX, aimY, reachable: Math.abs(aimX) <= 1 && Math.abs(aimY) <= 1 }
}

/** The pilot's eye on trench entry, in world space. */
const seatedEye = (s: GameState): Vec3 => [s.trenchView[0], s.trenchView[1], s.trenchView[2]]

const trench = (over: Partial<GameState> = {}): GameState => ({
  ...enterPhase(initialState(1983), 'trench'),
  mode: 'playing',
  exhaustPort: null,
  trenchObstacles: [],
  projectiles: [],
  ...over,
})

const shootable = TRENCH_OBSTACLE_STATIONS.filter((o) => o.kind !== 'catwalk')

// ---------------------------------------------------------------------------
// The trench's scoring path. This is the regression that shipped green.
// ---------------------------------------------------------------------------

describe('sw5-6 — what you aim at is what you hit (trench obstacles)', () => {
  it('every shootable station is REACHABLE — the yoke can physically point at it', () => {
    // Half the defect is not "the bolt misses" but "the player cannot even aim". Three stations
    // needed aimY of 1.478 / 2.046 / 1.064 against a clamp of 1.0. Catch that as its own failure
    // so the message is honest about which thing is broken.
    const s = trench()
    const eye = seatedEye(s)
    for (const o of shootable) {
      const { aimX, aimY, reachable } = crosshairOn(o.pos as Vec3, eye)
      expect(
        reachable,
        `${o.kind} @ [${o.pos}] needs aim (${aimX.toFixed(2)}, ${aimY.toFixed(2)}) — outside the yoke's [-1,1]`,
      ).toBe(true)
    }
  })

  it.each(shootable.map((o, i) => [`${o.kind} #${i} @ z=${o.pos[2]}`, o] as const))(
    'DESTROYS %s when the crosshair is on it and the trigger is pulled',
    (_label, o: TrenchObstacle) => {
      const s0 = trench({ trenchObstacles: [{ kind: o.kind, pos: [...o.pos] as Vec3 }] })
      const { aimX, aimY } = crosshairOn(o.pos as Vec3, seatedEye(s0))
      const yoke: Input = {
        aimX: Math.max(-1, Math.min(1, aimX)),
        aimY: Math.max(-1, Math.min(1, aimY)),
        fire: true,
        aspect: ASPECT,
      }

      // Hold the trigger on-target through the whole approach. A KILL is the destroyed EVENT —
      // never `trenchObstacles.length === 0`, which also fires when the thing simply scrolls
      // past the cockpit and despawns. (That false positive is exactly what made my first probe
      // of this lie to me.)
      let s = s0
      let killed = false
      for (let i = 0; i < 600 && !killed; i++) {
        s = stepGame(s, yoke, DT)
        if (s.events.some((e) => e.type === 'trench-obstacle-destroyed')) killed = true
        if (s.trenchObstacles.length === 0) break // scrolled past — never hit
      }
      expect(killed, 'the bolt must go where the crosshair points').toBe(true)
    },
  )
})

// ---------------------------------------------------------------------------
// The exhaust port. The run has to be winnable — with a shot the yoke can make.
// ---------------------------------------------------------------------------

describe('sw5-6 — the exhaust port is winnable from the pilot\'s seat', () => {
  /** Fly the trench holding `yoke`, and report whether the run was won. */
  function run(yoke: Input, frames = 900): { won: boolean; portZatWin: number | null } {
    let s = trench({ exhaustPort: { pos: [0, 0, -EXHAUST_PORT_DISTANCE] } })
    for (let i = 0; i < frames; i++) {
      const portZ = s.exhaustPort?.pos[2] ?? null
      const next = stepGame(s, yoke, DT)
      // The run is WON when the port dies: the phase leaves the trench (clearRun) or the
      // death-star-destroyed beat fires.
      if (next.phase !== 'trench' || next.events.some((e) => e.type === 'death-star-destroyed')) {
        return { won: true, portZatWin: portZ }
      }
      s = next
    }
    return { won: false, portZatWin: null }
  }

  it('aiming AT the port wins the run — with a yoke input the yoke can produce', () => {
    // The pilot's eye is 768 above the floor and the port lies IN the floor, so the port sits
    // below the crosshair's rest position. He must aim DOWN at it. At the port's spawn distance
    // that is ~17.7° — well inside the 30° cone — so a reachable shot exists. Fire it.
    const s0 = trench({ exhaustPort: { pos: [0, 0, -EXHAUST_PORT_DISTANCE] } })
    const aim = crosshairOn([0, 0, -EXHAUST_PORT_DISTANCE], seatedEye(s0))
    expect(aim.reachable, `the port needs aim (${aim.aimX.toFixed(2)}, ${aim.aimY.toFixed(2)})`).toBe(true)

    const { won } = run({ aimX: aim.aimX, aimY: aim.aimY, fire: true, aspect: ASPECT })
    expect(won, 'a pilot who aims at the exhaust port and fires must be able to win').toBe(true)
  })

  it('aiming at EMPTY SKY does not win the run', () => {
    // Round 1's absurdity, pinned so it cannot come back. With the gun bolted to the floor, a
    // centred crosshair — pointing at the vanishing point, where there is nothing — sent a bolt
    // running level along the floor that blundered into the port. You won by aiming at nothing,
    // and MISSED by aiming at the target. This is the assertion that forbids that world.
    const { won } = run({ aimX: 0, aimY: 0, fire: true, aspect: ASPECT })
    expect(won, 'a crosshair on empty sky must not destroy the Death Star').toBe(false)
  })

  it('the winning shot lands INSIDE the ROM\'s approach window', () => {
    // sw3-15 pinned the ROM's $800 end-wall window (`sim.ts`: `port[2] >= -PORT_APPROACH_WINDOW`):
    // the entry-shot that used to win every run must not count. Moving the gun must not quietly
    // re-open it — nor may the fix "work" by winning the run from the trench mouth.
    const s0 = trench({ exhaustPort: { pos: [0, 0, -EXHAUST_PORT_DISTANCE] } })
    const aim = crosshairOn([0, 0, -EXHAUST_PORT_DISTANCE], seatedEye(s0))
    const { won, portZatWin } = run({ aimX: aim.aimX, aimY: aim.aimY, fire: true, aspect: ASPECT })

    expect(won).toBe(true)
    expect(portZatWin, 'the port was in play when it died').not.toBeNull()
    expect(
      portZatWin!,
      `the kill landed at z=${portZatWin} — outside the ROM's $800 approach window`,
    ).toBeGreaterThanOrEqual(-PORT_APPROACH_WINDOW)
  })
})
