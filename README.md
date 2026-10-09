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
npm run migration:run   # สร้างตาราง
npm run start:dev       # http://localhost:4000/api
```

หรือรันทั้ง Postgres และ API ใน Docker (API ไม่รัน migration เองตอนเริ่ม):

```bash
docker compose up -d --build
docker compose run --rm api npx typeorm migration:run -d dist/database/data-source.js
```

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
| --- | --- |
| `npm run start:dev` | รันแบบ watch |
| `npm run build` | build ไปที่ `dist/` |
| `npm run lint` | oxlint |
| `npm run test:e2e` | e2e test กับฐาน `jingabel_test` (ต้อง `npm run db:up` ก่อน) |
| `npm run migration:run` | รัน migration ที่ค้างอยู่ |
| `npm run migration:revert` | ย้อน migration ล่าสุด |
| `npm run migration:generate -- src/database/migrations/<ชื่อ>` | สร้าง migration จากส่วนต่างระหว่าง entity กับฐานข้อมูล |

## Environment variables

| ตัวแปร | ค่าเริ่มต้น | หมายเหตุ |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` ทำให้ cookie เป็น `Secure` |
| `PORT` | `4000` | |
| `CORS_ORIGIN` | `http://localhost:3000` | origin ของ frontend ที่ส่ง cookie มาได้ |
| `DATABASE_URL` | — | ต้องกำหนด เช่น `postgres://jingabel:jingabel@localhost:5433/jingabel` |
| `JWT_ACCESS_SECRET` | — | ต้องกำหนด อย่างน้อย 32 ตัวอักษร |
| `JWT_REFRESH_SECRET` | — | ต้องกำหนด อย่างน้อย 32 ตัวอักษร และไม่ซ้ำกับตัวบน |
| `JWT_ACCESS_TTL` | `900` | อายุ access token (วินาที) |
| `JWT_REFRESH_TTL` | `604800` | อายุ refresh token (วินาที) |

ค่าทั้งหมดถูกตรวจตอนเริ่มระบบ ถ้าขาดหรือผิดรูปแบบ แอปจะไม่ขึ้น

## ฐานข้อมูล

Postgres ของโปรเจกต์รันใน Docker ที่ host port **5433** (ไม่ใช่ 5432)
user / password สำหรับเครื่อง dev คือ `jingabel` / `jingabel`

| ฐาน | ใช้ทำอะไร |
| --- | --- |
| `jingabel` | พัฒนา |
| `jingabel_test` | e2e test — **ถูกล้าง schema ทุกครั้งที่รัน** ห้ามเก็บข้อมูล |

- `synchronize` ปิดไว้ การเปลี่ยน schema ทำผ่าน migration เท่านั้น
- entity และ migration ใหม่ต้องเพิ่มใน `src/database/typeorm.options.ts`
- ถ้า `NODE_ENV=test` ชื่อฐานต้องลงท้ายด้วย `_test` ไม่อย่างนั้นจะไม่ยอมเชื่อมต่อ

## API

ทุก route อยู่ใต้ `/api`

| Method | Path | ต้อง login | ทำอะไร |
| --- | --- | --- | --- |
| POST | `/auth/register` | ไม่ | สมัครเป็น Shop Owner แล้วออก token |
| POST | `/auth/login` | ไม่ | ตรวจรหัสผ่าน แล้วออก token |
| POST | `/auth/refresh` | ไม่ (ใช้ refresh cookie) | ออก token คู่ใหม่ และยกเลิก refresh token ตัวเดิม |
| POST | `/auth/logout` | ไม่ (ใช้ refresh cookie) | ยกเลิก session และล้าง cookie |
| GET | `/auth/me` | ใช่ | ข้อมูลผู้ใช้ที่เรียกเข้ามา |

## Authentication ทำงานอย่างไร

- **Token อยู่ใน httpOnly cookie เท่านั้น** (`access_token`, `refresh_token`) ไม่ส่งกลับใน response body
  client ที่ไม่ใช่ browser ส่ง access token ผ่าน header `Authorization: Bearer` ได้
- **ทุก route ต้องมี access token โดยค่าเริ่มต้น** เพราะ `JwtAuthGuard` เป็น global guard
  route ที่เปิดสาธารณะต้องติด `@Public()`
- **อ่านผู้ใช้ที่เรียกเข้ามา** ด้วย `@CurrentUser() user: AuthUser` ได้ `{ id, email, role }`
- **Refresh token หมุนทุกครั้งที่ใช้** ถ้ามีการนำตัวเก่ามาใช้ซ้ำ ทุก session ของผู้ใช้นั้นจะถูกยกเลิก
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
├─ database/
│  ├─ typeorm.options.ts   # รายการ entity + migration
│  ├─ data-source.ts       # สำหรับ TypeORM CLI เท่านั้น
│  └─ migrations/
├─ auth/
│  ├─ auth.controller.ts
│  ├─ auth.service.ts
│  ├─ refresh-session.store.ts
│  ├─ decorators/          # @Public(), @CurrentUser()
│  ├─ guards/              # JwtAuthGuard
│  └─ dto/
└─ users/
   ├─ user.entity.ts
   └─ users.service.ts
test/
└─ auth.e2e-spec.ts
```

## ข้อจำกัดที่ยังมีอยู่

- Refresh session และตัวนับ rate limit เก็บใน memory: restart แล้วทุกคนต้อง login ใหม่ และยังรันหลาย instance ไม่ได้ (แผนคือย้ายไป Redis)
- register ยังไม่สร้างร้านจาก `shopName`
- ยังไม่มีการตรวจสิทธิ์ตาม role และการจำกัดข้อมูลตามร้าน / สาขา
- ยังไม่มีลืมรหัสผ่าน, คำเชิญผู้ใช้, audit log, health check
