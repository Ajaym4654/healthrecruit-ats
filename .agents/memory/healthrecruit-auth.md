---
name: HealthRecruit Auth Setup
description: JWT auth quirks and bcrypt password generation for the HealthRecruit ATS/CRM project
---

# HealthRecruit Auth Setup

JWT token stored in `localStorage` as `ats_token`. Auth context (`artifacts/ats-crm/src/lib/auth.tsx`) calls `setAuthTokenGetter` so all Orval-generated API calls automatically inject the `Authorization: Bearer <token>` header.

## Bcrypt password hash generation

Must be generated from within the `artifacts/api-server` directory (where bcryptjs is installed):

```bash
cd /home/runner/workspace/artifacts/api-server
node --input-type=module <<'EOF'
import bcrypt from 'bcryptjs';
const hash = await bcrypt.hash('yourpassword', 10);
console.log(hash);
EOF
```

**Why:** bcryptjs uses the `$2b$` prefix. A pre-computed `$2a$` hash stored in the DB will fail verification. The hash must be exactly 60 characters.

**How to apply:** Any time you need to reset or create a user password, generate via the above, then `UPDATE users SET password_hash = '...' WHERE username = '...'` via executeSql.

## Default admin credentials

- Username: `admin`
- Password: `admin123`
- JWT secret env var: `SESSION_SECRET` (falls back to `"healthrecruit-secret-key"`)
