# Jingabel — Backend

API ของระบบจัดการร้านค้าหลายสาขา
สร้างด้วย **NestJS 12 (ESM) + TypeScript + PostgreSQL + TypeORM**

หน้าเว็บอยู่ที่โฟลเดอร์ [`../frontend`](../frontend/README.md) — **ตอนนี้ยังไม่ได้เชื่อมกัน**
และ API มีแค่ระบบ authentication พื้นฐาน

## เริ่มใช้งาน

ต้องมี Node.js 24+ และ Docker

```bash
npm install
cp .env.example .env    # แล้วใส่ JWT_ACCESS_SECRET / JWT_REFRESH_SECRET (openssl rand -hex 32)
npm run db:up           # Postgres ใน Docker ที่ localhost:5433
npm run start:dev       # http://localhost:4000/v1/api (สร้าง/อัปเดตตารางให้เองตอนเริ่ม)
```

เอกสาร API (Swagger) อยู่ที่ http://localhost:4000/v1/api/docs และ OpenAPI JSON ที่ `/v1/api/docs-json`

หรือรันทั้ง Postgres และ API ใน Docker:

```bash
docker compose up -d --build
```

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
| --- | --- |
| `npm run start:dev` | รันแบบ watch |
| `npm run build` | build ไปที่ `dist/` |
| `npm run lint` | oxlint |
| `npm test` | unit test |
| `npm run test:e2e` | e2e test กับฐาน `jingabel_test` (ต้อง `npm run db:up` ก่อน) |

## Environment variables

| ตัวแปร | ค่าเริ่มต้น | หมายเหตุ |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` ทำให้ cookie เป็น `Secure` |
| `PORT` | `4000` | |
| `CORS_ORIGIN` | `http://localhost:3000` | origin ของ frontend ที่ส่ง cookie มาได้ — หลายค่าคั่นด้วย `,` |
| `DATABASE_URL` | — | ต้องกำหนด เช่น `postgres://jingabel:jingabel@localhost:5433/jingabel` |
| `JWT_ACCESS_SECRET` | — | ต้องกำหนด อย่างน้อย 32 ตัวอักษร |
| `JWT_REFRESH_SECRET` | — | ต้องกำหนด อย่างน้อย 32 ตัวอักษร และไม่ซ้ำกับตัวบน |
| `SWAGGER_ENABLED` | เปิด ยกเว้นเมื่อ `NODE_ENV=production` | `true` / `false` เปิด-ปิดหน้า `/v1/api/docs` |
| `JWT_ACCESS_TTL` | `900` | อายุ access token (วินาที) |
| `JWT_REFRESH_TTL` | `604800` | อายุ refresh token (วินาที) |
| `APP_URL` | `http://localhost:3000` | URL ของ frontend ใช้สร้างลิงก์ในอีเมล (ไม่มี `/` ท้าย) |
| `INVITATION_TTL` | `604800` | อายุลิงก์คำเชิญ (วินาที) |
| `PASSWORD_RESET_TTL` | `3600` | อายุลิงก์ตั้งรหัสผ่านใหม่ (วินาที) |
| `SMTP_HOST` | — | ต้องกำหนดใน production — ถ้าว่างตอน dev จะไม่ส่งเมลจริง แต่ log เนื้อหาและลิงก์ไว้ใน console |
| `SMTP_PORT` | `587` | |
| `SMTP_SECURE` | `false` | `true` สำหรับพอร์ต 465 |
| `SMTP_USER` / `SMTP_PASS` | — | ถ้า SMTP ต้อง login |
| `MAIL_FROM` | `Jingabel <no-reply@jingabel.local>` | ผู้ส่ง |

ค่าทั้งหมดถูกตรวจตอนเริ่มระบบ ถ้าขาดหรือผิดรูปแบบ แอปจะไม่ขึ้น

## ฐานข้อมูล

Postgres ของโปรเจกต์รันใน Docker ที่ host port **5433** (ไม่ใช่ 5432)
user / password สำหรับเครื่อง dev คือ `jingabel` / `jingabel`

| ฐาน | ใช้ทำอะไร |
| --- | --- |
| `jingabel` | พัฒนา |
| `jingabel_test` | e2e test — **ถูกล้าง schema ทุกครั้งที่รัน** ห้ามเก็บข้อมูล |

- ยังไม่ใช้ migration — เปิด `synchronize` ไว้ ตารางจะถูกสร้าง/แก้ให้ตรงกับ entity ทุกครั้งที่แอปเริ่ม
  ระวัง: ถ้าลบหรือเปลี่ยน column ใน entity ข้อมูลใน column นั้นจะหายไปด้วย
- entity ใหม่ต้องเพิ่มใน `src/database/typeorm.options.ts`
- ถ้า `NODE_ENV=test` ชื่อฐานต้องลงท้ายด้วย `_test` ไม่อย่างนั้นจะไม่ยอมเชื่อมต่อ

## API

ทุก route อยู่ใต้ `/v1/api` (ตั้งที่ `src/config/api.ts`) รายละเอียด request / response ทั้งหมดดูได้ที่ Swagger (`/v1/api/docs`)

ทดลองเรียกจาก Swagger UI ได้เลย: เรียก `POST /auth/login` ก่อน browser จะเก็บ cookie ไว้
แล้ว route ที่ต้อง login จะใช้ cookie นั้นอัตโนมัติ

| Method | Path | ต้อง login | ทำอะไร |
| --- | --- | --- | --- |
| POST | `/auth/register` | ไม่ | สมัครเป็น Shop Owner แล้วออก token |
| POST | `/auth/login` | ไม่ | ตรวจรหัสผ่าน แล้วออก token |
| POST | `/auth/refresh` | ไม่ (ใช้ refresh cookie) | ออก access token ใหม่ (refresh token เดิมใช้ต่อได้) |
| POST | `/auth/logout` | ไม่ (ใช้ refresh cookie) | ยกเลิก session และล้าง cookie |
| GET | `/auth/me` | ใช่ | ข้อมูลผู้ใช้ที่เรียกเข้ามา |

### เพิ่ม endpoint ใหม่

ทุก endpoint ต้องมีเอกสารใน Swagger — test `test/swagger.e2e-spec.ts` ตรวจรายการ path ไว้ ถ้าเพิ่ม route แล้วไม่อัปเดตจะไม่ผ่าน

- controller ติด `@ApiTags()` และแต่ละ route ติด `@ApiOperation()` กับ response ที่เป็นไปได้ (`@ApiOkResponse()`, `@ApiUnauthorizedResponse()` ฯลฯ ใช้ `ApiErrorResponse` เป็น type ของ error)
- route ที่ต้อง login ติด `@ApiCookieAuth('access_token')` และ `@ApiBearerAuth()`
- ทุก field ใน DTO ติด `@ApiProperty()` และ response ต้องเป็น class (ไม่ใช่ `interface` / `type`) เพื่อให้ Swagger อ่านได้

## Authentication ทำงานอย่างไร

- **Token อยู่ใน httpOnly cookie เท่านั้น** (`access_token`, `refresh_token`) ไม่ส่งกลับใน response body
  client ที่ไม่ใช่ browser ส่ง access token ผ่าน header `Authorization: Bearer` ได้
- **ทุก route ต้องมี access token โดยค่าเริ่มต้น** เพราะ `JwtAuthGuard` เป็น global guard
  route ที่เปิดสาธารณะต้องติด `@Public()`
- **อ้างอิงผู้ใช้จากภายนอกด้วย `slug`** (สุ่ม 10 ตัวจาก a-z, A-Z, 0-9) — `id` (uuid) ใช้ภายในเท่านั้น ไม่ถูกส่งออกใน response
- **อ่านผู้ใช้ที่เรียกเข้ามา** ด้วย `@CurrentUser() user: AuthUser` ได้ `{ id, email, role }`
- **อายุ cookie เท่ากับอายุ session** (ไม่ติ๊ก "จดจำฉัน" = session cookie, ติ๊ก = 7 วัน) ทั้ง `access_token` และ `refresh_token` — JWT ใน `access_token` ยังหมดอายุใน 15 นาทีตามเดิม frontend ใช้ "มี cookie หรือไม่" ตัดสินว่า login อยู่
- **`/auth/refresh` ออกแค่ access token ใหม่** ไม่ออก refresh token ใหม่ refresh token เดิมใช้ต่อได้จนหมดอายุ (7 วันนับจาก login) หรือจนออกจากระบบ
- **Rate limit** 120 ครั้งต่อนาทีทั้งระบบ และ 10 ครั้งต่อนาทีสำหรับ login / register
- รหัสผ่าน hash ด้วย argon2

```ts
@Controller('branches')
export class BranchesController {
  @Get()
  list(@CurrentUser() user: AuthUser) {
    // user.id, user.email, user.role
  }
}
```

## โครงสร้าง

```
src/
├─ main.ts                 # จุดเริ่มระบบ
├─ app.module.ts
├─ app.setup.ts            # prefix, cookie, validation, CORS (ใช้ร่วมกับ e2e test)
├─ config/env.ts           # ตรวจ environment variables
├─ common/swagger/         # ตั้งค่า Swagger + schema ของ error
├─ database/
│  └─ typeorm.options.ts   # รายการ entity
├─ auth/
│  ├─ auth.controller.ts
│  ├─ auth.service.ts
│  ├─ refresh-session.store.ts
│  ├─ decorators/          # @Public(), @CurrentUser()
│  ├─ guards/              # JwtAuthGuard
│  └─ dto/                 # request DTO + AuthResponse
└─ users/
   ├─ user.entity.ts
   ├─ users.service.ts
   └─ dto/user.response.ts
test/
├─ auth.e2e-spec.ts
└─ swagger.e2e-spec.ts
```

## ข้อจำกัดที่ยังมีอยู่

- Refresh session และตัวนับ rate limit เก็บใน memory: restart แล้วทุกคนต้อง login ใหม่ และยังรันหลาย instance ไม่ได้ (แผนคือย้ายไป Redis)
- register ยังไม่สร้างร้านจาก `shopName`
- ยังไม่มีการตรวจสิทธิ์ตาม role และการจำกัดข้อมูลตามร้าน / สาขา
- ยังไม่มีลืมรหัสผ่าน, คำเชิญผู้ใช้, audit log, health check
- Swagger เปิดอยู่ทุก environment ยกเว้น production ถ้าจะเปิดบน server ที่เข้าถึงจากภายนอกได้ ควรจำกัดการเข้าถึงก่อน
