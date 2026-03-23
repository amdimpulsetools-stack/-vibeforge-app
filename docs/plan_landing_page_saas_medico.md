# PLAN DE TRABAJO: Landing Page — SaaS Gestión Médica

> **Documento para Claude Code** — Seguir paso a paso en orden.
> Fecha: Marzo 2026 | Autor: Oscar (AMD Impulse)

---

## CONTEXTO DEL PROYECTO

### Stack
- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS + shadcn/ui
- **Lenguaje**: TypeScript
- **Deploy**: Vercel
- **Diseño**: Dark theme con acento emerald green (#10B981)

### Producto
SaaS de gestión integral para clínicas y consultorios médicos en Latinoamérica.
- Agenda inteligente, gestión de pacientes, control de equipo, asistente IA
- 3 planes: Independiente (S/69.90), Centro Médico (S/169.90), Clínica (S/569.90)
- Todos los planes incluyen IA (con límites según plan)
- Todos los planes incluyen addons (miembros y consultorios extra)
- Público: doctores independientes → centros médicos → clínicas medianas

### Nombre
El nombre del producto es provisional. Usar un placeholder como `[PRODUCTO]` en el código para fácil reemplazo posterior. Definir una constante:
```typescript
const PRODUCT_NAME = "PacientesPro"; // placeholder, cambiar cuando se defina
```

### Tono de comunicación
- Profesional + Claro + Empático + Directo
- Español latinoamericano neutro (tú informal)
- NUNCA usar: "disruptivo", "innovador", "de siguiente generación", "powered by AI"
- NUNCA usar jerga técnica: "multi-tenant", "Next.js", "Supabase", "RLS"
- Mostrar el PRODUCTO (screenshots) > ilustraciones genéricas

---

## SKILLS DISPONIBLES

### 1. UI/UX Pro Max (`/mnt/skills/user/ui-ux-pro-max/`)
Usar para: design system, paletas, tipografía, UX guidelines, estructura de landing.

### 2. fal-ai-media (`/mnt/skills/user/fal-ai-media/`)
Usar para: generar backgrounds, texturas, elementos decorativos con Nano Banana.

### 3. frontend-design (`/mnt/skills/user/frontend-design/`)
Usar para: guías de estética, evitar "AI slop", tipografía distintiva, composición visual.

---

## FASE 0: DESIGN SYSTEM (ejecutar antes de escribir código)

### Paso 0.1 — Generar design system con UI/UX Pro Max

```bash
python3 /mnt/skills/user/ui-ux-pro-max/scripts/search.py "healthcare medical SaaS clinic management dark-mode modern" --design-system -p "SaaS Médico"
```

### Paso 0.2 — Buscar paleta de colores específica

```bash
python3 /mnt/skills/user/ui-ux-pro-max/scripts/search.py "healthcare saas dark" --domain color
```

**Restricción de color**: El producto ya usa dark theme + emerald green (#10B981). La paleta debe partir de:
- **Background primario**: slate-950 / zinc-950 (oscuro profundo)
- **Background secundario**: slate-900 / zinc-900 (cards, secciones alternas)
- **Acento primario**: emerald-500 (#10B981) — CTAs, highlights, badges
- **Acento secundario**: emerald-600 (#059669) — hover states
- **Texto primario**: white / slate-50
- **Texto secundario**: slate-400
- **Borde sutil**: slate-800

### Paso 0.3 — Tipografía

```bash
python3 /mnt/skills/user/ui-ux-pro-max/scripts/search.py "professional modern medical" --domain typography
```

**Criterios**:
- Heading font: distintiva pero legible, profesional (NO Inter, NO Roboto, NO Arial)
- Body font: alta legibilidad, profesional, buena para español (acentos, ñ)
- Importar desde Google Fonts
- Seguir guía del skill frontend-design: evitar fonts genéricas "AI slop"

### Paso 0.4 — Estructura de landing

```bash
python3 /mnt/skills/user/ui-ux-pro-max/scripts/search.py "hero social-proof pricing cta" --domain landing
```

### Paso 0.5 — Persistir design system

```bash
python3 /mnt/skills/user/ui-ux-pro-max/scripts/search.py "healthcare medical SaaS" --design-system --persist -p "SaaS Médico"
```

---

## FASE 1: ESTRUCTURA DE LA LANDING PAGE

### Archivo principal: `app/(marketing)/page.tsx`

Crear como página estática (no necesita auth ni Supabase). 10 secciones en este orden:

```
1. Navbar (fijo, transparente → solid on scroll)
2. Hero
3. Barra de confianza (trust badges)
4. Inclusividad (barra progresiva de crecimiento)
5. Problema ("¿Te suena familiar?")
6. Features (4 bloques antes → ahora)
7. Asistente IA
8. Pricing (3 planes + addons)
9. Social proof + FAQ
10. CTA final + Footer
```

### Componentes a crear:
```
components/landing/
├── Navbar.tsx
├── Hero.tsx
├── TrustBadges.tsx
├── GrowthPath.tsx         (sección inclusividad)
├── PainPoints.tsx          (¿Te suena familiar?)
├── Features.tsx            (4 bloques)
├── AIAssistant.tsx          (sección IA)
├── Pricing.tsx             (3 planes + tabla)
├── SocialProof.tsx
├── FAQ.tsx
├── FinalCTA.tsx
└── Footer.tsx
```

---

## FASE 2: IMPLEMENTACIÓN SECCIÓN POR SECCIÓN

### Sección 1: NAVBAR

**Comportamiento**:
- Fijo top, transparente con backdrop-blur sobre el hero
- Transición a solid (slate-950/95) al hacer scroll (>50px)
- Logo a la izquierda (placeholder texto por ahora)
- Links: Características, Planes, FAQ
- CTA derecha: "Empezar ahora" (botón emerald, pequeño)
- Mobile: hamburger menu

**UX Guidelines aplicables** (del skill UI/UX Pro Max):
- `fixed-element-offset`: reservar padding para contenido debajo
- `z-index-management`: navbar en z-50
- `bottom-nav-limit`: max 5 items en nav

---

### Sección 2: HERO

**Copy exacto**:
```
Pre-headline badge: "Lanzamiento 2026 — Acceso anticipado disponible"

Headline:
  "Tu clínica completa."        (texto blanco, bold)
  "En una sola plataforma."     (texto emerald-500, bold)

Subtítulo:
  "Agenda inteligente, gestión de pacientes, control de equipo y
   asistente con IA. Desde el doctor independiente hasta la clínica
   con 10 consultorios. Planes desde S/69.90/mes."

CTA primario: "Empezar ahora" (botón emerald-500, grande, hover emerald-600)
CTA secundario: "Ver cómo funciona" (botón ghost/outline, hover sutil)

Texto bajo CTAs: "Sin contratos. Cancela cuando quieras. Configura tu clínica en minutos."
```

**Visual**:
- Fondo: gradiente oscuro sutil o mesh gradient generado con fal-ai
- Elemento principal: screenshot/mockup del dashboard (usar placeholder image por ahora)
- El screenshot debe estar en perspectiva o dentro de un browser mockup
- Animación de entrada: fade-in staggered (título → subtítulo → CTAs → imagen)

**UX Guidelines**:
- `readable-font-size`: mínimo 16px body en mobile
- `touch-target-size`: CTAs mínimo 44×44px
- `loading-states`: skeleton si la imagen carga async
- Animaciones: 150-300ms, ease-out para entrada

---

### Sección 3: BARRA DE CONFIANZA (Trust Badges)

**Copy**:
4 badges en fila horizontal (scroll horizontal en mobile):
- 🔒 "Datos encriptados" (usar icono SVG, NO emoji)
- 🌎 "Soporte en español" (icono SVG)
- 🏥 "Hecho para LATAM" (icono SVG)
- 🤖 "IA incluida en todos los planes" (icono SVG)

**Diseño**:
- Fondo slate-900 o ligeramente diferente al hero
- Badges como pills/chips con borde slate-700
- Iconos: usar Lucide icons
- Tipografía: pequeña (14px), slate-300

---

### Sección 4: INCLUSIVIDAD (Barra de crecimiento)

**Copy**:
```
Título: "Un sistema para cada etapa de tu crecimiento"

3 columnas/tarjetas con progresión visual:

1. "Consultorio independiente"
   "1 doctor, 1 consultorio"
   "Empiezo solo con mi consultorio"
   Desde S/69.90/mes

2. "Centro médico"
   "2 doctores, 4 consultorios"
   "Ya somos un equipo pequeño"
   Desde S/169.90/mes

3. "Clínica mediana"
   "10 doctores, 10 consultorios"
   "Gestionamos una operación real"
   Desde S/569.90/mes

Cierre: "No importa en qué etapa estés. La plataforma se adapta a ti, no al revés."
```

**Diseño**:
- 3 cards conectadas por una línea o flecha progresiva
- Cada card con un icono representativo (Lucide: Stethoscope → Building2 → Hospital)
- Card del medio ligeramente destacada (popular / "Más elegido")
- Animación: cards entran staggered al hacer scroll (intersection observer)

---

### Sección 5: PROBLEMA ("¿Te suena familiar?")

**Copy**:
```
Título: "¿Te suena familiar?"

6 pain points como checkboxes interactivas:
☐ "Manejas las citas entre WhatsApp, un cuaderno y Google Calendar"
☐ "Tu recepcionista es la única que entiende el Excel de pacientes"
☐ "No sabes cuánto facturaste esta semana sin hacer cuentas a mano"
☐ "Pierdes pacientes porque nadie les dio seguimiento"
☐ "Tu software actual parece del 2010 y pagas demasiado por él"
☐ "Cada nuevo doctor que agregas es un dolor de cabeza administrativo"

Cierre: "No debería ser tan difícil administrar una clínica en 2026. Construimos algo mejor."
```

**Diseño**:
- Checkboxes clickeables (puro visual/interactivo, no funcional)
- Al hacer click se marca con animación check + color emerald
- Grid de 2 columnas en desktop, 1 en mobile
- Fondo: slate-950 (contraste con sección anterior)
- Animación de entrada por item al scroll

**UX Guideline**: `progressive-disclosure` — no abrumar, revelar uno por uno al scroll

---

### Sección 6: FEATURES (4 bloques antes → ahora)

**Copy para cada bloque**:

```
Bloque 1: Agenda Inteligente
  Icono: Calendar (Lucide)
  Antes: "Citas en WhatsApp, olvidos, doble-agendamiento"
  Ahora: "Agenda visual con citas, bloqueos, follow-ups y recordatorios.
          Vinculada a doctores, servicios y consultorios."

Bloque 2: Gestión de Pacientes
  Icono: Users (Lucide)
  Antes: "Historial en carpetas físicas o un Excel que nadie actualiza"
  Ahora: "Perfil completo de cada paciente: historial de citas, pagos,
          notas, tags y seguimiento."

Bloque 3: Control de Equipo
  Icono: Shield (Lucide)
  Antes: "Todos tienen acceso a todo o nadie sabe qué puede hacer"
  Ahora: "4 roles claros: Owner, Admin, Recepcionista, Doctor.
          Cada uno ve solo lo que necesita."

Bloque 4: Tu Clínica Completa
  Icono: Building (Lucide)
  Antes: "5 herramientas diferentes que no se hablan entre sí"
  Ahora: "Consultorios, sucursales, servicios con precios, categorías,
          plantillas clínicas. Todo conectado."
```

**Título de sección**: "Todo lo que necesitas. Nada que no."

**Diseño**:
- Grid 2x2 en desktop, stack vertical en mobile
- Cada card: icono + título + texto "antes" (tachado o en rojo sutil) + texto "ahora" (en blanco/emerald)
- Cards con borde sutil slate-800, hover con glow emerald muy sutil
- Espacio para screenshot pequeño de cada feature (placeholder por ahora)

---

### Sección 7: ASISTENTE IA

**Copy**:
```
Título: "IA incluida en todos los planes. No es un extra."

Subtítulo: "Cada plan incluye un asistente inteligente que analiza tu
operación y te ayuda a tomar mejores decisiones. No reemplaza doctores.
Potencia administradores."

4 mini-cards de ejemplo:
  "¿Cuál fue mi servicio más rentable este mes?" → Respuesta instantánea
  "¿Qué doctor tuvo más cancelaciones?" → Patrón identificado
  "¿Cómo puedo optimizar los horarios del martes?" → Sugerencia basada en datos
  "¿Cuántos pacientes nuevos tuve vs recurrentes?" → Análisis de retención

Niveles por plan:
  Independiente: consultas básicas de IA
  Centro Médico: análisis profundos de operación
  Clínica: capacidad máxima, insights estratégicos

Disclaimer (pequeño): "El asistente IA analiza datos operativos y administrativos.
No realiza diagnósticos médicos ni accede a información clínica de pacientes."
```

**Diseño**:
- Simular una interfaz de chat/asistente IA a la derecha
- Las 4 preguntas como "burbujas" de chat con respuesta
- Animación: las burbujas aparecen secuencialmente (typewriter effect o fade-in stagger)
- Fondo: ligeramente diferente, quizás con gradient sutil emerald-950/5 → transparent
- Badges "Básico", "Avanzado", "Máximo" debajo como pills

---

### Sección 8: PRICING

**Copy**:
```
Título: "Crece a tu ritmo. Paga solo lo que necesitas."
Subtítulo: "Tres planes para cada etapa. Sin contratos, sin sorpresas. IA incluida en todos."
```

**Estructura de 3 cards**:

```
INDEPENDIENTE — S/69.90/mes
  Ancla: "Menos de lo que cobras por una consulta"
  - 1 doctor
  - 150 pacientes
  - 100 citas/mes
  - 1 consultorio
  - 1 miembro de equipo
  - Asistente IA (básico)
  - Addons disponibles
  CTA: "Empezar ahora"

CENTRO MÉDICO — S/169.90/mes ← DESTACADO (badge "Más popular")
  Ancla: "Menos de S/6 al día por tener tu centro organizado"
  - 2 doctores
  - 1,000 pacientes
  - Citas ilimitadas
  - 4 consultorios
  - Hasta 4 miembros
  - Asistente IA (avanzado)
  - Addons disponibles
  CTA: "Empezar ahora"

CLÍNICA — S/569.90/mes
  Ancla: "Con 10 doctores, son S/57 por doctor al mes"
  - 10 doctores
  - Pacientes ilimitados
  - Citas ilimitadas
  - 10 consultorios
  - Hasta 14 miembros
  - Asistente IA (máximo)
  - Addons disponibles
  CTA: "Empezar ahora"
```

**Copy debajo**: "¿Necesitas algo entre planes? Todos incluyen addons flexibles:
agrega doctores, consultorios o miembros de equipo adicionales sin cambiar de plan."

**Diseño**:
- 3 cards side by side, card central más alta/destacada con borde emerald
- Badge "✓ IA incluida" visible en cada card
- Toggle mensual/anual si aplica (o solo mensual por ahora)
- Precios grandes, anclas en texto pequeño debajo
- CTAs emerald en todas las cards

**UX Guidelines**:
- `primary-action`: un solo CTA por card
- `touch-target-size`: botones mínimo 44px altura

---

### Sección 9: SOCIAL PROOF + FAQ

**Social Proof** (fase pre-lanzamiento):
```
Título: "Hecho para clínicas reales"

- Badge: "Sé de los primeros 100 en probarlo. Tu feedback construye el producto."
- Trust signals como iconos: "Datos encriptados" | "Backups automáticos" | "Soporte en español" | "Precios en soles"
- Espacio reservado para testimonios futuros (oculto por ahora)
```

**FAQ** (6 preguntas):
```
"¿Mis datos están seguros?"
→ "Sí. Cada clínica tiene su espacio completamente aislado. Los datos están
   encriptados y protegidos con seguridad a nivel de base de datos."

"¿Hay algún periodo de prueba?"
→ "No tenemos trial porque no lo necesitas. Pagas mes a mes, sin contrato.
   Si en el primer mes no te convence, simplemente cancelas."

"¿Puedo migrar mis datos desde otro sistema?"
→ "Estamos trabajando en herramientas de importación. Por ahora, nuestro
   equipo te ayuda personalmente con la migración."

"¿Funciona en mi celular?"
→ "Sí. La plataforma es completamente responsiva. Funciona en cualquier
   dispositivo con navegador."

"¿Qué pasa si necesito más de lo que incluye mi plan?"
→ "Todos los planes tienen addons flexibles. Agrega doctores, consultorios
   o miembros de equipo adicionales sin cambiar de plan."

"¿La IA va a reemplazar a mis doctores?"
→ "No. Nuestro asistente IA es exclusivamente para gestión administrativa.
   No hace diagnósticos ni accede a información clínica."
```

**Diseño FAQ**:
- Accordion (shadcn/ui Accordion component)
- Animación suave al expandir

---

### Sección 10: CTA FINAL + FOOTER

**CTA Final**:
```
Título: "Tu clínica merece herramientas del 2026."

Subtítulo: "Configura tu clínica en minutos. Sin contratos. Cancela
cuando quieras. IA incluida desde el primer día."

CTA: "Empezar ahora" (botón grande emerald)

Texto bajo botón: "Planes desde S/69.90/mes. Todos incluyen asistente IA y addons flexibles."
```

**Diseño CTA**:
- Fondo: gradiente dark → emerald-950/10 sutil, o mesh gradient
- Botón CTA es el elemento más grande y visible
- Nada más compite por atención en esta sección

**Footer**:
- Minimal: logo + links (Características, Planes, FAQ, Contacto)
- "Hecho en Perú 🇵🇪 para Latinoamérica" (la bandera sí es aceptable aquí, es contenido, no icono UI)
- Links: Términos, Privacidad
- © 2026 [PRODUCTO]. Todos los derechos reservados.

---

## FASE 3: ASSETS VISUALES (con fal-ai-media)

### Paso 3.1 — Background del hero

Usar fal-ai Nano Banana para generar un background abstracto dark:

```bash
bash /mnt/skills/user/fal-ai-media/scripts/generate.sh \
  --prompt "Abstract dark gradient mesh background, deep navy blue and emerald green subtle glow, medical technology aesthetic, minimal, clean, dark theme, no text, no objects, just abstract light and color" \
  --model "fal-ai/nano-banana-pro"
```

### Paso 3.2 — Textura/patrón para secciones alternas

```bash
bash /mnt/skills/user/fal-ai-media/scripts/generate.sh \
  --prompt "Subtle dark geometric pattern, hexagonal grid barely visible, dark slate background, very subtle emerald tint, seamless texture, minimal" \
  --model "fal-ai/nano-banana-pro"
```

### Paso 3.3 — Background para sección CTA final

```bash
bash /mnt/skills/user/fal-ai-media/scripts/generate.sh \
  --prompt "Dark atmospheric gradient, deep emerald green to black, subtle light rays from top, medical technology feel, abstract, no text, cinematic lighting" \
  --model "fal-ai/nano-banana-pro"
```

**NOTA**: Los screenshots del dashboard del producto real los proporcionará Oscar manualmente. NO generar mockups de UI con IA — usar placeholders grises con texto "Screenshot del dashboard" hasta que Oscar los proporcione.

---

## FASE 4: OPTIMIZACIÓN Y CALIDAD

### Paso 4.1 — Validar UX con UI/UX Pro Max

```bash
python3 /mnt/skills/user/ui-ux-pro-max/scripts/search.py "animation accessibility z-index loading" --domain ux
```

### Paso 4.2 — Checklist de calidad (verificar antes de entregar)

**Accesibilidad (CRÍTICO)**:
- [ ] Contraste texto ≥ 4.5:1 en todas las secciones
- [ ] Alt text en todas las imágenes
- [ ] Keyboard navigation funcional (tab order lógico)
- [ ] Focus rings visibles en elementos interactivos
- [ ] aria-labels en botones de icono

**Performance (ALTO)**:
- [ ] Imágenes en WebP/AVIF con lazy loading
- [ ] width/height declarados en imágenes (evitar CLS)
- [ ] Font-display: swap en Google Fonts
- [ ] Code splitting por sección si el bundle es grande
- [ ] Lighthouse score > 90 en todas las categorías

**Responsive (ALTO)**:
- [ ] Testeado en 375px (iPhone SE)
- [ ] Testeado en 768px (tablet)
- [ ] Testeado en 1440px (desktop)
- [ ] No horizontal scroll en ningún breakpoint
- [ ] Texto legible sin zoom en mobile (min 16px body)

**Dark Mode**:
- [ ] Solo dark mode (no toggle light/dark, el producto es dark)
- [ ] Texto primario con suficiente contraste sobre fondos oscuros
- [ ] Bordes y separadores visibles
- [ ] CTAs emerald claramente visibles sobre fondos oscuros

**Animaciones**:
- [ ] Todas entre 150-300ms
- [ ] Respeta prefers-reduced-motion
- [ ] Stagger en listas: 30-50ms entre items
- [ ] Ease-out para entrada, ease-in para salida
- [ ] No bloquean interacción del usuario

**SEO**:
- [ ] Meta title: "[PRODUCTO] — Gestión integral para clínicas y consultorios médicos"
- [ ] Meta description con keywords: gestión clínica, agenda médica, software médico
- [ ] Open Graph tags para compartir en redes
- [ ] Heading hierarchy: h1 en hero, h2 por sección, h3 subsecciones
- [ ] Idioma: lang="es"

---

## FASE 5: ARCHIVOS DE CONFIGURACIÓN

### Tailwind config (colores custom)

```typescript
// tailwind.config.ts — extender con colores del producto
colors: {
  brand: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981', // acento principal
    600: '#059669', // hover
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
    950: '#022c22',
  }
}
```

### Metadata

```typescript
// app/layout.tsx o app/(marketing)/layout.tsx
export const metadata: Metadata = {
  title: `${PRODUCT_NAME} — Gestión integral para clínicas y consultorios médicos`,
  description: 'Agenda inteligente, gestión de pacientes, control de equipo y asistente con IA. Desde el doctor independiente hasta la clínica con 10 consultorios. Planes desde S/69.90/mes.',
  openGraph: {
    title: `${PRODUCT_NAME} — Tu clínica completa en una sola plataforma`,
    description: 'Software de gestión médica con IA incluida. Diseñado para LATAM.',
    locale: 'es_PE',
    type: 'website',
  },
};
```

---

## ORDEN DE EJECUCIÓN RECOMENDADO

```
1. FASE 0: Design system (correr todos los scripts de UI/UX Pro Max)
2. FASE 5: Configuración (Tailwind, metadata, layout base)
3. FASE 1: Estructura de componentes (crear archivos vacíos)
4. FASE 2: Implementar secciones en orden:
   a. Navbar + Hero (lo más visible primero)
   b. TrustBadges + GrowthPath
   c. PainPoints + Features
   d. AIAssistant
   e. Pricing
   f. SocialProof + FAQ
   g. FinalCTA + Footer
5. FASE 3: Assets visuales con fal-ai (backgrounds)
6. FASE 4: Validación de calidad (checklist completo)
```

---

## NOTAS FINALES

- **NO generar imágenes de doctores o personas con IA** — usar placeholders o fotos de stock reales después.
- **NO incluir funcionalidad real** — esta es landing page estática de marketing. Los CTAs llevan a una URL de registro (placeholder `/registro`).
- **El FAQ usa Accordion de shadcn/ui** — instalar si no está: `npx shadcn@latest add accordion`
- **Intersection Observer** para animaciones al scroll — usar una librería ligera como `framer-motion` (ya suele estar en Next.js) o CSS-only con `@starting-style` si el soporte es suficiente.
- **Mobile-first**: diseñar primero para 375px, luego escalar.
- **Una sola página**: toda la landing es una sola ruta `/`, no múltiples páginas.
- **Smooth scroll**: los links del navbar hacen scroll suave a las secciones con `id`.
- **El idioma de toda la interfaz es español**. No mezclar inglés en el copy visible.
