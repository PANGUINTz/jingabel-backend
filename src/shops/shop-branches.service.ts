import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, type EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service.js';
import { generateString } from '../common/utils/generate-string.js';
import type { ShopBranchResponse } from './dto/shop.dto.js';
import {
  DEFAULT_BRANCH_NAME,
  SHOP_BRANCH_SLUG_LENGTH,
  ShopBranch,
} from './entities/shop-branch.entity.js';
import type { ShopAccess } from './shop-access.service.js';

const BRANCH_NOT_FOUND = 'ไม่พบสาขานี้';
const BRANCH_NAME_TAKEN = 'มีสาขาชื่อนี้ในร้านแล้ว';
const BRANCH_NAME_CONSTRAINT = 'UQ_shop_branches_shop_name';

function toBranchResponse(branch: ShopBranch): ShopBranchResponse {
  return { slug: branch.slug, name: branch.name, createdAt: branch.createdAt };
}

// The (shop_id, name) unique constraint → 409 with a Thai message.
function rethrowNameTaken(error: unknown): never {
  if (
    error instanceof QueryFailedError &&
    (error.driverError as { constraint?: string }).constraint ===
      BRANCH_NAME_CONSTRAINT
  ) {
    throw new ConflictException(BRANCH_NAME_TAKEN);
  }
  throw error;
}

@Injectable()
export class ShopBranchesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  // Called inside the shop-creation transaction.
  createDefault(manager: EntityManager, shopId: string): Promise<ShopBranch> {
    const repo = manager.getRepository(ShopBranch);
    return repo.save(
      repo.create({
        shopId,
        name: DEFAULT_BRANCH_NAME,
        slug: generateString(SHOP_BRANCH_SLUG_LENGTH),
      }),
    );
  }

  async create(
    access: ShopAccess,
    actorUserId: string,
    name: string,
  ): Promise<ShopBranchResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ShopBranch);
      const branch = await repo
        .save(
          repo.create({
            shopId: access.shop.id,
            name,
            slug: generateString(SHOP_BRANCH_SLUG_LENGTH),
          }),
        )
        .catch(rethrowNameTaken);
      await this.audit.record(
        {
          actorUserId,
          shopId: access.shop.id,
          action: 'shop_branch.create',
          targetId: branch.slug,
          details: { name },
        },
        manager,
      );
      return toBranchResponse(branch);
    });
  }

  async list(shopId: string): Promise<ShopBranchResponse[]> {
    const branches = await this.dataSource
      .getRepository(ShopBranch)
      .find({ where: { shopId }, order: { createdAt: 'ASC' } });
    return branches.map(toBranchResponse);
  }

  async rename(
    access: ShopAccess,
    actorUserId: string,
    branchSlug: string,
    name: string,
  ): Promise<ShopBranchResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ShopBranch);
      const branch = await repo.findOneBy({
        shopId: access.shop.id,
        slug: branchSlug,
      });
      if (!branch) throw new NotFoundException(BRANCH_NOT_FOUND);
      if (branch.name === name) return toBranchResponse(branch);

      await repo.update(branch.id, { name }).catch(rethrowNameTaken);
      await this.audit.record(
        {
          actorUserId,
          shopId: access.shop.id,
          action: 'shop_branch.rename',
          targetId: branch.slug,
          details: { from: branch.name, to: name },
        },
        manager,
      );
      return toBranchResponse({ ...branch, name });
    });
  }
}
