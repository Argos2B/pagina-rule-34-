# Backend — Plataforma de contenido tipo "booru"

Backend de una plataforma de contenido generado por usuarios (imágenes + tags + categorías),
construido con **Django 6** y **Django REST Framework**, con autenticación JWT, control de
roles, moderación, auditoría y validación estricta de archivos subidos.

> Este repositorio contiene **solo el backend**. El frontend se desarrollará por separado.

## Stack técnico

- Python 3.14, Django 6.1, Django REST Framework 3.18
- Autenticación: `djangorestframework-simplejwt` (access/refresh tokens + blacklist)
- Base de datos: SQLite en desarrollo, PostgreSQL en producción vía `DATABASE_URL`
- Almacenamiento de archivos: sistema de archivos local en desarrollo, S3 opcional en producción
- Validación de imágenes con Pillow (verificación real del contenido, no solo extensión)
- `django-cors-headers`, `django-filter`, `django-environ`

## Estructura de apps

| App | Responsabilidad |
|---|---|
| `core` | Utilidades compartidas: paginación, permisos genéricos, manejo de excepciones, throttles, validadores de archivos, rutas de subida |
| `accounts` | Usuario personalizado con roles (`USER`, `MODERATOR`, `ADMIN`, `SUPERADMIN`), registro, login/logout JWT, verificación de email, reseteo de contraseña, gestión administrativa de usuarios |
| `posts` | Publicaciones, categorías y tags, con estado (`draft/published/hidden`), visibilidad (`public/unlisted/private`) y borrado lógico |
| `interactions` | Favoritos, comentarios y reportes de contenido |
| `moderation` | Registro de auditoría (`AuditLog`) de acciones de moderación y estadísticas del sistema |

## Instalación

```powershell
# 1. Crear entorno virtual (opcional si ya usas un intérprete dedicado)
python -m venv .venv
.venv\Scripts\Activate.ps1

# 2. Instalar dependencias
pip install -r requirements.txt

# 3. Configurar variables de entorno
copy .env.example .env
# Edita .env con tus propios valores

# 4. Aplicar migraciones
python manage.py migrate

# 5. Crear un superusuario (rol SUPERADMIN)
python manage.py createsuperuser

# 6. Levantar el servidor de desarrollo
python manage.py runserver
```

## Variables de entorno principales

Ver `.env.example` para la lista completa. Las más relevantes:

- `DJANGO_SECRET_KEY`: clave secreta de Django. **Obligatoria y fuerte en producción** (`DEBUG=False` lanza un error si no se configura).
- `DJANGO_DEBUG`: `True` en desarrollo, `False` en producción.
- `DJANGO_ALLOWED_HOSTS`: hosts permitidos, separados por coma.
- `DATABASE_URL`: cadena de conexión (ej. `postgres://user:pass@host:5432/dbname`). Si se deja vacía, se usa SQLite local.
- `CORS_ALLOWED_ORIGINS`: orígenes permitidos para CORS/CSRF (con esquema, ej. `https://miapp.com`).
- `EMAIL_HOST` y variables asociadas: si se deja vacío, los correos se imprimen en consola (útil en desarrollo).
- `FRONTEND_URL`: usada para construir los enlaces de verificación de email y reseteo de contraseña.
- `USE_S3` + variables `AWS_*`: activan almacenamiento en S3 para archivos subidos.

## Comandos útiles

```powershell
python manage.py migrate              # aplicar migraciones
python manage.py makemigrations       # generar migraciones tras cambios en modelos
python manage.py runserver            # servidor de desarrollo
python manage.py createsuperuser      # crear usuario SUPERADMIN
python manage.py test                 # correr toda la suite de tests
python manage.py test accounts        # correr tests de una app específica
```

## Agente para ejecutar el proyecto

Para iniciar backend y frontend con un solo comando:

```bash
# Prerrequisitos:
# - dependencias backend instaladas (pip install -r requirements.txt)
# - dependencias frontend instaladas (cd frontend && npm install)
# - Python y Node.js/NPM disponibles en PATH
# - Bash 5 o superior

chmod +x agente-ejecutar.sh
./agente-ejecutar.sh
# o sin permisos de ejecución:
bash5 agente-ejecutar.sh
```

> Usa un binario de Bash 5+ (en algunos sistemas se llama `bash` y en otros `bash5`).

Variables opcionales:

- `BACKEND_HOST` (default `127.0.0.1`)
- `BACKEND_PORT` (default `8000`)
- `FRONTEND_HOST` (default `127.0.0.1`)
- `FRONTEND_PORT` (default `5173`)

## Roles y permisos

- **USER**: rol por defecto. Puede crear/editar/eliminar (borrado lógico) sus propias publicaciones, comentar, marcar favoritos y reportar contenido.
- **MODERATOR**: además de lo anterior, puede ocultar/restaurar publicaciones y comentarios de terceros, y resolver reportes.
- **ADMIN**: gestión de usuarios (suspender/reactivar, asignar roles hasta `MODERATOR`), acceso a estadísticas y auditoría.
- **SUPERADMIN**: puede asignar cualquier rol, incluido `ADMIN`, y no puede ser suspendido por un `ADMIN`.

La lógica de asignación de roles (`User.can_assign_role`) impide la escalación de privilegios: un `ADMIN` nunca puede promover a otro usuario a `ADMIN` o `SUPERADMIN`, solo un `SUPERADMIN` puede hacerlo.

## Endpoints principales

Todos los endpoints están bajo el prefijo `/api/`.

### Autenticación (`accounts`)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/register/` | Registro de usuario |
| POST | `/api/auth/login/` | Login (obtiene access + refresh token) |
| POST | `/api/auth/logout/` | Logout (invalida el refresh token) |
| POST | `/api/auth/token/refresh/` | Renovar access token |
| GET/PATCH | `/api/auth/me/` | Perfil propio |
| POST | `/api/auth/me/change-password/` | Cambio de contraseña |
| POST | `/api/auth/email/verify/request/` | Solicitar verificación de email |
| POST | `/api/auth/email/verify/confirm/` | Confirmar verificación de email |
| POST | `/api/auth/password-reset/` | Solicitar reseteo de contraseña |
| POST | `/api/auth/password-reset/confirm/` | Confirmar reseteo de contraseña |
| GET/PATCH | `/api/users/` `/api/users/{id}/` | Administración de usuarios (solo ADMIN+) |
| POST | `/api/users/{id}/suspend/` `/api/users/{id}/reactivate/` | Suspender / reactivar usuario |

### Contenido (`posts`)

| Método | Ruta | Descripción |
|---|---|---|
| GET/POST | `/api/posts/` | Listar / crear publicaciones |
| GET/PATCH/DELETE | `/api/posts/{id}/` | Detalle / edición / borrado lógico |
| POST | `/api/posts/{id}/hide/` `/api/posts/{id}/restore/` | Ocultar / restaurar (MODERATOR+) |
| GET/POST | `/api/categories/` | Categorías (escritura solo MODERATOR+) |
| GET | `/api/tags/` | Tags (se crean automáticamente al usarlos) |

### Interacciones (`interactions`)

| Método | Ruta | Descripción |
|---|---|---|
| GET/POST/DELETE | `/api/favorites/` | Favoritos propios |
| GET/POST/PATCH/DELETE | `/api/comments/` | Comentarios |
| POST | `/api/comments/{id}/hide/` `/api/comments/{id}/unhide/` | Ocultar/restaurar comentario (MODERATOR+) |
| GET/POST | `/api/reports/` | Reportes de contenido |
| POST | `/api/reports/{id}/resolve/` | Resolver reporte (MODERATOR+) |

### Moderación (`moderation`)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/moderation/audit-logs/` | Historial de auditoría (ADMIN+) |
| GET | `/api/moderation/stats/` | Estadísticas generales (MODERATOR+) |

## Seguridad implementada

- Autenticación JWT con rotación y blacklist de refresh tokens.
- Contraseñas validadas con los validadores estándar de Django (longitud mínima 10, no comunes, no numéricas, no similares al usuario).
- Reseteo de contraseña y verificación de email mediante tokens firmados de un solo uso, sin revelar si un email existe (previene enumeración de usuarios).
- Subida de archivos validada por contenido real (Pillow abre y verifica la imagen), no solo por extensión o `Content-Type` declarado por el cliente.
- Límite de tamaño de archivo (15 MB) y de dimensiones.
- Rutas de subida con nombres aleatorios (`uuid4`) para evitar colisiones y enumeración de archivos.
- Control de roles con prevención explícita de escalación de privilegios.
- Rate limiting (throttling) en endpoints de autenticación y reseteo de contraseña.
- Cabeceras de seguridad (HSTS, `X-Frame-Options`, `nosniff`, cookies seguras) activadas automáticamente cuando `DEBUG=False`.
- Registro de auditoría de acciones de moderación (ocultar/restaurar publicaciones y comentarios, suspender usuarios, resolver reportes).
- CORS configurado con lista blanca de orígenes explícita (no `*`).

## Tests

La suite cubre los flujos críticos: registro, login, permisos por rol, creación/edición/eliminación
de publicaciones, acceso no autorizado, subida de archivos (incluyendo rechazo de archivos falsificados)
y auditoría. Ejecutar con:

```powershell
python manage.py test
```

## Notas de diseño (cambios respecto al proyecto original)

- Se reemplazó el campo booleano original `is_public` en `Post` por dos campos independientes,
  `status` (`draft/published/hidden`) y `visibility` (`public/unlisted/private`), que permiten
  representar correctamente el ciclo de vida de una publicación y las acciones de moderación.
- Se sustituyó la autenticación basada en sesión por JWT puro para la API, más apropiado para un
  frontend desacoplado.
- Se introdujo un modelo de usuario personalizado (`accounts.User`) con roles, requerido desde el
  inicio del proyecto porque `AUTH_USER_MODEL` no se puede cambiar después de la primera migración.
