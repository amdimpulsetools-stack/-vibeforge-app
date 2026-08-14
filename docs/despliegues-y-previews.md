# Despliegues y previews — guía operativa

Cómo publicar cambios en Yenda sin romperle el día a una clínica que está atendiendo.

Escrito para el momento en que el sistema deja de ser un proyecto y pasa a ser la herramienta de la que depende alguien para trabajar.

---

## El concepto que hay que tener claro

**No se "mergea en preview".** Son dos acciones distintas y hacen cosas distintas:

| Acción | Qué produce | Quién lo ve |
|---|---|---|
| `git push` a una rama | **Preview** — URL temporal y aislada | Solo tú |
| Merge del PR a `main` | **Producción** — va a yenda.app | Las clínicas y sus pacientes |

El preview **ya existe** desde el momento en que se hace push. No hay que activarlo. Y mergear no es el camino hacia el preview: es el camino hacia producción.

Dicho de otro modo: el paso que suele faltar no es crear el preview, es **mirarlo antes de mergear**.

---

## El ciclo completo

1. **Push a la rama** y apertura del PR.
2. **Vercel construye el preview automáticamente** (1-3 minutos).
3. **Encontrar la URL**, en cualquiera de estos dos sitios:
   - En el PR de GitHub: comentario del bot de Vercel con el enlace **Visit Preview**.
   - En vercel.com → proyecto → pestaña **Deployments** → el más reciente, marcado como *Preview*.
4. **Abrir la URL y probar.** Es la aplicación completa con los cambios aplicados.
5. **Decidir:**
   - ¿Está bien? → **Merge** en GitHub. Ahí sí sale a producción.
   - ¿Está mal? → **No mergear.** Con cada push nuevo, **el mismo enlace se actualiza** con la corrección. Se puede iterar tantas veces como haga falta sin que ninguna clínica vea nada.

---

## Cómo revertir

### Un preview: no hay nada que revertir

Un preview no toca yenda.app; es una URL desechable. Si no convence:

- Se cierra el PR sin mergear, y ya está.
- O se sigue corrigiendo hasta que quede bien.

### Producción: dos formas, en este orden

**1. Instant Rollback — el botón de pánico (segundos, sin tocar código)**

Vercel → **Deployments** → localizar el despliegue anterior que funcionaba → menú `⋯` → **Promote to Production**.

La web vuelve al estado anterior de inmediato. Con una clínica atendiendo, esto va primero: primero se detiene el daño, después se investiga.

> Conviene localizar este botón **antes** de necesitarlo, no durante la urgencia.

**2. Revertir en git (deja el historial correcto)**

`git revert` del commit de merge y push. Más limpio a largo plazo, pero requiere un build completo.

---

## Entrar al preview con credenciales propias

**Sí se puede**, con email y contraseña, sin configuración adicional.

Dos matices que conviene conocer:

**El login con Google puede fallar en previews.** El redirect se arma con la URL donde está parado el navegador, y cada preview tiene una URL distinta. Supabase solo acepta redirects de URLs que tenga en su lista blanca. Para usar Google en previews hay que añadir un patrón comodín en Supabase → Authentication → URL Configuration. Con email y contraseña no aplica.

**Vercel protege los previews por defecto.** El dueño de la cuenta entra sin problema porque ya está autenticado en Vercel; pero al compartir el enlace con otra persona —por ejemplo, una clínica que quiera validar algo antes de publicarlo— verá una pantalla de acceso denegado. Para eso hay que desactivar la protección de previews o generar un enlace de acceso compartido.

---

## ⚠️ Lo más importante: los previews comparten base de datos

**El preview aísla el _código_, no los _datos_.**

Salvo que existan variables de entorno distintas por entorno, un preview apunta a **la misma base de datos de producción**. Es decir: al abrir un preview se están viendo —y tocando— los datos reales de las clínicas.

Si en un preview se borra un paciente, **se borró de verdad**.

### Cómo comprobarlo

Vercel → **Settings** → **Environment Variables** → revisar si `NEXT_PUBLIC_SUPABASE_URL` tiene un valor distinto para *Preview* y para *Production*. Si el valor es el mismo para todos los entornos, la base de datos está compartida.

### Qué es seguro hacer en un preview

| Acción | Veredicto |
|---|---|
| Revisar que la interfaz se vea bien | ✅ Seguro |
| Navegar, abrir pantallas, leer | ✅ Seguro |
| Crear, editar o borrar registros | ⚠️ Son datos reales |
| Enviar correos de prueba | ⚠️ Salen de verdad |

**Una buena noticia:** los correos automáticos (recordatorios de cita, seguimientos de fertilidad, resumen diario) **no se disparan desde previews**. Las tareas programadas de `vercel.json` solo se ejecutan en producción, así que un preview nunca enviará un correo a una paciente por accidente.

### El siguiente paso, cuando la operación esté estable

Supabase Pro incluye **branching**: bases de datos temporales por rama que se integran con los previews de Vercel. Con eso, cada preview tendría sus propios datos y se podría probar cualquier cosa —incluidos borrados— sin riesgo.

No es urgente el primer día. Es el siguiente escalón natural una vez que haya clínicas operando y la rutina de despliegue esté rodada.

---

## Rutina recomendada con clínicas en producción

**push → mirar preview → merge → verificar en yenda.app**

Y unas reglas de convivencia que valen más que cualquier herramienta:

- **Ventana de despliegue.** Nada de cambios en horario de atención. Una franja fija —tarde-noche o domingos— para todo lo que no sea urgencia. Un despliegue a media mañana, mientras la recepcionista agenda, es la forma más rápida de perder la confianza de un cliente.
- **Separar urgente de mejora.** Si algo está roto y bloquea el trabajo, se arregla ya. Lo demás espera a la ventana.
- **Backups verificados.** Un backup que nunca se restauró no es un backup, es una suposición. Conviene probar una restauración antes de que entren datos reales.
- **Migraciones destructivas, nunca en caliente.** Añadir columnas o datos es seguro. Borrar o renombrar con gente trabajando es cómo se pierde información.
- **Expectativas explícitas con el cliente.** "Si algo te bloquea, escríbeme y respondo en X; el resto lo agrupo y sale los domingos." Gestionar la expectativa vale más que la velocidad real.

---

## Resumen de emergencia

| Situación | Qué hacer |
|---|---|
| Quiero ver un cambio antes de publicarlo | Abrir el enlace del preview en el PR |
| El cambio no me gusta | No mergear; pedir corrección y volver a mirar |
| Ya está en producción y algo se rompió | Vercel → Deployments → despliegue anterior → **Promote to Production** |
| Necesito probar borrando cosas | **No en preview** — comparte base de datos con producción |
| Quiero que el cliente vea el preview | Desactivar la protección de previews en Vercel |
