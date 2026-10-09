import { Injectable } from '@nestjs/common';

export interface RefreshSession {
  userId: string;
  // jti of the only refresh token currently valid for this session.
  jti: string;
  remember: boolean;
  expiresAt: number;
}

// TODO: in-memory placeholder — every session is dropped on restart and it
// doesn't work across multiple instances. Move to Redis (with a TTL per key)
// once it's introduced.
@Injectable()
export class RefreshSessionStore {
  private readonly sessions = new Map<string, RefreshSession>();

  async get(sid: string): Promise<RefreshSession | undefined> {
    const session = this.sessions.get(sid);
    if (session && session.expiresAt <= Date.now()) {
      this.sessions.delete(sid);
      return undefined;
    }
    return session;
  }

  async set(sid: string, session: RefreshSession): Promise<void> {
    this.sessions.set(sid, session);
  }

  async delete(sid: string): Promise<void> {
    this.sessions.delete(sid);
  }

  async deleteAllForUser(userId: string): Promise<void> {
    for (const [sid, session] of this.sessions) {
      if (session.userId === userId) this.sessions.delete(sid);
    }
  }
}
