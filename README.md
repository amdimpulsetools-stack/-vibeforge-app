# VibeForge App

Tu proyecto full-stack generado con VibeForge. Next.js 15 + Supabase + TypeScript.

## Setup Rápido (5 minutos)

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar Supabase
1. Crea un proyecto en [supabase.com](https://supabase.com)
2. Copia `.env.local.example` a `.env.local`
3. Llena las variables con tus credenciales de Supabase:
   - `NEXT_PUBLIC_SUPABASE_URL` — Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Anon/Public key
   - `SUPABASE_SERVICE_ROLE_KEY` — Service role key

### 3. Crear las tablas
1. Ve al **SQL Editor** en tu dashboard de Supabase
2. Copia y ejecuta el contenido de `supabase/migrations/001_initial_schema.sql`

### 4. Configurar Auth (opcional)
Para habilitar Google OAuth:
1. Ve a **Authentication > Providers** en Supabase
2. Habilita Google y configura las credenciales OAuth
3. Agrega `http://localhost:3000/api/auth/callback` como redirect URL

### 5. Iniciar
```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

## Agregar Features

Este proyecto incluye:
- **CLAUDE.md** — Instrucciones para Claude Code
- **.cursorrules** — Instrucciones para Cursor IDE

### Con Claude Code:
```bash
claude
> "Agrega un módulo de pacientes con CRUD completo"
```

### Con Cursor:
Abre el chat (Cmd+L) y pide lo que necesites. Cursor leerá `.cursorrules` automáticamente.

### Con Claude.ai:
1. Crea un proyecto en claude.ai
2. Sube el archivo `vibeforge-system-prompt.md` como instrucciones
3. Pide features en el chat

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 15 (App Router) |
| Lenguaje | TypeScript |
| Estilos | Tailwind CSS 4 |
| UI | shadcn/ui |
| Auth | Supabase Auth |
| Database | Supabase (PostgreSQL) |
| Validación | Zod + React Hook Form |
| Data Fetch | TanStack React Query |

## Estructura
```
app/
  (auth)/          — Login, register, forgot-password
  (dashboard)/     — Páginas protegidas con sidebar
  api/             — API routes
components/
  layout/          — Sidebar, topbar
  ui/              — shadcn/ui
lib/
  supabase/        — Clients (browser, server, middleware)
hooks/             — Custom hooks
types/             — TypeScript types
supabase/
  migrations/      — SQL migrations
```

## Deploy

```bash
# Deploy a Vercel
npx vercel
```

Agrega las variables de entorno en el dashboard de Vercel.
