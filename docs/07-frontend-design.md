# HADES OMEGA — Sistema de Diseño y Wireframes

**Versión:** 0.1 (Fase de Planificación)
**Fecha:** Octubre 2026

---

## 1. Sistema de diseño

### 1.1 Paleta de colores

#### Modo oscuro (default)

```css
/* Fondos */
--color-bg-base:      #0A0A0F;   /* Negro obsidiana — fondo principal */
--color-bg-surface:   #12121A;   /* Superficie de cards y paneles */
--color-bg-elevated:  #1A1A26;   /* Elementos elevados, modales */

/* Azul eléctrico — elementos activos, conexiones, estados normales */
--color-electric:     #00D4FF;
--color-electric-dim: #00D4FF33; /* 20% opacidad — halos, fondos de badge */
--color-electric-glow:#00D4FF66; /* 40% opacidad — glow effects */

/* Dorado — identidad HADES, alertas críticas, acentos de premium */
--color-gold:         #FFD700;
--color-gold-dim:     #FFD70033;
--color-gold-glow:    #FFD70066;

/* Texto */
--color-text-primary:   #F0F0FF;  /* Blanco ligeramente azulado */
--color-text-secondary: #8888AA;  /* Texto secundario, labels */
--color-text-muted:     #444466;  /* Placeholders, texto deshabilitado */

/* Semánticos */
--color-success:  #00FF88;  /* Operaciones aprobadas (PERMIT) */
--color-warning:  #FFB800;  /* Escalaciones, alertas */
--color-danger:   #FF3366;  /* Operaciones denegadas (DENY), incidentes */
--color-info:     #00D4FF;  /* Información general */

/* Bordes */
--color-border:       #1E1E30;
--color-border-active:#00D4FF44;
```

#### Modo claro — redefinición de tokens

```css
[data-theme="light"] {
  --color-bg-base:      #F0F0F8;
  --color-bg-surface:   #FFFFFF;
  --color-bg-elevated:  #E8E8F0;
  --color-electric:     #0099CC;
  --color-gold:         #CC9900;
  --color-text-primary:   #0A0A1A;
  --color-text-secondary: #444466;
  --color-text-muted:     #AAAACC;
  --color-border:       #DDDDEE;
  --color-border-active:#0099CC44;
  /* Colores semánticos se mantienen con ligero ajuste de luminancia */
}
```

### 1.2 Tipografía

```css
/* Primaria: monoespaciada — da sensación de terminal, tecnología */
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;

/* Secundaria: sans-serif moderna para textos legibles */
--font-sans: 'Inter', system-ui, sans-serif;

/* Display: para títulos grandes del núcleo y secciones hero */
--font-display: 'Space Grotesk', var(--font-sans);

/* Escalas */
--text-xs:   0.75rem;   /* 12px — labels, badges */
--text-sm:   0.875rem;  /* 14px — texto de apoyo */
--text-base: 1rem;      /* 16px — texto de cuerpo */
--text-lg:   1.125rem;  /* 18px — subtítulos */
--text-xl:   1.25rem;   /* 20px — títulos de sección */
--text-2xl:  1.5rem;    /* 24px — títulos de página */
--text-4xl:  2.25rem;   /* 36px — display */
```

### 1.3 Espaciado y layout

- Grid de 8px (todos los márgenes/paddings múltiplos de 8)
- Breakpoints: `sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`
- Gutter lateral: `24px` en mobile, `32px` en desktop
- Max-width del layout: `1440px`
- Sidebar de agentes: `280px` en desktop, colapsable en tablet, drawer en mobile

### 1.4 Efectos visuales

```css
/* Glow para agentes activos */
.agent-active {
  box-shadow: 0 0 20px var(--color-electric-glow),
              0 0 40px var(--color-electric-dim);
}

/* Glow dorado para HADES */
.hades-core {
  box-shadow: 0 0 30px var(--color-gold-glow),
              0 0 60px var(--color-gold-dim);
}

/* Borde animado para operaciones en revisión CERBERUS */
.cerberus-review {
  border: 1px solid var(--color-electric);
  animation: border-pulse 1.5s ease-in-out infinite;
}
```

---

## 2. Componentes del sistema de diseño

### 2.1 AgentCard

Muestra el estado de un agente individual.

```
┌──────────────────────────────────┐
│  ⬡  CHARON                  ● THINKING  │
│  Compras & Proveedores                   │
│  ─────────────────────────────          │
│  Tarea actual: Evaluar 3 proveedores     │
│  de servidores cloud                     │
│  ─────────────────────────────          │
│  Operaciones hoy: 12   Denials: 0       │
└──────────────────────────────────┘

Estados visuales:
IDLE       → borde sutil, sin glow
THINKING   → pulso azul eléctrico suave
EXECUTING  → glow azul eléctrico activo
WAITING    → parpadeo lento dorado
ERROR      → borde rojo, ícono de alerta
SUSPENDED  → gris, ícono de pausa
```

### 2.2 CERBERUSDecisionBadge

```
PERMIT    →  [✓ PERMIT]   fondo verde oscuro, texto verde
DENY      →  [✗ DENY]     fondo rojo oscuro, texto rojo
ESCALATE  →  [⚠ ESCALATE] fondo dorado oscuro, texto dorado
```

### 2.3 AuditRecordRow

```
┌─────┬──────────────┬───────────┬──────────┬───────────────┐
│ ID  │ Agente       │ Operación │ Decision │ NEAR          │
├─────┼──────────────┼───────────┼──────────┼───────────────┤
│ a1b2│ CHARON       │ PURCHASE  │ ✓ PERMIT │ 🔗 Ver en NEAR│
│ c3d4│ PERSEPHONE   │ BUDGET    │ ✗ DENY   │ —             │
│ e5f6│ CHARON       │ PURCHASE  │ ⚠ ESCAL  │ 🔗 Ver en NEAR│
└─────┴──────────────┴───────────┴──────────┴───────────────┘
```

### 2.4 NEARTransactionBadge

```
[🔗 NEAR Testnet  •  tx: 8xKj...3mNp  •  Block 142,891,034]
```
Al hacer clic → abre `testnet.nearblocks.io/txns/{hash}` en nueva pestaña.

---

## 3. Pantallas del sistema

### 3.1 Pantalla: Núcleo Holográfico (Home / Landing)

```
┌──────────────────────────────────────────────────────────────┐
│  HADES OMEGA                              [◐ DARK] [MENU ≡]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│              ╔═══════════════════╗                          │
│              ║                   ║                          │
│              ║   ✦  HADES  ✦     ║  ← núcleo 3D rotante    │
│              ║  Orquestador      ║    glow dorado           │
│              ╚═══════════════════╝                          │
│             /    |    |    |    \                           │
│           /      |    |    |     \    ← líneas de conexión  │
│        CHARON PERSEPHONE MINOS ELYSIUM TARTARUS             │
│        ● activo  ● idle  ● wait  ● idle  ● watch           │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Estado del sistema                                    │  │
│  │  Misiones activas: 1  │  Operaciones hoy: 47          │  │
│  │  CERBERUS: ● ACTIVO   │  NEAR: ● CONECTADO            │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  [+ Nueva Misión]                    [Ver Auditoría →]      │
└──────────────────────────────────────────────────────────────┘
```

**Implementación del núcleo holográfico:**
- **React Three Fiber (R3F)** + `@react-three/drei` para el canvas 3D dentro de React
- Componente `<HolographicCore />` cargado con `React.lazy()` + `Suspense` (carga diferida)
- Esfera icosaédrica wireframe con rotación continua (`useFrame`)
- Partículas orbitando el núcleo (representan operaciones en curso), actualizadas desde estado Zustand
- Líneas de conexión a los agentes con animación de flujo de datos (`<Line>` de drei)
- Colores reactivos al estado del agente correspondiente: dorado normal, azul al procesar, rojo en alerta
- Control de rendimiento: `<PerformanceMonitor>` de drei — reduce geometría si fps < 30
- **Fallback SVG 2D**: si R3F no carga o `prefers-reduced-motion` está activo, se muestra un SVG animado con CSS que replica la topología de agentes sin 3D

### 3.2 Pantalla: Dashboard de Misión

```
┌──────────────────────────────────────────────────────────────┐
│  ← Volver   Misión: Evaluar proveedores de infraestructura   │
│  Estado: ● EN PROGRESO              Prioridad: ALTA          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Progreso: ████████░░░░░░░░  52%     3/6 tareas completadas  │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ TAREAS                                                  │ │
│  │                                                         │ │
│  │ ✗ [CHARON]     PO $78,500 MXN — CloudPro premium  DENY    │ │
│  │ ✓ [PERSEPHONE] Presupuesto $50,000 MXN OK         PERMIT  │ │
│  │ ⚠ [CHARON]    PO $42,000 MXN — CloudPro estándar ESCALATE│ │
│  │ ⏳ [MINOS]    Revisión humana pendiente...        WAITING  │ │
│  │ ○ [HADES]     Consolidar informe final            PENDING  │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌──────────────────────┐  ┌────────────────────────────┐    │
│  │ ESCALACIÓN ACTIVA    │  │ ACTIVIDAD RECIENTE          │    │
│  │                      │  │                             │    │
│  │ CHARON propone PO    │  │ 14:33 ESCALATE—$42K MXN    │    │
│  │ $42,000 MXN CloudPro │  │ 14:32 DENY — $78.5K>$50K   │    │
│  │ (alternativa al DENY)│  │ 14:31 PERMIT — Presup. OK  │    │
│  │ [✓ Aprobar]          │  │ 14:30 PERMIT — Eval. OK    │    │
│  │ [✗ Rechazar]         │  │                             │    │
│  └──────────────────────┘  └────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

### 3.3 Pantalla: Panel CERBERUS

```
┌──────────────────────────────────────────────────────────────┐
│  CERBERUS — Motor de Seguridad                               │
│  Estado: ● ACTIVO   Política: v1.0.0   Contenciones: 0      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  TRES CABEZAS:                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │  GUARD   │  │  AUDIT   │  │ RESPONSE │                  │
│  │  ● ACTIVO│  │  ● ACTIVO│  │  ● ACTIVO│                  │
│  │  1,247   │  │  1,247   │  │  0       │                  │
│  │  eval.   │  │  records │  │  activos │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
│                                                              │
│  REGISTROS DE AUDITORÍA (últimos 20)                         │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Hora   │ Agente     │ Operación    │ Dec.  │ NEAR      │  │
│  ├────────┼────────────┼──────────────┼───────┼───────────┤  │
│  │ 14:32  │ PERSEPHONE │ BUDGET_APPR  │✓ PERM │ —         │  │
│  │ 14:31  │ CHARON     │ PURCHASE_ORD │⚠ ESC  │ 🔗 8xKj.. │  │
│  │ 14:30  │ CHARON     │ VENDOR_EVAL  │✓ PERM │ —         │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  POLÍTICA VIGENTE                          [Ver completa →]  │
│  Versión: 1.0.0  │  Reglas activas: 8  │  Listas: 3        │
│                                                              │
│  TRANSACCIONES NEAR                                          │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ TX Hash    │ Tipo         │ Bloque     │ Enlace         │  │
│  │ 8xKj...3m  │ PURCHASE_ORD │ 142,891,034│ 🔗 Ver en NEAR │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### 3.4 Pantalla: Estado de Agentes (sidebar)

```
┌──────────────────┐
│ AGENTES          │
├──────────────────┤
│ ✦ HADES          │
│   ● Orquestando  │
│   Misión: 1      │
├──────────────────┤
│ ⚡ CHARON         │
│   ● Ejecutando   │
│   PO Review      │
├──────────────────┤
│ ₿ PERSEPHONE     │
│   ○ Esperando    │
├──────────────────┤
│ ⚖ MINOS          │
│   ⏳ Revisión     │
│   Pendiente      │
├──────────────────┤
│ ⚙ ELYSIUM        │
│   ○ Inactivo     │
├──────────────────┤
│ 🛡 TARTARUS       │
│   👁 Monitoreando │
└──────────────────┘
```

---

## 4. Animaciones

| Elemento | Animación | Duración | Nota |
|---------|-----------|----------|------|
| Núcleo HADES | Rotación continua | ∞ | `requestAnimationFrame`, pausable |
| Líneas de conexión | Flujo de partículas hacia agentes | ∞ | Velocidad aumenta con actividad |
| AgentCard activa | Pulso de glow | 1.5s ease-in-out | Reduce en motion preference |
| CERBERUS DENY | Flash de borde rojo | 0.3s | Single, no loop |
| NEAR tx confirmada | Destello dorado | 0.8s | Single, notificación |
| Aparición de paneles | Fade + slide up | 0.2s | `prefers-reduced-motion` → sin animación |

### Accesibilidad de animaciones

```css
@media (prefers-reduced-motion: reduce) {
  .agent-pulse, .connection-flow, .core-rotation {
    animation: none;
  }
  /* El núcleo holográfico mostrará estado estático */
}
```

---

## 5. Componente de toggle de tema

```
[☀ Claro]  [◐ Sistema]  [☾ Oscuro]

Persistido en localStorage: 'hades-theme'
Default: sistema (respeta prefers-color-scheme)
```

---

## 6. Responsive — comportamiento en móvil

- **Desktop (>1024px)**: layout de 3 columnas: sidebar agentes | contenido | panel CERBERUS
- **Tablet (768-1024px)**: sidebar colapsable, panel CERBERUS en pestaña inferior
- **Mobile (<768px)**: navegación por pestañas: Núcleo | Misiones | Agentes | CERBERUS
- El núcleo holográfico en mobile: versión simplificada 2D (SVG) para performance

---

## 7. Tecnologías de implementación

| Elemento | Tecnología |
|----------|-----------|
| Framework | React 18 + Vite |
| Estilos | TailwindCSS 3 + CSS custom properties |
| 3D principal | React Three Fiber (R3F) + @react-three/drei |
| 3D fallback | SVG animado con CSS (sin dependencias externas) |
| Animaciones UI | Framer Motion 10+ |
| Estado global | Zustand |
| WebSocket | native browser WebSocket API |
| Iconos | Lucide React |
| Fuentes | Google Fonts: JetBrains Mono, Inter, Space Grotesk |

---

*Relacionado: `01-architecture.md`, `06-api-contracts.md`*
