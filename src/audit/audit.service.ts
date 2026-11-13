import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity.js';

export type AuditEntry = Pick<AuditLog, 'actorUserId' | 'action'> &
  Partial<Pick<AuditLog, 'shopId' | 'targetId' | 'details'>>;

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>,
  ) {}

  // Pass the transaction's manager so the log is written (or rolled back)
  // together with the change it records.
  async record(entry: AuditEntry, manager?: EntityManager): Promise<void> {
    const repo = manager?.getRepository(AuditLog) ?? this.logs;
    await repo.save(
      repo.create({ shopId: null, targetId: null, details: {}, ...entry }),
    );
  }
}
