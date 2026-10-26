import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'

export type CoreState = 'IDLE' | 'EXECUTING' | 'ALERT'

// ─── GLSL: shared vertex ─────────────────────────────────────────────────────
const VERT = /* glsl */`
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// ─── GLSL: crystal brain ─────────────────────────────────────────────────────
const CRYSTAL_FRAG = /* glsl */`
  uniform float u_time;
  uniform float u_intensity;  // 0..1 — state driven
  uniform float u_alert;      // 0..1 — alert red factor
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  // Thin line: bright near integer crossings
  float gridLine(float x) {
    float f = fract(x);
    float d = min(f, 1.0 - f);
    return 1.0 - smoothstep(0.0, 0.085, d);
  }

  // Organic neural lattice: perturbed coordinates break the geographic-globe look
  float neuralVeins(vec3 p, float t) {
    // Perturb position to make grid organic/irregular
    vec3 perturb = sin(p.yzx * 2.8 + t * 0.12) * 0.18;
    vec3 pOrganic = p + perturb;

    // Scale 5 → 5-6 line cycles visible on sphere r=0.58
    vec3 q = pOrganic * 5.0 + t * vec3(0.08, -0.06, 0.07);
    float l1 = gridLine(q.x) + gridLine(q.y) * 0.8 + gridLine(q.z) * 0.7;

    // Denser diagonal grid for secondary structure
    vec3 q2 = (p + sin(p.zxy * 1.9 - t * 0.09) * 0.14) * 3.8 + t * vec3(-0.05, 0.07, -0.04);
    float l2 = (gridLine(q2.x + q2.y) + gridLine(q2.y - q2.z)) * 0.40;

    return min(l1 + l2, 1.0);
  }

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float cosA = max(dot(normalize(vNormal), viewDir), 0.0);
    float fresnel = pow(1.0 - cosA, 2.5);

    float veins = neuralVeins(vWorldPos, u_time);

    float r = length(vWorldPos);
    float wave = pow(sin(r * 9.0 - u_time * (2.5 + u_intensity * 1.8)) * 0.5 + 0.5, 3.0)
               * u_intensity * 0.30;

    // Deep blue crystal — only blue channel gets bright; no warm white blooming
    vec3 baseColor = vec3(0.005, 0.018, 0.12);
    vec3 veinBlue  = mix(vec3(0.04, 0.22, 0.88), vec3(0.12, 0.55, 1.0), fresnel);
    vec3 veinAlert = mix(vec3(0.70, 0.08, 0.03), vec3(0.88, 0.28, 0.06), fresnel);
    vec3 veinColor = mix(veinBlue, veinAlert, u_alert);
    // Rim: stays in blue spectrum (no cross-channel white)
    vec3 rimLight  = mix(vec3(0.04, 0.18, 0.90), vec3(0.08, 0.38, 1.0), fresnel);

    vec3 col = baseColor
             + veinColor * veins * (0.50 + u_intensity * 0.42)
             + rimLight * fresnel * (0.30 + u_intensity * 0.20)
             + vec3(0.0, 0.10, 0.48) * wave;

    // Solid glass look — less transparent at center
    float alpha = 0.90 + fresnel * 0.10;
    gl_FragColor = vec4(col, alpha);
  }
`

// ─── GLSL: inner nucleus ─────────────────────────────────────────────────────
const NUCLEUS_FRAG = /* glsl */`
  uniform float u_time;
  uniform float u_intensity;
  uniform float u_alert;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float cosA = max(dot(normalize(vNormal), viewDir), 0.0);
    float fresnel = pow(1.0 - cosA, 1.5);

    // Spinning pattern inside the nucleus
    float phi   = atan(vWorldPos.z, vWorldPos.x);
    float theta = asin(clamp(vWorldPos.y / max(length(vWorldPos), 0.001), -1.0, 1.0));
    float spin  = sin(phi * 5.0 + u_time * 2.2) * cos(theta * 4.0 - u_time * 1.8);
    float glow  = pow(abs(spin), 0.5);

    float pulse = (sin(u_time * (3.0 + u_intensity * 2.0)) * 0.5 + 0.5) * u_intensity;

    // Nucleus: dim inner glow, max ~0.6 so it doesn't overpower the crystal
    vec3 coldWhite = vec3(0.55, 0.74, 1.00);
    vec3 alertRed  = vec3(0.85, 0.15, 0.04);
    vec3 baseCol   = mix(coldWhite, alertRed, u_alert);
    vec3 col = baseCol * (0.35 + pulse * 0.18 + glow * 0.10);

    float alpha = 0.92 + fresnel * 0.08;
    gl_FragColor = vec4(col, alpha);
  }
`

// ─── GLSL: atmospheric shell ─────────────────────────────────────────────────
const ATMO_FRAG = /* glsl */`
  uniform float u_time;
  uniform float u_intensity;
  uniform float u_alert;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float cosA = max(dot(normalize(vNormal), viewDir), 0.0);
    float fresnel = pow(1.0 - cosA, 2.2);

    float breathe = sin(u_time * 1.4) * 0.12 + 0.5;
    float alpha = fresnel * (0.07 + u_intensity * 0.09) * breathe;

    vec3 blueAtmo  = vec3(0.05, 0.20, 0.80);
    vec3 alertAtmo = vec3(0.60, 0.08, 0.04);
    vec3 col = mix(blueAtmo, alertAtmo, u_alert * 0.6) + vec3(0.3, 0.5, 1.0) * fresnel * 0.5;

    gl_FragColor = vec4(col, alpha);
  }
`

// ─── INNER NUCLEUS ────────────────────────────────────────────────────────────
interface CoreProps { intensity: number; alertFactor: number; speed: number }

function InnerNucleus({ intensity, alertFactor, speed }: CoreProps) {
  const ref = useRef<THREE.Mesh>(null)

  const uniforms = useMemo(() => ({
    u_time:      { value: 0 },
    u_intensity: { value: intensity },
    u_alert:     { value: alertFactor },
  }), []) // eslint-disable-line

  useFrame(({ clock }) => {
    if (!ref.current) return
    const mat = ref.current.material as THREE.ShaderMaterial
    mat.uniforms.u_time.value      = clock.getElapsedTime() * speed
    mat.uniforms.u_intensity.value = intensity
    mat.uniforms.u_alert.value     = alertFactor
    const scale = 1 + 0.18 * Math.sin(clock.getElapsedTime() * 3.5 * speed) * intensity
    ref.current.scale.setScalar(scale)
  })

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.16, 32, 32]} />
      <shaderMaterial
        vertexShader={VERT}
        fragmentShader={NUCLEUS_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  )
}

// ─── CRYSTAL BRAIN ────────────────────────────────────────────────────────────
function CrystalBrain({ intensity, alertFactor, speed }: CoreProps) {
  const ref = useRef<THREE.Mesh>(null)

  const uniforms = useMemo(() => ({
    u_time:      { value: 0 },
    u_intensity: { value: intensity },
    u_alert:     { value: alertFactor },
  }), []) // eslint-disable-line

  useFrame(({ clock }) => {
    if (!ref.current) return
    const mat = ref.current.material as THREE.ShaderMaterial
    mat.uniforms.u_time.value      = clock.getElapsedTime() * speed
    mat.uniforms.u_intensity.value = intensity
    mat.uniforms.u_alert.value     = alertFactor
    // Slow organic rotation — NOT axis-aligned (avoids "planet" look)
    ref.current.rotation.x = clock.getElapsedTime() * 0.04 * speed
    ref.current.rotation.y = clock.getElapsedTime() * 0.07 * speed
    ref.current.rotation.z = Math.sin(clock.getElapsedTime() * 0.025) * 0.06
  })

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.58, 64, 64]} />
      <shaderMaterial
        vertexShader={VERT}
        fragmentShader={CRYSTAL_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

// ─── ATMOSPHERIC SHELL ────────────────────────────────────────────────────────
function AtmosphericShell({ intensity, alertFactor, speed }: CoreProps) {
  const ref = useRef<THREE.Mesh>(null)

  const uniforms = useMemo(() => ({
    u_time:      { value: 0 },
    u_intensity: { value: intensity },
    u_alert:     { value: alertFactor },
  }), []) // eslint-disable-line

  useFrame(({ clock }) => {
    if (!ref.current) return
    const mat = ref.current.material as THREE.ShaderMaterial
    mat.uniforms.u_time.value      = clock.getElapsedTime() * speed
    mat.uniforms.u_intensity.value = intensity
    mat.uniforms.u_alert.value     = alertFactor
    ref.current.rotation.y = clock.getElapsedTime() * 0.02 * speed
  })

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.92, 40, 40]} />
      <shaderMaterial
        vertexShader={VERT}
        fragmentShader={ATMO_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.BackSide}
      />
    </mesh>
  )
}

// ─── NEURAL EXTENSIONS (organic filaments) ───────────────────────────────────
function NeuralExtensions({ intensity, alertFactor, count = 14 }: { intensity: number; alertFactor: number; count?: number }) {
  const groupRef = useRef<THREE.Group>(null)

  // Build filament curves once (deterministic from index seed)
  const filaments = useMemo(() => {
    const rng = (seed: number) => {
      let s = seed * 1664525 + 1013904223
      s = (s ^ (s >>> 16)) * 0x45d9f3b
      return ((s ^ (s >>> 16)) & 0xffff) / 0xffff
    }

    return Array.from({ length: count }, (_, i) => {
      // Start point on sphere surface
      const theta0 = rng(i * 7 + 1) * Math.PI * 2
      const phi0   = Math.acos(2 * rng(i * 7 + 2) - 1)
      const r0 = 0.56
      const p0 = new THREE.Vector3(
        r0 * Math.sin(phi0) * Math.cos(theta0),
        r0 * Math.sin(phi0) * Math.sin(theta0),
        r0 * Math.cos(phi0),
      )

      // Control point — organic curve outward
      const jitter = 0.3 + rng(i * 7 + 3) * 0.4
      const p1 = p0.clone().multiplyScalar(1.4 + jitter).add(
        new THREE.Vector3(
          (rng(i * 7 + 4) - 0.5) * 0.6,
          (rng(i * 7 + 5) - 0.5) * 0.6,
          (rng(i * 7 + 6) - 0.5) * 0.6,
        )
      )

      // Tip — extends further
      const p2 = p1.clone().multiplyScalar(1.3 + rng(i * 7 + 7) * 0.5).add(
        new THREE.Vector3(
          (rng(i * 7 + 8) - 0.5) * 0.5,
          (rng(i * 7 + 9) - 0.5) * 0.5,
          (rng(i * 7 + 10) - 0.5) * 0.5,
        )
      )

      const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2)
      const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.007, 4, false)

      return {
        geo:   tubeGeo,
        phase: rng(i * 7 + 11) * Math.PI * 2,
        speed: 0.8 + rng(i * 7 + 12) * 0.6,
      }
    })
  }, [count])

  const meshRefs = useRef<(THREE.Mesh | null)[]>([])

  const idleColor   = new THREE.Color('#0055dd')
  const alertColor  = new THREE.Color('#cc2200')

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    filaments.forEach((f, i) => {
      const mesh = meshRefs.current[i]
      if (!mesh) return
      const mat = mesh.material as THREE.MeshBasicMaterial
      const pulse = 0.14 + 0.26 * Math.abs(Math.sin(t * f.speed + f.phase)) * intensity
      mat.opacity = pulse
      // Color is set live so alert transitions work
      mat.color.lerpColors(idleColor, alertColor, alertFactor)
    })
  })

  return (
    <group ref={groupRef}>
      {filaments.map((f, i) => (
        <mesh
          key={i}
          ref={el => { meshRefs.current[i] = el }}
          geometry={f.geo}
        >
          <meshBasicMaterial
            color="#0055dd"
            transparent
            opacity={0.18}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}

// ─── PARTICLE CLOUD ───────────────────────────────────────────────────────────
function NeuralParticles({ intensity }: { intensity: number }) {
  const ref = useRef<THREE.Points>(null)

  const positions = useMemo(() => {
    const n = 160
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(2 * Math.random() - 1)
      const r  = 0.95 + Math.random() * 0.85
      pos[i*3]   = r * Math.sin(ph) * Math.cos(th)
      pos[i*3+1] = r * Math.sin(ph) * Math.sin(th)
      pos[i*3+2] = r * Math.cos(ph)
    }
    return pos
  }, [])

  useFrame(({ clock }) => {
    if (!ref.current) return
    ref.current.rotation.y  =  clock.getElapsedTime() * 0.022
    ref.current.rotation.x  =  Math.sin(clock.getElapsedTime() * 0.009) * 0.06
    ;(ref.current.material as THREE.PointsMaterial).opacity =
      0.12 + 0.10 * intensity + 0.05 * Math.sin(clock.getElapsedTime() * 1.2)
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={positions.length / 3}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#0033aa"
        size={0.010}
        transparent
        opacity={0.12}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}

// ─── SCENE ────────────────────────────────────────────────────────────────────
interface SceneProps { state: CoreState }

function NeuralScene({ state }: SceneProps) {
  // State → animation params
  const intensity   = state === 'EXECUTING' ? 1.0 : state === 'ALERT' ? 0.80 : 0.38
  const alertFactor = state === 'ALERT' ? 1.0 : 0
  const speed       = state === 'EXECUTING' ? 1.8 : state === 'ALERT' ? 1.4 : 0.75

  // Point light from nucleus
  const nucLight = useRef<THREE.PointLight>(null)
  useFrame(({ clock }) => {
    if (!nucLight.current) return
    const t = clock.getElapsedTime()
    const base = state === 'EXECUTING' ? 1.6 : state === 'ALERT' ? 1.2 : 0.6
    nucLight.current.intensity = base + Math.sin(t * (2.5 + intensity * 2)) * base * 0.22
    nucLight.current.color.set(state === 'ALERT' ? '#ff3300' : '#0055ff')
  })

  return (
    <>
      {/* Minimal cool lighting */}
      <ambientLight intensity={0.04} color="#020818" />
      <pointLight ref={nucLight} position={[0, 0, 0]} color="#0055ff" intensity={0.6} distance={5} decay={2} />
      <pointLight position={[0, 3, 2]}   color="#001a44" intensity={0.8} decay={2} />
      <pointLight position={[-2, -1, 1]} color="#000c22" intensity={0.5} decay={2} />

      {/* Core layers — inside out */}
      <AtmosphericShell intensity={intensity} alertFactor={alertFactor} speed={speed} />
      <NeuralExtensions  intensity={intensity} alertFactor={alertFactor} />
      <NeuralParticles   intensity={intensity} />
      <CrystalBrain      intensity={intensity} alertFactor={alertFactor} speed={speed} />
      <InnerNucleus      intensity={intensity} alertFactor={alertFactor} speed={speed} />

      {/* Bloom: only nucleus + bright vein peaks will exceed threshold */}
      <EffectComposer>
        <Bloom
          intensity={0.45}
          luminanceThreshold={0.72}
          luminanceSmoothing={0.06}
          radius={0.65}
          mipmapBlur
        />
      </EffectComposer>
    </>
  )
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
interface NeuralHadesCoreProps {
  state?: CoreState
  className?: string
  style?: React.CSSProperties
}

export default function NeuralHadesCore({
  state = 'IDLE',
  className,
  style,
}: NeuralHadesCoreProps): JSX.Element {
  return (
    <Canvas
      camera={{ position: [0, 0.2, 3.2], fov: 52 }}
      gl={{
        antialias:           true,
        alpha:               true,
        toneMapping:         THREE.LinearToneMapping,
        toneMappingExposure: 1.0,
      }}
      style={{ background: 'transparent', ...style }}
      className={className}
    >
      <NeuralScene state={state} />
    </Canvas>
  )
}
